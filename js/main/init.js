// ==========================================
// PUSAT INISIALISASI APLIKASI SAAT PERTAMA DIBUKA
// ==========================================
// FUNGSI UTAMA STARTUP APLIKASI
function renderConfiguredLogo(selector, value) {
    const images = $(selector);
    if (!value) {
        images.attr('src', '').addClass('hidden');
        return;
    }

    const logo = String(value);
    if (logo.startsWith('data:') || logo.startsWith('http')) {
        images.attr('src', logo).removeClass('hidden');
        return;
    }

    callAPI('getImage', { id: logo }).then(image => {
        if (typeof image === 'string' && (image.startsWith('data:') || image.startsWith('http'))) {
            images.attr('src', image).removeClass('hidden');
        }
    }).catch(() => {});
}

async function initApp() {
    // Watchdog darurat: Maksimal 5 detik loader HARUS mati agar tidak muter selamanya
    const safetyTimer = setTimeout(() => {
        $('#loader').addClass('hidden');
        if ($('#loginPage').hasClass('hidden') && $('#appPage').hasClass('hidden')) {
            $('#loginPage').removeClass('hidden');
            $('#yearLogin').text(new Date().getFullYear());
        }
    }, 5000);

    // Render pengaturan dari cache lokal terlebih dahulu agar nama sekolah dan warna langsung muncul instan
    try {
        const cachedConf = JSON.parse(localStorage.getItem('globalConf') || '{}');
        if (cachedConf && cachedConf.status === 'error') {
            localStorage.removeItem('globalConf');
        } else if (cachedConf && (cachedConf.nama_sekolah || cachedConf.nama_instansi)) {
            globalConf = cachedConf;
            if (cachedConf.theme_color_1) document.documentElement.style.setProperty('--theme-color-1', cachedConf.theme_color_1);
            if (cachedConf.nama_instansi) $('#lblInstansi, #lblInstansiLanding, #dashInstansi2').text(cachedConf.nama_instansi);
            if (cachedConf.nama_sekolah) $('#lblSekolah, #lblSekolahLanding, #dashName2, #footSchoolName, #footSchoolLanding, #wb_sekolah').text(cachedConf.nama_sekolah);
            $('#setInstansi').val(cachedConf.nama_instansi || '');
            $('#setOpd').val(cachedConf.opd_dinas || '');
            $('#setNama').val(cachedConf.nama_sekolah || '');
            $('#setAlamat').val(cachedConf.alamat_sekolah || '');
            $('#setTelp').val(cachedConf.telp_sekolah || '');
            $('#setEmail').val(cachedConf.email_sekolah || '');
            $('#setNamaAdmin').val(cachedConf.nama_admin || '');
            $('#setWeb').val(cachedConf.web_sekolah || '');
            $('#setKepsek').val(cachedConf.nama_kepsek || cachedConf.kepala_sekolah || '');
            $('#setNip').val(cachedConf.nip_kepsek || '');
            $('#setTheme1').val(cachedConf.theme_color_1 || cachedConf.theme_color || '#4e73df');
            $('#setTheme2').val(cachedConf.theme_color_2 || '#224abe');
            $('#setTheme3').val(cachedConf.theme_color_3 || '#1a202c');
            $('#logo_instansi').val(cachedConf.logo_instansi || '');
            $('#logo_sekolah').val(cachedConf.logo_sekolah || '');
            $('#background_landing').val(cachedConf.background_landing || '');
            $('#background_login').val(cachedConf.background_login || '');
            $('#background_kartu').val(cachedConf.background_kartu || '');
            $('#background_belakang').val(cachedConf.background_belakang || '');
            renderConfiguredLogo('#loginLogoInstansi, #landingLogoInstansi, #dashLogoInstansi, #headerLogoInstansi', cachedConf.logo_instansi);
            renderConfiguredLogo('#loginLogoSekolah, #landingLogoSekolah, #dashLogoSekolah, #headerLogoSekolah', cachedConf.logo_sekolah);
        }
    } catch (_) {}

    try {
        // Mode Desktop (SQLite) menjalankan setupDatabase karena hanya butuh < 5ms
        if (IS_DESKTOP) {
            try { await callAPI('setupDatabase'); } catch (_) {}
        }

        // Muat Pengaturan Sekolah dari Server (Non-blocking gambar)
        await loadSettings();

        // CEK SESI LOGIN
        const sessionKey = getSessionStorageKey();
        let session = localStorage.getItem(sessionKey);
        if (!session) {
            const fallbackSession = window.SibukSession ? window.SibukSession.readSession(tenantId) : null;
            if (fallbackSession && fallbackSession.value) {
                session = fallbackSession.value;
            }
        }
        if (session) {
            try {
                let parsedObj = JSON.parse(dekripsiLokal(session));
                const sanitizer = (typeof sanitizeSessionPayload === 'function')
                    ? sanitizeSessionPayload
                    : (window.SibukSession && typeof window.SibukSession.sanitizeSessionPayload === 'function'
                        ? window.SibukSession.sanitizeSessionPayload
                        : (s => s));
                let decodedData = sanitizer(parsedObj);
                await restoreSession(decodedData);
                $('#loader').addClass('hidden'); // Pastikan loading mati setelah restore
            } catch (e) {
                console.error('[Session] Error restore session:', e);
                localStorage.removeItem(sessionKey);
                if (IS_DESKTOP) {
                    $('#boxLinkExec').removeClass('hidden');
                    $('#boxForcePush').removeClass('hidden');
                }
                $('#loginPage').removeClass('hidden');
                $('#yearLogin').text(new Date().getFullYear());
                $('#loader').addClass('hidden'); // MATIKAN LOADING
            }
        } else {
            $('#loginPage').removeClass('hidden');
            $('#yearLogin').text(new Date().getFullYear());
            $('#loader').addClass('hidden'); // MATIKAN LOADING
        }
    } catch (e) {
        $('#loader').addClass('hidden'); // Paksa mati loading jika error jaringan
        console.error('[Startup] Error inisialisasi:', e);
        $('#loginPage').removeClass('hidden');
        $('#yearLogin').text(new Date().getFullYear());
    } finally {
        clearTimeout(safetyTimer);
    }

    $('#frmSiswa').on('shown.bs.tab', 'a[data-bs-toggle="tab"]', function () {
        validateStudentIdentity(true);
    });
}

// Deteksi jika HtmlIncludesLoaded sudah selesai atau belum
if (window.HtmlIncludesLoadedDone) {
    initApp();
} else {
    document.addEventListener('HtmlIncludesLoaded', initApp);
}

// FUNGSI UNTUK MENGEMBALIKAN SESI (RELOAD / LOGIN SUKSES)
async function restoreSession(res) {
    $('#loginPage').addClass('hidden');
    $('#appPage').removeClass('hidden');

    // Tampilkan desktop toolbar HANYA saat login (jika di Desktop)
    if (window.electronAPI) {
        $('#desktop-toolbar').css('display', 'flex');
    }

    const namaUser = String((res && (res.nama || res.username)) || 'Administrator').trim();
    const roleUser = String((res && res.role) || 'admin').trim();
    $('#uName').text(namaUser);
    $('#uInit').text(namaUser ? namaUser.charAt(0).toUpperCase() : 'A');
    $('#uRole').text(roleUser.toUpperCase());
    $('#yearApp').text(new Date().getFullYear());

    if (roleUser.toLowerCase() === 'siswa') {
        // Tampilan khusus Siswa & Alumni
        $('#mobileTopBar').removeClass('d-none');
        $('#mobileSemester').addClass('d-none');
        $('#mobTopSetting').hide();
        $('#mobTopLogout').hide();
        $('#mobTopCekData').addClass('hidden');


        $('#botSiswa').removeClass('d-none').addClass('d-flex');
        $('#botAdmin, #botWaka').removeClass('d-flex').addClass('d-none');
        $('#mainSidebar').addClass('hidden');
        $('#mainSidebar').next().removeClass('col-md-10').addClass('col-md-12');
        $('.mobile-toggle').addClass('hidden');
        $('.fab-refresh').addClass('hidden');

        $('#headerInstansi').text(globalConf.nama_instansi || 'DINAS PENDIDIKAN');
        $('#headerSekolah').text(globalConf.nama_sekolah || 'NAMA SEKOLAH');
        if (globalConf.logo_instansi) callAPI('getImage', { id: globalConf.logo_instansi }).then(b => { if (b) $('#headerLogoInstansi').attr('src', b).removeClass('hidden'); });
        if (globalConf.logo_sekolah) callAPI('getImage', { id: globalConf.logo_sekolah }).then(b => { if (b) $('#headerLogoSekolah').attr('src', b).removeClass('hidden'); });

        nav('profil_siswa', null);

        const d = res.data || {};

        $('#profil_nama').text(d.nama || '-'); $('#profil_nisn').text(d.nisn || '-');
        $('#profil_nis_nisn').text((d.nis || '-') + ' / ' + (d.nisn || '-'));
        $('#profil_ttl').text((d.tmplahir || '-') + ', ' + (d.tgllahir_indo || '-'));
        $('#profil_jk').text(d.jk === 'L' ? 'Laki-laki' : 'Perempuan');
        $('#profil_agama').text(d.agama || '-');

        let thnMasukStr = d.thn_masuk ? String(d.thn_masuk).substring(0, 10) : '-';
        $('#profil_kelas').text((d.kls_masuk || '-') + ' / ' + thnMasukStr);
        $('#profil_alamat').text(d.alamat || '-');
        $('#profil_hp').text(d.nohp || '-');
        $('#profil_email').text(d.email || '-');
        $('#profil_ortu').text((d.ayah || '-') + ' / ' + (d.ibu || '-'));
        $('#profil_status').text(d.status_akhir || '-');

        if (d.status_akhir === 'Aktif') $('#profil_status').removeClass('text-danger').addClass('text-success');
        else $('#profil_status').removeClass('text-success').addClass('text-danger');

        let isAlumni = (d.status_akhir === 'Lulus');

        // --- INJEKSI TEKS KE BANNER SELAMAT DATANG (DIPERBAIKI) ---
        $('#wb_nama').text(res.nama || 'Siswa');
        $('#wb_status').text(isAlumni ? 'Alumni' : 'Siswa');

        if (globalConf && globalConf.nama_sekolah) {
            $('#wb_sekolah').text(globalConf.nama_sekolah);
        }

        if (isAlumni) {
            $('#row-alumni-lulus, #row-alumni-ijazah').removeClass('hidden');
            $('#btnCekKelengkapan').removeClass('hidden');
            $('#mobTopCekData').removeClass('hidden');
        } else {
            $('#row-alumni-lulus, #row-alumni-ijazah').addClass('hidden');
            $('#mobTopCekData').addClass('hidden');
        }

        let fotoProfilTampil = isAlumni ? (d.foto_keluar || d.foto_id) : d.foto_id;

        $('#profil_foto').attr('src', '');
        if (fotoProfilTampil) callAPI('getImage', { id: fotoProfilTampil }).then(b => { if (b) $('#profil_foto').attr('src', b); });

        window.siswaAktif = d;
        $('#loader').addClass('hidden'); // Matikan loading untuk akun siswa
    } else {
        // Tampilan khusus Admin, Waka, dan Pengguna Spreadsheet lainnya
        $('#mobileTopBar').removeClass('d-none');
        const rLower = roleUser.toLowerCase();
        if (rLower === 'wakakurikulum' || rLower === 'waka') {
            $('#botWaka').removeClass('d-none').addClass('d-flex');
            $('#botAdmin, #botSiswa').removeClass('d-flex').addClass('d-none');
            $('#mobTopSetting').hide();
            $('#mobTopLogout').show();
            $('.admin-only').addClass('hidden');
        } else {
            // Default untuk admin, operator, staf, kepsek, atau user apapun dari sheet Pengguna
            $('#botAdmin').removeClass('d-none').addClass('d-flex');
            $('#botSiswa, #botWaka').removeClass('d-flex').addClass('d-none');
            $('#mobTopSetting, #mobTopLogout').show();
            $('.admin-only').removeClass('hidden');
        }

        $('#mainSidebar').removeClass('hidden');
        $('#mainSidebar').next().removeClass('col-md-12').addClass('col-md-10');
        $('.mobile-toggle').removeClass('hidden');
        $('.fab-refresh').removeClass('hidden');
        $('#loader').addClass('hidden'); // Matikan loading

        nav('dash', null);
        loadSiswa();

        // Perintahkan sistem mengambil daftar tahun alumni ke server
        if (typeof inisialisasiDropdownAlumni === 'function') inisialisasiDropdownAlumni();
    }
}

function logout() {
    Swal.fire({
        title: 'Yakin ingin keluar sistem?',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#dc3545',
        cancelButtonColor: '#6c757d',
        confirmButtonText: 'Ya, Keluar!',
        cancelButtonText: 'Batal'
    }).then((result) => {
        if (result.isConfirmed) {
            if (window.SibukSession && typeof window.SibukSession.clearSessionStorage === 'function') {
                window.SibukSession.clearSessionStorage(tenantId);
            } else {
                localStorage.removeItem(getSessionStorageKey());
            }
            $('#appPage').addClass('hidden');
            $('#loginPage').removeClass('hidden').addClass('animate__animated animate__fadeIn');
            
            // Sembunyikan kembali desktop toolbar saat logout
            if (window.electronAPI) {
                $('#desktop-toolbar').css('display', 'none');
            }

            $('#u').val(''); $('#p').val('');
            globalSiswa = [];
            if (typeof invalidateUnifiedCaches === 'function') invalidateUnifiedCaches();
        }
    });
}

let bgLandingUrl = '';
let bgLoginUrl = '';

function applyLoginPageBackground() {
    const isLogin = !$('#viewLogin').hasClass('hidden');
    const url = isLogin ? bgLoginUrl : bgLandingUrl;
    if (url) {
        $('#loginPage').css('background-image', url);
    } else {
        $('#loginPage').css('background-image', '');
    }
}

function pindahKeLogin() {
    $('#viewLanding').addClass('hidden').removeClass('animate__animated animate__zoomIn animate__fadeInLeft');
    $('#viewLogin').removeClass('hidden').addClass('animate__animated animate__fadeInRight');
    applyLoginPageBackground();
}
function kembaliKeLanding() {
    $('#viewLogin').addClass('hidden').removeClass('animate__animated animate__fadeInRight');
    $('#viewLanding').removeClass('hidden').addClass('animate__animated animate__fadeInLeft');
    applyLoginPageBackground();
}

function escapeHelpdeskHtml(value) {
    return String(value || '').replace(/[&<>"']/g, character => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    })[character]);
}

function bukaHelpdesk() {
    const config = globalConf && typeof globalConf === 'object' ? globalConf : {};
    const namaAdmin = config.nama_admin || config.admin_nama || 'Admin SiBuk InSTal';
    const nomor = String(config.telp_sekolah || '').trim();
    let rawDigits = nomor.replace(/\D/g, '');
    if (rawDigits.startsWith('00')) rawDigits = rawDigits.slice(2);
    const nomorWa = rawDigits ? (rawDigits.startsWith('0') ? `62${rawDigits.slice(1)}` : rawDigits.startsWith('8') ? `62${rawDigits}` : rawDigits) : '';
    const nomorTelp = rawDigits ? `+${nomorWa}` : '';
    const email = String(config.email_sekolah || '').trim();
    const nomorText = nomor ? escapeHelpdeskHtml(nomor) : 'Nomor telepon sekolah belum diatur pada Pengaturan Sekolah';
    const emailText = email ? escapeHelpdeskHtml(email) : 'Belum diatur pada Pengaturan Sekolah';

    Swal.fire({
        title: 'Helpdesk SiBuk InSTal',
        html: `
            <div class="text-start mt-3">
                <p><i class="bi bi-person-circle text-secondary me-2"></i><strong>Nama Admin:</strong><br>${escapeHelpdeskHtml(namaAdmin)}</p>
                <p><i class="bi bi-whatsapp text-success me-2"></i><strong>WhatsApp Admin:</strong><br>
                    ${nomorWa ? `<a href="https://wa.me/${nomorWa}" target="_blank" rel="noopener noreferrer">${nomorText}</a>` : nomorText}
                </p>
                <p><i class="bi bi-telephone text-primary me-2"></i><strong>No. Telepon:</strong><br>
                    ${nomorTelp ? `<a href="tel:${escapeHelpdeskHtml(nomorTelp)}">${nomorText}</a>` : nomorText}
                </p>
                <p class="mb-0"><i class="bi bi-envelope text-info me-2"></i><strong>Email:</strong><br>
                    ${email ? `<a href="mailto:${encodeURIComponent(email)}">${emailText}</a>` : emailText}
                </p>
            </div>`,
        icon: 'info',
        confirmButtonText: 'Tutup',
        confirmButtonColor: 'var(--theme-color-1, #4e73df)'
    });
}

function bukaModalSOP() {
    const sopId = globalConf && !isSibukSOPDeleted() ? String(globalConf.sop_pdf || '').trim() : '';
    if (!sopId) {
        Swal.fire('SOP belum tersedia', 'Dokumen SOP belum diunggah atau disimpan oleh sekolah.', 'info');
        return;
    }

    const modalElement = document.getElementById('modalSOPLogin');
    const frame = document.getElementById('frameSOPLogin');
    if (!modalElement || !frame || !window.bootstrap || !bootstrap.Modal) {
        Swal.fire('Tidak dapat membuka SOP', 'Komponen modal SOP tidak tersedia. Muat ulang aplikasi lalu coba lagi.', 'error');
        return;
    }

    if (!modalElement.dataset.sopCleanup) {
        modalElement.addEventListener('hidden.bs.modal', () => {
            delete frame.dataset.sopRequestId;
            const objectUrl = frame.dataset.objectUrl;
            if (objectUrl) URL.revokeObjectURL(objectUrl);
            delete frame.dataset.objectUrl;
            frame.src = 'about:blank';
        });
        modalElement.dataset.sopCleanup = 'true';
    }
    bootstrap.Modal.getOrCreateInstance(modalElement).show();
    frame.title = 'Dokumen SOP SiBuk InSTal';
    frame.src = 'about:blank';
    const requestId = `${Date.now()}-${Math.random()}`;
    frame.dataset.sopRequestId = requestId;
    callAPI('getImage', { id: sopId }).then(dataUrl => {
        if (!dataUrl || !String(dataUrl).startsWith('data:application/pdf')) {
            throw new Error('Berkas SOP PDF tidak ditemukan. Periksa file lokal atau lakukan sinkronisasi.');
        }
        const base64 = String(dataUrl).split(',')[1] || '';
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        const blobUrl = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
        if (frame.dataset.sopRequestId !== requestId || !modalElement.classList.contains('show')) {
            URL.revokeObjectURL(blobUrl);
            return;
        }
        const previousUrl = frame.dataset.objectUrl;
        if (previousUrl) URL.revokeObjectURL(previousUrl);
        frame.dataset.objectUrl = blobUrl;
        frame.src = blobUrl;
    }).catch(error => {
        console.error('[SOP] Gagal memuat dokumen:', error);
        if (frame.dataset.sopRequestId === requestId && modalElement.classList.contains('show')) {
            Swal.fire('SOP tidak dapat dibuka', error.message || 'Gagal memuat berkas SOP.', 'error');
        }
    });
}

const SIBUK_LAW_DEFAULTS = [
    {
        jenis: 'Undang-Undang Dasar',
        nomor: 'Tahun 1945',
        judul: 'Undang-Undang Dasar Negara Republik Indonesia Tahun 1945',
        keterkaitan: 'Landasan konstitusional hak warga negara atas pendidikan serta kewajiban negara menyelenggarakan sistem pendidikan nasional.',
        link: 'https://peraturan.go.id/id/uud-1945'
    },
    {
        jenis: 'Permendikbudristek',
        nomor: 'No. 31 Tahun 2022',
        judul: 'Satu Data Pendidikan, Kebudayaan, Riset, dan Teknologi',
        keterkaitan: 'Acuan tata kelola data pendidikan dan data referensi; data peserta didik pada buku induk perlu konsisten dengan ketentuan data pendidikan yang berlaku.',
        link: 'https://peraturan.bpk.go.id/Details/224733/permendikbudriset-no-31-tahun-2022'
    },
    {
        jenis: 'Permendikbud',
        nomor: 'No. 79 Tahun 2015',
        judul: 'Data Pokok Pendidikan (Dapodik)',
        keterkaitan: 'Referensi historis pengelolaan Dapodik. Peraturan ini telah dicabut oleh Permendikbudristek No. 31 Tahun 2022, sehingga bukan dasar hukum aktif.',
        link: 'https://peraturan.go.id/id/permendikbud-no-79-tahun-2015',
        status: 'Dicabut'
    },
    {
        jenis: 'Permendikbudristek',
        nomor: 'No. 47 Tahun 2023',
        judul: 'Standar Pengelolaan pada Pendidikan Anak Usia Dini, Jenjang Pendidikan Dasar, dan Jenjang Pendidikan Menengah',
        keterkaitan: 'Konteks pengelolaan pendidikan dan administrasi sekolah; penerapannya pada buku induk mengikuti ketentuan kearsipan dan aturan yang berlaku.',
        link: 'https://peraturan.bpk.go.id/Details/289462/permendikbudriset-no-47-tahun-2023'
    },
    {
        jenis: 'Undang-Undang',
        nomor: 'No. 20 Tahun 2003',
        judul: 'Sistem Pendidikan Nasional',
        keterkaitan: 'Landasan umum penyelenggaraan pendidikan nasional dan administrasi satuan pendidikan.',
        link: 'https://peraturan.bpk.go.id/Details/43920/uu-no-20-tahun-2003'
    },
    {
        jenis: 'Undang-Undang',
        nomor: 'No. 27 Tahun 2022',
        judul: 'Pelindungan Data Pribadi',
        keterkaitan: 'Acuan perlindungan dan pemrosesan data pribadi peserta didik, orang tua/wali, dan pengguna aplikasi.',
        link: 'https://peraturan.bpk.go.id/Details/229798/uu-no-27-tahun-2022'
    },
    {
        jenis: 'Undang-Undang',
        nomor: 'No. 11 Tahun 2008 jo. No. 19 Tahun 2016 dan No. 1 Tahun 2024',
        judul: 'Informasi dan Transaksi Elektronik',
        keterkaitan: 'Acuan umum penyelenggaraan sistem elektronik, keandalan informasi, dan pengelolaan dokumen elektronik.',
        link: 'https://peraturan.bpk.go.id/Details/274494/uu-no-1-tahun-2024'
    },
    {
        jenis: 'Undang-Undang',
        nomor: 'No. 43 Tahun 2009',
        judul: 'Kearsipan',
        keterkaitan: 'Acuan penciptaan, penggunaan, pemeliharaan, perlindungan, dan penyusutan arsip, termasuk rekam data peserta didik dan alumni.',
        link: 'https://peraturan.go.id/id/uu-no-43-tahun-2009'
    },
    {
        jenis: 'Peraturan Pemerintah',
        nomor: 'No. 28 Tahun 2012',
        judul: 'Pelaksanaan Undang-Undang Nomor 43 Tahun 2009 tentang Kearsipan',
        keterkaitan: 'Pedoman pelaksanaan pengelolaan arsip, klasifikasi, pemeliharaan, penggunaan, dan penyusutan arsip sekolah.',
        link: 'https://peraturan.go.id/id/pp-no-28-tahun-2012'
    },
    {
        jenis: 'Peraturan Presiden',
        nomor: 'No. 95 Tahun 2018',
        judul: 'Sistem Pemerintahan Berbasis Elektronik (SPBE)',
        keterkaitan: 'Rujukan umum tata kelola layanan dan administrasi pemerintahan berbasis elektronik, termasuk pengelolaan data dan layanan digital.',
        link: 'https://peraturan.go.id/id/perpres-no-95-tahun-2018'
    },
    {
        jenis: 'Peraturan Presiden',
        nomor: 'No. 39 Tahun 2019',
        judul: 'Satu Data Indonesia',
        keterkaitan: 'Rujukan prinsip data yang akurat, mutakhir, terpadu, dapat dipertanggungjawabkan, serta berbagi data sesuai kewenangan.',
        link: 'https://peraturan.go.id/id/perpres-no-39-tahun-2019'
    }
];

function getSibukLaws() {
    const saved = globalConf && globalConf.sibuk_dasar_hukum;
    if (saved) {
        try {
            const parsed = typeof saved === 'string' ? JSON.parse(saved) : saved;
            if (Array.isArray(parsed)) {
                const validSaved = parsed.filter(item => item && typeof item === 'object' && !Array.isArray(item)).map(item => {
                    if (String(item.nomor || '').trim() === 'No. 79 Tahun 2015') {
                        return {
                            ...item,
                            keterkaitan: 'Referensi historis pengelolaan Dapodik. Peraturan ini telah dicabut oleh Permendikbudristek No. 31 Tahun 2022, sehingga bukan dasar hukum aktif.',
                            status: 'Dicabut'
                        };
                    }
                    if (String(item.nomor || '').trim() === 'No. 31 Tahun 2022') {
                        const current = SIBUK_LAW_DEFAULTS.find(law => law.nomor === 'No. 31 Tahun 2022');
                        return { ...item, judul: current.judul, keterkaitan: current.keterkaitan, link: current.link };
                    }
                    if (String(item.judul || '').toLowerCase().includes('informasi dan transaksi elektronik')) {
                        const current = SIBUK_LAW_DEFAULTS.find(law => law.judul === 'Informasi dan Transaksi Elektronik');
                        return { ...item, nomor: current.nomor, link: current.link };
                    }
                    return item;
                });
                if (String(globalConf.sibuk_dasar_hukum_version || '') === '2') return validSaved;
                const savedNumbers = new Set(validSaved.map(item => `${item.jenis || ''}|${item.nomor || ''}`.toLowerCase()));
                const missingDefaults = SIBUK_LAW_DEFAULTS.filter(item => !savedNumbers.has(`${item.jenis}|${item.nomor}`.toLowerCase()));
                return [...validSaved, ...missingDefaults.map(item => ({ ...item }))];
            }
        } catch (error) {
            console.error('[Dasar Hukum] Data tersimpan tidak valid:', error);
        }
    }
    return SIBUK_LAW_DEFAULTS.map(item => ({ ...item }));
}

function isSibukSOPDeleted() {
    const value = globalConf && globalConf.sop_pdf_deleted;
    return value === true || String(value).toLowerCase() === 'true';
}

function renderSibukSOPSettings() {
    const status = document.getElementById('sibukSOPStatus');
    if (status) {
        const hasSOP = !!(globalConf && globalConf.sop_pdf && !isSibukSOPDeleted());
        status.textContent = hasSOP ? 'Dokumen SOP sudah tersimpan.' : 'Belum ada SOP yang tersimpan.';
        document.getElementById('btnLihatSibukSOP')?.classList.toggle('d-none', !hasSOP);
        document.getElementById('btnHapusSibukSOP')?.classList.toggle('d-none', !hasSOP);
    }
    renderSibukLawTable();
    migrateSibukLawList();
}

function renderSibukLawTable() {
    const body = document.getElementById('tbodySibukLaw');
    if (!body) return;
    const laws = getSibukLaws();
    if (!laws.length) {
        body.innerHTML = '<tr><td colspan="3" class="text-center text-muted py-4">Belum ada dasar hukum.</td></tr>';
        return;
    }
    body.innerHTML = laws.map((law, index) => {
        const linkUrl = String(law.link || '').trim();
        const href = /^https:\/\//i.test(linkUrl) ? escapeHTML(linkUrl) : '';
        const status = law.status ? `<span class="badge text-bg-secondary ms-1">${escapeHTML(law.status)}</span>` : '';
        return `<tr>
            <td class="text-nowrap"><small class="text-muted d-block">${escapeHTML(law.jenis || '')}</small><strong>${escapeHTML(law.nomor || '')}</strong></td>
            <td><strong class="law-description">${escapeHTML(law.judul || '')}</strong>${status}<small class="law-description text-muted d-block">${escapeHTML(law.keterkaitan || '')}</small></td>
            <td class="law-action text-center">${href ? `<a class="btn btn-sm btn-outline-info" href="${href}" target="_blank" rel="noopener noreferrer" title="Buka sumber regulasi" aria-label="Buka sumber regulasi"><i class="bi bi-box-arrow-up-right"></i></a>` : ''}
            <button class="btn btn-sm btn-outline-primary" type="button" onclick="bukaFormSibukLaw(${index})" aria-label="Ubah regulasi" title="Ubah regulasi"><i class="bi bi-pencil"></i></button>
            <button class="btn btn-sm btn-outline-danger" type="button" onclick="hapusSibukLaw(${index})" aria-label="Hapus regulasi"><i class="bi bi-trash"></i></button></td>
        </tr>`;
    }).join('');
}

function bukaFormSibukLaw(index) {
    const law = Number.isInteger(index) ? getSibukLaws()[index] : null;
    document.getElementById('sibukLawIndex').value = law ? String(index) : '';
    document.getElementById('sibukLawJenis').value = law ? law.jenis || '' : '';
    document.getElementById('sibukLawNomor').value = law ? law.nomor || '' : '';
    document.getElementById('sibukLawJudul').value = law ? law.judul || '' : '';
    document.getElementById('sibukLawKeterkaitan').value = law ? law.keterkaitan || '' : '';
    document.getElementById('sibukLawLink').value = law ? law.link || '' : '';
    document.getElementById('modalSibukLawTitle').textContent = law ? 'Ubah Dasar Hukum' : 'Tambah Dasar Hukum';
    bootstrap.Modal.getOrCreateInstance(document.getElementById('modalSibukLaw')).show();
}

async function persistSibukLaws(laws) {
    const data = { ...(globalConf || {}), sibuk_dasar_hukum: JSON.stringify(laws), sibuk_dasar_hukum_version: '2', last_updated: Date.now() };
    const result = await callAPI('saveSettings', data);
    if (!result || result.status !== 'success') throw new Error(result?.message || 'Dasar hukum gagal disimpan.');
    globalConf = { ...data };
    localStorage.setItem('globalConf', JSON.stringify(globalConf));
    renderSibukLawTable();
}

async function migrateSibukLawList() {
    if (!globalConf || !globalConf.sibuk_dasar_hukum || String(globalConf.sibuk_dasar_hukum_version || '') === '2') return;
    try {
        await persistSibukLaws(getSibukLaws());
    } catch (error) {
        console.error('[Dasar Hukum] Migrasi daftar regulasi gagal:', error);
    }
}

async function simpanSibukLaw(event) {
    event.preventDefault();
    const laws = getSibukLaws();
    const indexValue = document.getElementById('sibukLawIndex').value;
    const law = {
        jenis: document.getElementById('sibukLawJenis').value.trim(),
        nomor: document.getElementById('sibukLawNomor').value.trim(),
        judul: document.getElementById('sibukLawJudul').value.trim(),
        keterkaitan: document.getElementById('sibukLawKeterkaitan').value.trim(),
        link: document.getElementById('sibukLawLink').value.trim()
    };
    if (indexValue === '') laws.push(law);
    else laws[Number(indexValue)] = law;
    try {
        await persistSibukLaws(laws);
        bootstrap.Modal.getOrCreateInstance(document.getElementById('modalSibukLaw')).hide();
        showCoolAlert('Tersimpan', 'Dasar hukum berhasil disimpan.', 'success');
    } catch (error) {
        console.error('[Dasar Hukum] Gagal menyimpan:', error);
        showCoolAlert('Gagal menyimpan', error.message, 'error');
    }
}

async function hapusSibukLaw(index) {
    const confirmation = await Swal.fire({ title: 'Hapus regulasi?', text: 'Regulasi ini akan dihapus dari daftar sekolah.', icon: 'warning', showCancelButton: true, confirmButtonText: 'Hapus', cancelButtonText: 'Batal' });
    if (!confirmation.isConfirmed) return;
    const laws = getSibukLaws();
    laws.splice(index, 1);
    try {
        await persistSibukLaws(laws);
        showCoolAlert('Terhapus', 'Regulasi berhasil dihapus.', 'success');
    } catch (error) {
        console.error('[Dasar Hukum] Gagal menghapus:', error);
        showCoolAlert('Gagal menghapus', error.message, 'error');
    }
}

async function resetSibukLawList() {
    const confirmation = await Swal.fire({ title: 'Gunakan daftar awal?', text: 'Daftar yang telah disesuaikan akan diganti dengan daftar acuan SiKoBaELah.', icon: 'question', showCancelButton: true, confirmButtonText: 'Gunakan daftar awal', cancelButtonText: 'Batal' });
    if (!confirmation.isConfirmed) return;
    try {
        await persistSibukLaws(SIBUK_LAW_DEFAULTS.map(item => ({ ...item })));
        showCoolAlert('Tersimpan', 'Daftar awal dasar hukum berhasil dipulihkan.', 'success');
    } catch (error) {
        console.error('[Dasar Hukum] Gagal memulihkan daftar:', error);
        showCoolAlert('Gagal menyimpan', error.message, 'error');
    }
}

function readFileAsDataURL(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).replace(/^data:[^;]*;base64,/i, 'data:application/pdf;base64,'));
        reader.onerror = () => reject(new Error('File SOP tidak dapat dibaca.'));
        reader.readAsDataURL(file);
    });
}

async function simpanSibukSOP() {
    const input = document.getElementById('sibukSOPFile');
    const file = input && input.files && input.files[0];
    if (!file) {
        showCoolAlert('Pilih file', 'Pilih dokumen SOP PDF terlebih dahulu.', 'warning');
        return;
    }
    if ((file.type && file.type !== 'application/pdf') || !file.name.toLowerCase().endsWith('.pdf')) {
        showCoolAlert('Format tidak sesuai', 'Dokumen SOP harus berupa file PDF.', 'error');
        return;
    }
    if (file.size > 500 * 1024) {
        showCoolAlert('File terlalu besar', 'Ukuran PDF SOP maksimal 500 KB.', 'error');
        return;
    }

    $('#loader').removeClass('hidden');
    try {
        const dataUrl = await readFileAsDataURL(file);
        const signature = atob(String(dataUrl).split(',')[1].slice(0, 8));
        if (!signature.startsWith('%PDF-')) throw new Error('Isi file bukan dokumen PDF yang valid.');
        const upload = await callAPI('uploadBase64', { base64: dataUrl, filename: 'SOP_SiBukInSTal.pdf', folderType: 'sop' });
        if (!upload || upload.status !== 'success' || !upload.id) throw new Error(upload?.message || 'Unggah SOP gagal.');
        const data = { ...(globalConf || {}), sop_pdf: upload.id, sop_pdf_deleted: false, last_updated: Date.now() };
        const result = await callAPI('saveSettings', data);
        if (!result || result.status !== 'success') throw new Error(result?.message || 'Referensi SOP gagal disimpan.');
        globalConf = { ...data };
        localStorage.setItem('globalConf', JSON.stringify(globalConf));
        input.value = '';
        renderSibukSOPSettings();
        showCoolAlert('Tersimpan', 'SOP berhasil disimpan.', 'success');
    } catch (error) {
        console.error('[SOP] Gagal menyimpan:', error);
        showCoolAlert('Gagal menyimpan SOP', error.message || 'Terjadi kesalahan saat menyimpan SOP.', 'error');
    } finally {
        $('#loader').addClass('hidden');
    }
}

async function hapusSibukSOP() {
    const confirmation = await Swal.fire({ title: 'Hapus SOP?', text: 'Referensi SOP akan dihapus dari pengaturan dan tombol SOP saat login tidak lagi menampilkannya.', icon: 'warning', showCancelButton: true, confirmButtonText: 'Hapus SOP', cancelButtonText: 'Batal' });
    if (!confirmation.isConfirmed) return;
    try {
        const data = { ...(globalConf || {}), sop_pdf: '', sop_pdf_deleted: true, last_updated: Date.now(), _explicitDelete: true };
        const result = await callAPI('saveSettings', data);
        if (!result || result.status !== 'success') throw new Error(result?.message || 'Pengaturan SOP gagal diperbarui.');
        delete data._explicitDelete;
        globalConf = data;
        localStorage.setItem('globalConf', JSON.stringify(globalConf));
        renderSibukSOPSettings();
        showCoolAlert('Terhapus', 'Referensi SOP berhasil dihapus.', 'success');
    } catch (error) {
        console.error('[SOP] Gagal menghapus:', error);
        showCoolAlert('Gagal menghapus SOP', error.message || 'Terjadi kesalahan saat menghapus SOP.', 'error');
    }
}

function togglePass(id, icon) {
    const input = document.getElementById(id);
    if (input.type === "password") {
        input.type = "text";
        icon.classList.remove('bi-eye-slash');
        icon.classList.add('bi-eye');
    } else {
        input.type = "password";
        icon.classList.remove('bi-eye');
        icon.classList.add('bi-eye-slash');
    }
}

function toggleSidebar() {
    $('#mainSidebar').toggleClass('show');
    $('.sidebar-overlay').toggleClass('show');
}

function showPrivacy() { $('#mdlPrivacy').modal('show'); }
function showCoolAlert(title, text, icon) { Swal.fire({ title: title, text: text, icon: icon, showClass: { popup: 'animate__animated animate__fadeInDown' }, hideClass: { popup: 'animate__animated animate__fadeOutUp' }, confirmButtonColor: '#4e73df', backdrop: `rgba(0,0,123,0.4)` }); }

function refreshPage() {
    // 1. Munculkan Layar Hitam Loading
    $('#loader').removeClass('hidden');
    $('#loaderText').text('Menyegarkan data dari server...');

    // 2. KOSONGKAN TABEL (Ini kunci agar layarnya "berkedip" seperti di-reload)
    let loadingHtml = '<tr><td colspan="10" class="text-center py-5"><div class="spinner-border text-primary spinner-border-sm"></div> <span class="fw-bold text-muted ms-2">Memuat ulang data...</span></td></tr>';
    
    // 3. Tarik data terbaru berdasarkan halaman yang sedang dibuka
    if (curPage === 'siswa' || curPage === 'datasiswa' || curPage === 'dash') {
        const wasNomorIndukLoaded = (typeof lapDataLoaded !== 'undefined' && lapDataLoaded) || $('#tabIndukNomor').hasClass('active');
        if (typeof invalidateUnifiedCaches === 'function') invalidateUnifiedCaches();
        if ($.fn.DataTable.isDataTable('#tblSiswa')) $('#tblSiswa').DataTable().clear().destroy();
        if ($.fn.DataTable.isDataTable('#tblDataSiswa')) $('#tblDataSiswa').DataTable().clear().destroy();
        if ($.fn.DataTable.isDataTable('#tblIndukKeluar')) $('#tblIndukKeluar').DataTable().clear().destroy();
        $('#tbodySiswa').html(loadingHtml);
        $('#tbodyDataSiswa').html(loadingHtml);
        $('#tbodyIndukKeluar').html(loadingHtml);
        loadSiswa().then(() => {
            if (curPage === 'siswa' && wasNomorIndukLoaded && typeof muatDataLaporan === 'function') {
                muatDataLaporan(true, { silent: true });
            }
        });
    }
    else if (curPage === 'data-siswa' || curPage === 'leger-siswa' || curPage === 'klaper-siswa') {
        if (typeof invalidateUnifiedCaches === 'function') invalidateUnifiedCaches();
        loadSiswa().then(() => {
            if (curPage === 'data-siswa' && typeof loadUnifiedSiswa === 'function') loadUnifiedSiswa().then(renderUnifiedDataMenu);
            if (curPage === 'leger-siswa' && typeof loadUnifiedSiswa === 'function') loadUnifiedSiswa().then(renderUnifiedLegerMenu);
            if (curPage === 'klaper-siswa' && typeof loadUnifiedSiswa === 'function') loadUnifiedSiswa().then(renderKlaperTable);
        });
    }
    else if (curPage === 'mapel') {
        loadMapel();
    }
    else if (curPage === 'nilai') {
        if ($('#selSiswa').val()) $('#selSiswa').change();
        else $('#loader').addClass('hidden');
    }
    else if (curPage === 'alumni') {
        if ($.fn.DataTable.isDataTable('#tblAlumni')) $('#tblAlumni').DataTable().clear().destroy();
        if ($.fn.DataTable.isDataTable('#tblLegerAlumni')) $('#tblLegerAlumni').DataTable().clear().destroy();
        $('#tbodyAlumni').html(loadingHtml);
        $('#tbodyLegerAlumni').html(loadingHtml);
        if(typeof inisialisasiDropdownAlumni === 'function') inisialisasiDropdownAlumni();
    }
    else if (curPage === 'mutasi') {
        if ($.fn.DataTable.isDataTable('#tblKeluar')) $('#tblKeluar').DataTable().clear().destroy();
        if ($.fn.DataTable.isDataTable('#tblLegerKeluar')) $('#tblLegerKeluar').DataTable().clear().destroy();
        $('#bodyKeluarData').html(loadingHtml);
        $('#bodyKeluarLeger').html(loadingHtml);
        if(typeof inisialisasiDropdownKeluar === 'function') inisialisasiDropdownKeluar();
    }
    else {
        $('#loader').addClass('hidden');
    }

    // 4. Beri notifikasi pop-up kecil di pojok kanan atas
    Swal.fire({
        toast: true,
        position: 'top-end',
        icon: 'success',
        title: 'Data berhasil diperbarui',
        timer: 1500,
        showConfirmButton: false
    });
}

function updateActiveNavigation(page) {
    const menuNeedles = {
        dash: "nav('dash'",
        siswa: "nav('siswa'",
        'data-siswa': "openUnifiedMenu('data-siswa'",
        'leger-siswa': "openUnifiedMenu('leger-siswa'",
        'klaper-siswa': "openUnifiedMenu('klaper-siswa'",
        settings: "nav('settings'"
    };
    const needle = menuNeedles[page];
    $('#mainSidebar a, #mobileBottomBar a').removeClass('active');
    if (!needle) return;
    $('#mainSidebar a, #mobileBottomBar a').filter(function () {
        return String($(this).attr('onclick') || '').includes(needle);
    }).addClass('active');
}

function activateNomorIndukTab() {
    const target = document.querySelector('[data-bs-target="#tabIndukNomor"]');
    const panes = $('#pills-tab-induk').next('.tab-content').children('.tab-pane');
    panes.removeClass('show active');
    $('#tabIndukNomor').addClass('show active');
    $('#pills-tab-induk .nav-link').removeClass('active');
    $(target).addClass('active');
    if (target && typeof bootstrap !== 'undefined') bootstrap.Tab.getOrCreateInstance(target).show();
}

function nav(page, el, param) {
    curPage = page;

    // Ubah status aktif di menu laptop/PC
    updateActiveNavigation(page);

    // Ubah status aktif di menu HP
    if ($(window).width() < 768) { $('#mainSidebar').removeClass('show'); $('.sidebar-overlay').removeClass('show'); }
    $('[id^=view-]').addClass('hidden'); $('#view-' + page).removeClass('hidden');

    if (page === 'settings') renderSibukSOPSettings();

    if (page == 'siswa') {
        if (typeof inisialisasiDropdownAlumni === 'function') inisialisasiDropdownAlumni();
        if (typeof inisialisasiDropdownKeluar === 'function') inisialisasiDropdownKeluar();
        if (globalKelas.length === 0 && typeof loadKelas === 'function') loadKelas();
        activateNomorIndukTab();
        if (IS_DESKTOP && typeof muatDataLaporan === 'function') {
            muatDataLaporan(false, { silent: true });
        }
    }

    if (page === 'data-siswa') {
        if (typeof activateUnifiedDataTab === 'function') activateUnifiedDataTab('#data-tab-aktif');
        if (typeof renderUnifiedDataMenu === 'function') renderUnifiedDataMenu();
        setTimeout(() => {
            if ($.fn.DataTable.isDataTable('#tblUnifiedAktif')) {
                $('#tblUnifiedAktif').DataTable().columns.adjust().draw(false);
            }
        }, 100);
    }

    if (page === 'leger-siswa') {
        if (typeof activateUnifiedLegerTab === 'function') activateUnifiedLegerTab('#leger-tab-aktif');
        if (typeof renderUnifiedLegerMenu === 'function') renderUnifiedLegerMenu();
        setTimeout(() => {
            if ($.fn.DataTable.isDataTable('#tblUnifiedLegerAktif')) {
                $('#tblUnifiedLegerAktif').DataTable().columns.adjust().draw(false);
            }
        }, 100);
    }

    if (page === 'klaper-siswa') {
        if (typeof renderKlaperTable === 'function') renderKlaperTable();
        setTimeout(() => {
            if ($.fn.DataTable.isDataTable('#tblKlaperSiswa')) {
                $('#tblKlaperSiswa').DataTable().columns.adjust().draw(false);
            }
        }, 100);
    }

    if (page == 'mapel') {
        openUnifiedMenu('leger-siswa');
        setTimeout(() => {
            const btn = document.querySelector('button[data-bs-target="#leger-tab-mapel"]');
            if (btn && typeof bootstrap !== 'undefined') {
                bootstrap.Tab.getOrCreateInstance(btn).show();
            }
            loadMapel();
        }, 150);
        return;
    }

    if (page == 'alumni') {
        if (typeof inisialisasiDropdownAlumni === 'function') inisialisasiDropdownAlumni();
    }

    if (page == 'mutasi') {
        if (typeof inisialisasiDropdownKeluar === 'function') inisialisasiDropdownKeluar();
    }

    if (page == 'nilai') {
        curSmt = param;
        $('#judulNilai').text('Input Nilai Semester ' + param);
        $('#mobileSemester').val(param); // Sync dropdown HP

        const s = $('#selSiswa').empty().append('<option value="">-- Pilih --</option>');
        globalSiswa.forEach(x => s.append(`<option value="${x[0]}">${x[0]} - ${x[2]}</option>`));
        $('#tbodyNilai').html('<tr><td colspan="4" class="text-muted py-5">Silakan pilih siswa...</td></tr>');

        if (globalMapel.length === 0) {
            callAPI('getMapel').then(d => {
                globalMapel = d;
            });
        }
    }
}

function downloadPDFBase64(base64, filename) {
    const link = document.createElement('a');
    link.href = 'data:application/pdf;base64,' + base64;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

function downloadTemplate(type, nis) {
    if (type === 'nilai') {
        const mapels = Array.isArray(globalMapel) ? globalMapel : [];
        const workbook = new ExcelJS.Workbook();
        const sheet = workbook.addWorksheet('Nilai Siswa');
        const totalColumns = 50;
        sheet.mergeCells(1, 1, 1, totalColumns);
        sheet.getCell(1, 1).value = 'TEMPLATE INPUT NILAI SISWA';
        sheet.mergeCells(2, 1, 2, totalColumns);
        sheet.getCell(2, 1).value = 'Isi kolom P, K, S, dan Deskripsi. Nilai sikap pilih A, B, C, D, atau E.';
        sheet.mergeCells(4, 1, 5, 1);
        sheet.mergeCells(4, 2, 5, 2);
        sheet.getCell(4, 1).value = 'ID MAPEL';
        sheet.getCell(4, 2).value = 'NAMA MAPEL';
        for (let semester = 1; semester <= 12; semester++) {
            const startColumn = 3 + (semester - 1) * 4;
            sheet.mergeCells(4, startColumn, 4, startColumn + 3);
            sheet.getCell(4, startColumn).value = `SEMESTER ${semester}`;
            ['P', 'K', 'S', 'DESKRIPSI'].forEach((label, index) => { sheet.getCell(5, startColumn + index).value = label; });
        }
        mapels.forEach(mapel => sheet.addRow([mapel[0], mapel[1], ...Array(48).fill('')]));
        [1, 2].forEach(rowNumber => {
            const row = sheet.getRow(rowNumber);
            row.font = { bold: rowNumber === 1, color: { argb: 'FF000000' } };
            row.alignment = { horizontal: 'left', vertical: 'middle' };
        });
        [4, 5].forEach(rowNumber => {
            const row = sheet.getRow(rowNumber);
            row.font = { bold: true, color: { argb: 'FFFFFFFF' } };
            row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: rowNumber === 4 ? 'FF198754' : 'FF4E73DF' } };
            row.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
        });
        sheet.getRow(1).height = 25;
        sheet.getRow(2).height = 22;
        sheet.getRow(4).height = 24;
        sheet.getRow(5).height = 25;
        sheet.columns.forEach((column, index) => {
            if (index === 0) column.width = 14;
            else if (index === 1) column.width = 28;
            else {
                const position = (index - 2) % 4;
                column.width = position === 0 || position === 1 ? 8 : position === 2 ? 7 : 18;
            }
        });
        for (let semester = 1; semester <= 12; semester++) {
            const startColumn = 3 + (semester - 1) * 4;
            for (let rowNumber = 6; rowNumber <= mapels.length + 5; rowNumber++) {
                sheet.getCell(rowNumber, startColumn).numFmt = '0.00';
                sheet.getCell(rowNumber, startColumn + 1).numFmt = '0.00';
                sheet.getCell(rowNumber, startColumn).dataValidation = { type: 'decimal', operator: 'between', allowBlank: true, formulae: [0, 100], showErrorMessage: true, errorTitle: 'Nilai tidak valid', error: 'Nilai P harus 0 sampai 100.' };
                sheet.getCell(rowNumber, startColumn + 1).dataValidation = { type: 'decimal', operator: 'between', allowBlank: true, formulae: [0, 100], showErrorMessage: true, errorTitle: 'Nilai tidak valid', error: 'Nilai K harus 0 sampai 100.' };
                sheet.getCell(rowNumber, startColumn + 2).dataValidation = { type: 'list', allowBlank: true, formulae: ['"A,B,C,D,E"'] };
            }
            for (let rowNumber = 4; rowNumber <= mapels.length + 5; rowNumber++) {
                for (let column = startColumn; column <= startColumn + 3; column++) sheet.getCell(rowNumber, column).border = { left: { style: 'medium', color: { argb: 'FF000000' } } };
            }
        }
        sheet.getRow(5).eachCell(cell => { cell.border = { top: { style: 'thin', color: { argb: 'FF000000' } }, bottom: { style: 'thin', color: { argb: 'FF000000' } } }; });
        sheet.views = [{ state: 'frozen', ySplit: 5, xSplit: 2 }];
        workbook.xlsx.writeBuffer().then(buffer => {
            saveAs(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), 'Template_Nilai.xlsx');
        });
        return;
    }

    if (type === 'siswa') {
        const workbook = new ExcelJS.Workbook();
        workbook.creator = 'SiBuk InSTal';
        workbook.lastModifiedBy = 'SiBuk InSTal';
        const sheet = workbook.addWorksheet('Template Siswa', {
            views: [{ state: 'frozen', ySplit: 1, xSplit: 3 }]
        });

        const headers = [
            'NIS', 'NISN', 'Nama', 'NIK', 'NoKK', 'TempatLahir', 'TglLahir', 'JK', 'Agama',
            'AnakKe', 'JmlSdr', 'Bahasa', 'Alamat', 'NoHP', 'Jarak', 'Transport',
            'Tinggi', 'Berat', 'Goldar', 'Penyakit',
            'NamaAyah', 'TglLahirAyah', 'KerjaAyah',
            'NamaIbu', 'TglLahirIbu', 'KerjaIbu',
            'PindahanDari', 'LulusanDari', 'NoIjazahSLTP',
            'KlsMasuk', 'TglMasuk', 'StatusAkhir', 'TglKeluar', 'LanjutKe',
            'NoIjazahSMA', 'ID_Foto_Masuk', 'ID_Foto_Keluar',
            'Password_Login', 'Masa_Berlaku',
            'Hobby', 'Pdd Ayah', 'Penghasilan Ayah', 'Status Ayah',
            'Pdd Ibu', 'Penghasilan Ibu', 'Status Ibu',
            'Nama Wali', 'Tgl Lahir Wali', 'Kerja Wali',
            'Pdd Wali', 'Penghasilan Wali', 'Status Wali', 'KlsSaatIni', 'Email', 'Alasan Keluar',
            'No Registrasi Akta Lahir', 'Kewarganegaraan', 'Penerima KIP', 'Nomor KIP', 'Nama di KIP', 'Nomor KKS',
            'Penerima KPS', 'Nomor KPS', 'Nama Bank', 'Nomor Rekening Bank', 'Rekening Atas Nama',
            'Berkebutuhan Khusus', 'Jenis Kebutuhan Khusus'
        ];

        const widths = [
            12, 16, 28, 22, 22, 18, 16, 8, 12,
            10, 10, 14, 32, 18, 10, 16,
            10, 10, 10, 16,
            22, 16, 18,
            22, 16, 18,
            16, 20, 22,
            12, 16, 14, 16, 18,
            20, 16, 16,
            16, 16,
            16, 18, 20, 16,
            18, 20, 16,
            20, 16, 18,
            18, 20, 16, 14, 26, 18,
            24, 16, 14, 18, 20, 18,
            14, 18, 16, 22, 24,
            20, 20
        ];

        sheet.columns = headers.map((h, i) => ({
            header: h,
            key: h,
            width: widths[i] || 16
        }));

        const sampleRow1 = [
            '1001', '0071234567', 'Ahmad Pratama', '1504010101080001', '1504010101080001', 'Tebo', '2008-05-15', 'L', 'Islam',
            '1', '2', 'Indonesia', 'Jl. Merdeka No. 10', '081234567890', '1.5', 'Sepeda Motor',
            '165', '55', 'O', '-',
            'Budi Santoso', '1980-01-01', 'Wiraswasta',
            'Siti Aminah', '1982-03-15', 'Ibu Rumah Tangga',
            '-', 'SMP N 1 Tebo', 'DN-01/D-SMP/23/001',
            'X.1', '2023-07-15', 'Aktif', '', '',
            '', '', '',
            '123456', '',
            'Membaca', 'SMA', 'Rp 2.000.000 - Rp 4.999.999', 'Masih Hidup',
            'SMA', 'Tidak Berpenghasilan', 'Masih Hidup',
            '', '', '',
            '', '', '', 'X.1', 'ahmad.pratama@gmail.com', '',
            '1504-LT-01012020-0001', 'WNI', 'Tidak', '', '', '',
            'Tidak', '', 'BRI', '123456789012345', 'Ahmad Pratama',
            'Tidak', ''
        ];

        const sampleRow2 = [
            '1002', '0079876543', 'Siti Nurhaliza', '1504014202080002', '1504010101080002', 'Jambi', '2008-08-20', 'P', 'Islam',
            '2', '1', 'Indonesia', 'Jl. Sudirman No. 25', '085211223344', '2.0', 'Jalan Kaki',
            '158', '48', 'A', '-',
            'Rahman Saleh', '1978-06-12', 'PNS',
            'Nurhayati', '1981-11-05', 'Guru',
            '-', 'SMP N 2 Tebo', 'DN-01/D-SMP/23/002',
            'X.1', '2023-07-15', 'Aktif', '', '',
            '', '', '',
            '123456', '',
            'Menulis', 'S1', 'Rp 5.000.000 - Rp 9.999.999', 'Masih Hidup',
            'S1', 'Rp 2.000.000 - Rp 4.999.999', 'Masih Hidup',
            '', '', '',
            '', '', '', 'X.1', 'siti.nurhaliza@gmail.com', '',
            '1504-LT-02022020-0002', 'WNI', 'Tidak', '', '', '',
            'Tidak', '', 'Bank Jambi', '987654321098765', 'Siti Nurhaliza',
            'Tidak', ''
        ];

        sheet.addRow(sampleRow1);
        sheet.addRow(sampleRow2);

        const headerRow = sheet.getRow(1);
        headerRow.height = 28;
        headerRow.eachCell(cell => {
            cell.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F3A60' } };
            cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
            cell.border = {
                top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
                left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
                bottom: { style: 'medium', color: { argb: 'FF0F172A' } },
                right: { style: 'thin', color: { argb: 'FFCBD5E1' } }
            };
        });

        [2, 3].forEach(rIdx => {
            const row = sheet.getRow(rIdx);
            row.height = 22;
            row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
                cell.font = { name: 'Segoe UI', size: 10, color: { argb: 'FF334155' } };
                cell.border = {
                    top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
                    left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
                    bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
                    right: { style: 'thin', color: { argb: 'FFE2E8F0' } }
                };
                cell.alignment = { vertical: 'middle' };
                // Format teks untuk kolom kode/identitas/angka panjang
                if ([1, 2, 4, 5, 7, 14, 22, 25, 29, 31, 33, 35, 38, 48, 56, 59, 61, 63, 65].includes(colNumber)) {
                    cell.numFmt = '@';
                }
            });
        });

        workbook.xlsx.writeBuffer().then(buffer => {
            saveAs(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), 'Template_Siswa.xlsx');
        });
        return;
    }

    if (type === 'mapel') {
        const workbook = new ExcelJS.Workbook();
        workbook.creator = 'SiBuk InSTal';
        workbook.lastModifiedBy = 'SiBuk InSTal';
        const sheet = workbook.addWorksheet('Template Mapel', {
            views: [{ state: 'frozen', ySplit: 1 }]
        });

        sheet.columns = [
            { header: 'ID Mapel', key: 'id', width: 18 },
            { header: 'Nama Mapel', key: 'nama', width: 45 }
        ];

        const sampleMapel = [
            ['PAI', 'Pendidikan Agama Islam dan Budi Pekerti'],
            ['PKN', 'Pendidikan Pancasila dan Kewarganegaraan'],
            ['BIN', 'Bahasa Indonesia'],
            ['MTK', 'Matematika'],
            ['BIG', 'Bahasa Inggris'],
            ['FIS', 'Fisika'],
            ['KIM', 'Kimia'],
            ['BIO', 'Biologi'],
            ['SEJ', 'Sejarah Indonesia'],
            ['SEN', 'Seni Budaya'],
            ['PJK', 'Pendidikan Jasmani, Olahraga, dan Kesehatan'],
            ['PKR', 'Prakarya dan Kewirausahaan']
        ];

        sampleMapel.forEach(m => sheet.addRow(m));

        const headerRow = sheet.getRow(1);
        headerRow.height = 28;
        headerRow.eachCell(cell => {
            cell.font = { name: 'Segoe UI', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0D6EFD' } };
            cell.alignment = { horizontal: 'center', vertical: 'middle' };
            cell.border = {
                top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
                left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
                bottom: { style: 'medium', color: { argb: 'FF0A58CA' } },
                right: { style: 'thin', color: { argb: 'FFCBD5E1' } }
            };
        });

        for (let i = 2; i <= sampleMapel.length + 1; i++) {
            const row = sheet.getRow(i);
            row.height = 22;
            row.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
            row.getCell(1).numFmt = '@';
            row.getCell(2).alignment = { horizontal: 'left', vertical: 'middle' };
            [1, 2].forEach(c => {
                row.getCell(c).font = { name: 'Segoe UI', size: 10, color: { argb: 'FF334155' } };
                row.getCell(c).border = {
                    top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
                    left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
                    bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
                    right: { style: 'thin', color: { argb: 'FFE2E8F0' } }
                };
            });
        }

        workbook.xlsx.writeBuffer().then(buffer => {
            saveAs(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), 'Template_Import_Mapel.xlsx');
        });
        return;
    }

    // Fallback jika tipe lain diminta
    const fallbackWb = new ExcelJS.Workbook();
    const fallbackSheet = fallbackWb.addWorksheet(`Template_${type}`);
    fallbackSheet.addRow(['Kolom1', 'Kolom2']);
    fallbackWb.xlsx.writeBuffer().then(buffer => {
        saveAs(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `Template_${type}.xlsx`);
    });
}

function updateAccount(e, role) {
    e.preventDefault();
    Swal.fire({ title: 'Ubah Akun?', text: "Anda yakin ingin mengubah kredensial " + role + "?", icon: 'question', showCancelButton: true }).then(r => {
        if (r.isConfirmed) {
            const u = (role == 'admin') ? $('#adminUser').val() : $('#guruUser').val();
            const p = (role == 'admin') ? $('#adminPass').val() : $('#guruPass').val();
            callAPI('updateCredentials', { role: role, newConfig: { username: u, password: p } }).then(res => {
                if (res.status == 'success') showCoolAlert('Sukses', 'Akun berhasil diperbarui', 'success');
            });
        }
    });
}

async function loadSettings() {
    return callAPI('getSettings').then(async s => {
        if (!s || typeof s !== 'object' || s.status === 'error') return;
        globalConf = s;
        try { localStorage.setItem('globalConf', JSON.stringify(s)); } catch (_) {}
        ['logo_instansi', 'logo_sekolah', 'background_landing', 'background_login', 'background_kartu', 'background_belakang'].forEach(id => $('#' + id).data('deleted', false));

        if (s.theme_color_1) document.documentElement.style.setProperty('--theme-color-1', s.theme_color_1);
        else document.documentElement.style.setProperty('--theme-color-1', s.theme_color || '#4e73df');
        if (s.theme_color_2) document.documentElement.style.setProperty('--theme-color-2', s.theme_color_2);
        else document.documentElement.style.setProperty('--theme-color-2', '#224abe');
        if (s.theme_color_3) document.documentElement.style.setProperty('--theme-color-3', s.theme_color_3);
        else document.documentElement.style.setProperty('--theme-color-3', '#1a202c');
        document.documentElement.style.setProperty('--primary-color', s.theme_color_1 || s.theme_color || '#4e73df');
        
        if (s.nama_instansi) {
            $('#lblInstansi, #lblInstansiLanding, #dashInstansi2').text(s.nama_instansi);
            $('#setInstansi').val(s.nama_instansi);
        }
        if (s.opd_dinas) { $('#lblOpdLogin').text(s.opd_dinas); $('#dashOpd').text(s.opd_dinas); } else { $('#lblOpdLogin').text(''); $('#dashOpd').text(''); }
        if (s.nama_sekolah) {
            $('#lblSekolah, #lblSekolahLanding, #dashName2, #footSchoolName, #footSchoolLanding, #wb_sekolah').text(s.nama_sekolah);
            $('#setNama').val(s.nama_sekolah);
        }
        $('#yearAppLanding, #yearLogin, #yearApp').text(new Date().getFullYear());
        if (s.alamat_sekolah) { $('#dashAddr2').text(s.alamat_sekolah); $('#setAlamat').val(s.alamat_sekolah); }
        
        if (s.web_sekolah) { $('#dashWeb').text(s.web_sekolah); } else { $('#dashWeb').text('-'); }
        if (s.email_sekolah) { $('#dashEmail').text(s.email_sekolah); } else { $('#dashEmail').text('-'); }
        if (s.telp_sekolah) { $('#dashTelp').text(s.telp_sekolah); } else { $('#dashTelp').text('-'); }
        $('#setKepsek').val(s.nama_kepsek || s.kepala_sekolah || '');
        $('#setNip').val(s.nip_kepsek || ''); 
        $('#setNamaAdmin').val(s.nama_admin || '');
        $('#setTheme1').val(s.theme_color_1 || s.theme_color || '#4e73df');
        $('#setTheme2').val(s.theme_color_2 || '#224abe');
        $('#setTheme3').val(s.theme_color_3 || '#1a202c');
        $('#setOpd').val(s.opd_dinas || ''); $('#setTelp').val(s.telp_sekolah || ''); $('#setEmail').val(s.email_sekolah || ''); $('#setWeb').val(s.web_sekolah || '');
        
        // Populate and lock username fields based on online settings
        const admU = s.username_admin || s.admin_user || s.adminUser || s.admin_username || s.user_admin || s.useradmin || s.adminusername;
        let sessionData = null;
        try {
            const currentSession = localStorage.getItem(getSessionStorageKey());
            sessionData = currentSession ? JSON.parse(dekripsiLokal(currentSession)) : null;
        } catch (e) {}
        
        const finalAdmU = admU || (sessionData && sessionData.role === 'admin' ? sessionData.username : '');
        $('#adminUser').val(finalAdmU).attr('readonly', true).attr('title', 'Username Admin (Readonly)');
        
        const wakaU = s.username_waka || s.waka_user || s.wakaUser || s.waka_username || s.guruUser || s.username_guru || s.user_waka || s.userwaka;
        const finalWakaU = wakaU || (sessionData && sessionData.role === 'wakakurikulum' ? sessionData.username : '');
        $('#guruUser').val(finalWakaU).attr('readonly', true).attr('title', 'Username Waka (Readonly)');

        // --- Pemuatan Gambar (Direct Base64 Data URL atau Fallback Drive ID Non-blocking) ---
        if (s.logo_instansi) {
            $('#logo_instansi').val(s.logo_instansi);
            renderConfiguredLogo('#loginLogoInstansi, #landingLogoInstansi, #prevLogoInstansi, #dashLogoInstansi, #headerLogoInstansi', s.logo_instansi);
        } else {
            renderConfiguredLogo('#loginLogoInstansi, #landingLogoInstansi, #prevLogoInstansi, #dashLogoInstansi, #headerLogoInstansi', '');
        }
        
        if (s.logo_sekolah) {
            $('#logo_sekolah').val(s.logo_sekolah);
            renderConfiguredLogo('#loginLogoSekolah, #landingLogoSekolah, #prevLogoSekolah, #dashLogoSekolah, #headerLogoSekolah', s.logo_sekolah);
        } else {
            renderConfiguredLogo('#loginLogoSekolah, #landingLogoSekolah, #prevLogoSekolah, #dashLogoSekolah, #headerLogoSekolah', '');
        }

        // --- FIX: UPDATE HEADER SISWA SETELAH DATA TIBA ---
        $('#headerInstansi').text(s.nama_instansi || 'DINAS PENDIDIKAN');
        $('#headerSekolah').text(s.nama_sekolah || 'NAMA SEKOLAH');

        if (s.background_landing) {
            $('#background_landing').val(s.background_landing);
            if (String(s.background_landing).startsWith('data:')) {
                $('#prev_bg_landing').attr('src', s.background_landing).removeClass('hidden'); 
                bgLandingUrl = 'url(' + s.background_landing + ')'; 
                applyLoginPageBackground();
            } else {
                callAPI('getImage', { id: s.background_landing }).then(b => {
                    if (b && typeof b === 'string') {
                        $('#prev_bg_landing').attr('src', b).removeClass('hidden'); 
                        bgLandingUrl = 'url(' + b + ')'; 
                        applyLoginPageBackground();
                    }
                }).catch(() => {});
            }
        }

        if (s.background_login) {
            $('#background_login').val(s.background_login);
            if (String(s.background_login).startsWith('data:')) {
                $('#prev_bg_login').attr('src', s.background_login).removeClass('hidden'); 
                bgLoginUrl = 'url(' + s.background_login + ')'; 
                applyLoginPageBackground();
            } else {
                callAPI('getImage', { id: s.background_login }).then(b => {
                    if (b && typeof b === 'string') {
                        $('#prev_bg_login').attr('src', b).removeClass('hidden'); 
                        bgLoginUrl = 'url(' + b + ')'; 
                        applyLoginPageBackground();
                    }
                }).catch(() => {});
            }
        }
        if (s.background_kartu) {
            $('#background_kartu').val(s.background_kartu);
            if (String(s.background_kartu).startsWith('data:')) {
                $('#prev_bg_kartu').attr('src', s.background_kartu).removeClass('hidden'); 
            } else {
                callAPI('getImage', { id: s.background_kartu }).then(b => {
                    if (b && typeof b === 'string') $('#prev_bg_kartu').attr('src', b).removeClass('hidden'); 
                }).catch(() => {});
            }
        }
        if (s.background_belakang) {
            $('#background_belakang').val(s.background_belakang);
            if (String(s.background_belakang).startsWith('data:')) {
                $('#prev_bg_belakang').attr('src', s.background_belakang).removeClass('hidden'); 
            } else {
                callAPI('getImage', { id: s.background_belakang }).then(b => {
                    if (b && typeof b === 'string') $('#prev_bg_belakang').attr('src', b).removeClass('hidden'); 
                }).catch(() => {});
            }
        }
        if (IS_DESKTOP) {
            $('#boxLinkExec').removeClass('hidden');
            $('#boxForcePush').removeClass('hidden');
            callAPI('getOfflineConfig').then(res => {
                let gasLink = '';
                if (res) {
                    if (typeof res === 'string') gasLink = res;
                    else if (res.gasUrl) gasLink = res.gasUrl;
                    else if (res.linkExec) gasLink = res.linkExec;
                    else if (res.data) gasLink = res.data.gasUrl || res.data.linkExec || (typeof res.data === 'string' ? res.data : '');
                }
                if (!gasLink && typeof window.APP_CONFIG !== 'undefined' && (window.APP_CONFIG.gasUrl || window.APP_CONFIG.linkExec)) {
                    gasLink = window.APP_CONFIG.gasUrl || window.APP_CONFIG.linkExec;
                }
                if (gasLink) {
                    $('#inputLinkExec').val(gasLink).attr('readonly', true);
                }
            }).catch(() => {
                if (typeof window.APP_CONFIG !== 'undefined' && window.APP_CONFIG.gasUrl) {
                    $('#inputLinkExec').val(window.APP_CONFIG.gasUrl).attr('readonly', true);
                }
            });
        }

        // --- FIX 2: MENCEGAH TOMBOL WA ERROR (Konversi Nomor HP ke String) ---
        if (s.telp_sekolah) {
            let noWA = String(s.telp_sekolah).replace(/\D/g, '').replace(/^0/, '62');
            $('#btnBantuanWA').attr('href', 'https://wa.me/' + noWA);
            // Ganti bagian Lupa Pass ini
            let teksWA = `Halo Admin, saya butuh bantuan akun SiMISTerBIn ${s.nama_sekolah}, karena lupa password.`;
            $('#btnWAAdminLupaPass').attr('href', 'https://wa.me/' + noWA + '?text=' + encodeURIComponent(teksWA));
        }
    });
}

function copyLinkExec() {
    let val = $('#inputLinkExec').val();
    if (!val && typeof window.APP_CONFIG !== 'undefined') {
        val = window.APP_CONFIG.gasUrl || window.APP_CONFIG.linkExec;
    }
    if (val) {
        navigator.clipboard.writeText(val).then(() => {
            showCoolAlert('Tersalin', 'Link Exec berhasil disalin ke clipboard.', 'success');
        });
    }
}


function getValOrGlobal(inputId, key) {
    const el = $('#' + inputId);
    if (el.data('deleted')) return '';
    const v = el.val();
    if (v) return v;
    return (globalConf && globalConf[key]) ? globalConf[key] : '';
}

function saveSettings(e) {
    e.preventDefault();
    $('#loader').removeClass('hidden');
    const d = {
        nama_instansi: $('#setInstansi').val() || (globalConf ? globalConf.nama_instansi : ''),
        nama_sekolah: $('#setNama').val() || (globalConf ? globalConf.nama_sekolah : ''),
        alamat_sekolah: $('#setAlamat').val() || (globalConf ? globalConf.alamat_sekolah : ''),
        nama_kepsek: $('#setKepsek').val() || (globalConf ? globalConf.nama_kepsek : ''),
        nip_kepsek: $('#setNip').val() || (globalConf ? globalConf.nip_kepsek : ''),
        logo_instansi: getValOrGlobal('logo_instansi', 'logo_instansi'),
        logo_sekolah: getValOrGlobal('logo_sekolah', 'logo_sekolah'),
        theme_color_1: $('#setTheme1').val(),
        theme_color_2: $('#setTheme2').val(),
        theme_color_3: $('#setTheme3').val(),
        opd_dinas: $('#setOpd').val(),
        telp_sekolah: $('#setTelp').val(),
        email_sekolah: $('#setEmail').val(),
        nama_admin: $('#setNamaAdmin').val(),
        web_sekolah: $('#setWeb').val(),
        background_landing: getValOrGlobal('background_landing', 'background_landing'),
        background_login: getValOrGlobal('background_login', 'background_login'),
        background_kartu: getValOrGlobal('background_kartu', 'background_kartu'),
        background_belakang: getValOrGlobal('background_belakang', 'background_belakang'),
    };
    callAPI('saveSettings', d).then(r => {
        $('#loader').addClass('hidden');
        if (r && r.status === 'error') {
            showCoolAlert('Gagal', r.message || 'Gagal menyimpan pengaturan.', 'error');
            return;
        }
        showCoolAlert('Tersimpan', 'Pengaturan berhasil disimpan.', 'success');
        loadSettings();
    }).catch(err => {
        $('#loader').addClass('hidden');
        showCoolAlert('Gagal', (err && err.message) || 'Gagal menyimpan pengaturan.', 'error');
    });
}

async function doBackup() {
    const isDesktop = typeof window.electronAPI !== 'undefined';
    const confirmation = await Swal.fire({
        title: 'Backup Database?',
        text: isDesktop
            ? 'Seluruh data lokal akan diunduh sebagai file backup JSON ke komputer ini.'
            : 'Proses ini akan menyalin seluruh data ke file baru di Google Drive.',
        icon: 'info',
        showCancelButton: true,
        confirmButtonColor: '#1cc88a',
        confirmButtonText: 'Ya, Backup!'
    });
    if (!confirmation.isConfirmed) return;

    $('#loader').removeClass('hidden');
    try {
        const res = await callAPI('backupDatabase');
        if (!res || res.status !== 'success') {
            throw new Error(res?.message || 'Backup gagal dibuat.');
        }

        if (isDesktop) {
            const backup = res.data;
            if (!backup || backup.format !== 'sibukinstal-sqlite-backup') {
                throw new Error('Data backup lokal tidak valid.');
            }
            const date = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').replace('Z', '');
            const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
            const downloadUrl = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = downloadUrl;
            link.download = `Backup_SiBukInSTal_${date}.json`;
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 60000);
            $('#loader').addClass('hidden');
            await Swal.fire('Backup Berhasil', 'File backup JSON berhasil diunduh ke komputer.', 'success');
            return;
        }

        $('#loader').addClass('hidden');
        await Swal.fire({
            title: 'Backup Berhasil!',
            html: `File tersimpan dengan nama: <br><b>${res.message}</b><br><br><a href="${res.url}" target="_blank" class="btn btn-sm btn-primary">Buka File Backup</a>`,
            icon: 'success'
        });
    } catch (error) {
        $('#loader').addClass('hidden');
        console.error('[Backup] Gagal membuat backup:', error);
        showCoolAlert('Gagal', error.message || 'Terjadi kesalahan saat membuat backup.', 'error');
    }
}

function doRestore() {
    if (typeof window.electronAPI === 'undefined') {
        showCoolAlert('Informasi', 'Restore file backup JSON hanya tersedia di aplikasi desktop offline.', 'info');
        return;
    }

    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.onchange = async () => {
        const file = input.files && input.files[0];
        if (!file) return;

        try {
            const backup = JSON.parse(await file.text());
            if (!backup || backup.format !== 'sibukinstal-sqlite-backup' || backup.version !== 1) {
                throw new Error('File bukan backup JSON SiBukInSTal yang valid.');
            }
            const confirmation = await Swal.fire({
                title: 'Pulihkan Backup?',
                text: 'Data dalam database lokal akan diganti dengan data dari file backup.',
                icon: 'warning',
                showCancelButton: true,
                confirmButtonText: 'Ya, Pulihkan',
                cancelButtonText: 'Batal',
                confirmButtonColor: '#d33'
            });
            if (!confirmation.isConfirmed) return;

            $('#loader').removeClass('hidden');
            const result = await callAPI('restoreDatabase', { backup });
            $('#loader').addClass('hidden');
            if (!result || result.status !== 'success') {
                throw new Error(result?.message || 'Restore backup gagal.');
            }
            await Swal.fire('Restore Berhasil', 'Data berhasil dipulihkan. Aplikasi akan dimuat ulang.', 'success');
            window.location.reload();
        } catch (error) {
            $('#loader').addClass('hidden');
            console.error('[Restore] Gagal memulihkan backup:', error);
            showCoolAlert('Restore Gagal', error.message || 'File backup tidak valid.', 'error');
        }
    };
    input.click();
}

function hapusGambarSettings(inputId, imgId) {
    Swal.fire({
        title: 'Hapus Gambar?',
        text: "Gambar akan dihapus dari layar. Jangan lupa klik tombol SIMPAN PENGATURAN di bawah setelah ini agar tersimpan ke database!",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#d33',
        cancelButtonText: 'Batal',
        confirmButtonText: 'Ya, Hapus!'
    }).then((result) => {
        if (result.isConfirmed) {
            // 1. Kosongkan data di memory & tandai telah dihapus secara eksplisit
            $('#' + inputId).val('').data('deleted', true);
            // 2. Sembunyikan preview gambar
            $('#' + imgId).attr('src', '').addClass('hidden');
            // 3. Reset kolom Pilih File agar kosong kembali
            $('#file_' + inputId).val('');

            // Khusus jika yang dihapus adalah logo instansi/sekolah, hilangkan juga di header
            if (inputId === 'logo_instansi') {
                $('#loginLogoInstansi').addClass('hidden');
                $('#headerLogoInstansi').addClass('hidden');
            }
            if (inputId === 'logo_sekolah') {
                $('#loginLogoSekolah').addClass('hidden');
                $('#headerLogoSekolah').addClass('hidden');
            }
        }
    });
}

function cropImage(input, target) {
    if (input.files && input.files[0]) {
        const file = input.files[0];
        cropTarget = target;
        const r = new FileReader();
        r.onload = e => {
            try { input.value = ''; } catch (_) {}
            if (cropper) {
                try { cropper.destroy(); } catch (_) {}
                cropper = null;
            }
            const imgEl = document.getElementById('imageToCrop');
            const mdlEl = document.getElementById('mdlCrop');
            if (!imgEl || !mdlEl) return;

            $('#imageToCrop').attr('src', e.target.result);

            const initCropperInstance = () => {
                if (cropper) {
                    try { cropper.destroy(); } catch (_) {}
                    cropper = null;
                }
                let ratio = NaN; // Default logo bebas
                if (target === 'masuk' || target === 'keluar' || target === 'du_masuk') ratio = 3 / 4;
                if (target.includes('bg_') || target === 'background_kartu' || target === 'background_belakang') ratio = 8.5 / 5.5;
                cropper = new Cropper(imgEl, { aspectRatio: ratio, viewMode: 1 });
            };

            if (mdlEl.classList.contains('show')) {
                initCropperInstance();
            } else {
                mdlEl.addEventListener('shown.bs.modal', initCropperInstance, { once: true });
                bootstrap.Modal.getOrCreateInstance(mdlEl).show();
            }
        };
        r.readAsDataURL(file);
    }
}

function encodeCanvasUnderLimit(sourceCanvas, isLogo, isBackground) {
    const MAX_BASE64_CHARS = 45000; // Aman di bawah batas 50.000 karakter per sel Google Sheets
    const initialMaxWidth = isBackground ? 1280 : 400;
    const mimeType = isLogo ? 'image/png' : 'image/jpeg';
    let quality = isLogo ? undefined : (isBackground ? 0.8 : 0.7);

    const drawScaled = (maxW) => {
        if (sourceCanvas.width <= maxW) return sourceCanvas;
        const c = document.createElement('canvas');
        c.width = maxW;
        c.height = Math.max(1, Math.round(sourceCanvas.height * maxW / sourceCanvas.width));
        c.getContext('2d').drawImage(sourceCanvas, 0, 0, c.width, c.height);
        return c;
    };

    let canvas = drawScaled(initialMaxWidth);
    let base64 = canvas.toDataURL(mimeType, quality);

    if (base64.length <= MAX_BASE64_CHARS) return base64;

    if (isLogo) {
        // Coba WebP terlebih dahulu agar transparansi logo tetap terjaga dengan ukuran jauh lebih hemat
        for (const q of [0.85, 0.75, 0.65]) {
            const webp = canvas.toDataURL('image/webp', q);
            if (webp.startsWith('data:image/webp') && webp.length <= MAX_BASE64_CHARS) {
                return webp;
            }
        }
        // Perkecil dimensi bertahap jika PNG/WebP masih di atas batas sel Spreadsheet
        for (const w of [300, 240, 180, 140]) {
            const scaled = drawScaled(w);
            const webp = scaled.toDataURL('image/webp', 0.8);
            if (webp.startsWith('data:image/webp') && webp.length <= MAX_BASE64_CHARS) return webp;
            const png = scaled.toDataURL('image/png');
            if (png.length <= MAX_BASE64_CHARS) return png;
        }
    } else if (isBackground) {
        for (const step of [
            { w: 1024, q: 0.7 },
            { w: 900, q: 0.65 },
            { w: 800, q: 0.6 },
            { w: 640, q: 0.55 },
            { w: 520, q: 0.5 }
        ]) {
            const scaled = drawScaled(step.w);
            const jpg = scaled.toDataURL('image/jpeg', step.q);
            if (jpg.length <= MAX_BASE64_CHARS) return jpg;
        }
    }

    return base64;
}

$(document).off('click.btnCrop', '#btnCrop').on('click.btnCrop', '#btnCrop', () => {
    if (!cropper || !cropTarget) return;

    const sourceCanvas = cropper.getCroppedCanvas();
    if (!sourceCanvas) return;

    const isLogo = cropTarget.includes('logo');
    const isBackground = ['background_landing', 'background_login', 'background_kartu', 'background_belakang'].includes(cropTarget);
    const base64 = encodeCanvasUnderLimit(sourceCanvas, isLogo, isBackground);

    const mdlEl = document.getElementById('mdlCrop');
    if (mdlEl) {
        const modalInstance = bootstrap.Modal.getInstance(mdlEl) || bootstrap.Modal.getOrCreateInstance(mdlEl);
        modalInstance.hide();
    }
    try { cropper.destroy(); } catch (_) {}
    cropper = null;

    if (isLogo || isBackground) {
        // Logo & background pengaturan disimpan sebagai Base64 terkompresi agar dapat dibaca di versi offline & online
        $('#loader').addClass('hidden');
        if (cropTarget === 'logo_instansi') {
            $('#logo_instansi').val(base64).data('deleted', false);
            $('#prevLogoInstansi').attr('src', base64).removeClass('hidden');
        }
        if (cropTarget === 'logo_sekolah') {
            $('#logo_sekolah').val(base64).data('deleted', false);
            $('#prevLogoSekolah').attr('src', base64).removeClass('hidden');
        }
        if (cropTarget === 'background_landing') {
            $('#background_landing').val(base64).data('deleted', false);
            $('#prev_bg_landing').attr('src', base64).removeClass('hidden');
            bgLandingUrl = 'url(' + base64 + ')';
            applyLoginPageBackground();
        }
        if (cropTarget === 'background_login') {
            $('#background_login').val(base64).data('deleted', false);
            $('#prev_bg_login').attr('src', base64).removeClass('hidden');
            bgLoginUrl = 'url(' + base64 + ')';
            applyLoginPageBackground();
        }
        if (cropTarget === 'background_kartu') {
            $('#background_kartu').val(base64).data('deleted', false);
            $('#prev_bg_kartu').attr('src', base64).removeClass('hidden');
        }
        if (cropTarget === 'background_belakang') {
            $('#background_belakang').val(base64).data('deleted', false);
            $('#prev_bg_belakang').attr('src', base64).removeClass('hidden');
        }
        return;
    }

    $('#loader').removeClass('hidden');

    // ==========================================
    // LOGIKA PENAMAAN FILE OTOMATIS (FOTO SISWA)
    // ==========================================
    let namaFile = "img_" + Date.now(); // Nama bawaan jika gagal deteksi
    let ekstensi = ".jpg";

    if (cropTarget === 'du_masuk') {
        // Tarik data dari form Daftar Ulang
        let nisn = $('#du_nisn').val().trim() || "NONISN";
        let nama = $('#du_nama').val().trim() || "NONAMA";
        let cleanNama = nama.replace(/[^a-zA-Z0-9]/g, "_"); // Bersihkan simbol aneh
        namaFile = `${nisn}_PASFOTO_${cleanNama}${ekstensi}`;

    } else if (cropTarget === 'masuk' || cropTarget === 'keluar') {
        // Tarik data dari form Input Siswa (Admin)
        let f = document.forms['frmSiswa'];
        let nisn = f.nisn.value.trim() || f.nis.value.trim() || "NONISN";
        let nama = f.nama.value.trim() || "NONAMA";
        let cleanNama = nama.replace(/[^a-zA-Z0-9]/g, "_");
        let ket = cropTarget === 'masuk' ? 'MASUK' : 'KELUAR';
        namaFile = `${nisn}_PASFOTO_${ket}_${cleanNama}${ekstensi}`;
    }
    // ==========================================

    // PENGARAHAN FOLDER DRIVE:
    // Jika targetnya 'du_masuk' (Foto Daftar Ulang), arahkan ke folder 'spmb_foto'
    const t = cropTarget === 'du_masuk' ? 'spmb_foto' : 'foto';

    // Kirim beserta nama file yang sudah diracik
    callAPI('uploadBase64', { base64: base64, filename: namaFile, folderType: t }).then(res => {
        if (res.status === 'success') {
            const imgId = res.id;
            callAPI('getImage', { id: imgId }).then(b64 => {
                $('#loader').addClass('hidden');

                if (cropTarget === 'masuk') { $('#id_foto_masuk').val(imgId); $('#prev_masuk').attr('src', b64).removeClass('hidden'); }
                if (cropTarget === 'keluar') { $('#id_foto_keluar').val(imgId); $('#prev_keluar').attr('src', b64).removeClass('hidden'); }

                // Masukkan ID gambar ke input hidden Daftar Ulang dan tampilkan fotonya
                if (cropTarget === 'du_masuk') {
                    $('#du_id_foto_masuk').val(imgId);
                    $('#du_prev_masuk').attr('src', b64).removeClass('hidden');
                }
            });
        } else {
            $('#loader').addClass('hidden');
            showCoolAlert('Gagal', 'Gagal mengupload gambar', 'error');
        }
    }).catch(() => {
        $('#loader').addClass('hidden');
        showCoolAlert('Gagal', 'Gagal mengupload gambar', 'error');
    });
});

function kirimChat() {
    const input = $('#chatInput');
    const pesan = input.val().trim();
    if (!pesan) return;

    // Tampilkan pesan yang diketik user (Bubble kanan)
    $('#chatBody').append(`<div class="mb-2 text-end"><span class="badge bg-primary p-2 rounded-3 text-wrap text-start" style="max-width: 80%; line-height: 1.4;">${pesan}</span></div>`);
    input.val('');

    // Tampilkan indikator loading (Bubble kiri)
    const idLoading = 'load-' + Date.now();
    $('#chatBody').append(`<div id="${idLoading}" class="mb-2 text-start"><span class="badge bg-secondary p-2 rounded-3 text-wrap"><div class="spinner-border spinner-border-sm"></div> Memikirkan jawaban...</span></div>`);
    $('#chatBody').scrollTop($('#chatBody')[0].scrollHeight); // Auto-scroll ke bawah

    // Kirim hanya teks pesan ke backend (Backend yang akan mencari datanya)
    callAPI('askChatbot', {
        pesan: pesan
    }).then(res => {
        $('#' + idLoading).remove();
        if (res.status === 'success') {
            const htmlText = res.hasilAI.replace(/\n/g, '<br>').replace(/\*\*(.*?)\*\*/g, '<b>$1</b>');
            $('#chatBody').append(`<div class="mb-2 text-start"><span class="badge bg-info text-dark p-2 rounded-3 text-wrap text-start" style="max-width: 80%; line-height: 1.4; white-space: normal;">${htmlText}</span></div>`);
        } else {
            $('#chatBody').append(`<div class="mb-2 text-start"><span class="badge bg-danger p-2 rounded-3 text-wrap text-start" style="max-width: 80%; line-height: 1.4; white-space: normal;">Waduh, gagal: ${res.message}</span></div>`);
        }
        $('#chatBody').scrollTop($('#chatBody')[0].scrollHeight);
    });
}

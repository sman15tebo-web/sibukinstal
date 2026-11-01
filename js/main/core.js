// ==========================================
// KONFIGURASI MULTI-TENANT (BANYAK SEKOLAH)
// ==========================================

// 1. Buat "Buku Alamat" untuk masing-masing sekolah
const tenantConfig = {
    "demo": "https://script.google.com/macros/s/AKfycbyfNXMoC89bUeloyLiJMmN34pCKZFIYC-cF-zA4IP1eqTKZj8GzuiSI3lLhM5fYPS_7/exec",
    "sman15tebo": "https://script.google.com/macros/s/AKfycbwIBecBNAosHeM88N8tzdKxMFZFr7wN89Wfb1fB6B-6sZ2AJ_C2VQncJV1lmsLo72qQ/exec",

    "smkn1kotaternate": "https://script.google.com/macros/s/AKfycbypfnJFHWwdwRwigATVcTKO67PbJYO5MtfeqFPDZKiPNjC0SmCH31VF3LFajev1R3Gd/exec",
    "sman1tebo": "https://script.google.com/macros/s/AKfycbwzNOc-i5QlZwYOEtC9SwHFKo4fQsOiZohQdKT02UxQGYNUv3nYt1Kvv2NfcQDMex5ESw/exec",
    "sman2tebo": "https://script.google.com/macros/s/AKfycbyAD3I6tjiBq6vjZx_GcdCKP1m5yWAkdNcVZ5cYuRo2SMUsJz6qtU6kTvvbPlVY9eMs/exec",
    "sman5tebo": "https://script.google.com/macros/s/AKfycbwB_-EO-r-d6NlIKzGaJrjK-vtgaOTsRxGuppu3m1cFb53z1RShsV8ZUQ2ovikr2_qgrw/exec",
    "sman17tebo": "https://script.google.com/macros/s/AKfycbwX51-G3e3Mvy-SUxElwJTSTgyPitdLH84GRLyxuCe0xWXmh_uQVEnX6ereTyiCwl4GKQ/exec",
    "sman19tebo": "https://script.google.com/macros/s/AKfycbx6YkigF-4fDvb5G_gD7Rq1kS08peRgXHp9Poh1_q2-y-aqrEIQxYQz9Nmf31ZXFIca/exec",
    "smkn1tebo": "https://script.google.com/macros/s/",
    "smkn2tebo": "https://script.google.com/macros/s/AKfycbz5dJIjry3slK-tEt1VU5APjGi2mSacXovWdXq_e7Fww1DXyswL6cbC8RbaRhKdj461/exec",
    "slbntebo": "https://script.google.com/macros/s/AKfycbyqbdj7AnTv7ft_DaWwRZuDQMjkt7Yekvs7O8wwqghu5hCLYwMGwng7TgG5SknXzKcuYQ/exec",
    "sekolah1..": ""
    // Tambahkan sekolah lain di sini sesuai kebutuhan
};

// ==========================================
// FUNGSI PENGACAK KEAMANAN (XOR CIPHER)
// ==========================================

// HELPER: Mencegah injeksi script jahat (XSS) pada tampilan HTML
function escapeHTML(str) {
    if (!str) return '';
    return String(str).replace(/[&<>"']/g, function (m) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[m];
    });
}


const KUNCI_SESI = "S1M1ST3RB1N_S3CUR3_2026"; // Jangan beritahu siapapun

function enkripsiLokal(teks) {
    let result = "";
    for (let i = 0; i < teks.length; i++) {
        result += String.fromCharCode(teks.charCodeAt(i) ^ KUNCI_SESI.charCodeAt(i % KUNCI_SESI.length));
    }
    return btoa(result);
}

function dekripsiLokal(b64) {
    if (!b64) return "";
    try {
        let teks = atob(b64);
        let result = "";
        for (let i = 0; i < teks.length; i++) {
            result += String.fromCharCode(teks.charCodeAt(i) ^ KUNCI_SESI.charCodeAt(i % KUNCI_SESI.length));
        }
        return result;
    } catch (e) {
        return b64;
    }
}


// 2. Deteksi Tenant & Backend API Secara Dinamis (Support ?id= dan ?exec=)
const urlParams = new URLSearchParams(window.location.search);
let tenantId = urlParams.get('id');
let API_URL = "";

// Prioritas 1: Parameter URL ?exec=...
const paramExec = urlParams.get('exec');
if (paramExec && paramExec.startsWith('http')) {
    API_URL = paramExec;
    localStorage.setItem('sibukinstal_custom_api_url', paramExec);
}

// Prioritas 2: Parameter URL ?id=... (Eksplisit diutamakan sebelum cache)
if (!API_URL && tenantId) {
    const cleanId = tenantId.trim().toLowerCase();
    if (tenantConfig[cleanId]) {
        API_URL = tenantConfig[cleanId];
        localStorage.setItem('sibukinstal_tenant_id', cleanId);
    }
}

// Prioritas 2b: Deteksi dari Hostname / Domain Web (misal: sibukinstal.sman15tebo.sch.id)
if (!API_URL && typeof window !== 'undefined' && window.location && window.location.hostname) {
    const host = window.location.hostname.toLowerCase();
    for (const key of Object.keys(tenantConfig)) {
        if (host.includes(key)) {
            API_URL = tenantConfig[key];
            tenantId = key;
            localStorage.setItem('sibukinstal_tenant_id', key);
            break;
        }
    }
}

// Prioritas 3: Link Exec Kustom dari Pengaturan Sekolah (jika pernah disimpan)
if (!API_URL) {
    const customUrl = localStorage.getItem('sibukinstal_custom_api_url') || localStorage.getItem('customSyncLink');
    if (customUrl && customUrl.startsWith('http')) {
        API_URL = customUrl;
    }
}

// Prioritas 4: Deteksi dari Memori Tenant Terakhir / Nama Sekolah
if (!API_URL) {
    const savedTenant = localStorage.getItem('sibukinstal_tenant_id');
    if (savedTenant && tenantConfig[savedTenant]) {
        API_URL = tenantConfig[savedTenant];
    } else {
        try {
            const conf = JSON.parse(localStorage.getItem('globalConf') || localStorage.getItem('appSettings') || '{}');
            const schoolName = conf.namaSekolah || conf.nama_sekolah || '';
            if (schoolName) {
                const slug = schoolName.toLowerCase().replace(/[^a-z0-9]/g, '');
                if (tenantConfig[slug]) {
                    API_URL = tenantConfig[slug];
                    localStorage.setItem('sibukinstal_tenant_id', slug);
                }
            }
        } catch (e) { }
    }
}

// Prioritas 5: Fallback Default (Prioritas sman15tebo lalu demo)
if (!API_URL) {
    API_URL = tenantConfig[tenantId] || tenantConfig["sman15tebo"] || tenantConfig["demo"] || Object.values(tenantConfig)[0] || "";
}

if (!API_URL) {
    document.addEventListener("DOMContentLoaded", function () {
        document.body.innerHTML = `
            <div style="display:flex; justify-content:center; align-items:center; height:100vh; background:#f0f2f5; font-family:sans-serif;">
                <div style="text-align:center; padding:30px; background:white; border-radius:10px; box-shadow:0 4px 10px rgba(0,0,0,0.1);">
                    <h2 style="color:#e74a3b;">Akses Ditolak!</h2>
                    <p style="color:#858796;">Link sekolah tidak valid atau URL backend belum ditentukan.</p>
                </div>
            </div>`;
    });
    throw new Error("Tenant ID atau Backend URL tidak ditemukan.");
}

// ==========================================
// VARIABEL GLOBAL APLIKASI
// ==========================================
let globalConf = {}; // Menampung pengaturan sekolah
let globalSiswa = [], curSmt = 1, cropper, cropTarget, curPage = 'dash';
let globalMapel = [];
let chartGender, chartStatus, chartAlumni;
let globalDaftarUlang = [];
let globalKelas = [];
let scanner = null;

function getSessionStorageKey() {
    if (window.SibukSession && typeof window.SibukSession.resolveSessionStorageKey === 'function') {
        return window.SibukSession.resolveSessionStorageKey(tenantId);
    }

    const activeTenant = (typeof tenantId !== 'undefined' && tenantId && String(tenantId).trim())
        || (localStorage.getItem('sibukinstal_tenant_id') || '').trim()
        || 'demo';
    return `simisterbin_session_${activeTenant}`;
}

// ==========================================
// DETEKSI LINGKUNGAN: DESKTOP (OFFLINE) vs BROWSER (ONLINE)
// Flag ini digunakan di seluruh aplikasi untuk menyesuaikan perilaku
// ==========================================
const IS_DESKTOP = (typeof window !== 'undefined' && typeof window.electronAPI !== 'undefined');

// ==========================================
// FUNGSI PUSAT PENGHUBUNG FRONTEND KE BACKEND
// Otomatis menggunakan jalur yang benar sesuai lingkungan
// ==========================================
async function callAPI(actionName, payloadData = {}) {

    // ===== MODE DESKTOP (Offline — Electron + SQLite) =====
    if (IS_DESKTOP) {
        // Intercept: ambil gambar dari storage lokal
        if (actionName === 'getImage') {
            if (!payloadData.id) return null;
            if (String(payloadData.id).startsWith('data:')) return payloadData.id;
            try {
                const localFoto = await window.electronAPI.getFoto(payloadData.id);
                if (localFoto) return localFoto;
            } catch (e) { }
            // Mencegah loading muter-muter saat buka halaman versi desktop:
            // Jangan fallback ke online (GAS) jika tidak ada di lokal.
            return null;
        }
        // Intercept: simpan gambar ke folder lokal
        if (actionName === 'uploadBase64') {
            const { base64, filename, folderType, nis } = payloadData;
            const nisKey = nis || (filename ? filename.split('_')[1] : null) || 'unknown';
            const tipe = folderType || 'foto';
            try {
                const result = await window.electronAPI.saveFoto(base64, nisKey, tipe, filename);
                return result.status === 'success' ? { status: 'success', id: result.path } : { status: 'error', message: result.message || 'Gagal menyimpan file lokal.' };
            } catch (e) { return { status: 'error', message: e.message || 'Gagal menyimpan file lokal.' }; }
        }
        // Intercept: kartu pelajar — ambil beberapa gambar sekaligus
        if (actionName === 'getSemuaGambarKartu') {
            const { fotoId, bgDepan, bgBelakang, logoInstansi, logoSekolah } = payloadData;
            const getImg = async (p) => {
                if (!p) return '';
                if (String(p).startsWith('data:')) return p;
                try {
                    const lf = await window.electronAPI.getFoto(p);
                    if (lf) return lf;
                    return `https://lh3.googleusercontent.com/d/${p}`;
                } catch (e) { return `https://lh3.googleusercontent.com/d/${p}`; }
            };
            return {
                foto: await getImg(fotoId), bg1: await getImg(bgDepan), bg2: await getImg(bgBelakang),
                logo1: await getImg(logoInstansi), logo2: await getImg(logoSekolah)
            };
        }
        // Semua action lain → SQLite via Electron IPC
        if (actionName !== 'getImage') {
            try {
                return await window.electronAPI.dbAction(actionName, payloadData);
            } catch (error) {
                console.error('[DESKTOP] callAPI error:', actionName, error);
                return { status: 'error', message: error.message || 'Terjadi kesalahan pada database lokal.' };
            }
        }
    }

    // ===== MODE ONLINE (Browser — Google Apps Script) ATAU FALLBACK DESKTOP =====
    window.memoryImgCache = window.memoryImgCache || {};
    if (actionName === 'getImage' && payloadData && payloadData.id) {
        let imgId = String(payloadData.id);
        if (imgId.startsWith('data:')) return imgId;
        if (imgId.startsWith('http')) return imgId; // Already a URL

        // CACHING SEMENTARA (HANYA SELAMA HALAMAN DIBUKA)
        if (window.memoryImgCache[imgId]) return window.memoryImgCache[imgId];
    }

    // Kompatibilitas Backend: pastikan aksi getStudents selalu menyertakan { page: 1 }
    // agar backend Google Apps Script lama yang membaca data.page tidak melempar TypeError
    if (actionName === 'getStudents') {
        payloadData = Object.assign({ page: 1 }, payloadData || {});
    }

    // Aksi BACA aman diulang & digabung. Aksi TULIS tidak pernah diulang otomatis (hindari data dobel).
    const bolehUlang = API_AKSI_BACA.has(actionName);
    let kunciGabung = null;
    if (bolehUlang && actionName !== 'login') {
        try { kunciGabung = actionName + '|' + JSON.stringify(payloadData || {}); } catch (_) { kunciGabung = null; }
    }
    if (kunciGabung && API_INFLIGHT.has(kunciGabung)) return API_INFLIGHT.get(kunciGabung);

    const job = (async () => {
        const maxPercobaan = bolehUlang ? 2 : 1;
        let hasil;
        for (let percobaan = 1; percobaan <= maxPercobaan; percobaan++) {
            hasil = await callAPIOnline(actionName, payloadData);
            if (!hasil || !hasil.transient) return hasil;
            if (percobaan < maxPercobaan) {
                console.warn(`[API] ${actionName} gagal sementara (${hasil.message}). Mengulang otomatis...`);
                await new Promise(r => setTimeout(r, 1500));
            }
        }
        return hasil;
    })();

    if (kunciGabung) {
        API_INFLIGHT.set(kunciGabung, job);
        job.finally(() => API_INFLIGHT.delete(kunciGabung)).catch(() => { });
    }
    return job;
}

// Aksi yang hanya membaca data (aman diulang otomatis & digabung bila identik)
const API_AKSI_BACA = new Set([
    'login', 'getSettings', 'getStudents', 'getDashboardStats', 'getMapel', 'getKelas', 'getImage',
    'getTahunAlumni', 'getAlumniByTahun', 'getTahunKeluar', 'getSiswaKeluarByTahun', 'getDaftarUlang',
    'getNilaiSiswa', 'getTranskripData', 'getAllNilaiBySemester', 'getRataRataNilai',
    'getSemuaGambarKartu', 'cekValidasiSiswa', 'cariDataAlumniPublic', 'setupDatabase'
]);
const API_INFLIGHT = new Map();

// Batas waktu per aksi (ms). Google Apps Script bisa butuh 10-30 detik saat "cold start" atau data besar.
function getApiTimeout(actionName) {
    if (actionName === 'login') return 60000;
    const berat = ['getStudents', 'getAlumniByTahun', 'getSiswaKeluarByTahun', 'getDashboardStats', 'getRataRataNilai',
        'getAllNilaiBySemester', 'importSiswaBulk', 'importMapelBulk', 'importNilaiBulk', 'importNilaiSiswa', 'createPDFBiodata',
        'createPDFTranskrip', 'extractDataOCR', 'askChatbot', 'analyzeNilai', 'uploadBase64', 'hapusSemuaSiswa',
        'backupDatabase', 'arsipkanLulusan'];
    return berat.includes(actionName) ? 180000 : 90000;
}

// Satu kali percobaan permintaan ke Google Apps Script.
// Kegagalan sementara (timeout / jaringan / GAS membalas halaman HTML) diberi flag transient:true.
async function callAPIOnline(actionName, payloadData) {
    const sessionKey = getSessionStorageKey();
    let session = localStorage.getItem(sessionKey);
    let tokenAman = "";
    let userAktif = "";

    if (session) {
        try {
            let parsedObj = JSON.parse(dekripsiLokal(session));
            const sanitizer = (typeof sanitizeSessionPayload === 'function')
                ? sanitizeSessionPayload
                : (window.SibukSession && typeof window.SibukSession.sanitizeSessionPayload === 'function'
                    ? window.SibukSession.sanitizeSessionPayload
                    : (s => s));
            let parsed = sanitizer(parsedObj);
            tokenAman = parsed.token || "";
            userAktif = parsed.username || "";
            if (parsed.password) delete parsed.password;
        } catch (e) {
            console.warn('[Session] Gagal membaca sesi yang tersimpan:', e.message);
            localStorage.removeItem(sessionKey);
        }
    }

    const controller = new AbortController();
    // Timer mencakup fetch DAN pembacaan body respons (sebelumnya body bisa menggantung tanpa batas)
    const timeoutId = setTimeout(() => controller.abort(), getApiTimeout(actionName));

    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain' },
            body: JSON.stringify({ action: actionName, token: tokenAman, username: userAktif, data: payloadData }),
            signal: controller.signal
        });
        const resText = await response.text();
        let resData;
        try {
            resData = JSON.parse(resText);
            if (actionName === 'getImage' && typeof resData === 'string' && resData.length > 50) {
                window.memoryImgCache = window.memoryImgCache || {};
                if (payloadData && payloadData.id) window.memoryImgCache[payloadData.id] = resData;
            }
        } catch (_) {
            if (actionName === 'getImage') {
                if (resText.length > 50 && !resText.includes('<html')) { // Pastikan bukan halaman error
                    window.memoryImgCache = window.memoryImgCache || {};
                    if (payloadData && payloadData.id) window.memoryImgCache[payloadData.id] = resText;
                }
                return resText; // Return base64 string directly
            }
            // Server mengembalikan bukan JSON (halaman error Google: kuota / server sibuk / deploy bermasalah)
            console.error('[API] Response bukan JSON:', actionName, resText ? resText.substring(0, 300) : '(kosong)');
            return {
                status: "error",
                transient: true,
                message: "Server Google sedang sibuk atau tidak merespons dengan benar. Tunggu beberapa saat lalu coba lagi."
            };
        }

        // --- DEKRIPSI OTOMATIS DATA SENSITIF ONLINE DIHAPUS KARENA SUDAH DI-HANDLE BACKEND ---
        if (resData && resData.status === 'expired') {
            if (window.SibukSession && typeof window.SibukSession.clearSessionStorage === 'function') {
                window.SibukSession.clearSessionStorage(tenantId);
            } else {
                localStorage.removeItem(getSessionStorageKey());
            }
            showCoolAlert('Sesi Berakhir', resData.message || 'Sesi Anda telah berakhir, silakan login ulang.', 'warning');
            setTimeout(() => location.reload(), 2000);
            return { status: 'error', message: 'Sesi berakhir.' };
        }
        return resData;
    } catch (error) {
        if (error && error.name === 'AbortError') {
            console.warn('[API] Request timeout:', actionName);
            return { status: "error", transient: true, message: "Server tidak merespons tepat waktu. Server Google mungkin sedang sibuk — silakan coba lagi sebentar lagi." };
        }
        return { status: "error", transient: true, message: "Gagal terhubung ke server database. Periksa koneksi internet Anda." };
    } finally {
        clearTimeout(timeoutId);
    }
}

let isLoginInProgress = false;

function doLogin(e) {
    if (e && typeof e.preventDefault === 'function') e.preventDefault();
    if (isLoginInProgress) return false;

    const uInput = String($('#u').val() || '').trim();
    const pInput = String($('#p').val() || '').trim();

    if (!uInput || !pInput) {
        showCoolAlert('Peringatan', 'Username dan password wajib diisi.', 'warning');
        return false;
    }

    isLoginInProgress = true;
    const btnSubmit = $('#viewLogin button[type="submit"]');
    const originalBtnText = btnSubmit.html();
    btnSubmit.prop('disabled', true).html('<span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>Memverifikasi...');

    $('#loader').removeClass('hidden');
    $('#loaderText').text('Menghubungkan ke server...');

    callAPI('login', { u: uInput, p: pInput }).then(res => {
        $('#loader').addClass('hidden');
        btnSubmit.prop('disabled', false).html(originalBtnText);
        isLoginInProgress = false;

        if (res && res.status === 'success') {
            try {
                // Simpan TOKEN dan USERNAME ke Local Storage tanpa password mentah
                const sessionPayload = {
                    role: res.role || 'admin',
                    nama: res.nama || res.username || 'User',
                    token: res.token || '',
                    username: res.username || uInput,
                    data: res.data || null
                };

                const serializer = (typeof serializeSessionPayload === 'function')
                    ? serializeSessionPayload
                    : (window.SibukSession && typeof window.SibukSession.serializeSessionPayload === 'function'
                        ? window.SibukSession.serializeSessionPayload
                        : (s => JSON.stringify(s)));

                const rawData = serializer(sessionPayload);
                const sessionKey = getSessionStorageKey();

                if (window.SibukSession && typeof window.SibukSession.clearSessionStorage === 'function') {
                    window.SibukSession.clearSessionStorage(tenantId);
                }
                localStorage.setItem(sessionKey, enkripsiLokal(rawData));
                if (tenantId) localStorage.setItem('sibukinstal_tenant_id', tenantId);
            } catch (err) {
                console.warn('[Login] Gagal menyimpan sesi lokal:', err);
            }

            restoreSession(res);
        } else {
            showCoolAlert('Gagal Masuk', (res && res.message) ? res.message : 'Username atau password salah.', 'error');
        }
    }).catch(err => {
        $('#loader').addClass('hidden');
        btnSubmit.prop('disabled', false).html(originalBtnText);
        isLoginInProgress = false;
        showCoolAlert('Gagal Masuk', err.message || 'Terjadi kesalahan jaringan.', 'error');
    });

    return false;
}

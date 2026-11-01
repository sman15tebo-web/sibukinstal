// ==========================================
// ==========================================
// ==========================================
// ==========================================
// ==========================================
// LOGIKA MENU LAPORAN & UNDUH EXCEL MURNI (DITAMBAHKAN DENGAN AMAN)
// ==========================================

let lapCurrentPage = 1;
let lapDataLoaded = false;
let lapDataLoading = false;
let lapOnlineFullSynced = false;
let lapLoadPromise_ = null;
let globalLaporanSiswa = [];

function resolveNisNisnLaporan_(row) {
    const clean = (v) => {
        const t = String(v === null || v === undefined ? '' : v).trim().replace(/^'+|'+$/g, '').trim();
        if (!t || t === '-' || t.toLowerCase() === 'null' || t.toLowerCase() === 'undefined') return '';
        return t;
    };
    const nis = clean(row && row[0]);
    const nisn = clean(row && row[1]);
    const actionKey = String((row && row[0]) !== undefined && (row && row[0]) !== null ? row[0] : '').trim();
    return { nis, nisn, hasRealNis: Boolean(nis), actionKey };
}

function normalizeLaporanStudentRow_(row) {
    if (!Array.isArray(row)) return null;
    const copy = row.slice();
    const status = String(copy[31] || '').trim().toLowerCase();
    const tanggal = String(copy[32] || '').trim().toLowerCase();
    if (/^\d{4}([-/]\d{2,4})?$/.test(status) && ['aktif', 'lulus', 'keluar'].includes(tanggal)) {
        const realStatus = copy[32];
        copy[32] = copy[31];
        copy[31] = realStatus;
    }
    return copy;
}

function mergeUniqueStudentRows_(...lists) {
    const byKey = new Map();
    let fallbackIdx = 0;

    lists.forEach(list => {
        if (!Array.isArray(list)) return;
        list.forEach(rawRow => {
            const row = normalizeLaporanStudentRow_(rawRow);
            if (!row) return;
            const info = resolveNisNisnLaporan_(row);
            if (!info.nis && !info.nisn && !String(row[2] || '').trim()) return;

            let key = '';
            if (info.nis) {
                key = 'nis:' + (info.nis.replace(/^0+(?=\d)/, '') || info.nis);
            } else if (info.nisn && !/^0+$/.test(info.nisn)) {
                key = 'nisn:' + (info.nisn.replace(/^0+(?=\d)/, '') || info.nisn);
            } else {
                key = 'idx:' + (fallbackIdx++);
            }

            if (!byKey.has(key)) {
                byKey.set(key, row);
            } else {
                const existing = byKey.get(key);
                const maxLen = Math.max(existing.length, row.length);
                for (let c = 0; c < maxLen; c++) {
                    const curVal = existing[c];
                    if ((curVal === undefined || curVal === null || String(curVal).trim() === '') && row[c] !== undefined && row[c] !== null && String(row[c]).trim() !== '') {
                        existing[c] = row[c];
                    }
                }
            }
        });
    });

    return Array.from(byKey.values());
}

function getLaporanSourceRows_() {
    if (Array.isArray(globalLaporanSiswa) && globalLaporanSiswa.length > 0) {
        return globalLaporanSiswa;
    }
    if (IS_DESKTOP && Array.isArray(globalSiswa) && globalSiswa.length > 0) {
        return globalSiswa;
    }
    return [];
}

function syncLaporanFromGlobalSiswa_() {
    if (!Array.isArray(globalSiswa) || globalSiswa.length === 0) return;
    // Di mode Online, jangan otomatis mengisi Tab Nomor Induk kecuali pengguna sudah menekan "Tampilkan Semua Data"
    if (!IS_DESKTOP && !lapDataLoaded) return;
    globalLaporanSiswa = mergeUniqueStudentRows_(globalLaporanSiswa, globalSiswa);
    if (globalLaporanSiswa.length > 0) {
        lapDataLoaded = true;
        $('#btnMuatLaporan, #btnTampilkanNomorInduk')
            .prop('disabled', false)
            .html('<i class="bi bi-arrow-clockwise"></i> Muat Ulang Data');
    }
    if (typeof document !== 'undefined' && document.getElementById('tbodyLapPreviewSiswa')) {
        onLapTipeChange();
    }
}

async function muatDataLaporan(forceReload = false, options = {}) {
    const isForce = (forceReload === true);
    const isSilent = !!(options && options.silent);

    if (lapDataLoading && lapLoadPromise_) {
        return lapLoadPromise_;
    }

    if (!isForce && lapDataLoaded && globalLaporanSiswa.length > 0 && (IS_DESKTOP || lapOnlineFullSynced)) {
        renderLapPreview();
        return;
    }

    // Tampilkan data yang sudah ada di globalSiswa secara instan jika di Desktop (Offline)
    if (IS_DESKTOP && !isForce && Array.isArray(globalSiswa) && globalSiswa.length > 0) {
        globalLaporanSiswa = mergeUniqueStudentRows_(globalLaporanSiswa, globalSiswa);
        lapDataLoaded = globalLaporanSiswa.length > 0;
        onLapTipeChange();
        $('#btnMuatLaporan, #btnTampilkanNomorInduk')
            .prop('disabled', false)
            .html('<i class="bi bi-arrow-clockwise"></i> Muat Ulang Data');
        return;
    }

    lapDataLoading = true;
    $('#btnMuatLaporan, #btnTampilkanNomorInduk')
        .prop('disabled', true)
        .html('<i class="bi bi-hourglass-split"></i> Memuat...');

    if (getLaporanSourceRows_().length === 0) {
        const loadingTr = '<tr><td colspan="11" class="text-center text-muted py-5"><div class="spinner-border text-primary spinner-border-sm me-2"></div>Memuat data Nomor Induk...</td></tr>';
        $('#tbodyLapPreviewSiswa').html(loadingTr);
        $('#tbodyLapPreviewLeger').html(loadingTr);
    }

    if (!isSilent) {
        $('#loader').removeClass('hidden');
        $('#loaderText').text('Memuat seluruh data Nomor Induk...');
    }

    lapLoadPromise_ = (async () => {
        try {
            const reqPayload = isForce ? { page: 1, fresh: true } : { page: 1 };
            if (IS_DESKTOP) {
                const activeRes = await callAPI('getStudents', reqPayload);
                if (activeRes && activeRes.status === 'error') {
                    throw new Error(activeRes.message || 'Gagal memuat data siswa dari database lokal.');
                }
                const list = activeRes && Array.isArray(activeRes.data)
                    ? activeRes.data
                    : (Array.isArray(activeRes) ? activeRes : []);
                globalLaporanSiswa = mergeUniqueStudentRows_(list);
                globalSiswa = globalLaporanSiswa.slice();
            } else {
                const [activeSettled, alumniSettled, keluarSettled] = await Promise.allSettled([
                    callAPI('getStudents', reqPayload),
                    callAPI('getAlumniByTahun', { tahun: '' }),
                    callAPI('getSiswaKeluarByTahun', { tahun: '' })
                ]);

                const activeRes = activeSettled.status === 'fulfilled' ? activeSettled.value : null;
                const alumniRes = alumniSettled.status === 'fulfilled' ? alumniSettled.value : null;
                const keluarRes = keluarSettled.status === 'fulfilled' ? keluarSettled.value : null;

                const extractList = (res) => (res && Array.isArray(res.data)) ? res.data : (Array.isArray(res) ? res : []);
                const activeList = extractList(activeRes);
                const alumniList = extractList(alumniRes);
                const keluarList = extractList(keluarRes);

                const activeFailed = !activeRes || activeRes.status === 'error';
                if (activeFailed && alumniList.length === 0 && keluarList.length === 0 && (isForce || getLaporanSourceRows_().length === 0)) {
                    throw new Error((activeRes && activeRes.message) || 'Gagal memuat data siswa dari server.');
                }

                const merged = mergeUniqueStudentRows_(
                    activeList,
                    alumniList,
                    keluarList,
                    isForce ? [] : globalSiswa
                );
                globalLaporanSiswa = merged;
                if (merged.length > 0 || isForce) {
                    globalSiswa = merged.slice();
                }
                if (!activeFailed || merged.length > 0) {
                    lapOnlineFullSynced = true;
                }
            }

            lapDataLoaded = true;
            onLapTipeChange();
            $('#btnMuatLaporan, #btnTampilkanNomorInduk')
                .prop('disabled', false)
                .html('<i class="bi bi-arrow-clockwise"></i> Muat Ulang Data');
        } catch (error) {
            console.error('Gagal memuat Nomor Induk / laporan:', error);
            lapDataLoaded = globalLaporanSiswa.length > 0;
            $('#btnMuatLaporan, #btnTampilkanNomorInduk')
                .prop('disabled', false)
                .html('<i class="bi bi-cloud-download"></i> Tampilkan Semua Data');
            renderLapPreview();
            if (!isSilent) {
                Swal.fire('Gagal', error.message || 'Data laporan belum dapat dimuat. Silakan coba lagi.', 'error');
            }
        } finally {
            lapDataLoading = false;
            lapLoadPromise_ = null;
            if (!isSilent) {
                $('#loader').addClass('hidden');
                $('#loaderText').text('Memuat Data...');
            }
        }
    })();

    return lapLoadPromise_;
}

function onLapTipeChange() { lapCurrentPage = 1;
    const tipe = $('#lapTipeSiswa').val() || 'Semua Siswa';
    const filterContainer = $('#lapKolomKeduaContainer');
    const lapLabelKedua = $('#lapLabelKedua');
    const lapFilterKedua = $('#lapFilterKedua');
    const urutanContainer = $('#lapKolomUrutanContainer');
    const source = getLaporanSourceRows_();

    lapFilterKedua.empty();

    if (tipe === 'Semua Siswa') {
        filterContainer.hide();
        urutanContainer.show();
    } else if (tipe === 'Siswa Aktif') {
        filterContainer.show();
        lapLabelKedua.text('Pilih Kelas');
        lapFilterKedua.append('<option value="">Semua Kelas</option>');
        
        let arrKelas = [];
        source.forEach(s => {
            let status = String(s[31] || '').trim().toLowerCase();
            if (status === 'aktif' && s[52]) {
                let kls = String(s[52]).trim();
                if (kls !== '-' && kls !== '' && !arrKelas.includes(kls)) arrKelas.push(kls);
            }
        });
        arrKelas.sort();
        arrKelas.forEach(k => lapFilterKedua.append(`<option value="${k}">${k}</option>`));
        urutanContainer.show();
    } else if (tipe === 'Alumni') {
        filterContainer.show();
        lapLabelKedua.text('Tahun Lulus');
        lapFilterKedua.append('<option value="">Semua Tahun</option>');
        
        let arrTahun = [];
        source.forEach(s => {
            let status = String(s[31] || '').trim().toLowerCase();
            if (status === 'lulus' && s[32]) {
                let thn = String(s[32]).substring(0, 4);
                if (!arrTahun.includes(thn)) arrTahun.push(thn);
            }
        });
        arrTahun.sort((a,b)=>b-a);
        arrTahun.forEach(t => lapFilterKedua.append(`<option value="${t}">${t}</option>`));
        urutanContainer.show();
    } else if (tipe === 'Keluar/Mutasi') {
        filterContainer.show();
        lapLabelKedua.text('Tahun Keluar');
        lapFilterKedua.append('<option value="">Semua Tahun</option>');
        
        let arrTahun = [];
        source.forEach(s => {
            let status = String(s[31] || '').trim().toLowerCase();
            if (status !== 'aktif' && status !== 'lulus' && status !== '' && s[32]) {
                let thn = String(s[32]).substring(0, 4);
                if (!arrTahun.includes(thn)) arrTahun.push(thn);
            }
        });
        arrTahun.sort((a,b)=>b-a);
        arrTahun.forEach(t => lapFilterKedua.append(`<option value="${t}">${t}</option>`));
        urutanContainer.show();
    }
    
    if (lapDataLoaded || source.length > 0) renderLapPreview();
}

// Tambahkan event listener untuk memicu render preview saat filter kedua / urutan berubah
function bindLaporanEvents_() {
    $('#lapFilterKedua, #lapOrderBerdasarkan').off('change.laporan').on('change.laporan', function() {
        if (!lapDataLoaded && getLaporanSourceRows_().length === 0) {
            if (IS_DESKTOP) {
                muatDataLaporan(false, { silent: true });
            }
            return;
        }
        renderLapPreview();
    });
    
    // Render awal saat tab ditekan
    $('button[data-bs-toggle="pill"]').off('shown.bs.tab.laporan').on('shown.bs.tab.laporan', function (e) {
        let target = $(e.target).attr('data-bs-target');
        if (target === '#tabIndukNomor') {
            if (IS_DESKTOP) {
                if (!lapDataLoaded && getLaporanSourceRows_().length === 0) {
                    muatDataLaporan(false, { silent: true });
                } else {
                    renderLapPreview();
                }
            } else {
                if (lapDataLoaded) {
                    renderLapPreview();
                }
            }
            return;
        }
        if (target === '#tabLapSiswa' || target === '#tabLapLeger') {
            if (target === '#tabLapLeger') lapRataNilai = null; // muat ulang agar selalu terbaru
            renderLapPreview();
        }
    });
}

if (typeof window !== 'undefined' && window.HtmlIncludesLoadedDone) {
    bindLaporanEvents_();
} else if (typeof document !== 'undefined') {
    document.addEventListener('HtmlIncludesLoaded', bindLaporanEvents_);
}

function getFilteredDataLaporan() {
    const tipe = $('#lapTipeSiswa').val() || 'Semua Siswa';
    const filter2 = $('#lapFilterKedua').val();
    const urutan = $('#lapOrderBerdasarkan').val() || 'NIS_DESC';
    const searchText = String($('#nomorIndukCari').val() || '').trim().toLowerCase();
    const searchNisn = String($('#nomorIndukCariNisn').val() || '').trim().toLowerCase();

    const source = getLaporanSourceRows_();
    let data = [];
    if (tipe === 'Semua Siswa') {
        data = source.slice();
    } else if (tipe === 'Siswa Aktif') {
        data = source.filter(s => String(s[31] || '').trim().toLowerCase() === 'aktif');
        if (filter2) data = data.filter(s => String(s[52] || '').trim() === filter2);
    } else if (tipe === 'Alumni') {
        data = source.filter(s => String(s[31] || '').trim().toLowerCase() === 'lulus');
        if (filter2) data = data.filter(s => s[32] && String(s[32]).startsWith(filter2));
    } else if (tipe === 'Keluar/Mutasi') {
        data = source.filter(s => {
            let status = String(s[31] || '').trim().toLowerCase();
            return status !== 'aktif' && status !== 'lulus' && status !== '';
        });
        if (filter2) data = data.filter(s => s[32] && String(s[32]).startsWith(filter2));
    } else {
        data = source.slice();
    }

    if (urutan === 'NIS_ASC' || urutan === 'NIS_DESC') {
        data.sort((a, b) => {
            const infoA = resolveNisNisnLaporan_(a);
            const infoB = resolveNisNisnLaporan_(b);
            if (infoA.hasRealNis !== infoB.hasRealNis) {
                return infoA.hasRealNis ? -1 : 1;
            }
            if (!infoA.hasRealNis && !infoB.hasRealNis) {
                return String(a[2] || '').localeCompare(String(b[2] || ''));
            }
            return urutan === 'NIS_ASC'
                ? String(infoA.nis).localeCompare(String(infoB.nis), undefined, { numeric: true })
                : String(infoB.nis).localeCompare(String(infoA.nis), undefined, { numeric: true });
        });
    } else {
        data.sort((a, b) => String(a[2] || '').localeCompare(String(b[2] || '')));
    }
    if (searchText) {
        data = data.filter(row => {
            const info = resolveNisNisnLaporan_(row);
            return [info.nis, row[2]].some(value => String(value || '').toLowerCase().includes(searchText));
        });
    }
    if (searchNisn) {
        data = data.filter(row => {
            const info = resolveNisNisnLaporan_(row);
            return String(info.nisn || '').toLowerCase().includes(searchNisn);
        });
    }
    return data;
}

// ==========================================
// RATA-RATA NILAI UNTUK TAB LEGER
// Rata-rata = rata-rata semua nilai Pengetahuan & Keterampilan (semua semester)
// ==========================================
let lapRataNilai = null;
let lapRataNilaiLoading = false;

function muatRataNilai(force) {
    if (lapRataNilaiLoading) return Promise.resolve();
    if (lapRataNilai && !force) return Promise.resolve();
    lapRataNilaiLoading = true;
    return callAPI('getRataRataNilai').then(res => {
        lapRataNilai = (res && res.status === 'success' && res.data) ? res.data : {};
    }).catch(() => {
        lapRataNilai = {};
    }).then(() => {
        lapRataNilaiLoading = false;
    });
}

function lapNilaiInfo(nis) {
    return lapRataNilai ? lapRataNilai[String(nis || '').trim()] : null;
}

function formatRataNilai(v) {
    return Number(v).toFixed(2).replace('.', ',');
}

function lapNilaiText(nis) {
    const a = lapNilaiInfo(nis);
    return a ? formatRataNilai(a.avg) : 'Belum Diinput';
}

function lapNilaiCell(nis) {
    if (lapRataNilai === null) return '<td class="text-muted small">Memuat...</td>';
    const a = lapNilaiInfo(nis);
    if (!a) return '<td class="text-muted fst-italic">Belum Diinput</td>';
    return `<td class="fw-bold text-success" title="Pengetahuan: ${formatRataNilai(a.p)} | Keterampilan: ${formatRataNilai(a.k)} | ${a.n} nilai">${formatRataNilai(a.avg)}</td>`;
}

function renderLapPreview() {
    const data = getFilteredDataLaporan();
    const isLeger = $('#tabLapLeger').hasClass('active') || $('#tabLapLeger').hasClass('show');
    if (isLeger && lapRataNilai === null && !lapRataNilaiLoading) muatRataNilai().then(() => renderLapPreview());

    let htmlSiswa = '';
    let htmlLeger = '';

    if (data.length === 0) {
        let emptyTr = '';
        if (lapDataLoading) {
            emptyTr = `<tr><td colspan="11" class="text-center text-muted py-5"><div class="spinner-border text-primary spinner-border-sm me-2"></div>Memuat data Nomor Induk...</td></tr>`;
        } else if (lapDataLoaded && getLaporanSourceRows_().length > 0) {
            emptyTr = `<tr><td colspan="11" class="text-center text-muted py-4">Tidak ada data siswa yang cocok dengan pencarian / filter.</td></tr>`;
        } else if (lapDataLoaded) {
            emptyTr = `<tr><td colspan="11" class="text-center text-muted py-4">Belum ada data siswa di database.</td></tr>`;
        } else {
            emptyTr = `<tr><td colspan="11" class="text-center text-muted py-5"><i class="bi bi-info-circle me-1"></i>Tekan <b>"Tampilkan Semua Data"</b> untuk memuat Nomor Induk.</td></tr>`;
        }
        $('#tbodyLapPreviewSiswa').html(emptyTr);
        $('#tbodyLapPreviewLeger').html(emptyTr);
        $('#lapPagination').empty();
        return;
    }

    let limitVal = $('#nomorIndukLength').val() || $('#lapLimit').val() || '25';
    let limit = limitVal === 'all' ? data.length : (parseInt(limitVal, 10) || 25);
    let totalPages = Math.ceil(data.length / limit);
    if (lapCurrentPage > totalPages) lapCurrentPage = totalPages;
    if (lapCurrentPage < 1) lapCurrentPage = 1;

    let startIndex = (lapCurrentPage - 1) * limit;
    let endIndex = startIndex + limit;
    let pagedData = data.slice(startIndex, endIndex);

    const tipe = $('#lapTipeSiswa').val() || 'Semua Siswa';
    let headerText = 'Kelas/Lulus/Keluar';
    if (tipe === 'Siswa Aktif') headerText = 'Kelas';
    else if (tipe === 'Alumni') headerText = 'Tanggal Lulus';
    else if (tipe === 'Keluar/Mutasi') headerText = 'Tanggal Keluar';
    $('.thKelasStatusLap').text(headerText);

    pagedData.forEach((s, idx) => {
        let actualIdx = startIndex + idx;
        let kelasStatus = '-';
        let statusClass = 'text-danger fw-bold';
        const stLower = String(s[31] || '').trim().toLowerCase();
        if (stLower === 'aktif') {
            kelasStatus = s[52] || '-';
            statusClass = 'text-success fw-bold';
        } else if (stLower === 'lulus') {
            kelasStatus = s[32] ? `Lulus - ${s[32]}` : 'Lulus';
            statusClass = 'text-primary fw-bold';
        } else if (s[31]) {
            kelasStatus = s[32] ? `${s[31]} - ${s[32]}` : s[31];
        }
        const idInfo = resolveNisNisnLaporan_(s);
        const nis = String(idInfo.actionKey || s[0] || '').replace(/'/g, '\\&#39;');
        
        let barisBase = `
            <td>${actualIdx + 1}</td>
            <td>${escapeHTML(idInfo.nis || '-')}</td>
            <td>${escapeHTML(idInfo.nisn || '-')}</td>
            <td class="fw-bold text-wrap" style="min-width: 150px;">${escapeHTML(s[2] || '-')}</td>
            <td>${escapeHTML(s[7] || '-')}</td>
            <td>${escapeHTML(s[5] || '-')}</td>
            <td>${escapeHTML(s[6] || '-')}</td>
            <td>${escapeHTML(s[20] || '-')}</td>
            <td>${escapeHTML(s[23] || '-')}</td>
            <td class="${statusClass}">${escapeHTML(kelasStatus)}</td>
        `;

        htmlSiswa += `<tr>${barisBase}<td><button class="btn btn-sm btn-secondary me-1" onclick="reviewSiswa('${nis}')" title="Lihat"><i class="bi bi-eye"></i></button><button class="btn btn-sm btn-info text-white" onclick="cetakPDF('${nis}')" title="Cetak"><i class="bi bi-printer"></i></button></td></tr>`;
        htmlLeger += `<tr>${barisBase}${lapNilaiCell(s[0])}</tr>`;
    });

    $('#tbodyLapPreviewSiswa').html(htmlSiswa);
    $('#tbodyLapPreviewLeger').html(htmlLeger);

    // Render Pagination Controls
    if (totalPages > 1) {
        let pageHtml = `
            <div class="text-muted small fw-bold">Menampilkan ${startIndex + 1} - ${Math.min(endIndex, data.length)} dari ${data.length} data</div>
            <div class="btn-group shadow-sm">
                <button class="btn btn-sm btn-outline-primary fw-bold" onclick="lapCurrentPage--; renderLapPreview()" ${lapCurrentPage === 1 ? 'disabled' : ''}><i class="bi bi-chevron-left"></i> Prev</button>
                <button class="btn btn-sm btn-primary fw-bold" disabled>Halaman ${lapCurrentPage} / ${totalPages}</button>
                <button class="btn btn-sm btn-outline-primary fw-bold" onclick="lapCurrentPage++; renderLapPreview()" ${lapCurrentPage === totalPages ? 'disabled' : ''}>Next <i class="bi bi-chevron-right"></i></button>
            </div>
        `;
        $('#lapPagination').html(pageHtml);
    } else {
        $('#lapPagination').html(`<div class="text-muted small fw-bold">Menampilkan semua ${data.length} data</div>`);
    }
}

async function unduhLaporanExcel() {
    if (!lapDataLoaded && getLaporanSourceRows_().length === 0) {
        await muatDataLaporan();
    }
    const tipe = $('#lapTipeSiswa').val() || 'Semua Siswa';
    const filter2 = $('#lapFilterKedua').val();
    const isLeger = $('#tabLapLeger').hasClass('active') || $('#tabLapLeger').hasClass('show');

    const dataToExport = getFilteredDataLaporan();

    if (dataToExport.length === 0) {
        Swal.fire('Data Kosong', 'Tidak ada data yang sesuai dengan filter.', 'info');
        return;
    }

    $('#loader').removeClass('hidden');
    $('#loaderText').text('Menyiapkan file Excel...');
    if (isLeger) await muatRataNilai(true);

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'SiBuk InSTal';
    workbook.created = new Date();
    
    let title = (isLeger ? 'Data Leger ' : 'Data ') + tipe;
    if (filter2) title += ' - ' + filter2;

    const sheet = workbook.addWorksheet('Laporan');

    // Pengaturan Halaman: A4, Landscape, Margin 0.5cm (~0.2 inch)
    sheet.pageSetup = {
        paperSize: 9,
        orientation: 'landscape',
        margins: {
            left: 0.2, right: 0.2,
            top: 0.2, bottom: 0.2,
            header: 0.2, footer: 0.2
        },
        fitToPage: true,
        fitToWidth: 1,
        fitToHeight: 0
    };

    sheet.properties.defaultRowHeight = 20;

    sheet.mergeCells('A1:K1');
    const titleCell = sheet.getCell('A1');
    titleCell.value = 'LAPORAN ' + title.toUpperCase();
    titleCell.font = { name: 'Arial', size: 14, bold: true };
    titleCell.alignment = { vertical: 'middle', horizontal: 'center' };
    
    sheet.mergeCells('A2:K2');
    const subTitleCell = sheet.getCell('A2');
    subTitleCell.value = 'Dicetak pada: ' + new Date().toLocaleDateString('id-ID');
    subTitleCell.font = { name: 'Arial', size: 10, italic: true };
    subTitleCell.alignment = { vertical: 'middle', horizontal: 'center' };

    sheet.addRow([]); 

    let headerText = 'KELAS/LULUS/KELUAR';
    if (tipe === 'Siswa Aktif') headerText = 'KELAS';
    else if (tipe === 'Alumni') headerText = 'TANGGAL LULUS';
    else if (tipe === 'Keluar/Mutasi') headerText = 'TANGGAL KELUAR';

    const headers = ['NO', 'NIS', 'NISN', 'NAMA LENGKAP', 'L/P', 'TEMPAT LAHIR', 'TANGGAL LAHIR', 'NAMA AYAH', 'NAMA IBU', headerText, isLeger ? 'NILAI RATA-RATA' : 'KETERANGAN'];
    const headerRow = sheet.addRow(headers);
    headerRow.height = 25;
    headerRow.eachCell((cell) => {
        cell.font = { name: 'Arial', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4E73DF' } };
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
        cell.border = { top: {style:'thin'}, left: {style:'thin'}, bottom: {style:'thin'}, right: {style:'thin'} };
    });

    dataToExport.forEach((s, idx) => {
        let kelasStatus = '-';
        const stLower = String(s[31] || '').trim().toLowerCase();
        if (stLower === 'aktif') {
            kelasStatus = s[52] || '-';
        } else if (stLower === 'lulus') {
            kelasStatus = s[32] ? `Lulus - ${s[32]}` : 'Lulus';
        } else if (s[31]) {
            kelasStatus = s[32] ? `${s[31]} - ${s[32]}` : s[31];
        }

        const idInfo = resolveNisNisnLaporan_(s);
        let nilaiKeterangan = isLeger ? lapNilaiText(idInfo.actionKey || s[0]) : (s[31] || '-');
        
        let row = sheet.addRow([
            idx + 1, 
            idInfo.nis || '-', 
            idInfo.nisn || '-', 
            s[2] || '-', 
            s[7] || '-', 
            s[5] || '-', 
            s[6] || '-', 
            s[20] || '-', 
            s[23] || '-', 
            kelasStatus, 
            nilaiKeterangan
        ]);
        
        row.eachCell((cell) => {
            cell.font = { name: 'Arial', size: 10 };
            cell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
            cell.border = { top: {style:'thin'}, left: {style:'thin'}, bottom: {style:'thin'}, right: {style:'thin'} };
        });
        row.getCell(1).alignment = { vertical: 'middle', horizontal: 'center' };
        row.getCell(5).alignment = { vertical: 'middle', horizontal: 'center' };
    });

    sheet.columns.forEach((column) => {
        let maxLength = 0;
        column.eachCell({ includeEmpty: true }, function (cell, rowNumber) {
            if (rowNumber > 3) {
                let columnLength = cell.value ? cell.value.toString().length : 10;
                if (columnLength > maxLength) maxLength = columnLength;
            }
        });
        column.width = maxLength < 10 ? 10 : Math.min(maxLength + 2, 40); // Batasi maks 40 char lebar kolom agar tidak terlalu panjang
    });

    sheet.getColumn(1).width = 5; // NO
    sheet.getColumn(2).width = 12; // NIS
    sheet.getColumn(3).width = 15; // NISN
    
    // Perlebar khusus untuk kolom Nama Lengkap (kolom ke 4)
    if (sheet.getColumn(4).width < 25) {
        sheet.getColumn(4).width = 25;
    }

    sheet.addRow([]); sheet.addRow([]);
    
    let ttdRow1 = sheet.addRow(['', '', '', '', '', '', '', '', '', 'Mengetahui,', '']);
    let ttdRow2 = sheet.addRow(['', '', '', '', '', '', '', '', '', 'Kepala Sekolah', '']);
    sheet.addRow([]); sheet.addRow([]);
    
    let kepsekName = (typeof globalConf !== 'undefined' && globalConf && (globalConf.nama_kepsek || globalConf.kepala_sekolah)) || localStorage.getItem('kepsekName') || '..............................';
    let ttdRow3 = sheet.addRow(['', '', '', '', '', '', '', '', '', kepsekName, '']);
    
    [ttdRow1, ttdRow2].forEach(row => {
        row.getCell(10).font = { name: 'Arial', size: 10 };
        row.getCell(10).alignment = { horizontal: 'center' };
        sheet.mergeCells(`J${row.number}:K${row.number}`);
    });

    ttdRow3.getCell(10).font = { name: 'Arial', size: 10, bold: true, underline: true };
    ttdRow3.getCell(10).alignment = { horizontal: 'center' };
    sheet.mergeCells(`J${ttdRow3.number}:K${ttdRow3.number}`);

    workbook.xlsx.writeBuffer().then((data) => {
        let blob = new Blob([data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        saveAs(blob, `Laporan ${title.replace(/\//g, '_')}.xlsx`);
        $('#loader').addClass('hidden');
    }).catch(e => {
        $('#loader').addClass('hidden');
        Swal.fire('Error', 'Gagal membuat file Excel: ' + e, 'error');
    });
}

// OVERRIDE FUNGSI FILTER UNTUK SINKRONISASI LEGER

function terapkanFilterKelas() {
    let selectedClasses = [];
    $('.chk-kelas-filter:checked').each(function () {
        let escapeText = $(this).val().replace(/[.*+?^\$\{}()|[\]\\]/g, '\\$&');
        selectedClasses.push(escapeText);
    });

    let table = $('#tblDataSiswa').DataTable();
    let tableLeger = $('#tblLegerDataSiswa').DataTable();

    if (selectedClasses.length === 0) {
        table.column(4).search('^$', true, false).draw();
        if (tableLeger) tableLeger.column(4).search('^$', true, false).draw();
    } else {
        let regexPencarian = "^(" + selectedClasses.join("|") + ")$";
        table.column(4).search(regexPencarian, true, false).draw();
        if (tableLeger) tableLeger.column(4).search(regexPencarian, true, false).draw();
    }
}

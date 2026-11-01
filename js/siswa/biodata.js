// ==========================================
// 1. FUNGSI CETAK BIODATA / BUKU INDUK (VERSI TEGAK & VERSI MIRING / LANDSCAPE)
// ==========================================
const BUKU_INDUK_PREF_KEY_ = 'sibuk_bukuinduk_prefs_v1';
window._activeBukuIndukCtx = null;
window._activeBukuIndukBlobUrl = null;
let _bukuIndukModalCleanupBound_ = false;
let _defaultPdfModalMeta_ = null;

function loadBukuIndukPrefs_() {
    const fallback = {
        orientation: 'portrait',
        paper: 'f4',
        withKopLandscape: false,
        tempat: ''
    };
    try {
        const raw = localStorage.getItem(BUKU_INDUK_PREF_KEY_);
        if (!raw) return fallback;
        const parsed = JSON.parse(raw);
        return {
            orientation: parsed.orientation === 'landscape' ? 'landscape' : 'portrait',
            paper: ['f4', 'a4', 'legal'].includes(parsed.paper) ? parsed.paper : 'f4',
            withKopLandscape: Boolean(parsed.withKopLandscape),
            tempat: typeof parsed.tempat === 'string' ? parsed.tempat : ''
        };
    } catch (e) {
        return fallback;
    }
}

function saveBukuIndukPrefs_(prefs) {
    try {
        const current = loadBukuIndukPrefs_();
        const merged = Object.assign({}, current, prefs || {});
        localStorage.setItem(BUKU_INDUK_PREF_KEY_, JSON.stringify(merged));
    } catch (e) { }
    if (typeof syncMasterBukuIndukToolbar_ === 'function') {
        try { syncMasterBukuIndukToolbar_(); } catch (e) { }
    }
}

function escBI_(val) {
    if (val === null || val === undefined) return '';
    return String(val)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function cleanValBI_(val, fallback = '') {
    if (val === null || val === undefined) return fallback;
    const s = String(val).trim();
    if (!s || s === '-' || s === 'null' || s === 'undefined') return fallback;
    return s;
}

function resolveNisNisnSiswa_(row) {
    const clean = (v) => {
        const t = String(v === null || v === undefined ? '' : v).trim().replace(/^'+|'+$/g, '').trim();
        if (!t || t === '-' || t.toLowerCase() === 'null' || t.toLowerCase() === 'undefined') return '';
        return t;
    };
    const nis = clean(row && row[0]);
    const nisn = clean(row && row[1]);
    const actionKey = String((row && row[0]) !== undefined && (row && row[0]) !== null ? row[0] : '').trim();
    return {
        nis,
        nisn,
        hasRealNis: Boolean(nis),
        actionKey
    };
}
if (typeof window !== 'undefined') window.resolveNisNisnSiswa_ = resolveNisNisnSiswa_;

function formatTglBI_(val, fallback = '') {
    const raw = cleanValBI_(val, '');
    if (!raw) return fallback;
    if (/^\d{4}$/.test(raw)) return raw;
    if (typeof formatTglIndoJS === 'function') {
        const formatted = formatTglIndoJS(raw);
        if (formatted && formatted !== '-') return formatted;
    }
    return raw;
}

function formatKewarganegaraanBI_(val) {
    const raw = cleanValBI_(val, '');
    if (!raw) return 'Indonesia';
    if (raw.toUpperCase() === 'WNI' || raw.toLowerCase() === 'indonesia') return 'Indonesia';
    return raw;
}

function hitungStatusYatimBI_(s) {
    const stAyah = cleanValBI_(s[42], '').toLowerCase();
    const stIbu = cleanValBI_(s[45], '').toLowerCase();
    const ayahWafat = /meninggal|wafat|alm/.test(stAyah);
    const ibuWafat = /meninggal|wafat|alm/.test(stIbu);
    if (ayahWafat && ibuWafat) return 'Yatim Piatu';
    if (ayahWafat) return 'Yatim';
    if (ibuWafat) return 'Piatu';
    if (stAyah || stIbu) return '-';
    return '';
}

function hitungTinggalDenganBI_(s) {
    const wali = cleanValBI_(s[46], '');
    const ayah = cleanValBI_(s[20], '');
    const ibu = cleanValBI_(s[23], '');
    if (wali && wali.toLowerCase() !== ayah.toLowerCase() && wali.toLowerCase() !== ibu.toLowerCase()) {
        return 'Bersama Wali';
    }
    if (ayah || ibu) return 'Bersama orang tua';
    return '';
}

function extractProgramBI_(kelasStr) {
    const raw = cleanValBI_(kelasStr, '');
    if (!raw) return '';
    const m = raw.match(/\b(MIPA|IPA|IPS|BAHASA|AGAMA|UMUM|TKJ|RPL|AKL|OTKP|MPLB|BDP|PM|DKV|MULTIMEDIA|TSM|TBSM|TKR|TKRO|ATPH|KEPERAWATAN|FARMASI)\b/i);
    return m ? m[1].toUpperCase() : '';
}

function splitKegemaranBI_(hobbyRaw) {
    const res = { kesenian: [], olahraga: [], organisasi: [], lain: [] };
    const raw = cleanValBI_(hobbyRaw, '');
    if (!raw) return { kesenian: '', olahraga: '', organisasi: '', lain: '' };

    const parts = raw.split(/[,;/]+/).map(x => x.trim()).filter(Boolean);
    parts.forEach(item => {
        const low = item.toLowerCase();
        if (/musik|nyanyi|menyanyi|tari|menari|lukis|melukis|menggambar|gambar|seni|gitar|piano|band|teater|kaligrafi|puisi/.test(low)) {
            res.kesenian.push(item);
        } else if (/bola|sepak|futsal|voli|volley|basket|badminton|bulu\s*tangkis|renang|lari|atletik|silat|karate|taekwondo|olahraga|catur|tenis|sepeda|senam/.test(low)) {
            res.olahraga.push(item);
        } else if (/pramuka|osis|pmr|rohis|paskibra|organisasi|karang\s*taruna|pecinta\s*alam|sispala/.test(low)) {
            res.organisasi.push(item);
        } else {
            res.lain.push(item);
        }
    });

    return {
        kesenian: res.kesenian.join(', '),
        olahraga: res.olahraga.join(', '),
        organisasi: res.organisasi.join(', '),
        lain: res.lain.join(', ')
    };
}

function getPaperSpecBukuInduk_(paper) {
    switch (paper) {
        case 'f4':
            return {
                key: 'f4',
                format: [33.0, 21.5],
                label: 'F4 / Folio',
                dimPortrait: '21.5 x 33.0 cm',
                dimLandscape: '33.0 x 21.5 cm'
            };
        case 'legal':
            return {
                key: 'legal',
                format: 'legal',
                label: 'Legal',
                dimPortrait: '21.6 x 35.6 cm',
                dimLandscape: '35.6 x 21.6 cm'
            };
        case 'a4':
        default:
            return {
                key: 'a4',
                format: 'a4',
                label: 'A4',
                dimPortrait: '21.0 x 29.7 cm',
                dimLandscape: '29.7 x 21.0 cm'
            };
    }
}

async function findSiswaForBukuInduk_(nis) {
    const norm = v => String(v === null || v === undefined ? '' : v).replace(/^'+/, '').replace(/&#39;/g, "'").trim();
    const target = norm(nis);
    if (!target) return null;

    const matchRow = arr => Array.isArray(arr) ? arr.find(x => x && (norm(x[0]) === target || x[0] == nis)) : null;

    let found = matchRow(typeof globalSiswa !== 'undefined' ? globalSiswa : null)
        || matchRow(typeof globalLaporanSiswa !== 'undefined' ? globalLaporanSiswa : null)
        || matchRow(typeof window !== 'undefined' ? window.globalAlumniData : null)
        || matchRow(typeof unifiedSiswaData !== 'undefined' ? unifiedSiswaData : null);

    if (found) return found;

    // Fallback ke endpoint Siswa Keluar / Alumni apabila tab dibuka langsung sebelum masuk ke globalSiswa
    if (typeof callAPI === 'function') {
        try {
            const resKeluar = await callAPI('getSiswaKeluarByTahun', { tahun: '' });
            if (resKeluar && resKeluar.status === 'success' && Array.isArray(resKeluar.data)) {
                found = matchRow(resKeluar.data);
                if (found) return found;
            }
        } catch (e) { }
        try {
            const resAlumni = await callAPI('getAlumniByTahun', { tahun: '' });
            if (resAlumni && resAlumni.status === 'success' && Array.isArray(resAlumni.data)) {
                found = matchRow(resAlumni.data);
                if (found) return found;
            }
        } catch (e) { }
    }

    return null;
}

function extractDriveFileIdBI_(raw) {
    const s = String(raw || '').trim();
    if (!s) return '';
    // Match Google Drive URLs: /file/d/<ID>, /d/<ID>, ?id=<ID>, &id=<ID>
    const mFile = s.match(/\/(?:file\/d|d)\/([A-Za-z0-9_-]{15,})/);
    if (mFile) return mFile[1];
    const mQuery = s.match(/[?&]id=([A-Za-z0-9_-]{15,})/);
    if (mQuery) return mQuery[1];
    return '';
}

function fitFoto3x4Canvas_(src) {
    return new Promise((resolve) => {
        if (!src || typeof Image === 'undefined' || typeof document === 'undefined' || !document.createElement) {
            return resolve(src || '');
        }
        try {
            const img = new Image();
            if (!String(src).startsWith('data:')) {
                img.crossOrigin = 'anonymous';
            }
            const timer = setTimeout(() => resolve(src), 6000);
            img.onload = () => {
                clearTimeout(timer);
                try {
                    const targetW = 360;
                    const targetH = 480;
                    const canvas = document.createElement('canvas');
                    if (!canvas || !canvas.getContext) return resolve(src);
                    canvas.width = targetW;
                    canvas.height = targetH;
                    const c2d = canvas.getContext('2d');
                    c2d.fillStyle = '#ffffff';
                    c2d.fillRect(0, 0, targetW, targetH);

                    const iw = img.naturalWidth || img.width || targetW;
                    const ih = img.naturalHeight || img.height || targetH;
                    // Cover crop 3:4 centered
                    const scale = Math.max(targetW / iw, targetH / ih);
                    const sw = targetW / scale;
                    const sh = targetH / scale;
                    const sx = Math.max(0, (iw - sw) / 2);
                    const sy = Math.max(0, (ih - sh) * 0.25); // bias slightly toward top for portrait faces
                    c2d.drawImage(img, sx, sy, sw, sh, 0, 0, targetW, targetH);
                    resolve(canvas.toDataURL('image/jpeg', 0.94));
                } catch (err) {
                    resolve(src);
                }
            };
            img.onerror = () => {
                clearTimeout(timer);
                // Jika gambar gagal dimuat/rusak, kembalikan string kosong agar tampil kotak placeholder rapi
                resolve('');
            };
            img.src = src;
        } catch (e) {
            resolve(src || '');
        }
    });
}

async function resolveFotoBukuInduk_(rawVal, fallbackDomSelector) {
    let val = cleanValBI_(rawVal, '');
    if (val.toLowerCase() === 'hapus') val = '';

    let resolved = '';
    if (val) {
        if (val.startsWith('data:image')) {
            resolved = val;
        } else {
            const driveId = extractDriveFileIdBI_(val);
            const lookupId = driveId || val;
            if (typeof callAPI === 'function') {
                try {
                    const res = await callAPI('getImage', { id: lookupId });
                    if (typeof res === 'string' && res.trim()) {
                        resolved = res.trim();
                    } else if (res && typeof res.data === 'string' && res.data.trim()) {
                        resolved = res.data.trim();
                    }
                } catch (e) { }
            }
            if (!resolved && /^https?:\/\//i.test(val)) {
                resolved = driveId ? `https://lh3.googleusercontent.com/d/${driveId}` : val;
            }
        }
    }

    // Fallback: jika modal Detail/Edit Siswa sedang menampilkan foto siswa yang sama di layar
    if (!resolved && fallbackDomSelector && typeof $ === 'function') {
        try {
            const domEl = $(fallbackDomSelector);
            if (domEl.length && !domEl.hasClass('hidden')) {
                const domSrc = domEl.attr('src') || '';
                if (domSrc.startsWith('data:image')) resolved = domSrc;
            }
        } catch (e) { }
    }

    if (!resolved) return '';
    return await fitFoto3x4Canvas_(resolved);
}

function buildKopSekolahBukuIndukHTML_(ctx, compact = false) {
    const conf = ctx.conf || {};
    const imgInstansi = ctx.imgInstansi || '';
    const imgSekolah = ctx.imgSekolah || '';
    const alamatSekolah = conf.alamat_sekolah ? escBI_(conf.alamat_sekolah).replace(/\n/g, '<br>') : '-';
    const logoSize = compact ? '46px' : '75px';
    const fsInstansi = compact ? '10pt' : '14pt';
    const fsOpd = compact ? '9.5pt' : '13pt';
    const fsSekolah = compact ? '12.5pt' : '17pt';
    const fsAlamat = compact ? '8pt' : '10pt';
    const fsKontak = compact ? '7.5pt' : '9pt';
    const mbDivider = compact ? '3px 0 6px 0' : '5px 0 16px 0';

    return `
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 2px; border: none;">
            <tr>
                <td width="12%" align="center" style="border: none; vertical-align: middle;">
                    ${imgInstansi ? `<img src="${imgInstansi}" style="width: ${logoSize}; height: ${logoSize}; object-fit: contain;">` : ''}
                </td>
                <td width="76%" style="text-align: center; line-height: 1.15; border: none; vertical-align: middle;">
                    <div style="font-size:${fsInstansi}; font-weight:bold; text-transform:uppercase; letter-spacing: 0.6px;">${escBI_(conf.nama_instansi || '')}</div>
                    ${conf.opd_dinas ? `<div style="font-size:${fsOpd}; font-weight:bold; text-transform:uppercase;">${escBI_(conf.opd_dinas)}</div>` : ''}
                    <div style="font-size:${fsSekolah}; font-weight:bold; text-transform:uppercase; margin: 2px 0;">${escBI_(conf.nama_sekolah || '')}</div>
                    <div style="font-size:${fsAlamat};">${alamatSekolah}</div>
                    <div style="font-size:${fsKontak}; margin-top: 1px;">Telp: ${escBI_(conf.telp_sekolah || '-')}  |  Email: ${escBI_(conf.email_sekolah || '-')}  |  Web: ${escBI_(conf.web_sekolah || '-')}</div>
                </td>
                <td width="12%" align="center" style="border: none; vertical-align: middle;">
                    ${imgSekolah ? `<img src="${imgSekolah}" style="width: ${logoSize}; height: ${logoSize}; object-fit: contain;">` : ''}
                </td>
            </tr>
        </table>
        <div style="border-bottom: 3px double #000; margin: ${mbDivider};"></div>
    `;
}

function buildBukuIndukPortraitHTML_(s, imgMasuk, imgKeluar, cfg, ctx) {
    const isA4 = cfg.paper === 'a4';
    const baseFs = isA4 ? '10.2pt' : '11pt';
    const subFs = isA4 ? '9.3pt' : '10pt';
    const lineHeight = isA4 ? '1.38' : '1.5';
    const ttl = [cleanValBI_(s[5], '-'), formatTglBI_(s[6], '-')].join(', ');
    const jk = s[7] == 'L' ? 'Laki-laki' : (s[7] == 'P' ? 'Perempuan' : cleanValBI_(s[7], '-'));
    const idInfo = resolveNisNisnSiswa_(s);

    return `
        <div style="font-family: 'Arial', sans-serif; font-size: ${baseFs}; color: #000; background: #fff; width: 100%; box-sizing: border-box;">
            ${buildKopSekolahBukuIndukHTML_(ctx, false)}
            <div style="text-align:center; font-weight:bold; text-decoration:underline; font-size:13.5pt; margin-bottom:14px;">LEMBAR BUKU INDUK SISWA</div>

            <table style="width: 100%; border-collapse: collapse; line-height: ${lineHeight};">
                <tr><td style="width: 26%; vertical-align: top;">1. Nama Lengkap</td><td style="width: 2%;">:</td><td style="width: 72%; font-weight: bold;">${escBI_(cleanValBI_(s[2], '-'))}</td></tr>
                <tr><td style="vertical-align: top;">2. NIS / NISN</td><td>:</td><td style="font-weight: bold;">${escBI_(idInfo.nis || '-')} / ${escBI_(idInfo.nisn || '-')}</td></tr>
                <tr><td style="vertical-align: top;">3. NIK / No.KK</td><td>:</td><td style="font-weight: bold;">${escBI_(cleanValBI_(s[3], '-'))} / ${escBI_(cleanValBI_(s[4], '-'))}</td></tr>
                <tr><td style="vertical-align: top;">4. TTL</td><td>:</td><td style="font-weight: bold;">${escBI_(ttl)}</td></tr>
                <tr><td style="vertical-align: top;">5. Jenis Kelamin</td><td>:</td><td style="font-weight: bold;">${escBI_(jk)}</td></tr>
                <tr><td style="vertical-align: top;">6. Agama</td><td>:</td><td style="font-weight: bold;">${escBI_(cleanValBI_(s[8], '-'))}</td></tr>
                <tr><td style="vertical-align: top;">7. Anak ke</td><td>:</td><td style="font-weight: bold;">${escBI_(cleanValBI_(s[9], '-'))} dari ${escBI_(cleanValBI_(s[10], '-'))} bersaudara</td></tr>
                <tr><td style="vertical-align: top;">8. Tinggi/Berat/Goldar</td><td>:</td><td style="font-weight: bold;">${escBI_(cleanValBI_(s[16], '-'))} cm / ${escBI_(cleanValBI_(s[17], '-'))} Kg / ${escBI_(cleanValBI_(s[18], '-'))}</td></tr>
                <tr><td style="vertical-align: top;">9. Hobby / Penyakit</td><td>:</td><td style="font-weight: bold;">${escBI_(cleanValBI_(s[39], '-'))} / ${escBI_(cleanValBI_(s[19], '-'))}</td></tr>
                <tr><td style="vertical-align: top;">10. Alamat</td><td>:</td><td style="font-weight: bold;">${escBI_(cleanValBI_(s[12], '-'))}</td></tr>
                <tr><td style="vertical-align: top;">11. No.HP / Email</td><td>:</td><td style="font-weight: bold;">${escBI_(cleanValBI_(s[13], '-'))} / ${escBI_(cleanValBI_(s[53], '-'))}</td></tr>
                <tr><td style="vertical-align: top;">12. Data Ayah</td><td>:</td><td style="font-weight: bold;">${escBI_(cleanValBI_(s[20], '-'))} (${escBI_(cleanValBI_(s[42], '-'))})
                    <div style="font-weight: normal; margin-left: 10px; font-size: ${subFs}; line-height: 1.28;">
                        <table style="width: 100%; font-size: ${subFs}; border: none;">
                            <tr>
                                <td style="width: 50%; border: none;">a. Tahun Lahir : <b>${escBI_(formatTglBI_(s[21], '-'))}</b></td>
                                <td style="width: 50%; border: none;">b. Pendidikan  : <b>${escBI_(cleanValBI_(s[40], '-'))}</b></td>
                            </tr>
                            <tr>
                                <td style="border: none;">c. Pekerjaan   : <b>${escBI_(cleanValBI_(s[22], '-'))}</b></td>
                                <td style="border: none;">d. Penghasilan : <b>${escBI_(cleanValBI_(s[41], '-'))}</b></td>
                            </tr>
                        </table>
                    </div>
                </td></tr>
                <tr><td style="vertical-align: top;">13. Data Ibu</td><td>:</td><td style="font-weight: bold;">${escBI_(cleanValBI_(s[23], '-'))} (${escBI_(cleanValBI_(s[45], '-'))})
                    <div style="font-weight: normal; margin-left: 10px; font-size: ${subFs}; line-height: 1.28;">
                        <table style="width: 100%; font-size: ${subFs}; border: none;">
                            <tr>
                                <td style="width: 50%; border: none;">a. Tahun Lahir : <b>${escBI_(formatTglBI_(s[24], '-'))}</b></td>
                                <td style="width: 50%; border: none;">b. Pendidikan  : <b>${escBI_(cleanValBI_(s[43], '-'))}</b></td>
                            </tr>
                            <tr>
                                <td style="border: none;">c. Pekerjaan   : <b>${escBI_(cleanValBI_(s[25], '-'))}</b></td>
                                <td style="border: none;">d. Penghasilan : <b>${escBI_(cleanValBI_(s[44], '-'))}</b></td>
                            </tr>
                        </table>
                    </div>
                </td></tr>
                <tr><td style="vertical-align: top;">14. Bantuan (KIP/KPS)</td><td>:</td><td style="font-weight: bold;">
                    <div style="font-weight: normal; font-size: ${subFs}; line-height: 1.28;">
                        - Status KIP : <b>${escBI_(cleanValBI_(s[57], 'Tidak'))}</b> ${s[57] === 'Ya' ? `(No: ${escBI_(cleanValBI_(s[58], '-'))} / A.n: ${escBI_(cleanValBI_(s[59], '-'))})` : ''}<br>
                        - Status KPS : <b>${escBI_(cleanValBI_(s[61], 'Tidak'))}</b> ${s[61] === 'Ya' ? `(No: ${escBI_(cleanValBI_(s[62], '-'))})` : ''} &nbsp;&nbsp;&nbsp; - No KKS : <b>${escBI_(cleanValBI_(s[60], '-'))}</b>
                    </div>
                </td></tr>
                <tr><td style="vertical-align: top;">15. Data Rekening Bank</td><td>:</td><td style="font-weight: bold;">
                    <div style="font-weight: normal; font-size: ${subFs}; line-height: 1.28;">
                        Bank <b>${escBI_(cleanValBI_(s[63], '-'))}</b> - Rekening: <b>${escBI_(cleanValBI_(s[64], '-'))}</b> a.n <b>${escBI_(cleanValBI_(s[65], '-'))}</b>
                    </div>
                </td></tr>
                <tr><td style="vertical-align: top;">16. Pindahan/Lulusan</td><td>:</td><td style="font-weight: bold;">${escBI_(cleanValBI_(s[26], '-'))} / ${escBI_(cleanValBI_(s[27], '-'))}</td></tr>
                <tr><td style="vertical-align: top;">17. Diterima Tgl/Kls</td><td>:</td><td style="font-weight: bold;">${escBI_(formatTglBI_(s[30], '-'))} di Kelas ${escBI_(cleanValBI_(s[29] || s[52], '-'))}</td></tr>
                <tr><td style="vertical-align: top;">18. Status Akhir</td><td>:</td><td style="font-weight: bold;">${escBI_(cleanValBI_(s[31], '-'))}</td></tr>
                <tr><td style="vertical-align: top;">19. Lulus/Keluar Tgl</td><td>:</td><td style="font-weight: bold;">${escBI_(formatTglBI_(s[32], '-'))}</td></tr>
                <tr><td style="vertical-align: top;">20. No. Ijazah SLTA</td><td>:</td><td style="font-weight: bold;">${escBI_(cleanValBI_(s[34], '-'))}</td></tr>
            </table>

            <table style="width: 100%; border-collapse: collapse; margin-top: 10px; page-break-inside: avoid;">
                <tr>
                    <td align="center" width="25%">
                        <div style="margin-bottom: 4px;">Foto Masuk</div>
                        ${imgMasuk ? `<img src="${imgMasuk}" style="width: 3cm; height: 4cm; border: 1px solid #000; display: block;">` : '<div style="width: 3cm; height: 4cm; border: 1px solid #000; line-height:4cm; text-align:center;">Tidak Ada</div>'}
                    </td>
                    <td align="center" width="25%">
                        <div style="margin-bottom: 4px;">Foto Keluar</div>
                        ${imgKeluar ? `<img src="${imgKeluar}" style="width: 3cm; height: 4cm; border: 1px solid #000; display: block;">` : '<div style="width: 3cm; height: 4cm; border: 1px solid #000; line-height:4cm; text-align:center;">Tidak Ada</div>'}
                    </td>
                    <td align="center" width="50%" style="vertical-align: top;">
                        <div style="float:right; text-align:center; width:90%; font-size: ${baseFs}; margin-top: 6px;">
                            ${escBI_(ctx.tempatCetak)}, ${escBI_(ctx.tglCetak)} <br>
                            Kepala Sekolah,<br><br><br><br>
                            <b><u>${escBI_(ctx.namaKepsek)}</u></b><br>
                            ${escBI_(ctx.nipKepsek)}
                        </div>
                    </td>
                </tr>
            </table>
        </div>
    `;
}

function buildBukuIndukLandscapeHTML_(s, imgMasuk, imgKeluar, cfg, ctx) {
    const withKop = Boolean(cfg.withKopLandscape);
    const isCompact = cfg.paper === 'a4' || withKop;
    const baseFs = withKop ? (cfg.paper === 'a4' ? '7.2pt' : '7.6pt') : (cfg.paper === 'a4' ? '8pt' : '8.4pt');
    const titleFs = withKop ? '10.5pt' : '11.8pt';
    const subTitleFs = withKop ? '8pt' : '8.8pt';
    const rowPad = isCompact ? '0.6px 1px' : '1.05px 1px';
    const secPadTop = isCompact ? '3px' : '5px';
    const lineHeight = isCompact ? '1.16' : '1.22';
    const photoW = isCompact ? '2.55cm' : '2.9cm';
    const photoH = isCompact ? '3.4cm' : '3.85cm';
    const photoGap = isCompact ? '0.45cm' : '0.85cm';

    // Data Bagian A - D (Kolom Kiri: Poin 1 - 22)
    const idInfo = resolveNisNisnSiswa_(s);
    const nisDisp = idInfo.nis || '-';
    const nisnDisp = idInfo.nisn || '-';
    const nisNisnGabung = `${nisDisp} / ${nisnDisp}`;
    const nikDisp = cleanValBI_(s[3], '-');
    const noKkDisp = cleanValBI_(s[4], '-');
    const nikNoKkGabung = `${nikDisp} / ${noKkDisp}`;

    const namaLengkap = cleanValBI_(s[2], '');
    const jk = s[7] === 'L' ? 'Laki-laki' : (s[7] === 'P' ? 'Perempuan' : cleanValBI_(s[7], ''));
    const tmptLahir = cleanValBI_(s[5], '');
    const tglLahir = formatTglBI_(s[6], '');
    const ttl = (tmptLahir && tglLahir) ? `${tmptLahir}, ${tglLahir}` : (tmptLahir || tglLahir);
    const agama = cleanValBI_(s[8], '');
    const wargaSiswa = formatKewarganegaraanBI_(s[56]);
    const anakKe = cleanValBI_(s[9], '');
    const sdrKandung = cleanValBI_(s[10], '');
    const sdrTiriAngkat = '- / -';
    const bahasa = cleanValBI_(s[11], '');

    const alamat = cleanValBI_(s[12], '');
    const telp = cleanValBI_(s[13], '');
    const tinggalDengan = hitungTinggalDenganBI_(s);
    const jarakRaw = cleanValBI_(s[14], '');
    const jarak = jarakRaw ? (/^\d+([.,]\d+)?$/.test(jarakRaw) ? `${jarakRaw} km` : jarakRaw) : '';

    const goldar = cleanValBI_(s[18], '');
    const penyakit = cleanValBI_(s[19], '');
    const kelainan = (cleanValBI_(s[66], '').toLowerCase() === 'ya' || (cleanValBI_(s[67], '') && cleanValBI_(s[67], '').toLowerCase() !== 'tidak'))
        ? cleanValBI_(s[67], cleanValBI_(s[66], ''))
        : '';
    const tinggi = cleanValBI_(s[16], '');
    const berat = cleanValBI_(s[17], '');
    const tinggiBerat = (tinggi || berat)
        ? `${tinggi ? tinggi + ' cm' : '-'} / ${berat ? berat + ' kg' : '-'}`
        : '-';

    const lulusanDari = cleanValBI_(s[27], '');
    const noSttbSltp = cleanValBI_(s[28], '');
    const pindahanDari = cleanValBI_(s[26], '');
    const klsDiterima = cleanValBI_(s[29], cleanValBI_(s[52], ''));
    const programStudi = extractProgramBI_(klsDiterima);
    const tglDiterima = formatTglBI_(s[30], '');

    // Data Bagian E (Orang Tua & Wali: Poin 23 - 32)
    const namaAyah = cleanValBI_(s[20], '');
    const namaIbu = cleanValBI_(s[23], '');
    const namaWali = cleanValBI_(s[46], '');
    const hasAyah = Boolean(namaAyah || cleanValBI_(s[22], '') || cleanValBI_(s[40], ''));
    const hasIbu = Boolean(namaIbu || cleanValBI_(s[25], '') || cleanValBI_(s[43], ''));
    const hasWali = Boolean(namaWali || cleanValBI_(s[48], '') || cleanValBI_(s[49], ''));

    // Data Bagian F - H (Poin 33 - 41)
    const hobi = splitKegemaranBI_(s[39]);

    // Data Bagian G: Data Rekening & KIP (Poin 37 - 38)
    const noKipRaw = cleanValBI_(s[58], '');
    const statusKip = (cleanValBI_(s[57], '').toLowerCase() === 'ya' || Boolean(noKipRaw)) ? 'Ya' : 'Tidak';
    const noKipDisp = statusKip === 'Ya' ? (noKipRaw || '-') : '-';

    const noKksRaw = cleanValBI_(s[60], '');
    const statusKks = noKksRaw ? 'Ya' : 'Tidak';
    const noKksDisp = noKksRaw || '-';

    const namaBank = cleanValBI_(s[63], '-');
    const noRekening = cleanValBI_(s[64], '-');
    const atasNamaRek = cleanValBI_(s[65], '-');

    // Data Bagian H: Status Akhir (Poin 39 - 41)
    const statusAkhir = cleanValBI_(s[31], '');
    const isLulus = statusAkhir.toLowerCase() === 'lulus';
    const isKeluarNonLulus = Boolean(statusAkhir && !isLulus && statusAkhir.toLowerCase() !== 'aktif');
    const tglKeluarRaw = cleanValBI_(s[32], '');
    const tglMeninggalkan = (isLulus || isKeluarNonLulus) ? formatTglBI_(tglKeluarRaw, '-') : '';
    const alasanMeninggalkan = isLulus
        ? (cleanValBI_(s[54], '') || 'Lulus / Tamat')
        : (isKeluarNonLulus ? (cleanValBI_(s[54], '') || statusAkhir) : '');

    const tahunLulus = (isLulus && tglKeluarRaw) ? String(tglKeluarRaw).substring(0, 4) : (isLulus ? '-' : '');
    const noIjazahAkhir = cleanValBI_(s[34], '-');
    const lanjutDi = cleanValBI_(s[33], '');

    const rowL = (no, label, val, opts = {}) => `
        <tr>
            <td class="bi-no">${no}</td>
            <td class="bi-lbl" style="${opts.extraPadBottom ? 'padding-bottom:' + opts.extraPadBottom + ';' : ''}">${label}</td>
            <td class="bi-col" style="${opts.bottom ? 'vertical-align: bottom;' : ''}">:</td>
            <td class="bi-val" style="${opts.bottom ? 'vertical-align: bottom;' : ''}${opts.extraPadBottom ? 'padding-bottom:' + opts.extraPadBottom + ';' : ''}">${escBI_(val)}</td>
        </tr>`;

    const rowSubL = (sub, label, val, underlineEmpty = false) => `
        <tr>
            <td class="bi-no"></td>
            <td class="bi-lbl bi-sub">${sub}&nbsp;${label}</td>
            <td class="bi-col">:</td>
            <td class="bi-val" style="${underlineEmpty ? 'border-bottom: 0.7px solid #222;' : ''}">${escBI_(val)}</td>
        </tr>`;

    const rowOrtu = (no, label, vAyah, vIbu, vWali) => `
        <tr>
            <td class="bi-no">${no}</td>
            <td class="bi-lbl">${label}</td>
            <td class="bi-col">:</td>
            <td class="bi-ortu">${escBI_(vAyah)}</td>
            <td class="bi-ortu">${escBI_(vIbu)}</td>
            <td class="bi-ortu">${escBI_(vWali)}</td>
        </tr>`;

    const rowSplitVal = (subLabel, leftVal, rightLabel, rightVal, leftPct = '24%') => `
        <tr>
            <td class="bi-no"></td>
            <td class="bi-lbl bi-sub">${subLabel}</td>
            <td class="bi-col">:</td>
            <td class="bi-val">
                <table style="width:100%; border-collapse:collapse; table-layout:fixed;">
                    <colgroup>
                        <col style="width:${leftPct};">
                        <col>
                    </colgroup>
                    <tr>
                        <td style="padding:0; padding-right:4px; word-break:break-word;">${escBI_(leftVal)}</td>
                        <td style="padding:0; word-break:break-word;">${rightLabel} : ${escBI_(rightVal)}</td>
                    </tr>
                </table>
            </td>
        </tr>`;

    const lulusExtraRowsHtml = isLulus ? `
        <tr><td class="bi-no"></td><td class="bi-sub">c.&nbsp;Tahun Lulus</td><td class="bi-col">:</td><td class="bi-val">${escBI_(tahunLulus)}</td></tr>
        <tr><td class="bi-no"></td><td class="bi-sub">d.&nbsp;Nomor Ijazah</td><td class="bi-col">:</td><td class="bi-val">${escBI_(noIjazahAkhir)}</td></tr>` : '';

    const boxFotoMasuk = imgMasuk
        ? `<div style="width: ${photoW}; height: ${photoH}; border: 1px solid #000; overflow: hidden; box-sizing: border-box;">
                <img src="${imgMasuk}" style="width: 100%; height: 100%; display: block;">
           </div>`
        : `<div style="width: ${photoW}; height: ${photoH}; border: 1px solid #000; display: flex; align-items: center; justify-content: center; text-align: center; font-size: 7.4pt; line-height: 1.25; padding: 4px; box-sizing: border-box;">
                <div>Pas Foto<br>3 cm x 4 cm<br>Waktu diterima<br>Di sekolah ini</div>
           </div>`;

    const boxFotoKeluar = imgKeluar
        ? `<div style="width: ${photoW}; height: ${photoH}; border: 1px solid #000; overflow: hidden; box-sizing: border-box;">
                <img src="${imgKeluar}" style="width: 100%; height: 100%; display: block;">
           </div>`
        : `<div style="width: ${photoW}; height: ${photoH}; border: 1px solid #000; display: flex; align-items: center; justify-content: center; text-align: center; font-size: 7.4pt; line-height: 1.25; padding: 4px; box-sizing: border-box;">
                <div>Pas Foto<br>3 cm x 4 cm<br>Waktu<br>Meninggalkan<br>Sekolah ini</div>
           </div>`;

    return `
        <div style="font-family: 'Times New Roman', Times, serif; font-size: ${baseFs}; line-height: ${lineHeight}; color: #000; background: #fff; width: 100%; box-sizing: border-box;">
            <style>
                .bi-land-wrap table { border-collapse: collapse; }
                .bi-land-wrap td { vertical-align: top; padding: ${rowPad}; border: none; }
                .bi-land-wrap .bi-sec { font-weight: bold; padding-top: ${secPadTop}; padding-bottom: 1.5px; letter-spacing: 0.15px; }
                .bi-land-wrap .bi-no { white-space: nowrap; padding-right: 2px; }
                .bi-land-wrap .bi-sub { padding-left: 2px; }
                .bi-land-wrap .bi-col { text-align: center; padding-left: 0; padding-right: 3px; }
                .bi-land-wrap .bi-val { word-break: break-word; }
                .bi-land-wrap .bi-ortu { padding-right: 4px; word-break: break-word; }
                .bi-land-wrap .bi-dots { border-bottom: 0.8px dotted #333; min-height: 11px; }
            </style>
            <div class="bi-land-wrap">
                ${withKop ? buildKopSekolahBukuIndukHTML_(ctx, true) : ''}

                <div style="text-align: center; font-weight: bold; font-size: ${titleFs}; letter-spacing: 0.4px; margin-bottom: 1px;">
                    LEMBAR BUKU INDUK SISWA
                </div>
                <div style="text-align: center; font-size: ${subTitleFs}; margin-bottom: ${isCompact ? '3px' : '5px'};">
                    NOMOR INDUK SISWA : <b>${escBI_(nisDisp)}</b>
                </div>

                <table style="width: 100%; table-layout: fixed;">
                    <colgroup>
                        <col style="width: 47.5%;">
                        <col style="width: 3.5%;">
                        <col style="width: 49%;">
                    </colgroup>
                    <tr>
                        <!-- KOLOM KIRI: BAGIAN A s.d. D (POIN 1 - 22) -->
                        <td style="padding: 0;">
                            <table style="width: 100%; table-layout: fixed;">
                                <colgroup>
                                    <col style="width: 17px;">
                                    <col style="width: 44%;">
                                    <col style="width: 9px;">
                                    <col>
                                </colgroup>
                                <tr><td colspan="4" class="bi-sec" style="padding-top: 0;">A. KETERANGAN TENTANG SISWA</td></tr>
                                ${rowL('1.', 'Nama Siswa', namaLengkap)}
                                ${rowL('2.', 'NIS / NISN', nisNisnGabung)}
                                ${rowL('3.', 'NIK / No. KK', nikNoKkGabung)}
                                ${rowL('4.', 'Tempat dan Tanggal Lahir', ttl)}
                                ${rowL('5.', 'Jenis Kelamin', jk)}
                                ${rowL('6.', 'Agama', agama)}
                                ${rowL('7.', 'Kewarganegaraan', wargaSiswa)}
                                ${rowL('8.', 'Anak ke berapa', anakKe)}
                                ${rowL('9.', 'Jumlah Saudara Kandung', sdrKandung)}
                                ${rowL('10.', 'Jumlah Saudara Tiri / Angkat', sdrTiriAngkat)}
                                ${rowL('11.', 'Bahasa Sehari - hari di rumah', bahasa)}

                                <tr><td colspan="4" class="bi-sec">B. KETERANGAN TEMPAT TINGGAL</td></tr>
                                ${rowL('12.', 'Alamat', alamat, { extraPadBottom: isCompact ? '3px' : '7px' })}
                                ${rowL('13.', 'Nomor Telepon', telp)}
                                ${rowL('14.', 'Tinggal dengan Orang Tua /Saudara /<br>di Asrama / Kost', tinggalDengan, { bottom: true })}
                                ${rowL('15.', 'Jarak Tempat Tinggal ke Sekolah', jarak)}

                                <tr><td colspan="4" class="bi-sec">C. KETERANGAN KESEHATAN.</td></tr>
                                ${rowL('16.', 'Golongan Darah', goldar)}
                                ${rowL('17.', 'Penyakit yang pernah diderita<br>TBC / Cacar / Malaria / dan lain - lain', penyakit, { bottom: true })}
                                ${rowL('18.', 'Kelainan Jasmani', kelainan)}
                                ${rowL('19.', 'Tinggi dan Berat Badan', tinggiBerat)}

                                <tr><td colspan="4" class="bi-sec">D. KETERANGAN PENDIDIKAN</td></tr>
                                <tr><td class="bi-no">20.</td><td colspan="3">Pendidikan Sebelumnya</td></tr>
                                ${rowSubL('a.', 'Lulusan Dari', lulusanDari)}
                                ${rowSubL('b.', 'Tanggal dan Nomor STTB', noSttbSltp)}
                                ${rowSubL('c.', 'Lama Belajar', '')}
                                <tr><td class="bi-no">21.</td><td colspan="3">Pindahan.</td></tr>
                                ${rowSubL('a.', 'Dari Sekolah', pindahanDari)}
                                ${rowSubL('b.', 'Alasan', '')}
                                <tr><td class="bi-no">22.</td><td colspan="3">Diterima di Sekolah ini</td></tr>
                                ${rowSubL('a.', 'di Kelas', klsDiterima)}
                                ${rowSubL('b.', 'Program', programStudi, true)}
                                ${rowSubL('c.', 'Tanggal', tglDiterima)}
                            </table>
                        </td>

                        <!-- SPACER TENGAH -->
                        <td style="padding: 0;"></td>

                        <!-- KOLOM KANAN: BAGIAN E s.d. H (POIN 23 - 41) + 2 PAS FOTO -->
                        <td style="padding: 0;">
                            <!-- BAGIAN E: ORANG TUA DAN WALI -->
                            <table style="width: 100%; table-layout: fixed;">
                                <colgroup>
                                    <col style="width: 17px;">
                                    <col style="width: 27%;">
                                    <col style="width: 9px;">
                                    <col style="width: 24%;">
                                    <col style="width: 24%;">
                                    <col>
                                </colgroup>
                                <tr><td colspan="6" class="bi-sec" style="padding-top: 0;">E. KETERANGAN TENTANG ORANG TUA DAN WALI</td></tr>
                                <tr>
                                    <td class="bi-no"></td>
                                    <td></td>
                                    <td class="bi-col"></td>
                                    <td style="text-decoration: underline;">AYAH KANDUNG</td>
                                    <td style="text-decoration: underline;">IBU KANDUNG</td>
                                    <td style="text-decoration: underline;">WALI</td>
                                </tr>
                                ${rowOrtu('23.', 'Nama', namaAyah, namaIbu, namaWali)}
                                ${rowOrtu('24.', 'Tempat/tgl lahir', formatTglBI_(s[21], ''), formatTglBI_(s[24], ''), formatTglBI_(s[47], ''))}
                                ${rowOrtu('25.', 'Agama', hasAyah ? agama : '', hasIbu ? agama : '', hasWali ? agama : '')}
                                ${rowOrtu('26.', 'Kewarganegaraan', hasAyah ? wargaSiswa : '', hasIbu ? wargaSiswa : '', hasWali ? wargaSiswa : '')}
                                ${rowOrtu('27.', 'Pendidikan', cleanValBI_(s[40], ''), cleanValBI_(s[43], ''), cleanValBI_(s[49], ''))}
                                ${rowOrtu('28.', 'Pekerjaan', cleanValBI_(s[22], ''), cleanValBI_(s[25], ''), cleanValBI_(s[48], ''))}
                                ${rowOrtu('29.', 'Penghasilan per bulan', cleanValBI_(s[41], ''), cleanValBI_(s[44], ''), cleanValBI_(s[50], ''))}
                                ${rowOrtu('30.', 'Alamat Rumah', '', '', '')}
                                ${rowOrtu('31.', 'Nomor Telpon', '', '', '')}
                                ${rowOrtu('32.', 'Hidup / meninggal th', cleanValBI_(s[42], ''), cleanValBI_(s[45], ''), cleanValBI_(s[51], ''))}
                            </table>

                            <!-- BAGIAN F, G, H (KIRI 77%) + KOTAK PAS FOTO MASUK & KELUAR (KANAN 23%) -->
                            <table style="width: 100%; table-layout: fixed; margin-top: 1px;">
                                <colgroup>
                                    <col style="width: 77%;">
                                    <col style="width: 23%;">
                                </colgroup>
                                <tr>
                                    <td style="padding: 0; padding-right: 6px;">
                                        <table style="width: 100%; table-layout: fixed;">
                                            <colgroup>
                                                <col style="width: 17px;">
                                                <col style="width: 35.1%;">
                                                <col style="width: 9px;">
                                                <col>
                                            </colgroup>
                                            <tr><td colspan="4" class="bi-sec">F. KEGEMARAN SISWA</td></tr>
                                            <tr><td class="bi-no">33.</td><td>Kesenian</td><td class="bi-col">:</td><td class="bi-val">${escBI_(hobi.kesenian)}</td></tr>
                                            <tr><td class="bi-no">34.</td><td>Olah Raga</td><td class="bi-col">:</td><td class="bi-val">${escBI_(hobi.olahraga)}</td></tr>
                                            <tr><td class="bi-no">35.</td><td>Kemasyarakatan/<br>Organisasi</td><td class="bi-col" style="vertical-align: bottom;">:</td><td class="bi-val" style="vertical-align: bottom;">${escBI_(hobi.organisasi)}</td></tr>
                                            <tr><td class="bi-no">36.</td><td>Lain - Lain</td><td class="bi-col">:</td><td class="bi-val">${escBI_(hobi.lain)}</td></tr>

                                            <tr><td colspan="4" class="bi-sec">G. DATA REKENING &amp; KIP</td></tr>
                                            <tr><td class="bi-no">37.</td><td colspan="3">Data KIP / KKS</td></tr>
                                            ${rowSplitVal('a.&nbsp;Status KIP', statusKip, 'Nomor KIP', noKipDisp, '24%')}
                                            ${rowSplitVal('b.&nbsp;Status KKS', statusKks, 'No. KKS', noKksDisp, '24%')}
                                            <tr><td class="bi-no">38.</td><td colspan="3">Nomor Rekening Bank</td></tr>
                                            ${rowSplitVal('a.&nbsp;Bank', namaBank, 'b.&nbsp;No. Rekening', noRekening, '28%')}
                                            <tr><td class="bi-no"></td><td class="bi-sub">c.&nbsp;Atas Nama Rekening</td><td class="bi-col">:</td><td class="bi-val">${escBI_(atasNamaRek)}</td></tr>

                                            <tr><td colspan="4" class="bi-sec">H. STATUS AKHIR</td></tr>
                                            <tr><td class="bi-no">39.</td><td colspan="3">Meninggalkan Sekolah</td></tr>
                                            <tr><td class="bi-no"></td><td class="bi-sub">a.&nbsp;Tanggal</td><td class="bi-col">:</td><td class="bi-val">${escBI_(tglMeninggalkan)}</td></tr>
                                            <tr><td class="bi-no"></td><td class="bi-sub">b.&nbsp;Alasan</td><td class="bi-col">:</td><td class="bi-val">${escBI_(alasanMeninggalkan)}</td></tr>
                                            ${lulusExtraRowsHtml}
                                            <tr><td class="bi-no">40.</td><td>Melanjutkan di</td><td class="bi-col">:</td><td class="bi-val">${escBI_(lanjutDi)}</td></tr>
                                            <tr><td class="bi-no">41.</td><td colspan="3">Bekerja</td></tr>
                                            <tr><td class="bi-no"></td><td class="bi-sub">a.&nbsp;Tgl Mulai Kerja</td><td class="bi-col">:</td><td class="bi-val bi-dots"></td></tr>
                                            <tr><td class="bi-no"></td><td class="bi-sub">b.&nbsp;Nama Perusahaan /<br>&nbsp;&nbsp;&nbsp;&nbsp;Lembaga/ lainnya</td><td class="bi-col" style="vertical-align: bottom;">:</td><td class="bi-val bi-dots"></td></tr>
                                            <tr><td class="bi-no"></td><td class="bi-sub">c.&nbsp;Penghasilan</td><td class="bi-col">:</td><td class="bi-val bi-dots"></td></tr>
                                        </table>
                                    </td>
                                    <td style="padding: 0; padding-top: 6px;" align="right">
                                        ${boxFotoMasuk}
                                        <div style="height: ${photoGap};"></div>
                                        ${boxFotoKeluar}
                                    </td>
                                </tr>
                            </table>

                            ${withKop ? `
                            <div style="margin-top: 4px; text-align: right; font-size: 7.4pt; line-height: 1.15;">
                                <div style="display: inline-block; text-align: center; min-width: 170px;">
                                    ${escBI_(ctx.tempatCetak)}, ${escBI_(ctx.tglCetak)}<br>
                                    Kepala Sekolah,<br><br><br>
                                    <b><u>${escBI_(ctx.namaKepsek)}</u></b><br>
                                    ${escBI_(ctx.nipKepsek)}
                                </div>
                            </div>` : ''}
                        </td>
                    </tr>
                </table>
            </div>
        </div>
    `;
}

function initBukuIndukPreviewModalCleanup_() {
    if (_bukuIndukModalCleanupBound_) return;
    const modalEl = document.getElementById('mdlPdfPreview');
    if (!modalEl) return;

    if (!_defaultPdfModalMeta_) {
        _defaultPdfModalMeta_ = {
            title: $('#pdfPreviewTitle').html(),
            subTitle: $('#pdfPreviewSubTitle').html(),
            badge: $('#pdfPreviewBadgeFormat').html(),
            list: $('#pdfPreviewFormatList').html()
        };
    }

    modalEl.addEventListener('hidden.bs.modal', () => {
        $('#bukuIndukPreviewControls').addClass('d-none');
        if (_defaultPdfModalMeta_) {
            $('#pdfPreviewTitle').html(_defaultPdfModalMeta_.title);
            $('#pdfPreviewSubTitle').html(_defaultPdfModalMeta_.subTitle);
            $('#pdfPreviewBadgeFormat').html(_defaultPdfModalMeta_.badge);
            $('#pdfPreviewFormatList').html(_defaultPdfModalMeta_.list);
        }
        if (window._activeBukuIndukBlobUrl) {
            try { URL.revokeObjectURL(window._activeBukuIndukBlobUrl); } catch (e) { }
            window._activeBukuIndukBlobUrl = null;
        }
    });

    _bukuIndukModalCleanupBound_ = true;
}

function updateBukuIndukPreviewSidebar_(cfg, s) {
    initBukuIndukPreviewModalCleanup_();
    const spec = getPaperSpecBukuInduk_(cfg.paper);
    const isLandscape = cfg.orientation === 'landscape';
    const orientLabel = isLandscape ? 'Miring (Landscape)' : 'Tegak (Portrait)';
    const dimLabel = isLandscape ? spec.dimLandscape : spec.dimPortrait;

    $('#bukuIndukPreviewControls').removeClass('d-none');
    $('#selPreviewPaperBukuInduk').val(spec.key);
    $('#chkPreviewKopLandscape').prop('checked', Boolean(cfg.withKopLandscape));

    if (isLandscape) {
        $('#btnPreviewOrientLandscape').removeClass('btn-outline-primary').addClass('btn-primary');
        $('#btnPreviewOrientPortrait').removeClass('btn-primary').addClass('btn-outline-primary');
        $('#wrapPreviewKopLandscape').removeClass('d-none');
    } else {
        $('#btnPreviewOrientPortrait').removeClass('btn-outline-primary').addClass('btn-primary');
        $('#btnPreviewOrientLandscape').removeClass('btn-primary').addClass('btn-outline-primary');
        $('#wrapPreviewKopLandscape').addClass('d-none');
    }

    $('#pdfPreviewTitle').text('Pratinjau Lembar Buku Induk Siswa');
    $('#pdfPreviewSubTitle').text(`${cleanValBI_(s[2], 'Siswa')} — Format ${spec.label} ${orientLabel}`);
    $('#pdfPreviewBadgeFormat').text(`${spec.label} ${isLandscape ? 'Landscape' : 'Tegak'}`);
    $('#pdfPreviewFormatList').html(`
        <li><i class="bi bi-aspect-ratio text-primary me-2"></i><b>Kertas:</b> ${escBI_(spec.label)} (${escBI_(dimLabel)})</li>
        <li><i class="bi bi-arrows-expand text-primary me-2"></i><b>Orientasi:</b> ${escBI_(orientLabel)}</li>
        <li><i class="bi bi-journal-check text-success me-2"></i><b>Model:</b> ${isLandscape ? '2 Kolom Resmi (Bagian A–H, 41 Poin)' : '1 Kolom + Kop Sekolah & TTD'}</li>
        <li><i class="bi bi-person-vcard text-primary me-2"></i><b>Siswa:</b> ${escBI_(cleanValBI_(s[2], '-'))} (${escBI_(cleanValBI_(s[0], '-'))})</li>
    `);
}

function renderBukuIndukToPreview_(ctx) {
    if (!ctx || !ctx.siswa) return;
    const s = ctx.siswa;
    const cfg = ctx.cfg;
    const spec = getPaperSpecBukuInduk_(cfg.paper);
    const isLandscape = cfg.orientation === 'landscape';

    saveBukuIndukPrefs_({
        orientation: cfg.orientation,
        paper: spec.key,
        withKopLandscape: Boolean(cfg.withKopLandscape)
    });

    updateBukuIndukPreviewSidebar_(cfg, s);

    $('#loader').removeClass('hidden');
    $('#loaderText').text(`Menyiapkan PDF Buku Induk (${isLandscape ? 'Versi Miring' : 'Versi Tegak'})...`);

    const html = isLandscape
        ? buildBukuIndukLandscapeHTML_(s, ctx.imgMasuk, ctx.imgKeluar, cfg, ctx)
        : buildBukuIndukPortraitHTML_(s, ctx.imgMasuk, ctx.imgKeluar, cfg, ctx);

    const safeName = cleanValBI_(s[2] || s[0], 'Siswa').replace(/[/\\?%*:|"<>]/g, '_');
    const opt = {
        margin: isLandscape ? [0.55, 0.85, 0.55, 0.85] : [0.8, 1.3, 0.9, 1.3],
        filename: `Buku_Induk_${isLandscape ? 'Landscape' : 'Tegak'}-${safeName}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, scrollX: 0, scrollY: 0, windowY: 0, useCORS: true, logging: false },
        jsPDF: { unit: 'cm', format: spec.format, orientation: isLandscape ? 'landscape' : 'portrait' }
    };

    setTimeout(() => {
        html2pdf().set(opt).from(html).toPdf().get('pdf').then(function (pdf) {
            if (window._activeBukuIndukBlobUrl) {
                try { URL.revokeObjectURL(window._activeBukuIndukBlobUrl); } catch (e) { }
            }
            const blobUrl = pdf.output('bloburl');
            window._activeBukuIndukBlobUrl = blobUrl;
            $('#pdfPreviewFrame').attr('src', blobUrl);
            $('#btnOpenPdf').attr('href', blobUrl);
            $('#btnDownloadPdf').off('click').on('click', function () {
                pdf.save(opt.filename);
            });
            if (!$('#mdlPdfPreview').hasClass('show')) {
                $('#mdlPdfPreview').modal('show');
            }
            $('#loader').addClass('hidden');
            $('#loaderText').text('Memuat Data...');
        }).catch(function (err) {
            console.error('[BukuInduk PDF] Gagal membuat PDF:', err);
            $('#loader').addClass('hidden');
            $('#loaderText').text('Memuat Data...');
            Swal.fire('Gagal Membuat PDF', 'Terjadi kendala saat menyusun pratinjau PDF Buku Induk.', 'error');
        });
    }, 250);
}

window.switchBukuIndukPreviewOrientation = function (newOrientation) {
    const ctx = window._activeBukuIndukCtx;
    if (!ctx) return;
    const target = newOrientation === 'landscape' ? 'landscape' : 'portrait';
    if (ctx.cfg.orientation === target) return;
    ctx.cfg.orientation = target;
    renderBukuIndukToPreview_(ctx);
};

window.applyBukuIndukPreviewChange = function () {
    const ctx = window._activeBukuIndukCtx;
    if (!ctx) return;
    const selectedPaper = $('#selPreviewPaperBukuInduk').val() || 'f4';
    const withKop = $('#chkPreviewKopLandscape').is(':checked');
    ctx.cfg.paper = ['f4', 'a4', 'legal'].includes(selectedPaper) ? selectedPaper : 'f4';
    ctx.cfg.withKopLandscape = Boolean(withKop);
    renderBukuIndukToPreview_(ctx);
};

function promptCetakBukuInduk_(s, callback) {
    const prefs = loadBukuIndukPrefs_();
    const today = new Date().toISOString().split('T')[0];
    const activeModal = document.querySelector('.modal.show');

    Swal.fire({
        target: activeModal || document.body,
        title: 'Pengaturan Cetak Buku Induk',
        width: 560,
        html: `
            <div class="text-start" style="font-family: Arial, sans-serif; font-size: 0.9rem;">
                <div class="p-2 mb-3 rounded bg-light border small">
                    <i class="bi bi-person-badge text-primary me-1"></i>
                    <b>${escBI_(cleanValBI_(s[2], '-'))}</b>
                    <span class="text-muted ms-1">(NIS: ${escBI_(cleanValBI_(s[0], '-'))} / NISN: ${escBI_(cleanValBI_(s[1], '-'))})</span>
                </div>

                <label class="small fw-bold mb-2 d-block text-dark">1. Pilih Versi / Orientasi Kertas:</label>
                <div class="row g-2 mb-3">
                    <div class="col-6">
                        <label class="w-100 h-100 p-2 rounded border d-block" id="lblCardPortraitBI" style="cursor:pointer; transition:0.15s;">
                            <div class="d-flex align-items-center gap-2 mb-1">
                                <input type="radio" name="swal-bi-orient" value="portrait" ${prefs.orientation === 'portrait' ? 'checked' : ''}>
                                <span class="fw-bold text-dark"><i class="bi bi-file-earmark-richtext text-primary me-1"></i>Versi Tegak</span>
                            </div>
                            <div class="text-muted" style="font-size: 0.76rem; line-height: 1.35;">
                                Kertas berdiri (Portrait), ringkas 1 kolom lengkap dengan Kop Sekolah & TTD Kepsek.
                            </div>
                        </label>
                    </div>
                    <div class="col-6">
                        <label class="w-100 h-100 p-2 rounded border d-block" id="lblCardLandscapeBI" style="cursor:pointer; transition:0.15s;">
                            <div class="d-flex align-items-center gap-2 mb-1">
                                <input type="radio" name="swal-bi-orient" value="landscape" ${prefs.orientation === 'landscape' ? 'checked' : ''}>
                                <span class="fw-bold text-dark"><i class="bi bi-book text-success me-1"></i>Versi Miring</span>
                            </div>
                            <div class="text-muted" style="font-size: 0.76rem; line-height: 1.35;">
                                Kertas melebar (Landscape), format standar Buku Induk 2 kolom (Bagian A–H, 41 poin).
                            </div>
                        </label>
                    </div>
                </div>

                <div class="row g-2 mb-2">
                    <div class="col-12">
                        <label class="small fw-bold mb-1">2. Ukuran Kertas:</label>
                        <select id="swal-bi-paper" class="form-select form-select-sm">
                            <option value="f4" ${prefs.paper === 'f4' ? 'selected' : ''}>F4 / Folio (33 x 21.5 cm) — Disarankan Buku Induk</option>
                            <option value="a4" ${prefs.paper === 'a4' ? 'selected' : ''}>A4 (29.7 x 21.0 cm)</option>
                            <option value="legal" ${prefs.paper === 'legal' ? 'selected' : ''}>Legal (35.6 x 21.6 cm)</option>
                        </select>
                    </div>
                </div>

                <div class="form-check form-switch mb-3 ${prefs.orientation === 'landscape' ? '' : 'd-none'}" id="swal-wrap-kop-landscape">
                    <input class="form-check-input" type="checkbox" id="swal-bi-kop-land" ${prefs.withKopLandscape ? 'checked' : ''}>
                    <label class="form-check-label small text-secondary" for="swal-bi-kop-land">
                        Sertakan Kop Sekolah & TTD Kepala Sekolah pada Versi Miring
                    </label>
                </div>

                <div class="row g-2">
                    <div class="col-6">
                        <label class="small fw-bold mb-1">Tempat (Kota/Kab):</label>
                        <input id="swal-tempat" class="form-control form-control-sm" placeholder="Contoh: Tebo" value="${escBI_(prefs.tempat || '')}">
                    </div>
                    <div class="col-6">
                        <label class="small fw-bold mb-1">Tanggal Cetak:</label>
                        <input type="date" id="swal-tanggal" class="form-control form-control-sm" value="${today}">
                    </div>
                </div>
            </div>
        `,
        showCancelButton: true,
        confirmButtonText: '<i class="bi bi-printer"></i> Tampilkan Pratinjau PDF',
        cancelButtonText: 'Batal',
        confirmButtonColor: '#2563eb',
        didOpen: () => {
            const container = document.querySelector('.swal2-container');
            if (container) container.style.setProperty('z-index', '99999', 'important');
            document.querySelectorAll('.modal').forEach(m => m.removeAttribute('tabindex'));

            const syncCardHighlight = () => {
                const val = document.querySelector('input[name="swal-bi-orient"]:checked')?.value || 'portrait';
                const cardP = document.getElementById('lblCardPortraitBI');
                const cardL = document.getElementById('lblCardLandscapeBI');
                const wrapKop = document.getElementById('swal-wrap-kop-landscape');
                if (cardP && cardL) {
                    cardP.style.borderColor = val === 'portrait' ? '#2563eb' : '#dee2e6';
                    cardP.style.backgroundColor = val === 'portrait' ? '#eff6ff' : '#ffffff';
                    cardL.style.borderColor = val === 'landscape' ? '#16a34a' : '#dee2e6';
                    cardL.style.backgroundColor = val === 'landscape' ? '#f0fdf4' : '#ffffff';
                }
                if (wrapKop) {
                    wrapKop.classList.toggle('d-none', val !== 'landscape');
                }
            };
            document.querySelectorAll('input[name="swal-bi-orient"]').forEach(r => {
                r.addEventListener('change', syncCardHighlight);
            });
            syncCardHighlight();
        },
        willClose: () => {
            document.querySelectorAll('.modal').forEach(m => m.setAttribute('tabindex', '-1'));
        },
        preConfirm: () => {
            const orientation = document.querySelector('input[name="swal-bi-orient"]:checked')?.value === 'landscape'
                ? 'landscape'
                : 'portrait';
            const paper = document.getElementById('swal-bi-paper')?.value || 'f4';
            const withKopLandscape = Boolean(document.getElementById('swal-bi-kop-land')?.checked);
            const rawTempat = (document.getElementById('swal-tempat')?.value || '').trim();
            const tgl = document.getElementById('swal-tanggal')?.value || today;

            saveBukuIndukPrefs_({
                orientation,
                paper,
                withKopLandscape,
                tempat: rawTempat
            });

            return {
                orientation,
                paper,
                withKopLandscape,
                tempat: rawTempat || '.....................',
                tanggal: tgl
            };
        }
    }).then((res) => {
        if (res.isConfirmed && res.value) {
            const tglIndo = (typeof formatTglIndoJS === 'function')
                ? formatTglIndoJS(res.value.tanggal)
                : res.value.tanggal;
            callback(res.value.tempat, tglIndo, {
                orientation: res.value.orientation,
                paper: res.value.paper,
                withKopLandscape: res.value.withKopLandscape
            });
        }
    });
}

async function cetakPDF(nis) {
    const s = await findSiswaForBukuInduk_(nis);
    if (!s) {
        Swal.fire('Data Tidak Ditemukan', 'Data siswa tidak ditemukan. Silakan segarkan tabel Buku Induk lalu coba kembali.', 'warning');
        return;
    }

    promptCetakBukuInduk_(s, async (tempatCetak, tglCetak, cfg) => {
        $('#loader').removeClass('hidden');
        $('#loaderText').text('Menyiapkan Pratinjau PDF Buku Induk...');

        const conf = (typeof globalConf !== 'undefined' && globalConf) ? globalConf : {};
        const imgInstansi = $('#headerLogoInstansi').attr('src') || $('#prevLogoInstansi').attr('src') || '';
        const imgSekolah = $('#headerLogoSekolah').attr('src') || $('#prevLogoSekolah').attr('src') || '';
        const namaKepsek = conf.nama_kepsek || '.....................................';
        const nipKepsek = conf.nip_kepsek ? 'NIP. ' + conf.nip_kepsek : 'NIP. -';

        const modalOpenSameNis = $('#mdlSiswa').hasClass('show')
            && String($('#frmSiswa [name="nis"]').val() || '').trim() === String(s[0] || '').replace(/^'+/, '').trim();
        const [imgMasuk, imgKeluar] = await Promise.all([
            resolveFotoBukuInduk_(s[35], modalOpenSameNis ? '#prev_masuk' : ''),
            resolveFotoBukuInduk_(s[36], modalOpenSameNis ? '#prev_keluar' : '')
        ]);

        const ctx = {
            siswa: s,
            imgMasuk: imgMasuk || '',
            imgKeluar: imgKeluar || '',
            imgInstansi,
            imgSekolah,
            conf,
            tempatCetak,
            tglCetak,
            namaKepsek,
            nipKepsek,
            cfg
        };

        window._activeBukuIndukCtx = ctx;
        renderBukuIndukToPreview_(ctx);
    });
}

function syncMasterBukuIndukToolbar_() {
    const prefs = loadBukuIndukPrefs_();
    const btnP = document.getElementById('btnMasterOrientPortrait');
    const btnL = document.getElementById('btnMasterOrientLandscape');
    const selPaper = document.getElementById('selMasterPaperBukuInduk');

    if (btnP && btnL) {
        if (prefs.orientation === 'landscape') {
            btnL.classList.remove('btn-outline-success');
            btnL.classList.add('btn-success', 'text-white');
            btnP.classList.remove('btn-primary', 'text-white');
            btnP.classList.add('btn-outline-primary');
        } else {
            btnP.classList.remove('btn-outline-primary');
            btnP.classList.add('btn-primary', 'text-white');
            btnL.classList.remove('btn-success', 'text-white');
            btnL.classList.add('btn-outline-success');
        }
    }
    if (selPaper) {
        selPaper.value = prefs.paper || 'f4';
    }
}

window.setDefaultBukuIndukOrientation = function (orient) {
    const target = orient === 'landscape' ? 'landscape' : 'portrait';
    saveBukuIndukPrefs_({ orientation: target });
    if (typeof Swal !== 'undefined') {
        const Toast = Swal.mixin({ toast: true, position: 'top-end', showConfirmButton: false, timer: 2200 });
        Toast.fire({
            icon: 'success',
            title: target === 'landscape'
                ? 'Model Buku Induk diatur ke: Versi Miring (2 Kolom Resmi A–H)'
                : 'Model Buku Induk diatur ke: Versi Tegak (1 Kolom + Kop)'
        });
    }
};

window.setDefaultBukuIndukPaper = function (paper) {
    const target = ['f4', 'a4', 'legal'].includes(paper) ? paper : 'f4';
    saveBukuIndukPrefs_({ paper: target });
};

window.cetakBukuIndukDariModal = function (orient) {
    const nis = $('#frmSiswa [name="nis"]').val();
    if (!nis) return;
    if (orient === 'landscape' || orient === 'portrait') {
        saveBukuIndukPrefs_({ orientation: orient });
    }
    cetakPDF(nis);
};

// Sinkronkan toolbar Master Buku Induk & tombol Cetak pada Modal Detail Siswa
(function bindBukuIndukUiEvents_() {
    const bindAll = () => {
        syncMasterBukuIndukToolbar_();

    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', bindAll);
    } else {
        bindAll();
    }
    document.addEventListener('HtmlIncludesLoaded', bindAll);
})();

function showHapusSemuaData() {
    Swal.fire({
        title: 'HAPUS SEMUA DATA?',
        text: 'PERINGATAN! Semua data Siswa Aktif, Alumni, dan Siswa Keluar akan dihapus secara permanen. Ketik "HAPUS" untuk melanjutkan:',
        input: 'text',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#d33',
        cancelButtonColor: '#3085d6',
        confirmButtonText: 'Ya, Hapus Semua!',
        cancelButtonText: 'Batal',
        preConfirm: (inputValue) => {
            if (inputValue !== 'HAPUS') {
                Swal.showValidationMessage('Anda harus mengetik "HAPUS" untuk melanjutkan');
                return false;
            }
            return true;
        }
    }).then((result) => {
        if (result.isConfirmed) {
            $('#loader').removeClass('hidden');
            callAPI('hapusSemuaSiswa').then(res => {
                $('#loader').addClass('hidden');
                if (res.status === 'success') {
                    globalSiswa = [];
                    if (typeof globalAlumniData !== 'undefined') window.globalAlumniData = [];
                    if (typeof invalidateUnifiedCaches === 'function') invalidateUnifiedCaches();
                    showCoolAlert('Berhasil', 'Semua data siswa berhasil dihapus.', 'success');
                    refreshPage();
                } else {
                    showCoolAlert('Gagal', res.message, 'error');
                }
            }).catch(err => {
                $('#loader').addClass('hidden');
                showCoolAlert('Error', err.message, 'error');
            });
        }
    });
}

function showImportSiswaPopup() {
    Swal.fire({
        title: 'Import Data Siswa',
        html: `
            <div class="mb-3 text-start">
                <label class="form-label small fw-bold text-muted">Mode Import:</label>
                <select id="swalImportMode" class="form-select form-select-sm mb-3" onchange="document.getElementById('importTemplateBtn').style.display = (this.value=='manual' ? 'block' : 'none');">
                    <option value="aktif">Siswa Aktif (Dapodik Excel)</option>
                    <option value="keluar">Alumni / Siswa Keluar (Dapodik Excel)</option>
                    <option value="manual">Template Excel SiBuk InSTal (.xlsx)</option>
                </select>
                
                <div id="importTemplateBtn" style="display: none;">
                    <button onclick="downloadTemplate('siswa')" class="btn btn-outline-success btn-sm w-100 mb-3 fw-bold">
                        <i class="bi bi-file-earmark-excel me-1"></i> Unduh Template Excel (.xlsx)
                    </button>
                </div>
                
                <label class="form-label small fw-bold text-muted">Pilih File Excel:</label>
                <input type="file" id="swalImportSiswaFile" class="form-control form-control-sm" accept=".xlsx, .xls, .csv, .xml">
                <div class="d-flex justify-content-between align-items-center mt-2">
                    <small class="text-muted"><i class="bi bi-info-circle me-1"></i> Mendukung format resmi Dapodik & Template Excel.</small>
                </div>
            </div>
        `,
        showCancelButton: true,
        confirmButtonText: '<i class="bi bi-upload me-1"></i> Mulai Import',
        cancelButtonText: 'Batal',
        confirmButtonColor: '#36b9cc',
        preConfirm: () => {
            const fileInput = document.getElementById('swalImportSiswaFile');
            const mode = document.getElementById('swalImportMode').value;
            if (!fileInput.files || fileInput.files.length === 0) {
                Swal.showValidationMessage('Pilih file terlebih dahulu!');
                return false;
            }
            return { file: fileInput.files[0], mode: mode };
        }
    }).then((result) => {
        if (result.isConfirmed) {
            importSiswa(result.value.file, result.value.mode);
        }
    });
}

function cleanImportNis_(val) {
    let s = String(val === undefined || val === null ? '' : val).trim().replace(/^['"]+|['"]+$/g, '').trim();
    if (!s || s === '-' || /^0+$/.test(s) || s.toLowerCase() === 'null' || s.toLowerCase() === 'undefined') return '';
    return s;
}

function parseImportCsvLine_(text, delimiter) {
    const result = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < text.length; i++) {
        const c = text[i];
        if (c === '"') {
            if (inQuotes && text[i + 1] === '"') {
                current += '"';
                i++;
            } else {
                inQuotes = !inQuotes;
            }
        } else if (c === delimiter && !inQuotes) {
            result.push(current.trim());
            current = '';
        } else {
            current += c;
        }
    }
    result.push(current.trim());
    return result;
}

function showImportSiswaResult_(res, siswaTanpaNis) {
    const missingList = Array.isArray(siswaTanpaNis) ? siswaTanpaNis.slice() : [];
    if (missingList.length === 0 && res && Array.isArray(res.missingNisNames) && res.missingNisNames.length > 0) {
        res.missingNisNames.forEach((nm, idx) => {
            missingList.push({ baris: idx + 1, nama: String(nm || 'Tanpa Nama'), nisn: '-' });
        });
    }
    const missingCount = missingList.length || (res && Number(res.missingNisCount) > 0 ? Number(res.missingNisCount) : 0);

    const esc = (v) => (typeof escapeHTML === 'function'
        ? escapeHTML(String(v == null ? '' : v))
        : String(v == null ? '' : v).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[m])));

    if (missingCount > 0) {
        const listItemsHtml = missingList.length > 0
            ? '<ol class="mb-0 ps-3">' + missingList.map(item => {
                const nm = esc(item.nama || 'Tanpa Nama');
                const nsn = item.nisn && item.nisn !== '-' ? ` <span class="text-muted">(NISN: ${esc(item.nisn)})</span>` : '';
                const brs = item.baris ? ` <span class="text-secondary">[Baris ${esc(item.baris)}]</span>` : '';
                return `<li class="mb-1"><b>${nm}</b>${nsn}${brs}</li>`;
            }).join('') + '</ol>'
            : `<div class="text-muted">Terdapat ${missingCount} baris siswa dengan kolom NIS / NIPD kosong.</div>`;

        if (res && res.status == 'success') {
            Swal.fire({
                title: 'Perhatian: Sebagian Data Ditolak!',
                icon: 'warning',
                confirmButtonColor: '#f6c23e',
                confirmButtonText: 'Mengerti',
                html: `
                    <div class="text-start">
                        <div class="alert alert-success py-2 px-3 small mb-2">
                            <i class="bi bi-check-circle-fill me-1"></i> ${esc(res.message)}
                        </div>
                        <div class="alert alert-danger py-2 px-3 small mb-2">
                            <i class="bi bi-x-octagon-fill me-1"></i>
                            <b>${missingCount} siswa TIDAK BISA MASUK import</b> karena <b>NIS / NIPD tidak ada (kosong)</b>:
                        </div>
                        <div class="border rounded p-2 bg-light small" style="max-height: 190px; overflow-y: auto;">
                            ${listItemsHtml}
                        </div>
                        <div class="text-muted small mt-2">
                            Silakan lengkapi kolom <b>NIS / NIPD</b> pada siswa tersebut terlebih dahulu sebelum di-import ulang.
                        </div>
                    </div>
                `
            });
            return;
        }

        Swal.fire({
            title: 'Import Ditolak: NIS Tidak Ada!',
            icon: 'error',
            confirmButtonColor: '#e74a3b',
            confirmButtonText: 'Tutup',
            html: `
                <div class="text-start">
                    <div class="alert alert-danger py-2 px-3 small mb-2">
                        <i class="bi bi-exclamation-triangle-fill me-1"></i>
                        <b>${missingCount} siswa tidak dapat di-import</b> karena <b>NIS / NIPD tidak ada (kosong)</b>!
                    </div>
                    <div class="border rounded p-2 bg-light small" style="max-height: 190px; overflow-y: auto;">
                        ${listItemsHtml}
                    </div>
                    <div class="text-muted small mt-2">
                        Data siswa tanpa NIS / NIPD otomatis ditolak agar Nomor Induk tetap valid. Silakan isi NIS / NIPD di file Excel terlebih dahulu.
                    </div>
                </div>
            `
        });
        return;
    }

    if (res && res.status == 'success') {
        showCoolAlert('Berhasil', res.message, 'success');
    } else {
        showCoolAlert('Gagal', (res && res.message) || 'Gagal memproses import data siswa.', 'error');
    }
}
if (typeof window !== 'undefined') {
    window.cleanImportNis_ = cleanImportNis_;
    window.showImportSiswaResult_ = showImportSiswaResult_;
}

function importSiswa(file, mode) {
    if (!file) return;
    $('#loader').removeClass('hidden');

    const cleanCsvCell = (val) => {
        let s = String(val === undefined || val === null ? '' : val).trim();
        if (s.includes('"') || s.includes(',') || s.includes('\n') || s.includes('\r') || s.includes(';')) {
            return '"' + s.replace(/"/g, '""') + '"';
        }
        return s;
    };

    const isManualHeaderRow = (cols) => {
        if (!Array.isArray(cols) || cols.length === 0) return false;
        const c0 = String(cols[0] === undefined || cols[0] === null ? '' : cols[0]).trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
        const c2 = String(cols[2] === undefined || cols[2] === null ? '' : cols[2]).trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
        if (['nis', 'nipd', 'no induk', 'nomor induk'].includes(c0)) return true;
        if (!c0 && ['nama', 'nama lengkap', 'nama siswa', 'nama peserta didik'].includes(c2)) return true;
        return false;
    };

    if (mode === 'manual') {
        const fileName = (file.name || '').toLowerCase();
        const isExcel = fileName.endsWith('.xlsx') || fileName.endsWith('.xls') || fileName.endsWith('.xml');

        const sendManualData = (csvData, siswaTanpaNis) => {
            callAPI('importSiswaBulk', { csvData: csvData }).then(res => {
                $('#loader').addClass('hidden');
                showImportSiswaResult_(res, siswaTanpaNis);
                if (res && res.status == 'success') {
                    refreshAfterStudentImport();
                }
            }).catch(err => {
                $('#loader').addClass('hidden');
                showCoolAlert('Gagal', (err && err.message) || 'Gagal memproses import data siswa', 'error');
            });
        };

        if (isExcel) {
            let reader = new FileReader();
            reader.onload = function (e) {
                try {
                    let data = new Uint8Array(e.target.result);
                    let workbook = XLSX.read(data, { type: 'array' });
                    let firstSheetName = workbook.SheetNames[0];
                    let worksheet = workbook.Sheets[firstSheetName];
                    let rows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "" });

                    if (!rows || rows.length < 2) {
                        $('#loader').addClass('hidden');
                        showCoolAlert('Gagal', 'File Excel kosong atau tidak memiliki baris data siswa!', 'error');
                        return;
                    }

                    let siswaTanpaNis = [];
                    let acceptedRows = [];
                    let validDataCount = 0;

                    rows.forEach((r, idx) => {
                        if (!r || r.length === 0 || !r.some(c => String(c === undefined || c === null ? '' : c).trim() !== '')) return;
                        if (acceptedRows.length === 0 && isManualHeaderRow(r)) {
                            acceptedRows.push(r);
                            return;
                        }
                        if (isManualHeaderRow(r)) return;

                        const nisVal = cleanImportNis_(r[0]);
                        const nisnVal = cleanImportNis_(r[1]);
                        const namaVal = String(r[2] === undefined || r[2] === null ? '' : r[2]).trim();
                        if (!nisVal) {
                            siswaTanpaNis.push({
                                baris: idx + 1,
                                nama: (namaVal || 'Tanpa Nama').toUpperCase(),
                                nisn: nisnVal || '-'
                            });
                            return;
                        }
                        acceptedRows.push(r);
                        validDataCount++;
                    });

                    if (validDataCount === 0) {
                        $('#loader').addClass('hidden');
                        if (siswaTanpaNis.length > 0) {
                            showImportSiswaResult_(null, siswaTanpaNis);
                        } else {
                            showCoolAlert('Gagal', 'File Excel tidak memiliki baris data siswa yang valid!', 'error');
                        }
                        return;
                    }

                    let csvData = acceptedRows.map(r => r.map(cleanCsvCell).join(',')).join('\r\n');
                    sendManualData(csvData, siswaTanpaNis);
                } catch (err) {
                    $('#loader').addClass('hidden');
                    showCoolAlert('Gagal', 'Gagal membaca file Excel: ' + err.message, 'error');
                }
            };
            reader.readAsArrayBuffer(file);
        } else {
            let reader = new FileReader();
            reader.onload = function (e) {
                try {
                    const rawCsv = String(e.target.result || '');
                    const lines = rawCsv.split(/\r?\n/);
                    let delimiter = ',';
                    for (const l of lines) {
                        if (l.trim()) {
                            if ((l.match(/;/g) || []).length > (l.match(/,/g) || []).length) delimiter = ';';
                            break;
                        }
                    }

                    let siswaTanpaNis = [];
                    let acceptedLines = [];
                    let validDataCount = 0;

                    lines.forEach((line, idx) => {
                        if (!line || !line.trim()) return;
                        const cols = parseImportCsvLine_(line, delimiter).map(c => c.replace(/^"|"$/g, '').trim());
                        if (!cols.some(c => c !== '')) return;
                        if (acceptedLines.length === 0 && isManualHeaderRow(cols)) {
                            acceptedLines.push(line);
                            return;
                        }
                        if (isManualHeaderRow(cols)) return;

                        const nisVal = cleanImportNis_(cols[0]);
                        const nisnVal = cleanImportNis_(cols[1]);
                        const namaVal = String(cols[2] || '').trim();
                        if (!nisVal) {
                            siswaTanpaNis.push({
                                baris: idx + 1,
                                nama: (namaVal || 'Tanpa Nama').toUpperCase(),
                                nisn: nisnVal || '-'
                            });
                            return;
                        }
                        acceptedLines.push(line);
                        validDataCount++;
                    });

                    if (validDataCount === 0) {
                        $('#loader').addClass('hidden');
                        if (siswaTanpaNis.length > 0) {
                            showImportSiswaResult_(null, siswaTanpaNis);
                        } else {
                            showCoolAlert('Gagal', 'File CSV kosong atau tidak memiliki data siswa yang valid!', 'error');
                        }
                        return;
                    }

                    sendManualData(acceptedLines.join('\r\n'), siswaTanpaNis);
                } catch (err) {
                    $('#loader').addClass('hidden');
                    showCoolAlert('Gagal', 'Gagal membaca file CSV: ' + err.message, 'error');
                }
            };
            reader.readAsText(file);
        }
    } else {
        // Mode Dapodik (Aktif / Keluar / Alumni)
        let reader = new FileReader();
        reader.onload = function (e) {
            try {
                let data = new Uint8Array(e.target.result);
                // SheetJS bisa membaca .xlsx, .xls BIFF8 maupun SpreadsheetML
                let workbook = XLSX.read(data, { type: 'array' });
                let firstSheetName = workbook.SheetNames[0];
                let worksheet = workbook.Sheets[firstSheetName];

                // Konversi sheet ke JSON (array of arrays)
                let rows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "" });

                let headers = [];
                let headerRowIndex = -1;

                const norm = (s) => String(s || "").trim().toLowerCase().replace(/\s+/g, " ");

                // Cari baris header Dapodik (baik Siswa Aktif maupun Siswa Keluar / Alumni)
                for (let i = 0; i < 25 && i < rows.length; i++) {
                    if (rows[i] && rows[i].length > 0) {
                        let rowStr = rows[i].map(c => norm(c)).join(" ");
                        let hasNama = rowStr.includes("nama") || rowStr.includes("peserta didik");
                        let hasId = rowStr.includes("nipd") || rowStr.includes("nisn") || rowStr.includes("nik") || rowStr.includes("no induk") || rowStr.includes("nis");
                        if (hasNama && hasId) {
                            headers = rows[i];
                            headerRowIndex = i;
                            break;
                        }
                    }
                }

                if (headerRowIndex === -1) {
                    throw new Error("Gagal menemukan baris header pada file Excel Dapodik. Pastikan file memiliki kolom Nama dan NIPD/NISN/No Induk.");
                }

                const normalizedHeaders = headers.map(h => norm(h));

                // Label blok keluarga dapat bergeser karena merge cell pada export Dapodik
                let familySubheaders = rows[headerRowIndex + 1] || [];
                let familyStarts = [];
                for (let c = 0; c < familySubheaders.length; c++) {
                    let sub = norm(familySubheaders[c]);
                    if (sub === "nama" || sub === "nama lengkap") {
                        familyStarts.push(c);
                    }
                }

                let ayahStartIndex = familyStarts[0] !== undefined ? familyStarts[0] : normalizedHeaders.findIndex(h => h.includes("ayah") && (h.includes("nama") || h.includes("data")));
                let ibuStartIndex = familyStarts[1] !== undefined ? familyStarts[1] : normalizedHeaders.findIndex(h => h.includes("ibu") && (h.includes("nama") || h.includes("data")));
                let waliStartIndex = familyStarts[2] !== undefined ? familyStarts[2] : normalizedHeaders.findIndex(h => h.includes("wali") && (h.includes("nama") || h.includes("data")));

                // SiBuk InSTal 68 kolom standard
                let simisterbinCsv = "NIS,NISN,Nama,NIK,NoKK,TempatLahir,TglLahir,JK,Agama,AnakKe,JmlSdr,Bahasa,Alamat,NoHP,Jarak,Transport,Tinggi,Berat,Goldar,Penyakit,NamaAyah,TglLahirAyah,KerjaAyah,NamaIbu,TglLahirIbu,KerjaIbu,PindahanDari,LulusanDari,NoIjazahSLTP,KlsMasuk,TglMasuk,StatusAkhir,TglKeluar,LanjutKe,NoIjazahSMA,ID_Foto_Masuk,ID_Foto_Keluar,Password_Login,Masa_Berlaku,Hobby,Pdd Ayah,Penghasilan Ayah,Status Ayah,Pdd Ibu,Penghasilan Ibu,Status Ibu,Nama Wali,Tgl Lahir Wali,Kerja Wali,Pdd Wali,Penghasilan Wali,Status Wali,KlsSaatIni,Email,Alasan Keluar,No Registrasi Akta Lahir,Kewarganegaraan,Penerima KIP,Nomor KIP,Nama di KIP,Nomor KKS,Penerima KPS,Nomor KPS,Nama Bank,Nomor Rekening Bank,Rekening Atas Nama,Berkebutuhan Khusus,Jenis Kebutuhan Khusus\n";

                // Fungsi bantu kapitalisasi (Title Case)
                const toTitleCase = (str) => {
                    if (!str) return "";
                    return String(str).toLowerCase().split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
                };

                // Fungsi bantu untuk CSV
                const cleanCsv = (text) => {
                    if (text === undefined || text === null) return "";
                    let str = String(text).trim().replace(/"/g, '""');
                    if (str.includes(',') || str.includes('\n') || str.includes('\r') || str.includes(';')) {
                        return `"${str}"`;
                    }
                    return str;
                };

                // Fungsi cerdas untuk parsing tanggal
                const smartDate = (d) => {
                    if (!d) return "";
                    if (typeof d === 'number' && d > 20000 && d < 60000) {
                        let dateObj = new Date(Math.round((d - 25569) * 86400 * 1000));
                        let y = dateObj.getFullYear();
                        let m = String(dateObj.getMonth() + 1).padStart(2, '0');
                        let day = String(dateObj.getDate()).padStart(2, '0');
                        return `${y}-${m}-${day}`;
                    }
                    let s = String(d).trim();
                    if (s.match(/^\d{4}$/)) return s + "-01-01"; // Hanya tahun
                    let dmy = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
                    if (dmy) {
                        return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
                    }
                    return s;
                };

                // Fungsi cerdas untuk pendidikan
                const smartPdd = (p) => {
                    if (!p) return "";
                    let s = String(p).trim().toLowerCase();
                    if (s.includes("meninggal")) return "Sudah meninggal";
                    if (s.includes("putus")) return "Putus SD";
                    if (s.includes("tidak sekolah")) return "Tidak sekolah";
                    if (s.includes("sd")) return "SD / sederajat";
                    if (s.includes("smp") || s.includes("sltp")) return "SMP / sederajat";
                    if (s.includes("sma") || s.includes("smk") || s.includes("slta")) return "SMA / sederajat";
                    if (s.includes("d4")) return "D4";
                    if (s.includes("s1")) return "S1";
                    if (s.includes("s2")) return "S2";
                    if (s.includes("s3")) return "S3";
                    if (s.includes("d1")) return "D1";
                    if (s.includes("d2")) return "D2";
                    if (s.includes("d3")) return "D3";
                    return String(p).trim();
                };

                const normalizeIncome = (value) => {
                    let text = String(value || "").toLowerCase().replace(/[–—]/g, "-");
                    if (!text) return "";
                    if (text.includes("tidak berpenghasilan")) return "Tidak Berpenghasilan";
                    let amounts = [...text.matchAll(/(?:rp\s*)?([0-9]+(?:[.,][0-9]{3})*)/g)]
                        .map(match => Number(match[1].replace(/[.,]/g, ""))).filter(Number.isFinite);
                    let lower = amounts[0] || 0;
                    if (text.includes("<") || text.includes("kurang dari")) {
                        if (lower <= 500000) return "0-500rb";
                        if (lower <= 1000000) return "500-1jt";
                        if (lower <= 2000000) return "1-2jt";
                        if (lower <= 5000000) return "2-5jt";
                        if (lower <= 10000000) return "5-10jt";
                        return ">10jt";
                    }
                    if (lower < 500000) return "0-500rb";
                    if (lower < 1000000) return "500-1jt";
                    if (lower < 2000000) return "1-2jt";
                    if (lower < 5000000) return "2-5jt";
                    if (lower < 10000000) return "5-10jt";
                    return ">10jt";
                };

                let importedCount = 0;
                let siswaTanpaNis = [];
                const mainNamaHeaderIdx = normalizedHeaders.findIndex(h => h === "nama" || h === "nama peserta didik" || h === "nama siswa");

                // Proses data mulai dari baris setelah header
                for (let i = headerRowIndex + 1; i < rows.length; i++) {
                    let row = rows[i];
                    if (!row || row.length < 2 || !row.some(c => String(c === undefined || c === null ? '' : c).trim() !== '')) continue; // Skip baris kosong
                    if (i === headerRowIndex + 1 && familyStarts.length > 0) {
                        const mainCell = mainNamaHeaderIdx !== -1 ? norm(row[mainNamaHeaderIdx]) : "";
                        if (!mainCell || mainCell === "nama" || mainCell === "nama lengkap") continue; // Skip sub-header blok keluarga Dapodik
                    }

                    // getVal cerdas dengan dukungan multi-search dan proteksi substring collision
                    let getVal = (...searches) => {
                        for (let search of searches) {
                            let sNorm = norm(search);
                            if (!sNorm) continue;
                            // 1. Exact match
                            for (let h = 0; h < normalizedHeaders.length; h++) {
                                if (normalizedHeaders[h] === sNorm) {
                                    let val = row[h];
                                    if (val !== undefined && val !== null && String(val).trim() !== "") {
                                        return String(val).trim();
                                    }
                                }
                            }
                        }
                        // 2. Includes match dengan proteksi
                        for (let search of searches) {
                            let sNorm = norm(search);
                            if (!sNorm) continue;
                            for (let h = 0; h < normalizedHeaders.length; h++) {
                                let hdr = normalizedHeaders[h];
                                if (!hdr) continue;
                                if (sNorm === "nis" && (hdr.includes("nisn") || hdr.includes("nasional") || hdr.includes("jenis") || hdr.includes("teknis"))) continue;
                                if ((sNorm === "nipd" || sNorm === "no induk" || sNorm === "no. induk" || sNorm === "nomor induk") && (hdr.includes("nisn") || hdr.includes("nasional"))) continue;
                                if (sNorm === "nik" && hdr.includes("teknik")) continue;
                                if (sNorm === "hp" && (hdr.includes("tahap") || hdr.includes("penghasilan"))) continue;
                                if (sNorm === "nama" && (hdr.includes("ayah") || hdr.includes("ibu") || hdr.includes("wali") || hdr.includes("sekolah") || hdr.includes("bank") || hdr.includes("kip"))) continue;
                                if (hdr.includes(sNorm)) {
                                    let val = row[h];
                                    if (val !== undefined && val !== null && String(val).trim() !== "") {
                                        return String(val).trim();
                                    }
                                }
                            }
                        }
                        return "";
                    };

                    let nipd = cleanImportNis_(getVal("NIPD", "No Induk", "No. Induk", "Nomor Induk", "NIS"));
                    let nama = getVal("Nama Peserta Didik", "Nama Siswa", "Nama");
                    let nisn = cleanImportNis_(getVal("NISN"));

                    if (!nama && !nisn && !nipd) continue;
                    const namaNorm = norm(nama);
                    if (["nama", "nama lengkap", "nama peserta didik", "nama siswa", "peserta didik"].includes(namaNorm)) continue;
                    if (/^(total|jumlah|rekap|rekapitulasi)\b/i.test(namaNorm) && !nipd && !nisn) continue;

                    // WAJIB PUNYA NIS / NIPD: Jangan pernah mengganti NIS yang kosong dengan NISN!
                    if (!nipd) {
                        if (nama || nisn) {
                            siswaTanpaNis.push({
                                baris: i + 1,
                                nama: (nama || 'Tanpa Nama').toUpperCase(),
                                nisn: nisn || '-'
                            });
                        }
                        continue;
                    }

                    if (!nama) continue; // Syarat mutlak nama siswa harus ada

                    nama = nama.toUpperCase();

                    let jk = getVal("Jenis Kelamin", "JK", "L/P") || "-";
                    let tempatLahir = toTitleCase(getVal("Tempat Lahir Siswa", "Tempat Lahir") || "-");
                    let tglLahir = smartDate(getVal("Tanggal Lahir Siswa", "Tanggal Lahir", "Tgl Lahir") || "-");
                    let nik = getVal("NIK Siswa", "NIK") || "-";
                    let agama = getVal("Agama") || "-";
                    let noHp = getVal("Nomor Telepon Seluler", "No HP", "No. HP", "HP", "Telepon") || "-";

                    let noKK = getVal("Nomor KK", "No KK", "No. KK", "Kartu Keluarga") || "-";
                    let anakKe = getVal("Anak ke", "Anak ke-", "Anak Ke");
                    let jmlSdr = getVal("Jml. Saudara", "Jumlah Saudara", "Jml Saudara", "Saudara Kandung");
                    let jarak = getVal("Jarak Rumah", "Jarak Tempat Tinggal", "Jarak ke Sekolah", "Jarak");
                    let tinggi = getVal("Tinggi Badan", "Tinggi");
                    let berat = getVal("Berat Badan", "Berat");
                    let goldar = getVal("Golongan Darah", "Gol. Darah", "Goldar");
                    let penyakit = getVal("Riwayat Penyakit", "Penyakit");

                    let rt = getVal("RT");
                    let rw = getVal("RW");
                    let dusun = getVal("Dusun");
                    let kelurahan = getVal("Kelurahan", "Desa/Kelurahan", "Keluarahan", "Desa");
                    let kec = getVal("Kecamatan");

                    let alamatBagian = [getVal("Alamat Lengkap", "Alamat Tinggal", "Alamat")];
                    if (rt) alamatBagian.push(`RT ${rt}`);
                    if (rw) alamatBagian.push(`RW ${rw}`);
                    if (dusun && dusun !== "-") alamatBagian.push(`Dusun ${dusun}`);
                    if (kelurahan && kelurahan !== "-") alamatBagian.push(`Desa/Kel. ${kelurahan}`);
                    if (kec && kec !== "-") alamatBagian.push(`Kec. ${kec}`);
                    let kodePos = getVal("Kode Pos");
                    if (kodePos && kodePos !== "-") alamatBagian.push(`Kode Pos ${kodePos}`);
                    let alamatLengkap = alamatBagian.filter(Boolean).join(", ");

                    // Data Ayah
                    let namaAyah = ayahStartIndex !== -1 ? (row[ayahStartIndex] || getVal("Nama Ayah", "Nama Lengkap Ayah", "Data Ayah") || "") : (getVal("Nama Ayah", "Nama Lengkap Ayah", "Data Ayah") || "");
                    let tglLahirAyah = ayahStartIndex !== -1 ? smartDate(row[ayahStartIndex + 1] || getVal("Tahun Lahir Ayah", "Tgl Lahir Ayah", "Tanggal Lahir Ayah") || "") : smartDate(getVal("Tahun Lahir Ayah", "Tgl Lahir Ayah", "Tanggal Lahir Ayah") || "");
                    let pddAyahRaw = ayahStartIndex !== -1 ? (row[ayahStartIndex + 2] || getVal("Jenjang Pendidikan Ayah", "Pendidikan Ayah", "Pdd Ayah") || "") : (getVal("Jenjang Pendidikan Ayah", "Pendidikan Ayah", "Pdd Ayah") || "");
                    let kerjaAyahRaw = ayahStartIndex !== -1 ? (row[ayahStartIndex + 3] || getVal("Pekerjaan Ayah") || "") : (getVal("Pekerjaan Ayah") || "");
                    let hasilAyah = normalizeIncome(ayahStartIndex !== -1 ? (row[ayahStartIndex + 4] || getVal("Penghasilan Ayah", "Penghasilan Bulanan Ayah")) : getVal("Penghasilan Ayah", "Penghasilan Bulanan Ayah"));

                    let pddAyah = smartPdd(pddAyahRaw);
                    let statusAyah = "Masih hidup";
                    let kerjaAyah = kerjaAyahRaw;

                    if (pddAyah === "Sudah meninggal" || String(kerjaAyahRaw).toLowerCase().includes("meninggal")) {
                        statusAyah = "Sudah meninggal";
                        pddAyah = "";
                        kerjaAyah = "";
                    }

                    // Data Ibu
                    let namaIbu = ibuStartIndex !== -1 ? (row[ibuStartIndex] || getVal("Nama Ibu", "Nama Lengkap Ibu", "Data Ibu") || "") : (getVal("Nama Ibu", "Nama Lengkap Ibu", "Data Ibu") || "");
                    let tglLahirIbu = ibuStartIndex !== -1 ? smartDate(row[ibuStartIndex + 1] || getVal("Tahun Lahir Ibu", "Tgl Lahir Ibu", "Tanggal Lahir Ibu") || "") : smartDate(getVal("Tahun Lahir Ibu", "Tgl Lahir Ibu", "Tanggal Lahir Ibu") || "");
                    let pddIbuRaw = ibuStartIndex !== -1 ? (row[ibuStartIndex + 2] || getVal("Jenjang Pendidikan Ibu", "Pendidikan Ibu", "Pdd Ibu") || "") : (getVal("Jenjang Pendidikan Ibu", "Pendidikan Ibu", "Pdd Ibu") || "");
                    let kerjaIbuRaw = ibuStartIndex !== -1 ? (row[ibuStartIndex + 3] || getVal("Pekerjaan Ibu") || "") : (getVal("Pekerjaan Ibu") || "");
                    let hasilIbu = normalizeIncome(ibuStartIndex !== -1 ? (row[ibuStartIndex + 4] || getVal("Penghasilan Ibu", "Penghasilan Bulanan Ibu")) : getVal("Penghasilan Ibu", "Penghasilan Bulanan Ibu"));

                    let pddIbu = smartPdd(pddIbuRaw);
                    let statusIbu = "Masih hidup";
                    let kerjaIbu = kerjaIbuRaw;

                    if (pddIbu === "Sudah meninggal" || String(kerjaIbuRaw).toLowerCase().includes("meninggal")) {
                        statusIbu = "Sudah meninggal";
                        pddIbu = "";
                        kerjaIbu = "";
                    }

                    // Data Wali
                    let namaWali = toTitleCase(waliStartIndex !== -1 ? (row[waliStartIndex] || getVal("Nama Wali", "Nama Lengkap Wali", "Data Wali") || "") : (getVal("Nama Wali", "Nama Lengkap Wali", "Data Wali") || ""));
                    let tglLahirWali = waliStartIndex !== -1 ? smartDate(row[waliStartIndex + 1] || getVal("Tahun Lahir Wali", "Tgl Lahir Wali", "Tanggal Lahir Wali") || "") : smartDate(getVal("Tahun Lahir Wali", "Tgl Lahir Wali", "Tanggal Lahir Wali") || "");
                    let pddWaliRaw = waliStartIndex !== -1 ? (row[waliStartIndex + 2] || getVal("Jenjang Pendidikan Wali", "Pendidikan Wali", "Pdd Wali") || "") : (getVal("Jenjang Pendidikan Wali", "Pendidikan Wali", "Pdd Wali") || "");
                    let kerjaWaliRaw = waliStartIndex !== -1 ? (row[waliStartIndex + 3] || getVal("Pekerjaan Wali") || "") : (getVal("Pekerjaan Wali") || "");
                    let hasilWali = normalizeIncome(waliStartIndex !== -1 ? (row[waliStartIndex + 4] || getVal("Penghasilan Wali", "Penghasilan Bulanan Wali")) : getVal("Penghasilan Wali", "Penghasilan Bulanan Wali"));

                    let pddWali = smartPdd(pddWaliRaw);
                    let statusWali = "Masih hidup";
                    let kerjaWali = kerjaWaliRaw;

                    if (pddWali === "Sudah meninggal" || String(kerjaWaliRaw).toLowerCase().includes("meninggal")) {
                        statusWali = "Sudah meninggal";
                        pddWali = "";
                        kerjaWali = "";
                    }

                    // Sekolah Asal dan Ijazah
                    let asalSekolah = getVal("Sekolah Asal", "Asal Sekolah", "Lulusan Dari", "Nama Sekolah Asal");
                    let noIjazahSltp = getVal("No Seri Ijazah", "No Ijazah SLTP", "No Ijazah SMP", "Nomor Seri Ijazah SMP/MTs");

                    let email = getVal("Email", "E-mail", "E-Mail", "Surel") || "";
                    let noRegAkta = getVal("No Registrasi Akta Lahir", "Nomor Registrasi Akta Lahir", "No Registrasi Akta", "No Akta Lahir");
                    let kewarganegaraan = getVal("Kewarganegaraan") || "WNI";
                    let penerimaKip = getVal("Penerima KIP", "KIP (Apakah Menerima)") || "Tidak";
                    let noKip = getVal("Nomor KIP", "No. KIP", "No KIP");
                    let namaKip = getVal("Nama di KIP", "Nama Tertera di KIP");
                    let noKks = getVal("Nomor KKS", "No. KKS", "No KKS");
                    let penerimaKps = getVal("Penerima KPS", "Penerima KPS/PKH") || "Tidak";
                    let noKps = getVal("No. KPS", "Nomor KPS", "No KPS");
                    let namaBank = getVal("Bank", "Nama Bank");
                    let noRekeningBank = getVal("Nomor Rekening Bank", "No Rekening Bank", "No. Rekening");
                    let rekeningAtasNama = getVal("Rekening Atas Nama", "Nama Rekening");
                    let kebutuhanKhusus = getVal("Berkebutuhan Khusus", "Kebutuhan Khusus");
                    let transportRaw = getVal("Alat Transportasi", "Transportasi", "Transport") || "";
                    let transport = transportRaw;
                    let tr = transportRaw.toLowerCase();
                    if (tr.includes("jalan")) transport = "Jalan kaki";
                    else if (tr.includes("motor")) transport = "Sepeda Motor";
                    else if (tr.includes("mobil") || tr.includes("antar") || tr.includes("jemput") || tr.includes("bus")) transport = "Mobil/bus antar jemput";
                    else if (tr.includes("sepeda")) transport = "Sepeda";

                    let rombelSaatIni = getVal("Rombel Saat Ini", "Rombel", "Rombongan Belajar", "Kelas");
                    let _alasanKeluar = getVal("Alasan Keluar", "Keluar Karena", "Sebab Keluar", "Keterangan Keluar") || "";
                    let _statusAkhir = getVal("Status Akhir", "Status Siswa", "Status") || "";

                    if (!_statusAkhir) {
                        if (mode === 'keluar') {
                            let al = _alasanKeluar.toLowerCase();
                            if (al.includes('lulus')) {
                                _statusAkhir = 'Lulus';
                            } else if (al.includes('mutasi') || al.includes('pindah')) {
                                _statusAkhir = 'Mutasi Keluar';
                            } else if (al.includes('drop') || al.includes('do') || al.includes('keluar')) {
                                _statusAkhir = 'Keluar';
                            } else if (al.includes('meninggal')) {
                                _statusAkhir = 'Meninggal';
                            } else {
                                _statusAkhir = 'Lulus';
                            }
                        } else {
                            _statusAkhir = 'Aktif';
                        }
                    }

                    let _tglKeluar = smartDate(getVal("Tanggal Keluar", "Tgl Keluar", "Tanggal Keluar / Lulus", "Tanggal Lulus", "Tgl Lulus") || "");

                    let out = Array(68).fill("");
                    out[0] = nipd;
                    out[1] = nisn;
                    out[2] = nama;
                    out[3] = nik;
                    out[4] = noKK;
                    out[5] = tempatLahir;
                    out[6] = tglLahir;
                    out[7] = jk;
                    out[8] = agama;

                    out[9] = anakKe;
                    out[10] = jmlSdr;
                    out[11] = getVal("Bahasa", "Bahasa Sehari-hari", "Bahasa Sehari Hari", "Bahasa Ibu") || "";

                    out[12] = alamatLengkap;

                    out[13] = noHp;
                    out[14] = jarak;
                    out[15] = transport;
                    out[16] = tinggi;
                    out[17] = berat;
                    out[18] = goldar;
                    out[19] = penyakit;
                    out[20] = toTitleCase(namaAyah);
                    out[21] = tglLahirAyah;
                    out[22] = kerjaAyah;
                    out[23] = toTitleCase(namaIbu);
                    out[24] = tglLahirIbu;
                    out[25] = kerjaIbu;
                    out[26] = getVal("Pindahan Dari", "Sekolah Asal Pindahan", "Asal Pindahan") || "";
                    out[27] = asalSekolah;
                    out[28] = noIjazahSltp;
                    let klsMasukCustom = getVal("Diterima Di Kelas", "Diterima di Kelas", "Kelas Diterima", "Kls Diterima", "Diterima Kelas", "Kelas Masuk", "Kls Masuk", "Kls Diterima Pertama", "Kelas Diterima Pertama");
                    out[29] = klsMasukCustom || (mode === 'aktif' ? rombelSaatIni : "");
                    out[30] = smartDate(getVal("Tanggal Masuk", "Tgl Masuk", "Tanggal Diterima", "Tgl Diterima", "Tanggal Masuk Sekolah", "Tgl Masuk Sekolah", "Tanggal Diterima Di Sekolah", "Tgl Diterima Di Sekolah") || "");
                    out[31] = _statusAkhir;
                    out[32] = _tglKeluar;

                    out[33] = getVal("Lanjut Ke", "Melanjutkan Ke", "Melanjutkan Di", "Melanjutkan", "Melanjutkan Sekolah", "Melanjutkan Pendidikan") || "";
                    out[34] = getVal("No Ijazah SMA", "No Ijazah SMK", "Nomor Ijazah SMA", "Nomor Ijazah SMK", "No Ijazah", "Nomor Ijazah") || "";

                    // Default password siswa login
                    out[37] = "123456";

                    // Kolom Google Sheet Index 39-54
                    out[39] = getVal("Hobby", "Hobi", "Kegemaran") || "";
                    out[40] = pddAyah;
                    out[41] = hasilAyah;
                    out[42] = statusAyah;
                    out[43] = pddIbu;
                    out[44] = hasilIbu;
                    out[45] = statusIbu;
                    out[46] = namaWali;
                    out[47] = tglLahirWali;
                    out[48] = kerjaWali;
                    out[49] = pddWali;
                    out[50] = hasilWali;
                    out[51] = statusWali;
                    out[52] = rombelSaatIni;
                    out[53] = email;
                    out[54] = _alasanKeluar || (mode === 'keluar' ? _statusAkhir : "");
                    out[55] = noRegAkta;
                    out[56] = kewarganegaraan;
                    out[57] = /^(ya|yes)$/i.test(penerimaKip) ? "Ya" : "Tidak";
                    out[58] = noKip;
                    out[59] = namaKip;
                    out[60] = noKks;
                    out[61] = /^(ya|yes)$/i.test(penerimaKps) ? "Ya" : "Tidak";
                    out[62] = noKps;
                    out[63] = namaBank;
                    out[64] = noRekeningBank;
                    out[65] = rekeningAtasNama;
                    out[66] = kebutuhanKhusus && kebutuhanKhusus !== "Tidak ada" && kebutuhanKhusus !== "-" ? "Ya" : "Tidak";
                    out[67] = out[66] === "Ya" ? kebutuhanKhusus : "";

                    simisterbinCsv += out.map(cleanCsv).join(",") + "\n";
                    importedCount++;
                }

                if (importedCount === 0) {
                    if (siswaTanpaNis.length > 0) {
                        $('#loader').addClass('hidden');
                        showImportSiswaResult_(null, siswaTanpaNis);
                        return;
                    }
                    throw new Error("Tidak ada data siswa yang valid (memiliki NIS/NIPD dan Nama) di dalam file Dapodik.");
                }

                // Kirim CSV (HANYA siswa yang memiliki NIS/NIPD valid) ke API
                callAPI('importSiswaBulk', { csvData: simisterbinCsv }).then(res => {
                    $('#loader').addClass('hidden');
                    showImportSiswaResult_(res, siswaTanpaNis);
                    if (res && res.status == 'success') {
                        refreshAfterStudentImport();
                    }
                }).catch(err => {
                    $('#loader').addClass('hidden');
                    showCoolAlert('Gagal', (err && err.message) || 'Gagal memproses import data siswa', 'error');
                });

            } catch (err) {
                $('#loader').addClass('hidden');
                console.error(err);
                showCoolAlert('Gagal Membaca File', 'Terjadi kesalahan saat membaca file Excel Dapodik: ' + err.message, 'error');
            }
        };
        reader.readAsArrayBuffer(file);
    }
}

async function refreshAfterStudentImport() {
    if (typeof invalidateUnifiedCaches === 'function') invalidateUnifiedCaches();
    globalSiswa = [];
    await loadSiswa();
    if (curPage === 'siswa' && typeof muatDataLaporan === 'function' && (IS_DESKTOP || (typeof lapDataLoaded !== 'undefined' && lapDataLoaded))) {
        await muatDataLaporan(true);
    }
    if (curPage === 'data-siswa' && typeof loadUnifiedSiswa === 'function') {
        await loadUnifiedSiswa();
        renderUnifiedDataMenu();
    } else if (curPage === 'leger-siswa' && typeof loadUnifiedSiswa === 'function') {
        await loadUnifiedSiswa();
        renderUnifiedLegerMenu();
    } else if (curPage === 'klaper-siswa' && typeof loadUnifiedSiswa === 'function') {
        await loadUnifiedSiswa();
        renderKlaperTable();
    }
}

// --- FUNGSI KARTU & PASSWORD ---
function resetPassAdmin(nis) {
    Swal.fire({ title: 'Reset Password', input: 'text', inputLabel: 'Masukkan Password Baru', inputPlaceholder: 'Contoh: 123456', showCancelButton: true }).then((res) => {
        if (res.isConfirmed && res.value) {
            $('#loader').removeClass('hidden');
            callAPI('resetPasswordSiswa', { nis: nis, newPass: res.value }).then(r => { $('#loader').addClass('hidden'); if (r.status === 'success') Swal.fire('Sukses', 'Password direset!', 'success'); else Swal.fire('Gagal', r.message, 'error'); });
        }
    });
}

function simpanPasswordSiswa() {
    $('#loader').removeClass('hidden');
    callAPI('changeOwnPassword', { nis: window.siswaAktif.nis, oldPass: $('#oldPass').val(), newPass: $('#newPass').val() }).then(r => {
        $('#loader').addClass('hidden');
        if (r.status === 'success') { $('#mdlGantiPass').modal('hide'); Swal.fire('Sukses', 'Password diubah', 'success'); }
        else Swal.fire('Gagal', r.message, 'error');
    });
}

// === MENAMPILKAN KARTU KE POP-UP ===baru
function tampilkanKartuKeModal(nama, nisn, ttl, jk, fotoId, status) {
    // 1. LOADING DULU (Jangan ada perintah show modal di sini)
    $('#loader').removeClass('hidden');
    $('#loaderText').text('Memproses Desain Kartu...');

    let isAlumni = (status === 'Lulus');
    $('#judulKartuModal').text(isAlumni ? 'KARTU ALUMNI' : 'KARTU PELAJAR');

    // 2. Isi Teks
    $('#card-instansi').text(globalConf.nama_instansi);
    $('#card-sekolah').text(globalConf.nama_sekolah);
    $('#card-alamat-sek').text(globalConf.alamat_sekolah);
    $('#card-kontak-sek').html(`Email: ${globalConf.email_sekolah || '-'} | Web: ${globalConf.web_sekolah || '-'} | Telp: ${globalConf.telp_sekolah || '-'}`);

    let nmSekolah = (globalConf.nama_sekolah || 'sekolah ini').toUpperCase();
    $('#judulKartuModalBack').text(isAlumni ? 'KARTU IDENTITAS ALUMNI' : 'KARTU IDENTITAS PELAJAR');
    $('#aturan-1').text(isAlumni ? `Kartu ini adalah tanda pengenal sah alumni ${nmSekolah}.` : `Kartu ini adalah tanda pengenal sah siswa/siswi ${nmSekolah}.`);
    $('#aturan-5').text(isAlumni ? 'Berlaku selama yang bersangkutan berstatus alumni sekolah ini.' : 'Berlaku selama yang bersangkutan berstatus aktif di sekolah ini.');

    $('#card-nama').text(nama);
    $('#card-nisn').text(nisn);

    let tmpt = ttl.split(',')[0] || '-';
    let tgl = ttl.split(',')[1] || '-';
    $('#card-tmp').text(tmpt.trim());
    $('#card-tgl').text(tgl.trim());
    $('#card-jk').text(jk);
    $('#card-link-validasi').text(globalConf.link_validasi || "https://simisterbin.my.id");

    // 3. QR Code pakai API luar agar terbaca sebagai gambar (Aman untuk didownload)
    $('#qrcode').html(`<img src="https://api.qrserver.com/v1/create-qr-code/?size=100x100&margin=0&data=${nisn}" crossorigin="anonymous" style="width:85px; height:85px; display:block;">`);

    const dateNow = new Date();
    const mm = String(dateNow.getMonth() + 1).padStart(2, '0');
    const yyyy = dateNow.getFullYear();
    const qrBackData = `Kartu ini merupakan dokumen ${globalConf.nama_sekolah} yang sah dan ditandatangani secara elektronik oleh kepala sekolah : ${globalConf.nama_kepsek || '-'} - ${globalConf.nip_kepsek || '-'}. date : ${mm}/${yyyy}`;
    $('#qr-back-img').attr('src', `https://api.qrserver.com/v1/create-qr-code/?size=100x100&margin=0&data=${encodeURIComponent(qrBackData)}`);

    // Kosongkan gambar lama
    $('#card-foto').attr('src', '');
    $('#card-bg-back').attr('src', '');

    // 4. Tarik Base64 dari Server
    callAPI('getSemuaGambarKartu', {
        fotoId: fotoId,
        bgDepan: globalConf.background_kartu,
        bgBelakang: globalConf.background_belakang,
        logoInstansi: globalConf.logo_instansi,
        logoSekolah: globalConf.logo_sekolah
    }).then(res => {

        // 5. Tempelkan ke HTML
        if (res.foto) $('#card-foto').attr('src', res.foto);
        else $('#card-foto').attr('src', 'https://via.placeholder.com/75x100?text=Kosong');

        if (res.logo1) {
            $('#card-logo-instansi').attr('src', res.logo1).show();
            $('#card-logo-instansi-back').attr('src', res.logo1).show();
        } else {
            $('#card-logo-instansi').hide();
            $('#card-logo-instansi-back').hide();
        }

        if (res.logo2) {
            $('#card-logo-sekolah').attr('src', res.logo2).show();
            $('#card-logo-sekolah-back').attr('src', res.logo2).show();
        } else {
            $('#card-logo-sekolah').hide();
            $('#card-logo-sekolah-back').hide();
        }

        if (res.bg1) {
            $('#card-bg-layer').css('background-image', `url(${res.bg1})`).show();
            $('#card-bg-gradient').hide();
        } else {
            $('#card-bg-layer').hide();
            $('#card-bg-gradient').show();
        }

        if (res.bg2) {
            $('#card-bg-layer-back').css('background-image', `url(${res.bg2})`).show();
            $('#card-bg-gradient-back').hide();
        } else {
            $('#card-bg-layer-back').hide();
            $('#card-bg-gradient-back').show();
        }
        $('#card-back-wrap').show();

        window.namaKartuCetak = nama;

        // 6. SETELAH GAMBAR NEMPEL SEMUA, TUNGGU 1 DETIK, BARU BUKA MODAL FIX!
        setTimeout(() => {
            $('#loader').addClass('hidden'); // Matikan Layar Loading Hitam
            $('#mdlKartu').modal('show');    // <--- MODAL BARU BOLEH DIBUKA DI SINI
        }, 1000);
    });
}

// === UNDUH KARTU DEPAN ===
function downloadKartuDepan() {
    Swal.fire({ title: 'Menyiapkan Unduhan...', text: 'Mohon tunggu...', allowOutsideClick: false, didOpen: () => { Swal.showLoading(); } });
    setTimeout(() => {
        html2canvas(document.getElementById('capture-area'), { scale: 3, useCORS: true }).then(c => {
            let a = document.createElement('a'); a.download = "Kartu_Depan_" + window.namaKartuCetak + ".jpg"; a.href = c.toDataURL("image/jpeg", 0.95); a.click();
            Swal.close();
        });
    }, 500);
}

// === UNDUH KARTU BELAKANG ===
function downloadKartuBelakang() {
    if (!globalConf.background_belakang || globalConf.background_belakang === '') { Swal.fire('Info', 'Background belakang belum diatur oleh admin.', 'info'); return; }
    Swal.fire({ title: 'Menyiapkan Unduhan...', text: 'Mohon tunggu...', allowOutsideClick: false, didOpen: () => { Swal.showLoading(); } });
    setTimeout(() => {
        html2canvas(document.getElementById('capture-area-back'), { scale: 3, useCORS: true }).then(c => {
            let a = document.createElement('a'); a.download = "Kartu_Belakang_" + window.namaKartuCetak + ".jpg"; a.href = c.toDataURL("image/jpeg", 0.95); a.click();
            Swal.close();
        });
    }, 500);
}

function lihatKartu() {
    const d = window.siswaAktif;
    // Jika alumni, gunakan foto keluar. Jika tidak, foto masuk.
    let isAlumni = (d.status_akhir === 'Lulus');

    // Tegas: Alumni pakai foto_keluar, Siswa pakai foto_id (masuk)
    let fotoDipakai = isAlumni ? d.foto_keluar : d.foto_id;

    tampilkanKartuKeModal(d.nama, d.nisn, (d.tmplahir || '-') + ', ' + (d.tgllahir_indo || '-'), d.jk === 'L' ? 'Laki-laki' : 'Perempuan', fotoDipakai, d.status_akhir);
}

function cetakKartuAdmin(nis) {
    const d = globalSiswa.find(x => String(x[0]) === String(nis));
    if (!d) return;

    let isAlumni = (d[31] === 'Lulus');
    // Tegas: Index 36 = Foto Keluar, Index 35 = Foto Masuk
    let fotoDipakai = isAlumni ? d[36] : d[35];

    tampilkanKartuKeModal(d[2], d[1], d[5] + ', ' + formatTglIndoJS(d[6]), d[7] === 'L' ? 'Laki-laki' : 'Perempuan', fotoDipakai, d[31]);
}


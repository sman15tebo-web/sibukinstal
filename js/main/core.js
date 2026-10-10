// ==========================================
// KONFIGURASI MULTI-TENANT (BANYAK SEKOLAH)
// ==========================================

// 1. Buat "Buku Alamat" untuk masing-masing sekolah
const tenantConfig = {
    "demo": "https://script.google.com/macros/s/AKfycbwSWMTTwosVTO2RtGVib_pWG5wzvD4mhwr7Lu93iRSNKQ2HiqYejt6kp1EXqdatBwyW/exec",
    "smkn1kotaternate": "https://script.google.com/macros/s/AKfycbyvOn_OmvjUl2oiagTwzIuEFBYltLv9bancqjWXAVH594jtPUvHnGMPhjCgw5HL13mT/exec",
    "sman15tebo": "https://script.google.com/macros/s/AKfycbwSWMTTwosVTO2RtGVib_pWG5wzvD4mhwr7Lu93iRSNKQ2HiqYejt6kp1EXqdatBwyW/exec",
    "smk2": "https://script.google.com/macros/s/ID_API_SEKOLAH_3/exec"
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

// Prioritas 2: Link Exec Kustom dari Pengaturan Sekolah
if (!API_URL) {
    const customUrl = localStorage.getItem('sibukinstal_custom_api_url') || localStorage.getItem('customSyncLink');
    if (customUrl && customUrl.startsWith('http')) {
        API_URL = customUrl;
    }
}

// Prioritas 3: Parameter ?id=...
if (!API_URL && tenantId) {
    const cleanId = tenantId.trim().toLowerCase();
    if (tenantConfig[cleanId]) {
        API_URL = tenantConfig[cleanId];
        localStorage.setItem('sibukinstal_tenant_id', cleanId);
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

// Prioritas 5: Fallback Default
if (!API_URL) {
    API_URL = tenantConfig[tenantId] || tenantConfig["demo"] || Object.values(tenantConfig)[0] || "";
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
                const result = await window.electronAPI.saveFoto(base64, nisKey, tipe);
                return result.status === 'success' ? { status: 'success', id: result.path } : { status: 'error' };
            } catch (e) { return { status: 'error' }; }
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
    try {
        window.memoryImgCache = window.memoryImgCache || {};
        if (actionName === 'getImage' && payloadData && payloadData.id) {
            let imgId = String(payloadData.id);
            if (imgId.startsWith('data:')) return imgId;
            if (imgId.startsWith('http')) return imgId; // Already a URL

            // CACHING SEMENTARA (HANYA SELAMA HALAMAN DIBUKA)
            if (window.memoryImgCache[imgId]) return window.memoryImgCache[imgId];
        }
        let session = localStorage.getItem(`simisterbin_session_${typeof tenantId !== 'undefined' ? tenantId : 'demo'}`);
        let tokenAman = "";
        let userAktif = "";

        if (session) {
            let parsed = JSON.parse(dekripsiLokal(session));
            tokenAman = parsed.token || "";
            userAktif = parsed.username || "";
        }

        // --- DATA DIKIRIM LANGSUNG, BACKEND YANG AKAN MENGENKRIPSI ---
        let payloadKirim = payloadData;
        if (['saveStudent', 'saveDaftarUlang', 'editDaftarUlang'].includes(actionName)) {
            // Data langsung dikirim apa adanya, backend yang akan mengenkripsi
        }

        const response = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain' },
            body: JSON.stringify({ action: actionName, token: tokenAman, username: userAktif, data: payloadKirim })
        });

        // Tangkap response text dulu, lalu parse
        const resText = await response.text();
        let resData;
        try {
            resData = JSON.parse(resText);
        } catch (_) {
            if (actionName === 'getImage') {
                if (resText.length > 50 && !resText.includes('<html')) { // Pastikan bukan halaman error
                    window.memoryImgCache[payloadData.id] = resText;
                }
                return resText; // Return base64 string directly
            }
            // Server mengembalikan bukan JSON (mungkin timeout/error GAS)
            console.error('[DESKTOP] API Error: Response bukan JSON:', resText);
            const cleanText = resText ? resText.trim() : '';
            const preview = cleanText ? cleanText.substring(0, 150) : '(kosong)';
            return { status: "error", message: `Server tidak merespons dengan benar. Preview: ${preview}` };
        }

        // --- DEKRIPSI OTOMATIS DATA SENSITIF ONLINE DIHAPUS KARENA SUDAH DI-HANDLE BACKEND ---
        if (resData && resData.status === 'expired') {
            localStorage.removeItem(`simisterbin_session_${tenantId}`);
            showCoolAlert('Sesi Berakhir', resData.message || 'Sesi Anda telah berakhir, silakan login ulang.', 'warning');
            setTimeout(() => location.reload(), 2000);
            return { status: 'error', message: 'Sesi berakhir.' };
        }
        return resData;
    } catch (error) {
        return { status: "error", message: "Gagal terhubung ke server database." };
    }
}

function doLogin(e) {
    e.preventDefault();
    $('#loader').removeClass('hidden');

    callAPI('login', { u: $('#u').val(), p: $('#p').val() }).then(res => {
        $('#loader').addClass('hidden');
        if (res.status === 'success') {
            // Simpan TOKEN dan USERNAME ke Local Storage
            let rawData = JSON.stringify({
                role: res.role,
                nama: res.nama,
                token: res.token,
                username: res.username,
                password: $('#p').val(),
                data: res.data || null
            });
            localStorage.setItem(`simisterbin_session_${tenantId}`, enkripsiLokal(rawData));

            restoreSession(res);
        } else {
            showCoolAlert('Gagal Masuk', res.message, 'error');
        }
    });
}


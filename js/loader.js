// loader.js - Memuat potongan HTML secara dinamis
document.addEventListener("DOMContentLoaded", async () => {
    const includes = document.querySelectorAll('[data-include]');
    
    // Tampilkan loader selagi HTML dimuat
    const loader = document.getElementById('loader');
    if (loader) {
        loader.classList.remove('hidden');
        loader.style.display = '';
    }

    // Memuat semua komponen HTML secara paralel
    const loadPromises = Array.from(includes).map(async (el) => {
        const file = el.getAttribute('data-include');
        try {
            const response = await fetch(file);
            if (response.ok) {
                el.innerHTML = await response.text();
            } else {
                console.error(`Gagal memuat ${file}: ${response.status}`);
                el.innerHTML = `<div class="alert alert-danger">Gagal memuat komponen: ${file}</div>`;
            }
        } catch (error) {
            console.error(`Error memuat ${file}:`, error);
            // Jika error CORS (misal dibuka langsung tanpa server), beri peringatan
            el.innerHTML = `<div class="alert alert-warning">
                Gagal memuat komponen: ${file}. <br>
                <em>Pastikan Anda menggunakan Local Web Server atau Electron saat mode offline.</em>
            </div>`;
        }
    });

    await Promise.all(loadPromises);

    // Tandai bahwa include HTML telah selesai dimuat
    window.HtmlIncludesLoadedDone = true;
    
    // Panggil event custom untuk menandakan DOM sudah siap secara keseluruhan
    document.dispatchEvent(new Event('HtmlIncludesLoaded'));
    
    // Watchdog darurat: Jika dalam 6 detik loader masih aktif dan belum ada halaman tampil, buka login page
    setTimeout(() => {
        const l = document.getElementById('loader');
        if (l && !l.classList.contains('hidden')) {
            const loginPage = document.getElementById('loginPage');
            const appPage = document.getElementById('appPage');
            if (loginPage && appPage && loginPage.classList.contains('hidden') && appPage.classList.contains('hidden')) {
                console.warn('[Safety] Loader dipaksa berhenti oleh loader watchdog.');
                l.classList.add('hidden');
                loginPage.classList.remove('hidden');
            }
        }
    }, 6000);
});

// ==========================================
// SIMISTERBIN DESKTOP — COMPAT LAYER
// Berisi fungsi yang HANYA dibutuhkan di versi Desktop (Electron)
// Dimuat setelah main.js di offline index.html
// ==========================================

if (IS_DESKTOP) {
  // ==========================================
  // SISTEM MONITOR ONLINE/OFFLINE
  // ==========================================
  function updateOnlineStatus() {
    const isOnline = navigator.onLine;
    const banner = document.getElementById('offline-banner');
    if (banner) {
      if (isOnline) {
        banner.classList.add('online');
        banner.innerHTML = `<i class="bi bi-wifi"></i> Online`;
      } else {
        banner.classList.remove('online');
        banner.innerHTML = `<i class="bi bi-wifi-off"></i> Offline — Data tersimpan lokal`;
      }
    }
    updateSyncBadge();
  }

  async function updateSyncBadge() {
    try {
      const status = await callAPI('getSyncStatus');
      const badge = document.getElementById('sync-pending-badge');
      if (badge && status) {
        if (status.pending > 0) {
          badge.textContent = status.pending;
          badge.style.display = 'inline-block';
        } else {
          badge.style.display = 'none';
        }
        const lastSyncEl = document.getElementById('last-sync-time');
        if (lastSyncEl && status.lastSync) {
          lastSyncEl.textContent = status.lastSync;
        }
      }
    } catch (e) {}
  }

  window.addEventListener('online', updateOnlineStatus);
  window.addEventListener('offline', updateOnlineStatus);

  // ==========================================
  // MUAT ULANG TAMPILAN SETELAH SINKRONISASI
  // (pengaturan, kelas, mapel, siswa, alumni, siswa keluar)
  // ==========================================
  function refreshSetelahSinkron() {
    try { if (typeof invalidateUnifiedCaches === 'function') invalidateUnifiedCaches(); } catch (e) {}
    try { if (typeof globalMapel !== 'undefined') globalMapel = []; } catch (e) {}
    try { if (typeof loadSettings === 'function') loadSettings(); } catch (e) {}
    try { if (typeof loadSiswa === 'function') loadSiswa(); } catch (e) {}
    try { if (typeof loadKelas === 'function' && document.getElementById('tbodyKelas')) loadKelas(); } catch (e) {}
    try { if (typeof inisialisasiDropdownAlumni === 'function') inisialisasiDropdownAlumni(); } catch (e) {}
    try { if (typeof inisialisasiDropdownKeluar === 'function') inisialisasiDropdownKeluar(); } catch (e) {}
    updateSyncBadge();
  }

  // Dialog hasil sinkronisasi (dipakai Sinkron & Force Push)
  function tampilkanHasilSinkron(result, judulSukses) {
    const rincian = (result.details && result.details.length)
      ? '<ul class="ps-3 mb-2">' + result.details.map(d => `<li>${d}</li>`).join('') + '</ul>'
      : '';
    Swal.fire({
      icon: result.status === 'success' ? 'success' : 'warning',
      title: result.status === 'success' ? judulSukses : '⚠️ Selesai dengan Catatan',
      html: `<div class="text-start small">
               <b>Diunggah ke server:</b> ${result.uploaded || 0} data<br>
               <b>Diunduh/diperbarui dari server:</b> ${result.downloaded || 0} data<br>
               ${result.deleted ? `<b>Dihapus:</b> ${result.deleted} data<br>` : ''}
               <hr class="my-2">
               ${rincian}
               ${result.errors && result.errors.length ? '<b class="text-danger">Catatan/Error:</b><br>' + result.errors.map(e => `• ${e}`).join('<br>') : ''}
             </div>`,
      confirmButtonColor: '#4e73df'
    });
    refreshSetelahSinkron();
  }

  // ==========================================
  // FUNGSI SINKRONISASI DATA 2 ARAH KE GOOGLE SHEETS
  // ==========================================
  async function doSinkronisasi() {
    let apiUrl = '';
    try { apiUrl = (await window.electronAPI.getApiUrl()) || ''; } catch (_) {}

    Swal.fire({
      title: 'URL Sinkronisasi',
      html: `<p>Periksa atau perbarui URL Google Apps Script Anda:</p>
             <input id="swal-api-url" class="swal2-input" value="${apiUrl}" placeholder="https://script.google.com/macros/s/...">
             <p class="text-muted small mt-2">URL ini dari menu Deploy di Apps Script Anda</p>
             <p class="text-muted small mb-0">Sinkron 2 arah: pengaturan, kelas, mapel, siswa &amp; alumni.</p>`,
      showCancelButton: true, confirmButtonText: 'Simpan & Sinkron', cancelButtonText: 'Batal',
      preConfirm: () => {
        const url = document.getElementById('swal-api-url').value.trim();
        if (!url || !url.startsWith('https://script.google.com')) {
          Swal.showValidationMessage('URL tidak valid!');
          return false;
        }
        return url;
      }
    }).then(async (result) => {
      if (result.isConfirmed) {
        await window.electronAPI.saveApiUrl(result.value);
        await mulaiSinkron(result.value);
      }
    });
  }

  async function mulaiSinkron(apiUrl) {
    Swal.fire({
      title: '🔄 Menyinkronkan Data...',
      html: `<div class="text-start small">
        <div id="sync-step-1" class="mb-1 text-muted">○ Login ke server online</div>
        <div id="sync-step-2" class="mb-1 text-muted">○ Pengaturan sekolah</div>
        <div id="sync-step-3" class="mb-1 text-muted">○ Kelas & Mata Pelajaran</div>
        <div id="sync-step-4" class="mb-1 text-muted">○ Data Siswa & Alumni + Foto</div>
        <div id="sync-step-5" class="mb-1 text-muted">○ Nilai & Leger (12 Semester)</div>
        <div id="sync-step-6" class="mb-1 text-muted">○ Daftar Ulang SPMB</div>
      </div>
      <hr class="my-2">
      <div id="sync-real-progress" class="text-primary fw-bold text-center small mt-2">Memulai sinkronisasi...</div>
      `,
      allowOutsideClick: false, showConfirmButton: false,
      didOpen: () => Swal.showLoading()
    });

    const stepLabels = {
      1: 'Login ke server online',
      2: 'Pengaturan sekolah',
      3: 'Kelas & Mata Pelajaran',
      4: 'Data Siswa & Alumni + Foto',
      5: 'Nilai & Leger (12 Semester)',
      6: 'Daftar Ulang SPMB'
    };
    const setStep = (step, icon, cls) => {
      const el = document.getElementById(`sync-step-${step}`);
      if (el) { el.className = `mb-1 ${cls}`; el.innerHTML = `<span>${icon}</span> ${stepLabels[step]}`; }
    };

    // Progres nyata dari proses utama (Main Process). Listener dipasang sekali, handler diganti tiap sinkron.
    window.__syncProgressHandler = (msg) => {
      const el = document.getElementById('sync-real-progress');
      if (el) el.innerText = msg;
      const match = /^(\d)\/6\./.exec(msg);
      if (match) {
        const current = Number(match[1]);
        for (let i = 1; i < current; i++) setStep(i, '✅', 'text-success fw-bold');
        setStep(current, '🔄', 'text-primary fw-bold');
        for (let i = current + 1; i <= 6; i++) setStep(i, '○', 'text-muted');
      }
      if (/^(Menyiapkan|Mengunggah siswa|Menyimpan.*siswa)/.test(msg)) {
        setStep(1, '✅', 'text-success fw-bold');
        setStep(2, '✅', 'text-success fw-bold');
        setStep(3, '✅', 'text-success fw-bold');
        setStep(4, '🔄', 'text-primary fw-bold');
      }
    };
    if (window.electronAPI && window.electronAPI.onSyncProgress && !window.__syncProgressBound) {
      window.__syncProgressBound = true;
      window.electronAPI.onSyncProgress((msg) => {
        if (typeof window.__syncProgressHandler === 'function') window.__syncProgressHandler(msg);
      });
    }

    try {
      const sessionRaw = localStorage.getItem(`simisterbin_session_${typeof tenantId !== 'undefined' ? tenantId : 'demo'}`);
      let sessionData = null;
      try { sessionData = sessionRaw ? JSON.parse(dekripsiLokal(sessionRaw)) : null; } catch (_) {}

      const syncUsername = (sessionData && sessionData.username) ? sessionData.username : 'admin-sman15tebo';
      const syncPassword = (sessionData && sessionData.password) ? sessionData.password : 'admin123';

      const result = await window.electronAPI.syncToServer(apiUrl, {
        username: syncUsername,
        password: syncPassword
      });
      if (result.status === 'success' || result.status === 'partial') {
        tampilkanHasilSinkron(result, '✅ Sinkronisasi Berhasil!');
      } else {
        if (String(result.message || '').toLowerCase().includes('login') || String(result.message || '').toLowerCase().includes('username') || String(result.message || '').toLowerCase().includes('password')) {
          const retry = await Swal.fire({
            title: 'Kredensial Online Berbeda',
            html: `
              <div class="mb-3 text-start text-danger small"><b>Pesan Server:</b> ${result.message}</div>
              <p class="small text-muted text-start">Password login offline berbeda dengan password akun login Online, silakan masukkan username dan password login akun Online Anda.</p>
              <input id="retry-sync-user" class="swal2-input" style="width:min(420px,85%);" value="admin" placeholder="Username akun Online">
              <div style="position:relative;width:min(420px,85%);margin:0 auto;">
                <input id="retry-sync-pass" type="password" class="swal2-input" style="width:100%;margin:0;padding-right:48px;" placeholder="Password akun Online">
                <button type="button" id="toggle-retry-sync-pass" aria-label="Tampilkan password" style="position:absolute;right:10px;top:9px;border:0;background:transparent;color:#6c757d;font-size:18px;cursor:pointer;"><i class="bi bi-eye"></i></button>
              </div>`,
            showCancelButton: true,
            confirmButtonText: 'Coba Lagi',
            cancelButtonText: 'Batal',
            didOpen: () => {
              const button = document.getElementById('toggle-retry-sync-pass');
              const input = document.getElementById('retry-sync-pass');
              if (button && input) button.addEventListener('click', () => {
                const visible = input.type === 'text';
                input.type = visible ? 'password' : 'text';
                button.innerHTML = `<i class="bi bi-eye${visible ? '' : '-slash'}"></i>`;
              });
            },
            preConfirm: () => ({ username: document.getElementById('retry-sync-user').value.trim(), password: document.getElementById('retry-sync-pass').value })
          });
          if (retry.isConfirmed && retry.value.username && retry.value.password) {
            Swal.fire({ title: 'Mencoba Sinkronisasi...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
            const retryResult = await window.electronAPI.syncToServer(apiUrl, retry.value);
            if (retryResult.status === 'success' || retryResult.status === 'partial') {
              const updatedSession = { ...(sessionData || {}), username: retry.value.username, password: retry.value.password };
              localStorage.setItem(`simisterbin_session_${typeof tenantId !== 'undefined' ? tenantId : 'demo'}`, enkripsiLokal(JSON.stringify(updatedSession)));
              tampilkanHasilSinkron(retryResult, '✅ Sinkronisasi Berhasil!');
            } else {
              Swal.fire('Login Server Gagal', retryResult.message, 'error');
            }
          }
        } else {
          Swal.fire('Gagal Sinkronisasi', `${result.message}<br><br><small>Endpoint: ${apiUrl}</small>`, 'error');
        }
      }
    } catch (e) {
      Swal.fire('Error', 'Sinkronisasi error: ' + e.message, 'error');
    }
  }

  // Inisialisasi saat DOM siap
  document.addEventListener('DOMContentLoaded', function () {
    console.log('✅ SiBuk InSTal Desktop Mode aktif - Database lokal siap');
    if (typeof updateOnlineStatus === 'function') updateOnlineStatus();
  });

  document.addEventListener('HtmlIncludesLoaded', async function () {
    if (window.electronAPI && window.electronAPI.getOfflineConfig) {
        try {
            const config = await window.electronAPI.getOfflineConfig();
            if (config) {
                const adminInput = document.getElementById('adminUser');
                const adminPassInput = document.getElementById('adminPass');
                const wakaInput = document.getElementById('guruUser');
                const wakaPassInput = document.getElementById('guruPass');
                
                if (adminInput && config.admin) {
                    adminInput.value = config.admin.username || '';
                    adminInput.setAttribute('readonly', 'true');
                    adminInput.title = 'Diambil dari config-offline.js';
                }
                if (adminPassInput && config.admin) {
                    adminPassInput.value = config.admin.password || '';
                    adminPassInput.setAttribute('readonly', 'true');
                    adminPassInput.title = 'Diambil dari config-offline.js';
                }
                
                if (wakaInput && config.waka) {
                    wakaInput.value = config.waka.username || '';
                    wakaInput.setAttribute('readonly', 'true');
                    wakaInput.title = 'Diambil dari config-offline.js';
                }
                if (wakaPassInput && config.waka) {
                    wakaPassInput.value = config.waka.password || '';
                    wakaPassInput.setAttribute('readonly', 'true');
                    wakaPassInput.title = 'Diambil dari config-offline.js';
                }
            }
        } catch(e) {
            console.error('Gagal mengambil config offline:', e);
        }
    }
  });

  // Ekspor ke window
  window.doSinkronisasi = doSinkronisasi;
  window.updateSyncBadge = updateSyncBadge;
  window.updateOnlineStatus = updateOnlineStatus;
  window.refreshSetelahSinkron = refreshSetelahSinkron;
  window.tampilkanHasilSinkron = tampilkanHasilSinkron;
}

  async function doForcePush() {
    if (!window.electronAPI) {
      Swal.fire('Fitur Desktop', 'Fitur ini hanya tersedia di Aplikasi Desktop SiBuk InSTal.', 'info');
      return;
    }
    if (!navigator.onLine) {
      Swal.fire('Offline', 'Bapak harus terhubung ke internet untuk melakukan ini.', 'error');
      return;
    }
    
    let apiUrl = null;
    try { apiUrl = await window.electronAPI.getApiUrl(); } catch (_) {}
    if (!apiUrl && typeof tenantConfig !== 'undefined' && tenantId) apiUrl = tenantConfig[tenantId];
    if (!apiUrl) {
      Swal.fire('Error', 'Link API Sekolah belum dikonfigurasi!', 'error');
      return;
    }
    
    const confirm = await Swal.fire({
      title: 'Upload Semua Data Offline?',
      text: 'Fitur ini akan MENGIRIM SELURUH data di aplikasi Desktop (pengaturan, kelas, mapel, siswa & alumni) ke server online dan menimpa data yang sama di server. Data yang hanya ada di server tidak dihapus. Proses ini bisa memakan waktu.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Ya, Upload Semua',
      cancelButtonText: 'Batal'
    });
    
    if (!confirm.isConfirmed) return;

    const sessionRaw = localStorage.getItem(`simisterbin_session_${typeof tenantId !== 'undefined' ? tenantId : 'demo'}`);
    let sessionData = null;
    try { sessionData = sessionRaw ? JSON.parse(dekripsiLokal(sessionRaw)) : null; } catch (_) {}
    const credentials = sessionData && sessionData.username && sessionData.password
      ? { username: sessionData.username, password: sessionData.password }
      : null;
    if (!credentials) {
      Swal.fire('Login Ulang Diperlukan', 'Sesi login lama belum menyimpan kredensial untuk Force Push. Silakan logout lalu login kembali.', 'warning');
      return;
    }
    
    Swal.fire({
      title: 'Mempersiapkan Upload...',
      text: 'Menghitung data...',
      allowOutsideClick: false,
      didOpen: () => Swal.showLoading()
    });
    
    try {
      if (!window.electronAPI) {
          Swal.fire('Fitur Khusus Desktop', 'Sinkronisasi (Upload Massal) hanya bisa dilakukan melalui Aplikasi Desktop SiBuk InSTal.', 'warning');
          return;
      }

      window.__syncProgressHandler = (msg) => {
        if (Swal.isVisible()) Swal.update({ text: msg });
      };
      if (window.electronAPI.onSyncProgress && !window.__syncProgressBound) {
        window.__syncProgressBound = true;
        window.electronAPI.onSyncProgress((msg) => {
          if (typeof window.__syncProgressHandler === 'function') window.__syncProgressHandler(msg);
        });
      }
      
      const result = await window.electronAPI.forcePushOnline(apiUrl, credentials);
      
      if (result.status === 'success' || result.status === 'partial') {
        window.tampilkanHasilSinkron(result, 'Berhasil!');
      } else {
        if (String(result.message || '').toLowerCase().includes('login')) {
          const retry = await Swal.fire({
            title: 'Login Server Ditolak',
            html: '<p class="small text-muted text-start">Password login offline berbeda dengan password akun login Online, silakan masukkan username dan password login akun Online Anda.</p><input id="retry-server-user" class="swal2-input" style="width: min(420px, 85%);" value="admin" placeholder="Username akun Online"><div style="position:relative;width:min(420px,85%);margin:0 auto;"><input id="retry-server-pass" type="password" class="swal2-input" style="width:100%;margin:0;padding-right:48px;" placeholder="Password akun Online"><button type="button" id="toggle-retry-server-pass" aria-label="Tampilkan password" style="position:absolute;right:10px;top:9px;border:0;background:transparent;color:#6c757d;font-size:18px;cursor:pointer;"><i class="bi bi-eye"></i></button></div>',
            showCancelButton: true,
            confirmButtonText: 'Coba Lagi',
            cancelButtonText: 'Batal',
            didOpen: () => {
              const button = document.getElementById('toggle-retry-server-pass');
              const input = document.getElementById('retry-server-pass');
              if (button && input) button.addEventListener('click', () => {
                const visible = input.type === 'text';
                input.type = visible ? 'password' : 'text';
                button.innerHTML = `<i class="bi bi-eye${visible ? '' : '-slash'}"></i>`;
                button.setAttribute('aria-label', visible ? 'Tampilkan password' : 'Sembunyikan password');
              });
            },
            preConfirm: () => ({ username: document.getElementById('retry-server-user').value.trim(), password: document.getElementById('retry-server-pass').value })
          });
          if (retry.isConfirmed && retry.value.username && retry.value.password) {
            Swal.fire({ title: 'Mencoba Login Server...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
            const retryResult = await window.electronAPI.forcePushOnline(apiUrl, retry.value);
            if (retryResult.status === 'success' || retryResult.status === 'partial') {
              const updatedSession = { ...(sessionData || {}), username: retry.value.username, password: retry.value.password };
              localStorage.setItem(`simisterbin_session_${typeof tenantId !== 'undefined' ? tenantId : 'demo'}`, enkripsiLokal(JSON.stringify(updatedSession)));
              window.tampilkanHasilSinkron(retryResult, 'Berhasil!');
            } else {
              Swal.fire('Login Server Gagal', retryResult.message, 'error');
            }
          }
        } else {
            Swal.fire('Gagal Sinkronisasi', result.message, 'error');
        }
      }
    } catch (e) {
      Swal.fire('Error', e.message, 'error');
    }
  }
  
  window.doForcePush = doForcePush;


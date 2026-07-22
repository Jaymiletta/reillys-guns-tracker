/* ============================================================
   REILLY'S GUNS — YARD SIGN TRACKER
   Firebase Edition — Firestore + Storage, no login required
   ============================================================ */

'use strict';

// ===== FIREBASE CONFIG — PLACEHOLDER (user fills in) =====
// Replace these values with your own Firebase project config
const FIREBASE_CONFIG = {
  apiKey:            "REPLACE_WITH_YOUR_API_KEY",
  authDomain:        "REPLACE_WITH_YOUR_AUTH_DOMAIN",
  projectId:         "REPLACE_WITH_YOUR_PROJECT_ID",
  storageBucket:     "REPLACE_WITH_YOUR_STORAGE_BUCKET",
  messagingSenderId: "REPLACE_WITH_YOUR_MESSAGING_SENDER_ID",
  appId:             "REPLACE_WITH_YOUR_APP_ID"
};

// ===== BRAND =====
const BRAND = {
  name:    "Reilly's Guns",
  tagline: 'Inherited Firearms Specialists',
  phone:   '(856) 447-3030',
};

const SIGN_TYPES = [
  { value: 'inherited', label: 'Inherited Firearms', color: '#8B4513', dot: 'dot-inherited' },
  { value: 'general',   label: 'General Promotion',  color: '#4682B4', dot: 'dot-general'  },
  { value: 'upcoming',  label: 'Upcoming Event',     color: '#2E8B57', dot: 'dot-upcoming' },
  { value: 'event',     label: 'Sale Event',         color: '#8B008B', dot: 'dot-event'    },
  { value: 'sale',      label: 'Special Offer',      color: '#CC5500', dot: 'dot-sale'     },
  { value: 'custom',    label: 'Other / Custom',     color: '#4a4a4a', dot: 'dot-custom'   },
];

// ===== APP STATE =====
const App = {
  db: null, storage: null,
  signs: [],           // local cache
  unsubscribe: null,   // Firestore listener
  gpsCoords: null,
  photoFile: null,
  photoDataUrl: null,
  editSignId: null,
  detailSignId: null,
  detailMapInstance: null,
  mapInstance: null,
  mapInitialized: false,
  online: navigator.onLine,
};

// ===== INIT =====
document.addEventListener('DOMContentLoaded', () => {
  const isConfigured = FIREBASE_CONFIG.apiKey !== 'REPLACE_WITH_YOUR_API_KEY';
  if (!isConfigured) {
    showScreen('setup');
    return;
  }
  initFirebase();
});

function initFirebase() {
  try {
    const app     = firebase.initializeApp(FIREBASE_CONFIG);
    App.db        = firebase.firestore();
    App.storage   = firebase.storage();
    document.getElementById('setup-screen').style.display = 'none';
    document.getElementById('main-nav').style.display = 'flex';
    populateSignTypeSelect('add-sign-type');
    populateSignTypeSelect('edit-sign-type');
    populateAdminTypeFilter();
    subscribeToSigns();
    showScreen('dashboard');
    monitorOnline();
    showToast("Connected to Reilly's Guns database", 'success');
  } catch (err) {
    showToast('Firebase error: ' + err.message, 'error');
    console.error(err);
  }
}

// ===== ONLINE MONITOR =====
function monitorOnline() {
  const dot = document.getElementById('online-dot');
  function update() {
    App.online = navigator.onLine;
    if (dot) dot.className = 'online-dot' + (App.online ? '' : ' offline');
  }
  window.addEventListener('online',  update);
  window.addEventListener('offline', update);
  update();
}

// ===== FIRESTORE REAL-TIME LISTENER =====
function subscribeToSigns() {
  if (App.unsubscribe) App.unsubscribe();
  App.unsubscribe = App.db.collection('reillys_signs')
    .orderBy('created_at', 'desc')
    .onSnapshot(snapshot => {
      App.signs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      // Refresh current screen
      const screen = document.querySelector('.screen.active');
      if (screen) {
        const id = screen.id.replace('-screen', '');
        if (id === 'dashboard') loadDashboard();
        if (id === 'list')      loadList();
        if (id === 'admin')     loadAdmin();
        if (id === 'map')       refreshMapPins();
      }
    }, err => {
      showToast('Database sync error', 'error');
      console.error(err);
    });
}

// ===== TOAST =====
function showToast(msg, type = 'success') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  const icon = type === 'success' ? 'check-circle' : type === 'error' ? 'times-circle' : 'info-circle';
  toast.innerHTML = `<i class="fas fa-${icon}"></i> ${msg}`;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 3500);
}

// ===== LOADING =====
function showLoading(msg = 'Loading...') {
  const el = document.getElementById('loading-overlay');
  el.querySelector('span').textContent = msg;
  el.style.display = 'flex';
}
function hideLoading() { document.getElementById('loading-overlay').style.display = 'none'; }

// ===== CONFIRM MODAL =====
let _confirmResolve = null;
function showConfirm(title, message) {
  document.getElementById('confirm-title').textContent   = title;
  document.getElementById('confirm-message').textContent = message;
  document.getElementById('confirm-modal').classList.remove('hidden');
  return new Promise(resolve => { _confirmResolve = resolve; });
}
function handleConfirmOk()     { document.getElementById('confirm-modal').classList.add('hidden'); if (_confirmResolve) _confirmResolve(true); }
function handleConfirmCancel() { document.getElementById('confirm-modal').classList.add('hidden'); if (_confirmResolve) _confirmResolve(false); }

// ===== SCREEN NAV =====
function showScreen(screenId) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const screen = document.getElementById(screenId + '-screen');
  if (screen) screen.classList.add('active');
  document.querySelectorAll('.nav-item').forEach(item => {
    item.classList.toggle('active', item.dataset.screen === screenId);
  });
  if (screenId === 'map')       initMap();
  if (screenId === 'dashboard') loadDashboard();
  if (screenId === 'list')      loadList();
  if (screenId === 'admin')     loadAdmin();
}

// ===== SETUP SCREEN (first-time config) =====
function saveFirebaseConfig() {
  const fields = ['apiKey','authDomain','projectId','storageBucket','messagingSenderId','appId'];
  const config = {};
  let valid = true;
  fields.forEach(f => {
    const val = document.getElementById('cfg-' + f)?.value?.trim();
    if (!val) { valid = false; return; }
    config[f] = val;
  });
  if (!valid) { showToast('Please fill in all Firebase fields', 'error'); return; }
  // Store in localStorage so user only needs to do this once
  localStorage.setItem('reillysguns_firebase_config', JSON.stringify(config));
  Object.assign(FIREBASE_CONFIG, config);
  initFirebase();
}

// ===== DASHBOARD =====
function loadDashboard() {
  const signs   = App.signs;
  const active  = signs.filter(s => s.status === 'active');
  const removed = signs.filter(s => s.status === 'removed');
  document.getElementById('dash-active-count').textContent  = active.length;
  document.getElementById('dash-removed-count').textContent = removed.length;
  document.getElementById('dash-total-count').textContent   = signs.length;

  // Type breakdown
  const typeBreak = document.getElementById('type-breakdown');
  typeBreak.innerHTML = '';
  SIGN_TYPES.forEach(t => {
    const count = active.filter(s => s.sign_type === t.value).length;
    if (!count) return;
    typeBreak.innerHTML += `
      <div class="type-row">
        <div class="type-dot ${t.dot}"></div>
        <span class="type-name">${t.label}</span>
        <span class="type-count">${count}</span>
      </div>`;
  });
  if (!typeBreak.innerHTML) typeBreak.innerHTML = '<p style="color:var(--text-light);font-size:0.85rem;font-style:italic">No active signs yet.</p>';

  // Recent 5
  const recent   = signs.slice(0, 5);
  const recentEl = document.getElementById('recent-list');
  recentEl.innerHTML = '';
  recent.forEach(s => {
    const t = SIGN_TYPES.find(x => x.value === s.sign_type) || SIGN_TYPES[0];
    recentEl.innerHTML += `
      <div class="recent-item" onclick="openDetail('${s.id}')">
        <img class="recent-thumb" src="${s.photo_url || 'https://placehold.co/80x80/0D3321/A2752A?text=Sign'}" alt="" onerror="this.src='https://placehold.co/80x80/0D3321/A2752A?text=Sign'">
        <div class="recent-info">
          <div class="recent-addr">${s.address || 'No address'}</div>
          <div class="recent-meta">${t.label} · ${fmtDate(s.date_installed)}</div>
        </div>
        <span class="status-badge ${s.status}">${s.status}</span>
      </div>`;
  });
  if (!recentEl.innerHTML) recentEl.innerHTML = '<p style="color:var(--text-light);font-size:0.85rem;font-style:italic">No signs yet — tap + to add one!</p>';
}

// ===== MAP =====
function initMap() {
  if (App.mapInitialized && App.mapInstance) { refreshMapPins(); return; }
  const mapEl = document.getElementById('leaflet-map');
  if (!mapEl || typeof L === 'undefined') return;
  App.mapInstance = L.map('leaflet-map', { zoomControl: true }).setView([39.4868, -75.0277], 12);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors', maxZoom: 19,
  }).addTo(App.mapInstance);
  App.mapInitialized = true;
  refreshMapPins();
}

function refreshMapPins() {
  if (!App.mapInstance) return;
  App.mapInstance.eachLayer(l => { if (l instanceof L.Marker) App.mapInstance.removeLayer(l); });
  App.signs.forEach(s => {
    if (!s.latitude || !s.longitude) return;
    const color  = s.status === 'active' ? '#0D3321' : '#8b1a1a';
    const border = s.status === 'active' ? '#A2752A' : '#cc4444';
    const icon = L.divIcon({
      className: '', iconSize: [30, 30], iconAnchor: [15, 15], popupAnchor: [0, -16],
      html: `<div style="width:30px;height:30px;border-radius:50%;background:${color};border:3px solid ${border};display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(0,0,0,0.35)">
               <i class="fas fa-map-marker-alt" style="color:${border};font-size:13px"></i></div>`,
    });
    const t = SIGN_TYPES.find(x => x.value === s.sign_type) || SIGN_TYPES[0];
    L.marker([s.latitude, s.longitude], { icon })
      .addTo(App.mapInstance)
      .bindPopup(`<div style="font-family:Georgia,serif;min-width:160px">
        <strong style="color:#0D3321">${s.address || 'No address'}</strong><br>
        <span style="font-size:0.8rem;color:#A2752A">${t.label}</span><br>
        <span style="font-size:0.78rem">${s.status === 'active' ? '🟢 Active' : '🔴 Removed'}</span><br>
        <a href="#" onclick="event.preventDefault();openDetail('${s.id}')" style="font-size:0.78rem;color:#0D3321">View details →</a>
      </div>`);
  });
}

// ===== ADD SIGN =====
function openAddSign() {
  App.editSignId   = null;
  App.gpsCoords    = null;
  App.photoFile    = null;
  App.photoDataUrl = null;
  document.getElementById('add-form').reset();
  document.getElementById('add-date').value = new Date().toISOString().split('T')[0];
  const gpsEl = document.getElementById('gps-status');
  gpsEl.textContent = 'Tap "Capture GPS" to get location';
  gpsEl.className   = 'gps-status';
  document.getElementById('add-photo-preview').style.display = 'none';
  document.getElementById('add-photo-zone').style.display    = '';
  document.getElementById('change-photo-btn').style.display  = 'none';
  document.getElementById('upload-progress-wrap').style.display = 'none';
  showScreen('add');
}

function captureGPS() {
  const btn      = document.getElementById('gps-btn');
  const statusEl = document.getElementById('gps-status');
  btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
  statusEl.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Getting location...';
  if (!navigator.geolocation) {
    showToast('GPS not available on this device', 'error');
    btn.disabled = false; return;
  }
  navigator.geolocation.getCurrentPosition(
    pos => {
      App.gpsCoords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      statusEl.innerHTML = `<i class="fas fa-check-circle"></i> ${App.gpsCoords.lat.toFixed(5)}, ${App.gpsCoords.lng.toFixed(5)}`;
      statusEl.className = 'gps-status got';
      btn.disabled = false; btn.innerHTML = '<i class="fas fa-redo"></i> Retry';
      showToast('Location captured!');
      // Reverse geocode
      fetch(`https://nominatim.openstreetmap.org/reverse?lat=${App.gpsCoords.lat}&lon=${App.gpsCoords.lng}&format=json`)
        .then(r => r.json()).then(d => {
          if (d && d.address) {
            const a = d.address;
            const formatted = [a.house_number, a.road, a.city || a.town || a.village, a.state, a.postcode].filter(Boolean).join(', ');
            document.getElementById('add-address').value = formatted || d.display_name;
          }
        }).catch(() => {});
    },
    () => {
      showToast('GPS failed — enter address manually', 'error');
      statusEl.innerHTML = '<i class="fas fa-exclamation-triangle"></i> GPS failed';
      btn.disabled = false; btn.innerHTML = '<i class="fas fa-crosshairs"></i> Retry GPS';
    },
    { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
  );
}

function handlePhotoSelect(input) {
  const file = input.files[0];
  if (!file) return;
  App.photoFile = file;
  const reader = new FileReader();
  reader.onload = e => {
    App.photoDataUrl = e.target.result;
    document.getElementById('add-photo-img').src = App.photoDataUrl;
    document.getElementById('add-photo-preview').style.display = '';
    document.getElementById('add-photo-zone').style.display    = 'none';
    document.getElementById('change-photo-btn').style.display  = '';
  };
  reader.readAsDataURL(file);
}

async function uploadPhoto(file, signId) {
  const wrap = document.getElementById('upload-progress-wrap');
  const bar  = document.getElementById('upload-bar');
  wrap.style.display = '';
  bar.style.width    = '0%';

  const ext = file.name.split('.').pop() || 'jpg';
  const ref = App.storage.ref(`reillys_signs/${signId}.${ext}`);
  const task = ref.put(file);

  return new Promise((resolve, reject) => {
    task.on('state_changed',
      snap => {
        const pct = (snap.bytesTransferred / snap.totalBytes) * 100;
        bar.style.width = pct + '%';
      },
      err => { wrap.style.display = 'none'; reject(err); },
      async () => {
        bar.style.width = '100%';
        const url = await task.snapshot.ref.getDownloadURL();
        setTimeout(() => { wrap.style.display = 'none'; }, 600);
        resolve(url);
      }
    );
  });
}

async function handleAddSign(e) {
  e.preventDefault();
  const address   = document.getElementById('add-address').value.trim();
  const sign_type = document.getElementById('add-sign-type').value;
  const date_inst = document.getElementById('add-date').value;
  const notes     = document.getElementById('add-notes').value.trim();
  const installer = document.getElementById('add-installer').value.trim();

  if (!address)          { showToast('Address is required', 'error'); return; }
  if (!App.photoFile && !App.photoDataUrl) { showToast('A photo is required', 'error'); return; }

  showLoading('Saving sign...');
  try {
    // Create Firestore doc first to get ID
    const docRef = await App.db.collection('reillys_signs').add({
      address, sign_type, date_installed: date_inst, notes, installer_name: installer,
      status: 'active',
      latitude:  App.gpsCoords?.lat || null,
      longitude: App.gpsCoords?.lng || null,
      photo_url: '',
      created_at: firebase.firestore.FieldValue.serverTimestamp(),
      updated_at: firebase.firestore.FieldValue.serverTimestamp(),
    });

    // Upload photo to Storage
    let photoUrl = '';
    if (App.photoFile) {
      hideLoading(); showLoading('Uploading photo...');
      photoUrl = await uploadPhoto(App.photoFile, docRef.id);
    } else if (App.photoDataUrl) {
      photoUrl = App.photoDataUrl; // fallback (base64 for demo)
    }

    // Update doc with photo URL
    await docRef.update({ photo_url: photoUrl });

    hideLoading();
    showToast('Sign saved & synced to all devices! 🎯');
    App.detailSignId = docRef.id;
    openDetail(docRef.id);
  } catch (err) {
    hideLoading();
    showToast('Error saving sign: ' + err.message, 'error');
    console.error(err);
  }
}

// ===== LIST =====
let listFilter = 'all';
function loadList(filter) {
  if (filter !== undefined) listFilter = filter;
  document.querySelectorAll('.filter-chip').forEach(c => c.classList.toggle('active', c.dataset.filter === listFilter));
  let signs = App.signs;
  if (listFilter === 'active')  signs = signs.filter(s => s.status === 'active');
  if (listFilter === 'removed') signs = signs.filter(s => s.status === 'removed');

  const listEl = document.getElementById('sign-list');
  listEl.innerHTML = '';
  if (!signs.length) {
    listEl.innerHTML = `<div class="empty-state"><i class="fas fa-map-marker-alt"></i><p>No signs found</p></div>`; return;
  }
  signs.forEach(s => {
    const t = SIGN_TYPES.find(x => x.value === s.sign_type) || SIGN_TYPES[0];
    listEl.innerHTML += `
      <div class="sign-row" onclick="openDetail('${s.id}')">
        <img class="sign-thumb" src="${s.photo_url || 'https://placehold.co/80x80/0D3321/A2752A?text=Sign'}" alt="" onerror="this.src='https://placehold.co/80x80/0D3321/A2752A?text=Sign'">
        <div class="sign-info">
          <div class="sign-addr">${s.address || 'No address'}</div>
          <div class="sign-meta"><span class="sign-type-tag">${t.label}</span><span>📅 ${fmtDate(s.date_installed)}</span></div>
        </div>
        <span class="status-badge ${s.status}">${s.status}</span>
      </div>`;
  });
}

// ===== DETAIL =====
function openDetail(id) {
  const s = App.signs.find(x => x.id === id);
  if (!s) return;
  App.detailSignId = id;
  const t = SIGN_TYPES.find(x => x.value === s.sign_type) || SIGN_TYPES[0];

  document.getElementById('detail-photo').src                = s.photo_url || 'https://placehold.co/600x300/0D3321/A2752A?text=No+Photo';
  document.getElementById('detail-address').textContent      = s.address || '—';
  document.getElementById('detail-type').textContent         = t.label;
  document.getElementById('detail-status-badge').textContent = s.status;
  document.getElementById('detail-status-badge').className   = `status-badge ${s.status}`;
  document.getElementById('detail-date').textContent         = fmtDate(s.date_installed);
  document.getElementById('detail-coords').textContent       = s.latitude ? `${s.latitude.toFixed(5)}, ${s.longitude.toFixed(5)}` : 'Not recorded';
  document.getElementById('detail-notes').textContent        = s.notes || '—';
  document.getElementById('detail-by').textContent           = s.installer_name || '—';

  const markBtn = document.getElementById('detail-mark-btn');
  if (s.status === 'active') {
    markBtn.className = 'btn btn-danger btn-full';
    markBtn.innerHTML = '<i class="fas fa-times-circle"></i> Mark as Removed';
  } else {
    markBtn.className = 'btn btn-primary btn-full';
    markBtn.innerHTML = '<i class="fas fa-redo"></i> Restore as Active';
  }
  showScreen('detail');

  setTimeout(() => {
    const container = document.getElementById('detail-mini-map');
    if (!container) return;
    if (App.detailMapInstance) { App.detailMapInstance.remove(); App.detailMapInstance = null; }
    if (s.latitude && s.longitude) {
      container.style.display = '';
      App.detailMapInstance = L.map('detail-mini-map', { zoomControl: false, dragging: false, scrollWheelZoom: false }).setView([s.latitude, s.longitude], 15);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(App.detailMapInstance);
      const icon = L.divIcon({
        className: '', iconSize: [28, 28], iconAnchor: [14, 14],
        html: `<div style="width:28px;height:28px;border-radius:50%;background:#0D3321;border:3px solid #A2752A;display:flex;align-items:center;justify-content:center"><i class="fas fa-map-marker-alt" style="color:#A2752A;font-size:12px"></i></div>`,
      });
      L.marker([s.latitude, s.longitude], { icon }).addTo(App.detailMapInstance);
    } else {
      container.style.display = 'none';
    }
  }, 100);
}

async function toggleSignStatus() {
  const s = App.signs.find(x => x.id === App.detailSignId);
  if (!s) return;
  const newStatus = s.status === 'active' ? 'removed' : 'active';
  const ok = await showConfirm(newStatus === 'removed' ? 'Remove Sign' : 'Restore Sign',
    newStatus === 'removed' ? 'Mark this sign as removed?' : 'Restore this sign as active?');
  if (!ok) return;
  showLoading('Updating...');
  try {
    await App.db.collection('reillys_signs').doc(App.detailSignId).update({
      status: newStatus,
      date_removed: newStatus === 'removed' ? new Date().toISOString().split('T')[0] : null,
      updated_at: firebase.firestore.FieldValue.serverTimestamp(),
    });
    hideLoading();
    showToast(`Sign marked as ${newStatus}`);
    // Re-open detail (data refreshed via listener)
    setTimeout(() => openDetail(App.detailSignId), 400);
  } catch (err) {
    hideLoading(); showToast('Update failed: ' + err.message, 'error');
  }
}

async function deleteSign() {
  const ok = await showConfirm('Delete Sign', 'Permanently delete this sign? This cannot be undone.');
  if (!ok) return;
  showLoading('Deleting...');
  try {
    await App.db.collection('reillys_signs').doc(App.detailSignId).delete();
    hideLoading();
    showToast('Sign deleted', 'info');
    showScreen('list');
  } catch (err) {
    hideLoading(); showToast('Delete failed: ' + err.message, 'error');
  }
}

// ===== EDIT SIGN =====
function openEditSign() {
  const s = App.signs.find(x => x.id === App.detailSignId);
  if (!s) return;
  App.editSignId   = s.id;
  App.gpsCoords    = s.latitude ? { lat: s.latitude, lng: s.longitude } : null;
  App.photoFile    = null;
  App.photoDataUrl = s.photo_url || null;

  document.getElementById('edit-address').value   = s.address || '';
  document.getElementById('edit-date').value      = s.date_installed || '';
  document.getElementById('edit-notes').value     = s.notes || '';
  document.getElementById('edit-installer').value = s.installer_name || '';

  const sel = document.getElementById('edit-sign-type');
  if (sel) Array.from(sel.options).forEach(o => o.selected = o.value === s.sign_type);

  if (App.gpsCoords) {
    const el = document.getElementById('edit-gps-status');
    el.innerHTML = `<i class="fas fa-check-circle"></i> ${App.gpsCoords.lat.toFixed(5)}, ${App.gpsCoords.lng.toFixed(5)}`;
    el.className = 'gps-status got';
  }

  if (App.photoDataUrl) {
    document.getElementById('edit-photo-img').src            = App.photoDataUrl;
    document.getElementById('edit-photo-preview').style.display = '';
    document.getElementById('edit-photo-zone').style.display    = 'none';
    document.getElementById('edit-change-photo-btn').style.display = '';
  } else {
    document.getElementById('edit-photo-preview').style.display = 'none';
    document.getElementById('edit-photo-zone').style.display    = '';
  }
  showScreen('edit');
}

function captureEditGPS() {
  const btn = document.getElementById('edit-gps-btn');
  const el  = document.getElementById('edit-gps-status');
  btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
  navigator.geolocation.getCurrentPosition(
    pos => {
      App.gpsCoords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      el.innerHTML  = `<i class="fas fa-check-circle"></i> ${App.gpsCoords.lat.toFixed(5)}, ${App.gpsCoords.lng.toFixed(5)}`;
      el.className  = 'gps-status got';
      btn.disabled = false; btn.innerHTML = '<i class="fas fa-redo"></i> Retry';
    },
    () => { showToast('GPS failed', 'error'); btn.disabled = false; btn.innerHTML = '<i class="fas fa-crosshairs"></i> Retry GPS'; },
    { enableHighAccuracy: true, timeout: 12000 }
  );
}

function handleEditPhotoSelect(input) {
  const file = input.files[0];
  if (!file) return;
  App.photoFile = file;
  const reader = new FileReader();
  reader.onload = e => {
    App.photoDataUrl = e.target.result;
    document.getElementById('edit-photo-img').src = App.photoDataUrl;
    document.getElementById('edit-photo-preview').style.display = '';
    document.getElementById('edit-photo-zone').style.display    = 'none';
    document.getElementById('edit-change-photo-btn').style.display = '';
  };
  reader.readAsDataURL(file);
}

async function handleEditSign(e) {
  e.preventDefault();
  const address   = document.getElementById('edit-address').value.trim();
  const sign_type = document.getElementById('edit-sign-type').value;
  const date_inst = document.getElementById('edit-date').value;
  const notes     = document.getElementById('edit-notes').value.trim();
  const installer = document.getElementById('edit-installer').value.trim();
  if (!address) { showToast('Address is required', 'error'); return; }

  showLoading('Updating sign...');
  try {
    let photoUrl = App.signs.find(x => x.id === App.editSignId)?.photo_url || '';
    if (App.photoFile) {
      hideLoading(); showLoading('Uploading photo...');
      photoUrl = await uploadPhoto(App.photoFile, App.editSignId);
    }
    await App.db.collection('reillys_signs').doc(App.editSignId).update({
      address, sign_type, date_installed: date_inst, notes, installer_name: installer,
      latitude:  App.gpsCoords?.lat || null,
      longitude: App.gpsCoords?.lng || null,
      photo_url: photoUrl,
      updated_at: firebase.firestore.FieldValue.serverTimestamp(),
    });
    hideLoading();
    showToast('Sign updated & synced!');
    App.detailSignId = App.editSignId;
    setTimeout(() => openDetail(App.editSignId), 400);
  } catch (err) {
    hideLoading(); showToast('Update failed: ' + err.message, 'error');
  }
}

// ===== ADMIN =====
function loadAdmin() {
  const signs = App.signs;
  document.getElementById('admin-total').textContent   = signs.length;
  document.getElementById('admin-active').textContent  = signs.filter(s => s.status === 'active').length;
  document.getElementById('admin-removed').textContent = signs.filter(s => s.status === 'removed').length;
  renderAdminTable(signs);
}

function renderAdminTable(signs) {
  const tbody = document.getElementById('admin-tbody');
  tbody.innerHTML = '';
  if (!signs.length) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--text-light);font-style:italic;padding:20px">No records</td></tr>'; return;
  }
  signs.forEach(s => {
    const t = SIGN_TYPES.find(x => x.value === s.sign_type) || SIGN_TYPES[0];
    tbody.innerHTML += `
      <tr>
        <td style="font-size:0.75rem;max-width:70px;overflow:hidden;text-overflow:ellipsis">${s.id.slice(0,8)}…</td>
        <td style="max-width:140px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${s.address || '—'}</td>
        <td><span class="sign-type-tag">${t.label}</span></td>
        <td><span class="status-badge ${s.status}">${s.status}</span></td>
        <td style="font-size:0.76rem">${fmtDate(s.date_installed)}</td>
        <td>
          <button class="btn btn-secondary btn-sm" onclick="openDetail('${s.id}')"><i class="fas fa-eye"></i></button>
          <button class="btn btn-danger btn-sm" onclick="adminDelete('${s.id}')" style="margin-left:4px"><i class="fas fa-trash"></i></button>
        </td>
      </tr>`;
  });
}

function populateAdminTypeFilter() {
  const sel = document.getElementById('admin-type-filter');
  if (!sel) return;
  SIGN_TYPES.forEach(t => {
    const opt = document.createElement('option');
    opt.value = t.value; opt.textContent = t.label;
    sel.appendChild(opt);
  });
}

function applyAdminFilter() {
  const statusFilter = document.getElementById('admin-status-filter').value;
  const typeFilter   = document.getElementById('admin-type-filter').value;
  let signs = App.signs;
  if (statusFilter) signs = signs.filter(s => s.status === statusFilter);
  if (typeFilter)   signs = signs.filter(s => s.sign_type === typeFilter);
  renderAdminTable(signs);
}

async function adminDelete(id) {
  const ok = await showConfirm('Delete Sign', 'Permanently delete this record?');
  if (!ok) return;
  showLoading('Deleting...');
  try {
    await App.db.collection('reillys_signs').doc(id).delete();
    hideLoading(); showToast('Deleted', 'info');
  } catch (err) {
    hideLoading(); showToast('Delete failed', 'error');
  }
}

function exportCSV() {
  const signs = App.signs;
  const headers = ['ID','Address','Sign Type','Status','Lat','Lng','Date Installed','Date Removed','Notes','Installer','Created At'];
  const rows = signs.map(s => [
    s.id,
    `"${(s.address||'').replace(/"/g,'""')}"`,
    SIGN_TYPES.find(t => t.value === s.sign_type)?.label || s.sign_type,
    s.status, s.latitude||'', s.longitude||'',
    s.date_installed||'', s.date_removed||'',
    `"${(s.notes||'').replace(/"/g,'""')}"`,
    s.installer_name||'',
    s.created_at?.toDate?.()?.toISOString?.() || ''
  ].join(','));
  const csv  = [headers.join(','), ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = `reillys-guns-signs-${new Date().toISOString().split('T')[0]}.csv`;
  a.click(); URL.revokeObjectURL(url);
  showToast('CSV exported!');
}

// ===== HELPERS =====
function populateSignTypeSelect(id) {
  const sel = document.getElementById(id);
  if (!sel) return;
  sel.innerHTML = '';
  SIGN_TYPES.forEach(t => {
    const opt = document.createElement('option');
    opt.value = t.value; opt.textContent = t.label;
    sel.appendChild(opt);
  });
}

function fmtDate(d) {
  if (!d) return '—';
  return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// ===== CHECK SAVED CONFIG ON LOAD =====
(function checkSavedConfig() {
  const saved = localStorage.getItem('reillysguns_firebase_config');
  if (saved) {
    try {
      const cfg = JSON.parse(saved);
      Object.assign(FIREBASE_CONFIG, cfg);
    } catch(e) {}
  }
})();

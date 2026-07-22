/* ============================================================
   REILLY'S GUNS — YARD SIGN TRACKER
   Fully independent application. Separate DB namespace.
   ============================================================ */

'use strict';

// ===== CONFIGURATION — REILLY'S GUNS =====
const BRAND = {
  name:     "Reilly's Guns",
  tagline:  'Inherited Firearms Specialists',
  phone:    '(856) 447-3030',
  appTitle: "Reilly's Guns Sign Tracker",
  dbPrefix: 'reillysguns_',          // unique namespace — fully independent
  adminEmail: 'admin@reillysguns.com',
  fieldEmail: 'field@reillysguns.com',
};

// Sign types — Reilly's Guns specific
const SIGN_TYPES = [
  { value: 'inherited',  label: 'Inherited Firearms',  color: '#8B4513', dot: 'dot-inherited'  },
  { value: 'general',    label: 'General Promotion',   color: '#4682B4', dot: 'dot-general'    },
  { value: 'upcoming',   label: 'Upcoming Event',      color: '#2E8B57', dot: 'dot-upcoming'   },
  { value: 'event',      label: 'Sale Event',          color: '#8B008B', dot: 'dot-event'      },
  { value: 'sale',       label: 'Special Offer',       color: '#CC5500', dot: 'dot-sale'       },
  { value: 'custom',     label: 'Other / Custom',      color: '#4a4a4a', dot: 'dot-custom'     },
];

// ===== MOCK BACKEND (localStorage with brand prefix) =====
const DB = {
  _key: (table) => `${BRAND.dbPrefix}${table}`,
  get: (table) => JSON.parse(localStorage.getItem(DB._key(table)) || '[]'),
  set: (table, data) => localStorage.setItem(DB._key(table), JSON.stringify(data)),
  nextId: (table) => {
    const rows = DB.get(table);
    return rows.length ? Math.max(...rows.map(r => r.id)) + 1 : 1;
  },
  insert: (table, row) => {
    const rows = DB.get(table);
    const newRow = { ...row, id: DB.nextId(table), created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
    rows.push(newRow);
    DB.set(table, rows);
    return newRow;
  },
  update: (table, id, patch) => {
    const rows = DB.get(table).map(r => r.id === id ? { ...r, ...patch, updated_at: new Date().toISOString() } : r);
    DB.set(table, rows);
    return rows.find(r => r.id === id);
  },
  delete: (table, id) => DB.set(table, DB.get(table).filter(r => r.id !== id)),
  find: (table, id) => DB.get(table).find(r => r.id === id),
};

// ===== APP STATE =====
const App = {
  currentUser: null,
  currentScreen: 'login',
  editSignId: null,
  detailSignId: null,
  gpsCoords: null,
  photoDataUrl: null,
  detailMapInstance: null,
  mapInstance: null,
  mapInitialized: false,
};

// ===== INIT =====
document.addEventListener('DOMContentLoaded', () => {
  seedDefaultData();
  const savedUser = localStorage.getItem(`${BRAND.dbPrefix}currentUser`);
  if (savedUser) {
    App.currentUser = JSON.parse(savedUser);
    afterLogin();
  } else {
    showScreen('login');
  }
});

function seedDefaultData() {
  if (DB.get('users').length === 0) {
    DB.insert('users', { name: "Admin — Reilly's Guns", email: BRAND.adminEmail, role: 'admin' });
    DB.insert('users', { name: 'Field Agent',           email: BRAND.fieldEmail, role: 'field' });
  }
  if (DB.get('signs').length === 0) {
    // Seed around Vineland, NJ (near (856) area code)
    DB.insert('signs', {
      address: '1234 S Delsea Dr, Vineland, NJ 08360', sign_type: 'inherited',
      status: 'active', latitude: 39.4868, longitude: -75.0277,
      date_installed: '2026-06-10', notes: 'High-traffic corner — corner of Delsea & Chestnut',
      photo_url: 'https://placehold.co/400x300/0D3321/A2752A?text=Inherited+Firearms',
      created_by: BRAND.adminEmail,
    });
    DB.insert('signs', {
      address: '890 E Landis Ave, Vineland, NJ 08361', sign_type: 'general',
      status: 'active', latitude: 39.4853, longitude: -75.0133,
      date_installed: '2026-06-15', notes: 'Near strip mall, good visibility',
      photo_url: 'https://placehold.co/400x300/0D3321/A2752A?text=General+Promo',
      created_by: BRAND.fieldEmail,
    });
    DB.insert('signs', {
      address: '200 N Main Rd, Vineland, NJ 08360', sign_type: 'upcoming',
      status: 'removed', latitude: 39.5012, longitude: -75.0312,
      date_installed: '2026-05-01', date_removed: '2026-06-01', notes: 'Removed after event ended',
      photo_url: 'https://placehold.co/400x300/174d31/c49640?text=Removed+Sign',
      created_by: BRAND.fieldEmail,
    });
  }
}

// ===== TOAST =====
function showToast(msg, type = 'success') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<i class="fas fa-${type === 'success' ? 'check-circle' : type === 'error' ? 'times-circle' : 'info-circle'}"></i> ${msg}`;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 3200);
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
  document.getElementById('confirm-title').textContent = title;
  document.getElementById('confirm-message').textContent = message;
  document.getElementById('confirm-modal').classList.remove('hidden');
  return new Promise(resolve => { _confirmResolve = resolve; });
}
function handleConfirmOk()    { document.getElementById('confirm-modal').classList.add('hidden'); if (_confirmResolve) _confirmResolve(true); }
function handleConfirmCancel(){ document.getElementById('confirm-modal').classList.add('hidden'); if (_confirmResolve) _confirmResolve(false); }

// ===== SCREEN NAVIGATION =====
function showScreen(screenId) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const screen = document.getElementById(screenId + '-screen');
  if (screen) { screen.classList.add('active'); App.currentScreen = screenId; }
  document.querySelectorAll('.nav-item').forEach(item => {
    item.classList.toggle('active', item.dataset.screen === screenId);
  });
  // admin visibility
  const isAdmin = App.currentUser && App.currentUser.role === 'admin';
  document.querySelectorAll('.admin-only').forEach(el => el.style.display = isAdmin ? '' : 'none');
  if (screenId === 'map')       initMap();
  if (screenId === 'dashboard') loadDashboard();
  if (screenId === 'list')      loadList();
  if (screenId === 'admin')     loadAdmin();
}

function afterLogin() {
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('main-nav').style.display = 'flex';
  // Admin nav
  const isAdmin = App.currentUser && App.currentUser.role === 'admin';
  document.querySelectorAll('.admin-only').forEach(el => el.style.display = isAdmin ? '' : 'none');
  showScreen('dashboard');
}

// ===== AUTH =====
function handleLogin(e) {
  e.preventDefault();
  const email    = document.getElementById('login-email').value.trim().toLowerCase();
  const password = document.getElementById('login-password').value;
  if (!email || !password) { showToast('Please enter email and password', 'error'); return; }
  showLoading('Signing in...');
  setTimeout(() => {
    const users = DB.get('users');
    const user  = users.find(u => u.email && u.email.toLowerCase() === email);
    if (!user) { hideLoading(); showToast('Account not found', 'error'); return; }
    const knownPwds = { [BRAND.adminEmail]: 'admin123', [BRAND.fieldEmail]: 'field123' };
    const expected  = knownPwds[email];
    if (expected && password !== expected) { hideLoading(); showToast('Incorrect password', 'error'); return; }
    App.currentUser = user;
    localStorage.setItem(`${BRAND.dbPrefix}currentUser`, JSON.stringify(user));
    hideLoading();
    showToast(`Welcome, ${user.name.split('—')[0].trim()}!`);
    afterLogin();
  }, 600);
}

function handleLogout() {
  App.currentUser = null;
  localStorage.removeItem(`${BRAND.dbPrefix}currentUser`);
  App.mapInitialized = false;
  App.mapInstance = null;
  document.getElementById('login-screen').style.display = '';
  document.getElementById('main-nav').style.display = 'none';
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  showScreen('login');
  document.getElementById('login-screen').style.display = '';
  document.getElementById('login-screen').classList.add('active');
  showToast('Signed out', 'info');
}

// ===== DASHBOARD =====
function loadDashboard() {
  const signs = DB.get('signs');
  const active  = signs.filter(s => s.status === 'active');
  const removed = signs.filter(s => s.status === 'removed');
  document.getElementById('dash-active-count').textContent  = active.length;
  document.getElementById('dash-removed-count').textContent = removed.length;
  document.getElementById('dash-total-count').textContent   = signs.length;

  // By type breakdown
  const typeBreak = document.getElementById('type-breakdown');
  typeBreak.innerHTML = '';
  SIGN_TYPES.forEach(t => {
    const count = active.filter(s => s.sign_type === t.value).length;
    if (count === 0) return;
    typeBreak.innerHTML += `
      <div class="type-row">
        <div class="type-dot ${t.dot}"></div>
        <span class="type-name">${t.label}</span>
        <span class="type-count">${count}</span>
      </div>`;
  });
  if (!typeBreak.innerHTML) typeBreak.innerHTML = '<p style="color:var(--text-light);font-size:0.85rem;font-style:italic">No active signs yet.</p>';

  // Recent
  const recent = [...signs].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 5);
  const recentEl = document.getElementById('recent-list');
  recentEl.innerHTML = '';
  recent.forEach(s => {
    const t = SIGN_TYPES.find(x => x.value === s.sign_type) || SIGN_TYPES[0];
    recentEl.innerHTML += `
      <div class="recent-item" onclick="openDetail(${s.id})">
        <img class="recent-thumb" src="${s.photo_url || 'https://placehold.co/80x80/0D3321/A2752A?text=Sign'}" alt="" onerror="this.src='https://placehold.co/80x80/0D3321/A2752A?text=Sign'">
        <div class="recent-info">
          <div class="recent-addr">${s.address || 'No address'}</div>
          <div class="recent-meta">${t.label} · ${fmtDate(s.date_installed)}</div>
        </div>
        <span class="status-badge ${s.status}">${s.status}</span>
      </div>`;
  });
  if (!recentEl.innerHTML) recentEl.innerHTML = '<p style="color:var(--text-light);font-size:0.85rem;font-style:italic">No signs added yet.</p>';
}

// ===== MAP =====
function initMap() {
  if (App.mapInitialized && App.mapInstance) { refreshMapPins(); return; }
  const mapEl = document.getElementById('leaflet-map');
  if (!mapEl || typeof L === 'undefined') return;
  App.mapInstance = L.map('leaflet-map', { zoomControl: true }).setView([39.4868, -75.0277], 13);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© <a href="https://www.openstreetmap.org/">OpenStreetMap</a> contributors', maxZoom: 19,
  }).addTo(App.mapInstance);
  App.mapInitialized = true;
  refreshMapPins();
}

function refreshMapPins() {
  if (!App.mapInstance) return;
  App.mapInstance.eachLayer(layer => { if (layer instanceof L.Marker) App.mapInstance.removeLayer(layer); });
  const signs = DB.get('signs');
  signs.forEach(s => {
    if (!s.latitude || !s.longitude) return;
    const color  = s.status === 'active' ? '#0D3321' : '#8b1a1a';
    const border = s.status === 'active' ? '#A2752A' : '#cc4444';
    const icon = L.divIcon({
      className: '', iconSize: [30, 30], iconAnchor: [15, 15], popupAnchor: [0, -15],
      html: `<div style="width:30px;height:30px;border-radius:50%;background:${color};border:3px solid ${border};display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(0,0,0,0.35)">
               <i class="fas fa-map-marker-alt" style="color:${border};font-size:13px"></i></div>`,
    });
    const t = SIGN_TYPES.find(x => x.value === s.sign_type) || SIGN_TYPES[0];
    L.marker([s.latitude, s.longitude], { icon })
      .addTo(App.mapInstance)
      .bindPopup(`<div style="font-family:Georgia,serif;min-width:160px">
        <strong style="color:#0D3321">${s.address || 'No address'}</strong><br>
        <span style="font-size:0.8rem;color:#A2752A">${t.label}</span><br>
        <span style="font-size:0.78rem;color:#666">${s.status === 'active' ? '🟢 Active' : '🔴 Removed'}</span><br>
        <a href="#" onclick="event.preventDefault();openDetail(${s.id})" style="font-size:0.78rem;color:#0D3321">View details →</a>
      </div>`);
  });
}

// ===== ADD SIGN =====
function openAddSign() {
  App.editSignId   = null;
  App.gpsCoords    = null;
  App.photoDataUrl = null;
  document.getElementById('add-form').reset();
  document.getElementById('add-date').value = new Date().toISOString().split('T')[0];
  document.getElementById('gps-status').textContent  = 'Tap "Capture GPS" to get location';
  document.getElementById('gps-status').className    = 'gps-status';
  document.getElementById('add-photo-preview').style.display = 'none';
  document.getElementById('add-photo-zone').style.display    = '';
  document.getElementById('change-photo-btn').style.display  = 'none';

  // Populate sign type select
  const sel = document.getElementById('add-sign-type');
  sel.innerHTML = '';
  SIGN_TYPES.forEach(t => {
    const opt = document.createElement('option');
    opt.value = t.value; opt.textContent = t.label;
    sel.appendChild(opt);
  });
  showScreen('add');
}

function captureGPS() {
  const btn = document.getElementById('gps-btn');
  const statusEl = document.getElementById('gps-status');
  btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
  statusEl.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Getting location...';
  if (!navigator.geolocation) {
    showToast('GPS not available on this device', 'error');
    btn.disabled = false; btn.innerHTML = '<i class="fas fa-crosshairs"></i> Capture GPS';
    return;
  }
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      App.gpsCoords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      statusEl.innerHTML = `<i class="fas fa-check-circle"></i> ${App.gpsCoords.lat.toFixed(5)}, ${App.gpsCoords.lng.toFixed(5)}`;
      statusEl.className = 'gps-status got';
      btn.disabled = false; btn.innerHTML = '<i class="fas fa-redo"></i> Retry';
      showToast('Location captured!', 'success');
      // Try reverse geocode
      fetch(`https://nominatim.openstreetmap.org/reverse?lat=${App.gpsCoords.lat}&lon=${App.gpsCoords.lng}&format=json`)
        .then(r => r.json()).then(d => {
          if (d && d.display_name) {
            const addr = d.address;
            const formatted = [addr.house_number, addr.road, addr.city || addr.town || addr.village, addr.state, addr.postcode].filter(Boolean).join(', ');
            document.getElementById('add-address').value = formatted || d.display_name;
          }
        }).catch(() => {});
    },
    (err) => {
      showToast('Could not get GPS. Enter address manually.', 'error');
      statusEl.innerHTML = '<i class="fas fa-exclamation-triangle"></i> GPS failed — enter manually';
      btn.disabled = false; btn.innerHTML = '<i class="fas fa-crosshairs"></i> Retry GPS';
    },
    { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
  );
}

function handlePhotoSelect(input) {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    App.photoDataUrl = e.target.result;
    const previewImg = document.getElementById('add-photo-img');
    if (previewImg) previewImg.src = App.photoDataUrl;
    document.getElementById('add-photo-preview').style.display = '';
    document.getElementById('add-photo-zone').style.display    = 'none';
    document.getElementById('change-photo-btn').style.display  = '';
  };
  reader.readAsDataURL(file);
}

function triggerPhotoInput() { document.getElementById('photo-input').click(); }

function handleAddSign(e) {
  e.preventDefault();
  const address   = document.getElementById('add-address').value.trim();
  const sign_type = document.getElementById('add-sign-type').value;
  const date_inst = document.getElementById('add-date').value;
  const notes     = document.getElementById('add-notes').value.trim();
  const installer = document.getElementById('add-installer').value.trim();

  if (!address)          { showToast('Address is required', 'error'); return; }
  if (!App.gpsCoords && !address) { showToast('Please capture GPS or enter address', 'error'); return; }
  if (!App.photoDataUrl) { showToast('A photo is required', 'error'); return; }

  showLoading('Saving sign...');
  setTimeout(() => {
    const newSign = DB.insert('signs', {
      address, sign_type, date_installed: date_inst, notes, installer_name: installer,
      status: 'active',
      latitude:  App.gpsCoords ? App.gpsCoords.lat : null,
      longitude: App.gpsCoords ? App.gpsCoords.lng : null,
      photo_url: App.photoDataUrl,
      created_by: App.currentUser ? App.currentUser.email : 'unknown',
    });
    hideLoading();
    showToast('Sign saved successfully!', 'success');
    App.mapInitialized && refreshMapPins();
    openDetail(newSign.id);
  }, 500);
}

// ===== LIST VIEW =====
let listFilter = 'all';
function loadList(filter) {
  if (filter !== undefined) listFilter = filter;
  // update chips
  document.querySelectorAll('.filter-chip').forEach(c => c.classList.toggle('active', c.dataset.filter === listFilter));
  let signs = DB.get('signs');
  if (listFilter === 'active')  signs = signs.filter(s => s.status === 'active');
  if (listFilter === 'removed') signs = signs.filter(s => s.status === 'removed');
  signs = [...signs].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  const listEl = document.getElementById('sign-list');
  listEl.innerHTML = '';
  if (signs.length === 0) {
    listEl.innerHTML = `<div class="empty-state"><i class="fas fa-map-marker-alt"></i><p>No signs found</p></div>`; return;
  }
  signs.forEach(s => {
    const t = SIGN_TYPES.find(x => x.value === s.sign_type) || SIGN_TYPES[0];
    listEl.innerHTML += `
      <div class="sign-row" onclick="openDetail(${s.id})">
        <img class="sign-thumb" src="${s.photo_url || 'https://placehold.co/80x80/0D3321/A2752A?text=Sign'}" alt="" onerror="this.src='https://placehold.co/80x80/0D3321/A2752A?text=Sign'">
        <div class="sign-info">
          <div class="sign-addr">${s.address || 'No address'}</div>
          <div class="sign-meta">
            <span class="sign-type-tag">${t.label}</span>
            <span>📅 ${fmtDate(s.date_installed)}</span>
          </div>
        </div>
        <span class="status-badge ${s.status}">${s.status}</span>
      </div>`;
  });
}

// ===== DETAIL VIEW =====
function openDetail(id) {
  const s = DB.find('signs', id);
  if (!s) return;
  App.detailSignId = id;
  const t = SIGN_TYPES.find(x => x.value === s.sign_type) || SIGN_TYPES[0];

  document.getElementById('detail-photo').src  = s.photo_url || 'https://placehold.co/600x300/0D3321/A2752A?text=No+Photo';
  document.getElementById('detail-address').textContent      = s.address || '—';
  document.getElementById('detail-type').textContent         = t.label;
  document.getElementById('detail-status-badge').textContent = s.status;
  document.getElementById('detail-status-badge').className   = `status-badge ${s.status}`;
  document.getElementById('detail-date').textContent         = fmtDate(s.date_installed);
  document.getElementById('detail-coords').textContent       = s.latitude ? `${s.latitude.toFixed(5)}, ${s.longitude.toFixed(5)}` : 'Not recorded';
  document.getElementById('detail-notes').textContent        = s.notes || '—';
  document.getElementById('detail-installed-by').textContent = s.installer_name || s.created_by || '—';
  document.getElementById('detail-created').textContent      = fmtDateTime(s.created_at);

  const markBtn = document.getElementById('detail-mark-btn');
  if (s.status === 'active') {
    markBtn.className = 'btn btn-danger btn-full';
    markBtn.innerHTML = '<i class="fas fa-times-circle"></i> Mark as Removed';
  } else {
    markBtn.className = 'btn btn-primary btn-full';
    markBtn.innerHTML = '<i class="fas fa-redo"></i> Restore as Active';
  }

  const isAdmin = App.currentUser && App.currentUser.role === 'admin';
  document.getElementById('detail-delete-btn').style.display = isAdmin ? '' : 'none';

  showScreen('detail');

  // Mini map in detail
  setTimeout(() => {
    const container = document.getElementById('detail-mini-map');
    if (!container) return;
    if (App.detailMapInstance) { App.detailMapInstance.remove(); App.detailMapInstance = null; }
    if (s.latitude && s.longitude) {
      container.style.display = '';
      App.detailMapInstance = L.map('detail-mini-map', { zoomControl: false, dragging: false, scrollWheelZoom: false }).setView([s.latitude, s.longitude], 15);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(App.detailMapInstance);
      const icon = L.divIcon({
        className:'', iconSize:[28,28], iconAnchor:[14,14],
        html:`<div style="width:28px;height:28px;border-radius:50%;background:#0D3321;border:3px solid #A2752A;display:flex;align-items:center;justify-content:center"><i class="fas fa-map-marker-alt" style="color:#A2752A;font-size:12px"></i></div>`,
      });
      L.marker([s.latitude, s.longitude], { icon }).addTo(App.detailMapInstance);
    } else {
      container.style.display = 'none';
    }
  }, 100);
}

async function toggleSignStatus() {
  const s = DB.find('signs', App.detailSignId);
  if (!s) return;
  const newStatus = s.status === 'active' ? 'removed' : 'active';
  const msg = newStatus === 'removed' ? 'Mark this sign as removed?' : 'Restore this sign as active?';
  const ok = await showConfirm(newStatus === 'removed' ? 'Remove Sign' : 'Restore Sign', msg);
  if (!ok) return;
  DB.update('signs', App.detailSignId, {
    status: newStatus,
    date_removed: newStatus === 'removed' ? new Date().toISOString().split('T')[0] : null,
  });
  showToast(`Sign marked as ${newStatus}`, 'success');
  openDetail(App.detailSignId);
  App.mapInitialized && refreshMapPins();
}

async function deleteSign() {
  const ok = await showConfirm('Delete Sign', 'Permanently delete this sign record? This cannot be undone.');
  if (!ok) return;
  DB.delete('signs', App.detailSignId);
  showToast('Sign deleted', 'info');
  App.mapInitialized && refreshMapPins();
  showScreen('list');
}

// ===== EDIT SIGN =====
function openEditSign() {
  const s = DB.find('signs', App.detailSignId);
  if (!s) return;
  App.editSignId   = s.id;
  App.gpsCoords    = s.latitude ? { lat: s.latitude, lng: s.longitude } : null;
  App.photoDataUrl = s.photo_url || null;

  document.getElementById('edit-address').value  = s.address || '';
  document.getElementById('edit-date').value     = s.date_installed || '';
  document.getElementById('edit-notes').value    = s.notes || '';
  document.getElementById('edit-installer').value = s.installer_name || '';

  const sel = document.getElementById('edit-sign-type');
  sel.innerHTML = '';
  SIGN_TYPES.forEach(t => {
    const opt = document.createElement('option');
    opt.value = t.value; opt.textContent = t.label;
    if (t.value === s.sign_type) opt.selected = true;
    sel.appendChild(opt);
  });

  if (App.gpsCoords) {
    const statusEl = document.getElementById('edit-gps-status');
    statusEl.innerHTML = `<i class="fas fa-check-circle"></i> ${App.gpsCoords.lat.toFixed(5)}, ${App.gpsCoords.lng.toFixed(5)}`;
    statusEl.className = 'gps-status got';
  }

  const previewImg = document.getElementById('edit-photo-img');
  if (App.photoDataUrl && previewImg) {
    previewImg.src = App.photoDataUrl;
    document.getElementById('edit-photo-preview').style.display = '';
    document.getElementById('edit-photo-zone').style.display    = 'none';
    document.getElementById('edit-change-photo-btn').style.display = '';
  } else {
    document.getElementById('edit-photo-preview').style.display = 'none';
    document.getElementById('edit-photo-zone').style.display    = '';
    document.getElementById('edit-change-photo-btn').style.display = 'none';
  }
  showScreen('edit');
}

function captureEditGPS() {
  const btn = document.getElementById('edit-gps-btn');
  const statusEl = document.getElementById('edit-gps-status');
  btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
  statusEl.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Getting location...';
  if (!navigator.geolocation) { showToast('GPS not available', 'error'); btn.disabled = false; return; }
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      App.gpsCoords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      statusEl.innerHTML = `<i class="fas fa-check-circle"></i> ${App.gpsCoords.lat.toFixed(5)}, ${App.gpsCoords.lng.toFixed(5)}`;
      statusEl.className = 'gps-status got';
      btn.disabled = false; btn.innerHTML = '<i class="fas fa-redo"></i> Retry';
    },
    () => { showToast('GPS failed', 'error'); btn.disabled = false; btn.innerHTML = '<i class="fas fa-crosshairs"></i> Retry GPS'; },
    { enableHighAccuracy: true, timeout: 12000 }
  );
}

function handleEditPhotoSelect(input) {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    App.photoDataUrl = e.target.result;
    const previewImg = document.getElementById('edit-photo-img');
    if (previewImg) previewImg.src = App.photoDataUrl;
    document.getElementById('edit-photo-preview').style.display = '';
    document.getElementById('edit-photo-zone').style.display    = 'none';
    document.getElementById('edit-change-photo-btn').style.display = '';
  };
  reader.readAsDataURL(file);
}

function handleEditSign(e) {
  e.preventDefault();
  const address   = document.getElementById('edit-address').value.trim();
  const sign_type = document.getElementById('edit-sign-type').value;
  const date_inst = document.getElementById('edit-date').value;
  const notes     = document.getElementById('edit-notes').value.trim();
  const installer = document.getElementById('edit-installer').value.trim();
  if (!address) { showToast('Address is required', 'error'); return; }

  showLoading('Updating sign...');
  setTimeout(() => {
    DB.update('signs', App.editSignId, {
      address, sign_type, date_installed: date_inst, notes, installer_name: installer,
      latitude:  App.gpsCoords ? App.gpsCoords.lat : null,
      longitude: App.gpsCoords ? App.gpsCoords.lng : null,
      photo_url: App.photoDataUrl || DB.find('signs', App.editSignId).photo_url,
    });
    hideLoading();
    showToast('Sign updated!', 'success');
    App.mapInitialized && refreshMapPins();
    App.detailSignId = App.editSignId;
    openDetail(App.editSignId);
  }, 400);
}

// ===== ADMIN =====
function loadAdmin() {
  if (!App.currentUser || App.currentUser.role !== 'admin') { showToast('Admin access required', 'error'); showScreen('dashboard'); return; }
  const signs = DB.get('signs');
  // Stats
  document.getElementById('admin-total').textContent   = signs.length;
  document.getElementById('admin-active').textContent  = signs.filter(s => s.status === 'active').length;
  document.getElementById('admin-removed').textContent = signs.filter(s => s.status === 'removed').length;
  renderAdminTable(signs);
}

function renderAdminTable(signs) {
  const tbody = document.getElementById('admin-tbody');
  tbody.innerHTML = '';
  if (!signs.length) { tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--text-light);font-style:italic;padding:20px">No records</td></tr>'; return; }
  [...signs].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).forEach(s => {
    const t = SIGN_TYPES.find(x => x.value === s.sign_type) || SIGN_TYPES[0];
    tbody.innerHTML += `
      <tr>
        <td style="font-size:0.78rem">${s.id}</td>
        <td style="max-width:150px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${s.address || '—'}</td>
        <td><span class="sign-type-tag">${t.label}</span></td>
        <td><span class="status-badge ${s.status}">${s.status}</span></td>
        <td style="font-size:0.78rem">${fmtDate(s.date_installed)}</td>
        <td>
          <button class="btn btn-secondary btn-sm" onclick="openDetail(${s.id})"><i class="fas fa-eye"></i></button>
          <button class="btn btn-danger btn-sm" onclick="adminDelete(${s.id})" style="margin-left:4px"><i class="fas fa-trash"></i></button>
        </td>
      </tr>`;
  });
}

function applyAdminFilter() {
  const statusFilter = document.getElementById('admin-status-filter').value;
  const typeFilter   = document.getElementById('admin-type-filter').value;
  let signs = DB.get('signs');
  if (statusFilter) signs = signs.filter(s => s.status === statusFilter);
  if (typeFilter)   signs = signs.filter(s => s.sign_type === typeFilter);
  renderAdminTable(signs);
}

async function adminDelete(id) {
  const ok = await showConfirm('Delete Sign', 'Permanently delete this record?');
  if (!ok) return;
  DB.delete('signs', id);
  showToast('Sign deleted', 'info');
  loadAdmin();
  App.mapInitialized && refreshMapPins();
}

function exportCSV() {
  const signs = DB.get('signs');
  const headers = ['ID','Address','Sign Type','Status','Lat','Lng','Date Installed','Date Removed','Notes','Installer','Created By','Created At'];
  const rows = signs.map(s => [
    s.id, `"${(s.address||'').replace(/"/g,'""')}"`,
    SIGN_TYPES.find(t => t.value === s.sign_type)?.label || s.sign_type,
    s.status, s.latitude||'', s.longitude||'',
    s.date_installed||'', s.date_removed||'',
    `"${(s.notes||'').replace(/"/g,'""')}"`,
    s.installer_name||'', s.created_by||'',
    s.created_at||''
  ].join(','));
  const csv  = [headers.join(','), ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = `reillys-guns-signs-${new Date().toISOString().split('T')[0]}.csv`;
  a.click(); URL.revokeObjectURL(url);
  showToast('CSV exported!', 'success');
}

// ===== HELPERS =====
function fmtDate(d) {
  if (!d) return '—';
  const dt = new Date(d + 'T00:00:00');
  return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
function fmtDateTime(d) {
  if (!d) return '—';
  return new Date(d).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

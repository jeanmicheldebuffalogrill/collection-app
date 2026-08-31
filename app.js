// --- Sécurité Anti-XSS ---
function escapeHTML(str) {
  if (typeof str !== 'string') return str;
  return str.replace(/[&<>'"]/g, tag => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  }[tag]));
}

const SUPABASE_URL = 'https://bclqthakhybmhdkyyhju.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_GxHaTOPwaJvrkc-qjYfV6w_MsZZyV6X';
let supabaseClient = null;

try {
  if (window.supabase) supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
} catch (e) { console.warn("Supabase non chargé :", e); }

// --- Variables Globales ---
let wishlist = JSON.parse(localStorage.getItem('app_wishlist_cloud_v1')) || [];
let collection = JSON.parse(localStorage.getItem('app_collection_cloud_v1')) || [];
let currentDetailCollectionIndex = null;
let lastGachaponCategory = 'all';
let tempFormPhotos = [];

// --- Gachapon Audio Variables ---
let audioCtx = null;
let tcgRipOsc = null;
let tcgRipGain = null;
let isTopRipActive = false;
let activeCategory = null;
let startTopX = 0;
let currentTopDragX = 0;

// --- Authentification ---
async function checkAuth() {
  if (!supabaseClient) return;
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (session) {
    document.getElementById('auth-screen').style.display = 'none';
    document.getElementById('main-app').style.display = 'block';
    initApp();
  } else {
    document.getElementById('auth-screen').style.display = 'flex';
    document.getElementById('main-app').style.display = 'none';
  }
}

document.getElementById('loginForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!supabaseClient) return;
  const email = document.getElementById('authEmail').value;
  const password = document.getElementById('authPassword').value;
  const errorEl = document.getElementById('authError');
  const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
  if (error) {
    errorEl.textContent = "Email ou mot de passe incorrect.";
    errorEl.style.display = 'block';
  } else {
    errorEl.style.display = 'none';
    checkAuth();
  }
});

document.getElementById('btnLogout')?.addEventListener('click', async () => {
  if (!supabaseClient) return;
  await supabaseClient.auth.signOut();
  document.getElementById('auth-screen').style.display = 'flex';
  document.getElementById('main-app').style.display = 'none';
  document.getElementById('authPassword').value = '';
});

// --- Initialisation & Sync ---
function initApp() {
  wishlist = wishlist.map(item => item.id ? item : { ...item, id: crypto.randomUUID ? crypto.randomUUID() : `w_${Date.now()}` });
  collection = collection.map(item => item.id ? item : { ...item, id: crypto.randomUUID ? crypto.randomUUID() : `c_${Date.now()}` });
  
  updateMonthFilterDropdowns();
  renderWishlist();
  renderCollection();
  if (supabaseClient) fetchCloudDataBackground();
}

async function fetchCloudDataBackground() {
  try {
    setSyncStatus('⏳ Sync Cloud...', 'var(--clay-yellow)');
    const [wRes, cRes] = await Promise.all([
      supabaseClient.from('wishlist_items').select('data, id'),
      supabaseClient.from('collection_items').select('data, id')
    ]);
    if (wRes.data && wRes.data.length > 0) wishlist = wRes.data.map(row => ({ ...row.data, id: row.id }));
    if (cRes.data && cRes.data.length > 0) collection = cRes.data.map(row => ({ ...row.data, id: row.id }));

    localStorage.setItem('app_wishlist_cloud_v1', JSON.stringify(wishlist));
    localStorage.setItem('app_collection_cloud_v1', JSON.stringify(collection));
    setSyncStatus('🟢 Cloud Synchronisé', 'var(--clay-green)');
    updateMonthFilterDropdowns();
    renderWishlist();
    renderCollection();
  } catch (e) {
    setSyncStatus('🟢 Mode Local Actif', 'var(--clay-blue)');
  }
}

function saveData() {
  localStorage.setItem('app_wishlist_cloud_v1', JSON.stringify(wishlist));
  localStorage.setItem('app_collection_cloud_v1', JSON.stringify(collection));
  updateMonthFilterDropdowns();
  renderWishlist();
  renderCollection();
  if (supabaseClient) pushCloudDataBackground();
}

async function pushCloudDataBackground() {
  try {
    setSyncStatus('⏳ Enregistrement...', 'var(--clay-yellow)');
    for (const item of wishlist) await supabaseClient.from('wishlist_items').upsert({ id: item.id, data: item });
    for (const item of collection) await supabaseClient.from('collection_items').upsert({ id: item.id, data: item });
    setSyncStatus('🟢 Cloud Synchronisé', 'var(--clay-green)');
  } catch (e) {
    setSyncStatus('⚠️ Sauvegardé localement', 'var(--clay-pink)');
  }
}

function setSyncStatus(text, color = 'var(--clay-green)') {
  const el = document.getElementById('syncStatus');
  if (el) { el.textContent = text; el.style.color = color; }
}

function formatMoney(amount) { return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(amount || 0); }

// --- Rendu Optmisé Wishlist ---
function renderWishlist() {
  const monthFilter = document.getElementById('w-monthFilter')?.value || 'all';
  const platF = document.getElementById('w-filterPlatform')?.value || 'all';
  const storeF = document.getElementById('w-filterStore')?.value || 'all';
  const statF = document.getElementById('w-filterStatus')?.value || 'all';
  const sortBy = document.getElementById('w-sortBy')?.value || 'newest';
  const searchQuery = (document.getElementById('w-searchBar')?.value || '').toLowerCase().trim();

  let totalConfirmed = 0, totalPending = 0;
  let filtered = wishlist.filter(i => {
    const matchMonth = checkDateMatch(i.releaseDate, monthFilter);
    const matchPlat = (platF === 'all' || i.platform === platF);
    const matchStore = (storeF === 'all' || i.store === storeF);
    const matchStat = (statF === 'all' || i.status === statF);
    const matchSearch = !searchQuery || (i.title && i.title.toLowerCase().includes(searchQuery)) || (i.artist && i.artist.toLowerCase().includes(searchQuery));
    
    if (matchMonth) {
      const p = parseFloat(i.price) || 0;
      if (i.status === 'À prendre') totalConfirmed += p;
      if (i.status === 'En réflexion') totalPending += p;
    }
    return matchMonth && matchPlat && matchStore && matchStat && matchSearch;
  });

  if(document.getElementById('labelConfirmed')) document.getElementById('labelConfirmed').textContent = monthFilter !== 'all' ? 'Prévu (sélection)' : 'Total prévu';
  if(document.getElementById('labelPotential')) document.getElementById('labelPotential').textContent = monthFilter !== 'all' ? 'Potentiel (sélection)' : 'Total potentiel';
  if(document.getElementById('totalConfirmed')) document.getElementById('totalConfirmed').textContent = formatMoney(totalConfirmed);
  if(document.getElementById('totalPotential')) document.getElementById('totalPotential').textContent = formatMoney(totalConfirmed + totalPending);

  const container = document.getElementById('wishlistContainer');
  if(!container) return;
  container.innerHTML = '';

  filtered = sortItems(filtered, sortBy);
  const fragment = document.createDocumentFragment();

  filtered.forEach(item => {
    const index = wishlist.indexOf(item);
    const card = document.createElement('div');
    
    const title = escapeHTML(item.title);
    const artist = escapeHTML(item.artist);
    const priceStr = item.price ? formatMoney(item.price) : 'Prix non fixé';
    
    let statusClass = item.status === 'En réflexion' ? 'status-think' : item.status === 'Je passe' ? 'status-pass' : 'status-take';
    let badgeStatusClass = item.status === 'En réflexion' ? 'think' : item.status === 'Je passe' ? 'pass' : 'take';
    let statusText = item.status === 'En réflexion' ? '⏳ En réflexion' : item.status === 'Je passe' ? '❌ Je passe' : '✅ Je prends';
    
    card.className = `item-card ${statusClass} ${item.editionType === 'Collector' ? 'is-collector' : ''}`;
    
    const dateStr = item.releaseDate ? `📅 ${new Date(item.releaseDate).toLocaleDateString('fr-FR')}` : '📅 Sans date';
    const storeBadge = (item.store && item.store !== 'Non renseigné') ? `<span class="badge-store">🛒 ${escapeHTML(item.store)}</span>` : '';
    const collectorBadge = item.editionType === 'Collector' ? `<span class="badge-collector">✨ COLLECTOR</span>` : '';
    const blurayBadge = item.blurayType ? `<span class="badge-state">📀 ${escapeHTML(item.blurayType)}</span>` : '';
    const coverHtml = item.image ? `<img src="${escapeHTML(item.image)}" class="item-cover" alt="Jaquette" onclick="event.stopPropagation(); window.openLightbox(this.src);" onerror="this.outerHTML='<div class=\\'item-cover-placeholder\\'>📦</div>'">` : `<div class="item-cover-placeholder">📦</div>`;

    let subtitle = '';
    if (item.platform === 'Vinyle' && artist) subtitle = `<div style="font-size:0.75rem; color:var(--text-muted); font-weight:700;">${artist}</div>`;

    const q = encodeURIComponent(`${item.title} ${item.platform}`);

    card.innerHTML = `
      ${coverHtml}
      <div class="item-content" style="cursor:pointer;" onclick="window.openEditModal(${index})">
        <div class="card-header">
          <div class="item-info">
            <h3>${title}</h3>
            ${subtitle}
            <div class="item-meta">
              <span class="badge">${escapeHTML(item.platform)}</span>
              ${collectorBadge} ${blurayBadge}
              <span class="badge-status ${badgeStatusClass}">${statusText}</span>
              ${storeBadge} <span>${priceStr}</span> <span>•</span> <span>${dateStr}</span>
            </div>
          </div>
          <div class="actions" onclick="event.stopPropagation();">
            <button class="btn-action btn-edit" onclick="window.openEditModal(${index})">✏️</button>
            <button class="btn-action btn-transfer" onclick="window.moveToCollection(${index})">📥</button>
            <button class="btn-action btn-delete" onclick="window.deleteWishlistItem(${index})">✕</button>
          </div>
        </div>
        <div class="market-links" onclick="event.stopPropagation();">
          <a class="btn-market collector" href="https://www.google.com/search?q=${encodeURIComponent('site:editioncollector.fr ' + title)}" target="_blank">🏆 Collector</a>
          <a class="btn-market" href="https://www.e.leclerc/recherche?q=${q}" target="_blank">Leclerc</a>
          <a class="btn-market" href="https://www.fnac.com/SearchResult/ResultList.aspx?Search=${q}" target="_blank">Fnac</a>
          <a class="btn-market" href="https://www.amazon.fr/s?k=${q}" target="_blank">Amazon</a>
          <a class="btn-market" href="https://www.ebay.fr/sch/i.html?_nkw=${q}&LH_Complete=1&LH_Sold=1" target="_blank">🔍 eBay</a>
        </div>
      </div>
    `;
    fragment.appendChild(card);
  });
  container.appendChild(fragment);
}

// --- Rendu Optmisé Collection ---
function renderCollection() {
  if(document.getElementById('collectionCount')) document.getElementById('collectionCount').textContent = collection.length;

  const monthFilter = document.getElementById('c-monthFilter')?.value || 'all';
  const releaseFilter = document.getElementById('c-releaseFilter')?.value || 'all';
  const currentPlatformFilter = document.getElementById('c-filterPlatform')?.value || 'all';
  const storeF = document.getElementById('c-filterStore')?.value || 'all';
  const editionF = document.getElementById('c-filterEdition')?.value || 'all';
  const stateF = document.getElementById('c-filterState')?.value || 'all';
  const playF = document.getElementById('c-filterGameplay')?.value || 'all';
  const viewMode = document.getElementById('c-viewMode')?.value || 'list';
  const sortBy = document.getElementById('c-sortBy')?.value || 'newest';
  const searchQuery = (document.getElementById('c-searchBar')?.value || '').toLowerCase().trim();

  if(document.getElementById('collectionFiltersBar')) document.getElementById('collectionFiltersBar').style.display = viewMode.startsWith('timeline') ? 'none' : 'flex';

  let filtered = collection.filter(i => {
    const matchBuy = checkDateMatch(i.buyDate, monthFilter);
    const matchRelease = checkDateMatch(i.releaseDate, releaseFilter);
    const matchPlat = (currentPlatformFilter === 'all' || i.platform === currentPlatformFilter);
    const matchStore = (storeF === 'all' || i.store === storeF);
    const matchEdition = (editionF === 'all' || (i.editionType || 'Standard') === editionF);
    const matchState = (stateF === 'all' || i.state === stateF);
    const matchPlay = (playF === 'all' || i.gameplay === playF);
    const matchSearch = !searchQuery || (i.title && i.title.toLowerCase().includes(searchQuery)) || (i.artist && i.artist.toLowerCase().includes(searchQuery));
    return viewMode.startsWith('timeline') ? (matchBuy && matchRelease && matchSearch) : (matchBuy && matchRelease && matchPlat && matchStore && matchEdition && matchState && matchPlay && matchSearch);
  });

  filtered = sortItems(filtered, sortBy);

  let totalVal = 0;
  filtered.forEach(i => { totalVal += parseFloat(i.price) || 0; });
  if(document.getElementById('collectionTotalValue')) document.getElementById('collectionTotalValue').textContent = formatMoney(totalVal);
  if(document.getElementById('collectionItemTotal')) document.getElementById('collectionItemTotal').textContent = filtered.length;

  const container = document.getElementById('collectionContainer');
  if(!container) return;
  container.innerHTML = '';
  
  const fragment = document.createDocumentFragment();

  if (viewMode === 'list') {
    filtered.forEach(item => {
      const index = collection.indexOf(item);
      const card = document.createElement('div');
      
      const title = escapeHTML(item.title);
      const artist = escapeHTML(item.artist);
      const isCollector = item.editionType === 'Collector';
      card.className = `item-card ${isCollector ? 'is-collector' : ''}`;
      
      const valStr = item.price ? formatMoney(item.price) : 'Non estimé';
      const storeBadge = (item.store && item.store !== 'Non renseigné') ? `<span class="badge-store">🛒 ${escapeHTML(item.store)}</span>` : '';
      const stateBadge = item.state ? `<span class="badge-state">${escapeHTML(item.state)}</span>` : '';
      const playBadge = (item.gameplay && item.gameplay !== 'Non applicable') ? `<span class="badge-play">🎮 ${escapeHTML(item.gameplay)}</span>` : '';
      const collectorBadge = isCollector ? `<span class="badge-collector">✨ COLLECTOR</span>` : '';
      const coverHtml = item.image ? `<img src="${escapeHTML(item.image)}" class="item-cover" alt="Jaquette" onclick="event.stopPropagation(); window.openLightbox(this.src);" onerror="this.outerHTML='<div class=\\'item-cover-placeholder\\'>📦</div>'">` : `<div class="item-cover-placeholder">📦</div>`;

      let subtitle = '';
      if (item.platform === 'Vinyle' && artist) subtitle = `<div style="font-size:0.75rem; color:var(--text-muted); font-weight:700;">${artist}</div>`;

      let datesDisplay = [];
      if (item.releaseDate) datesDisplay.push(`📅 Sortie : ${new Date(item.releaseDate).toLocaleDateString('fr-FR')}`);
      if (item.buyDate) datesDisplay.push(`🛒 Acheté : ${new Date(item.buyDate).toLocaleDateString('fr-FR')}`);

      const q = encodeURIComponent(`${item.title} ${item.platform}`);

      card.innerHTML = `
        ${coverHtml}
        <div class="item-content" onclick="window.openCollectionDetail(${index})" style="cursor:pointer;">
          <div class="card-header">
            <div class="item-info">
              <h3>${title}</h3>
              ${subtitle}
              <div class="item-meta">
                <span class="badge">${escapeHTML(item.platform)}</span>
                ${collectorBadge} ${stateBadge} ${playBadge} ${storeBadge}
                <span style="font-weight:900; color:var(--clay-yellow);">${valStr}</span>
              </div>
              <div class="item-meta" style="margin-top:2px;"><span>${datesDisplay.join(' • ')}</span></div>
              ${item.note ? `<div class="item-note">📝 ${escapeHTML(item.note)}</div>` : ''}
            </div>
            <div class="actions" onclick="event.stopPropagation();">
              <button class="btn-action btn-edit" onclick="window.openEditCollectionModal(${index})">✏️</button>
              <button class="btn-action btn-delete" onclick="window.deleteCollectionItem(${index})">✕</button>
            </div>
          </div>
          <div class="market-links" onclick="event.stopPropagation();">
            <a class="btn-market pricecharting" href="https://www.pricecharting.com/search-products?type=prices&q=${q}" target="_blank">📈 PriceCharting</a>
            <a class="btn-market" href="https://www.ebay.fr/sch/i.html?_nkw=${q}&LH_Complete=1&LH_Sold=1" target="_blank">🔍 eBay</a>
            <a class="btn-market" href="https://www.leboncoin.fr/recherche?text=${q}" target="_blank">🟠 LBC</a>
            <a class="btn-market" href="https://www.vinted.fr/catalog?search_text=${q}" target="_blank">🟢 Vinted</a>
          </div>
        </div>
      `;
      fragment.appendChild(card);
    });
    container.appendChild(fragment);
  } else {
    // Grille ou Timeline
    const viewWrap = document.createElement('div');
    viewWrap.className = viewMode === 'grid' ? 'grid-collection-container' : 'timeline-h-container';
    if (viewMode !== 'grid') {
      const dateKey = viewMode === 'timeline-release' ? 'releaseDate' : 'buyDate';
      filtered.sort((a, b) => (a[dateKey] || '9999-12-31').localeCompare(b[dateKey] || '9999-12-31'));
    }

    filtered.forEach(item => {
      const index = collection.indexOf(item);
      const card = document.createElement('div');
      card.className = viewMode === 'grid' ? `grid-item-card ${item.editionType === 'Collector' ? 'is-collector' : ''}` : `tile-card ${item.editionType === 'Collector' ? 'is-collector' : ''}`;
      card.onclick = () => window.openCollectionDetail(index);
      const title = escapeHTML(item.title);
      const coverHtml = item.image ? `<img src="${escapeHTML(item.image)}" class="${viewMode==='grid'?'grid-item-cover':'tile-cover'}" onerror="this.outerHTML='<div class=\\'grid-item-cover-placeholder\\'>📦</div>'">` : `<div class="grid-item-cover-placeholder">📦</div>`;
      const priceStr = item.price ? formatMoney(item.price) : '—';
      
      if (viewMode === 'grid') {
        card.innerHTML = `${coverHtml}<div style="display:flex; flex-direction:column; gap:2px;"><div class="grid-item-title">${title}</div><div style="display:flex; justify-content:space-between;"><span class="badge" style="font-size:0.62rem;">${escapeHTML(item.platform)}</span><span style="font-size:0.82rem; font-weight:900; color:var(--clay-yellow);">${priceStr}</span></div></div>`;
      } else {
        const itemDate = item[viewMode === 'timeline-release' ? 'releaseDate' : 'buyDate'] ? new Date(item[viewMode === 'timeline-release' ? 'releaseDate' : 'buyDate']).getFullYear() : 'N/A';
        card.innerHTML = `${coverHtml}<div class="tile-info"><div class="tile-title">${title}</div><div class="tile-meta"><span class="badge" style="font-size:0.65rem;">${escapeHTML(item.platform)}</span><span style="font-size:0.72rem; color:var(--clay-blue);">📅 ${itemDate}</span></div><div style="font-size:0.85rem; font-weight:900; color:var(--clay-yellow);">${priceStr}</div></div>`;
      }
      viewWrap.appendChild(card);
    });
    container.appendChild(viewWrap);
  }
}


// --- Fonctions CRUD et UI ---
window.deleteWishlistItem = function(index) {
  if (confirm("Supprimer l'article ?")) {
    wishlist.splice(index, 1);
    saveData();
  }
}

window.deleteCollectionItem = function(index) {
  if (confirm("Supprimer l'objet ?")) {
    collection.splice(index, 1);
    saveData();
  }
}

window.moveToCollection = function(index) {
  const item = wishlist[index];
  if (!item) return;
  collection.unshift({
    ...item,
    id: crypto.randomUUID ? crypto.randomUUID() : `c_${Date.now()}`,
    state: '✨ Neuf sous blister',
    buyDate: item.releaseDate || new Date().toISOString().slice(0, 10),
    gameplay: 'Non commencé',
    photos: []
  });
  wishlist.splice(index, 1);
  saveData();
  switchTab('Collection');
}

window.openLightbox = function(src) {
  document.getElementById('lightbox-img').src = src;
  document.getElementById('lightbox-modal').style.display = 'flex';
}

// --- Modales et Formulaires ---

// Fonction utilitaire : Champs dynamiques selon plateforme
function getDynamicFieldsHtml(prefix, platform, data = {}) {
  if (platform === 'Vinyle') {
    return `<div class="form-row"><input type="text" id="${prefix}artist" placeholder="Artiste / Groupe" value="${data.artist || ''}"><input type="text" id="${prefix}edition" placeholder="Édition" value="${data.edition || ''}"></div>`;
  } else if (platform === 'Blu-ray') {
    return `<div class="form-row"><select id="${prefix}blurayType" style="width:100%;"><option value="Version normale" ${data.blurayType === 'Version normale' ? 'selected' : ''}>🎬 Version normale</option><option value="Steelbook" ${data.blurayType === 'Steelbook' ? 'selected' : ''}>📀 Steelbook</option></select></div>`;
  } else {
    if (prefix === 'w-' || prefix === 'edit-') return ``;
    return `<div class="form-row"><select id="${prefix}gameplay"><option value="Non commencé" ${data.gameplay === 'Non commencé' ? 'selected' : ''}>⏳ Non commencé</option><option value="En cours" ${data.gameplay === 'En cours' ? 'selected' : ''}>🎮 En cours</option><option value="Terminé" ${data.gameplay === 'Terminé' ? 'selected' : ''}>🏆 Terminé</option><option value="Non applicable" ${data.gameplay === 'Non applicable' ? 'selected' : ''}>⚪ Non applicable</option></select></div>`;
  }
}

function toggleFormFields(prefix, platform) {
  const container = document.getElementById(prefix + 'dynamic-fields');
  if (container) container.innerHTML = getDynamicFieldsHtml(prefix, platform);
}

// Ouverture Modales Ajout
document.getElementById('btnOpenAddWishlist')?.addEventListener('click', () => {
  document.getElementById('wishlistForm').reset();
  toggleFormFields('w-', document.getElementById('w-platform').value);
  document.getElementById('add-wishlist-modal').style.display = 'flex';
});

document.getElementById('btnOpenAddCollection')?.addEventListener('click', () => {
  document.getElementById('collectionForm').reset();
  tempFormPhotos = [];
  toggleFormFields('c-', document.getElementById('c-platform').value);
  document.getElementById('add-collection-modal').style.display = 'flex';
});

// Fermeture Modales Ajout
document.getElementById('btnCloseAddWishlist')?.addEventListener('click', () => document.getElementById('add-wishlist-modal').style.display = 'none');
document.getElementById('btnCloseAddCollection')?.addEventListener('click', () => document.getElementById('add-collection-modal').style.display = 'none');

// Formulaires Soumissions
document.getElementById('wishlistForm')?.addEventListener('submit', (e) => {
  e.preventDefault();
  const platform = document.getElementById('w-platform').value;
  let extraData = { platform };
  if (platform === 'Vinyle') {
    extraData.artist = document.getElementById('w-artist')?.value.trim() || '';
  } else if (platform === 'Blu-ray') {
    extraData.blurayType = document.getElementById('w-blurayType')?.value || 'Version normale';
  }
  wishlist.unshift({
    id: crypto.randomUUID ? crypto.randomUUID() : `w_${Date.now()}`,
    title: document.getElementById('w-title').value.trim(),
    price: document.getElementById('w-price').value,
    editionType: document.getElementById('w-editionType').value,
    store: document.getElementById('w-store').value,
    releaseDate: document.getElementById('w-releaseDate').value,
    image: document.getElementById('w-image').value.trim(),
    status: document.getElementById('w-status').value,
    ...extraData
  });
  document.getElementById('add-wishlist-modal').style.display = 'none';
  saveData();
});

document.getElementById('collectionForm')?.addEventListener('submit', (e) => {
  e.preventDefault();
  const platform = document.getElementById('c-platform').value;
  let extraData = { platform };
  if (platform === 'Vinyle') {
    extraData.artist = document.getElementById('c-artist')?.value.trim() || '';
  } else if (platform === 'Blu-ray') {
    extraData.blurayType = document.getElementById('c-blurayType')?.value || 'Version normale';
  } else {
    extraData.gameplay = document.getElementById('c-gameplay')?.value || 'Non commencé';
  }
  collection.unshift({
    id: crypto.randomUUID ? crypto.randomUUID() : `c_${Date.now()}`,
    title: document.getElementById('c-title').value.trim(),
    price: document.getElementById('c-price').value,
    editionType: document.getElementById('c-editionType').value,
    store: document.getElementById('c-store').value,
    state: document.getElementById('c-state').value,
    releaseDate: document.getElementById('c-releaseDate').value,
    buyDate: document.getElementById('c-buyDate').value,
    image: document.getElementById('c-image').value.trim(),
    note: document.getElementById('c-note').value.trim(),
    photos: [...tempFormPhotos],
    ...extraData
  });
  document.getElementById('add-collection-modal').style.display = 'none';
  saveData();
});

// --- Modification (Edit) ---
window.openEditModal = function(index) {
  const item = wishlist[index];
  document.getElementById('edit-index').value = index;
  document.getElementById('edit-title').value = item.title;
  document.getElementById('edit-platform').value = item.platform;
  document.getElementById('edit-price').value = item.price || '';
  document.getElementById('edit-editionType').value = item.editionType || 'Standard';
  toggleFormFields('edit-', item.platform, item);
  document.getElementById('edit-store').value = item.store || 'Non renseigné';
  document.getElementById('edit-releaseDate').value = item.releaseDate || '';
  document.getElementById('edit-image').value = item.image || '';
  document.getElementById('edit-status').value = item.status || 'À prendre';
  document.getElementById('edit-modal').style.display = 'flex';
}

window.openEditCollectionModal = function(index) {
  const item = collection[index];
  document.getElementById('edit-c-index').value = index;
  document.getElementById('edit-c-title').value = item.title;
  document.getElementById('edit-c-platform').value = item.platform;
  document.getElementById('edit-c-price').value = item.price || '';
  document.getElementById('edit-c-editionType').value = item.editionType || 'Standard';
  toggleFormFields('edit-c-', item.platform, item);
  document.getElementById('edit-c-store').value = item.store || 'Non renseigné';
  document.getElementById('edit-c-state').value = item.state || '✨ Neuf sous blister';
  document.getElementById('edit-c-releaseDate').value = item.releaseDate || '';
  document.getElementById('edit-c-buyDate').value = item.buyDate || '';
  document.getElementById('edit-c-image').value = item.image || '';
  document.getElementById('edit-c-note').value = item.note || '';
  document.getElementById('edit-collection-modal').style.display = 'flex';
}

// Fermeture des modales de modification
document.getElementById('btnCloseEditWishlist')?.addEventListener('click', () => document.getElementById('edit-modal').style.display = 'none');
document.getElementById('btnCloseEditCollection')?.addEventListener('click', () => document.getElementById('edit-collection-modal').style.display = 'none');
document.getElementById('btnCloseLightbox')?.addEventListener('click', () => document.getElementById('lightbox-modal').style.display = 'none');

// Sauvegarde des modifications
document.getElementById('btnSaveEditWishlist')?.addEventListener('click', () => {
  const index = parseInt(document.getElementById('edit-index').value, 10);
  if (isNaN(index) || !wishlist[index]) return;
  const platform = document.getElementById('edit-platform').value;
  let extraData = { platform };
  if (platform === 'Vinyle') extraData.artist = document.getElementById('edit-artist')?.value.trim();
  else if (platform === 'Blu-ray') extraData.blurayType = document.getElementById('edit-blurayType')?.value;
  
  wishlist[index] = {
    ...wishlist[index],
    title: document.getElementById('edit-title').value.trim(),
    price: document.getElementById('edit-price').value,
    editionType: document.getElementById('edit-editionType').value,
    store: document.getElementById('edit-store').value,
    releaseDate: document.getElementById('edit-releaseDate').value,
    image: document.getElementById('edit-image').value.trim(),
    status: document.getElementById('edit-status').value,
    ...extraData
  };
  document.getElementById('edit-modal').style.display = 'none';
  saveData();
});

document.getElementById('btnSaveEditCollection')?.addEventListener('click', () => {
  const index = parseInt(document.getElementById('edit-c-index').value, 10);
  if (isNaN(index) || !collection[index]) return;
  const platform = document.getElementById('edit-c-platform').value;
  let extraData = { platform };
  if (platform === 'Vinyle') extraData.artist = document.getElementById('edit-c-artist')?.value.trim();
  else if (platform === 'Blu-ray') extraData.blurayType = document.getElementById('edit-c-blurayType')?.value;
  else extraData.gameplay = document.getElementById('edit-c-gameplay')?.value;
  
  collection[index] = {
    ...collection[index],
    title: document.getElementById('edit-c-title').value.trim(),
    price: document.getElementById('edit-c-price').value,
    editionType: document.getElementById('edit-c-editionType').value,
    store: document.getElementById('edit-c-store').value,
    state: document.getElementById('edit-c-state').value,
    releaseDate: document.getElementById('edit-c-releaseDate').value,
    buyDate: document.getElementById('edit-c-buyDate').value,
    image: document.getElementById('edit-c-image').value.trim(),
    note: document.getElementById('edit-c-note').value.trim(),
    ...extraData
  };
  document.getElementById('edit-collection-modal').style.display = 'none';
  saveData();
});

// Écouteurs de changement de plateforme pour régénérer les champs dynamiques
document.getElementById('w-platform')?.addEventListener('change', function() { toggleFormFields('w-', this.value); });
document.getElementById('c-platform')?.addEventListener('change', function() { toggleFormFields('c-', this.value); });
document.getElementById('edit-platform')?.addEventListener('change', function() { toggleFormFields('edit-', this.value); });
document.getElementById('edit-c-platform')?.addEventListener('change', function() { toggleFormFields('edit-c-', this.value); });


// --- Onglets ---
function switchTab(tabId) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
  document.getElementById('tabBtn' + tabId).classList.add('active');
  document.getElementById('tab-' + tabId.toLowerCase()).classList.add('active');
  if(tabId === 'Wishlist') renderWishlist();
  if(tabId === 'Collection') renderCollection();
}
document.getElementById('tabBtnWishlist')?.addEventListener('click', () => switchTab('Wishlist'));
document.getElementById('tabBtnCollection')?.addEventListener('click', () => switchTab('Collection'));
document.getElementById('tabBtnRandom')?.addEventListener('click', () => switchTab('Random'));

// --- Filtres Helper ---
function checkDateMatch(itemDateStr, filterValue) {
  if (filterValue === 'all') return true;
  if (filterValue === 'nodate') return !itemDateStr;
  if (!itemDateStr) return false;
  if (filterValue.startsWith('year_')) return itemDateStr.startsWith(filterValue.split('_')[1]);
  return itemDateStr.startsWith(filterValue);
}

function sortItems(arr, sortBy) {
  return arr.slice().sort((a, b) => {
    if (sortBy === 'az') return (a.title || '').localeCompare(b.title || '');
    if (sortBy === 'price-desc') return (parseFloat(b.price) || 0) - (parseFloat(a.price) || 0);
    return 0;
  });
}

function populateHierarchicalDropdown(selectElement, datesList, defaultLabel) {
  if(!selectElement) return;
  const currentVal = selectElement.value;
  const yearsMap = {};
  datesList.forEach(fullDateStr => {
    if (!fullDateStr) return;
    const [year, month] = fullDateStr.split('-');
    if (!year || !month) return;
    if (!yearsMap[year]) yearsMap[year] = new Set();
    yearsMap[year].add(month);
  });
  let html = `<option value="all">${defaultLabel}</option><option value="nodate">📅 Sans date fixée</option>`;
  Object.keys(yearsMap).sort().reverse().forEach(year => {
    html += `<option value="year_${year}">📅 ANNÉE ${year}</option>`;
    Array.from(yearsMap[year]).sort().forEach(month => {
      const ym = `${year}-${month}`;
      const label = new Date(parseInt(year, 10), parseInt(month, 10) - 1, 1).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
      html += `<option value="${ym}">&nbsp;&nbsp;&nbsp;&nbsp;↳ ${label.charAt(0).toUpperCase() + label.slice(1)}</option>`;
    });
  });
  selectElement.innerHTML = html;
  selectElement.value = Array.from(selectElement.options).some(o => o.value === currentVal) ? currentVal : 'all';
}

function updateMonthFilterDropdowns() {
  populateHierarchicalDropdown(document.getElementById('c-monthFilter'), collection.map(i=>i.buyDate), "Tout l'historique d'achat");
  populateHierarchicalDropdown(document.getElementById('c-releaseFilter'), collection.map(i=>i.releaseDate), "Toutes les sorties");
  populateHierarchicalDropdown(document.getElementById('w-monthFilter'), wishlist.map(i=>i.releaseDate), "Tout le calendrier");
}

// Filtres UI 
document.getElementById('c-filterPlatform')?.addEventListener('change', renderCollection);
document.getElementById('c-filterStore')?.addEventListener('change', renderCollection);
document.getElementById('c-filterEdition')?.addEventListener('change', renderCollection);
document.getElementById('c-filterState')?.addEventListener('change', renderCollection);
document.getElementById('c-filterGameplay')?.addEventListener('change', renderCollection);
document.getElementById('c-viewMode')?.addEventListener('change', renderCollection);
document.getElementById('c-sortBy')?.addEventListener('change', renderCollection);
document.getElementById('c-monthFilter')?.addEventListener('change', renderCollection);
document.getElementById('c-releaseFilter')?.addEventListener('change', renderCollection);
document.getElementById('c-searchBar')?.addEventListener('input', renderCollection);

document.getElementById('w-filterPlatform')?.addEventListener('change', renderWishlist);
document.getElementById('w-filterStore')?.addEventListener('change', renderWishlist);
document.getElementById('w-filterStatus')?.addEventListener('change', renderWishlist);
document.getElementById('w-monthFilter')?.addEventListener('change', renderWishlist);
document.getElementById('w-sortBy')?.addEventListener('change', renderWishlist);
document.getElementById('w-searchBar')?.addEventListener('input', renderWishlist);


// --- Gachapon & Audio ---
function getAudioContext() { if (!audioCtx) { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } if (audioCtx.state === 'suspended') { audioCtx.resume(); } return audioCtx; }
function startPokemonRipSound() { try { const ctx = getAudioContext(); const bufferSize = ctx.sampleRate * 0.25; const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate); const data = buffer.getChannelData(0); for (let i = 0; i < bufferSize; i++) { data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize); } tcgRipOsc = ctx.createBufferSource(); tcgRipOsc.buffer = buffer; tcgRipOsc.loop = true; const filter = ctx.createBiquadFilter(); filter.type = 'bandpass'; filter.frequency.setValueAtTime(3600, ctx.currentTime); filter.Q.setValueAtTime(8, ctx.currentTime); tcgRipGain = ctx.createGain(); tcgRipGain.gain.setValueAtTime(0.01, ctx.currentTime); tcgRipOsc.connect(filter); filter.connect(tcgRipGain); tcgRipGain.connect(ctx.destination); tcgRipOsc.start(); } catch(e) {} }
function updatePokemonRipVolume(progress) { if (tcgRipGain && audioCtx) { const vol = Math.min(Math.max(progress * 0.5, 0.05), 0.45); tcgRipGain.gain.setValueAtTime(vol, audioCtx.currentTime); } }
function stopPokemonRipSound(success) { try { if (tcgRipOsc && tcgRipGain && audioCtx) { if (success) { const osc = audioCtx.createOscillator(); const popGain = audioCtx.createGain(); osc.type = 'triangle'; osc.frequency.setValueAtTime(440, audioCtx.currentTime); osc.frequency.exponentialRampToValueAtTime(110, audioCtx.currentTime + 0.06); popGain.gain.setValueAtTime(0.35, audioCtx.currentTime); popGain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.06); osc.connect(popGain); popGain.connect(audioCtx.destination); osc.start(); osc.stop(audioCtx.currentTime + 0.06); } tcgRipGain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.04); setTimeout(() => { tcgRipOsc.stop(); tcgRipOsc.disconnect(); }, 50); } } catch(e) {} }

function handlePointerDown(e) {
  e.stopPropagation();
  const category = e.target.getAttribute('data-cat');
  if (!category) return;
  isTopRipActive = true;
  activeCategory = category;
  startTopX = e.clientX || (e.touches && e.touches[0].clientX) || 0;
  currentTopDragX = 0;
  
  const boosterCard = document.getElementById(`booster-${category}`);
  if (boosterCard) boosterCard.classList.add('shake');
  startPokemonRipSound();

  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);
  window.addEventListener('touchmove', onPointerMove, {passive: false});
  window.addEventListener('touchend', onPointerUp);
}

function onPointerMove(moveEvent) {
  if (!isTopRipActive) return;
  const currentX = moveEvent.clientX || (moveEvent.touches && moveEvent.touches[0].clientX) || 0;
  currentTopDragX = currentX - startTopX;
  const crimpEl = document.getElementById(`crimp-${activeCategory}`);
  if (currentTopDragX > 0 && crimpEl) {
    let pull = Math.min(currentTopDragX, 150);
    crimpEl.style.transform = `translateX(${pull}px)`;
    crimpEl.style.opacity = `${1 - (pull / 200)}`;
    updatePokemonRipVolume(pull / 150);
  }
}

function onPointerUp() {
  if (!isTopRipActive) return;
  isTopRipActive = false;
  const boosterCard = document.getElementById(`booster-${activeCategory}`);
  if (boosterCard) boosterCard.classList.remove('shake');
  const success = currentTopDragX > 40;
  stopPokemonRipSound(success);
  
  window.removeEventListener('pointermove', onPointerMove);
  window.removeEventListener('pointerup', onPointerUp);
  window.removeEventListener('touchmove', onPointerMove);
  window.removeEventListener('touchend', onPointerUp);
  
  const crimpElFinal = document.getElementById(`crimp-${activeCategory}`);
  if (success) {
    const flash = document.getElementById('flash-overlay');
    if (flash) { flash.style.display = 'block'; setTimeout(() => flash.style.display = 'none', 400); }
    if (crimpElFinal) {
      crimpElFinal.style.transition = 'transform 0.35s ease, opacity 0.35s ease';
      crimpElFinal.style.transform = 'translateX(220px) rotate(15deg)';
      crimpElFinal.style.opacity = '0';
    }
    setTimeout(() => {
      if (crimpElFinal) { crimpElFinal.style.transform = ''; crimpElFinal.style.opacity = ''; crimpElFinal.style.transition = ''; }
      triggerGachaponReveal(activeCategory);
    }, 350);
  } else {
    if (crimpElFinal) {
      crimpElFinal.style.transition = 'transform 0.3s ease, opacity 0.3s ease';
      crimpElFinal.style.transform = 'translateX(0px)';
      crimpElFinal.style.opacity = '1';
      setTimeout(() => crimpElFinal.style.transition = '', 300);
    }
  }
}

document.querySelectorAll('.tcg-crimp-top').forEach(el => {
  el.addEventListener('pointerdown', handlePointerDown);
});

function triggerGachaponReveal(category) {
  lastGachaponCategory = category;
  let pool = [];
  if (category === 'game') pool = collection.filter(i => i.platform !== 'Vinyle' && i.platform !== 'Blu-ray');
  else if (category === 'vinyl') pool = collection.filter(i => i.platform === 'Vinyle');
  else if (category === 'movie') pool = collection.filter(i => i.platform === 'Blu-ray');
  else pool = collection;
  
  if (pool.length === 0) { alert("Aucun objet dans cette catégorie !"); return; }
  const winner = pool[Math.floor(Math.random() * pool.length)];
  
  document.getElementById('gachaponCoverContainer').innerHTML = winner.image ? `<img src="${escapeHTML(winner.image)}" class="gachapon-cover-large">` : `<div class="gachapon-cover-large">📦</div>`;
  document.getElementById('gachaponTitle').textContent = winner.title;
  document.getElementById('gachapon-modal').style.display = 'flex';
}

document.getElementById('btnCloseGachapon')?.addEventListener('click', () => document.getElementById('gachapon-modal').style.display = 'none');
document.getElementById('btnGachaponReroll')?.addEventListener('click', () => {
  document.getElementById('gachapon-modal').style.display = 'none';
  triggerGachaponReveal(lastGachaponCategory);
});

// Init de base au chargement de la page
window.addEventListener('DOMContentLoaded', () => {
  checkAuth();
});

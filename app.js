// Sécurité Anti-XSS : Nettoie toutes les entrées utilisateurs
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
  if (window.supabase) {
    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }
} catch (e) {
  console.warn("Supabase non chargé :", e);
}

// Variables d'état
let wishlist = JSON.parse(localStorage.getItem('app_wishlist_cloud_v1')) || [];
let collection = JSON.parse(localStorage.getItem('app_collection_cloud_v1')) || [];
let currentDetailCollectionIndex = null;
let lastGachaponCategory = 'all';
let tempFormPhotos = [];

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

document.getElementById('loginForm').addEventListener('submit', async (e) => {
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

document.getElementById('btnLogout').addEventListener('click', async () => {
  if (!supabaseClient) return;
  await supabaseClient.auth.signOut();
  document.getElementById('auth-screen').style.display = 'flex';
  document.getElementById('main-app').style.display = 'none';
  document.getElementById('authPassword').value = '';
});

// --- Initialisation ---
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

// --- Rendu Optmisé (DocumentFragment & Anti-XSS) ---
function renderWishlist() {
  const monthFilter = document.getElementById('w-monthFilter')?.value || 'all';
  const platF = document.getElementById('w-filterPlatform')?.value || 'all';
  const storeF = document.getElementById('w-filterStore')?.value || 'all';
  const statF = document.getElementById('w-filterStatus')?.value || 'all';
  const sortBy = document.getElementById('w-sortBy')?.value || 'newest';
  const searchQuery = (document.getElementById('w-searchBar')?.value || '').toLowerCase().trim();

  let totalConfirmed = 0, totalPending = 0;
  wishlist.forEach(i => {
    const p = parseFloat(i.price) || 0;
    if (checkDateMatch(i.releaseDate, monthFilter)) {
      if (i.status === 'À prendre') totalConfirmed += p;
      if (i.status === 'En réflexion') totalPending += p;
    }
  });

  document.getElementById('labelConfirmed').textContent = monthFilter !== 'all' ? 'Prévu (sélection)' : 'Total prévu';
  document.getElementById('labelPotential').textContent = monthFilter !== 'all' ? 'Potentiel (sélection)' : 'Total potentiel';
  document.getElementById('totalConfirmed').textContent = formatMoney(totalConfirmed);
  document.getElementById('totalPotential').textContent = formatMoney(totalConfirmed + totalPending);

  const container = document.getElementById('wishlistContainer');
  container.innerHTML = '';

  let filtered = wishlist.filter(i => {
    const matchMonth = checkDateMatch(i.releaseDate, monthFilter);
    const matchPlat = (platF === 'all' || i.platform === platF);
    const matchStore = (storeF === 'all' || i.store === storeF);
    const matchStat = (statF === 'all' || i.status === statF);
    const matchSearch = !searchQuery || (i.title && i.title.toLowerCase().includes(searchQuery)) || (i.artist && i.artist.toLowerCase().includes(searchQuery));
    return matchMonth && matchPlat && matchStore && matchStat && matchSearch;
  });

  filtered = sortItems(filtered, sortBy);
  
  // Utilisation de Fragment pour optimiser le rendu massif
  const fragment = document.createDocumentFragment();

  filtered.forEach(item => {
    const index = wishlist.indexOf(item);
    const card = document.createElement('div');
    
    // Nettoyage XSS
    const title = escapeHTML(item.title);
    const artist = escapeHTML(item.artist);
    const director = escapeHTML(item.director);
    const priceStr = item.price ? formatMoney(item.price) : 'Prix non fixé';
    const store = escapeHTML(item.store);
    const image = escapeHTML(item.image);
    
    let statusClass = item.status === 'En réflexion' ? 'status-think' : item.status === 'Je passe' ? 'status-pass' : 'status-take';
    let badgeStatusClass = item.status === 'En réflexion' ? 'think' : item.status === 'Je passe' ? 'pass' : 'take';
    let statusText = item.status === 'En réflexion' ? '⏳ En réflexion' : item.status === 'Je passe' ? '❌ Je passe' : '✅ Je prends';
    const isCollector = item.editionType === 'Collector';
    
    card.className = `item-card ${statusClass} ${isCollector ? 'is-collector' : ''}`;

    const dateStr = item.releaseDate ? `📅 ${new Date(item.releaseDate).toLocaleDateString('fr-FR')}` : '📅 Sans date';
    const storeBadge = (store && store !== 'Non renseigné') ? `<span class="badge-store">🛒 ${store}</span>` : '';
    const collectorBadge = isCollector ? `<span class="badge-collector">✨ COLLECTOR</span>` : '';
    const blurayBadge = item.blurayType ? `<span class="badge-state">📀 ${escapeHTML(item.blurayType)}</span>` : '';

    const coverHtml = image ? `<img src="${image}" class="item-cover" alt="Jaquette" onclick="event.stopPropagation(); window.openLightbox(this.src);" onerror="this.outerHTML='<div class=\\'item-cover-placeholder\\'>📦</div>'">` : `<div class="item-cover-placeholder">📦</div>`;

    let subtitle = '';
    if (item.platform === 'Vinyle' && artist) subtitle = `<div style="font-size:0.75rem; color:var(--text-muted); font-weight:700;">${artist}</div>`;
    if (item.platform === 'Blu-ray' && director) subtitle = `<div style="font-size:0.75rem; color:var(--text-muted); font-weight:700;">De ${director}</div>`;

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
              ${collectorBadge}
              ${blurayBadge}
              <span class="badge-status ${badgeStatusClass}">${statusText}</span>
              ${storeBadge}
              <span>${priceStr}</span>
              <span>•</span>
              <span>${dateStr}</span>
            </div>
          </div>
          <div class="actions" onclick="event.stopPropagation();">
            <button class="btn-action btn-edit" title="Modifier" onclick="window.openEditModal(${index})">✏️</button>
            <button class="btn-action btn-transfer" title="Transférer" onclick="window.moveToCollection(${index})">📥</button>
            <button class="btn-action btn-delete" title="Supprimer" onclick="window.deleteWishlistItem(${index})">✕</button>
          </div>
        </div>
        <div class="market-links" onclick="event.stopPropagation();">
          <span style="font-size:0.7rem; color:var(--text-muted); font-weight:700;">Recherche :</span>
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

function renderCollection() {
  document.getElementById('collectionCount').textContent = collection.length;

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

  document.getElementById('collectionFiltersBar').style.display = viewMode.startsWith('timeline') ? 'none' : 'flex';

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
  document.getElementById('collectionTotalValue').textContent = formatMoney(totalVal);
  document.getElementById('collectionItemTotal').textContent = filtered.length;

  const container = document.getElementById('collectionContainer');
  container.innerHTML = '';
  
  const fragment = document.createDocumentFragment();

  if (viewMode === 'list') {
    filtered.forEach(item => {
      const index = collection.indexOf(item);
      const card = document.createElement('div');
      
      const title = escapeHTML(item.title);
      const artist = escapeHTML(item.artist);
      const director = escapeHTML(item.director);
      const image = escapeHTML(item.image);
      const store = escapeHTML(item.store);
      const state = escapeHTML(item.state);
      const gameplay = escapeHTML(item.gameplay);
      const note = escapeHTML(item.note);

      const isCollector = item.editionType === 'Collector';
      card.className = `item-card ${isCollector ? 'is-collector' : ''}`;
      
      const valStr = item.price ? formatMoney(item.price) : 'Non estimé';
      const storeBadge = (store && store !== 'Non renseigné') ? `<span class="badge-store">🛒 ${store}</span>` : '';
      const stateBadge = state ? `<span class="badge-state">${state}</span>` : '';
      const playBadge = (gameplay && gameplay !== 'Non applicable') ? `<span class="badge-play">🎮 ${gameplay}</span>` : '';
      const collectorBadge = isCollector ? `<span class="badge-collector">✨ COLLECTOR</span>` : '';
      const blurayBadge = item.blurayType ? `<span class="badge-state">📀 ${escapeHTML(item.blurayType)}</span>` : '';

      const coverHtml = image ? `<img src="${image}" class="item-cover" alt="Jaquette" onclick="event.stopPropagation(); window.openLightbox(this.src);" onerror="this.outerHTML='<div class=\\'item-cover-placeholder\\'>📦</div>'">` : `<div class="item-cover-placeholder">📦</div>`;

      let subtitle = '';
      if (item.platform === 'Vinyle' && artist) subtitle = `<div style="font-size:0.75rem; color:var(--text-muted); font-weight:700;">${artist}</div>`;
      if (item.platform === 'Blu-ray' && director) subtitle = `<div style="font-size:0.75rem; color:var(--text-muted); font-weight:700;">De ${director}</div>`;

      let datesDisplay = [];
      if (item.releaseDate) datesDisplay.push(`📅 Sortie : ${new Date(item.releaseDate).toLocaleDateString('fr-FR')}`);
      if (item.buyDate) datesDisplay.push(`🛒 Acheté : ${new Date(item.buyDate).toLocaleDateString('fr-FR')}`);
      const datesStr = datesDisplay.length > 0 ? datesDisplay.join(' • ') : '📅 Dates non fixées';

      const noteHtml = note ? `<div class="item-note">📝 ${note}</div>` : '';
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
                ${collectorBadge}
                ${blurayBadge}
                ${stateBadge}
                ${playBadge}
                ${storeBadge}
                <span style="font-weight:900; color:var(--clay-yellow);">${valStr}</span>
              </div>
              <div class="item-meta" style="margin-top:2px;"><span>${datesStr}</span></div>
              ${noteHtml}
            </div>
            <div class="actions" onclick="event.stopPropagation();">
              <button class="btn-action btn-edit" title="Modifier" onclick="window.openEditCollectionModal(${index})">✏️</button>
              <button class="btn-action btn-delete" title="Supprimer" onclick="window.deleteCollectionItem(${index})">✕</button>
            </div>
          </div>
          <div class="market-links" onclick="event.stopPropagation();">
            <span style="font-size:0.7rem; color:var(--text-muted); font-weight:700;">Argus :</span>
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
    // Rendu grille ou Timeline (simplifié pour concision, suit le même principe d'échappement)
    const viewWrap = document.createElement('div');
    viewWrap.className = viewMode === 'grid' ? 'grid-collection-container' : 'timeline-h-container';
    
    if (viewMode !== 'grid') {
      const dateKey = viewMode === 'timeline-release' ? 'releaseDate' : 'buyDate';
      filtered.sort((a, b) => (a[dateKey] || '9999-12-31').localeCompare(b[dateKey] || '9999-12-31'));
    }

    filtered.forEach(item => {
      const index = collection.indexOf(item);
      const card = document.createElement('div');
      const isCollector = item.editionType === 'Collector';
      card.className = viewMode === 'grid' ? `grid-item-card ${isCollector ? 'is-collector' : ''}` : `tile-card ${isCollector ? 'is-collector' : ''}`;
      card.onclick = () => window.openCollectionDetail(index);
      
      const title = escapeHTML(item.title);
      const image = escapeHTML(item.image);
      const coverHtml = image ? `<img src="${image}" class="${viewMode==='grid'?'grid-item-cover':'tile-cover'}" onerror="this.outerHTML='<div class=\\'grid-item-cover-placeholder\\'>📦</div>'">` : `<div class="grid-item-cover-placeholder">📦</div>`;
      const priceStr = item.price ? formatMoney(item.price) : '—';
      
      if (viewMode === 'grid') {
        card.innerHTML = `${coverHtml}<div style="display:flex; flex-direction:column; gap:2px; min-width:0;"><div class="grid-item-title">${title}</div><div style="display:flex; justify-content:space-between; align-items:center; margin-top:4px;"><span class="badge" style="font-size:0.62rem; padding:3px 7px;">${escapeHTML(item.platform)}</span><span style="font-size:0.82rem; font-weight:900; color:var(--clay-yellow);">${priceStr}</span></div></div>`;
      } else {
        const itemDate = item[viewMode === 'timeline-release' ? 'releaseDate' : 'buyDate'] ? new Date(item[viewMode === 'timeline-release' ? 'releaseDate' : 'buyDate']).getFullYear() : 'N/A';
        card.innerHTML = `${coverHtml}<div class="tile-info"><div class="tile-title">${title}</div><div class="tile-meta"><span class="badge" style="font-size:0.65rem; padding:3px 8px;">${escapeHTML(item.platform)}</span><span style="font-size:0.72rem; font-weight:800; color:var(--clay-blue);">📅 ${itemDate}</span></div><div style="font-size:0.85rem; font-weight:900; color:var(--clay-yellow);">${priceStr}</div></div>`;
      }
      viewWrap.appendChild(card);
    });
    container.appendChild(viewWrap);
  }
}

// --- Fonctions CRUD et UI Accessibles Globalement ---

window.deleteWishlistItem = async function(index) {
  if (confirm("Supprimer l'article ?")) {
    const item = wishlist[index];
    if (item && item.image) await deleteFileFromSupabaseStorage(item.image);
    wishlist.splice(index, 1);
    saveData();
  }
}

window.deleteCollectionItem = async function(index) {
  if (confirm("Supprimer l'objet ?")) {
    const item = collection[index];
    if (item) {
      if (item.image) await deleteFileFromSupabaseStorage(item.image);
      if (item.photos && item.photos.length > 0) {
        for (const photoUrl of item.photos) await deleteFileFromSupabaseStorage(photoUrl);
      }
    }
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
  document.getElementById('tabBtnCollection').click();
}

window.openLightbox = function(src) {
  document.getElementById('lightbox-img').src = src;
  document.getElementById('lightbox-modal').style.display = 'flex';
}
document.getElementById('btnCloseLightbox').onclick = () => document.getElementById('lightbox-modal').style.display = 'none';

// Ajout Collection Submit
document.getElementById('collectionForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const platform = document.getElementById('c-platform').value;
  let extraData = { platform };
  if (platform === 'Vinyle') {
    extraData.artist = document.getElementById('c-artist')?.value.trim() || '';
    extraData.edition = document.getElementById('c-edition')?.value.trim() || '';
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
  e.target.reset();
  tempFormPhotos = [];
});

// Onglets
function switchTab(tabId) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
  document.getElementById('tabBtn' + tabId.charAt(0).toUpperCase() + tabId.slice(1)).classList.add('active');
  document.getElementById('tab-' + tabId.toLowerCase()).classList.add('active');
  if(tabId === 'Wishlist') renderWishlist();
  if(tabId === 'Collection') renderCollection();
}
document.getElementById('tabBtnWishlist').onclick = () => switchTab('Wishlist');
document.getElementById('tabBtnCollection').onclick = () => switchTab('Collection');
document.getElementById('tabBtnRandom').onclick = () => switchTab('Random');

// Filtres Helper
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

// Event Listeners UI basiques
document.getElementById('c-filterPlatform').addEventListener('change', renderCollection);
document.getElementById('c-viewMode').addEventListener('change', renderCollection);
document.getElementById('c-sortBy').addEventListener('change', renderCollection);
document.getElementById('c-searchBar').addEventListener('input', renderCollection);
document.getElementById('w-searchBar').addEventListener('input', renderWishlist);

// Init
window.addEventListener('DOMContentLoaded', () => {
  checkAuth();
});
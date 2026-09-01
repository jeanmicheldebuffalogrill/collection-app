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

// --- API KEYS ---
const RAWG_API_KEY = '5b06b52d45984ed39dbc551b4d72af0d'; // <-- TA CLÉ RAWG
const TMDB_API_KEY = 'd9e6e0cc19b2c65458fcff77fef7873d'; // <-- TA CLÉ TMDB

// --- Variables Globales ---
let wishlist = JSON.parse(localStorage.getItem('app_wishlist_cloud_v1')) || [];
let collection = JSON.parse(localStorage.getItem('app_collection_cloud_v1')) || [];
let currentDetailCollectionIndex = null;
let lastGachaponCategory = 'all';
let tempFormPhotos = [];

// --- Configurations des listes ---
const APP_CONFIG = {
  platforms: {
    groups: [
      { label: "Jeux Vidéo", options: [{v:"PS5", l:"PlayStation 5"}, {v:"Switch", l:"Nintendo Switch"}, {v:"Switch 2", l:"Nintendo Switch 2"}, {v:"3DS", l:"3DS"}, {v:"DS", l:"DS"}, {v:"GBA", l:"Game Boy Advance"}, {v:"GBC", l:"Game Boy Color"}] },
      { label: "Autres Médias", options: [{v:"Vinyle", l:"🎵 Vinyle"}, {v:"Blu-ray", l:"🎬 Blu-ray / 4K"}, {v:"Vêtement", l:"👕 Vêtement"}, {v:"Autre", l:"📦 Autre"}] }
    ],
    filters: [
      {v:"PS5", l:"PS5"}, {v:"Switch", l:"Switch"}, {v:"Switch 2", l:"Switch 2"}, {v:"3DS", l:"3DS"}, {v:"DS", l:"DS"}, {v:"GBA", l:"GBA"}, {v:"GBC", l:"GBC"}, {v:"Vinyle", l:"Vinyles"}, {v:"Blu-ray", l:"Blu-ray"}, {v:"Vêtement", l:"Vêtements"}
    ]
  },
  stores: [
    "Fnac", "Leclerc", "Amazon", "Cdiscount", "Auchan", "Carrefour", "Bloods Records", "Vinted", "Leboncoin", "eBay", {v: "Autre", l: "Autre enseigne"}
  ]
};

// --- Gachapon Audio Variables ---
let audioCtx = null; let tcgRipOsc = null; let tcgRipGain = null;
let isTopRipActive = false; let activeCategory = null; let startTopX = 0; let currentTopDragX = 0;

// --- Auto-complétion & Requêtes API ---
function debounce(func, wait) {
  let timeout;
  return function(...args) { clearTimeout(timeout); timeout = setTimeout(() => func.apply(this, args), wait); };
}

// RAWG (Jeux)
async function fetchRAWGGames(query) {
  if (!RAWG_API_KEY || RAWG_API_KEY === 'METS_TA_CLE_RAWG_ICI') return [];
  try {
    const res = await fetch(`https://api.rawg.io/api/games?key=${RAWG_API_KEY}&search=${encodeURIComponent(query)}&page_size=5`);
    const data = await res.json();
    return data.results || [];
  } catch(e) { return []; }
}
async function fetchRAWGGameDetails(gameId) {
  try {
    const res = await fetch(`https://api.rawg.io/api/games/${gameId}?key=${RAWG_API_KEY}`);
    return await res.json();
  } catch(e) { return null; }
}

// TMDB (Blu-ray / Films)
async function fetchTMDBMovies(query) {
  if (!TMDB_API_KEY || TMDB_API_KEY === 'METS_TA_CLE_TMDB_ICI') return [];
  try {
    const res = await fetch(`https://api.themoviedb.org/3/search/movie?api_key=${TMDB_API_KEY}&language=fr-FR&query=${encodeURIComponent(query)}`);
    const data = await res.json();
    return data.results ? data.results.slice(0, 5) : [];
  } catch(e) { return []; }
}
async function fetchTMDBMovieDetails(movieId) {
  try {
    const res = await fetch(`https://api.themoviedb.org/3/movie/${movieId}?api_key=${TMDB_API_KEY}&language=fr-FR&append_to_response=credits`);
    return await res.json();
  } catch(e) { return null; }
}

function setupAutocomplete(inputId, platformId, suggId, dateId, imageId, previewWrapId, previewImgId) {
  const input = document.getElementById(inputId);
  const suggBox = document.getElementById(suggId);
  const platform = document.getElementById(platformId);

  if (!input || !suggBox) return;

  const hideBox = () => { setTimeout(() => suggBox.style.display = 'none', 200); };
  input.addEventListener('blur', hideBox);

  input.addEventListener('input', debounce(async (e) => {
    const query = e.target.value.trim();
    const currentPlat = platform.value;
    const isGame = !['Vinyle', 'Blu-ray', 'Vêtement', 'Autre'].includes(currentPlat);
    const isMovie = currentPlat === 'Blu-ray';
    
    if (query.length < 3 || (!isGame && !isMovie)) {
      suggBox.style.display = 'none'; return;
    }

    let normalizedResults = [];
    
    if (isGame) {
      const results = await fetchRAWGGames(query);
      normalizedResults = results.map(g => ({ type: 'game', id: g.id, title: g.name, img: g.background_image, date: g.released, rawData: g }));
    } else if (isMovie) {
      const results = await fetchTMDBMovies(query);
      normalizedResults = results.map(m => ({ type: 'movie', id: m.id, title: m.title, img: m.poster_path ? `https://image.tmdb.org/t/p/w500${m.poster_path}` : '', date: m.release_date, rawData: m }));
    }

    if (normalizedResults.length === 0) { suggBox.style.display = 'none'; return; }

    suggBox.innerHTML = '';
    normalizedResults.forEach(itemData => {
      const item = document.createElement('div');
      item.className = 'autocomplete-item';
      const year = itemData.date ? itemData.date.substring(0,4) : 'N/A';
      
      item.innerHTML = `
        ${itemData.img ? `<img src="${itemData.img}" class="autocomplete-thumb">` : `<div class="autocomplete-thumb" style="display:flex;align-items:center;justify-content:center;font-size:10px;">📦</div>`}
        <div class="autocomplete-text">
          <span class="autocomplete-title">${escapeHTML(itemData.title)}</span>
          <span class="autocomplete-date">Sortie : ${year}</span>
        </div>
      `;
      
      item.onmousedown = () => { 
        input.value = itemData.title;
        if(dateId && document.getElementById(dateId)) document.getElementById(dateId).value = itemData.date;
        if(imageId && document.getElementById(imageId) && itemData.img) {
          fetchAndUploadExternalImage(itemData.img, imageId, previewWrapId, previewImgId);
        }
        
        const prefix = inputId.replace('title', ''); 
        
        if (itemData.type === 'game') {
          if (document.getElementById(prefix + 'genres') && itemData.rawData.genres) {
            document.getElementById(prefix + 'genres').value = itemData.rawData.genres.map(g => g.name).join(', ');
          }
          if (document.getElementById(prefix + 'publisher')) {
            fetchRAWGGameDetails(itemData.id).then(details => {
              if (details && details.publishers && details.publishers.length > 0) {
                const pubInput = document.getElementById(prefix + 'publisher');
                if (pubInput) pubInput.value = details.publishers.map(p => p.name).join(', ');
              }
            });
          }
        } 
        else if (itemData.type === 'movie') {
          fetchTMDBMovieDetails(itemData.id).then(details => {
            if (!details) return;
            // Genres
            if (document.getElementById(prefix + 'genres') && details.genres) {
              document.getElementById(prefix + 'genres').value = details.genres.map(g => g.name).join(', ');
            }
            // Durée
            if (document.getElementById(prefix + 'runtime') && details.runtime) {
              document.getElementById(prefix + 'runtime').value = details.runtime;
            }
            // Note TMDB
            if (document.getElementById(prefix + 'tmdbRating') && details.vote_average) {
              document.getElementById(prefix + 'tmdbRating').value = details.vote_average.toFixed(1);
            }
            // Réalisateur (Director)
            if (document.getElementById(prefix + 'director') && details.credits && details.credits.crew) {
              const director = details.credits.crew.find(c => c.job === 'Director');
              if (director) document.getElementById(prefix + 'director').value = director.name;
            }
            // Synopsis (injecté dans la zone de texte Notes de la wishlist OU de la collection)
            if (document.getElementById(prefix + 'note') && details.overview) {
              document.getElementById(prefix + 'note').value = details.overview;
            }
          });
        }
        
        suggBox.style.display = 'none';
      };
      suggBox.appendChild(item);
    });
    suggBox.style.display = 'flex';
  }, 300));
}

// --- Initialisation automatique des menus déroulants ---
function initDropdowns() {
  ['w-platform', 'c-platform', 'edit-platform', 'edit-c-platform'].forEach(id => {
    const el = document.getElementById(id);
    if(el) {
      el.innerHTML = '';
      APP_CONFIG.platforms.groups.forEach(group => {
        const optgroup = document.createElement('optgroup');
        optgroup.label = group.label;
        group.options.forEach(opt => {
          const option = document.createElement('option');
          option.value = opt.v; option.textContent = opt.l;
          optgroup.appendChild(option);
        });
        el.appendChild(optgroup);
      });
    }
  });

  ['w-filterPlatform', 'c-filterPlatform'].forEach(id => {
    const el = document.getElementById(id);
    if(el) {
      el.innerHTML = '<option value="all">Tous supports</option>';
      APP_CONFIG.platforms.filters.forEach(opt => {
        const option = document.createElement('option');
        option.value = opt.v; option.textContent = opt.l;
        el.appendChild(option);
      });
    }
  });

  ['w-store', 'c-store', 'edit-store', 'edit-c-store'].forEach(id => {
    const el = document.getElementById(id);
    if(el) {
      const defaultLabel = (id.startsWith('w') || id === 'edit-store') ? "🏪 Lieu de préco / achat" : "🏪 Acheté chez...";
      el.innerHTML = `<option value="Non renseigné">${defaultLabel}</option>`;
      APP_CONFIG.stores.forEach(store => {
        const option = document.createElement('option');
        option.value = typeof store === 'string' ? store : store.v;
        option.textContent = typeof store === 'string' ? store : store.l;
        el.appendChild(option);
      });
    }
  });

  ['w-filterStore', 'c-filterStore'].forEach(id => {
    const el = document.getElementById(id);
    if(el) {
      el.innerHTML = '<option value="all">Toutes enseignes</option>';
      APP_CONFIG.stores.forEach(store => {
        const option = document.createElement('option');
        const val = typeof store === 'string' ? store : store.v;
        option.value = val;
        option.textContent = val === "Autre" ? "Autre" : val;
        el.appendChild(option);
      });
    }
  });
}

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
  if (error) { errorEl.textContent = "Email ou mot de passe incorrect."; errorEl.style.display = 'block'; } 
  else { errorEl.style.display = 'none'; checkAuth(); }
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
    updateMonthFilterDropdowns(); renderWishlist(); renderCollection();
  } catch (e) { setSyncStatus('🟢 Mode Local Actif', 'var(--clay-blue)'); }
}

function saveData() {
  localStorage.setItem('app_wishlist_cloud_v1', JSON.stringify(wishlist));
  localStorage.setItem('app_collection_cloud_v1', JSON.stringify(collection));
  updateMonthFilterDropdowns(); renderWishlist(); renderCollection();
  if (supabaseClient) pushCloudDataBackground();
}

async function pushCloudDataBackground() {
  try {
    setSyncStatus('⏳ Enregistrement...', 'var(--clay-yellow)');
    for (const item of wishlist) await supabaseClient.from('wishlist_items').upsert({ id: item.id, data: item });
    for (const item of collection) await supabaseClient.from('collection_items').upsert({ id: item.id, data: item });
    setSyncStatus('🟢 Cloud Synchronisé', 'var(--clay-green)');
  } catch (e) { setSyncStatus('⚠️ Sauvegardé localement', 'var(--clay-pink)'); }
}

function setSyncStatus(text, color = 'var(--clay-green)') {
  const el = document.getElementById('syncStatus');
  if (el) { el.textContent = text; el.style.color = color; }
}

function formatMoney(amount) { return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(amount || 0); }

// --- Helpers pour Badges API ---
function getAPIBadgesHtml(item) {
  let html = '';
  if (item.genres) html += `<span class="badge-genre">${escapeHTML(item.genres)}</span>`;
  if (item.runtime) {
    const h = Math.floor(item.runtime / 60); const m = item.runtime % 60;
    html += `<span class="badge-time">⏱️ ${h}h ${m.toString().padStart(2, '0')}m</span>`;
  }
  if (item.tmdbRating) {
    html += `<span class="badge-mc" style="background:#01b4e4; color:#fff;">🍿 ${item.tmdbRating}</span>`;
  }
  return html;
}

// --- Fonctions Images & Supabase Storage ---
async function compressImageFile(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_SIZE = 1200;
        let width = img.width; let height = img.height;
        if (width > height) { if (width > MAX_SIZE) { height *= MAX_SIZE / width; width = MAX_SIZE; } } 
        else { if (height > MAX_SIZE) { width *= MAX_SIZE / height; height = MAX_SIZE; } }
        canvas.width = width; canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob((blob) => {
          const compressedFile = new File([blob], file.name || 'image.jpg', { type: 'image/jpeg', lastModified: Date.now() });
          resolve(compressedFile);
        }, 'image/jpeg', 0.82);
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

async function deleteFileFromSupabaseStorage(photoUrl) {
  if (!supabaseClient || !photoUrl || !photoUrl.includes('collection-photos/')) return;
  try {
    const parts = photoUrl.split('/collection-photos/');
    if (parts.length > 1) {
      const filePath = parts[1].split('?')[0];
      await supabaseClient.storage.from('collection-photos').remove([filePath]);
    }
  } catch (err) {}
}

async function uploadDirectFile(file, inputFieldId, wrapId, previewImgId) {
  if (!supabaseClient) { alert("Cloud non disponible."); return; }
  try {
    setSyncStatus('⏳ Upload...', 'var(--clay-yellow)');
    const compressed = await compressImageFile(file);
    const filePath = `photo_${Date.now()}_${Math.random().toString(36).substring(2, 8)}.jpg`;
    const { error } = await supabaseClient.storage.from('collection-photos').upload(filePath, compressed, { cacheControl: '3600', upsert: false });
    if (error) throw error;
    const { data: publicUrlData } = supabaseClient.storage.from('collection-photos').getPublicUrl(filePath);
    document.getElementById(inputFieldId).value = publicUrlData.publicUrl;
    updateImagePreview(inputFieldId, wrapId, previewImgId);
    setSyncStatus('🟢 Cloud Synchronisé', 'var(--clay-green)');
  } catch (err) {
    alert("Erreur upload: " + err.message); 
    setSyncStatus('⚠️ Erreur upload', 'var(--clay-pink)');
  }
}

async function fetchAndUploadExternalImage(imgUrl, inputFieldId, wrapId, previewImgId) {
  if (!supabaseClient) {
    document.getElementById(inputFieldId).value = imgUrl;
    updateImagePreview(inputFieldId, wrapId, previewImgId);
    return;
  }
  try {
    setSyncStatus('⏳ Aspiration image...', 'var(--clay-yellow)');
    document.getElementById(inputFieldId).value = imgUrl; 
    updateImagePreview(inputFieldId, wrapId, previewImgId);
    
    const response = await fetch(imgUrl);
    const blob = await response.blob();
    const file = new File([blob], 'cover_api.jpg', { type: blob.type });
    
    await uploadDirectFile(file, inputFieldId, wrapId, previewImgId);
  } catch (e) {
    console.warn("CORS ou erreur de téléchargement, utilisation du lien web d'origine", e);
    setSyncStatus('🟢 Cloud Synchronisé', 'var(--clay-green)'); 
  }
}

function handleDirectPaste(e, inputFieldId, wrapId, previewImgId) {
  if (!e.clipboardData || !e.clipboardData.items) return;
  for (const item of e.clipboardData.items) {
    if (item.type.indexOf('image') === 0) {
      e.preventDefault();
      const file = item.getAsFile();
      if (file) { uploadDirectFile(file, inputFieldId, wrapId, previewImgId); }
      return;
    }
  }
}

async function handleCoverUpload(event, inputFieldId, wrapId, previewImgId) {
  const file = event.target.files[0];
  if (!file) return;
  uploadDirectFile(file, inputFieldId, wrapId, previewImgId);
  event.target.value = '';
}

function updateImagePreview(inputFieldId, wrapId, previewImgId) {
  const val = document.getElementById(inputFieldId).value.trim();
  const wrap = document.getElementById(wrapId);
  const img = document.getElementById(previewImgId);
  if (val) { img.src = val; wrap.style.display = 'flex'; } 
  else { img.src = ''; wrap.style.display = 'none'; }
}

async function clearImageFieldAndStorage(imageFieldId, wrapId, previewImgId) {
  const inputField = document.getElementById(imageFieldId);
  if (inputField && inputField.value) await deleteFileFromSupabaseStorage(inputField.value);
  inputField.value = '';
  updateImagePreview(imageFieldId, wrapId, previewImgId);
}

function openGoogleImagesTab(titleFieldId, platformFieldId) {
  const title = document.getElementById(titleFieldId).value.trim();
  const platform = document.getElementById(platformFieldId).value;
  if (!title) { alert("Saisir un nom."); return; }
  let keyword = 'jaquette';
  if (platform === 'Vinyle') keyword = 'pochette vinyle';
  if (platform === 'Blu-ray') keyword = 'jaquette blu-ray';
  window.open(`https://www.google.com/search?tbm=isch&q=${encodeURIComponent(keyword + ' ' + title)}`, '_blank');
}

// Branchement des écouteurs pour les images
const coverConfigs = [
  { prefix: 'w-', searchBtn: 'btnSearchCoverW', input: 'inputCoverW', remove: 'btnRemoveCoverW', imgInput: 'w-image', wrap: 'w-preview-wrap', prev: 'w-preview', titleField: 'w-title', platField: 'w-platform' },
  { prefix: 'c-', searchBtn: 'btnSearchCoverC', input: 'inputCoverC', remove: 'btnRemoveCoverC', imgInput: 'c-image', wrap: 'c-preview-wrap', prev: 'c-preview', titleField: 'c-title', platField: 'c-platform' },
  { prefix: 'edit-', searchBtn: 'btnSearchCoverEW', input: 'inputCoverEW', remove: 'btnRemoveCoverEW', imgInput: 'edit-image', wrap: 'edit-preview-wrap', prev: 'edit-preview', titleField: 'edit-title', platField: 'edit-platform' },
  { prefix: 'edit-c-', searchBtn: 'btnSearchCoverEC', input: 'inputCoverEC', remove: 'btnRemoveCoverEC', imgInput: 'edit-c-image', wrap: 'edit-c-preview-wrap', prev: 'edit-c-preview', titleField: 'edit-c-title', platField: 'edit-c-platform' }
];

coverConfigs.forEach(cfg => {
  document.getElementById(cfg.searchBtn)?.addEventListener('click', () => openGoogleImagesTab(cfg.titleField, cfg.platField));
  document.getElementById(cfg.input)?.addEventListener('change', (e) => handleCoverUpload(e, cfg.imgInput, cfg.wrap, cfg.prev));
  document.getElementById(cfg.remove)?.addEventListener('click', () => clearImageFieldAndStorage(cfg.imgInput, cfg.wrap, cfg.prev));
  const textInput = document.getElementById(cfg.imgInput);
  if (textInput) {
    textInput.addEventListener('input', () => updateImagePreview(cfg.imgInput, cfg.wrap, cfg.prev));
    textInput.addEventListener('paste', (e) => handleDirectPaste(e, cfg.imgInput, cfg.wrap, cfg.prev));
  }
});


// --- Galeries Photos ---
async function handleAddCollectionPhoto(event) {
  if (currentDetailCollectionIndex === null) return;
  const file = event.target.files[0];
  if (!file || !supabaseClient) return;
  try {
    const compressed = await compressImageFile(file);
    const filePath = `photo_${Date.now()}_${Math.random().toString(36).substring(2, 8)}.jpg`;
    const { error } = await supabaseClient.storage.from('collection-photos').upload(filePath, compressed);
    if (error) throw error;
    const { data: publicUrlData } = supabaseClient.storage.from('collection-photos').getPublicUrl(filePath);
    const item = collection[currentDetailCollectionIndex];
    if (!item.photos) item.photos = [];
    item.photos.push(publicUrlData.publicUrl);
    saveData(); renderDetailGallery();
  } catch (e) { alert("Erreur photo."); }
  event.target.value = '';
}

async function handleAddFormGalleryPhoto(event) {
  const file = event.target.files[0];
  if (!file || !supabaseClient) return;
  try {
    const compressed = await compressImageFile(file);
    const filePath = `photo_${Date.now()}_${Math.random().toString(36).substring(2, 8)}.jpg`;
    const { error } = await supabaseClient.storage.from('collection-photos').upload(filePath, compressed);
    if (error) throw error;
    const { data: publicUrlData } = supabaseClient.storage.from('collection-photos').getPublicUrl(filePath);
    tempFormPhotos.push(publicUrlData.publicUrl);
    renderAddFormGallery();
  } catch (e) { alert("Erreur photo."); }
  event.target.value = '';
}

function renderAddFormGallery() {
  const grid = document.getElementById('addCollectionGalleryGrid');
  if (!grid) return;
  grid.innerHTML = '';
  tempFormPhotos.forEach((photoUrl, idx) => {
    const wrapper = document.createElement('div'); wrapper.className = 'gallery-thumb-wrapper';
    const thumb = document.createElement('img'); thumb.src = photoUrl; thumb.className = 'gallery-thumb';
    const delBtn = document.createElement('button'); delBtn.className = 'btn-delete-gallery-photo'; delBtn.innerHTML = '✕';
    delBtn.onclick = (e) => { 
      e.stopPropagation(); deleteFileFromSupabaseStorage(photoUrl); tempFormPhotos.splice(idx, 1); renderAddFormGallery(); 
    };
    wrapper.appendChild(thumb); wrapper.appendChild(delBtn); grid.appendChild(wrapper);
  });
}

function renderDetailGallery() {
  if (currentDetailCollectionIndex === null) return;
  const item = collection[currentDetailCollectionIndex];
  if (!item.photos) item.photos = [];
  const grid = document.getElementById('detailGalleryGrid');
  if (!grid) return;
  grid.innerHTML = '';
  item.photos.forEach((photoUrl, photoIndex) => {
    const wrapper = document.createElement('div'); wrapper.className = 'gallery-thumb-wrapper';
    const thumb = document.createElement('img'); thumb.src = photoUrl; thumb.className = 'gallery-thumb';
    thumb.onclick = () => window.openLightbox(photoUrl);
    const deleteBtn = document.createElement('button'); deleteBtn.className = 'btn-delete-gallery-photo'; deleteBtn.innerHTML = '✕';
    deleteBtn.onclick = async (e) => {
      e.stopPropagation();
      if (confirm("Supprimer ?")) {
        await deleteFileFromSupabaseStorage(photoUrl); item.photos.splice(photoIndex, 1); saveData(); renderDetailGallery();
      }
    };
    wrapper.appendChild(thumb); wrapper.appendChild(deleteBtn); grid.appendChild(wrapper);
  });
}

document.getElementById('inputAddDetailPhoto')?.addEventListener('change', handleAddCollectionPhoto);
document.getElementById('inputGalleryC')?.addEventListener('change', handleAddFormGalleryPhoto);


// --- Rendu Optmisé Wishlist ---
function renderWishlist() {
  const monthFilter = document.getElementById('w-monthFilter')?.value || 'all';
  const platF = document.getElementById('w-filterPlatform')?.value || 'all';
  const storeF = document.getElementById('w-filterStore')?.value || 'all';
  const statF = document.getElementById('w-filterStatus')?.value || 'all';
  const editionF = document.getElementById('w-filterEdition')?.value || 'all';
  const sortBy = document.getElementById('w-sortBy')?.value || 'newest';
  const searchQuery = (document.getElementById('w-searchBar')?.value || '').toLowerCase().trim();

  let totalConfirmed = 0, totalPending = 0;
  let filtered = wishlist.filter(i => {
    const matchMonth = checkDateMatch(i.releaseDate, monthFilter);
    const matchPlat = (platF === 'all' || i.platform === platF);
    const matchStore = (storeF === 'all' || i.store === storeF);
    const matchStat = (statF === 'all' || i.status === statF);
    const matchEdition = (editionF === 'all' || (i.editionType || 'Standard') === editionF);
    const matchSearch = !searchQuery || (i.title && i.title.toLowerCase().includes(searchQuery)) || (i.artist && i.artist.toLowerCase().includes(searchQuery));
    
    if (matchMonth) {
      const p = parseFloat(i.price) || 0;
      if (i.status === 'À prendre') totalConfirmed += p;
      if (i.status === 'En réflexion') totalPending += p;
    }
    return matchMonth && matchPlat && matchStore && matchStat && matchEdition && matchSearch;
  });

  if(document.getElementById('labelConfirmed')) document.getElementById('labelConfirmed').textContent = monthFilter !== 'all' ? 'Prévu (sélection)' : 'Total prévu';
  if(document.getElementById('labelPotential')) document.getElementById('labelPotential').textContent = monthFilter !== 'all' ? 'Potentiel (sélection)' : 'Total potentiel';
  if(document.getElementById('totalConfirmed')) document.getElementById('totalConfirmed').textContent = formatMoney(totalConfirmed);
  if(document.getElementById('totalPotential')) document.getElementById('totalPotential').textContent = formatMoney(totalConfirmed + totalPending);

  const container = document.getElementById('wishlistContainer');
  if(!container) return;
  container.innerHTML = '';

  filtered = sortItems(filtered, sortBy, false);
  const fragment = document.createDocumentFragment();

  filtered.forEach(item => {
    const index = wishlist.indexOf(item);
    const card = document.createElement('div');
    
    const title = escapeHTML(item.title);
    const priceStr = item.price ? formatMoney(item.price) : 'Prix non fixé';
    
    let statusClass = item.status === 'En réflexion' ? 'status-think' : item.status === 'Je passe' ? 'status-pass' : 'status-take';
    let badgeStatusClass = item.status === 'En réflexion' ? 'think' : item.status === 'Je passe' ? 'pass' : 'take';
    let statusText = item.status === 'En réflexion' ? '⏳ En réflexion' : item.status === 'Je passe' ? '❌ Je passe' : '✅ Je prends';
    
    card.className = `item-card ${statusClass} ${item.editionType === 'Collector' ? 'is-collector' : ''}`;
    
    const dateStr = item.releaseDate ? `📅 ${new Date(item.releaseDate).toLocaleDateString('fr-FR')}` : '📅 Sans date';
    const storeBadge = (item.store && item.store !== 'Non renseigné') ? `<span class="badge-store">🛒 ${escapeHTML(item.store)}</span>` : '';
    const collectorBadge = item.editionType === 'Collector' ? `<span class="badge-collector">✨ COLLECTOR</span>` : '';
    const blurayBadge = item.blurayType ? `<span class="badge-state">📀 ${escapeHTML(item.blurayType)}</span>` : '';
    const vinylBadge = (item.platform === 'Vinyle' && item.vinylEdition) ? `<span class="badge-state">🎵 ${escapeHTML(item.vinylEdition)}</span>` : '';

    const coverHtml = item.image ? `<img src="${escapeHTML(item.image)}" class="item-cover" alt="Jaquette" onclick="event.stopPropagation(); window.openLightbox(this.src);" onerror="this.outerHTML='<div class=\\'item-cover-placeholder\\'>📦</div>'">` : `<div class="item-cover-placeholder">📦</div>`;

    // Gestion du sous-titre
    let subtitle = '';
    if (item.platform === 'Vinyle' && item.artist) {
      subtitle = `<div style="font-size:0.75rem; color:var(--text-muted); font-weight:700;">${escapeHTML(item.artist)}</div>`;
    } else if (item.platform === 'Blu-ray' && item.director) {
      subtitle = `<div style="font-size:0.75rem; color:var(--text-muted); font-weight:700;">${escapeHTML(item.director)}</div>`;
    } else if (item.publisher) {
      subtitle = `<div style="font-size:0.75rem; color:var(--text-muted); font-weight:700;">${escapeHTML(item.publisher)}</div>`;
    }

    const q = encodeURIComponent(`${item.title} ${item.platform}`);
    const searchLinkHtml = item.platform === 'Vinyle' ? `<a class="btn-market discogs" href="https://www.discogs.com/fr/search/?q=${encodeURIComponent([item.artist, item.title].filter(Boolean).join(' '))}&type=release&format_exact=Vinyl" target="_blank">🎵 Discogs</a>` : `<a class="btn-market collector" href="https://www.google.com/search?q=${encodeURIComponent('site:editioncollector.fr ' + title)}" target="_blank">🏆 Collector</a>`;

    card.innerHTML = `
      ${coverHtml}
      <div class="item-content" style="cursor:pointer;" onclick="window.openEditModal(${index})">
        <div class="card-header">
          <div class="item-info">
            <h3>${title}</h3>
            ${subtitle}
            <div class="item-meta">
              <span class="badge">${escapeHTML(item.platform)}</span>
              ${collectorBadge} ${blurayBadge} ${vinylBadge}
              <span class="badge-status ${badgeStatusClass}">${statusText}</span>
              ${getAPIBadgesHtml(item)}
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
          ${searchLinkHtml}
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
  const viewMode = document.getElementById('c-viewMode')?.value || 'list';
  const sortBy = document.getElementById('c-sortBy')?.value || 'newest';
  const searchQuery = (document.getElementById('c-searchBar')?.value || '').toLowerCase().trim();

  const playF = document.getElementById('c-filterGameplay')?.value || 'all';
  const vinylF = document.getElementById('c-filterVinylEdition')?.value || 'all';
  const blurayF = document.getElementById('c-filterBlurayType')?.value || 'all';

  if(document.getElementById('collectionFiltersBar')) document.getElementById('collectionFiltersBar').style.display = viewMode.startsWith('timeline') ? 'none' : 'flex';

  let filtered = collection.filter(i => {
    const matchBuy = checkDateMatch(i.buyDate, monthFilter);
    const matchRelease = checkDateMatch(i.releaseDate, releaseFilter);
    const matchPlat = (currentPlatformFilter === 'all' || i.platform === currentPlatformFilter);
    const matchStore = (storeF === 'all' || i.store === storeF);
    const matchEdition = (editionF === 'all' || (i.editionType || 'Standard') === editionF);
    const matchState = (stateF === 'all' || i.state === stateF);
    const matchSearch = !searchQuery || (i.title && i.title.toLowerCase().includes(searchQuery)) || (i.artist && i.artist.toLowerCase().includes(searchQuery)) || (i.publisher && i.publisher.toLowerCase().includes(searchQuery)) || (i.director && i.director.toLowerCase().includes(searchQuery));
    
    const matchPlay = (playF === 'all' || i.gameplay === playF);
    const matchVinyl = (vinylF === 'all' || i.vinylEdition === vinylF);
    const matchBluray = (blurayF === 'all' || i.blurayType === blurayF);

    return viewMode.startsWith('timeline') ? 
      (matchBuy && matchRelease && matchSearch) : 
      (matchBuy && matchRelease && matchPlat && matchStore && matchEdition && matchState && matchPlay && matchVinyl && matchBluray && matchSearch);
  });

  filtered = sortItems(filtered, sortBy, true);

  let totalVal = 0;
  filtered.forEach(i => { totalVal += parseFloat(i.price) || 0; });
  if(document.getElementById('collectionTotalValue')) document.getElementById('collectionTotalValue').textContent = formatMoney(totalVal);
  if(document.getElementById('collectionItemTotal')) document.getElementById('collectionItemTotal').textContent = filtered.length;

  const platformStats = {};
  filtered.forEach(i => {
    const p = i.platform || 'Autre';
    if (!platformStats[p]) platformStats[p] = { count: 0, total: 0 };
    platformStats[p].count += 1;
    platformStats[p].total += parseFloat(i.price) || 0;
  });
  const breakdownGrid = document.getElementById('platformBreakdownGrid');
  if (breakdownGrid) {
    breakdownGrid.innerHTML = '';
    Object.keys(platformStats).sort((a,b)=>platformStats[b].total - platformStats[a].total).forEach(plat => {
      const data = platformStats[plat];
      const chip = document.createElement('div');
      chip.className = `platform-chip ${currentPlatformFilter === plat ? 'active' : ''}`;
      chip.onclick = () => { 
        document.getElementById('c-filterPlatform').value = (document.getElementById('c-filterPlatform').value === plat) ? 'all' : plat; 
        if(document.getElementById('c-filterGameplay')) document.getElementById('c-filterGameplay').value = 'all';
        if(document.getElementById('c-filterVinylEdition')) document.getElementById('c-filterVinylEdition').value = 'all';
        if(document.getElementById('c-filterBlurayType')) document.getElementById('c-filterBlurayType').value = 'all';
        updateDynamicCollectionFilters(); renderCollection(); 
      };
      chip.innerHTML = `<div class="platform-chip-name">${escapeHTML(plat)} ${currentPlatformFilter === plat ? '✓' : ''}</div><div class="platform-chip-value">${formatMoney(data.total)}</div><div class="platform-chip-count">${data.count} obj.</div>`;
      breakdownGrid.appendChild(chip);
    });
  }

  const container = document.getElementById('collectionContainer');
  if(!container) return;
  container.innerHTML = '';
  
  const fragment = document.createDocumentFragment();

  if (viewMode === 'list') {
    filtered.forEach(item => {
      const index = collection.indexOf(item);
      const card = document.createElement('div');
      
      const title = escapeHTML(item.title);
      const isCollector = item.editionType === 'Collector';
      card.className = `item-card ${isCollector ? 'is-collector' : ''}`;
      
      const valStr = item.price ? formatMoney(item.price) : 'Non estimé';
      const storeBadge = (item.store && item.store !== 'Non renseigné') ? `<span class="badge-store">🛒 ${escapeHTML(item.store)}</span>` : '';
      const stateBadge = item.state ? `<span class="badge-state">${escapeHTML(item.state)}</span>` : '';
      const playBadge = (item.gameplay && item.gameplay !== 'Non applicable') ? `<span class="badge-play">🎮 ${escapeHTML(item.gameplay)}</span>` : '';
      const collectorBadge = isCollector ? `<span class="badge-collector">✨ COLLECTOR</span>` : '';
      const blurayBadge = item.blurayType ? `<span class="badge-state">📀 ${escapeHTML(item.blurayType)}</span>` : '';
      const vinylBadge = (item.platform === 'Vinyle' && item.vinylEdition) ? `<span class="badge-state">🎵 ${escapeHTML(item.vinylEdition)}</span>` : '';

      const coverHtml = item.image ? `<img src="${escapeHTML(item.image)}" class="item-cover" alt="Jaquette" onclick="event.stopPropagation(); window.openLightbox(this.src);" onerror="this.outerHTML='<div class=\\'item-cover-placeholder\\'>📦</div>'">` : `<div class="item-cover-placeholder">📦</div>`;

      // Gestion du sous-titre
      let subtitle = '';
      if (item.platform === 'Vinyle' && item.artist) {
        subtitle = `<div style="font-size:0.75rem; color:var(--text-muted); font-weight:700;">${escapeHTML(item.artist)}</div>`;
      } else if (item.platform === 'Blu-ray' && item.director) {
        subtitle = `<div style="font-size:0.75rem; color:var(--text-muted); font-weight:700;">${escapeHTML(item.director)}</div>`;
      } else if (item.publisher) {
        subtitle = `<div style="font-size:0.75rem; color:var(--text-muted); font-weight:700;">${escapeHTML(item.publisher)}</div>`;
      }

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
                ${collectorBadge} ${blurayBadge} ${vinylBadge} ${stateBadge} ${playBadge} ${storeBadge}
                ${getAPIBadgesHtml(item)}
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

    if (viewMode !== 'grid') {
      viewWrap.addEventListener('wheel', (e) => {
        if (e.deltaY !== 0) { e.preventDefault(); viewWrap.scrollBy({ left: e.deltaY > 0 ? 250 : -250, behavior: 'smooth' }); }
      });
    }
  }
}

// --- Fonction pour Afficher/Masquer les Filtres Spécifiques ---
function updateDynamicCollectionFilters() {
  const platform = document.getElementById('c-filterPlatform')?.value;
  const gameplayFilter = document.getElementById('c-filterGameplay');
  const vinylFilter = document.getElementById('c-filterVinylEdition');
  const blurayFilter = document.getElementById('c-filterBlurayType');
  
  if (!gameplayFilter || !vinylFilter || !blurayFilter) return;

  if (platform === 'Vinyle') {
    gameplayFilter.style.display = 'none'; blurayFilter.style.display = 'none'; vinylFilter.style.display = 'block';
  } else if (platform === 'Blu-ray') {
    gameplayFilter.style.display = 'none'; vinylFilter.style.display = 'none'; blurayFilter.style.display = 'block';
  } else if (platform === 'Vêtement' || platform === 'Autre') {
    gameplayFilter.style.display = 'none'; vinylFilter.style.display = 'none'; blurayFilter.style.display = 'none';
  } else {
    vinylFilter.style.display = 'none'; blurayFilter.style.display = 'none'; gameplayFilter.style.display = 'block';
  }
}

// --- Fonctions CRUD et UI ---
window.deleteWishlistItem = async function(index) {
  if (confirm("Supprimer l'article ?")) {
    const item = wishlist[index];
    if (item && item.image) await deleteFileFromSupabaseStorage(item.image);
    wishlist.splice(index, 1); saveData();
    if (supabaseClient && item && item.id) { await supabaseClient.from('wishlist_items').delete().eq('id', item.id); }
  }
}

window.deleteCollectionItem = async function(index) {
  if (confirm("Supprimer l'objet ?")) {
    const item = collection[index];
    if (item) {
      if (item.image) await deleteFileFromSupabaseStorage(item.image);
      if (item.photos && item.photos.length > 0) { for (const photoUrl of item.photos) await deleteFileFromSupabaseStorage(photoUrl); }
    }
    collection.splice(index, 1); saveData();
    if (supabaseClient && item && item.id) { await supabaseClient.from('collection_items').delete().eq('id', item.id); }
  }
}

window.moveToCollection = function(index) {
  const item = wishlist[index];
  if (!item) return;
  if (supabaseClient && item.id) { supabaseClient.from('wishlist_items').delete().eq('id', item.id); }

  collection.unshift({
    ...item,
    id: crypto.randomUUID ? crypto.randomUUID() : `c_${Date.now()}`,
    state: '✨ Neuf sous blister',
    buyDate: item.releaseDate || new Date().toISOString().slice(0, 10),
    gameplay: 'Non commencé',
    photos: []
  });
  wishlist.splice(index, 1); saveData(); switchTab('Collection');
}

window.openLightbox = function(src) {
  document.getElementById('lightbox-img').src = src; document.getElementById('lightbox-modal').style.display = 'flex';
}

window.openCollectionDetail = function(index) {
  currentDetailCollectionIndex = index;
  const item = collection[index];
  const coverContainer = document.getElementById('detail-cover-container');
  coverContainer.innerHTML = item.image ? `<img src="${escapeHTML(item.image)}" class="detail-cover-large" onclick="window.openLightbox(this.src)" onerror="this.outerHTML='<div class=\\'detail-cover-large\\'>📦</div>'">` : `<div class="detail-cover-large">📦</div>`;
  document.getElementById('detail-title').textContent = item.title;
  
  const isCollector = item.editionType === 'Collector';
  const blurayBadge = item.blurayType ? `<span class="badge-state">📀 ${escapeHTML(item.blurayType)}</span>` : '';
  const vinylBadge = (item.platform === 'Vinyle' && item.vinylEdition) ? `<span class="badge-state">🎵 ${escapeHTML(item.vinylEdition)}</span>` : '';
  
  document.getElementById('detail-meta').innerHTML = `<span class="badge">${escapeHTML(item.platform)}</span>${isCollector ? '<span class="badge-collector">✨ COLLECTOR</span>' : ''}${blurayBadge}${vinylBadge}${item.state ? `<span class="badge-state">${escapeHTML(item.state)}</span>` : ''}<span style="font-weight:900; color:var(--clay-yellow);">${item.price ? formatMoney(item.price) : 'Non estimé'}</span>`;
  
  let specificInfoHtml = `<div><strong>Acheté chez :</strong> ${escapeHTML(item.store) || 'Non renseigné'}</div>`;
  if (item.platform === 'Vinyle') {
    if (item.artist) specificInfoHtml += `<div><strong>Artiste :</strong> ${escapeHTML(item.artist)}</div>`;
    if (item.vinylEdition) specificInfoHtml += `<div><strong>Édition :</strong> ${escapeHTML(item.vinylEdition)}</div>`;
  } else if (item.platform === 'Blu-ray') {
    if (item.director) specificInfoHtml += `<div><strong>Réalisateur :</strong> ${escapeHTML(item.director)}</div>`;
    if (item.genres) specificInfoHtml += `<div><strong>Genres :</strong> ${escapeHTML(item.genres)}</div>`;
    if (item.runtime) {
      const h = Math.floor(item.runtime / 60); const m = item.runtime % 60;
      specificInfoHtml += `<div><strong>Durée :</strong> ${h}h ${m}m</div>`;
    }
    if (item.tmdbRating) specificInfoHtml += `<div><strong>Note TMDB :</strong> ⭐ ${item.tmdbRating}/10</div>`;
    if (item.blurayType) specificInfoHtml += `<div><strong>Format :</strong> ${escapeHTML(item.blurayType)}</div>`;
  } else {
    // Infos RAWG et Gameplay
    if (item.publisher) specificInfoHtml += `<div><strong>Éditeur :</strong> ${escapeHTML(item.publisher)}</div>`;
    if (item.genres) specificInfoHtml += `<div><strong>Genres :</strong> ${escapeHTML(item.genres)}</div>`;
    if (item.gameplay) specificInfoHtml += `<div><strong>Progression :</strong> ${escapeHTML(item.gameplay)}</div>`;
  }
  
  let datesDisplay = [];
  if (item.releaseDate) datesDisplay.push(`Sortie : ${new Date(item.releaseDate).toLocaleDateString('fr-FR')}`);
  if (item.buyDate) datesDisplay.push(`Achat : ${new Date(item.buyDate).toLocaleDateString('fr-FR')}`);
  specificInfoHtml += `<div><strong>Dates :</strong> ${datesDisplay.length > 0 ? datesDisplay.join(' • ') : 'Non fixées'}</div>`;
  
  document.getElementById('detail-dynamic-infos').innerHTML = specificInfoHtml;
  document.getElementById('detail-notes-container').innerHTML = item.note ? `<strong>Notes / Synopsis :</strong><br> ${escapeHTML(item.note)}` : '<em>Aucune note.</em>';
  
  renderDetailGallery(); document.getElementById('detail-modal').style.display = 'flex';
}

// --- Modales et Formulaires ---
function toggleFormFields(prefix, platform, data = null) {
  if (!data) {
    data = {};
    ['publisher', 'genres', 'gameplay', 'artist', 'vinylEdition', 'blurayType', 'director', 'runtime', 'tmdbRating'].forEach(field => {
      const el = document.getElementById(prefix + field);
      if (el) data[field] = el.value;
    });
  }
  
  const container = document.getElementById(prefix + 'dynamic-fields');
  if (container) container.innerHTML = getDynamicFieldsHtml(prefix, platform, data);
  if (prefix === 'w-' || prefix === 'edit-') updateSearchButton(prefix, platform);
}

function getDynamicFieldsHtml(prefix, platform, data = {}) {
  if (platform === 'Vinyle') {
    const currentEdition = data.vinylEdition || 'Pochette standard 1 LP';
    return `
      <div class="form-row">
        <input type="text" id="${prefix}artist" placeholder="Artiste / Groupe" value="${data.artist || ''}">
        <select id="${prefix}vinylEdition" style="width:100%;">
          <option value="Pochette standard 1 LP" ${currentEdition === 'Pochette standard 1 LP' ? 'selected' : ''}>🎵 Pochette standard 1 LP</option>
          <option value="Pochette standard 2 LP" ${currentEdition === 'Pochette standard 2 LP' ? 'selected' : ''}>🎵 Pochette standard 2 LP</option>
          <option value="Gatefold 1 LP" ${currentEdition === 'Gatefold 1 LP' ? 'selected' : ''}>🎵 Gatefold 1 LP</option>
          <option value="Gatefold 2 LP" ${currentEdition === 'Gatefold 2 LP' ? 'selected' : ''}>🎵 Gatefold 2 LP</option>
        </select>
      </div>`;
  } else if (platform === 'Blu-ray') {
    return `
      <div class="form-row">
        <input type="text" id="${prefix}director" placeholder="Réalisateur" value="${data.director || ''}">
        <select id="${prefix}blurayType" style="width:100%;"><option value="Version normale" ${data.blurayType === 'Version normale' ? 'selected' : ''}>🎬 Version normale</option><option value="Steelbook" ${data.blurayType === 'Steelbook' ? 'selected' : ''}>📀 Steelbook</option></select>
      </div>
      <div class="form-row">
        <input type="text" id="${prefix}genres" placeholder="Genres" value="${data.genres || ''}">
        <input type="number" id="${prefix}runtime" placeholder="Minutes" value="${data.runtime || ''}" style="max-width: 90px;" title="Durée du film (min)">
        <input type="number" step="0.1" id="${prefix}tmdbRating" placeholder="Note /10" value="${data.tmdbRating || ''}" style="max-width: 90px;" title="Note TMDB">
      </div>
    `;
  } else if (platform === 'Vêtement' || platform === 'Autre') {
    return ``;
  } else {
    let html = `
      <div class="form-row">
        <input type="text" id="${prefix}publisher" placeholder="Éditeur (ex: Nintendo)" value="${data.publisher || ''}">
        <input type="text" id="${prefix}genres" placeholder="Genres (ex: RPG, Action)" value="${data.genres || ''}">
      </div>
    `;
    if (prefix === 'c-' || prefix === 'edit-c-') {
      html += `<div class="form-row"><select id="${prefix}gameplay"><option value="Non commencé" ${data.gameplay === 'Non commencé' ? 'selected' : ''}>⏳ Non commencé</option><option value="En cours" ${data.gameplay === 'En cours' ? 'selected' : ''}>🎮 En cours</option><option value="Terminé" ${data.gameplay === 'Terminé' ? 'selected' : ''}>🏆 Terminé</option><option value="Non applicable" ${data.gameplay === 'Non applicable' ? 'selected' : ''}>⚪ Non applicable</option></select></div>`;
    }
    return html;
  }
}

function updateSearchButton(prefix, platform) {
  const btn = document.getElementById(prefix + 'searchBtn');
  if (!btn) return;
  if (platform === 'Vinyle') { btn.textContent = '🎵 Rechercher sur Discogs'; btn.style.background = 'var(--clay-purple)'; btn.style.color = 'var(--clay-purple-text)'; } 
  else if (platform === 'Blu-ray') { btn.textContent = '🎬 Rechercher sur TMDB'; btn.style.background = '#01b4e4'; btn.style.color = '#fff'; }
  else { btn.textContent = '🏆 Rechercher sur EditionCollector'; btn.style.background = 'var(--clay-yellow)'; btn.style.color = 'var(--clay-yellow-text)'; }
}

function handleCustomSearch(prefix) {
  const title = document.getElementById(prefix + 'title')?.value.trim() || '';
  const platform = document.getElementById(prefix + 'platform')?.value || '';
  const artist = document.getElementById(prefix + 'artist')?.value.trim() || '';
  if (!title && !artist) { alert("Saisir un nom."); return; }
  if (platform === 'Vinyle') {
    window.open(`https://www.discogs.com/fr/search/?q=${encodeURIComponent([artist, title].filter(Boolean).join(' '))}&type=release&format_exact=Vinyl`, '_blank');
  } else if (platform === 'Blu-ray') {
    window.open(`https://www.themoviedb.org/search?query=${encodeURIComponent(title)}&language=fr-FR`, '_blank');
  } else {
    window.open(`https://www.google.com/search?q=${encodeURIComponent('site:editioncollector.fr ' + title)}`, '_blank');
  }
}

// Ouvertures
document.getElementById('btnOpenAddWishlist')?.addEventListener('click', () => { 
  document.getElementById('wishlistForm').reset(); updateImagePreview('w-image', 'w-preview-wrap', 'w-preview');
  toggleFormFields('w-', document.getElementById('w-platform').value); document.getElementById('add-wishlist-modal').style.display = 'flex'; 
});

document.getElementById('btnOpenAddCollection')?.addEventListener('click', () => { 
  document.getElementById('collectionForm').reset(); updateImagePreview('c-image', 'c-preview-wrap', 'c-preview');
  tempFormPhotos = []; renderAddFormGallery(); toggleFormFields('c-', document.getElementById('c-platform').value); 
  document.getElementById('add-collection-modal').style.display = 'flex'; 
});

document.getElementById('btnDetailEdit')?.addEventListener('click', () => { document.getElementById('detail-modal').style.display = 'none'; window.openEditCollectionModal(currentDetailCollectionIndex); });
document.getElementById('btnDetailDelete')?.addEventListener('click', () => { if (confirm("Supprimer ?")) { document.getElementById('detail-modal').style.display = 'none'; window.deleteCollectionItem(currentDetailCollectionIndex); } });

// Fermetures
document.getElementById('btnCloseAddWishlist')?.addEventListener('click', () => document.getElementById('add-wishlist-modal').style.display = 'none');
document.getElementById('btnCloseAddCollection')?.addEventListener('click', () => document.getElementById('add-collection-modal').style.display = 'none');
document.getElementById('btnCloseDetail')?.addEventListener('click', () => { document.getElementById('detail-modal').style.display = 'none'; currentDetailCollectionIndex = null; });
document.getElementById('btnCloseLightbox')?.addEventListener('click', () => document.getElementById('lightbox-modal').style.display = 'none');
document.getElementById('lightbox-modal')?.addEventListener('click', (e) => { if (e.target.id === 'lightbox-modal') document.getElementById('lightbox-modal').style.display = 'none'; });
document.getElementById('w-searchBtn')?.addEventListener('click', () => handleCustomSearch('w-'));
document.getElementById('edit-searchBtn')?.addEventListener('click', () => handleCustomSearch('edit-'));


// --- Helper pour extraire les données API ---
function getAPIFieldsData(prefix, platform) {
  let extra = {};
  if (document.getElementById(prefix + 'genres')) extra.genres = document.getElementById(prefix + 'genres').value.trim();
  
  if (platform === 'Blu-ray') {
    if (document.getElementById(prefix + 'director')) extra.director = document.getElementById(prefix + 'director').value.trim();
    if (document.getElementById(prefix + 'runtime')) extra.runtime = document.getElementById(prefix + 'runtime').value;
    if (document.getElementById(prefix + 'tmdbRating')) extra.tmdbRating = document.getElementById(prefix + 'tmdbRating').value;
  } else if (platform !== 'Vinyle' && platform !== 'Vêtement' && platform !== 'Autre') {
    if (document.getElementById(prefix + 'gameplay')) extra.gameplay = document.getElementById(prefix + 'gameplay').value;
    if (document.getElementById(prefix + 'publisher')) extra.publisher = document.getElementById(prefix + 'publisher').value.trim();
  }
  return extra;
}

// Soumissions
document.getElementById('wishlistForm')?.addEventListener('submit', (e) => {
  e.preventDefault();
  const platform = document.getElementById('w-platform').value;
  let extraData = { platform };
  
  if (platform === 'Vinyle') {
    extraData.artist = document.getElementById('w-artist')?.value.trim() || '';
    extraData.vinylEdition = document.getElementById('w-vinylEdition')?.value || 'Pochette standard 1 LP';
  } else if (platform === 'Blu-ray') {
    extraData.blurayType = document.getElementById('w-blurayType')?.value || 'Version normale';
    Object.assign(extraData, getAPIFieldsData('w-', platform));
  } else if (platform !== 'Vêtement' && platform !== 'Autre') {
    Object.assign(extraData, getAPIFieldsData('w-', platform));
  }
  
  wishlist.unshift({
    id: crypto.randomUUID ? crypto.randomUUID() : `w_${Date.now()}`,
    title: document.getElementById('w-title').value.trim(), price: document.getElementById('w-price').value,
    editionType: document.getElementById('w-editionType').value, store: document.getElementById('w-store').value,
    releaseDate: document.getElementById('w-releaseDate').value, image: document.getElementById('w-image').value.trim(),
    status: document.getElementById('w-status').value, 
    note: document.getElementById('w-note').value.trim(), // NOUVEAU
    ...extraData
  });
  document.getElementById('add-wishlist-modal').style.display = 'none'; saveData();
});

document.getElementById('collectionForm')?.addEventListener('submit', (e) => {
  e.preventDefault();
  const platform = document.getElementById('c-platform').value;
  let extraData = { platform };
  
  if (platform === 'Vinyle') {
    extraData.artist = document.getElementById('c-artist')?.value.trim() || '';
    extraData.vinylEdition = document.getElementById('c-vinylEdition')?.value || 'Pochette standard 1 LP';
  } else if (platform === 'Blu-ray') {
    extraData.blurayType = document.getElementById('c-blurayType')?.value || 'Version normale';
    Object.assign(extraData, getAPIFieldsData('c-', platform));
  } else if (platform !== 'Vêtement' && platform !== 'Autre') {
    Object.assign(extraData, getAPIFieldsData('c-', platform));
  }
  
  collection.unshift({
    id: crypto.randomUUID ? crypto.randomUUID() : `c_${Date.now()}`,
    title: document.getElementById('c-title').value.trim(), price: document.getElementById('c-price').value,
    editionType: document.getElementById('c-editionType').value, store: document.getElementById('c-store').value,
    state: document.getElementById('c-state').value, releaseDate: document.getElementById('c-releaseDate').value,
    buyDate: document.getElementById('c-buyDate').value, image: document.getElementById('c-image').value.trim(),
    note: document.getElementById('c-note').value.trim(), photos: [...tempFormPhotos], ...extraData
  });
  document.getElementById('add-collection-modal').style.display = 'none'; saveData();
});

// --- Modification (Edit) ---
window.openEditModal = function(index) {
  const item = wishlist[index];
  document.getElementById('edit-index').value = index; document.getElementById('edit-title').value = item.title;
  document.getElementById('edit-platform').value = item.platform; document.getElementById('edit-price').value = item.price || '';
  document.getElementById('edit-editionType').value = item.editionType || 'Standard'; toggleFormFields('edit-', item.platform, item);
  document.getElementById('edit-store').value = item.store || 'Non renseigné'; document.getElementById('edit-releaseDate').value = item.releaseDate || '';
  document.getElementById('edit-image').value = item.image || ''; updateImagePreview('edit-image', 'edit-preview-wrap', 'edit-preview');
  document.getElementById('edit-status').value = item.status || 'À prendre'; 
  document.getElementById('edit-note').value = item.note || ''; // NOUVEAU
  document.getElementById('edit-modal').style.display = 'flex';
}

window.openEditCollectionModal = function(index) {
  const item = collection[index];
  document.getElementById('edit-c-index').value = index; document.getElementById('edit-c-title').value = item.title;
  document.getElementById('edit-c-platform').value = item.platform; document.getElementById('edit-c-price').value = item.price || '';
  document.getElementById('edit-c-editionType').value = item.editionType || 'Standard'; toggleFormFields('edit-c-', item.platform, item);
  document.getElementById('edit-c-store').value = item.store || 'Non renseigné'; document.getElementById('edit-c-state').value = item.state || '✨ Neuf sous blister';
  document.getElementById('edit-c-releaseDate').value = item.releaseDate || ''; document.getElementById('edit-c-buyDate').value = item.buyDate || '';
  document.getElementById('edit-c-image').value = item.image || ''; updateImagePreview('edit-c-image', 'edit-c-preview-wrap', 'edit-c-preview');
  document.getElementById('edit-c-note').value = item.note || ''; document.getElementById('edit-collection-modal').style.display = 'flex';
}

document.getElementById('btnCloseEditWishlist')?.addEventListener('click', () => document.getElementById('edit-modal').style.display = 'none');
document.getElementById('btnCloseEditCollection')?.addEventListener('click', () => document.getElementById('edit-collection-modal').style.display = 'none');

document.getElementById('btnSaveEditWishlist')?.addEventListener('click', () => {
  const index = parseInt(document.getElementById('edit-index').value, 10);
  if (isNaN(index) || !wishlist[index]) return;
  const platform = document.getElementById('edit-platform').value;
  const oldItem = wishlist[index]; const newImage = document.getElementById('edit-image').value.trim();
  if (oldItem.image && oldItem.image !== newImage && oldItem.image.includes('supabase.co')) { deleteFileFromSupabaseStorage(oldItem.image); }

  let extraData = { platform };
  if (platform === 'Vinyle') {
    extraData.artist = document.getElementById('edit-artist')?.value.trim(); extraData.vinylEdition = document.getElementById('edit-vinylEdition')?.value;
  } else if (platform === 'Blu-ray') {
    extraData.blurayType = document.getElementById('edit-blurayType')?.value; Object.assign(extraData, getAPIFieldsData('edit-', platform));
  } else if (platform !== 'Vêtement' && platform !== 'Autre') {
    Object.assign(extraData, getAPIFieldsData('edit-', platform));
  }
  
  wishlist[index] = {
    ...wishlist[index], title: document.getElementById('edit-title').value.trim(), price: document.getElementById('edit-price').value,
    editionType: document.getElementById('edit-editionType').value, store: document.getElementById('edit-store').value,
    releaseDate: document.getElementById('edit-releaseDate').value, image: newImage, status: document.getElementById('edit-status').value, 
    note: document.getElementById('edit-note').value.trim(), // NOUVEAU
    ...extraData
  };
  document.getElementById('edit-modal').style.display = 'none'; saveData();
});

document.getElementById('btnSaveEditCollection')?.addEventListener('click', () => {
  const index = parseInt(document.getElementById('edit-c-index').value, 10);
  if (isNaN(index) || !collection[index]) return;
  const platform = document.getElementById('edit-c-platform').value;
  const oldItem = collection[index]; const newImage = document.getElementById('edit-c-image').value.trim();
  if (oldItem.image && oldItem.image !== newImage && oldItem.image.includes('supabase.co')) { deleteFileFromSupabaseStorage(oldItem.image); }

  let extraData = { platform };
  if (platform === 'Vinyle') {
    extraData.artist = document.getElementById('edit-c-artist')?.value.trim(); extraData.vinylEdition = document.getElementById('edit-c-vinylEdition')?.value;
  } else if (platform === 'Blu-ray') {
    extraData.blurayType = document.getElementById('edit-c-blurayType')?.value; Object.assign(extraData, getAPIFieldsData('edit-c-', platform));
  } else if (platform !== 'Vêtement' && platform !== 'Autre') {
    Object.assign(extraData, getAPIFieldsData('edit-c-', platform));
  }
  
  collection[index] = {
    ...collection[index], title: document.getElementById('edit-c-title').value.trim(), price: document.getElementById('edit-c-price').value,
    editionType: document.getElementById('edit-c-editionType').value, store: document.getElementById('edit-c-store').value,
    state: document.getElementById('edit-c-state').value, releaseDate: document.getElementById('edit-c-releaseDate').value,
    buyDate: document.getElementById('edit-c-buyDate').value, image: newImage, note: document.getElementById('edit-c-note').value.trim(), ...extraData
  };
  document.getElementById('edit-collection-modal').style.display = 'none'; saveData();
});

document.getElementById('w-platform')?.addEventListener('change', function() { toggleFormFields('w-', this.value); });
document.getElementById('c-platform')?.addEventListener('change', function() { toggleFormFields('c-', this.value); });
document.getElementById('edit-platform')?.addEventListener('change', function() { toggleFormFields('edit-', this.value); });
document.getElementById('edit-c-platform')?.addEventListener('change', function() { toggleFormFields('edit-c-', this.value); });

// --- Onglets ---
function switchTab(tabId) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
  document.getElementById('tabBtn' + tabId).classList.add('active'); document.getElementById('tab-' + tabId.toLowerCase()).classList.add('active');
  if(tabId === 'Wishlist') renderWishlist();
  if(tabId === 'Collection') renderCollection();
}
document.getElementById('tabBtnWishlist')?.addEventListener('click', () => switchTab('Wishlist'));
document.getElementById('tabBtnCollection')?.addEventListener('click', () => switchTab('Collection'));
document.getElementById('tabBtnRandom')?.addEventListener('click', () => switchTab('Random'));

document.getElementById('btnResetPlatform')?.addEventListener('click', () => { 
  document.getElementById('c-filterPlatform').value = 'all'; 
  if(document.getElementById('c-filterGameplay')) document.getElementById('c-filterGameplay').value = 'all';
  if(document.getElementById('c-filterVinylEdition')) document.getElementById('c-filterVinylEdition').value = 'all';
  if(document.getElementById('c-filterBlurayType')) document.getElementById('c-filterBlurayType').value = 'all';
  updateDynamicCollectionFilters(); renderCollection(); 
});

// --- Filtres Helper ---
function checkDateMatch(itemDateStr, filterValue) {
  if (filterValue === 'all') return true; if (filterValue === 'nodate') return !itemDateStr; if (!itemDateStr) return false;
  if (filterValue.startsWith('year_')) return itemDateStr.startsWith(filterValue.split('_')[1]); return itemDateStr.startsWith(filterValue);
}

function sortItems(arr, sortBy, isCollection = false) {
  return arr.slice().sort((a, b) => {
    if (sortBy === 'az') return (a.title || '').localeCompare(b.title || '');
    if (sortBy === 'price-desc') return (parseFloat(b.price) || 0) - (parseFloat(a.price) || 0);
    if (sortBy === 'newest') {
      if (isCollection) {
        const dateA = a.buyDate || a.releaseDate || ''; const dateB = b.buyDate || b.releaseDate || '';
        if (!dateA && !dateB) return 0; if (!dateA) return 1; if (!dateB) return -1;
        return dateB.localeCompare(dateA); 
      } else {
        const dateA = a.releaseDate || '9999-12-31'; const dateB = b.releaseDate || '9999-12-31'; return dateA.localeCompare(dateB);
      }
    } return 0;
  });
}

function populateHierarchicalDropdown(selectElement, datesList, defaultLabel) {
  if(!selectElement) return; const currentVal = selectElement.value; const yearsMap = {};
  datesList.forEach(fullDateStr => {
    if (!fullDateStr) return; const [year, month] = fullDateStr.split('-');
    if (!year || !month) return; if (!yearsMap[year]) yearsMap[year] = new Set(); yearsMap[year].add(month);
  });
  let html = `<option value="all">${defaultLabel}</option><option value="nodate">📅 Sans date fixée</option>`;
  Object.keys(yearsMap).sort().reverse().forEach(year => {
    html += `<option value="year_${year}">📅 ANNÉE ${year}</option>`;
    Array.from(yearsMap[year]).sort().forEach(month => {
      const ym = `${year}-${month}`; const label = new Date(parseInt(year, 10), parseInt(month, 10) - 1, 1).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
      html += `<option value="${ym}">&nbsp;&nbsp;&nbsp;&nbsp;↳ ${label.charAt(0).toUpperCase() + label.slice(1)}</option>`;
    });
  });
  selectElement.innerHTML = html; selectElement.value = Array.from(selectElement.options).some(o => o.value === currentVal) ? currentVal : 'all';
}

function updateMonthFilterDropdowns() {
  populateHierarchicalDropdown(document.getElementById('c-monthFilter'), collection.map(i=>i.buyDate), "Tout l'historique d'achat");
  populateHierarchicalDropdown(document.getElementById('c-releaseFilter'), collection.map(i=>i.releaseDate), "Toutes les sorties");
  populateHierarchicalDropdown(document.getElementById('w-monthFilter'), wishlist.map(i=>i.releaseDate), "Tout le calendrier");
}

// Filtres UI 
document.getElementById('c-filterPlatform')?.addEventListener('change', () => { 
  updateDynamicCollectionFilters();
  if(document.getElementById('c-filterGameplay')) document.getElementById('c-filterGameplay').value = 'all';
  if(document.getElementById('c-filterVinylEdition')) document.getElementById('c-filterVinylEdition').value = 'all';
  if(document.getElementById('c-filterBlurayType')) document.getElementById('c-filterBlurayType').value = 'all';
  renderCollection(); 
});
document.getElementById('c-filterStore')?.addEventListener('change', renderCollection); document.getElementById('c-filterEdition')?.addEventListener('change', renderCollection);
document.getElementById('c-filterState')?.addEventListener('change', renderCollection); document.getElementById('c-filterGameplay')?.addEventListener('change', renderCollection);
document.getElementById('c-filterVinylEdition')?.addEventListener('change', renderCollection); document.getElementById('c-filterBlurayType')?.addEventListener('change', renderCollection);
document.getElementById('c-viewMode')?.addEventListener('change', renderCollection); document.getElementById('c-sortBy')?.addEventListener('change', renderCollection);
document.getElementById('c-monthFilter')?.addEventListener('change', renderCollection); document.getElementById('c-releaseFilter')?.addEventListener('change', renderCollection);
document.getElementById('c-searchBar')?.addEventListener('input', renderCollection);

document.getElementById('w-filterPlatform')?.addEventListener('change', renderWishlist); document.getElementById('w-filterStore')?.addEventListener('change', renderWishlist);
document.getElementById('w-filterStatus')?.addEventListener('change', renderWishlist); document.getElementById('w-filterEdition')?.addEventListener('change', renderWishlist);
document.getElementById('w-monthFilter')?.addEventListener('change', renderWishlist); document.getElementById('w-sortBy')?.addEventListener('change', renderWishlist);
document.getElementById('w-searchBar')?.addEventListener('input', renderWishlist);


// --- Gachapon & Audio ---
function getAudioContext() { if (!audioCtx) { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } if (audioCtx.state === 'suspended') { audioCtx.resume(); } return audioCtx; }
function startPokemonRipSound() { try { const ctx = getAudioContext(); const bufferSize = ctx.sampleRate * 0.25; const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate); const data = buffer.getChannelData(0); for (let i = 0; i < bufferSize; i++) { data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize); } tcgRipOsc = ctx.createBufferSource(); tcgRipOsc.buffer = buffer; tcgRipOsc.loop = true; const filter = ctx.createBiquadFilter(); filter.type = 'bandpass'; filter.frequency.setValueAtTime(3600, ctx.currentTime); filter.Q.setValueAtTime(8, ctx.currentTime); tcgRipGain = ctx.createGain(); tcgRipGain.gain.setValueAtTime(0.01, ctx.currentTime); tcgRipOsc.connect(filter); filter.connect(tcgRipGain); tcgRipGain.connect(ctx.destination); tcgRipOsc.start(); } catch(e) {} }
function updatePokemonRipVolume(progress) { if (tcgRipGain && audioCtx) { const vol = Math.min(Math.max(progress * 0.5, 0.05), 0.45); tcgRipGain.gain.setValueAtTime(vol, audioCtx.currentTime); } }
function stopPokemonRipSound(success) { try { if (tcgRipOsc && tcgRipGain && audioCtx) { if (success) { const osc = audioCtx.createOscillator(); const popGain = audioCtx.createGain(); osc.type = 'triangle'; osc.frequency.setValueAtTime(440, audioCtx.currentTime); osc.frequency.exponentialRampToValueAtTime(110, audioCtx.currentTime + 0.06); popGain.gain.setValueAtTime(0.35, audioCtx.currentTime); popGain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.06); osc.connect(popGain); popGain.connect(audioCtx.destination); osc.start(); osc.stop(audioCtx.currentTime + 0.06); } tcgRipGain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.04); setTimeout(() => { tcgRipOsc.stop(); tcgRipOsc.disconnect(); }, 50); } } catch(e) {} }

function handlePointerDown(e) {
  e.stopPropagation(); const category = e.target.getAttribute('data-cat'); if (!category) return;
  isTopRipActive = true; activeCategory = category; startTopX = e.clientX || (e.touches && e.touches[0].clientX) || 0; currentTopDragX = 0;
  const boosterCard = document.getElementById(`booster-${category}`); if (boosterCard) boosterCard.classList.add('shake');
  startPokemonRipSound(); window.addEventListener('pointermove', onPointerMove); window.addEventListener('pointerup', onPointerUp); window.addEventListener('touchmove', onPointerMove, {passive: false}); window.addEventListener('touchend', onPointerUp);
}

function onPointerMove(moveEvent) {
  if (!isTopRipActive) return; const currentX = moveEvent.clientX || (moveEvent.touches && moveEvent.touches[0].clientX) || 0; currentTopDragX = currentX - startTopX;
  const crimpEl = document.getElementById(`crimp-${activeCategory}`);
  if (currentTopDragX > 0 && crimpEl) { let pull = Math.min(currentTopDragX, 150); crimpEl.style.transform = `translateX(${pull}px)`; crimpEl.style.opacity = `${1 - (pull / 200)}`; updatePokemonRipVolume(pull / 150); }
}

function onPointerUp() {
  if (!isTopRipActive) return; isTopRipActive = false; const boosterCard = document.getElementById(`booster-${activeCategory}`); if (boosterCard) boosterCard.classList.remove('shake');
  const success = currentTopDragX > 40; stopPokemonRipSound(success);
  window.removeEventListener('pointermove', onPointerMove); window.removeEventListener('pointerup', onPointerUp); window.removeEventListener('touchmove', onPointerMove); window.removeEventListener('touchend', onPointerUp);
  const crimpElFinal = document.getElementById(`crimp-${activeCategory}`);
  if (success) {
    const flash = document.getElementById('flash-overlay'); if (flash) { flash.style.display = 'block'; setTimeout(() => { flash.style.display = 'none'; }, 400); }
    if (crimpElFinal) { crimpElFinal.style.transition = 'transform 0.35s ease, opacity 0.35s ease'; crimpElFinal.style.transform = 'translateX(220px) rotate(15deg)'; crimpElFinal.style.opacity = '0'; }
    setTimeout(() => { if (crimpElFinal) { crimpElFinal.style.transform = ''; crimpElFinal.style.opacity = ''; crimpElFinal.style.transition = ''; } triggerGachaponReveal(activeCategory); }, 350);
  } else {
    if (crimpElFinal) { crimpElFinal.style.transition = 'transform 0.3s ease, opacity 0.3s ease'; crimpElFinal.style.transform = 'translateX(0px)'; crimpElFinal.style.opacity = '1'; setTimeout(() => crimpElFinal.style.transition = '', 300); }
  }
}
document.querySelectorAll('.tcg-crimp-top').forEach(el => { el.addEventListener('pointerdown', handlePointerDown); });

function triggerGachaponReveal(category) {
  lastGachaponCategory = category; let pool = [];
  if (category === 'game') pool = collection.filter(i => i.platform !== 'Vinyle' && i.platform !== 'Blu-ray');
  else if (category === 'vinyl') pool = collection.filter(i => i.platform === 'Vinyle');
  else if (category === 'movie') pool = collection.filter(i => i.platform === 'Blu-ray'); else pool = collection;
  if (pool.length === 0) { alert("Aucun objet dans cette catégorie !"); return; }
  const winner = pool[Math.floor(Math.random() * pool.length)]; const index = collection.indexOf(winner);
  document.getElementById('gachaponCoverContainer').innerHTML = winner.image ? `<img src="${escapeHTML(winner.image)}" class="gachapon-cover-large">` : `<div class="gachapon-cover-large">📦</div>`;
  document.getElementById('gachaponTitle').textContent = winner.title;
  document.getElementById('btnGachaponDetail').onclick = () => { document.getElementById('gachapon-modal').style.display = 'none'; window.openCollectionDetail(index); };
  document.getElementById('gachapon-modal').style.display = 'flex';
}
document.getElementById('btnCloseGachapon')?.addEventListener('click', () => document.getElementById('gachapon-modal').style.display = 'none');
document.getElementById('btnGachaponReroll')?.addEventListener('click', () => { document.getElementById('gachapon-modal').style.display = 'none'; triggerGachaponReveal(lastGachaponCategory); });

// Init de base au chargement de la page
window.addEventListener('DOMContentLoaded', () => {
  initDropdowns();
  setupAutocomplete('w-title', 'w-platform', 'w-suggestions', 'w-releaseDate', 'w-image', 'w-preview-wrap', 'w-preview');
  setupAutocomplete('c-title', 'c-platform', 'c-suggestions', 'c-releaseDate', 'c-image', 'c-preview-wrap', 'c-preview');
  setupAutocomplete('edit-title', 'edit-platform', 'edit-suggestions', 'edit-releaseDate', 'edit-image', 'edit-preview-wrap', 'edit-preview');
  setupAutocomplete('edit-c-title', 'edit-c-platform', 'edit-c-suggestions', 'edit-c-releaseDate', 'edit-c-image', 'edit-c-preview-wrap', 'edit-c-preview');
  toggleFormFields('w-', document.getElementById('w-platform')?.value || 'PS5');
  toggleFormFields('c-', document.getElementById('c-platform')?.value || 'PS5');
  updateDynamicCollectionFilters(); checkAuth();
});

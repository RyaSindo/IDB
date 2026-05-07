// ======================= GLOBAL VARIABLES =======================
let users = [], admins = [], films = [], ratings = [], watchlist = [], userProfiles = {}, reports = [];
let actors = [], actorRatingsByUser = [];
let currentUser = null, isAdminLoggedIn = false, currentView = "beranda";
let searchQuery = "", actorSearchQuery = "";
let currentToken = localStorage.getItem("idb_token");
let socket = null;
let currentFilmId = null;
let currentRating = 7;
let tempPosterImage = null;
let tempAvatarImage = null;

// ======================= SOCKET.IO REAL-TIME =======================
function initSocket() {
    socket = io({ transports: ['polling'] });
    
    socket.on('connect', () => {
        console.log('✅ Real-time connected');
        showRealtimeBadge();
    });
    
    socket.on('film-rating-updated', (data) => {
        console.log('📊 Film rating updated', data);
        if (currentView === 'beranda' || currentView === 'toprating') refreshCurrentView();
        if (currentFilmId === data.filmId) updateModalRating(data);
        showRealtimeNotification(`⭐ Rating "${data.filmTitle}" diperbarui! Rata-rata: ${data.newAvg}/10`, 'info');
    });
    
    socket.on('actor-added', (data) => {
        console.log('⭐ Actor added:', data.actor);
        showRealtimeNotification(`Aktor baru: ${data.actor.name}`, 'success');
        if (currentView === 'topactors') refreshCurrentView();
    });
    socket.on('actor-updated', (data) => {
        console.log('📝 Actor updated:', data.actor);
        showRealtimeNotification(`Aktor "${data.actor.name}" diperbarui`, 'info');
        if (currentView === 'topactors') refreshCurrentView();
    });
    socket.on('actor-deleted', (data) => {
        console.log('🗑️ Actor deleted:', data.actorName);
        showRealtimeNotification(`Aktor "${data.actorName}" dihapus`, 'warning');
        if (currentView === 'topactors') refreshCurrentView();
    });
    socket.on('actor-rating-updated', (data) => {
        console.log('⭐ Actor rating updated', data);
        if (currentView === 'topactors') refreshCurrentView();
        showRealtimeNotification(`⭐ Rating ${data.actorName} diperbarui! Rata-rata: ${data.newAvg}/5`, 'success');
    });
    
    socket.on('new-comment', (data) => {
        console.log('💬 New comment', data);
        if (currentFilmId === data.filmId && document.getElementById('filmModal')) {
            addCommentToUI(data);
        }
        showRealtimeNotification(`💬 Komentar baru dari ${data.displayName}`, 'info');
    });
    
    socket.on('data-updated', (data) => {
        console.log('🔄 Database updated');
        showRealtimeNotification('Data diperbarui oleh pengguna lain', 'info');
        refreshCurrentView();
    });
    socket.on('global-refresh', () => {
        console.log('🌐 Global refresh');
        refreshCurrentView();
    });
    
    socket.on('film-added', (data) => {
        console.log('🎬 Film added:', data.film);
        showRealtimeNotification(`Film baru: ${data.film.title}`, 'success');
        refreshCurrentView();
    });
    socket.on('film-updated', (data) => {
        console.log('📝 Film updated:', data.film);
        showRealtimeNotification(`Film "${data.film.title}" diperbarui`, 'info');
        refreshCurrentView();
    });
    socket.on('film-deleted', (data) => {
        console.log('🗑️ Film deleted:', data.filmTitle);
        showRealtimeNotification(`Film "${data.filmTitle}" dihapus`, 'warning');
        refreshCurrentView();
    });
    
    socket.on('watchlist-updated', (data) => {
        if (data.userId === (currentUser || 'admin')) {
            showRealtimeNotification(data.action === 'added' ? 'Film ditambahkan ke watchlist' : 'Film dihapus dari watchlist', 'info');
            if (currentView === 'watchlist') refreshCurrentView();
        }
    });
    socket.on('profile-updated', (data) => {
        if (data.userId === (currentUser || 'admin')) {
            showRealtimeNotification('Profil Anda diperbarui', 'success');
            updateUI();
        }
        if (currentView === 'profile') refreshCurrentView();
    });
    
    socket.on('show-toast', (data) => {
        showToast(data.message, data.type);
    });
    
    socket.on('disconnect', (reason) => {
        console.log('❌ Real-time disconnected:', reason);
        const badge = document.querySelector('.realtime-badge');
        if (badge) badge.remove();
        showRealtimeNotification('Koneksi real-time terputus, mencoba menyambung...', 'warning');
    });
    socket.on('reconnect', () => {
        console.log('✅ Real-time reconnected');
        showRealtimeBadge();
        showRealtimeNotification('Koneksi real-time tersambung kembali!', 'success');
        refreshCurrentView();
    });
}

async function refreshCurrentView() {
    await loadData(true);
    render();
}

function updateModalRating(data) {
    const avgEl = document.querySelector('.modal-avg-rating');
    if (avgEl) {
        avgEl.innerHTML = `⭐ Rata-rata: ${data.newAvg}/10 (${data.totalRatings} rating)`;
        avgEl.style.backgroundColor = '#fef3c7';
        setTimeout(() => { if (avgEl) avgEl.style.backgroundColor = ''; }, 500);
    }
}

function showRealtimeNotification(message, type = 'info') {
    const oldNotif = document.querySelector('.realtime-notification');
    if (oldNotif) oldNotif.remove();
    const notification = document.createElement('div');
    notification.className = `realtime-notification ${type}`;
    notification.innerHTML = `
        <div class="notification-content">
            <i class="fas ${type === 'success' ? 'fa-check-circle' : (type === 'warning' ? 'fa-exclamation-triangle' : 'fa-info-circle')}"></i>
            <span>${message}</span>
        </div>
        <div class="notification-progress"></div>
    `;
    document.body.appendChild(notification);
    setTimeout(() => notification.classList.add('show'), 10);
    setTimeout(() => {
        notification.classList.remove('show');
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

function showRealtimeBadge() {
    if (document.querySelector('.realtime-badge')) return;
    const badge = document.createElement('div');
    badge.className = 'realtime-badge online';
    badge.innerHTML = '<i class="fas fa-sync-alt fa-fw fa-spin"></i> Live Updates <span class="status-dot"></span>';
    badge.onclick = () => showRealtimeNotification('Koneksi real-time aktif!', 'success');
    document.body.appendChild(badge);
}

// ======================= API HELPERS =======================
async function apiCall(url, options = {}) {
    try {
        const res = await fetch(url, {
            ...options,
            headers: { 'Content-Type': 'application/json', ...options.headers }
        });
        return await res.json();
    } catch (error) {
        console.error("API Error:", error);
        showToast("Koneksi server gagal!", "error");
        return null;
    }
}

let lastDataLoad = 0;
async function loadData(force = false) {
    const now = Date.now();
    if (!force && now - lastDataLoad < 1000) return;
    try {
        const data = await apiCall('/api/all-data');
        if (data) {
            users = data.users || [];
            admins = data.admins || [];
            films = data.films || [];
            ratings = data.ratings || [];
            watchlist = data.watchlist || [];
            userProfiles = data.userProfiles || {};
            reports = data.reports || [];
            actors = data.actors || [];
            actorRatingsByUser = data.actorRatingsByUser || [];
            
            if (currentToken) {
                const session = await apiCall('/api/session', { headers: { 'Authorization': currentToken } });
                if (session && session.loggedIn) {
                    if (session.isAdmin) { isAdminLoggedIn = true; currentUser = null; }
                    else { currentUser = session.username; isAdminLoggedIn = false; }
                } else {
                    currentToken = null;
                    localStorage.removeItem("idb_token");
                }
            }
            updateUI();
            updateStats();
            render();
            lastDataLoad = now;
        }
    } catch (e) {
        console.error(e);
        showToast("Gagal memuat data!", "error");
    }
}

function showToast(msg, type = "info") {
    const toast = document.createElement("div");
    toast.className = `toast ${type}`;
    toast.innerHTML = msg;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 2500);
}

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>]/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[m]));
}

function getProfile(id) {
    if (!userProfiles[id]) userProfiles[id] = { displayName: id === "admin" ? "Administrator" : id, avatarValue: null, bio: "Pecinta film 🎬", top3Films: [] };
    return userProfiles[id];
}

function getAvgRating(fid) {
    if (!fid) return null;
    const fidStr = fid.toString();
    const fr = ratings.filter(r => r.filmId && r.filmId.toString() === fidStr);
    if (fr.length === 0) return null;
    return (fr.reduce((a, b) => a + b.rating, 0) / fr.length).toFixed(1);
}

function getUserRating(fid, uid) {
    if (!fid || !uid) return null;
    const fidStr = fid.toString();
    const uidStr = uid.toString();
    return ratings.find(r => r.filmId && r.filmId.toString() === fidStr && r.userId && r.userId.toString() === uidStr);
}

function getTopActors() {
    const map = {};
    actorRatingsByUser.forEach(r => {
        if (!map[r.actorName]) map[r.actorName] = { total: 0, count: 0 };
        map[r.actorName].total += r.rating;
        map[r.actorName].count++;
    });
    return actors.map(a => ({
        ...a,
        avgRating: map[a.name] ? (map[a.name].total / map[a.name].count).toFixed(1) : "0.0",
        ratingCount: map[a.name]?.count || 0,
        userRating: actorRatingsByUser.find(r => r.actorName === a.name && r.userId === (isAdminLoggedIn ? "admin" : currentUser))
    })).sort((a, b) => parseFloat(b.avgRating) - parseFloat(a.avgRating));
}

function isInWatchlist(uid, fid) {
    if (!uid || !fid) return false;
    const uidStr = uid.toString();
    const fidStr = fid.toString();
    return watchlist.some(w => w.userId && w.userId.toString() === uidStr && w.filmId && w.filmId.toString() === fidStr);
}

// ======================= AUTH =======================
async function doLogin() {
    const username = document.getElementById("loginUsername").value.trim();
    const password = document.getElementById("loginPassword").value;
    if (!username || !password) { showToast("Isi semua field!", "error"); return; }
    const res = await apiCall('/api/users/login', { method: 'POST', body: JSON.stringify({ username, password }) });
    if (res?.success) {
        currentToken = res.token;
        localStorage.setItem("idb_token", currentToken);
        if (res.user.isAdmin) { isAdminLoggedIn = true; currentUser = null; }
        else { currentUser = res.user.username; isAdminLoggedIn = false; }
        await loadData(true);
        closeAuthModal();
        showToast(`Selamat datang, ${res.user.displayName}!`, "success");
        render();
    } else showToast(res?.message || "Login gagal!", "error");
}

async function doRegister() {
    const username = document.getElementById("regUsername").value.trim();
    const password = document.getElementById("regPassword").value;
    const confirm = document.getElementById("regConfirmPassword").value;
    const displayName = document.getElementById("regDisplayName").value.trim() || username;
    if (username.length < 3) { showToast("Username minimal 3 karakter!", "error"); return; }
    if (password.length < 6) { showToast("Password minimal 6 karakter!", "error"); return; }
    if (password !== confirm) { showToast("Password tidak cocok!", "error"); return; }
    const res = await apiCall('/api/users/register', { method: 'POST', body: JSON.stringify({ username, password, displayName }) });
    if (res?.success) { showToast("Registrasi berhasil! Silakan login.", "success"); showLoginForm(); }
    else showToast(res?.message || "Registrasi gagal!", "error");
}

async function logout() {
    if (currentToken) await apiCall('/api/users/logout', { method: 'POST', body: JSON.stringify({ token: currentToken }) });
    currentToken = null;
    localStorage.removeItem("idb_token");
    currentUser = null;
    isAdminLoggedIn = false;
    await loadData(true);
    showToast("Logout berhasil.", "info");
}

// ======================= FILM CRUD =======================
async function addNewFilm() {
    if (!isAdminLoggedIn) return;
    const title = document.getElementById("newFilmTitle")?.value.trim();
    const year = parseInt(document.getElementById("newFilmYear")?.value);
    const trailer = document.getElementById("newFilmTrailer")?.value.trim();
    const synopsis = document.getElementById("newFilmSynopsis")?.value.trim();
    const actorsStr = document.getElementById("newFilmActors")?.value.trim();
    const actorsList = actorsStr ? actorsStr.split(",").map(a => a.trim()) : [];
    let poster = document.getElementById("newFilmPoster")?.value.trim();
    if (!title || !year || !poster || !trailer || !synopsis) { showToast("Semua field harus diisi!", "error"); return; }
    if (tempPosterImage) {
        const up = await apiCall('/api/upload-poster', { method: 'POST', body: JSON.stringify({ image: tempPosterImage }) });
        if (up?.success) poster = up.imageUrl;
    }
    const res = await apiCall('/api/films', { method: 'POST', body: JSON.stringify({ title, year, poster, trailer, synopsis, actors: actorsList }) });
    if (res?.success) { await loadData(true); closeAddFilmModal(); showToast(`Film "${title}" ditambahkan!`, "success"); render(); }
    else showToast("Gagal menambah film!", "error");
}

async function updateFilm() {
    if (!isAdminLoggedIn) return;
    const id = document.getElementById("editFilmId")?.value; // string, tidak perlu parseInt
    const title = document.getElementById("editFilmTitle")?.value.trim();
    const year = parseInt(document.getElementById("editFilmYear")?.value);
    const trailer = document.getElementById("editFilmTrailer")?.value.trim();
    const synopsis = document.getElementById("editFilmSynopsis")?.value.trim();
    const actorsStr = document.getElementById("editFilmActors")?.value.trim();
    const actorsList = actorsStr ? actorsStr.split(",").map(a => a.trim()) : [];
    let poster = document.getElementById("editFilmPoster")?.value.trim();
    if (tempPosterImage) {
        const up = await apiCall('/api/upload-poster', { method: 'POST', body: JSON.stringify({ image: tempPosterImage }) });
        if (up?.success) poster = up.imageUrl;
    }
    const res = await apiCall(`/api/films/${id}`, { method: 'PUT', body: JSON.stringify({ title, year, poster, trailer, synopsis, actors: actorsList }) });
    if (res?.success) { await loadData(true); closeEditFilmModal(); showToast(`Film "${title}" diperbarui!`, "success"); render(); }
    else showToast("Gagal update film!", "error");
}

async function adminDeleteFilm(id) {
    if (!isAdminLoggedIn) return;
    if (!confirm("Hapus film ini?")) return;
    const res = await apiCall(`/api/films/${id}`, { method: 'DELETE' });
    if (res?.success) { await loadData(true); showToast("Film dihapus!", "success"); render(); }
    else showToast("Gagal menghapus film!", "error");
}

// ======================= RATINGS =======================
async function addRating(fid, uid, rating, comment) {
    const res = await apiCall('/api/ratings', { method: 'POST', body: JSON.stringify({ filmId: fid, userId: uid, rating, comment }) });
    if (res?.success) { await loadData(true); showToast("Rating disimpan!", "success"); }
    else showToast("Gagal menyimpan rating!", "error");
}
async function deleteRating(fid, uid) {
    const res = await apiCall('/api/ratings', { method: 'DELETE', body: JSON.stringify({ filmId: fid, userId: uid }) });
    if (res?.success) { await loadData(true); showToast("Rating dihapus!", "info"); }
    else showToast("Gagal menghapus rating!", "error");
}

// ==================== ACTORS ====================
async function addNewActor() {
    if (!isAdminLoggedIn) return;
    const name = document.getElementById("newActorName")?.value.trim();
    const bio = document.getElementById("newActorBio")?.value.trim();
    const photoUrl = document.getElementById("newActorPhotoUrl")?.value.trim();
    if (!name) { showToast("Nama aktor harus diisi!", "error"); return; }
    const res = await apiCall('/api/actors', { method: 'POST', body: JSON.stringify({ name, bio, photo: photoUrl }) });
    if (res?.success) { await loadData(true); closeAddActorModal(); showToast(`Aktor "${name}" ditambahkan!`, "success"); render(); }
    else showToast(res?.message || "Gagal menambah aktor!", "error");
}
async function updateActor() {
    if (!isAdminLoggedIn) return;
    const id = document.getElementById("editActorId")?.value;
    const name = document.getElementById("editActorName")?.value.trim();
    const bio = document.getElementById("editActorBio")?.value.trim();
    const photoUrl = document.getElementById("editActorPhotoUrl")?.value.trim();
    const res = await apiCall(`/api/actors/${id}`, { method: 'PUT', body: JSON.stringify({ name, bio, photo: photoUrl }) });
    if (res?.success) { await loadData(true); closeEditActorModal(); showToast(`Aktor "${name}" diperbarui!`, "success"); render(); }
    else showToast("Gagal update aktor!", "error");
}
async function adminDeleteActor(actorName) {
    if (!isAdminLoggedIn) return;
    if (!confirm(`Hapus aktor "${actorName}"?`)) return;
    const actor = actors.find(a => a.name === actorName);
    if (!actor) return;
    const res = await apiCall(`/api/actors/${actor.id}`, { method: 'DELETE' });
    if (res?.success) { await loadData(true); showToast(`Aktor "${actorName}" dihapus!`, "success"); render(); }
    else showToast("Gagal menghapus aktor!", "error");
}
async function rateActor(actorName, rating) {
    if (!currentUser && !isAdminLoggedIn) { showToast("Login dulu!", "error"); showAuthModal(); return; }
    const userId = isAdminLoggedIn ? "admin" : currentUser;
    const res = await apiCall('/api/actor-ratings', { method: 'POST', body: JSON.stringify({ actorName, userId, rating }) });
    if (res?.success) { showToast(`⭐ ${actorName}: ${rating}/5 bintang!`, "success"); if (currentView === 'topactors') renderTopActors(); }
    else showToast("Gagal menyimpan rating!", "error");
}

// ==================== WATCHLIST ====================
async function toggleWatchlist(uid, fid) {
    const res = await apiCall('/api/watchlist/toggle', { method: 'POST', body: JSON.stringify({ userId: uid, filmId: fid }) });
    if (res?.success) { await loadData(true); showToast(res.action === 'added' ? "Ditambahkan ke watchlist!" : "Dihapus dari watchlist!", "success"); render(); }
    else showToast("Gagal toggle watchlist!", "error");
}

// ==================== PROFILE ====================
async function saveProfile() {
    const userId = isAdminLoggedIn ? "admin" : currentUser;
    const displayName = document.getElementById("settingDisplayName")?.value;
    const bio = document.getElementById("settingBio")?.value;
    const top1 = document.getElementById("top1Select")?.value;
    const top2 = document.getElementById("top2Select")?.value;
    const top3 = document.getElementById("top3Select")?.value;
    const top3Films = [top1, top2, top3].filter(id => id && !isNaN(id));
    let avatarValue = null;
    if (tempAvatarImage) {
        const up = await apiCall('/api/upload-profile', { method: 'POST', body: JSON.stringify({ image: tempAvatarImage }) });
        if (up?.success) avatarValue = up.imageUrl;
        else avatarValue = tempAvatarImage;
    }
    const res = await apiCall(`/api/profiles/${userId}`, { method: 'PUT', body: JSON.stringify({ displayName, avatarValue, bio, top3Films }) });
    if (res?.success) { await loadData(true); closeSettingModal(); updateUI(); showToast("Profil disimpan!", "success"); render(); }
    else showToast("Gagal menyimpan profil!", "error");
}

// ==================== RENDER FUNCTIONS ====================
function renderBeranda() {
    let filtered = films;
    if (searchQuery) {
        filtered = films.filter(f => f.title.toLowerCase().includes(searchQuery.toLowerCase()));
    }
    
    let html = `
        <div class="film-slider-section">
            <h2>🔥 Film Populer</h2>
            <div class="film-slider" style="display:flex; gap:20px; overflow-x:auto; padding:10px 0;">
                ${films.slice(0, 10).map(f => {
                    const avg = getAvgRating(f.id);
                    return `
                        <div class="film-card" style="flex:0 0 180px; background:white; border-radius:12px; overflow:hidden; cursor:pointer; position:relative;" onclick="openFilmModal('${f.id}')">
                            <img class="poster-img" src="${f.posterUrl}" onerror="this.src='https://via.placeholder.com/180x250?text=No+Image'" style="width:100%; height:250px; object-fit:cover;">
                            <div class="poster-info" style="padding:10px;">
                                <div class="poster-title" style="font-weight:600;">${escapeHtml(f.title)}</div>
                                <div class="poster-year" style="font-size:12px; color:#666;">${f.year}</div>
                                <div class="poster-rating" style="color:#f59e0b;">⭐ ${avg || '-'}/10</div>
                            </div>
                            ${isAdminLoggedIn ? `
                                <div class="admin-card-actions" style="position:absolute; top:8px; right:8px; display:flex; gap:5px; opacity:0; transition:opacity 0.2s;">
                                    <button class="admin-edit-card-btn" onclick="event.stopPropagation(); openEditFilmModal('${f.id}')" style="background:rgba(0,0,0,0.7); border:none; width:28px; height:28px; border-radius:50%; color:white;">✏️</button>
                                    <button class="admin-delete-card-btn" onclick="event.stopPropagation(); adminDeleteFilm('${f.id}')" style="background:rgba(0,0,0,0.7); border:none; width:28px; height:28px; border-radius:50%; color:white;">🗑️</button>
                                </div>
                            ` : ''}
                        </div>
                    `;
                }).join('')}
            </div>
        </div>
        <hr>
        <h2>🎬 Semua Film</h2>
        <div class="search-bar" style="display:flex; gap:10px; margin:20px 0;">
            <input type="text" class="search-input" id="searchInput" placeholder="Cari film..." value="${escapeHtml(searchQuery)}" style="flex:1; padding:10px 16px; border:1px solid #ddd; border-radius:40px;">
            <button onclick="clearSearch()" style="background:#e2e8f0; border:none; padding:0 20px; border-radius:40px; cursor:pointer;">Hapus</button>
        </div>
        <div class="film-grid" style="display:grid; grid-template-columns:repeat(auto-fill, minmax(180px,1fr)); gap:20px;">
            ${filtered.map(f => {
                const avg = getAvgRating(f.id);
                return `
                    <div class="film-poster-card" style="background:white; border-radius:12px; overflow:hidden; cursor:pointer; position:relative;" onclick="openFilmModal('${f.id}')">
                        <img class="poster-img" src="${f.posterUrl}" onerror="this.src='https://via.placeholder.com/180x250?text=No+Image'" style="width:100%; height:250px; object-fit:cover;">
                        <div class="poster-info" style="padding:10px;">
                            <div class="poster-title" style="font-weight:600;">${escapeHtml(f.title)}</div>
                            <div class="poster-year" style="font-size:12px; color:#666;">${f.year}</div>
                            <div class="poster-rating" style="color:#f59e0b;">⭐ ${avg || '-'}/10</div>
                        </div>
                        ${isAdminLoggedIn ? `
                            <div class="admin-card-actions" style="position:absolute; top:8px; right:8px; display:flex; gap:5px; opacity:0; transition:opacity 0.2s;">
                                <button class="admin-edit-card-btn" onclick="event.stopPropagation(); openEditFilmModal('${f.id}')" style="background:rgba(0,0,0,0.7); border:none; width:28px; height:28px; border-radius:50%; color:white;">✏️</button>
                                <button class="admin-delete-card-btn" onclick="event.stopPropagation(); adminDeleteFilm('${f.id}')" style="background:rgba(0,0,0,0.7); border:none; width:28px; height:28px; border-radius:50%; color:white;">🗑️</button>
                            </div>
                        ` : ''}
                    </div>
                `;
            }).join('')}
        </div>
    `;
    document.getElementById("mainContent").innerHTML = html;
    
    const searchInput = document.getElementById("searchInput");
    if (searchInput) {
        searchInput.oninput = (e) => { searchQuery = e.target.value; renderBeranda(); };
    }
}

function renderTopRating() {
    const topFilms = films.map(f => ({
        ...f,
        avg: parseFloat(getAvgRating(f.id)) || 0,
        cnt: ratings.filter(r => r.filmId && r.filmId.toString() === f.id.toString()).length
    })).filter(f => f.cnt > 0).sort((a, b) => b.avg - a.avg);
    
    if (topFilms.length === 0) {
        document.getElementById("mainContent").innerHTML = `<div style="text-align:center;padding:50px;">Belum ada rating. Jadilah yang pertama!</div>`;
        return;
    }
    
    const top3 = topFilms.slice(0, 3);
    const rest = topFilms.slice(3);
    const medals = ['🥇', '🥈', '🥉'];
    const rankClasses = ['rank-1', 'rank-2', 'rank-3'];
    
    let html = `<div class="top3-container" style="display:grid; grid-template-columns:repeat(auto-fit, minmax(250px,1fr)); gap:20px; margin-bottom:30px;">`;
    top3.forEach((f, i) => {
        html += `
            <div class="top-card ${rankClasses[i]}" style="background:white; border-radius:16px; overflow:hidden; cursor:pointer; position:relative; ${i===0?'border:2px solid #FFD700':(i===1?'border:2px solid #C0C0C0':'border:2px solid #CD7F32')}" onclick="openFilmModal('${f.id}')">
                <div class="top-card-rank" style="position:absolute; top:10px; left:10px; width:40px; height:40px; border-radius:50%; background:white; display:flex; align-items:center; justify-content:center; font-size:24px;">${medals[i]}</div>
                <img class="top-card-poster" src="${f.posterUrl}" style="width:100%; height:250px; object-fit:cover;">
                <div class="top-card-info" style="padding:12px; text-align:center;">
                    <div class="top-card-title" style="font-weight:bold;">${escapeHtml(f.title)}</div>
                    <div class="top-card-year" style="font-size:12px; color:#666;">${f.year}</div>
                    <div class="top-card-rating" style="font-size:20px; font-weight:bold; color:#f59e0b;">⭐ ${f.avg}/10</div>
                    <div style="font-size:12px;">${f.cnt} rating</div>
                </div>
            </div>
        `;
    });
    html += `</div>`;
    
    if (rest.length) {
        html += `<h3>Peringkat Selanjutnya</h3><div class="film-grid" style="display:grid; grid-template-columns:repeat(auto-fill, minmax(180px,1fr)); gap:20px;">`;
        rest.forEach((f, i) => {
            html += `
                <div class="film-poster-card" style="background:white; border-radius:12px; overflow:hidden; cursor:pointer; position:relative;" onclick="openFilmModal('${f.id}')">
                    <div class="rank-badge" style="position:absolute; top:8px; left:8px; width:30px; height:30px; border-radius:50%; background:#475569; color:white; display:flex; align-items:center; justify-content:center; font-weight:bold;">${i+4}</div>
                    <img class="poster-img" src="${f.posterUrl}" style="width:100%; height:250px; object-fit:cover;">
                    <div class="poster-info" style="padding:10px;">
                        <div class="poster-title" style="font-weight:600;">${escapeHtml(f.title)}</div>
                        <div class="poster-rating" style="color:#f59e0b;">⭐ ${f.avg}/10</div>
                    </div>
                </div>
            `;
        });
        html += `</div>`;
    }
    document.getElementById("mainContent").innerHTML = html;
}

function renderTopActors() {
    const all = getTopActors();
    const filtered = actorSearchQuery ? all.filter(a => a.name.toLowerCase().includes(actorSearchQuery.toLowerCase())) : all;
    const isLoggedIn = !!(currentUser || isAdminLoggedIn);
    
    let html = `
        <h2>⭐ Top Aktor</h2>
        <p style="color:#666; margin-bottom:16px;">Rating berdasarkan bintang dari komunitas (Real-time)</p>
        <div class="search-bar" style="display:flex; gap:10px; margin:20px 0;">
            <input type="text" class="search-input" id="actorSearch" placeholder="Cari aktor..." value="${escapeHtml(actorSearchQuery)}" style="flex:1; padding:10px 16px; border:1px solid #ddd; border-radius:40px;">
            <button onclick="actorSearchQuery='';renderTopActors()" style="background:#e2e8f0; border:none; padding:0 20px; border-radius:40px; cursor:pointer;">Hapus</button>
            ${isAdminLoggedIn ? `<button onclick="openAddActorModal()" class="login-btn" style="background:#f59e0b; border:none; padding:8px 20px; border-radius:40px; cursor:pointer;">Tambah Aktor</button>` : ''}
        </div>
        <div class="actors-grid" style="display:grid; grid-template-columns:repeat(auto-fill, minmax(300px,1fr)); gap:16px;">
    `;
    
    filtered.forEach((a, i) => {
        const medal = i === 0 ? '🥇' : (i === 1 ? '🥈' : (i === 2 ? '🥉' : `#${i+1}`));
        html += `
            <div class="actor-card" style="background:white; border-radius:16px; padding:16px; display:flex; gap:16px; cursor:pointer; transition:all 0.2s;">
                <img class="actor-avatar-circle" src="${a.photoUrl}" onerror="this.src='https://ui-avatars.com/api/?name=${a.name}&background=667eea&color=fff'" style="width:70px; height:70px; border-radius:50%; object-fit:cover;">
                <div class="actor-info-modern" style="flex:1;">
                    <div class="actor-name-modern" style="font-size:18px; font-weight:bold;">${medal} ${escapeHtml(a.name)}</div>
                    <div class="actor-bio-modern" style="font-size:12px; color:#666; margin:4px 0;">${escapeHtml(a.bio)}</div>
                    <div style="display:flex; gap:16px; margin:8px 0;">
                        <div>⭐ ${a.avgRating}/5</div>
                        <div>👤 ${a.ratingCount} rating</div>
                    </div>
                    ${isLoggedIn ? `
                        <div class="actor-stars-modern" style="display:flex; gap:5px;">
                            ${[1,2,3,4,5].map(s => `<i class="fas fa-star actor-star-modern" style="font-size:20px; cursor:pointer; color:${a.userRating?.rating >= s ? '#f59e0b' : '#cbd5e0'};" onclick="event.stopPropagation(); rateActor('${escapeHtml(a.name)}', ${s})"></i>`).join('')}
                        </div>
                    ` : `<button onclick="event.stopPropagation(); showAuthModal()" class="login-btn" style="margin-top:8px; background:#667eea; color:white; border:none; padding:6px 16px; border-radius:40px;">Login untuk Rating</button>`}
                    ${isAdminLoggedIn ? `
                        <div style="margin-top:8px; display:flex; gap:8px;">
                            <button onclick="event.stopPropagation(); openEditActorModal('${escapeHtml(a.name)}')" class="login-btn" style="background:#f59e0b; border:none; padding:6px 12px; border-radius:40px; color:white;">Edit</button>
                            <button onclick="event.stopPropagation(); adminDeleteActor('${escapeHtml(a.name)}')" class="logout-btn" style="background:transparent; border:1px solid #e2e8f0; padding:6px 12px; border-radius:40px; cursor:pointer; color:#e53e3e;">Hapus</button>
                        </div>
                    ` : ''}
                </div>
            </div>
        `;
    });
    html += `</div>`;
    document.getElementById("mainContent").innerHTML = html;
    
    const as = document.getElementById("actorSearch");
    if (as) as.oninput = (e) => { actorSearchQuery = e.target.value; renderTopActors(); };
}

function renderWatchlist() {
    if (!currentUser && !isAdminLoggedIn) {
        document.getElementById("mainContent").innerHTML = `<div style="text-align:center;padding:50px;"><p>Login dulu untuk melihat watchlist!</p><button class="login-btn" onclick="showAuthModal()" style="background:#667eea; color:white; border:none; padding:10px 20px; border-radius:40px;">Login</button></div>`;
        return;
    }
    const uid = isAdminLoggedIn ? "admin" : currentUser;
    const wl = watchlist.filter(w => w.userId && w.userId.toString() === uid.toString());
    if (wl.length === 0) {
        document.getElementById("mainContent").innerHTML = `<div style="text-align:center;padding:50px;"><h2>Watchlist Kosong</h2><p>Tambahkan film ke watchlist dari halaman film.</p></div>`;
        return;
    }
    
    let html = `<h2>📌 Watchlist Saya</h2><div class="film-grid" style="display:grid; grid-template-columns:repeat(auto-fill, minmax(180px,1fr)); gap:20px;">`;
    wl.forEach(w => {
        const film = films.find(f => f.id === w.filmId.toString());
        if (film) {
            html += `
                <div class="film-poster-card" style="background:white; border-radius:12px; overflow:hidden; cursor:pointer; position:relative;" onclick="openFilmModal('${film.id}')">
                    <img class="poster-img" src="${film.posterUrl}" style="width:100%; height:250px; object-fit:cover;">
                    <div class="poster-info" style="padding:10px;">
                        <div class="poster-title" style="font-weight:600;">${escapeHtml(film.title)}</div>
                        <div class="poster-year" style="font-size:12px; color:#666;">${film.year}</div>
                        <button class="logout-btn" style="margin-top:8px; width:100%; background:transparent; border:1px solid #e2e8f0; padding:5px 10px; border-radius:40px; cursor:pointer; color:#e53e3e;" onclick="event.stopPropagation(); toggleWatchlist('${uid}', '${film.id}')">Hapus</button>
                    </div>
                </div>
            `;
        }
    });
    html += `</div>`;
    document.getElementById("mainContent").innerHTML = html;
}

function renderProfile() {
    if (!currentUser && !isAdminLoggedIn) {
        document.getElementById("mainContent").innerHTML = `<div style="text-align:center;padding:50px;"><p>Login dulu untuk melihat profil!</p><button class="login-btn" onclick="showAuthModal()" style="background:#667eea; color:white; border:none; padding:10px 20px; border-radius:40px;">Login</button></div>`;
        return;
    }
    viewProfile(isAdminLoggedIn ? "admin" : currentUser);
}

function viewProfile(uid) {
    const prof = getProfile(uid);
    const userRatings = ratings.filter(r => r.userId && r.userId.toString() === uid.toString());
    const avatar = prof.avatarValue ? `<img src="${prof.avatarValue}" style="width:80px;height:80px;border-radius:50%;margin-bottom:10px;">` : `<i class="fas fa-user-circle" style="font-size:70px;"></i>`;
    
    let html = `
        <button class="back-btn" onclick="renderProfile()" style="background:#e2e8f0; border:none; padding:8px 20px; border-radius:40px; cursor:pointer; margin-bottom:16px;">← Kembali</button>
        <div style="text-align:center;">
            ${avatar}
            <h2>${escapeHtml(prof.displayName)}</h2>
            <p style="color:#666;">${escapeHtml(prof.bio)}</p>
            ${(currentUser === uid || isAdminLoggedIn) ? `<button class="login-btn" onclick="openSettingModal()" style="margin-top:10px; background:#667eea; color:white; border:none; padding:8px 20px; border-radius:40px; cursor:pointer;">Edit Profil</button>` : ''}
        </div>
        <hr style="margin:20px 0;">
        <h3>🏆 Top 3 Film</h3>
        <div class="film-grid" style="display:grid; grid-template-columns:repeat(auto-fill, minmax(180px,1fr)); gap:20px;">
            ${prof.top3Films.map(id => {
                const f = films.find(f => f.id === id);
                return f ? `<div class="film-poster-card" style="background:white; border-radius:12px; overflow:hidden; cursor:pointer;" onclick="openFilmModal('${f.id}')"><img class="poster-img" src="${f.posterUrl}" style="width:100%; height:250px; object-fit:cover;"><div class="poster-info" style="padding:10px;"><div class="poster-title" style="font-weight:600;">${escapeHtml(f.title)}</div></div></div>` : '';
            }).join('') || '<p style="color:#999;">Belum memilih top 3 film</p>'}
        </div>
        <h3>⭐ Rating & Komentar</h3>
        ${userRatings.map(r => {
            const f = films.find(f => f.id === r.filmId.toString());
            return f ? `<div class="review-item" style="background:#f8fafc; padding:12px; border-radius:12px; margin-bottom:10px;"><strong>${escapeHtml(f.title)}</strong><br>⭐ ${r.rating}/10<br>"${escapeHtml(r.comment)}"</div>` : '';
        }).join('') || '<p style="color:#999;">Belum memberi rating</p>'}
    `;
    document.getElementById("mainContent").innerHTML = html;
}

function renderAbout() {
    document.getElementById("mainContent").innerHTML = `
        <div style="max-width:800px;margin:0 auto;">
            <div style="background:linear-gradient(135deg,#667eea,#764ba2);border-radius:30px;padding:40px;text-align:center;color:white;">
                <h1><i class="fas fa-film"></i> IDB</h1>
                <p>Indie Database Film | Temukan & Rating Film Independen</p>
            </div>
            <div style="background:white;border-radius:20px;padding:30px;margin-top:20px;">
                <h2><i class="fas fa-info-circle"></i> TENTANG IDB</h2>
                <p><strong>IDB (Indie Database Film)</strong> adalah platform rating film independen dengan fitur real-time update rating dan komentar.</p>
            </div>
            <div style="background:white;border-radius:20px;padding:30px;margin-top:20px;">
                <h2><i class="fas fa-star"></i> FITUR UNGGULAN</h2>
                <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:20px;margin-top:20px;">
                    <div style="text-align:center;padding:20px;background:#f8fafc;border-radius:16px;"><i class="fas fa-star" style="font-size:40px;color:#667eea;"></i><h3>Rating Film</h3><p>1-10 bintang</p></div>
                    <div style="text-align:center;padding:20px;background:#f8fafc;border-radius:16px;"><i class="fas fa-user" style="font-size:40px;color:#667eea;"></i><h3>Rating Aktor</h3><p>1-5 bintang</p></div>
                    <div style="text-align:center;padding:20px;background:#f8fafc;border-radius:16px;"><i class="fas fa-bookmark" style="font-size:40px;color:#667eea;"></i><h3>Watchlist</h3><p>Simpan film favorit</p></div>
                    <div style="text-align:center;padding:20px;background:#f8fafc;border-radius:16px;"><i class="fas fa-trophy" style="font-size:40px;color:#667eea;"></i><h3>Top Rating</h3><p>Peringkat film terbaik</p></div>
                    <div style="text-align:center;padding:20px;background:#f8fafc;border-radius:16px;"><i class="fas fa-sync-alt" style="font-size:40px;color:#667eea;"></i><h3>Real-time Update</h3><p>Rating & komentar update langsung</p></div>
                </div>
            </div>
            <div style="background:white;border-radius:20px;padding:30px;margin-top:20px;">
                <h2><i class="fas fa-envelope"></i> KONTAK</h2>
                <p><strong>Email:</strong> support@idb.com</p>
                <p><strong>Instagram:</strong> @idb.indie</p>
            </div>
        </div>
    `;
}

function renderReports() {
    if (!isAdminLoggedIn) { render(); return; }
    const pending = reports.filter(r => r.status === 'pending');
    let html = `<h2>🚩 Laporan Komentar</h2><h3>Tertunda (${pending.length})</h3>`;
    if (pending.length === 0) {
        html += `<p>Tidak ada laporan tertunda.</p>`;
    } else {
        pending.forEach(r => {
            html += `
                <div class="review-item" style="background:#f8fafc; padding:12px; border-radius:12px; margin-bottom:10px;">
                    <div><strong>🎬 ${escapeHtml(r.filmTitle)}</strong><br>💬 "${escapeHtml(r.comment)}"<br>⭐ ${r.rating}/10<br>👤 Dari: ${escapeHtml(r.reportedByName)}<br>📢 Pelapor: ${escapeHtml(r.reportedBy)}</div>
                    <div style="margin-top:10px;">
                        <button onclick="resolveReport(${r.id},'approve')" class="modal-btn modal-btn-primary" style="background:#10b981; color:white; border:none; padding:6px 16px; border-radius:40px; cursor:pointer;">✅ Hapus Komentar</button>
                        <button onclick="resolveReport(${r.id},'reject')" class="modal-btn modal-btn-secondary" style="background:#ef4444; color:white; border:none; padding:6px 16px; border-radius:40px; cursor:pointer; margin-left:8px;">❌ Tolak Laporan</button>
                    </div>
                </div>
            `;
        });
    }
    document.getElementById("mainContent").innerHTML = html;
}

async function resolveReport(id, action) {
    const res = await apiCall(`/api/reports/${id}`, { method: 'PUT', body: JSON.stringify({ status: action === 'approve' ? 'approved' : 'rejected' }) });
    if (res?.success) { await loadData(true); showToast(action === 'approve' ? "Komentar telah dihapus!" : "Laporan ditolak.", "success"); renderReports(); render(); }
    else showToast("Gagal memproses laporan!", "error");
}

function render() {
    if (currentView === "beranda") renderBeranda();
    else if (currentView === "toprating") renderTopRating();
    else if (currentView === "topactors") renderTopActors();
    else if (currentView === "watchlist") renderWatchlist();
    else if (currentView === "profile") renderProfile();
    else if (currentView === "about") renderAbout();
    else if (currentView === "reports") renderReports();
    
    updateStats();
}

function updateStats() {
    const sf = document.getElementById("statFilms");
    const su = document.getElementById("statUsers");
    const sr = document.getElementById("statRatings");
    const sw = document.getElementById("statWatchlist");
    if (sf) sf.innerText = films.length;
    if (su) su.innerText = users.length + admins.length;
    if (sr) sr.innerText = ratings.length;
    if (sw) sw.innerText = watchlist.length;
}

function changeView(view) {
    currentView = view;
    document.querySelectorAll(".nav-btn").forEach(b => b.classList.remove("active"));
    const btn = document.querySelector(`.nav-btn[data-view="${view}"]`);
    if (btn) btn.classList.add("active");
    if (currentFilmId && socket) {
        socket.emit('leave-film', currentFilmId);
        currentFilmId = null;
    }
    render();
}

function clearSearch() { searchQuery = ""; renderBeranda(); }

// ==================== MODAL FUNCTIONS ====================
function openFilmModal(id) {
    const film = films.find(f => f.id === id);
    if (!film) return;
    
    joinFilmRoom(id);
    
    const avg = getAvgRating(id);
    const uid = isAdminLoggedIn ? "admin" : currentUser;
    const userRating = uid ? getUserRating(id, uid) : null;
    const inWatchlist = uid ? isInWatchlist(uid, id) : false;
    
    const html = `
        <div id="filmModal" class="modal active" style="display:flex; position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.7); backdrop-filter:blur(5px); z-index:1000; justify-content:center; align-items:center;">
            <div class="modal-content large" style="background:white; max-width:800px; width:90%; border-radius:20px; max-height:90vh; overflow-y:auto;">
                <div class="modal-header" style="background:linear-gradient(135deg,#667eea,#764ba2); padding:16px 20px; border-radius:20px 20px 0 0; position:relative;">
                    <h2 style="color:white;"><i class="fas fa-film"></i> ${escapeHtml(film.title)}</h2>
                    <span class="close-modal" onclick="closeFilmModal()" style="position:absolute; top:12px; right:20px; font-size:28px; cursor:pointer; color:white;">&times;</span>
                </div>
                <div class="modal-body" style="padding:20px;">
                    <div class="modal-film-header" style="display:flex; gap:20px; flex-wrap:wrap;">
                        <img class="modal-poster" src="${film.posterUrl}" onerror="this.src='https://via.placeholder.com/150x220?text=No+Image'" style="width:150px; height:220px; object-fit:cover; border-radius:12px;">
                        <div class="modal-info" style="flex:1;">
                            <div class="modal-title" style="font-size:20px; font-weight:bold; margin-bottom:10px;">${escapeHtml(film.title)} (${film.year})</div>
                            <div class="modal-synopsis" style="background:#f8fafc; padding:12px; border-radius:12px; margin:10px 0; font-size:13px; line-height:1.5;">${escapeHtml(film.synopsis)}</div>
                            <div class="modal-avg-rating" style="background:#fef3c7; padding:6px 12px; border-radius:20px; display:inline-block; font-size:13px;">${avg ? `⭐ Rata-rata: ${avg}/10 (${ratings.filter(r => r.filmId && r.filmId.toString() === id.toString()).length} rating)` : '⭐ Belum ada rating'}</div>
                            <div style="margin-top:15px;">
                                <button class="trailer-btn" onclick="window.open('${film.trailer}','_blank')" style="background:#dc2626; color:white; border:none; padding:8px 16px; border-radius:40px; cursor:pointer;"><i class="fab fa-youtube"></i> Tonton Trailer</button>
                                ${uid ? `<button class="watchlist-modal-btn ${inWatchlist ? 'in-watchlist' : ''}" onclick="toggleWatchlist('${uid}', '${id}'); closeFilmModal();" style="background:${inWatchlist ? '#10b981' : '#e2e8f0'}; color:${inWatchlist ? 'white' : '#333'}; border:none; padding:8px 16px; border-radius:40px; cursor:pointer; margin-left:8px;"><i class="fas ${inWatchlist ? 'fa-check' : 'fa-bookmark'}"></i> ${inWatchlist ? 'Di Watchlist' : 'Tambah ke Watchlist'}</button>` : '<button class="watchlist-modal-btn" onclick="showAuthModal()" style="background:#e2e8f0; border:none; padding:8px 16px; border-radius:40px; cursor:pointer;"><i class="fas fa-lock"></i> Login untuk Watchlist</button>'}
                            </div>
                        </div>
                    </div>
                    
                    <div class="modal-rating" style="margin:20px 0; padding-top:15px; border-top:1px solid #eef2f6;">
                        ${uid ? `
                            <label style="font-weight:600; margin-bottom:10px; display:block;"><i class="fas fa-star"></i> Rating Kamu</label>
                            <div class="stars" id="starSelector" style="display:flex; gap:8px; justify-content:center; margin:15px 0;">
                                ${[1,2,3,4,5,6,7,8,9,10].map(s => `<span class="star" data-rating="${s}" style="font-size:32px; cursor:pointer; color:${userRating?.rating >= s ? '#f59e0b' : '#cbd5e0'};">★</span>`).join('')}
                            </div>
                            <textarea id="commentInput" rows="3" placeholder="Tulis komentar..." style="width:100%; padding:12px; border:1px solid #e2e8f0; border-radius:12px; margin:10px 0; font-family:inherit;">${userRating?.comment || ''}</textarea>
                            <div class="modal-actions" style="display:flex; gap:10px;">
                                <button class="modal-btn modal-btn-primary" onclick="submitRating('${id}')" style="flex:1; background:#667eea; color:white; border:none; padding:10px; border-radius:40px; cursor:pointer;"><i class="fas fa-save"></i> Simpan Rating</button>
                                ${userRating ? `<button class="modal-btn modal-btn-secondary" onclick="deleteRatingFilm('${id}')" style="flex:1; background:#ef4444; color:white; border:none; padding:10px; border-radius:40px; cursor:pointer;"><i class="fas fa-trash"></i> Hapus Rating</button>` : ''}
                            </div>
                        ` : `
                            <div class="login-prompt" style="text-align:center; padding:20px; background:#f8fafc; border-radius:16px;">
                                <i class="fas fa-lock" style="font-size:32px; color:#94a3b8; margin-bottom:10px; display:block;"></i>
                                <p>Login untuk memberi rating & komentar</p>
                                <button class="login-btn" onclick="showAuthModal()" style="background:#667eea; color:white; border:none; padding:8px 20px; border-radius:40px; cursor:pointer; margin-top:10px;">Login Sekarang</button>
                            </div>
                        `}
                    </div>
                    
                    <h3 style="margin:20px 0 10px;"><i class="fas fa-comments"></i> Semua Komentar</h3>
                    <div class="review-list" style="max-height:300px; overflow-y:auto;">
                        ${ratings.filter(r => r.filmId && r.filmId.toString() === id.toString()).sort((a,b) => b.timestamp - a.timestamp).map(r => {
                            const p = getProfile(r.userId);
                            return `
                                <div class="review-item" style="background:#f8fafc; padding:12px; border-radius:12px; margin-bottom:10px;">
                                    <div class="review-header" style="display:flex; justify-content:space-between; margin-bottom:6px; flex-wrap:wrap; gap:5px;">
                                        <span class="review-user" onclick="viewProfile('${r.userId}')" style="font-weight:bold; color:#667eea; cursor:pointer;"><i class="fas fa-user-circle"></i> ${escapeHtml(p.displayName)}</span>
                                        <span class="review-rating" style="color:#f59e0b;">⭐ ${r.rating}/10</span>
                                    </div>
                                    <div class="review-comment" style="margin:8px 0;">"${escapeHtml(r.comment)}"</div>
                                    <div class="review-time" style="font-size:10px; color:#999;">${new Date(r.timestamp).toLocaleString()}</div>
                                </div>
                            `;
                        }).join('') || '<p style="text-align:center; padding:20px;">Belum ada komentar. Jadilah yang pertama!</p>'}
                    </div>
                </div>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', html);
    document.body.style.overflow = "hidden";
    
    if (uid) {
        const stars = document.querySelectorAll("#starSelector .star");
        let cr = userRating?.rating || 7;
        stars.forEach(s => {
            const val = parseInt(s.dataset.rating);
            if (val <= cr) s.classList.add("active");
            s.onclick = () => {
                cr = val;
                stars.forEach(ss => {
                    if (parseInt(ss.dataset.rating) <= cr) {
                        ss.classList.add("active");
                        ss.style.color = "#f59e0b";
                    } else {
                        ss.classList.remove("active");
                        ss.style.color = "#cbd5e0";
                    }
                });
                currentRating = cr;
            };
        });
        currentRating = cr;
    }
}

function closeFilmModal() {
    if (socket && currentFilmId) {
        socket.emit('leave-film', currentFilmId);
        currentFilmId = null;
    }
    const modal = document.getElementById("filmModal");
    if (modal) modal.remove();
    document.body.style.overflow = "";
}

async function submitRating(id) {
    if (!currentUser && !isAdminLoggedIn) { showToast("Login dulu!", "error"); return; }
    const rating = currentRating || 7;
    const comment = document.getElementById("commentInput")?.value.trim() || "";
    const uid = isAdminLoggedIn ? "admin" : currentUser;
    await addRating(id, uid, rating, comment);
    closeFilmModal();
    openFilmModal(id);
    render();
}

async function deleteRatingFilm(id) {
    if (!confirm("Hapus rating ini?")) return;
    const uid = isAdminLoggedIn ? "admin" : currentUser;
    await deleteRating(id, uid);
    closeFilmModal();
    openFilmModal(id);
    render();
}

function joinFilmRoom(filmId) {
    if (socket && currentFilmId !== filmId) {
        if (currentFilmId) socket.emit('leave-film', currentFilmId);
        currentFilmId = filmId;
        socket.emit('join-film', filmId);
        console.log(`📺 Joined room: film_${filmId}`);
    }
}

function addCommentToUI(comment) {
    const reviewList = document.querySelector('.review-list');
    if (!reviewList) return;
    
    const commentHtml = `
        <div class="review-item" style="background:#fef3c7; transition: all 0.3s; animation: fadeIn 0.3s ease;">
            <div class="review-header" style="display:flex; justify-content:space-between; margin-bottom:8px;">
                <span class="review-user" onclick="viewProfile('${comment.userId}')" style="font-weight:bold; color:#667eea; cursor:pointer;">
                    <i class="fas fa-user-circle"></i> ${escapeHtml(comment.displayName)}
                </span>
                <span class="review-rating" style="color:#f59e0b;">⭐ ${comment.rating}/10</span>
            </div>
            <div class="review-comment">"${escapeHtml(comment.comment)}"</div>
            <div class="review-time" style="font-size:10px; color:#999;">Baru saja</div>
        </div>
    `;
    
    reviewList.insertAdjacentHTML('afterbegin', commentHtml);
    
    setTimeout(() => {
        const newComment = reviewList.firstElementChild;
        if (newComment) newComment.style.background = '#f8fafc';
    }, 1000);
}

// ==================== AUTH MODAL ====================
function showAuthModal() {
    const existing = document.getElementById("authModal");
    if (existing) existing.remove();
    const html = `
        <div id="authModal" class="modal active" style="display:flex; position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.7); backdrop-filter:blur(5px); z-index:1000; justify-content:center; align-items:center;">
            <div class="modal-content" style="background:white; max-width:500px; width:90%; border-radius:20px;">
                <div class="modal-header" style="background:linear-gradient(135deg,#667eea,#764ba2); padding:16px 20px; border-radius:20px 20px 0 0; position:relative;">
                    <h2 style="color:white;"><i class="fas fa-key"></i> Login / Daftar</h2>
                    <span class="close-modal" onclick="closeAuthModal()" style="position:absolute; top:12px; right:20px; font-size:28px; cursor:pointer; color:white;">&times;</span>
                </div>
                <div class="modal-body" style="padding:20px;">
                    <div id="loginForm">
                        <div class="form-group" style="margin-bottom:15px;"><label style="display:block; margin-bottom:5px; font-weight:600;"><i class="fas fa-user"></i> Username</label><input type="text" id="loginUsername" placeholder="Masukkan username" style="width:100%; padding:10px; border:1px solid #ddd; border-radius:10px;"></div>
                        <div class="form-group" style="margin-bottom:15px;"><label style="display:block; margin-bottom:5px; font-weight:600;"><i class="fas fa-lock"></i> Password</label><input type="password" id="loginPassword" placeholder="Masukkan password" style="width:100%; padding:10px; border:1px solid #ddd; border-radius:10px;"></div>
                        <button onclick="doLogin()" class="modal-btn modal-btn-primary" style="width:100%; background:#667eea; color:white; border:none; padding:10px; border-radius:40px; cursor:pointer;"><i class="fas fa-sign-in-alt"></i> Login</button>
                        <div class="toggle-form" style="margin-top:15px; text-align:center;">Belum punya akun? <span onclick="showRegisterForm()" style="color:#667eea; cursor:pointer;">Daftar sekarang</span></div>
                    </div>
                    <div id="registerForm" style="display:none;">
                        <div class="form-group"><label><i class="fas fa-user"></i> Username</label><input type="text" id="regUsername" placeholder="Pilih username"></div>
                        <div class="form-group"><label><i class="fas fa-lock"></i> Password</label><input type="password" id="regPassword" placeholder="Minimal 6 karakter"></div>
                        <div class="form-group"><label><i class="fas fa-check-circle"></i> Konfirmasi Password</label><input type="password" id="regConfirmPassword" placeholder="Konfirmasi password"></div>
                        <div class="form-group"><label><i class="fas fa-id-card"></i> Nama Tampilan</label><input type="text" id="regDisplayName" placeholder="Nama yang akan ditampilkan"></div>
                        <button onclick="doRegister()" class="modal-btn modal-btn-primary" style="width:100%; background:#667eea; color:white; border:none; padding:10px; border-radius:40px;"><i class="fas fa-user-plus"></i> Daftar</button>
                        <div class="toggle-form" style="margin-top:15px; text-align:center;">Sudah punya akun? <span onclick="showLoginForm()" style="color:#667eea; cursor:pointer;">Login sekarang</span></div>
                    </div>
                </div>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', html);
    showLoginForm();
}

function closeAuthModal() { const m = document.getElementById("authModal"); if (m) m.remove(); }
function showLoginForm() { const l = document.getElementById("loginForm"); const r = document.getElementById("registerForm"); if (l) l.style.display = "block"; if (r) r.style.display = "none"; }
function showRegisterForm() { const l = document.getElementById("loginForm"); const r = document.getElementById("registerForm"); if (l) l.style.display = "none"; if (r) r.style.display = "block"; }

// ==================== ADMIN MODALS ====================
function openAddFilmModal() {
    if (!isAdminLoggedIn) { showToast("Hanya admin!", "error"); return; }
    tempPosterImage = null;
    const html = `
        <div id="addFilmModal" class="modal active" style="display:flex; position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.7); backdrop-filter:blur(5px); z-index:1000; justify-content:center; align-items:center;">
            <div class="modal-content large" style="background:white; max-width:800px; width:90%; border-radius:20px;">
                <div class="modal-header" style="background:linear-gradient(135deg,#667eea,#764ba2); padding:16px 20px; border-radius:20px 20px 0 0; position:relative;">
                    <h2 style="color:white;"><i class="fas fa-plus-circle"></i> Tambah Film Baru</h2>
                    <span class="close-modal" onclick="closeAddFilmModal()" style="position:absolute; top:12px; right:20px; font-size:28px; cursor:pointer; color:white;">&times;</span>
                </div>
                <div class="modal-body" style="padding:20px;">
                    <div class="form-group"><label><i class="fas fa-film"></i> Judul Film</label><input type="text" id="newFilmTitle" placeholder="Contoh: Inception" style="width:100%; padding:10px; border:1px solid #ddd; border-radius:10px;"></div>
                    <div class="form-row" style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
                        <div class="form-group"><label><i class="fas fa-calendar"></i> Tahun Rilis</label><input type="number" id="newFilmYear" placeholder="2024" style="width:100%; padding:10px; border:1px solid #ddd; border-radius:10px;"></div>
                        <div class="form-group"><label><i class="fas fa-image"></i> URL Poster</label><input type="text" id="newFilmPoster" placeholder="https://..." style="width:100%; padding:10px; border:1px solid #ddd; border-radius:10px;"></div>
                    </div>
                    <div class="form-group"><label><i class="fab fa-youtube"></i> URL Trailer</label><input type="text" id="newFilmTrailer" placeholder="https://youtube.com/..." style="width:100%; padding:10px; border:1px solid #ddd; border-radius:10px;"></div>
                    <div class="form-group"><label><i class="fas fa-align-left"></i> Sinopsis</label><textarea id="newFilmSynopsis" rows="4" style="width:100%; padding:10px; border:1px solid #ddd; border-radius:10px;"></textarea></div>
                    <div class="form-group"><label><i class="fas fa-users"></i> Aktor (pisah koma)</label><input type="text" id="newFilmActors" placeholder="Tom Hanks, Leonardo DiCaprio" style="width:100%; padding:10px; border:1px solid #ddd; border-radius:10px;"></div>
                    <div class="modal-actions" style="display:flex; gap:10px; margin-top:20px;">
                        <button onclick="addNewFilm()" class="modal-btn modal-btn-primary" style="flex:1; background:#667eea; color:white; border:none; padding:10px; border-radius:40px;"><i class="fas fa-save"></i> Tambah Film</button>
                        <button onclick="closeAddFilmModal()" class="modal-btn modal-btn-secondary" style="flex:1; background:#e2e8f0; border:none; padding:10px; border-radius:40px;"><i class="fas fa-times"></i> Batal</button>
                    </div>
                </div>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', html);
}
function closeAddFilmModal() { const m = document.getElementById("addFilmModal"); if (m) m.remove(); tempPosterImage = null; }

function openEditFilmModal(id) {
    if (!isAdminLoggedIn) { showToast("Hanya admin!", "error"); return; }
    const film = films.find(f => f.id === id);
    if (!film) return;
    tempPosterImage = null;
    const html = `
        <div id="editFilmModal" class="modal active" style="display:flex; position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.7); backdrop-filter:blur(5px); z-index:1000; justify-content:center; align-items:center;">
            <div class="modal-content large" style="background:white; max-width:800px; width:90%; border-radius:20px;">
                <div class="modal-header" style="background:linear-gradient(135deg,#667eea,#764ba2); padding:16px 20px; border-radius:20px 20px 0 0; position:relative;">
                    <h2 style="color:white;"><i class="fas fa-edit"></i> Edit Film</h2>
                    <span class="close-modal" onclick="closeEditFilmModal()" style="position:absolute; top:12px; right:20px; font-size:28px; cursor:pointer; color:white;">&times;</span>
                </div>
                <div class="modal-body" style="padding:20px;">
                    <input type="hidden" id="editFilmId" value="${film.id}">
                    <div class="form-group"><label>Judul</label><input type="text" id="editFilmTitle" value="${escapeHtml(film.title)}" style="width:100%; padding:10px; border:1px solid #ddd; border-radius:10px;"></div>
                    <div class="form-row" style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
                        <div class="form-group"><label>Tahun</label><input type="number" id="editFilmYear" value="${film.year}" style="width:100%; padding:10px; border:1px solid #ddd; border-radius:10px;"></div>
                        <div class="form-group"><label>URL Poster</label><input type="text" id="editFilmPoster" value="${film.posterUrl}" style="width:100%; padding:10px; border:1px solid #ddd; border-radius:10px;"></div>
                    </div>
                    <div class="form-group"><label>URL Trailer</label><input type="text" id="editFilmTrailer" value="${film.trailer}" style="width:100%; padding:10px; border:1px solid #ddd; border-radius:10px;"></div>
                    <div class="form-group"><label>Sinopsis</label><textarea id="editFilmSynopsis" rows="4" style="width:100%; padding:10px; border:1px solid #ddd; border-radius:10px;">${escapeHtml(film.synopsis)}</textarea></div>
                    <div class="form-group"><label>Aktor (pisah koma)</label><input type="text" id="editFilmActors" value="${film.actors ? film.actors.join(', ') : ''}" style="width:100%; padding:10px; border:1px solid #ddd; border-radius:10px;"></div>
                    <div class="modal-actions" style="display:flex; gap:10px; margin-top:20px;">
                        <button onclick="updateFilm()" class="modal-btn modal-btn-primary" style="flex:1; background:#667eea; color:white; border:none; padding:10px; border-radius:40px;"><i class="fas fa-save"></i> Simpan</button>
                        <button onclick="closeEditFilmModal()" class="modal-btn modal-btn-secondary" style="flex:1; background:#e2e8f0; border:none; padding:10px; border-radius:40px;"><i class="fas fa-times"></i> Batal</button>
                    </div>
                </div>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', html);
}
function closeEditFilmModal() { const m = document.getElementById("editFilmModal"); if (m) m.remove(); tempPosterImage = null; }

function openAddActorModal() {
    if (!isAdminLoggedIn) { showToast("Hanya admin!", "error"); return; }
    const html = `
        <div id="addActorModal" class="modal active" style="display:flex; position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.7); backdrop-filter:blur(5px); z-index:1000; justify-content:center; align-items:center;">
            <div class="modal-content" style="background:white; max-width:500px; width:90%; border-radius:20px;">
                <div class="modal-header" style="background:linear-gradient(135deg,#667eea,#764ba2); padding:16px 20px; border-radius:20px 20px 0 0; position:relative;">
                    <h2 style="color:white;"><i class="fas fa-user-plus"></i> Tambah Aktor</h2>
                    <span class="close-modal" onclick="closeAddActorModal()" style="position:absolute; top:12px; right:20px; font-size:28px; cursor:pointer; color:white;">&times;</span>
                </div>
                <div class="modal-body" style="padding:20px;">
                    <div class="form-group"><label>Nama Aktor</label><input type="text" id="newActorName" placeholder="Tom Hanks" style="width:100%; padding:10px; border:1px solid #ddd; border-radius:10px;"></div>
                    <div class="form-group"><label>Bio</label><textarea id="newActorBio" rows="3" style="width:100%; padding:10px; border:1px solid #ddd; border-radius:10px;"></textarea></div>
                    <div class="form-group"><label>Foto URL</label><input type="text" id="newActorPhotoUrl" placeholder="https://... (opsional)" style="width:100%; padding:10px; border:1px solid #ddd; border-radius:10px;"></div>
                    <div class="modal-actions" style="display:flex; gap:10px; margin-top:20px;">
                        <button onclick="addNewActor()" class="modal-btn modal-btn-primary" style="flex:1; background:#667eea; color:white; border:none; padding:10px; border-radius:40px;">Tambah</button>
                        <button onclick="closeAddActorModal()" class="modal-btn modal-btn-secondary" style="flex:1; background:#e2e8f0; border:none; padding:10px; border-radius:40px;">Batal</button>
                    </div>
                </div>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', html);
}
function closeAddActorModal() { const m = document.getElementById("addActorModal"); if (m) m.remove(); }

function openEditActorModal(name) {
    if (!isAdminLoggedIn) { showToast("Hanya admin!", "error"); return; }
    const actor = actors.find(a => a.name === name);
    if (!actor) return;
    const html = `
        <div id="editActorModal" class="modal active" style="display:flex; position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.7); backdrop-filter:blur(5px); z-index:1000; justify-content:center; align-items:center;">
            <div class="modal-content" style="background:white; max-width:500px; width:90%; border-radius:20px;">
                <div class="modal-header" style="background:linear-gradient(135deg,#667eea,#764ba2); padding:16px 20px; border-radius:20px 20px 0 0; position:relative;">
                    <h2 style="color:white;"><i class="fas fa-edit"></i> Edit Aktor</h2>
                    <span class="close-modal" onclick="closeEditActorModal()" style="position:absolute; top:12px; right:20px; font-size:28px; cursor:pointer; color:white;">&times;</span>
                </div>
                <div class="modal-body" style="padding:20px;">
                    <input type="hidden" id="editActorId" value="${actor.id}">
                    <div class="form-group"><label>Nama</label><input type="text" id="editActorName" value="${escapeHtml(actor.name)}" style="width:100%; padding:10px; border:1px solid #ddd; border-radius:10px;"></div>
                    <div class="form-group"><label>Bio</label><textarea id="editActorBio" rows="3" style="width:100%; padding:10px; border:1px solid #ddd; border-radius:10px;">${escapeHtml(actor.bio)}</textarea></div>
                    <div class="form-group"><label>Foto URL</label><input type="text" id="editActorPhotoUrl" value="${actor.photoUrl}" style="width:100%; padding:10px; border:1px solid #ddd; border-radius:10px;"></div>
                    <div class="modal-actions" style="display:flex; gap:10px; margin-top:20px;">
                        <button onclick="updateActor()" class="modal-btn modal-btn-primary" style="flex:1; background:#667eea; color:white; border:none; padding:10px; border-radius:40px;">Simpan</button>
                        <button onclick="closeEditActorModal()" class="modal-btn modal-btn-secondary" style="flex:1; background:#e2e8f0; border:none; padding:10px; border-radius:40px;">Batal</button>
                    </div>
                </div>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', html);
}
function closeEditActorModal() { const m = document.getElementById("editActorModal"); if (m) m.remove(); }

function openSettingModal() {
    const uid = isAdminLoggedIn ? "admin" : currentUser;
    const prof = getProfile(uid);
    const ratedFilms = ratings.filter(r => r.userId && r.userId.toString() === uid.toString()).map(r => films.find(f => f.id === r.filmId.toString())).filter(f => f);
    tempAvatarImage = prof.avatarValue;
    const avatar = prof.avatarValue || `https://ui-avatars.com/api/?name=${prof.displayName}&background=667eea&color=fff`;
    
    const html = `
        <div id="settingModal" class="modal active" style="display:flex; position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.7); backdrop-filter:blur(5px); z-index:1000; justify-content:center; align-items:center;">
            <div class="modal-content" style="background:white; max-width:500px; width:90%; border-radius:20px;">
                <div class="modal-header" style="background:linear-gradient(135deg,#667eea,#764ba2); padding:16px 20px; border-radius:20px 20px 0 0; position:relative;">
                    <h2 style="color:white;"><i class="fas fa-user-edit"></i> Edit Profil</h2>
                    <span class="close-modal" onclick="closeSettingModal()" style="position:absolute; top:12px; right:20px; font-size:28px; cursor:pointer; color:white;">&times;</span>
                </div>
                <div class="modal-body" style="padding:20px;">
                    <div style="text-align:center;"><img id="avatarPreview" src="${avatar}" style="width:80px;height:80px;border-radius:50%;margin-bottom:10px;"><br><button class="login-btn" onclick="document.getElementById('avatarUpload').click()" style="background:#667eea; color:white; border:none; padding:8px 16px; border-radius:40px;">Upload Foto</button><input type="file" id="avatarUpload" accept="image/*" style="display:none;"></div>
                    <div class="form-group"><label>Nama Tampilan</label><input type="text" id="settingDisplayName" value="${escapeHtml(prof.displayName)}" style="width:100%; padding:10px; border:1px solid #ddd; border-radius:10px;"></div>
                    <div class="form-group"><label>Bio</label><textarea id="settingBio" rows="3" style="width:100%; padding:10px; border:1px solid #ddd; border-radius:10px;">${escapeHtml(prof.bio)}</textarea></div>
                    ${ratedFilms.length > 0 ? `
                        <div class="form-group"><label>Top 3 Film</label>
                            <select id="top1Select" style="width:100%; padding:10px; border:1px solid #ddd; border-radius:10px; margin-bottom:8px;"><option value="">-- Film #1 --</option>${ratedFilms.map(f => `<option value="${f.id}" ${prof.top3Films[0] === f.id ? 'selected' : ''}>${escapeHtml(f.title)}</option>`).join('')}</select>
                            <select id="top2Select" style="width:100%; padding:10px; border:1px solid #ddd; border-radius:10px; margin-bottom:8px;"><option value="">-- Film #2 --</option>${ratedFilms.map(f => `<option value="${f.id}" ${prof.top3Films[1] === f.id ? 'selected' : ''}>${escapeHtml(f.title)}</option>`).join('')}</select>
                            <select id="top3Select" style="width:100%; padding:10px; border:1px solid #ddd; border-radius:10px;"><option value="">-- Film #3 --</option>${ratedFilms.map(f => `<option value="${f.id}" ${prof.top3Films[2] === f.id ? 'selected' : ''}>${escapeHtml(f.title)}</option>`).join('')}</select>
                        </div>
                    ` : '<p>Belum ada film yang dirating</p>'}
                    <div class="modal-actions" style="display:flex; gap:10px; margin-top:20px;"><button onclick="saveProfile()" class="modal-btn modal-btn-primary" style="flex:1; background:#667eea; color:white; border:none; padding:10px; border-radius:40px;">Simpan</button><button onclick="closeSettingModal()" class="modal-btn modal-btn-secondary" style="flex:1; background:#e2e8f0; border:none; padding:10px; border-radius:40px;">Batal</button></div>
                </div>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', html);
    document.getElementById("avatarUpload").onchange = function(e) {
        const file = e.target.files[0];
        if (file && file.size <= 2*1024*1024) {
            const reader = new FileReader();
            reader.onload = ev => { document.getElementById("avatarPreview").src = ev.target.result; tempAvatarImage = ev.target.result; };
            reader.readAsDataURL(file);
        } else showToast("Ukuran maksimal 2MB!", "error");
    };
}
function closeSettingModal() { const m = document.getElementById("settingModal"); if (m) m.remove(); tempAvatarImage = null; }

function updateUI() {
    const disp = document.getElementById("userDisplay");
    const auth = document.getElementById("authBtn");
    const reg = document.getElementById("registerBtn");
    const rep = document.getElementById("reportsNavBtn");
    
    if (isAdminLoggedIn) {
        const p = getProfile("admin");
        disp.innerHTML = `${p.avatarValue ? `<img src="${p.avatarValue}" style="width:28px;height:28px;border-radius:50%;margin-right:6px;">` : '<i class="fas fa-user-shield" style="margin-right:6px;"></i>'} ${escapeHtml(p.displayName)} <span class="admin-badge" style="background:#f59e0b; font-size:10px; padding:2px 8px; border-radius:20px; color:white; margin-left:5px;">Admin</span>`;
        auth.innerHTML = '<i class="fas fa-sign-out-alt"></i> Logout';
        auth.onclick = logout;
        auth.classList.add("logout-btn");
        auth.classList.remove("login-btn");
        reg.style.display = "none";
        if (rep) rep.style.display = "flex";
    } else if (currentUser) {
        const p = getProfile(currentUser);
        disp.innerHTML = `${p.avatarValue ? `<img src="${p.avatarValue}" style="width:28px;height:28px;border-radius:50%;margin-right:6px;">` : '<i class="fas fa-user-circle" style="margin-right:6px;"></i>'} ${escapeHtml(p.displayName)}`;
        auth.innerHTML = '<i class="fas fa-sign-out-alt"></i> Logout';
        auth.onclick = logout;
        auth.classList.add("logout-btn");
        auth.classList.remove("login-btn");
        reg.style.display = "none";
        if (rep) rep.style.display = "none";
    } else {
        disp.innerHTML = '<i class="fas fa-sign-in-alt"></i> Belum login';
        auth.innerHTML = '<i class="fas fa-key"></i> Login';
        auth.onclick = showAuthModal;
        auth.classList.add("login-btn");
        auth.classList.remove("logout-btn");
        reg.style.display = "inline-block";
        reg.onclick = () => { showAuthModal(); showRegisterForm(); };
        if (rep) rep.style.display = "none";
    }
    
    const fab = document.getElementById("adminFab");
    if (fab) fab.style.display = isAdminLoggedIn ? "flex" : "none";
}

function initNav() {
    document.querySelectorAll(".nav-btn").forEach(btn => {
        btn.onclick = () => {
            currentView = btn.dataset.view;
            document.querySelectorAll(".nav-btn").forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
            if (currentFilmId && socket) {
                socket.emit('leave-film', currentFilmId);
                currentFilmId = null;
            }
            render();
        };
    });
}

// ==================== GLOBAL FUNCTIONS EXPOSED ====================
window.doLogin = doLogin;
window.doRegister = doRegister;
window.logout = logout;
window.showAuthModal = showAuthModal;
window.closeAuthModal = closeAuthModal;
window.showLoginForm = showLoginForm;
window.showRegisterForm = showRegisterForm;
window.openFilmModal = openFilmModal;
window.closeFilmModal = closeFilmModal;
window.submitRating = submitRating;
window.deleteRatingFilm = deleteRatingFilm;
window.toggleWatchlist = toggleWatchlist;
window.addNewFilm = addNewFilm;
window.closeAddFilmModal = closeAddFilmModal;
window.openEditFilmModal = openEditFilmModal;
window.closeEditFilmModal = closeEditFilmModal;
window.updateFilm = updateFilm;
window.adminDeleteFilm = adminDeleteFilm;
window.openAddActorModal = openAddActorModal;
window.closeAddActorModal = closeAddActorModal;
window.addNewActor = addNewActor;
window.openEditActorModal = openEditActorModal;
window.closeEditActorModal = closeEditActorModal;
window.updateActor = updateActor;
window.adminDeleteActor = adminDeleteActor;
window.rateActor = rateActor;
window.openSettingModal = openSettingModal;
window.closeSettingModal = closeSettingModal;
window.saveProfile = saveProfile;
window.clearSearch = clearSearch;
window.viewProfile = viewProfile;
window.resolveReport = resolveReport;
window.changeView = changeView;

// ==================== START APP ====================
initSocket();
loadData();
initNav();

setInterval(async () => {
    await loadData(true);
}, 3000);
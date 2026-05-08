// ======================= GLOBAL VARIABABLES =======================
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

// Helper function untuk safe string
function safeString(value) {
    if (value === undefined || value === null) return '';
    return String(value);
}

function safeId(value) {
    if (value === undefined || value === null) return '';
    return String(value).replace(/[^a-zA-Z0-9]/g, '');
}

function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/[&<>]/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[m]));
}

function showToast(msg, type = "info") {
    const toast = document.createElement("div");
    toast.className = `toast ${type}`;
    toast.innerHTML = msg;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 2500);
}

// ==================== FUNGSI AUTH (DEFINISIKAN DULU) ====================
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
                        <div class="form-group"><label>Username</label><input type="text" id="loginUsername" placeholder="Masukkan username" style="width:100%; padding:10px; border:1px solid #ddd; border-radius:10px;"></div>
                        <div class="form-group"><label>Password</label><input type="password" id="loginPassword" placeholder="Masukkan password" style="width:100%; padding:10px; border:1px solid #ddd; border-radius:10px;"></div>
                        <button onclick="doLogin()" class="modal-btn modal-btn-primary" style="width:100%; background:#667eea; color:white; border:none; padding:10px; border-radius:40px; cursor:pointer;">Login</button>
                        <div class="toggle-form" style="margin-top:15px; text-align:center;">Belum punya akun? <span onclick="showRegisterForm()" style="color:#667eea; cursor:pointer;">Daftar sekarang</span></div>
                    </div>
                    <div id="registerForm" style="display:none;">
                        <div class="form-group"><label>Username</label><input type="text" id="regUsername" placeholder="Pilih username"></div>
                        <div class="form-group"><label>Password</label><input type="password" id="regPassword" placeholder="Minimal 6 karakter"></div>
                        <div class="form-group"><label>Konfirmasi Password</label><input type="password" id="regConfirmPassword" placeholder="Konfirmasi password"></div>
                        <div class="form-group"><label>Nama Tampilan</label><input type="text" id="regDisplayName" placeholder="Nama yang akan ditampilkan"></div>
                        <button onclick="doRegister()" class="modal-btn modal-btn-primary" style="width:100%; background:#667eea; color:white; border:none; padding:10px; border-radius:40px;">Daftar</button>
                        <div class="toggle-form" style="margin-top:15px; text-align:center;">Sudah punya akun? <span onclick="showLoginForm()" style="color:#667eea; cursor:pointer;">Login sekarang</span></div>
                    </div>
                </div>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', html);
    showLoginForm();
}

function closeAuthModal() { 
    const m = document.getElementById("authModal"); 
    if (m) m.remove(); 
}

function showLoginForm() { 
    const l = document.getElementById("loginForm"); 
    const r = document.getElementById("registerForm"); 
    if (l) l.style.display = "block"; 
    if (r) r.style.display = "none"; 
}

function showRegisterForm() { 
    const l = document.getElementById("loginForm"); 
    const r = document.getElementById("registerForm"); 
    if (l) l.style.display = "none"; 
    if (r) r.style.display = "block"; 
}

async function doLogin() {
    const username = document.getElementById("loginUsername")?.value.trim();
    const password = document.getElementById("loginPassword")?.value;
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
    const username = document.getElementById("regUsername")?.value.trim();
    const password = document.getElementById("regPassword")?.value;
    const confirm = document.getElementById("regConfirmPassword")?.value;
    const displayName = document.getElementById("regDisplayName")?.value.trim() || username;
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

// ==================== API HELPERS =======================
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

// ==================== SOCKET.IO =======================
function initSocket() {
    socket = io({ transports: ['polling'] });
    
    socket.on('connect', () => console.log('✅ Real-time connected'));
    socket.on('film-rating-updated', (data) => {
        if (currentView === 'beranda' || currentView === 'toprating') refreshCurrentView();
        if (safeString(currentFilmId) === safeString(data.filmId)) updateModalRating(data);
    });
    socket.on('actor-added', () => { if (currentView === 'topactors') refreshCurrentView(); });
    socket.on('actor-updated', () => { if (currentView === 'topactors') refreshCurrentView(); });
    socket.on('actor-deleted', () => { if (currentView === 'topactors') refreshCurrentView(); });
    socket.on('actor-rating-updated', () => { if (currentView === 'topactors') refreshCurrentView(); });
    socket.on('new-comment', (data) => {
        if (safeString(currentFilmId) === safeString(data.filmId) && document.getElementById('filmModal')) {
            addCommentToUI(data);
        }
    });
    socket.on('film-added', () => refreshCurrentView());
    socket.on('film-updated', () => refreshCurrentView());
    socket.on('film-deleted', () => refreshCurrentView());
    socket.on('watchlist-updated', (data) => {
        if (safeString(data.userId) === safeString(currentUser || 'admin') && currentView === 'watchlist') refreshCurrentView();
    });
    socket.on('profile-updated', (data) => {
        if (safeString(data.userId) === safeString(currentUser || 'admin')) updateUI();
        if (currentView === 'profile') refreshCurrentView();
    });
    socket.on('new-report', (data) => {
        reports.push(data.report);
        if (currentView === 'reports' && isAdminLoggedIn) renderReports();
        if (isAdminLoggedIn) showToast(`📢 Laporan baru dari ${data.report.reportedBy}`, 'warning');
    });
    socket.on('show-toast', (data) => showToast(data.message, data.type));
    socket.on('disconnect', () => console.log('❌ Disconnected'));
    socket.on('reconnect', () => refreshCurrentView());
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

// ==================== LOAD DATA =======================
let lastDataLoad = 0;
async function loadData(force = false) {
    const now = Date.now();
    if (!force && now - lastDataLoad < 1000) return;
    try {
        const data = await apiCall('/api/all-data');
        if (!data) return;
        
        users = (data.users || []).map(u => ({ ...u, _id: safeString(u._id) }));
        admins = data.admins || [];
        films = (data.films || []).map(film => ({ ...film, id: safeString(film._id), _id: safeString(film._id) }));
        ratings = (data.ratings || []).map(r => ({ ...r, filmId: safeString(r.filmId), userId: safeString(r.userId) }));
        watchlist = (data.watchlist || []).map(w => ({ ...w, userId: safeString(w.userId), filmId: safeString(w.filmId) }));
        userProfiles = data.userProfiles || {};
        reports = (data.reports || []).map(r => ({ ...r, _id: safeString(r._id) }));
        actors = (data.actors || []).map(a => ({ ...a, id: safeString(a._id), _id: safeString(a._id) }));
        actorRatingsByUser = (data.actorRatingsByUser || []).map(ar => ({ ...ar, userId: safeString(ar.userId) }));
        
        if (currentToken) {
            const session = await apiCall('/api/session', { headers: { 'Authorization': currentToken } });
            if (session?.loggedIn) {
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
    } catch (e) {
        console.error("Error in loadData:", e);
        showToast("Gagal memuat data!", "error");
    }
}

// ==================== FUNGSI LAINNYA =======================
function getProfile(id) {
    const idStr = safeString(id);
    if (!userProfiles[idStr]) {
        userProfiles[idStr] = { 
            displayName: idStr === "admin" ? "Administrator" : idStr, 
            avatarValue: null, 
            bio: "Pecinta film 🎬", 
            top3Films: [] 
        };
    }
    return userProfiles[idStr];
}

function getDisplayNameFromObjectId(userId) {
    const idStr = safeString(userId);
    const user = users.find(u => safeString(u._id) === idStr);
    if (user) return user.displayName || user.username;
    const profile = userProfiles[idStr];
    if (profile) return profile.displayName;
    return idStr === 'admin' ? 'Administrator' : 'Unknown User';
}

function getAvgRating(fid) {
    const fidStr = safeString(fid);
    const fr = ratings.filter(r => safeString(r.filmId) === fidStr);
    if (fr.length === 0) return null;
    return (fr.reduce((a, b) => a + b.rating, 0) / fr.length).toFixed(1);
}

function getUserRating(fid, uid) {
    const fidStr = safeString(fid);
    const uidStr = safeString(uid);
    return ratings.find(r => safeString(r.filmId) === fidStr && safeString(r.userId) === uidStr);
}

function isInWatchlist(uid, fid) {
    const uidStr = safeString(uid);
    const fidStr = safeString(fid);
    return watchlist.some(w => safeString(w.userId) === uidStr && safeString(w.filmId) === fidStr);
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
        userRating: actorRatingsByUser.find(r => r.actorName === a.name && safeString(r.userId) === safeString(isAdminLoggedIn ? "admin" : currentUser))
    })).sort((a, b) => parseFloat(b.avgRating) - parseFloat(a.avgRating));
}

function renderActorStars(rating) {
    const starRating = parseInt(rating) || 0;
    let stars = '';
    for (let i = 1; i <= 5; i++) {
        stars += i <= starRating ? '<i class="fas fa-star" style="color:#f59e0b;"></i>' : '<i class="far fa-star" style="color:#cbd5e0;"></i>';
    }
    return stars;
}

// ==================== UPDATE UI =======================
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

// ==================== RENDER FUNCTIONS =======================
function performSearch() {
    const searchInput = document.getElementById("searchInput");
    if (searchInput) {
        searchQuery = searchInput.value;
        renderBeranda();
    }
}

function clearSearch() { 
    searchQuery = ""; 
    const searchInput = document.getElementById("searchInput");
    if (searchInput) searchInput.value = "";
    renderBeranda(); 
}

function performActorSearch() {
    const actorSearch = document.getElementById("actorSearch");
    if (actorSearch) {
        actorSearchQuery = actorSearch.value;
        renderTopActors();
    }
}

function clearActorSearch() {
    actorSearchQuery = "";
    const actorSearch = document.getElementById("actorSearch");
    if (actorSearch) actorSearch.value = "";
    renderTopActors();
}

function renderBeranda() {
    let filtered = searchQuery ? films.filter(f => f.title.toLowerCase().includes(searchQuery.toLowerCase())) : films;
    let html = `
        <div class="film-slider-section">
            <h2>🔥 Film Populer</h2>
            <div class="film-slider" style="display:flex; gap:20px; overflow-x:auto; padding:10px 0;">
                ${films.slice(0, 10).map(f => `
                    <div class="film-card" onclick="openFilmModal('${safeId(f.id)}')">
                        <img class="poster-img" src="${f.posterUrl}" onerror="this.src='https://via.placeholder.com/180x250?text=No+Image'">
                        <div class="poster-info">
                            <div class="poster-title">${escapeHtml(f.title)}</div>
                            <div class="poster-year">${f.year}</div>
                            <div class="poster-rating">⭐ ${getAvgRating(f.id) || '-'}/10</div>
                        </div>
                        ${isAdminLoggedIn ? `
                            <div class="admin-card-actions">
                                <button class="admin-edit-card-btn" data-film-id="${safeId(f.id)}" data-film-title="${escapeHtml(f.title)}">✏️</button>
                                <button class="admin-delete-card-btn" data-film-id="${safeId(f.id)}" data-film-title="${escapeHtml(f.title)}">🗑️</button>
                            </div>
                        ` : ''}
                    </div>
                `).join('')}
            </div>
        </div>
        <hr>
        <h2>🎬 Semua Film</h2>
        <div class="search-bar">
            <input type="text" class="search-input" id="searchInput" placeholder="Cari film..." value="${escapeHtml(searchQuery)}">
            <button onclick="performSearch()" class="login-btn" style="background:#667eea;">Cari</button>
            <button onclick="clearSearch()" class="login-btn" style="background:#e2e8f0;">Reset</button>
        </div>
        <div class="film-grid">
            ${filtered.map(f => `
                <div class="film-poster-card" onclick="openFilmModal('${safeId(f.id)}')">
                    <img class="poster-img" src="${f.posterUrl}" onerror="this.src='https://via.placeholder.com/180x250?text=No+Image'">
                    <div class="poster-info">
                        <div class="poster-title">${escapeHtml(f.title)}</div>
                        <div class="poster-year">${f.year}</div>
                        <div class="poster-rating">⭐ ${getAvgRating(f.id) || '-'}/10</div>
                    </div>
                    ${isAdminLoggedIn ? `
                        <div class="admin-card-actions">
                            <button class="admin-edit-card-btn" data-film-id="${safeId(f.id)}" data-film-title="${escapeHtml(f.title)}">✏️</button>
                            <button class="admin-delete-card-btn" data-film-id="${safeId(f.id)}" data-film-title="${escapeHtml(f.title)}">🗑️</button>
                        </div>
                    ` : ''}
                </div>
            `).join('')}
        </div>
        ${filtered.length === 0 ? '<p style="text-align:center;padding:40px;">Tidak ada film yang ditemukan.</p>' : ''}
    `;
    document.getElementById("mainContent").innerHTML = html;
    
    if (isAdminLoggedIn) {
        document.querySelectorAll('.admin-edit-card-btn').forEach(btn => {
            btn.onclick = (e) => { e.stopPropagation(); openEditFilmModal(btn.dataset.filmId); };
        });
        document.querySelectorAll('.admin-delete-card-btn').forEach(btn => {
            btn.onclick = (e) => { e.stopPropagation(); if (confirm(`Hapus film "${btn.dataset.filmTitle}"?`)) adminDeleteFilm(btn.dataset.filmId); };
        });
    }
}

function renderTopActors() {
    const all = getTopActors();
    const filtered = actorSearchQuery ? all.filter(a => a.name.toLowerCase().includes(actorSearchQuery.toLowerCase())) : all;
    const isLoggedIn = !!(currentUser || isAdminLoggedIn);
    
    let html = `
        <h2>⭐ Top Aktor</h2>
        <p style="color:#666; margin-bottom:16px;">Rating berdasarkan bintang dari komunitas</p>
        <div class="search-bar" style="display:flex; gap:10px; margin:20px 0;">
            <input type="text" class="search-input" id="actorSearch" placeholder="Cari aktor..." value="${escapeHtml(actorSearchQuery)}">
            <button onclick="performActorSearch()" class="login-btn" style="background:#667eea;">Cari</button>
            <button onclick="clearActorSearch()" class="login-btn" style="background:#e2e8f0;">Reset</button>
            ${isAdminLoggedIn ? `<button onclick="openAddActorModal()" class="login-btn" style="background:#f59e0b;">Tambah Aktor</button>` : ''}
        </div>
        <div class="actors-grid">
    `;
    
    filtered.forEach((a, i) => {
        const medal = i === 0 ? '🥇' : (i === 1 ? '🥈' : (i === 2 ? '🥉' : `#${i+1}`));
        const userRatingValue = a.userRating?.rating || 0;
        const starsDisplay = renderActorStars(userRatingValue);
        
        html += `
            <div class="actor-card">
                <img class="actor-avatar-circle" src="${a.photoUrl}" onerror="this.src='https://ui-avatars.com/api/?name=${encodeURIComponent(a.name)}&background=667eea&color=fff'">
                <div class="actor-info-modern">
                    <div class="actor-name-modern">${medal} ${escapeHtml(a.name)}</div>
                    <div class="actor-bio-modern">${escapeHtml(a.bio)}</div>
                    <div style="display:flex; gap:16px; margin:8px 0;">
                        <div>⭐ ${a.avgRating}/5</div>
                        <div>👤 ${a.ratingCount} rating</div>
                    </div>
                    ${isLoggedIn ? `
                        <div class="actor-stars-modern" style="display:flex; gap:5px; margin:8px 0;">
                            ${[1,2,3,4,5].map(s => `<i class="fas fa-star" style="font-size:24px; cursor:pointer; color:${userRatingValue >= s ? '#f59e0b' : '#cbd5e0'};" onclick="event.stopPropagation(); rateActor('${escapeHtml(a.name)}', ${s})"></i>`).join('')}
                        </div>
                        <div style="font-size:12px; color:#666;">Rating Anda: ${userRatingValue}/5 bintang ${starsDisplay}</div>
                    ` : `<button onclick="showAuthModal()" class="login-btn" style="margin-top:8px;">Login untuk Rating</button>`}
                    ${isAdminLoggedIn ? `
                        <div style="margin-top:8px; display:flex; gap:8px;">
                            <button onclick="openEditActorModal('${escapeHtml(a.name)}')" class="login-btn" style="background:#f59e0b;">Edit</button>
                            <button onclick="adminDeleteActor('${escapeHtml(a.name)}')" class="logout-btn">Hapus</button>
                        </div>
                    ` : ''}
                </div>
            </div>
        `;
    });
    html += `</div>`;
    document.getElementById("mainContent").innerHTML = html;
}

// Fungsi render lainnya (renderTopRating, renderWatchlist, renderProfile, renderAbout, renderReports)
// ... (lanjutkan dengan fungsi-fungsi render lainnya)

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

// ==================== START APP =======================
initSocket();
loadData();
initNav();

// ==================== EXPOSE GLOBAL FUNCTIONS =======================
window.doLogin = doLogin;
window.doRegister = doRegister;
window.logout = logout;
window.showAuthModal = showAuthModal;
window.closeAuthModal = closeAuthModal;
window.showLoginForm = showLoginForm;
window.showRegisterForm = showRegisterForm;
window.performSearch = performSearch;
window.clearSearch = clearSearch;
window.performActorSearch = performActorSearch;
window.clearActorSearch = clearActorSearch;
window.changeView = changeView;
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
window.viewProfile = viewProfile;
window.resolveReport = resolveReport;
window.showReportModal = showReportModal;
window.closeReportModal = closeReportModal;
window.submitReport = submitReport;
window.adminDeleteRating = adminDeleteRating;
window.filterReports = filterReports;
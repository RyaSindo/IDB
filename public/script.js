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

// ======================= HELPER FUNCTIONS =======================
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

// ==================== API HELPER =======================
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

// ==================== FUNGSI AUTH =======================
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
                        <div class="form-group"><label>Username</label><input type="text" id="loginUsername" placeholder="Masukkan username"></div>
                        <div class="form-group"><label>Password</label><input type="password" id="loginPassword" placeholder="Masukkan password"></div>
                        <button onclick="doLogin()" class="modal-btn modal-btn-primary">Login</button>
                        <div class="toggle-form">Belum punya akun? <span onclick="showRegisterForm()"><p style="color:blue;cursor:pointer;">Daftar sekarang</p></span></div>
                    </div>
                    <div id="registerForm" style="display:none;">
                        <div class="form-group"><label>Username</label><input type="text" id="regUsername" placeholder="Pilih username"></div>
                        <div class="form-group"><label>Password</label><input type="password" id="regPassword" placeholder="Minimal 6 karakter"></div>
                        <div class="form-group"><label>Konfirmasi Password</label><input type="password" id="regConfirmPassword" placeholder="Konfirmasi password"></div>
                        <div class="form-group"><label>Nama Tampilan</label><input type="text" id="regDisplayName" placeholder="Nama yang akan ditampilkan"></div>
                        <button onclick="doRegister()" class="modal-btn modal-btn-primary">Daftar</button>
                        <div class="toggle-form">Sudah punya akun? <span onclick="showLoginForm()">Login sekarang</span></div>
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

// ==================== SOCKET.IO =======================
function initSocket() {
    socket = io({
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionAttempts: 10,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        timeout: 20000,
        upgrade: true,
        forceNew: false
    });
    
    socket.on('connect', () => console.log('✅ Real-time connected'));
    socket.on('connect_error', (error) => {
        console.log('Socket connection error:', error);
        if (socket.io.opts.transports[0] !== 'polling') {
            socket.io.opts.transports = ['polling'];
            socket.connect();
        }
    });
    socket.on('film-rating-updated', () => {
        if (currentView === 'beranda' || currentView === 'toprating') {
            // Hanya update data lokal, bukan refresh penuh
            loadData(false); // force = false, hanya update jika perlu
            render();
        }
    });
    socket.on('actor-added', () => { 
        if (currentView === 'topactors') {
            loadData(false);
            renderTopActors(); 
        }
    });
    socket.on('actor-updated', () => { 
        if (currentView === 'topactors') {
            loadData(false);
            renderTopActors(); 
        }
    });
    socket.on('actor-deleted', () => { 
    if (currentView === 'topactors') {
        loadData(false);
        renderTopActors(); 
    }
});
//     socket.on('actor-rating-updated', (data) => {
//     console.log('⭐ Actor rating updated', data);
//     // Hanya update data lokal, jangan refresh seluruh view
//     // Karena refresh akan menyebabkan render ulang dan bintang berubah kembali
    
//     // Update actorRatingsByUser lokal
//     const existingIndex = actorRatingsByUser.findIndex(r => r.actorName === data.actorName && r.userId === data.userId);
//     if (existingIndex !== -1) {
//         actorRatingsByUser[existingIndex].rating = data.rating;
//         actorRatingsByUser[existingIndex].timestamp = new Date();
//     } else {
//         actorRatingsByUser.push({
//             actorName: data.actorName,
//             userId: data.userId,
//             rating: data.rating,
//             timestamp: new Date()
//         });
//     }
    
//     // Hanya rerender halaman top actors jika sedang aktif, TANPA loadData
//     if (currentView === 'topactors') {
//         renderTopActors();
//     }
// });
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
        
        // Simpan rating user saat ini sebelum load data (untuk fallback)
        const previousUserRatings = [...actorRatingsByUser];
        const currentUserId = isAdminLoggedIn ? "admin" : currentUser;
        
        users = (data.users || []).map(u => ({ ...u, _id: safeString(u._id) }));
        admins = data.admins || [];
        films = (data.films || []).map(film => ({ ...film, id: safeString(film._id), _id: safeString(film._id) }));
        ratings = (data.ratings || []).map(r => ({ ...r, filmId: safeString(r.filmId), userId: safeString(r.userId) }));
        watchlist = (data.watchlist || []).map(w => ({ ...w, userId: safeString(w.userId), filmId: safeString(w.filmId) }));
        userProfiles = data.userProfiles || {};
        reports = (data.reports || []).map(r => ({ ...r, _id: safeString(r._id) }));
        actors = (data.actors || []).map(a => ({ ...a, id: safeString(a._id), _id: safeString(a._id), filmsList: a.filmsList || [] }));
        
        // Load actor ratings - pastikan userId sudah dalam format string yang konsisten
        actorRatingsByUser = (data.actorRatingsByUser || []).map(ar => ({
            ...ar,
            userId: safeString(ar.userId),
            actorName: ar.actorName,
            rating: ar.rating,
            timestamp: ar.timestamp
        }));
        
        console.log('Loaded actor ratings from server:', actorRatingsByUser);
        console.log('Current user ID:', currentUserId);
        console.log('Current user ratings:', actorRatingsByUser.filter(r => r.userId === currentUserId));
        
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

// ==================== FUNGSI DATA HELPER =======================
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
    const currentUserId = isAdminLoggedIn ? "admin" : currentUser;
    
    // Hitung rating rata-rata dari semua user
    actorRatingsByUser.forEach(r => {
        if (!map[r.actorName]) map[r.actorName] = { total: 0, count: 0 };
        map[r.actorName].total += r.rating;
        map[r.actorName].count++;
    });
    
    // Debug: log rating user saat ini
    console.log('Current user:', currentUserId);
    console.log('All actor ratings:', actorRatingsByUser);
    console.log('Current user ratings:', actorRatingsByUser.filter(r => r.userId === currentUserId));
    
    return actors.map(a => {
        // Cari rating user saat ini untuk aktor ini
        const userRatingData = actorRatingsByUser.find(r => r.actorName === a.name && r.userId === currentUserId);
        
        console.log(`Actor ${a.name}: userRating = ${userRatingData?.rating || 'none'}`);
        
        return {
            ...a,
            avgRating: map[a.name] ? (map[a.name].total / map[a.name].count).toFixed(1) : "0.0",
            ratingCount: map[a.name]?.count || 0,
            userRating: userRatingData
        };
    }).sort((a, b) => parseFloat(b.avgRating) - parseFloat(a.avgRating));
}

function renderActorStars(rating) {
    const starRating = parseInt(rating) || 0;
    let stars = '';
    for (let i = 1; i <= 5; i++) {
        if (i <= starRating) {
            stars += '<i class="fas fa-star" style="color: #f59e0b; font-size: 18px; margin-right: 2px;"></i>';
        } else {
            stars += '<i class="far fa-star" style="color: #cbd5e0; font-size: 18px; margin-right: 2px;"></i>';
        }
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

// ==================== FILM CRUD =======================
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
    const id = document.getElementById("editFilmId")?.value;
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

// ==================== RATINGS =======================
async function addRating(fid, uid, rating, comment) {
    try {
        const res = await apiCall('/api/ratings', { 
            method: 'POST', 
            body: JSON.stringify({ filmId: fid, userId: uid, rating, comment }) 
        });
        if (res?.success) { 
            await loadData(true); 
            showToast("Rating disimpan!", "success");
            return true;
        } else {
            showToast(res?.message || "Gagal menyimpan rating!", "error");
            return false;
        }
    } catch (error) {
        console.error("Error addRating:", error);
        showToast("Gagal menyimpan rating!", "error");
        return false;
    }
}

// ==================== ACTORS =======================
async function addNewActor() {
    if (!isAdminLoggedIn) return;
    const name = document.getElementById("newActorName")?.value.trim();
    const bio = document.getElementById("newActorBio")?.value.trim();
    const photoUrl = document.getElementById("newActorPhotoUrl")?.value.trim();
    const filmsSelect = document.getElementById("newActorFilms");
    const filmsList = filmsSelect ? Array.from(filmsSelect.selectedOptions).map(opt => opt.value).filter(v => v) : [];
    
    if (!name) { showToast("Nama aktor harus diisi!", "error"); return; }
    const res = await apiCall('/api/actors', { 
        method: 'POST', 
        body: JSON.stringify({ name, bio, photo: photoUrl, filmsList }) 
    });
    if (res?.success) { 
        await loadData(true); 
        closeAddActorModal(); 
        showToast(`Aktor "${name}" ditambahkan!`, "success"); 
        render(); 
    } else {
        showToast(res?.message || "Gagal menambah aktor!", "error");
    }
}

async function updateActor() {
    if (!isAdminLoggedIn) return;
    const id = document.getElementById("editActorId")?.value;
    const name = document.getElementById("editActorName")?.value.trim();
    const bio = document.getElementById("editActorBio")?.value.trim();
    const photoUrl = document.getElementById("editActorPhotoUrl")?.value.trim();
    const filmsSelect = document.getElementById("editActorFilms");
    const filmsList = filmsSelect ? Array.from(filmsSelect.selectedOptions).map(opt => opt.value).filter(v => v) : [];
    
    const res = await apiCall(`/api/actors/${id}`, { 
        method: 'PUT', 
        body: JSON.stringify({ name, bio, photo: photoUrl, filmsList }) 
    });
    if (res?.success) { 
        await loadData(true); 
        closeEditActorModal(); 
        showToast(`Aktor "${name}" diperbarui!`, "success"); 
        render(); 
    } else {
        showToast("Gagal update aktor!", "error");
    }
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
    if (!currentUser && !isAdminLoggedIn) { 
        showToast("Login dulu!", "error"); 
        showAuthModal(); 
        return; 
    }
    const userId = isAdminLoggedIn ? "admin" : currentUser;
    
    // Simpan rating lama untuk rollback jika gagal
    const oldRatingIndex = actorRatingsByUser.findIndex(r => r.actorName === actorName && r.userId === userId);
    const oldRating = oldRatingIndex !== -1 ? actorRatingsByUser[oldRatingIndex].rating : null;
    
    // UPDATE UI SEGERA (optimistic update)
    if (oldRatingIndex !== -1) {
        actorRatingsByUser[oldRatingIndex].rating = rating;
    } else {
        actorRatingsByUser.push({
            actorName: actorName,
            userId: userId,
            rating: rating,
            timestamp: new Date()
        });
    }
    
    // Langsung render ulang halaman top actors jika sedang aktif
    if (currentView === 'topactors') {
        renderTopActors();
    }
    
    // Update modal actor jika terbuka
    const actorModal = document.getElementById('actorModal');
    if (actorModal) {
        const stars = actorModal.querySelectorAll('.fa-star[data-actor]');
        stars.forEach(s => {
            const r = parseInt(s.dataset.rating);
            s.style.color = rating >= r ? '#f59e0b' : '#cbd5e0';
        });
        const ratingSpan = actorModal.querySelector('.modal-body .fa-star[data-actor] + span');
        if (ratingSpan) ratingSpan.textContent = `${rating}/5`;
    }
    
    // Kirim ke server
    const res = await apiCall('/api/actor-ratings', { 
        method: 'POST', 
        body: JSON.stringify({ actorName, userId, rating }) 
    });
    
    if (res?.success) {
        showToast(`⭐ ${actorName}: ${rating}/5 bintang!`, "success");
    } else {
        // Rollback jika gagal
        if (oldRating !== null) {
            if (oldRatingIndex !== -1) {
                actorRatingsByUser[oldRatingIndex].rating = oldRating;
            }
        } else {
            const idx = actorRatingsByUser.findIndex(r => r.actorName === actorName && r.userId === userId);
            if (idx !== -1) {
                actorRatingsByUser.splice(idx, 1);
            }
        }
        showToast("Gagal menyimpan rating!", "error");
        if (currentView === 'topactors') {
            renderTopActors();
        }
        // Rollback modal
        if (actorModal && oldRating !== null) {
            const stars = actorModal.querySelectorAll('.fa-star[data-actor]');
            stars.forEach(s => {
                const r = parseInt(s.dataset.rating);
                s.style.color = oldRating >= r ? '#f59e0b' : '#cbd5e0';
            });
            const ratingSpan = actorModal.querySelector('.modal-body .fa-star[data-actor] + span');
            if (ratingSpan) ratingSpan.textContent = `${oldRating}/5`;
        }
    }
}

// ==================== WATCHLIST =======================
async function toggleWatchlist(uid, fid) {
    const res = await apiCall('/api/watchlist/toggle', { method: 'POST', body: JSON.stringify({ userId: uid, filmId: fid }) });
    if (res?.success) { await loadData(true); showToast(res.action === 'added' ? "Ditambahkan ke watchlist!" : "Dihapus dari watchlist!", "success"); render(); }
    else showToast("Gagal toggle watchlist!", "error");
}

// ==================== PROFILE =======================
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

// ==================== MODAL FILM =======================
function openFilmModal(id) {
    const film = films.find(f => safeString(f.id) === safeString(id));
    if (!film) {
        console.error('Film tidak ditemukan:', id);
        return;
    }
    
    joinFilmRoom(id);
    
    const avg = getAvgRating(id);
    const uid = isAdminLoggedIn ? "admin" : currentUser;
    const userRating = uid ? getUserRating(id, uid) : null;
    const inWatchlist = uid ? isInWatchlist(uid, id) : false;
    
    if (userRating) currentRating = userRating.rating;
    else currentRating = 7;
    
    const reviewListHtml = ratings.filter(r => safeString(r.filmId) === safeString(id)).sort((a,b) => b.timestamp - a.timestamp).map(r => {
        const displayName = getDisplayNameFromObjectId(r.userId);
        const canReport = (currentUser || isAdminLoggedIn) && currentUser !== displayName;
        const canDelete = isAdminLoggedIn;
        const safeUserId = safeString(r.userId);
        const safeComment = escapeHtml(r.comment);
        const safeDisplayName = escapeHtml(displayName);
        const safeFilmTitle = escapeHtml(film.title);
        const ratingValue = r.rating;
        const timestampValue = r.timestamp;
        
        return `
            <div class="review-item" style="background:#f8fafc; padding:12px; border-radius:12px; margin-bottom:10px;">
                <div class="review-header" style="display:flex; justify-content:space-between; margin-bottom:6px;">
                    <span class="review-user" onclick="viewProfile('${safeUserId}')" style="font-weight:bold; color:#667eea; cursor:pointer;">${safeDisplayName}</span>
                    <span class="review-rating" style="color:#f59e0b;">⭐ ${ratingValue}/10</span>
                </div>
                <div class="review-comment" style="margin:8px 0;">"${safeComment}"</div>
                <div class="review-time" style="font-size:10px; color:#999;">${new Date(timestampValue).toLocaleString()}</div>
                <div style="display:flex; gap:8px; margin-top:8px;">
                    ${canReport ? `<button class="report-btn" 
                        data-film-id="${safeString(id)}" 
                        data-film-title="${safeFilmTitle}" 
                        data-reported-user-id="${safeUserId}" 
                        data-reported-by="${safeDisplayName}" 
                        data-comment="${safeComment}" 
                        data-rating="${ratingValue}" 
                        data-timestamp="${timestampValue}"
                        style="background:#ef4444; color:white; border:none; padding:4px 12px; border-radius:20px; font-size:11px; cursor:pointer;"><i class="fas fa-flag"></i> Laporkan</button>` : ''}
                    ${canDelete ? `<button class="admin-delete-comment-btn" onclick="adminDeleteRating('${safeString(id)}', '${safeUserId}', '${safeComment}', '${safeDisplayName}')" style="background:#dc2626; color:white; border:none; padding:4px 12px; border-radius:20px; font-size:11px; cursor:pointer;"><i class="fas fa-trash"></i> Hapus</button>` : ''}
                </div>
            </div>
        `;
    }).join('') || '<p style="text-align:center; padding:20px;">Belum ada komentar. Jadilah yang pertama!</p>';
    
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
                            <div class="modal-title" style="font-size:20px; font-weight:bold;">${escapeHtml(film.title)} (${film.year})</div>
                            <div class="modal-synopsis" style="background:#f8fafc; padding:12px; border-radius:12px; margin:10px 0;">${escapeHtml(film.synopsis)}</div>
                            <div class="modal-avg-rating" style="background:#fef3c7; padding:6px 12px; border-radius:20px; display:inline-block;">${avg ? `⭐ Rata-rata: ${avg}/10 (${ratings.filter(r => safeString(r.filmId) === safeString(id)).length} rating)` : '⭐ Belum ada rating'}</div>
                            <div style="margin-top:15px;">
                                <button class="trailer-btn" onclick="window.open('${film.trailer}','_blank')"><i class="fab fa-youtube"></i> Tonton Trailer</button>
                                ${uid ? `<button class="watchlist-modal-btn ${inWatchlist ? 'in-watchlist' : ''}" onclick="toggleWatchlist('${uid}', '${id}'); closeFilmModal();">${inWatchlist ? '✓ Di Watchlist' : '+ Tambah ke Watchlist'}</button>` : '<button class="watchlist-modal-btn" onclick="showAuthModal()">Login untuk Watchlist</button>'}
                            </div>
                        </div>
                    </div>
                    
                    <div class="modal-rating" style="margin:20px 0; padding-top:15px; border-top:1px solid #eef2f6;">
                        ${uid ? `
                            <label style="font-weight:600;"><i class="fas fa-star"></i> Rating Kamu</label>
                            <div class="stars" id="starSelector" style="display:flex; gap:8px; justify-content:center; margin:15px 0;">
                                ${[1,2,3,4,5,6,7,8,9,10].map(s => `<span class="star" data-rating="${s}" style="font-size:32px; cursor:pointer; color:${userRating && userRating.rating >= s ? '#f59e0b' : '#cbd5e0'};">★</span>`).join('')}
                            </div>
                            <textarea id="commentInput" rows="3" placeholder="Tulis komentar..." style="width:100%; padding:12px; border:1px solid #e2e8f0; border-radius:12px;">${userRating?.comment || ''}</textarea>
                            <div class="modal-actions" style="display:flex; gap:10px;">
                                <button class="modal-btn modal-btn-primary" onclick="submitRating('${id}')"><i class="fas fa-save"></i> Simpan Rating</button>
                                ${userRating ? `<button class="modal-btn modal-btn-secondary" onclick="deleteRatingFilm('${id}')"><i class="fas fa-trash"></i> Hapus Rating</button>` : ''}
                            </div>
                        ` : `
                            <div class="login-prompt" style="text-align:center; padding:20px; background:#f8fafc; border-radius:16px;">
                                <p>Login untuk memberi rating & komentar</p>
                                <button class="login-btn" onclick="showAuthModal()">Login Sekarang</button>
                            </div>
                        `}
                    </div>
                    
                    <h3><i class="fas fa-comments"></i> Semua Komentar</h3>
                    <div class="review-list" style="max-height:300px; overflow-y:auto;">
                        ${reviewListHtml}
                    </div>
                </div>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', html);
    document.body.style.overflow = "hidden";
    
    // Attach event listener untuk tombol report
    document.querySelectorAll('.report-btn').forEach(btn => {
        btn.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            const filmId = btn.dataset.filmId;
            const filmTitle = btn.dataset.filmTitle;
            const reportedUserId = btn.dataset.reportedUserId;
            const reportedByName = btn.dataset.reportedBy;
            const comment = btn.dataset.comment;
            const rating = parseInt(btn.dataset.rating);
            const timestamp = parseInt(btn.dataset.timestamp);
            showReportModal(filmId, filmTitle, reportedUserId, reportedByName, comment, rating, timestamp);
        };
    });
    
    if (uid) {
        const stars = document.querySelectorAll("#starSelector .star");
        stars.forEach(s => {
            s.onclick = (e) => {
                e.stopPropagation();
                const val = parseInt(s.dataset.rating);
                currentRating = val;
                stars.forEach(ss => {
                    if (parseInt(ss.dataset.rating) <= currentRating) {
                        ss.classList.add("active");
                        ss.style.color = "#f59e0b";
                    } else {
                        ss.classList.remove("active");
                        ss.style.color = "#cbd5e0";
                    }
                });
            };
        });
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

function joinFilmRoom(filmId) {
    if (socket && currentFilmId !== filmId) {
        if (currentFilmId) socket.emit('leave-film', currentFilmId);
        currentFilmId = filmId;
        socket.emit('join-film', filmId);
    }
}

async function submitRating(id) {
    if (!currentUser && !isAdminLoggedIn) { 
        showToast("Login dulu!", "error"); 
        showAuthModal(); 
        return; 
    }
    const rating = currentRating || 7;
    const comment = document.getElementById("commentInput")?.value.trim() || "";
    const uid = isAdminLoggedIn ? "admin" : currentUser;
    const success = await addRating(id, uid, rating, comment);
    if (success) {
        closeFilmModal();
        setTimeout(() => openFilmModal(id), 500);
        render();
    }
}

async function deleteRatingFilm(id) {
    if (!confirm("Hapus rating ini?")) return;
    const uid = isAdminLoggedIn ? "admin" : currentUser;
    const res = await apiCall('/api/ratings', { 
        method: 'DELETE', 
        body: JSON.stringify({ filmId: id, userId: uid }) 
    });
    if (res?.success) { 
        await loadData(true); 
        showToast("Rating dihapus!", "info");
        closeFilmModal();
        setTimeout(() => openFilmModal(id), 500);
        render();
    } else {
        showToast(res?.message || "Gagal menghapus rating!", "error");
    }
}

function addCommentToUI(comment) {
    const reviewList = document.querySelector('.review-list');
    if (!reviewList) return;
    const commentHtml = `
        <div class="review-item" style="background:#fef3c7; animation: fadeIn 0.3s ease;">
            <div class="review-header">
                <span class="review-user" onclick="viewProfile('${comment.userId}')">${escapeHtml(comment.displayName)}</span>
                <span class="review-rating">⭐ ${comment.rating}/10</span>
            </div>
            <div class="review-comment">"${escapeHtml(comment.comment)}"</div>
            <div class="review-time">Baru saja</div>
        </div>
    `;
    reviewList.insertAdjacentHTML('afterbegin', commentHtml);
    setTimeout(() => {
        const newComment = reviewList.firstElementChild;
        if (newComment) newComment.style.background = '#f8fafc';
    }, 1000);
}

// ==================== MODAL ACTOR =======================
function openActorModal(actorName) {
    const actor = actors.find(a => a.name === actorName);
    if (!actor) {
        console.error('Actor tidak ditemukan:', actorName);
        return;
    }
    
    const avgRating = actor.avgRating || "0.0";
    const ratingCount = actor.ratingCount || 0;
    const userRatingValue = actor.userRating?.rating || 0;
    const isLoggedIn = !!(currentUser || isAdminLoggedIn);
    const userId = isAdminLoggedIn ? "admin" : currentUser;
    
    // Cari film-film yang dibintangi actor
    const actorFilms = films.filter(f => f.actors && f.actors.includes(actor.name));
    
    const filmsHtml = actorFilms.length > 0 ? `
        <div style="margin-top:20px;">
            <h3 style="margin-bottom:15px;"><i class="fas fa-film"></i> Film yang Dibintangi</h3>
            <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(150px,1fr)); gap:15px;">
                ${actorFilms.map(film => `
                    <div class="actor-film-card" style="background:#f8fafc; border-radius:12px; overflow:hidden; cursor:pointer; transition:all 0.2s;" onclick="closeActorModal(); openFilmModal('${film.id}')">
                        <img src="${film.posterUrl}" onerror="this.src='https://via.placeholder.com/150x220?text=No+Image'" style="width:100%; height:180px; object-fit:cover;">
                        <div style="padding:10px;">
                            <div style="font-weight:600; font-size:13px;">${escapeHtml(film.title)}</div>
                            <div style="font-size:11px; color:#666;">${film.year}</div>
                            <div style="font-size:11px; color:#f59e0b; margin-top:4px;">⭐ ${getAvgRating(film.id) || '-'}/10</div>
                        </div>
                    </div>
                `).join('')}
            </div>
        </div>
    ` : '<p style="color:#999; margin-top:20px;">Belum ada film yang diketahui untuk aktor ini.</p>';
    
    const modalHtml = `
        <div id="actorModal" class="modal active" style="display:flex; position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.7); backdrop-filter:blur(5px); z-index:1000; justify-content:center; align-items:center;">
            <div class="modal-content large" style="background:white; max-width:600px; width:90%; border-radius:20px; max-height:90vh; overflow-y:auto;">
                <div class="modal-header" style="background:linear-gradient(135deg,#667eea,#764ba2); padding:16px 20px; border-radius:20px 20px 0 0; position:relative;">
                    <h2 style="color:white;"><i class="fas fa-user"></i> ${escapeHtml(actor.name)}</h2>
                    <span class="close-modal" onclick="closeActorModal()" style="position:absolute; top:12px; right:20px; font-size:28px; cursor:pointer; color:white;">&times;</span>
                </div>
                <div class="modal-body" style="padding:20px;">
                    <div style="display:flex; gap:20px; flex-wrap:wrap; margin-bottom:20px;">
                        <img src="${actor.photoUrl}" onerror="this.src='https://ui-avatars.com/api/?name=${encodeURIComponent(actor.name)}&background=667eea&color=fff'" style="width:120px; height:120px; border-radius:50%; object-fit:cover;">
                        <div style="flex:1;">
                            <div style="margin-bottom:15px;">
                                <div style="font-size:14px; color:#666; margin-bottom:5px;">Rating Rata-rata</div>
                                <div style="font-size:28px; font-weight:bold; color:#f59e0b;">${avgRating}/5</div>
                                <div style="font-size:12px; color:#666;">dari ${ratingCount} rating</div>
                            </div>
                            ${isLoggedIn ? `
                                <div>
                                    <div style="font-size:14px; color:#666; margin-bottom:8px;">Rating Kamu:</div>
                                    <div style="display:flex; gap:8px; align-items:center;">
                                        ${[1,2,3,4,5].map(s => `
                                            <i class="fas fa-star" 
                                               data-actor="${escapeHtml(actor.name)}" 
                                               data-rating="${s}" 
                                               style="font-size:36px; cursor:pointer; color:${userRatingValue >= s ? '#f59e0b' : '#cbd5e0'}; transition:all 0.1s;">
                                            </i>
                                        `).join('')}
                                        <span style="margin-left:12px; font-size:16px;">${userRatingValue}/5</span>
                                    </div>
                                </div>
                            ` : `
                                <button onclick="closeActorModal(); showAuthModal()" class="login-btn" style="margin-top:10px;">Login untuk Rating</button>
                            `}
                        </div>
                    </div>
                    
                    <div style="margin-top:20px; padding-top:15px; border-top:1px solid #eef2f6;">
                        <h3 style="margin-bottom:10px;"><i class="fas fa-align-left"></i> Bio</h3>
                        <p style="line-height:1.6; color:#333;">${escapeHtml(actor.bio) || "Belum ada bio untuk aktor ini."}</p>
                    </div>
                    
                    ${filmsHtml}
                </div>
            </div>
        </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', modalHtml);
    document.body.style.overflow = "hidden";
    
    // Attach event listener untuk rating stars di modal
    if (isLoggedIn) {
        document.querySelectorAll('#actorModal .fa-star[data-actor]').forEach(star => {
            star.onclick = (e) => {
                e.stopPropagation();
                const actorName = star.dataset.actor;
                const rating = parseInt(star.dataset.rating);
                rateActor(actorName, rating);
                // Update tampilan rating di modal setelah rating berhasil
                setTimeout(() => {
                    const updatedActor = getTopActors().find(a => a.name === actorName);
                    if (updatedActor) {
                        const newRating = updatedActor.userRating?.rating || 0;
                        document.querySelectorAll('#actorModal .fa-star[data-actor]').forEach(s => {
                            const r = parseInt(s.dataset.rating);
                            s.style.color = newRating >= r ? '#f59e0b' : '#cbd5e0';
                        });
                        const ratingSpan = document.querySelector('#actorModal .modal-body .fa-star[data-actor] + span');
                        if (ratingSpan) ratingSpan.textContent = `${newRating}/5`;
                    }
                }, 100);
            };
        });
    }
}

function closeActorModal() {
    const modal = document.getElementById("actorModal");
    if (modal) modal.remove();
    document.body.style.overflow = "";
}

// ==================== MODAL REPORT =======================
function showReportModal(filmId, filmTitle, reportedUserId, reportedByName, comment, rating, timestamp) {
    console.log('🔍 showReportModal dipanggil');
    
    if (!currentUser && !isAdminLoggedIn) {
        showToast("Login dulu untuk melaporkan komentar!", "error");
        showAuthModal();
        return;
    }
    
    const existing = document.getElementById("reportModal");
    if (existing) existing.remove();
    
    const cleanFilmId = safeString(filmId);
    const cleanReportedUserId = safeString(reportedUserId);
    const safeFilmTitle = escapeHtml(filmTitle);
    const safeReportedByName = escapeHtml(reportedByName);
    const safeComment = escapeHtml(comment);
    
    const modalHtml = `
        <div id="reportModal" class="modal active" style="display:flex; position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.7); backdrop-filter:blur(5px); z-index:2000; justify-content:center; align-items:center;">
            <div class="modal-content" style="background:white; max-width:500px; width:90%; border-radius:20px;">
                <div class="modal-header" style="background:linear-gradient(135deg,#ef4444,#dc2626); padding:16px 20px; border-radius:20px 20px 0 0; position:relative;">
                    <h2 style="color:white;"><i class="fas fa-flag"></i> Laporkan Komentar</h2>
                    <span class="close-modal" onclick="closeReportModal()" style="position:absolute; top:12px; right:20px; font-size:28px; cursor:pointer; color:white;">&times;</span>
                </div>
                <div class="modal-body" style="padding:20px;">
                    <div style="margin-bottom:15px; padding:12px; background:#fef3c7; border-radius:12px;">
                        <div><strong>👤 Penulis:</strong> ${safeReportedByName}</div>
                        <div><strong>💬 Komentar:</strong> "${safeComment}"</div>
                        <div><strong>⭐ Rating:</strong> ${rating}/10</div>
                        <div><strong>🎬 Film:</strong> ${safeFilmTitle}</div>
                    </div>
                    <div class="form-group">
                        <label style="font-weight:600; margin-bottom:8px; display:block;">Alasan Melaporkan <span style="color:red;">*</span></label>
                        <textarea id="reportReason" rows="4" placeholder="Jelaskan alasan Anda melaporkan komentar ini..." style="width:100%; padding:12px; border:1px solid #ddd; border-radius:12px; font-family:inherit; resize:vertical;"></textarea>
                        <div style="font-size:11px; color:#666; margin-top:5px;">Minimal 5 karakter</div>
                    </div>
                    <div class="modal-actions" style="display:flex; gap:10px; margin-top:20px;">
                        <button id="submitReportBtn" class="modal-btn modal-btn-primary" style="flex:1; background:#ef4444; color:white; border:none; padding:10px; border-radius:40px; cursor:pointer;"><i class="fas fa-paper-plane"></i> Kirim Laporan</button>
                        <button onclick="closeReportModal()" class="modal-btn modal-btn-secondary" style="flex:1; background:#e2e8f0; border:none; padding:10px; border-radius:40px; cursor:pointer;"><i class="fas fa-times"></i> Batal</button>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', modalHtml);
    document.body.style.overflow = "hidden";
    
    const submitBtn = document.getElementById('submitReportBtn');
    if (submitBtn) {
        submitBtn.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            submitReport(cleanFilmId, filmTitle, cleanReportedUserId, reportedByName, comment, rating, timestamp);
        };
    }
    
    setTimeout(() => {
        const reasonTextarea = document.getElementById('reportReason');
        if (reasonTextarea) reasonTextarea.focus();
    }, 100);
}

function closeReportModal() {
    const modal = document.getElementById("reportModal");
    if (modal) modal.remove();
    document.body.style.overflow = "";
}

async function submitReport(filmId, filmTitle, reportedUserId, reportedByName, comment, rating, timestamp) {
    const reason = document.getElementById("reportReason")?.value.trim() || "";
    
    if (!reason || reason.length < 5) {
        showToast("Harap isi alasan pelaporan (minimal 5 karakter)!", "warning");
        return;
    }
    
    if (!currentUser && !isAdminLoggedIn) {
        showToast("Login dulu untuk melaporkan komentar!", "error");
        showAuthModal();
        closeReportModal();
        return;
    }
    
    if (currentUser === reportedByName) {
        showToast("Anda tidak bisa melaporkan komentar Anda sendiri!", "warning");
        closeReportModal();
        return;
    }
    
    const confirmed = confirm(`Kirim laporan untuk komentar dari "${reportedByName}"?\n\nAlasan: ${reason}\n\nLaporan akan ditinjau oleh admin.`);
    if (!confirmed) return;
    
    try {
        const res = await apiCall('/api/reports', {
            method: 'POST',
            body: JSON.stringify({
                filmId: filmId,
                filmTitle: filmTitle,
                reportedUserId: reportedUserId,
                reportedByName: reportedByName,
                reportedBy: currentUser || (isAdminLoggedIn ? "admin" : "anonymous"),
                comment: comment,
                rating: rating,
                timestamp: timestamp,
                reportReason: reason
            })
        });
        
        if (res?.success) {
            showToast("Laporan terkirim! Terima kasih atas bantuannya.", "success");
            closeReportModal();
        } else {
            showToast(res?.message || "Gagal mengirim laporan!", "error");
        }
    } catch (error) {
        console.error("Error reporting comment:", error);
        showToast("Gagal mengirim laporan!", "error");
    }
}

// ==================== ADMIN DELETE RATING =======================
async function adminDeleteRating(filmId, userId, comment, userName) {
    if (!isAdminLoggedIn) {
        showToast("Hanya admin yang dapat menghapus komentar!", "error");
        return;
    }
    if (!confirm(`Hapus komentar dari "${userName}"?\n\nKomentar: "${comment}"\n\nTindakan ini tidak dapat dibatalkan.`)) return;
    const res = await apiCall('/api/ratings', { method: 'DELETE', body: JSON.stringify({ filmId, userId }) });
    if (res?.success) {
        showToast(`Komentar dari ${userName} telah dihapus!`, "success");
        if (safeString(currentFilmId) === safeString(filmId) && document.getElementById('filmModal')) {
            closeFilmModal();
            setTimeout(() => openFilmModal(filmId), 500);
        }
        render();
    } else {
        showToast(res?.message || "Gagal menghapus komentar!", "error");
    }
}

// ==================== RESOLVE REPORT =======================
async function resolveReport(id, action) {
    const res = await apiCall(`/api/reports/${id}`, { method: 'PUT', body: JSON.stringify({ status: action === 'approve' ? 'approved' : 'rejected' }) });
    if (res?.success) { await loadData(true); showToast(action === 'approve' ? "Komentar telah dihapus!" : "Laporan ditolak.", "success"); renderReports(); render(); }
    else showToast("Gagal memproses laporan!", "error");
}

// ==================== SEARCH FUNCTIONS =======================
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

// ==================== RENDER FUNCTIONS =======================
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

function renderTopRating() {
    const topFilms = films.map(f => ({
        ...f,
        avg: parseFloat(getAvgRating(f.id)) || 0,
        cnt: ratings.filter(r => safeString(r.filmId) === safeString(f.id)).length
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
            <div class="top-card ${rankClasses[i]}" onclick="openFilmModal('${safeId(f.id)}')">
                <div class="top-card-rank">${medals[i]}</div>
                <img class="top-card-poster" src="${f.posterUrl}">
                <div class="top-card-info">
                    <div class="top-card-title">${escapeHtml(f.title)}</div>
                    <div class="top-card-year">${f.year}</div>
                    <div class="top-card-rating">⭐ ${f.avg}/10</div>
                    <div>${f.cnt} rating</div>
                </div>
            </div>
        `;
    });
    html += `</div>`;
    
    if (rest.length) {
        html += `<h3>Peringkat Selanjutnya</h3><div class="film-grid">`;
        rest.forEach((f, i) => {
            html += `
                <div class="film-poster-card" onclick="openFilmModal('${safeId(f.id)}')">
                    <div class="rank-badge">${i+4}</div>
                    <img class="poster-img" src="${f.posterUrl}">
                    <div class="poster-info">
                        <div class="poster-title">${escapeHtml(f.title)}</div>
                        <div class="poster-rating">⭐ ${f.avg}/10</div>
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
    const currentUserId = isAdminLoggedIn ? "admin" : currentUser;
    
    console.log('Rendering top actors, currentUserId:', currentUserId);
    console.log('Filtered actors with userRating:', filtered.map(a => ({ name: a.name, userRating: a.userRating?.rating })));
    
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
        
        // Buat daftar film yang pernah dibintangi
        const actorFilms = films.filter(f => f.actors && f.actors.includes(a.name));
        const filmsPreviewHtml = actorFilms.slice(0, 3).map(f => `
            <span style="background:#eef2f6; padding:2px 8px; border-radius:20px; font-size:10px; cursor:pointer;" onclick="event.stopPropagation(); openFilmModal('${f.id}')">${escapeHtml(f.title)}</span>
        `).join('');
        const moreFilmsHtml = actorFilms.length > 3 ? `<span style="background:#eef2f6; padding:2px 8px; border-radius:20px; font-size:10px;">+${actorFilms.length-3} lagi</span>` : '';
        
        html += `
            <div class="actor-card" style="background:white; border-radius:16px; padding:16px; display:flex; gap:16px; margin-bottom:16px; cursor:pointer;" onclick="openActorModal('${escapeHtml(a.name)}')">
                <img class="actor-avatar-circle" src="${a.photoUrl}" onerror="this.src='https://ui-avatars.com/api/?name=${encodeURIComponent(a.name)}&background=667eea&color=fff'" style="width:70px; height:70px; border-radius:50%; object-fit:cover;">
                <div class="actor-info-modern" style="flex:1;">
                    <div class="actor-name-modern" style="font-size:18px; font-weight:bold;">${medal} ${escapeHtml(a.name)}</div>
                    <div class="actor-bio-modern" style="font-size:12px; color:#666; margin:4px 0;">${escapeHtml(a.bio)}</div>
                    <div style="display:flex; gap:16px; align-items:center; margin:8px 0;">
                        <div style="display:flex; align-items:center; gap:4px;">
                            ${renderActorStars(parseFloat(a.avgRating))}
                            <span>(${a.avgRating}/5 dari ${a.ratingCount} rating)</span>
                        </div>
                    </div>
                    ${actorFilms.length > 0 ? `
                        <div style="margin-top:8px;">
                            <div style="font-size:11px; color:#888; margin-bottom:5px;">🎬 Film dibintangi:</div>
                            <div style="display:flex; flex-wrap:wrap; gap:5px;">
                                ${filmsPreviewHtml}
                                ${moreFilmsHtml}
                            </div>
                        </div>
                    ` : ''}
                    ${isLoggedIn ? `
                        <div class="actor-rating-section" style="margin-top:12px; padding-top:12px; border-top:1px solid #eef2f6;">
                            <div style="display:flex; gap:5px; align-items:center; flex-wrap:wrap;">
                                ${[1,2,3,4,5].map(s => `
                                    <i class="fas fa-star rating-star" 
                                       data-actor="${escapeHtml(a.name)}" 
                                       data-rating="${s}" 
                                       style="font-size:28px; cursor:pointer; color:${userRatingValue >= s ? '#f59e0b' : '#cbd5e0'}; transition:all 0.1s;">
                                    </i>
                                `).join('')}
                                <span style="margin-left:12px; font-size:14px; color:#f59e0b; font-weight:500;">Rating Anda: ${userRatingValue}/5 ⭐</span>
                            </div>
                        </div>
                    ` : `<button onclick="event.stopPropagation(); showAuthModal()" class="login-btn" style="margin-top:12px;">Login untuk Rating</button>`}
                    ${isAdminLoggedIn ? `
                        <div style="margin-top:12px; display:flex; gap:8px;">
                            <button onclick="event.stopPropagation(); openEditActorModal('${escapeHtml(a.name)}')" class="login-btn" style="background:#f59e0b;">Edit</button>
                            <button onclick="event.stopPropagation(); adminDeleteActor('${escapeHtml(a.name)}')" class="logout-btn">Hapus</button>
                        </div>
                    ` : ''}
                </div>
            </div>
        `;
    });
    html += `</div>`;
    document.getElementById("mainContent").innerHTML = html;
    
    // Attach event listener untuk rating actor
    document.querySelectorAll('.rating-star').forEach(star => {
        star.onclick = (e) => {
            e.stopPropagation();
            const actorName = star.dataset.actor;
            const rating = parseInt(star.dataset.rating);
            rateActor(actorName, rating);
        };
    });
}

function renderWatchlist() {
    if (!currentUser && !isAdminLoggedIn) {
        document.getElementById("mainContent").innerHTML = `<div style="text-align:center;padding:50px;"><p>Login dulu untuk melihat watchlist!</p><button class="login-btn" onclick="showAuthModal()">Login</button></div>`;
        return;
    }
    const uid = isAdminLoggedIn ? "admin" : currentUser;
    const wl = watchlist.filter(w => safeString(w.userId) === safeString(uid));
    if (wl.length === 0) {
        document.getElementById("mainContent").innerHTML = `<div style="text-align:center;padding:50px;"><h2>Watchlist Kosong</h2><p>Tambahkan film ke watchlist dari halaman film.</p></div>`;
        return;
    }
    
    let html = `<h2>📌 Watchlist Saya</h2><div class="film-grid">`;
    wl.forEach(w => {
        const film = films.find(f => safeString(f.id) === safeString(w.filmId));
        if (film) {
            html += `
                <div class="film-poster-card" onclick="openFilmModal('${safeId(film.id)}')">
                    <img class="poster-img" src="${film.posterUrl}">
                    <div class="poster-info">
                        <div class="poster-title">${escapeHtml(film.title)}</div>
                        <div class="poster-year">${film.year}</div>
                        <button class="logout-btn" onclick="event.stopPropagation(); toggleWatchlist('${uid}', '${film.id}')">Hapus</button>
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
        document.getElementById("mainContent").innerHTML = `<div style="text-align:center;padding:50px;"><p>Login dulu untuk melihat profil!</p><button class="login-btn" onclick="showAuthModal()">Login</button></div>`;
        return;
    }
    viewProfile(isAdminLoggedIn ? "admin" : currentUser);
}

function viewProfile(identifier) {
    const uid = safeString(identifier);
    const prof = getProfile(uid);
    const userRatings = ratings.filter(r => safeString(r.userId) === uid);
    const avatar = prof.avatarValue ? `<img src="${prof.avatarValue}" style="width:80px;height:80px;border-radius:50%;margin-bottom:10px;">` : `<i class="fas fa-user-circle" style="font-size:70px;"></i>`;
    
    let html = `
        <button class="back-btn" onclick="renderProfile()">← Kembali</button>
        <div style="text-align:center;">
            ${avatar}
            <h2>${escapeHtml(prof.displayName)}</h2>
            <p>${escapeHtml(prof.bio)}</p>
            ${(currentUser === uid || isAdminLoggedIn) ? `<button class="login-btn" onclick="openSettingModal()">Edit Profil</button>` : ''}
        </div>
        <hr>
        <h3>🏆 Top 3 Film</h3>
        <div class="film-grid">
            ${(prof.top3Films || []).map(id => {
                const f = films.find(f => safeString(f.id) === safeString(id));
                return f ? `<div class="film-poster-card" onclick="openFilmModal('${safeId(f.id)}')"><img class="poster-img" src="${f.posterUrl}"><div class="poster-info"><div class="poster-title">${escapeHtml(f.title)}</div></div></div>` : '';
            }).join('') || '<p>Belum memilih top 3 film</p>'}
        </div>
        <h3>⭐ Rating & Komentar</h3>
        ${userRatings.map(r => {
            const f = films.find(f => safeString(f.id) === safeString(r.filmId));
            return f ? `<div class="review-item"><strong>${escapeHtml(f.title)}</strong><br>⭐ ${r.rating}/10<br>"${escapeHtml(r.comment)}"</div>` : '';
        }).join('') || '<p>Belum memberi rating</p>'}
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
                <p><strong>IDB (Indie Database Film)</strong> adalah platform rating film independen dengan fitur rating dan komentar.</p>
            </div>
            <div style="background:white;border-radius:20px;padding:30px;margin-top:20px;">
                <h2><i class="fas fa-star"></i> FITUR UNGGULAN</h2>
                <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:20px;">
                    <div style="text-align:center;padding:20px;background:#f8fafc;border-radius:16px;"><i class="fas fa-star" style="font-size:40px;color:#667eea;"></i><h3>Rating Film</h3><p>1-10 bintang</p></div>
                    <div style="text-align:center;padding:20px;background:#f8fafc;border-radius:16px;"><i class="fas fa-user" style="font-size:40px;color:#667eea;"></i><h3>Rating Aktor</h3><p>1-5 bintang</p></div>
                    <div style="text-align:center;padding:20px;background:#f8fafc;border-radius:16px;"><i class="fas fa-bookmark" style="font-size:40px;color:#667eea;"></i><h3>Watchlist</h3><p>Simpan film favorit</p></div>
                    <div style="text-align:center;padding:20px;background:#f8fafc;border-radius:16px;"><i class="fas fa-trophy" style="font-size:40px;color:#667eea;"></i><h3>Top Rating</h3><p>Peringkat film terbaik</p></div>
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
    const approved = reports.filter(r => r.status === 'approved');
    const rejected = reports.filter(r => r.status === 'rejected');
    
    let html = `
        <h2>🚩 Laporan Komentar</h2>
        <div style="margin-bottom:20px; display:flex; gap:10px; flex-wrap:wrap;">
            <button onclick="filterReports('pending')" id="filterPending" class="login-btn" style="background:#667eea;">Tertunda (${pending.length})</button>
            <button onclick="filterReports('approved')" id="filterApproved" class="login-btn" style="background:#10b981;">Disetujui (${approved.length})</button>
            <button onclick="filterReports('rejected')" id="filterRejected" class="login-btn" style="background:#ef4444;">Ditolak (${rejected.length})</button>
        </div>
        <div id="reportsList">
    `;
    
    if (pending.length === 0 && approved.length === 0 && rejected.length === 0) {
        html += `<p>Tidak ada laporan.</p>`;
    } else {
        [...pending, ...approved, ...rejected].forEach(r => {
            const statusColor = r.status === 'pending' ? '#f59e0b' : (r.status === 'approved' ? '#10b981' : '#ef4444');
            const statusText = r.status === 'pending' ? 'Tertunda' : (r.status === 'approved' ? 'Disetujui (Komentar dihapus)' : 'Ditolak');
            
            html += `
                <div class="review-item report-item" data-status="${r.status}" style="border-left: 4px solid ${statusColor};">
                    <div><strong>🎬 ${escapeHtml(r.filmTitle)}</strong></div>
                    <div>💬 Komentar: "${escapeHtml(r.comment)}"</div>
                    <div>⭐ Rating: ${r.rating}/10</div>
                    <div>👤 Penulis: ${escapeHtml(r.reportedByName)}</div>
                    <div>📢 Dilaporkan oleh: ${escapeHtml(r.reportedBy)}</div>
                    ${r.reportReason ? `<div>📋 Alasan: ${escapeHtml(r.reportReason)}</div>` : ''}
                    <div>📅 Tanggal: ${new Date(r.timestamp).toLocaleString()}</div>
                    <div>🏷️ Status: <span style="color:${statusColor};">${statusText}</span></div>
                    ${r.status === 'pending' ? `
                        <div style="margin-top:10px; display:flex; gap:10px;">
                            <button onclick="resolveReport('${r._id}', 'approve')" class="login-btn" style="background:#10b981;">✅ Hapus Komentar</button>
                            <button onclick="resolveReport('${r._id}', 'reject')" class="login-btn" style="background:#ef4444;">❌ Tolak Laporan</button>
                        </div>
                    ` : ''}
                </div>
            `;
        });
    }
    html += `</div>`;
    document.getElementById("mainContent").innerHTML = html;
    filterReports('pending');
}

let currentReportFilter = 'pending';

function filterReports(status) {
    currentReportFilter = status;
    document.querySelectorAll('.report-item').forEach(item => {
        item.style.display = item.getAttribute('data-status') === status ? 'block' : 'none';
    });
    ['filterPending', 'filterApproved', 'filterRejected'].forEach(id => {
        const btn = document.getElementById(id);
        if (btn) btn.style.opacity = '0.6';
    });
    const activeBtn = status === 'pending' ? 'filterPending' : (status === 'approved' ? 'filterApproved' : 'filterRejected');
    const activeBtnEl = document.getElementById(activeBtn);
    if (activeBtnEl) activeBtnEl.style.opacity = '1';
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

// ==================== ADMIN MODALS =======================
function openAddFilmModal() {
    if (!isAdminLoggedIn) { showToast("Hanya admin!", "error"); return; }
    tempPosterImage = null;
    const html = `
        <div id="addFilmModal" class="modal active" style="display:flex; position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.7); backdrop-filter:blur(5px); z-index:1000; justify-content:center; align-items:center;">
            <div class="modal-content large" style="background:white; max-width:800px; width:90%; border-radius:20px;">
                <div class="modal-header" style="background:linear-gradient(135deg,#667eea,#764ba2); padding:16px 20px; border-radius:20px 20px 0 0;">
                    <h2><i class="fas fa-plus-circle"></i> Tambah Film Baru</h2>
                    <span class="close-modal" onclick="closeAddFilmModal()">&times;</span>
                </div>
                <div class="modal-body">
                    <div class="form-group"><label>Judul Film</label><input type="text" id="newFilmTitle" placeholder="Contoh: Inception"></div>
                    <div class="form-row"><div class="form-group"><label>Tahun Rilis</label><input type="number" id="newFilmYear" placeholder="2024"></div>
                    <div class="form-group"><label>URL Poster</label><input type="text" id="newFilmPoster" placeholder="https://..."></div></div>
                    <div class="form-group"><label>URL Trailer</label><input type="text" id="newFilmTrailer" placeholder="https://youtube.com/..."></div>
                    <div class="form-group"><label>Sinopsis</label><textarea id="newFilmSynopsis" rows="4"></textarea></div>
                    <div class="form-group"><label>Aktor (pisah koma)</label><input type="text" id="newFilmActors" placeholder="Tom Hanks, Leonardo DiCaprio"></div>
                    <div class="modal-actions"><button onclick="addNewFilm()" class="modal-btn modal-btn-primary">Tambah Film</button><button onclick="closeAddFilmModal()" class="modal-btn modal-btn-secondary">Batal</button></div>
                </div>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', html);
}
function closeAddFilmModal() { const m = document.getElementById("addFilmModal"); if (m) m.remove(); tempPosterImage = null; }

function openEditFilmModal(id) {
    if (!isAdminLoggedIn) { showToast("Hanya admin!", "error"); return; }
    const film = films.find(f => safeString(f.id) === safeString(id));
    if (!film) return;
    tempPosterImage = null;
    const html = `
        <div id="editFilmModal" class="modal active" style="display:flex; position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.7); backdrop-filter:blur(5px); z-index:1000; justify-content:center; align-items:center;">
            <div class="modal-content large" style="background:white; max-width:800px; width:90%; border-radius:20px;">
                <div class="modal-header" style="background:linear-gradient(135deg,#667eea,#764ba2); padding:16px 20px; border-radius:20px 20px 0 0;">
                    <h2><i class="fas fa-edit"></i> Edit Film</h2>
                    <span class="close-modal" onclick="closeEditFilmModal()">&times;</span>
                </div>
                <div class="modal-body">
                    <input type="hidden" id="editFilmId" value="${film.id}">
                    <div class="form-group"><label>Judul</label><input type="text" id="editFilmTitle" value="${escapeHtml(film.title)}"></div>
                    <div class="form-row"><div class="form-group"><label>Tahun</label><input type="number" id="editFilmYear" value="${film.year}"></div>
                    <div class="form-group"><label>URL Poster</label><input type="text" id="editFilmPoster" value="${film.posterUrl}"></div></div>
                    <div class="form-group"><label>URL Trailer</label><input type="text" id="editFilmTrailer" value="${film.trailer}"></div>
                    <div class="form-group"><label>Sinopsis</label><textarea id="editFilmSynopsis" rows="4">${escapeHtml(film.synopsis)}</textarea></div>
                    <div class="form-group"><label>Aktor (pisah koma)</label><input type="text" id="editFilmActors" value="${film.actors ? film.actors.join(', ') : ''}"></div>
                    <div class="modal-actions"><button onclick="updateFilm()" class="modal-btn modal-btn-primary">Simpan</button><button onclick="closeEditFilmModal()" class="modal-btn modal-btn-secondary">Batal</button></div>
                </div>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', html);
}
function closeEditFilmModal() { const m = document.getElementById("editFilmModal"); if (m) m.remove(); tempPosterImage = null; }

function openAddActorModal() {
    if (!isAdminLoggedIn) { showToast("Hanya admin!", "error"); return; }
    
    // Buat opsi film dari daftar film yang ada
    const filmOptions = films.map(f => `<option value="${escapeHtml(f.title)}">${escapeHtml(f.title)} (${f.year})</option>`).join('');
    
    const html = `
        <div id="addActorModal" class="modal active" style="display:flex; position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.7); backdrop-filter:blur(5px); z-index:1000; justify-content:center; align-items:center;">
            <div class="modal-content" style="background:white; max-width:500px; width:90%; border-radius:20px;">
                <div class="modal-header" style="background:linear-gradient(135deg,#667eea,#764ba2); padding:16px 20px; border-radius:20px 20px 0 0;">
                    <h2><i class="fas fa-user-plus"></i> Tambah Aktor</h2>
                    <span class="close-modal" onclick="closeAddActorModal()">&times;</span>
                </div>
                <div class="modal-body">
                    <div class="form-group">
                        <label>Nama Aktor</label>
                        <input type="text" id="newActorName" placeholder="Tom Hanks">
                    </div>
                    <div class="form-group">
                        <label>Bio</label>
                        <textarea id="newActorBio" rows="3" placeholder="Biografi singkat aktor..."></textarea>
                    </div>
                    <div class="form-group">
                        <label>Foto URL</label>
                        <input type="text" id="newActorPhotoUrl" placeholder="https://... (opsional)">
                    </div>
                    <div class="form-group">
                        <label><i class="fas fa-film"></i> Film yang pernah dibintangi</label>
                        <select id="newActorFilms" multiple style="height:120px;">
                            <option value="">-- Pilih film (bisa lebih dari satu dengan Ctrl+Click) --</option>
                            ${filmOptions}
                        </select>
                        <small style="color:#666; font-size:11px;">Tekan Ctrl (atau Cmd di Mac) untuk memilih beberapa film</small>
                    </div>
                    <div class="modal-actions">
                        <button onclick="addNewActor()" class="modal-btn modal-btn-primary">Tambah</button>
                        <button onclick="closeAddActorModal()" class="modal-btn modal-btn-secondary">Batal</button>
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
    
    // Buat opsi film dengan selected jika film sudah dipilih actor
    const filmOptions = films.map(f => `<option value="${escapeHtml(f.title)}" ${actor.filmsList?.includes(f.title) ? 'selected' : ''}>${escapeHtml(f.title)} (${f.year})</option>`).join('');
    
    const html = `
        <div id="editActorModal" class="modal active" style="display:flex; position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.7); backdrop-filter:blur(5px); z-index:1000; justify-content:center; align-items:center;">
            <div class="modal-content" style="background:white; max-width:500px; width:90%; border-radius:20px;">
                <div class="modal-header" style="background:linear-gradient(135deg,#667eea,#764ba2); padding:16px 20px; border-radius:20px 20px 0 0;">
                    <h2><i class="fas fa-edit"></i> Edit Aktor</h2>
                    <span class="close-modal" onclick="closeEditActorModal()">&times;</span>
                </div>
                <div class="modal-body">
                    <input type="hidden" id="editActorId" value="${actor.id}">
                    <div class="form-group"><label>Nama</label><input type="text" id="editActorName" value="${escapeHtml(actor.name)}"></div>
                    <div class="form-group"><label>Bio</label><textarea id="editActorBio" rows="3">${escapeHtml(actor.bio)}</textarea></div>
                    <div class="form-group"><label>Foto URL</label><input type="text" id="editActorPhotoUrl" value="${actor.photoUrl}"></div>
                    <div class="form-group">
                        <label><i class="fas fa-film"></i> Film yang pernah dibintangi</label>
                        <select id="editActorFilms" multiple style="height:120px;">
                            <option value="">-- Pilih film (bisa lebih dari satu dengan Ctrl+Click) --</option>
                            ${filmOptions}
                        </select>
                        <small style="color:#666; font-size:11px;">Tekan Ctrl (atau Cmd di Mac) untuk memilih beberapa film</small>
                    </div>
                    <div class="modal-actions">
                        <button onclick="updateActor()" class="modal-btn modal-btn-primary">Simpan</button>
                        <button onclick="closeEditActorModal()" class="modal-btn modal-btn-secondary">Batal</button>
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
    const ratedFilms = ratings.filter(r => safeString(r.userId) === safeString(uid)).map(r => films.find(f => safeString(f.id) === safeString(r.filmId))).filter(f => f);
    tempAvatarImage = prof.avatarValue;
    const avatar = prof.avatarValue || `https://ui-avatars.com/api/?name=${prof.displayName}&background=667eea&color=fff`;
    
    const html = `
        <div id="settingModal" class="modal active" style="display:flex; position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.7); backdrop-filter:blur(5px); z-index:1000; justify-content:center; align-items:center;">
            <div class="modal-content" style="background:white; max-width:500px; width:90%; border-radius:20px;">
                <div class="modal-header" style="background:linear-gradient(135deg,#667eea,#764ba2); padding:16px 20px; border-radius:20px 20px 0 0;">
                    <h2><i class="fas fa-user-edit"></i> Edit Profil</h2>
                    <span class="close-modal" onclick="closeSettingModal()">&times;</span>
                </div>
                <div class="modal-body">
                    <div style="text-align:center;"><img id="avatarPreview" src="${avatar}" style="width:80px;height:80px;border-radius:50%;margin-bottom:10px;"><br><button class="login-btn" onclick="document.getElementById('avatarUpload').click()">Upload Foto</button><input type="file" id="avatarUpload" accept="image/*" style="display:none;"></div>
                    <div class="form-group"><label>Nama Tampilan</label><input type="text" id="settingDisplayName" value="${escapeHtml(prof.displayName)}"></div>
                    <div class="form-group"><label>Bio</label><textarea id="settingBio" rows="3">${escapeHtml(prof.bio)}</textarea></div>
                    ${ratedFilms.length > 0 ? `
                        <div class="form-group"><label>Top 3 Film</label>
                            <select id="top1Select"><option value="">-- Film #1 --</option>${ratedFilms.map(f => `<option value="${f.id}" ${prof.top3Films[0] == f.id ? 'selected' : ''}>${escapeHtml(f.title)}</option>`).join('')}</select>
                            <select id="top2Select"><option value="">-- Film #2 --</option>${ratedFilms.map(f => `<option value="${f.id}" ${prof.top3Films[1] == f.id ? 'selected' : ''}>${escapeHtml(f.title)}</option>`).join('')}</select>
                            <select id="top3Select"><option value="">-- Film #3 --</option>${ratedFilms.map(f => `<option value="${f.id}" ${prof.top3Films[2] == f.id ? 'selected' : ''}>${escapeHtml(f.title)}</option>`).join('')}</select>
                        </div>
                    ` : '<p>Belum ada film yang dirating</p>'}
                    <div class="modal-actions"><button onclick="saveProfile()" class="modal-btn modal-btn-primary">Simpan</button><button onclick="closeSettingModal()" class="modal-btn modal-btn-secondary">Batal</button></div>
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
window.performSearch = performSearch;
window.clearSearch = clearSearch;
window.performActorSearch = performActorSearch;
window.clearActorSearch = clearActorSearch;
window.viewProfile = viewProfile;
window.resolveReport = resolveReport;
window.changeView = changeView;
window.showReportModal = showReportModal;
window.closeReportModal = closeReportModal;
window.submitReport = submitReport;
window.adminDeleteRating = adminDeleteRating;
window.filterReports = filterReports;
window.openActorModal = openActorModal;
window.closeActorModal = closeActorModal;
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

// Helper function untuk safe string
function safeString(value) {
    if (value === undefined || value === null) return '';
    return String(value);
}

function safeId(value) {
    if (value === undefined || value === null) return '';
    return String(value).replace(/[^a-zA-Z0-9]/g, '');
}

// ======================= SOCKET.IO REAL-TIME =======================
function initSocket() {
    socket = io({ transports: ['polling'] });
    
    socket.on('connect', () => {
        console.log('✅ Real-time connected');
    });
    
    socket.on('film-rating-updated', (data) => {
        console.log('📊 Film rating updated', data);
        if (currentView === 'beranda' || currentView === 'toprating') refreshCurrentView();
        if (safeString(currentFilmId) === safeString(data.filmId)) updateModalRating(data);
    });
    
    socket.on('rating-deleted', (data) => {
        console.log('🗑️ Rating deleted', data);
        if (currentView === 'beranda' || currentView === 'toprating') refreshCurrentView();
        if (safeString(currentFilmId) === safeString(data.filmId) && document.getElementById('filmModal')) {
            closeFilmModal();
            setTimeout(() => openFilmModal(currentFilmId), 500);
        }
    });
    
    socket.on('actor-added', (data) => {
        console.log('⭐ Actor added:', data.actor);
        if (currentView === 'topactors') refreshCurrentView();
    });
    socket.on('actor-updated', (data) => {
        console.log('📝 Actor updated:', data.actor);
        if (currentView === 'topactors') refreshCurrentView();
    });
    socket.on('actor-deleted', (data) => {
        console.log('🗑️ Actor deleted:', data.actorName);
        if (currentView === 'topactors') refreshCurrentView();
    });
    socket.on('actor-rating-updated', (data) => {
        console.log('⭐ Actor rating updated', data);
        if (currentView === 'topactors') refreshCurrentView();
    });
    
    socket.on('new-comment', (data) => {
        console.log('💬 New comment', data);
        if (safeString(currentFilmId) === safeString(data.filmId) && document.getElementById('filmModal')) {
            addCommentToUI(data);
        }
    });
    
    socket.on('data-updated', () => refreshCurrentView());
    socket.on('global-refresh', () => refreshCurrentView());
    socket.on('film-added', () => refreshCurrentView());
    socket.on('film-updated', () => refreshCurrentView());
    socket.on('film-deleted', () => refreshCurrentView());
    
    socket.on('watchlist-updated', (data) => {
        if (safeString(data.userId) === safeString(currentUser || 'admin')) {
            if (currentView === 'watchlist') refreshCurrentView();
        }
    });
    socket.on('profile-updated', (data) => {
        if (safeString(data.userId) === safeString(currentUser || 'admin')) updateUI();
        if (currentView === 'profile') refreshCurrentView();
    });
    
    socket.on('new-report', (data) => {
        console.log('📢 New report received:', data);
        reports.push(data.report);
        if (currentView === 'reports' && isAdminLoggedIn) renderReports();
        if (isAdminLoggedIn) {
            showToast(`📢 Laporan baru dari ${data.report.reportedBy} untuk komentar ${data.report.reportedByName}`, 'warning');
        }
    });
    
    socket.on('show-toast', (data) => showToast(data.message, data.type));
    socket.on('disconnect', () => console.log('❌ Real-time disconnected'));
    socket.on('reconnect', () => {
        console.log('✅ Real-time reconnected');
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
        if (!data) return;
        if (data.error) {
            showToast("Error server: " + (data.message || 'Unknown'), "error");
            return;
        }
        
        users = (data.users || []).map(u => ({ ...u, _id: safeString(u._id) }));
        admins = data.admins || [];
        films = (data.films || []).map(film => ({ ...film, id: safeString(film._id), _id: safeString(film._id) }));
        ratings = (data.ratings || []).map(r => ({ ...r, filmId: safeString(r.filmId), userId: safeString(r.userId) }));
        watchlist = (data.watchlist || []).map(w => ({ ...w, userId: safeString(w.userId), filmId: safeString(w.filmId) }));
        userProfiles = data.userProfiles || {};
        reports = (data.reports || []).map(r => ({ ...r, _id: safeString(r._id), filmId: safeString(r.filmId), reportedUserId: safeString(r.reportedUserId) }));
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

function showToast(msg, type = "info") {
    const toast = document.createElement("div");
    toast.className = `toast ${type}`;
    toast.innerHTML = msg;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 2500);
}

function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/[&<>]/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[m]));
}

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
    if (idStr === 'admin') return 'Administrator';
    return 'Unknown User';
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

function isInWatchlist(uid, fid) {
    const uidStr = safeString(uid);
    const fidStr = safeString(fid);
    return watchlist.some(w => safeString(w.userId) === uidStr && safeString(w.filmId) === fidStr);
}

// Fungsi untuk menampilkan bintang actor rating
function renderActorStars(rating) {
    const starRating = parseInt(rating) || 0;
    let stars = '';
    for (let i = 1; i <= 5; i++) {
        if (i <= starRating) {
            stars += '<i class="fas fa-star" style="color:#f59e0b;"></i>';
        } else {
            stars += '<i class="far fa-star" style="color:#cbd5e0;"></i>';
        }
    }
    return stars;
}

// ======================= AUTH =======================
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

// ======================= RENDER FUNCTIONS =======================
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
                        <div class="film-card" style="flex:0 0 180px; background:white; border-radius:12px; overflow:hidden; cursor:pointer; position:relative;" onclick="openFilmModal('${safeId(f.id)}')">
                            <img class="poster-img" src="${f.posterUrl}" onerror="this.src='https://via.placeholder.com/180x250?text=No+Image'" style="width:100%; height:250px; object-fit:cover;">
                            <div class="poster-info" style="padding:10px;">
                                <div class="poster-title" style="font-weight:600;">${escapeHtml(f.title)}</div>
                                <div class="poster-year" style="font-size:12px; color:#666;">${f.year}</div>
                                <div class="poster-rating" style="color:#f59e0b;">⭐ ${avg || '-'}/10</div>
                            </div>
                            ${isAdminLoggedIn ? `
                                <div class="admin-card-actions" style="position:absolute; top:8px; right:8px; display:flex; gap:5px; z-index:10;">
                                    <button class="admin-edit-card-btn" data-film-id="${safeId(f.id)}" data-film-title="${escapeHtml(f.title)}" style="background:rgba(0,0,0,0.7); border:none; width:28px; height:28px; border-radius:50%; color:white; cursor:pointer;">✏️</button>
                                    <button class="admin-delete-card-btn" data-film-id="${safeId(f.id)}" data-film-title="${escapeHtml(f.title)}" style="background:rgba(0,0,0,0.7); border:none; width:28px; height:28px; border-radius:50%; color:white; cursor:pointer;">🗑️</button>
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
            <button onclick="performSearch()" class="login-btn" style="background:#667eea;">Cari</button>
            <button onclick="clearSearch()" class="login-btn" style="background:#e2e8f0;">Reset</button>
        </div>
        <div class="film-grid" style="display:grid; grid-template-columns:repeat(auto-fill, minmax(180px,1fr)); gap:20px;">
            ${filtered.map(f => {
                const avg = getAvgRating(f.id);
                return `
                    <div class="film-poster-card" style="background:white; border-radius:12px; overflow:hidden; cursor:pointer; position:relative;" onclick="openFilmModal('${safeId(f.id)}')">
                        <img class="poster-img" src="${f.posterUrl}" onerror="this.src='https://via.placeholder.com/180x250?text=No+Image'" style="width:100%; height:250px; object-fit:cover;">
                        <div class="poster-info" style="padding:10px;">
                            <div class="poster-title" style="font-weight:600;">${escapeHtml(f.title)}</div>
                            <div class="poster-year" style="font-size:12px; color:#666;">${f.year}</div>
                            <div class="poster-rating" style="color:#f59e0b;">⭐ ${avg || '-'}/10</div>
                        </div>
                        ${isAdminLoggedIn ? `
                            <div class="admin-card-actions" style="position:absolute; top:8px; right:8px; display:flex; gap:5px; z-index:10;">
                                <button class="admin-edit-card-btn" data-film-id="${safeId(f.id)}" data-film-title="${escapeHtml(f.title)}" style="background:rgba(0,0,0,0.7); border:none; width:28px; height:28px; border-radius:50%; color:white; cursor:pointer;">✏️</button>
                                <button class="admin-delete-card-btn" data-film-id="${safeId(f.id)}" data-film-title="${escapeHtml(f.title)}" style="background:rgba(0,0,0,0.7); border:none; width:28px; height:28px; border-radius:50%; color:white; cursor:pointer;">🗑️</button>
                            </div>
                        ` : ''}
                    </div>
                `;
            }).join('')}
        </div>
        ${filtered.length === 0 ? '<p class="text-center" style="padding:40px;">Tidak ada film yang ditemukan.</p>' : ''}
    `;
    document.getElementById("mainContent").innerHTML = html;
    
    if (isAdminLoggedIn) {
        document.querySelectorAll('.admin-edit-card-btn').forEach(btn => {
            btn.onclick = (e) => {
                e.stopPropagation();
                openEditFilmModal(btn.dataset.filmId);
            };
        });
        document.querySelectorAll('.admin-delete-card-btn').forEach(btn => {
            btn.onclick = (e) => {
                e.stopPropagation();
                if (confirm(`Hapus film "${btn.dataset.filmTitle}"?`)) {
                    adminDeleteFilm(btn.dataset.filmId);
                }
            };
        });
    }
    
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        searchInput.onkeypress = (e) => { if (e.key === 'Enter') performSearch(); };
    }
}

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
            <div class="top-card ${rankClasses[i]}" style="background:white; border-radius:16px; overflow:hidden; cursor:pointer; position:relative; ${i===0?'border:2px solid #FFD700':(i===1?'border:2px solid #C0C0C0':'border:2px solid #CD7F32')}" onclick="openFilmModal('${safeId(f.id)}')">
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
                <div class="film-poster-card" style="background:white; border-radius:12px; overflow:hidden; cursor:pointer; position:relative;" onclick="openFilmModal('${safeId(f.id)}')">
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
        <p style="color:#666; margin-bottom:16px;">Rating berdasarkan bintang dari komunitas</p>
        <div class="search-bar" style="display:flex; gap:10px; margin:20px 0;">
            <input type="text" class="search-input" id="actorSearch" placeholder="Cari aktor..." value="${escapeHtml(actorSearchQuery)}" style="flex:1; padding:10px 16px; border:1px solid #ddd; border-radius:40px;">
            <button onclick="performActorSearch()" class="login-btn" style="background:#667eea;">Cari</button>
            <button onclick="clearActorSearch()" class="login-btn" style="background:#e2e8f0;">Reset</button>
            ${isAdminLoggedIn ? `<button onclick="openAddActorModal()" class="login-btn" style="background:#f59e0b;">Tambah Aktor</button>` : ''}
        </div>
        <div class="actors-grid" style="display:grid; grid-template-columns:repeat(auto-fill, minmax(300px,1fr)); gap:16px;">
    `;
    
    filtered.forEach((a, i) => {
        const medal = i === 0 ? '🥇' : (i === 1 ? '🥈' : (i === 2 ? '🥉' : `#${i+1}`));
        const userRatingValue = a.userRating?.rating || 0;
        const starsDisplay = renderActorStars(userRatingValue);
        
        html += `
            <div class="actor-card" style="background:white; border-radius:16px; padding:16px; display:flex; gap:16px; cursor:pointer; transition:all 0.2s;">
                <img class="actor-avatar-circle" src="${a.photoUrl}" onerror="this.src='https://ui-avatars.com/api/?name=${encodeURIComponent(a.name)}&background=667eea&color=fff'" style="width:70px; height:70px; border-radius:50%; object-fit:cover;">
                <div class="actor-info-modern" style="flex:1;">
                    <div class="actor-name-modern" style="font-size:18px; font-weight:bold;">${medal} ${escapeHtml(a.name)}</div>
                    <div class="actor-bio-modern" style="font-size:12px; color:#666; margin:4px 0;">${escapeHtml(a.bio)}</div>
                    <div style="display:flex; gap:16px; margin:8px 0;">
                        <div>⭐ ${a.avgRating}/5</div>
                        <div>👤 ${a.ratingCount} rating</div>
                    </div>
                    ${isLoggedIn ? `
                        <div class="actor-stars-modern" style="display:flex; gap:5px; margin:8px 0;">
                            ${[1,2,3,4,5].map(s => `<i class="fas fa-star" style="font-size:24px; cursor:pointer; color:${userRatingValue >= s ? '#f59e0b' : '#cbd5e0'};" onclick="event.stopPropagation(); rateActor('${escapeHtml(a.name)}', ${s})"></i>`).join('')}
                        </div>
                        <div style="font-size:12px; color:#666;">Rating Anda: ${userRatingValue}/5 bintang</div>
                    ` : `<button onclick="event.stopPropagation(); showAuthModal()" class="login-btn" style="margin-top:8px;">Login untuk Rating</button>`}
                    ${isAdminLoggedIn ? `
                        <div style="margin-top:8px; display:flex; gap:8px;">
                            <button onclick="event.stopPropagation(); openEditActorModal('${escapeHtml(a.name)}')" class="login-btn" style="background:#f59e0b;">Edit</button>
                            <button onclick="event.stopPropagation(); adminDeleteActor('${escapeHtml(a.name)}')" class="logout-btn" style="background:transparent; border:1px solid #e2e8f0; padding:6px 12px; border-radius:40px; cursor:pointer; color:#e53e3e;">Hapus</button>
                        </div>
                    ` : ''}
                </div>
            </div>
        `;
    });
    html += `</div>`;
    document.getElementById("mainContent").innerHTML = html;
    
    const actorSearch = document.getElementById('actorSearch');
    if (actorSearch) {
        actorSearch.onkeypress = (e) => { if (e.key === 'Enter') performActorSearch(); };
    }
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
    
    let html = `<h2>📌 Watchlist Saya</h2><div class="film-grid" style="display:grid; grid-template-columns:repeat(auto-fill, minmax(180px,1fr)); gap:20px;">`;
    wl.forEach(w => {
        const film = films.find(f => safeString(f.id) === safeString(w.filmId));
        if (film) {
            html += `
                <div class="film-poster-card" style="background:white; border-radius:12px; overflow:hidden; cursor:pointer; position:relative;" onclick="openFilmModal('${safeId(film.id)}')">
                    <img class="poster-img" src="${film.posterUrl}" style="width:100%; height:250px; object-fit:cover;">
                    <div class="poster-info" style="padding:10px;">
                        <div class="poster-title" style="font-weight:600;">${escapeHtml(film.title)}</div>
                        <div class="poster-year" style="font-size:12px; color:#666;">${film.year}</div>
                        <button class="logout-btn" style="margin-top:8px; width:100%;" onclick="event.stopPropagation(); toggleWatchlist('${uid}', '${film.id}')">Hapus</button>
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
        <button class="back-btn" onclick="renderProfile()" style="background:#e2e8f0; border:none; padding:8px 20px; border-radius:40px; cursor:pointer; margin-bottom:16px;">← Kembali</button>
        <div style="text-align:center;">
            ${avatar}
            <h2>${escapeHtml(prof.displayName)}</h2>
            <p style="color:#666;">${escapeHtml(prof.bio)}</p>
            ${(currentUser === uid || isAdminLoggedIn) ? `<button class="login-btn" onclick="openSettingModal()" style="margin-top:10px;">Edit Profil</button>` : ''}
        </div>
        <hr style="margin:20px 0;">
        <h3>🏆 Top 3 Film</h3>
        <div class="film-grid" style="display:grid; grid-template-columns:repeat(auto-fill, minmax(180px,1fr)); gap:20px;">
            ${(prof.top3Films || []).map(id => {
                const f = films.find(f => safeString(f.id) === safeString(id));
                return f ? `<div class="film-poster-card" style="background:white; border-radius:12px; overflow:hidden; cursor:pointer;" onclick="openFilmModal('${safeId(f.id)}')"><img class="poster-img" src="${f.posterUrl}" style="width:100%; height:250px; object-fit:cover;"><div class="poster-info" style="padding:10px;"><div class="poster-title" style="font-weight:600;">${escapeHtml(f.title)}</div></div></div>` : '';
            }).join('') || '<p style="color:#999;">Belum memilih top 3 film</p>'}
        </div>
        <h3>⭐ Rating & Komentar</h3>
        ${userRatings.map(r => {
            const f = films.find(f => safeString(f.id) === safeString(r.filmId));
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
                <p><strong>IDB (Indie Database Film)</strong> adalah platform rating film independen dengan fitur rating dan komentar.</p>
            </div>
            <div style="background:white;border-radius:20px;padding:30px;margin-top:20px;">
                <h2><i class="fas fa-star"></i> FITUR UNGGULAN</h2>
                <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:20px;margin-top:20px;">
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
                <div class="review-item report-item" data-status="${r.status}" style="background:#f8fafc; padding:12px; border-radius:12px; margin-bottom:10px; border-left: 4px solid ${statusColor};">
                    <div><strong>🎬 ${escapeHtml(r.filmTitle)}</strong></div>
                    <div>💬 Komentar: "${escapeHtml(r.comment)}"</div>
                    <div>⭐ Rating: ${r.rating}/10</div>
                    <div>👤 Penulis: ${escapeHtml(r.reportedByName)}</div>
                    <div>📢 Dilaporkan oleh: ${escapeHtml(r.reportedBy)}</div>
                    ${r.reportReason ? `<div>📋 Alasan: <span style="background:#fef3c7; padding:2px 8px; border-radius:20px; font-size:12px;">${escapeHtml(r.reportReason)}</span></div>` : ''}
                    <div>📅 Tanggal: ${new Date(r.timestamp).toLocaleString()}</div>
                    <div>🏷️ Status: <span style="color:${statusColor}; font-weight:bold;">${statusText}</span></div>
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
    const items = document.querySelectorAll('.report-item');
    items.forEach(item => {
        item.style.display = item.getAttribute('data-status') === status ? 'block' : 'none';
    });
    
    ['filterPending', 'filterApproved', 'filterRejected'].forEach(btnId => {
        const btn = document.getElementById(btnId);
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

// ==================== FUNGSI LAINNYA (Rating, Watchlist, Profile, dll) ====================
// ... (fungsi addRating, deleteRating, addNewFilm, updateFilm, dll tetap sama seperti sebelumnya)

// Untuk menghemat ruang, fungsi-fungsi lain yang sudah ada tetap digunakan
// Pastikan semua fungsi menggunakan safeString dan safeId untuk ID

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
window.performSearch = performSearch;
window.performActorSearch = performActorSearch;
window.clearActorSearch = clearActorSearch;
window.filterReports = filterReports;
window.showReportModal = showReportModal;
window.closeReportModal = closeReportModal;
window.submitReport = submitReport;
window.adminDeleteRating = adminDeleteRating;

// ==================== START APP ====================
initSocket();
loadData();
initNav();
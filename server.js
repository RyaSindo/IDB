require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const http = require('http');
const socketIo = require('socket.io');
const { v2: cloudinary } = require('cloudinary');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.static('public'));

app.get('/health', (req, res) => res.send('OK'));

// Cloudinary config
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

// Socket.IO
const server = http.createServer(app);
const io = socketIo(server, {
    cors: { 
        origin: "*", 
        credentials: true,
        methods: ["GET", "POST"]
    },
    transports: ['websocket', 'polling'],
    allowEIO3: true,
    pingTimeout: 60000,
    pingInterval: 25000,
    upgradeTimeout: 10000,
    allowUpgrades: true,
    cookie: false,
    path: '/socket.io/'
});

// Log connection errors
io.engine.on("connection_error", (err) => {
    console.log("Socket.IO connection error:", err.message);
});

// ==================== SCHEMAS ====================
const UserSchema = new mongoose.Schema({
    username: { type: String, unique: true, required: true },
    password: { type: String, required: true },
    displayName: String,
    isAdmin: { type: Boolean, default: false },
    avatarUrl: String,
    bio: { type: String, default: "Pecinta film 🎬" },
    top3Films: [String],
    createdAt: { type: Date, default: Date.now }
});
const User = mongoose.model('User', UserSchema);

const FilmSchema = new mongoose.Schema({
    title: String,
    year: Number,
    posterUrl: String,
    trailer: String,
    synopsis: String,
    actors: [String],
    createdAt: { type: Date, default: Date.now }
});
const Film = mongoose.model('Film', FilmSchema);

const RatingSchema = new mongoose.Schema({
    filmId: mongoose.Schema.Types.ObjectId,
    userId: mongoose.Schema.Types.ObjectId,
    rating: Number,
    comment: String,
    timestamp: { type: Date, default: Date.now }
});
const Rating = mongoose.model('Rating', RatingSchema);

const WatchlistSchema = new mongoose.Schema({
    userId: mongoose.Schema.Types.ObjectId,
    filmId: mongoose.Schema.Types.ObjectId
});
const Watchlist = mongoose.model('Watchlist', WatchlistSchema);

// Update ActorSchema - Tambahkan field films
const ActorSchema = new mongoose.Schema({
    name: String,
    bio: String,
    photoUrl: String,
    films: [{ type: String }], // Array film ids atau judul film
    filmsList: [String], // Untuk menyimpan judul film yang pernah dibintangi
    createdAt: { type: Date, default: Date.now }
});
const Actor = mongoose.model('Actor', ActorSchema);

const ActorRatingSchema = new mongoose.Schema({
    actorName: String,
    userId: mongoose.Schema.Types.ObjectId,
    rating: Number,
    timestamp: { type: Date, default: Date.now }
});
const ActorRating = mongoose.model('ActorRating', ActorRatingSchema);

const ReportSchema = new mongoose.Schema({
    filmId: mongoose.Schema.Types.ObjectId,
    filmTitle: String,
    reportedUserId: mongoose.Schema.Types.ObjectId,
    reportedByName: String,
    reportedBy: String,
    comment: String,
    rating: Number,
    timestamp: Date,
    reportReason: { type: String, default: "" },
    status: { type: String, default: 'pending' }
});
const Report = mongoose.model('Report', ReportSchema);

// Helper fungsi untuk emit update rating
async function emitRatingUpdate(filmId) {
    try {
        const ratings = await Rating.find({ filmId });
        const total = ratings.length;
        const avg = total > 0 ? (ratings.reduce((a, b) => a + b.rating, 0) / total).toFixed(1) : "0.0";
        const film = await Film.findById(filmId);
        if (film) {
            io.to(`film_${filmId}`).emit('film-rating-updated', {
                filmId: filmId.toString(),
                filmTitle: film.title,
                newAvg: avg,
                totalRatings: total
            });
        }
    } catch (err) {
        console.error('Error in emitRatingUpdate:', err);
    }
}

io.on('connection', (socket) => {
    console.log('🔌 Client connected:', socket.id);
    
    socket.on('join-film', (filmId) => {
        socket.join(`film_${filmId}`);
    });
    socket.on('leave-film', (filmId) => {
        socket.leave(`film_${filmId}`);
    });
    socket.on('disconnect', () => {
        console.log('🔌 Client disconnected:', socket.id);
    });
});

// Session in-memory
let sessions = {};

// ==================== API ROUTES ====================

// ---- Get all data ----
app.get('/api/all-data', async (req, res) => {
    try {
        const [films, ratings, watchlist, actors, actorRatings, users, reports] = await Promise.all([
            Film.find(), Rating.find(), Watchlist.find(),
            Actor.find(), ActorRating.find(), User.find(), Report.find()
        ]);
        
        const userProfiles = {};
        users.forEach(u => {
            userProfiles[u.username] = {
                displayName: u.displayName || u.username,
                avatarValue: u.avatarUrl,
                bio: u.bio,
                top3Films: u.top3Films || []
            };
        });
        
        res.json({
            films, ratings, watchlist, actors, actorRatingsByUser: actorRatings,
            users, admins: users.filter(u => u.isAdmin), userProfiles, reports
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to fetch data' });
    }
});

// ---- Users ----
app.post('/api/users/register', async (req, res) => {
    try {
        const { username, password, displayName } = req.body;
        const existing = await User.findOne({ username });
        if (existing) return res.status(400).json({ success: false, message: 'Username sudah terdaftar!' });
        const user = new User({ username, password, displayName: displayName || username, isAdmin: false });
        await user.save();
        res.json({ success: true, user: { username, displayName: user.displayName } });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.post('/api/users/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const user = await User.findOne({ username, password });
        if (!user) return res.status(401).json({ success: false, message: 'Username atau password salah!' });
        const token = Date.now().toString() + Math.random();
        sessions[token] = { userId: user._id, username: user.username, displayName: user.displayName, isAdmin: user.isAdmin };
        res.json({ success: true, token, user: { username: user.username, displayName: user.displayName, isAdmin: user.isAdmin } });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.post('/api/users/logout', (req, res) => {
    delete sessions[req.body.token];
    res.json({ success: true });
});

app.get('/api/session', (req, res) => {
    const token = req.headers.authorization;
    if (token && sessions[token]) res.json({ loggedIn: true, ...sessions[token] });
    else res.json({ loggedIn: false });
});

// ---- Films ----
app.get('/api/films', async (req, res) => res.json(await Film.find()));

app.post('/api/films', async (req, res) => {
    try {
        const { title, year, poster, trailer, synopsis, actors, posterBase64 } = req.body;
        let posterUrl = poster;
        if (posterBase64 && posterBase64.startsWith('data:image/')) {
            const result = await cloudinary.uploader.upload(posterBase64, { folder: 'idb/posters' });
            posterUrl = result.secure_url;
        }
        const film = new Film({ title, year, posterUrl, trailer, synopsis, actors });
        await film.save();
        io.emit('film-added', { film });
        io.emit('show-toast', { message: `Film baru "${title}" ditambahkan!`, type: 'info' });
        res.json({ success: true, film });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.put('/api/films/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { title, year, poster, trailer, synopsis, actors, posterBase64 } = req.body;
        let posterUrl = poster;
        if (posterBase64 && posterBase64.startsWith('data:image/')) {
            const result = await cloudinary.uploader.upload(posterBase64, { folder: 'idb/posters' });
            posterUrl = result.secure_url;
        }
        const updated = await Film.findByIdAndUpdate(id, { title, year, posterUrl, trailer, synopsis, actors }, { new: true });
        if (!updated) return res.status(404).json({ success: false });
        io.emit('film-updated', { film: updated });
        io.emit('show-toast', { message: `Film "${title}" diperbarui`, type: 'info' });
        res.json({ success: true, film: updated });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.delete('/api/films/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const film = await Film.findById(id);
        if (!film) return res.status(404).json({ success: false });
        await Film.findByIdAndDelete(id);
        await Rating.deleteMany({ filmId: id });
        await Watchlist.deleteMany({ filmId: id });
        io.emit('film-deleted', { filmId: id, filmTitle: film.title });
        io.emit('show-toast', { message: `Film "${film.title}" dihapus`, type: 'warning' });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ---- Ratings ----
app.get('/api/ratings', async (req, res) => res.json(await Rating.find()));

app.post('/api/ratings', async (req, res) => {
    try {
        const { filmId, userId, rating, comment } = req.body;
        
        let userObjectId;
        const user = await User.findOne({ username: userId });
        if (user) {
            userObjectId = user._id;
        } else {
            userObjectId = userId;
        }
        
        const filmObjectId = new mongoose.Types.ObjectId(filmId);
        
        await Rating.findOneAndUpdate(
            { filmId: filmObjectId, userId: userObjectId },
            { rating, comment, timestamp: new Date() },
            { upsert: true }
        );
        
        await emitRatingUpdate(filmObjectId);
        
        const userData = await User.findById(userObjectId);
        io.to(`film_${filmObjectId}`).emit('new-comment', {
            userId: userObjectId,
            displayName: userData?.displayName || userId,
            rating, comment, timestamp: Date.now()
        });
        
        io.emit('show-toast', { message: `${userData?.displayName || userId} memberi rating ${rating}/10`, type: 'info' });
        
        res.json({ success: true });
    } catch (err) {
        console.error('Error saving rating:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

app.delete('/api/ratings', async (req, res) => {
    try {
        const { filmId, userId } = req.body;
        
        let userObjectId;
        const user = await User.findOne({ username: userId });
        if (user) userObjectId = user._id;
        else userObjectId = userId;
        
        const filmObjectId = new mongoose.Types.ObjectId(filmId);
        await Rating.deleteOne({ filmId: filmObjectId, userId: userObjectId });
        await emitRatingUpdate(filmObjectId);
        
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ---- Watchlist ----
app.get('/api/watchlist', async (req, res) => res.json(await Watchlist.find()));

app.post('/api/watchlist/toggle', async (req, res) => {
    try {
        const { userId, filmId } = req.body;
        let userObjectId;
        const user = await User.findOne({ username: userId });
        if (user) userObjectId = user._id;
        else userObjectId = userId;
        
        const filmObjectId = new mongoose.Types.ObjectId(filmId);
        const existing = await Watchlist.findOne({ userId: userObjectId, filmId: filmObjectId });
        
        let action;
        if (existing) {
            await existing.deleteOne();
            action = 'removed';
        } else {
            await Watchlist.create({ userId: userObjectId, filmId: filmObjectId });
            action = 'added';
        }
        io.emit('watchlist-updated', { userId: userObjectId, filmId, action });
        res.json({ success: true, action });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ---- Profiles ----
app.get('/api/profiles/:userId', async (req, res) => {
    try {
        const user = await User.findOne({ username: req.params.userId });
        if (!user) return res.json({ displayName: req.params.userId, avatarValue: null, bio: "Pecinta film 🎬", top3Films: [] });
        res.json({ displayName: user.displayName, avatarValue: user.avatarUrl, bio: user.bio, top3Films: user.top3Films });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/profiles/:userId', async (req, res) => {
    try {
        const user = await User.findOne({ username: req.params.userId });
        if (!user) return res.status(404).json({ success: false });
        const { displayName, avatarValue, bio, top3Films } = req.body;
        user.displayName = displayName || user.displayName;
        user.avatarUrl = avatarValue || user.avatarUrl;
        user.bio = bio || user.bio;
        user.top3Films = top3Films || [];
        await user.save();
        io.emit('profile-updated', { userId: req.params.userId, profile: { displayName: user.displayName, avatarValue: user.avatarUrl, bio: user.bio, top3Films: user.top3Films } });
        io.emit('show-toast', { message: `Profil ${user.displayName} diperbarui`, type: 'success' });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ---- Actors ----
app.get('/api/actors', async (req, res) => {
    try {
        const actors = await Actor.find();
        // Pastikan filmsList selalu ada (array)
        const formattedActors = actors.map(a => ({
            ...a.toObject(),
            filmsList: a.filmsList || []
        }));
        res.json(formattedActors);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/actors', async (req, res) => {
    try {
        const { name, bio, photo, filmsList } = req.body;
        if (await Actor.findOne({ name })) return res.status(400).json({ success: false, message: 'Aktor sudah ada' });
        let photoUrl = photo;
        if (photo && photo.startsWith('data:image/')) {
            const result = await cloudinary.uploader.upload(photo, { folder: 'idb/actors' });
            photoUrl = result.secure_url;
        } else if (!photoUrl) {
            photoUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=667eea&color=fff`;
        }
        
        const actor = new Actor({ name, bio: bio || "Aktor berbakat", photoUrl, filmsList: filmsList || [] });
        await actor.save();
        
        // Tambahkan actor ke film yang terdaftar di filmsList
        if (filmsList && filmsList.length) {
            for (const filmTitle of filmsList) {
                await Film.updateOne(
                    { title: filmTitle },
                    { $addToSet: { actors: name } }
                );
            }
        }
        
        io.emit('actor-added', { actor });
        io.emit('show-toast', { message: `Aktor baru "${name}" ditambahkan`, type: 'info' });
        res.json({ success: true, actor });
    } catch (err) {
        console.error('Error adding actor:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

app.put('/api/actors/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { name, bio, photo, filmsList } = req.body;
        const old = await Actor.findById(id);
        if (!old) return res.status(404).json({ success: false });
        
        let photoUrl = photo;
        if (photo && photo.startsWith('data:image/')) {
            const result = await cloudinary.uploader.upload(photo, { folder: 'idb/actors' });
            photoUrl = result.secure_url;
        } else if (!photoUrl) photoUrl = old.photoUrl;
        
        // --- SINKRONISASI FILM ---
        const oldFilmsList = old.filmsList || [];
        const newFilmsList = filmsList || [];
        
        // Film yang harus ditambahkan actor ke dalam field actors
        const filmsToAdd = newFilmsList.filter(f => !oldFilmsList.includes(f));
        // Film yang harus dihapus actor dari field actors
        const filmsToRemove = oldFilmsList.filter(f => !newFilmsList.includes(f));
        
        // Tambahkan actor ke film
        for (const filmTitle of filmsToAdd) {
            await Film.updateOne(
                { title: filmTitle },
                { $addToSet: { actors: name } }
            );
        }
        
        // Hapus actor dari film
        for (const filmTitle of filmsToRemove) {
            await Film.updateOne(
                { title: filmTitle },
                { $pull: { actors: name } }
            );
        }
        
        // Jika nama actor berubah, update juga di film
        if (old.name !== name) {
            await Film.updateMany(
                { actors: old.name },
                { $set: { "actors.$": name } }
            );
            await ActorRating.updateMany(
                { actorName: old.name },
                { $set: { actorName: name } }
            );
        }
        
        // Update actor
        const updatedActor = await Actor.findByIdAndUpdate(
            id,
            { name, bio, photoUrl, filmsList: newFilmsList },
            { new: true }
        );
        
        io.emit('actor-updated', { actor: updatedActor });
        io.emit('show-toast', { message: `Aktor "${name}" diperbarui`, type: 'info' });
        res.json({ success: true, actor: updatedActor });
    } catch (err) {
        console.error('Error updating actor:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

app.delete('/api/actors/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const actor = await Actor.findById(id);
        if (!actor) return res.status(404).json({ success: false });
        await Actor.findByIdAndDelete(id);
        await Film.updateMany({ actors: actor.name }, { $pull: { actors: actor.name } });
        await ActorRating.deleteMany({ actorName: actor.name });
        io.emit('actor-deleted', { actorId: id, actorName: actor.name });
        io.emit('show-toast', { message: `Aktor "${actor.name}" dihapus`, type: 'warning' });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ---- Actor Ratings ----
app.get('/api/actor-ratings', async (req, res) => {
    try {
        const ratings = await ActorRating.find();
        // Konversi ObjectId ke string untuk konsistensi
        const formattedRatings = ratings.map(r => ({
            actorName: r.actorName,
            userId: r.userId.toString(),
            rating: r.rating,
            timestamp: r.timestamp
        }));
        res.json(formattedRatings);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/actor-ratings', async (req, res) => {
    try {
        const { actorName, userId, rating } = req.body;
        let userObjectId;
        const user = await User.findOne({ username: userId });
        if (user) userObjectId = user._id;
        else userObjectId = userId;
        
        await ActorRating.findOneAndUpdate(
            { actorName, userId: userObjectId },
            { rating, timestamp: new Date() },
            { upsert: true }
        );
        
        const all = await ActorRating.find({ actorName });
        const total = all.length;
        const avg = total > 0 ? (all.reduce((a, b) => a + b.rating, 0) / total).toFixed(1) : "0.0";
        io.emit('actor-rating-updated', { actorName, userId: userObjectId, rating, newAvg: avg, totalRatings: total });
        io.emit('show-toast', { message: `Rating untuk ${actorName}: ${rating}/5 bintang`, type: 'success' });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ---- Reports ----
app.get('/api/reports', async (req, res) => res.json(await Report.find()));

app.post('/api/reports', async (req, res) => {
    try {
        const { filmId, filmTitle, reportedUserId, reportedByName, reportedBy, comment, rating, timestamp, reportReason } = req.body;
        
        let reportedUserObjectId;
        const user = await User.findOne({ username: reportedByName });
        if (user) reportedUserObjectId = user._id;
        else reportedUserObjectId = reportedUserId;
        
        const existing = await Report.findOne({ filmId, reportedUserId: reportedUserObjectId, reportedBy, status: 'pending' });
        if (existing) {
            return res.status(400).json({ success: false, message: 'Anda sudah melaporkan komentar ini!' });
        }
        
        const report = new Report({
            filmId, filmTitle, reportedUserId: reportedUserObjectId,
            reportedByName, reportedBy, comment, rating,
            timestamp: new Date(timestamp), reportReason: reportReason || "", status: 'pending'
        });
        await report.save();
        
        io.emit('new-report', { report });
        io.emit('show-toast', { message: `Laporan terkirim! Admin akan segera menindaklanjuti.`, type: 'info' });
        
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.put('/api/reports/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;
        
        const report = await Report.findById(id);
        if (!report) return res.status(404).json({ success: false });
        
        report.status = status;
        await report.save();
        
        if (status === 'approved') {
            await Rating.deleteOne({ filmId: report.filmId, userId: report.reportedUserId, timestamp: report.timestamp });
            await emitRatingUpdate(report.filmId);
            io.emit('show-toast', { message: `Komentar dari ${report.reportedByName} telah dihapus!`, type: 'success' });
        } else {
            io.emit('show-toast', { message: `Laporan terhadap ${report.reportedByName} ditolak.`, type: 'info' });
        }
        
        io.emit('global-refresh');
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ---- Uploads ----
app.post('/api/upload-poster', async (req, res) => {
    try {
        const { image } = req.body;
        if (!image || !image.startsWith('data:image/')) return res.status(400).json({ success: false });
        const result = await cloudinary.uploader.upload(image, { folder: 'idb/posters' });
        res.json({ success: true, imageUrl: result.secure_url });
    } catch (err) {
        res.status(500).json({ success: false });
    }
});

app.post('/api/upload-profile', async (req, res) => {
    try {
        const { image } = req.body;
        if (!image || !image.startsWith('data:image/')) return res.status(400).json({ success: false });
        const result = await cloudinary.uploader.upload(image, { folder: 'idb/avatars' });
        res.json({ success: true, imageUrl: result.secure_url });
    } catch (err) {
        res.status(500).json({ success: false });
    }
});

// Serve frontend
app.use((req, res) => {
    res.sendFile('index.html', { root: 'public' });
});

// ==================== KONEKSI MONGOOSE ====================
const mongooseOptions = {
    serverSelectionTimeoutMS: 10000,
    socketTimeoutMS: 45000,
    tlsAllowInvalidCertificates: process.env.NODE_ENV !== 'production'
};

mongoose.connect(process.env.MONGODB_URI, mongooseOptions)
    .then(async () => {
        console.log('✅ MongoDB connected successfully');
        
        // Seed data
        const userCount = await User.countDocuments();
        if (userCount === 0) {
            console.log('🌱 Seeding default users...');
            await User.create([
                { username: "admin", password: "fajar", displayName: "Administrator", isAdmin: true, bio: "Administrator IDB" },
            ]);
        }
        
        const filmCount = await Film.countDocuments();
        if (filmCount === 0) {
            console.log('🌱 Seeding default films...');
            await Film.create([
                { title: "Inception", year: 2010, posterUrl: "https://image.tmdb.org/t/p/w500/edv5CvUikXo6SbSEKkKu8fzRgCU.jpg", trailer: "https://www.youtube.com/watch?v=YoHD9XEInc0", synopsis: "Seorang pencuri yang menyusup ke alam mimpi orang lain.", actors: ["Leonardo DiCaprio", "Tom Hardy"] },
                { title: "Oppenheimer", year: 2023, posterUrl: "https://image.tmdb.org/t/p/w500/8Gxv8gSFCU0XGDykEGv7zR1n2ua.jpg", trailer: "https://www.youtube.com/watch?v=uYPbbksJxIg", synopsis: "Kisah J. Robert Oppenheimer.", actors: ["Cillian Murphy"] },
                { title: "Dune: Part Two", year: 2024, posterUrl: "https://image.tmdb.org/t/p/w500/8b8R8l88Qje9dnbOE6h2wniFXIB.jpg", trailer: "https://www.youtube.com/watch?v=U2Qp5pL3ovA", synopsis: "Paul Atreides bersatu dengan Chani.", actors: ["Timothée Chalamet", "Zendaya"] }
            ]);
        }
        
        const actorCount = await Actor.countDocuments();
        if (actorCount === 0) {
            console.log('🌱 Seeding default actors...');
            await Actor.create([
                { name: "Leonardo DiCaprio", bio: "Aktor legendaris Hollywood.", photoUrl: "https://ui-avatars.com/api/?name=Leonardo+DiCaprio&background=667eea&color=fff" },
                { name: "Tom Hardy", bio: "Aktor asal Inggris.", photoUrl: "https://ui-avatars.com/api/?name=Tom+Hardy&background=667eea&color=fff" },
                { name: "Cillian Murphy", bio: "Aktor Irlandia.", photoUrl: "https://ui-avatars.com/api/?name=Cillian+Murphy&background=667eea&color=fff" }
            ]);
        }
        
        console.log('✅ Seeding complete');
        
        server.listen(PORT, '0.0.0.0', () => {
            console.log(`🚀 Server running on http://0.0.0.0:${PORT}`);
            console.log(`✅ Socket.IO & MongoDB ready`);
        });
    })
    .catch(err => {
        console.error('MongoDB connection error:', err);
        process.exit(1);
    });
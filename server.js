require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const http = require('http');
const socketIo = require('socket.io');
const { v2: cloudinary } = require('cloudinary');

const app = express();
const PORT = process.env.PORT || 3000;

// ==================== MIDDLEWARE ====================
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.static('public'));

app.get('/health', (req, res) => res.send('OK'));

// ==================== CLOUDINARY CONFIG ====================
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

// ==================== SOCKET.IO ====================
const server = http.createServer(app);
const io = socketIo(server, {
    cors: { 
        origin: "*",
        credentials: true 
    },
    transports: ['websocket', 'polling'],
    allowEIO3: true  // Tambahkan ini
});

// ==================== SCHEMAS ====================
const UserSchema = new mongoose.Schema({
    username: { type: String, unique: true, required: true },
    password: { type: String, required: true },
    displayName: String,
    isAdmin: { type: Boolean, default: false },
    avatarUrl: String,
    bio: { type: String, default: "Pecinta film 🎬" },
    top3Films: [Number],
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

const ActorSchema = new mongoose.Schema({
    name: String,
    bio: String,
    photoUrl: String,
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
    status: String
});
const Report = mongoose.model('Report', ReportSchema);

// ==================== SOCKET.IO HELPERS ====================
async function emitRatingUpdate(filmId) {
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
}

// ==================== SOCKET.IO CONNECTION ====================
io.on('connection', (socket) => {
    console.log('🔌 Client connected:', socket.id);
    socket.on('join-film', (filmId) => socket.join(`film_${filmId}`));
    socket.on('leave-film', (filmId) => socket.leave(`film_${filmId}`));
    socket.on('disconnect', () => console.log('🔌 Client disconnected:', socket.id));
});

// ==================== SESSION (in-memory) ====================
let sessions = {};

// ==================== API ROUTES ====================

// ---- Get all data (replaces /api/data) ----
app.get('/api/all-data', async (req, res) => {
    try {
        const films = await Film.find();
        const ratings = await Rating.find();
        const watchlist = await Watchlist.find();
        const actors = await Actor.find();
        const actorRatings = await ActorRating.find();
        const users = await User.find();
        const reports = await Report.find();
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
    const { username, password, displayName } = req.body;
    const existing = await User.findOne({ username });
    if (existing) return res.status(400).json({ success: false, message: 'Username sudah terdaftar!' });
    const user = new User({ username, password, displayName: displayName || username, isAdmin: false });
    await user.save();
    res.json({ success: true, user: { username, displayName: user.displayName } });
});

app.post('/api/users/login', async (req, res) => {
    const { username, password } = req.body;
    const user = await User.findOne({ username, password });
    if (!user) return res.status(401).json({ success: false, message: 'Username atau password salah!' });
    const token = Date.now().toString() + Math.random();
    sessions[token] = { userId: user._id, username: user.username, displayName: user.displayName, isAdmin: user.isAdmin };
    res.json({ success: true, token, user: { username: user.username, displayName: user.displayName, isAdmin: user.isAdmin } });
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
    const { title, year, poster, trailer, synopsis, actors, posterBase64 } = req.body;
    let posterUrl = poster;
    if (posterBase64) {
        const result = await cloudinary.uploader.upload(posterBase64, { folder: 'idb/posters' });
        posterUrl = result.secure_url;
    }
    const film = new Film({ title, year, posterUrl, trailer, synopsis, actors });
    await film.save();
    io.emit('film-added', { film });
    io.emit('show-toast', { message: `Film baru "${title}" ditambahkan!`, type: 'info' });
    res.json({ success: true, film });
});

app.put('/api/films/:id', async (req, res) => {
    const { id } = req.params;
    const { title, year, poster, trailer, synopsis, actors, posterBase64 } = req.body;
    let posterUrl = poster;
    if (posterBase64) {
        const result = await cloudinary.uploader.upload(posterBase64, { folder: 'idb/posters' });
        posterUrl = result.secure_url;
    }
    const updated = await Film.findByIdAndUpdate(id, { title, year, posterUrl, trailer, synopsis, actors }, { new: true });
    if (!updated) return res.status(404).json({ success: false });
    io.emit('film-updated', { film: updated });
    io.emit('show-toast', { message: `Film "${title}" diperbarui`, type: 'info' });
    res.json({ success: true });
});

app.delete('/api/films/:id', async (req, res) => {
    const { id } = req.params;
    const film = await Film.findById(id);
    if (!film) return res.status(404).json({ success: false });
    await Film.findByIdAndDelete(id);
    await Rating.deleteMany({ filmId: id });
    await Watchlist.deleteMany({ filmId: id });
    io.emit('film-deleted', { filmId: id, filmTitle: film.title });
    io.emit('show-toast', { message: `Film "${film.title}" dihapus`, type: 'warning' });
    res.json({ success: true });
});

// ---- Ratings ----
app.get('/api/ratings', async (req, res) => res.json(await Rating.find()));

app.post('/api/ratings', async (req, res) => {
    const { filmId, userId, rating, comment } = req.body;
    await Rating.findOneAndUpdate({ filmId, userId }, { rating, comment, timestamp: new Date() }, { upsert: true });
    await emitRatingUpdate(filmId);
    const user = await User.findById(userId);
    io.to(`film_${filmId}`).emit('new-comment', {
        userId, displayName: user.displayName, rating, comment, timestamp: Date.now()
    });
    res.json({ success: true });
});

app.delete('/api/ratings', async (req, res) => {
    const { filmId, userId } = req.body;
    await Rating.deleteOne({ filmId, userId });
    await emitRatingUpdate(filmId);
    res.json({ success: true });
});

// ---- Watchlist ----
app.get('/api/watchlist', async (req, res) => res.json(await Watchlist.find()));

app.post('/api/watchlist/toggle', async (req, res) => {
    const { userId, filmId } = req.body;
    const existing = await Watchlist.findOne({ userId, filmId });
    let action;
    if (existing) {
        await existing.deleteOne();
        action = 'removed';
    } else {
        await Watchlist.create({ userId, filmId });
        action = 'added';
    }
    io.emit('watchlist-updated', { userId, filmId, action });
    res.json({ success: true, action });
});

// ---- Profiles ----
app.get('/api/profiles/:userId', async (req, res) => {
    const user = await User.findOne({ username: req.params.userId });
    if (!user) return res.json({ displayName: req.params.userId, avatarValue: null, bio: "Pecinta film 🎬", top3Films: [] });
    res.json({ displayName: user.displayName, avatarValue: user.avatarUrl, bio: user.bio, top3Films: user.top3Films });
});

app.put('/api/profiles/:userId', async (req, res) => {
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
});

// ---- Actors ----
app.get('/api/actors', async (req, res) => res.json(await Actor.find()));

app.post('/api/actors', async (req, res) => {
    const { name, bio, photo } = req.body;
    if (await Actor.findOne({ name })) return res.status(400).json({ success: false, message: 'Aktor sudah ada' });
    let photoUrl = photo;
    if (photo && photo.startsWith('data:image/')) {
        const result = await cloudinary.uploader.upload(photo, { folder: 'idb/actors' });
        photoUrl = result.secure_url;
    } else if (!photoUrl) {
        photoUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=667eea&color=fff`;
    }
    const actor = new Actor({ name, bio: bio || "Aktor berbakat", photoUrl });
    await actor.save();
    io.emit('actor-added', { actor });
    io.emit('show-toast', { message: `Aktor baru "${name}" ditambahkan`, type: 'info' });
    res.json({ success: true, actor });
});

app.put('/api/actors/:id', async (req, res) => {
    const { id } = req.params;
    const { name, bio, photo } = req.body;
    const old = await Actor.findById(id);
    if (!old) return res.status(404).json({ success: false });
    let photoUrl = photo;
    if (photo && photo.startsWith('data:image/')) {
        const result = await cloudinary.uploader.upload(photo, { folder: 'idb/actors' });
        photoUrl = result.secure_url;
    } else if (!photoUrl) photoUrl = old.photoUrl;
    await Actor.findByIdAndUpdate(id, { name, bio, photoUrl });
    await Film.updateMany({ actors: old.name }, { $set: { "actors.$": name } });
    await ActorRating.updateMany({ actorName: old.name }, { $set: { actorName: name } });
    io.emit('actor-updated', { actor: { id, name, bio, photoUrl } });
    io.emit('show-toast', { message: `Aktor "${name}" diperbarui`, type: 'info' });
    res.json({ success: true });
});

app.delete('/api/actors/:id', async (req, res) => {
    const { id } = req.params;
    const actor = await Actor.findById(id);
    if (!actor) return res.status(404).json({ success: false });
    await Actor.findByIdAndDelete(id);
    await Film.updateMany({ actors: actor.name }, { $pull: { actors: actor.name } });
    await ActorRating.deleteMany({ actorName: actor.name });
    io.emit('actor-deleted', { actorId: id, actorName: actor.name });
    io.emit('show-toast', { message: `Aktor "${actor.name}" dihapus`, type: 'warning' });
    res.json({ success: true });
});

// ---- Actor Ratings ----
app.get('/api/actor-ratings', async (req, res) => res.json(await ActorRating.find()));

app.post('/api/actor-ratings', async (req, res) => {
    const { actorName, userId, rating } = req.body;
    await ActorRating.findOneAndUpdate({ actorName, userId }, { rating, timestamp: new Date() }, { upsert: true });
    const all = await ActorRating.find({ actorName });
    const total = all.length;
    const avg = total > 0 ? (all.reduce((a, b) => a + b.rating, 0) / total).toFixed(1) : "0.0";
    io.emit('actor-rating-updated', { actorName, userId, rating, newAvg: avg, totalRatings: total });
    res.json({ success: true });
});

// ---- Reports ----
app.get('/api/reports', async (req, res) => res.json(await Report.find()));

app.post('/api/reports', async (req, res) => {
    const report = new Report({ ...req.body, timestamp: new Date(), status: 'pending' });
    await report.save();
    res.json({ success: true });
});

app.put('/api/reports/:id', async (req, res) => {
    const { id } = req.params;
    const report = await Report.findById(id);
    if (!report) return res.status(404).json({ success: false });
    report.status = req.body.status;
    await report.save();
    if (req.body.status === 'approved') {
        await Rating.deleteOne({ filmId: report.filmId, userId: report.reportedUserId });
    }
    res.json({ success: true });
});

// ---- Uploads (base64 to Cloudinary) ----
app.post('/api/upload-poster', async (req, res) => {
    const { image } = req.body;
    if (!image || !image.startsWith('data:image/')) return res.status(400).json({ success: false });
    try {
        const result = await cloudinary.uploader.upload(image, { folder: 'idb/posters' });
        res.json({ success: true, imageUrl: result.secure_url });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false });
    }
});

app.post('/api/upload-profile', async (req, res) => {
    const { image } = req.body;
    if (!image || !image.startsWith('data:image/')) return res.status(400).json({ success: false });
    try {
        const result = await cloudinary.uploader.upload(image, { folder: 'idb/avatars' });
        res.json({ success: true, imageUrl: result.secure_url });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false });
    }
});

// ---- Serve frontend ----
app.use(express.static('public'));
app.use((req, res) => {
    res.sendFile('index.html', { root: 'public' });
});

// ==================== MONGOOSE CONNECTION & START SERVER ====================
mongoose.connect(process.env.MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    tls: true,
    tlsAllowInvalidCertificates: true,   // Hanya untuk development!
    serverSelectionTimeoutMS: 5000
})
    .then(async () => {
        console.log('✅ MongoDB connected');
        
        // Seed data (panggil model yang sudah didefinisikan)
        const userCount = await User.countDocuments();
        if (userCount === 0) {
            console.log('🌱 Seeding default users...');
            await User.create([
                { username: "admin", password: "admin123", displayName: "Administrator", isAdmin: true, bio: "Administrator IDB", createdAt: new Date() },
                { username: "user1", password: "user1123", displayName: "User 1", isAdmin: false, bio: "Pecinta film 🎬", createdAt: new Date() },
                { username: "user2", password: "user2123", displayName: "User 2", isAdmin: false, bio: "Pecinta film 🎬", createdAt: new Date() }
            ]);
        }
        
        const filmCount = await Film.countDocuments();
        if (filmCount === 0) {
            console.log('🌱 Seeding default films...');
            await Film.create([
                { title: "Inception", year: 2010, posterUrl: "https://image.tmdb.org/t/p/w500/edv5CvUikXo6SbSEKkKu8fzRgCU.jpg", trailer: "https://www.youtube.com/watch?v=YoHD9XEInc0", synopsis: "Seorang pencuri yang menyusup ke alam mimpi orang lain untuk mencuri rahasia.", actors: ["Leonardo DiCaprio", "Tom Hardy"], createdAt: new Date() },
                { title: "Oppenheimer", year: 2023, posterUrl: "https://image.tmdb.org/t/p/w500/8Gxv8gSFCU0XGDykEGv7zR1n2ua.jpg", trailer: "https://www.youtube.com/watch?v=uYPbbksJxIg", synopsis: "Kisah J. Robert Oppenheimer dalam pengembangan bom atom.", actors: ["Cillian Murphy"], createdAt: new Date() },
                { title: "Dune: Part Two", year: 2024, posterUrl: "https://image.tmdb.org/t/p/w500/8b8R8l88Qje9dnbOE6h2wniFXIB.jpg", trailer: "https://www.youtube.com/watch?v=U2Qp5pL3ovA", synopsis: "Paul Atreides bersatu dengan Chani dan Fremen untuk membalas dendam.", actors: ["Timothée Chalamet", "Zendaya"], createdAt: new Date() },
                { title: "Spider-Man: Into the Spider-Verse", year: 2018, posterUrl: "https://image.tmdb.org/t/p/w500/iiZZdoQBEYBv6id8su7ImL0oCbD.jpg", trailer: "https://www.youtube.com/watch?v=g4Hbz2jLxvQ", synopsis: "Remaja Miles Morales menjadi Spider-Man di dimensinya.", actors: [], createdAt: new Date() }
            ]);
        }
        
        const actorCount = await Actor.countDocuments();
        if (actorCount === 0) {
            console.log('🌱 Seeding default actors...');
            await Actor.create([
                { name: "Leonardo DiCaprio", bio: "Aktor legendaris Hollywood.", photoUrl: "https://ui-avatars.com/api/?name=Leonardo+DiCaprio&background=667eea&color=fff", createdAt: new Date() },
                { name: "Tom Hardy", bio: "Aktor asal Inggris.", photoUrl: "https://ui-avatars.com/api/?name=Tom+Hardy&background=667eea&color=fff", createdAt: new Date() },
                { name: "Cillian Murphy", bio: "Aktor Irlandia.", photoUrl: "https://ui-avatars.com/api/?name=Cillian+Murphy&background=667eea&color=fff", createdAt: new Date() },
                { name: "Timothée Chalamet", bio: "Aktor muda Amerika.", photoUrl: "https://ui-avatars.com/api/?name=Timothée+Chalamet&background=667eea&color=fff", createdAt: new Date() },
                { name: "Zendaya", bio: "Aktris dan penyanyi Amerika.", photoUrl: "https://ui-avatars.com/api/?name=Zendaya&background=667eea&color=fff", createdAt: new Date() }
            ]);
        }
        
        console.log('✅ Seeding complete');
        
        // START SERVER - HANYA SEKALI di sini
        server.listen(PORT, '0.0.0.0', () => {
            console.log(`🚀 Server running on http://0.0.0.0:${PORT}`);
            console.log(`✅ Socket.IO & MongoDB ready`);
        });
    })
    .catch(err => {
        console.error('MongoDB error:', err);
        process.exit(1);
    });
'use strict';

const express    = require('express');
const http       = require('http');
const { Server } = require('socket.io');
const session    = require('express-session');
const bcrypt     = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const multer     = require('multer');
const path       = require('path');

const app    = express();
const server = http.createServer(app);
const PORT   = process.env.PORT || 3000;

/* ══════════════════════════════════════
   IN-MEMORY STORE  (no DB needed)
══════════════════════════════════════ */
const USERS    = new Map();  // username → user obj
const ROOMS    = new Map();  // roomId   → room obj
const MESSAGES = new Map();  // roomId   → [msg]
const FILES    = new Map();  // roomId   → [file]
const SOCKETS  = new Map();  // socketId → { user, roomId }

/* ══════════════════════════════════════
   SESSION  — must be created ONCE and
   shared between Express & Socket.io
══════════════════════════════════════ */
const SESSION = session({
  secret:            'cr_v3_secret',
  resave:            false,
  saveUninitialized: false,
  cookie:            { maxAge: 8 * 3600 * 1000, httpOnly: true, sameSite: 'lax' }
});

/* ══════════════════════════════════════
   EXPRESS MIDDLEWARE
══════════════════════════════════════ */
app.use(SESSION);                                          // ← session first
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public'))); // serve /public

/* ══════════════════════════════════════
   SOCKET.IO  — attach same session MW
══════════════════════════════════════ */
const io = new Server(server, {
  maxHttpBufferSize: 50e6,
  pingTimeout:       60000,
  pingInterval:      25000,
  cors: { origin: '*', credentials: true }
});

// Give Socket.io access to the Express session
io.use((socket, next) => {
  // socket.request.res may be undefined in some versions — provide a dummy
  SESSION(socket.request, socket.request.res || {}, next);
});

/* ══════════════════════════════════════
   FILE UPLOAD (memory, max 50 MB)
══════════════════════════════════════ */
const upload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: 50 * 1024 * 1024 }
});

/* ══════════════════════════════════════
   HELPERS
══════════════════════════════════════ */
function makeId(len = 6) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let id = '';
  while (id.length < len) id += chars[Math.floor(Math.random() * chars.length)];
  return id;
}

function authRequired(req, res, next) {
  if (req.session && req.session.user) return next();
  res.status(401).json({ error: 'Not authenticated' });
}

/* ══════════════════════════════════════
   SEED DEMO USERS
══════════════════════════════════════ */
function seedDemoUsers() {
  [
    { username: 'alice', displayName: 'Alice', password: 'demo1234' },
    { username: 'bob',   displayName: 'Bob',   password: 'demo1234' }
  ].forEach(u => {
    USERS.set(u.username, { id: uuidv4(), ...u, password: bcrypt.hashSync(u.password, 10) });
  });
}

/* ══════════════════════════════════════
   PAGE ROUTES
══════════════════════════════════════ */
app.get('/', (req, res) => {
  if (req.session && req.session.user) return res.redirect('/dashboard');
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/dashboard', (req, res) => {
  if (!req.session || !req.session.user) return res.redirect('/');
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

app.get('/room/:roomId', (req, res) => {
  if (!req.session || !req.session.user) return res.redirect('/');
  res.sendFile(path.join(__dirname, 'public', 'room.html'));
});

/* ══════════════════════════════════════
   AUTH API
══════════════════════════════════════ */
app.post('/api/register', (req, res) => {
  const { username = '', password = '', displayName = '' } = req.body;
  const key = username.trim().toLowerCase();
  if (!key || !password)         return res.status(400).json({ error: 'Username and password required.' });
  if (password.length < 6)       return res.status(400).json({ error: 'Password must be at least 6 chars.' });
  if (USERS.has(key))            return res.status(409).json({ error: 'Username already taken.' });

  const user = { id: uuidv4(), username: key, displayName: (displayName || username).trim(), password: bcrypt.hashSync(password, 10) };
  USERS.set(key, user);
  req.session.user = { id: user.id, username: user.username, displayName: user.displayName };
  res.json({ ok: true, user: req.session.user });
});

app.post('/api/login', (req, res) => {
  const { username = '', password = '' } = req.body;
  const user = USERS.get(username.trim().toLowerCase());
  if (!user || !bcrypt.compareSync(password, user.password))
    return res.status(401).json({ error: 'Invalid username or password.' });
  req.session.user = { id: user.id, username: user.username, displayName: user.displayName };
  res.json({ ok: true, user: req.session.user });
});

app.post('/api/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

app.get('/api/me', (req, res) => {
  if (!req.session || !req.session.user) return res.status(401).json({ user: null });
  res.json({ user: req.session.user });
});

/* ══════════════════════════════════════
   ROOM API
══════════════════════════════════════ */
app.post('/api/rooms', authRequired, (req, res) => {
  let id = makeId();
  while (ROOMS.has(id)) id = makeId();
  const room = { id, name: (req.body.name || '').trim() || 'Room ' + id, host: req.session.user.username, participants: [], createdAt: Date.now() };
  ROOMS.set(id, room);
  MESSAGES.set(id, []);
  FILES.set(id, []);
  res.json({ room: { id: room.id, name: room.name, host: room.host } });
});

app.get('/api/rooms/:id', (req, res) => {
  const room = ROOMS.get(req.params.id.toUpperCase());
  if (!room) return res.status(404).json({ error: 'Room not found.' });
  res.json({ room: { id: room.id, name: room.name, host: room.host } });
});

/* ══════════════════════════════════════
   FILE API
══════════════════════════════════════ */
app.post('/api/rooms/:id/upload', authRequired, upload.single('file'), (req, res) => {
  const rid = req.params.id.toUpperCase();
  if (!ROOMS.has(rid)) return res.status(404).json({ error: 'Room not found.' });
  if (!req.file)        return res.status(400).json({ error: 'No file.' });

  const f = {
    id:         uuidv4(),
    name:       req.file.originalname,
    size:       req.file.size,
    mime:       req.file.mimetype,
    data:       req.file.buffer.toString('base64'),
    uploader:   req.session.user.displayName,
    uploadedAt: new Date().toISOString()
  };
  FILES.get(rid).push(f);

  // Notify all peers in room
  io.to(rid).emit('file-added', { id: f.id, name: f.name, size: f.size, mime: f.mime, uploader: f.uploader, uploadedAt: f.uploadedAt });
  res.json({ ok: true, id: f.id, name: f.name });
});

app.get('/api/rooms/:id/files/:fid', authRequired, (req, res) => {
  const rid  = req.params.id.toUpperCase();
  const file = (FILES.get(rid) || []).find(f => f.id === req.params.fid);
  if (!file) return res.status(404).json({ error: 'File not found.' });
  const buf  = Buffer.from(file.data, 'base64');
  res.setHeader('Content-Type', file.mime || 'application/octet-stream');
  res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(file.name)}"`);
  res.setHeader('Content-Length', buf.length);
  res.send(buf);
});

/* ══════════════════════════════════════
   SOCKET.IO  — real-time core
══════════════════════════════════════ */
io.on('connection', socket => {
  // Verify session
  const user = socket.request.session && socket.request.session.user;
  if (!user) {
    socket.emit('auth-error', 'Not authenticated');
    socket.disconnect(true);
    return;
  }

  SOCKETS.set(socket.id, { user, roomId: null });
  console.log(`[+] ${user.displayName} (${socket.id})`);

  /* ── JOIN ROOM ──────────────────────── */
  socket.on('join-room', ({ roomId }) => {
    roomId = (roomId || '').toUpperCase();
    const room = ROOMS.get(roomId);
    if (!room) { socket.emit('room-error', 'Room not found.'); return; }

    // Remove any stale entry for same user
    room.participants = room.participants.filter(p => p.username !== user.username);
    room.participants.push({ username: user.username, displayName: user.displayName, socketId: socket.id });
    SOCKETS.get(socket.id).roomId = roomId;
    socket.join(roomId);

    // Send full state to joiner
    socket.emit('room-joined', {
      room: { id: room.id, name: room.name, host: room.host },
      // Send all OTHER participants so client can create peer connections
      participants: room.participants
        .filter(p => p.socketId !== socket.id)
        .map(p => ({ socketId: p.socketId, displayName: p.displayName, username: p.username })),
      messages: MESSAGES.get(roomId) || [],
      files:    (FILES.get(roomId)   || []).map(({ id, name, size, mime, uploader, uploadedAt }) => ({ id, name, size, mime, uploader, uploadedAt }))
    });

    // Tell everyone else
    socket.to(roomId).emit('peer-joined', { socketId: socket.id, displayName: user.displayName, username: user.username });
    console.log(`  >> ${user.displayName} joined ${roomId} (${room.participants.length} in room)`);
  });

  /* ── WEBRTC SIGNALLING ──────────────── */
  socket.on('rtc-offer', ({ to, offer }) => {
    const me = SOCKETS.get(socket.id);
    io.to(to).emit('rtc-offer', { from: socket.id, displayName: me?.user?.displayName || '?', offer });
  });

  socket.on('rtc-answer', ({ to, answer }) => {
    io.to(to).emit('rtc-answer', { from: socket.id, answer });
  });

  socket.on('rtc-ice', ({ to, candidate }) => {
    io.to(to).emit('rtc-ice', { from: socket.id, candidate });
  });

  /* ── CHAT ──────────────────────────── */
  socket.on('chat-send', ({ roomId, text, encrypted }) => {
    roomId = (roomId || '').toUpperCase();
    if (!text || !ROOMS.has(roomId)) return;
    const msg = { id: uuidv4(), sender: user.displayName, username: user.username, text, encrypted: !!encrypted, ts: new Date().toISOString() };
    MESSAGES.get(roomId).push(msg);
    io.to(roomId).emit('chat-recv', msg);   // broadcast to ALL (including sender)
  });

  /* ── WHITEBOARD ─────────────────────── */
  socket.on('wb-draw',  ({ roomId, data }) => socket.to((roomId||'').toUpperCase()).emit('wb-draw',  data));
  socket.on('wb-clear', ({ roomId })       => socket.to((roomId||'').toUpperCase()).emit('wb-clear'));
  socket.on('wb-undo',  ({ roomId })       => socket.to((roomId||'').toUpperCase()).emit('wb-undo'));

  /* ── MEDIA STATE ────────────────────── */
  socket.on('media-update', ({ roomId, audio, video, screen }) => {
    socket.to((roomId||'').toUpperCase()).emit('peer-media', { socketId: socket.id, audio, video, screen });
  });

  /* ── DISCONNECT ─────────────────────── */
  socket.on('disconnect', reason => {
    const entry = SOCKETS.get(socket.id);
    if (entry?.roomId) {
      const room = ROOMS.get(entry.roomId);
      if (room) {
        room.participants = room.participants.filter(p => p.socketId !== socket.id);
        io.to(entry.roomId).emit('peer-left', { socketId: socket.id, displayName: entry.user.displayName });
      }
    }
    SOCKETS.delete(socket.id);
    console.log(`[-] ${entry?.user?.displayName} left (${reason})`);
  });
});

/* ══════════════════════════════════════
   START SERVER
══════════════════════════════════════ */
seedDemoUsers();
server.listen(PORT, () => {
  console.log('\n╔══════════════════════════════════════╗');
  console.log(`║  ConnectRoom v3                      ║`);
  console.log(`║  http://localhost:${PORT}               ║`);
  console.log('║  alice/demo1234  |  bob/demo1234     ║');
  console.log('╚══════════════════════════════════════╝\n');
});

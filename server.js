/**
 * Yolg'izlik Chat - Test versiya
 * Ro'yxatdan o'tish yo'q
 * Havola orqali real chat + rasm
 */

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
  maxHttpBufferSize: 5e6
});

app.use(cors());
app.use(express.json({ limit: '6mb' }));

// Frontend
const frontendPath = path.join(__dirname, '../frontend');
app.use(express.static(frontendPath));

// Rasm saqlash
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
app.use('/uploads', express.static(uploadsDir));

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
    cb(null, Date.now() + '-' + uuidv4().slice(0, 8) + ext);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 4 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ok = /jpeg|jpg|png|gif|webp/i.test(file.mimetype) ||
               /jpeg|jpg|png|gif|webp/i.test(path.extname(file.originalname));
    cb(null, !!ok);
  }
});

// Rasm yuklash
app.post('/api/upload', upload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Rasm yuklanmadi' });
  res.json({ ok: true, url: '/uploads/' + req.file.filename });
});

// ====================== ROOMS ======================
// roomId → Set of socketIds
const rooms = new Map();

io.on('connection', (socket) => {
  console.log('Ulandi:', socket.id);

  // Xonaga kirish
  socket.on('join', ({ roomId, name }) => {
    if (!roomId) return;

    roomId = roomId.trim().toLowerCase();
    const displayName = (name || 'Anonim').trim().slice(0, 20) || 'Anonim';

    socket.join(roomId);
    socket.data.roomId = roomId;
    socket.data.name = displayName;

    if (!rooms.has(roomId)) rooms.set(roomId, new Set());
    rooms.get(roomId).add(socket.id);

    const count = rooms.get(roomId).size;

    // Xonadagilarga xabar
    socket.to(roomId).emit('system', {
      text: `${displayName} qo‘shildi`,
      count
    });

    // O‘ziga
    socket.emit('joined', {
      roomId,
      name: displayName,
      count
    });

    console.log(`${displayName} → room ${roomId} (${count} kishi)`);
  });

  // Xabar (matn)
  socket.on('message', ({ text }) => {
    const roomId = socket.data.roomId;
    if (!roomId || !text) return;

    const payload = {
      type: 'text',
      from: socket.data.name || 'Anonim',
      text: String(text).slice(0, 1000),
      time: new Date().toISOString(),
      id: socket.id
    };

    io.to(roomId).emit('message', payload);
  });

  // Rasm
  socket.on('image', ({ url }) => {
    const roomId = socket.data.roomId;
    if (!roomId || !url) return;

    const payload = {
      type: 'image',
      from: socket.data.name || 'Anonim',
      url,
      time: new Date().toISOString(),
      id: socket.id
    };

    io.to(roomId).emit('message', payload);
  });

  // Yozayotgani
  socket.on('typing', () => {
    const roomId = socket.data.roomId;
    if (!roomId) return;
    socket.to(roomId).emit('typing', { name: socket.data.name });
  });

  // Chiqish
  socket.on('disconnect', () => {
    const roomId = socket.data.roomId;
    const name = socket.data.name || 'Anonim';

    if (roomId && rooms.has(roomId)) {
      rooms.get(roomId).delete(socket.id);
      const count = rooms.get(roomId).size;

      if (count === 0) {
        rooms.delete(roomId);
      } else {
        socket.to(roomId).emit('system', {
          text: `${name} chiqib ketdi`,
          count
        });
      }
    }
    console.log('Uzildi:', socket.id);
  });
});

// Frontend
app.get('*', (req, res) => {
  res.sendFile(path.join(frontendPath, 'index.html'));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`\n🚀 Test Chat: http://localhost:${PORT}\n`);
});

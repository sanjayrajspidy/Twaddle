require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const multer = require('multer');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const bodyParser = require('body-parser');
const twilio = require('twilio');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Twilio config
const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

// Ensure uploads directory exists
if (!fs.existsSync('uploads')) {
  fs.mkdirSync('uploads');
}

// Middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('public'));
app.use('/uploads', express.static('uploads'));

// SQLite DB setup
const db = new sqlite3.Database('./chat_history.db');

// Create tables
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL,
    user_color TEXT NOT NULL,
    message_text TEXT,
    file_url TEXT,
    file_name TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL,
    phone TEXT NOT NULL UNIQUE,
    is_verified INTEGER DEFAULT 0
  )`);
});

// OTP: Send
app.post('/send-otp', (req, res) => {
  const { username, phone } = req.body;

  db.run(
    `INSERT OR REPLACE INTO users (username, phone, is_verified) VALUES (?, ?, 0)`,
    [username, phone],
    function (err) {
      if (err) {
        console.error('DB error:', err);
        return res.status(500).json({ success: false, message: 'DB error' });
      }

      // Twilio Verify API
      twilioClient.verify.v2.services(process.env.TWILIO_VERIFY_SID)
        .verifications
        .create({ to: phone, channel: 'sms' })
        .then(() => {
          res.json({ success: true, message: 'OTP sent to phone' });
        })
        .catch(err => {
          console.error('Twilio error:', err);
          res.status(500).json({ success: false, message: 'Failed to send OTP' });
        });
    }
  );
});

// OTP: Verify
app.post('/verify-otp', (req, res) => {
  const { phone, otp } = req.body;

  twilioClient.verify.v2.services(process.env.TWILIO_VERIFY_SID)
    .verificationChecks
    .create({ to: phone, code: otp })
    .then(verification_check => {
      if (verification_check.status === "approved") {
        db.run(`UPDATE users SET is_verified = 1 WHERE phone = ?`, [phone], (err) => {
          if (err) return res.status(500).json({ success: false, message: 'DB error' });
          res.json({ success: true, message: 'Phone number verified' });
        });
      } else {
        res.status(400).json({ success: false, message: 'Invalid OTP' });
      }
    })
    .catch(err => {
      console.error('Verification failed:', err);
      res.status(500).json({ success: false, message: 'Verification failed' });
    });
});

// File upload
const storage = multer.diskStorage({
  destination: 'uploads/',
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  }
});
const upload = multer({ storage });

app.post('/upload', upload.single('file'), (req, res) => {
  res.json({
    fileUrl: `/uploads/${req.file.filename}`,
    fileName: req.file.originalname
  });
});

// Get all messages
app.get('/api/messages', (req, res) => {
  db.all("SELECT * FROM messages ORDER BY timestamp ASC", (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// Delete all messages
app.delete('/api/messages', (req, res) => {
  db.run("DELETE FROM messages", (err) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: "Chat history cleared" });
  });
});

// Get all users (admin-only via secret key)
app.get('/api/users', (req, res) => {
  const userKey = req.query.key;
  const adminKey = process.env.ADMIN_KEY;

  if (userKey !== adminKey) {
    return res.status(403).json({ error: 'Access denied' });
  }

  db.all("SELECT id, username, phone, is_verified FROM users ORDER BY id ASC", (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// Socket.io chat
io.on('connection', (socket) => {
  console.log('User connected');

  db.all("SELECT * FROM messages ORDER BY timestamp ASC", (err, rows) => {
    if (!err) socket.emit('chat history', rows);
  });

  socket.on('chat message', (data) => {
    const messageData = {
      ...data,
      timestamp: new Date()
    };

    const stmt = db.prepare(`INSERT INTO messages 
      (username, user_color, message_text, file_url, file_name) 
      VALUES (?, ?, ?, ?, ?)`);
    stmt.run(
      data.user,
      data.color,
      data.text || null,
      data.fileUrl || null,
      data.fileName || null,
      function (err) {
        if (!err) {
          console.log('Message saved with ID:', this.lastID);
        }
      }
    );
    stmt.finalize();

    io.emit('chat message', messageData);
  });

  socket.on('disconnect', () => {
    console.log('User disconnected');
  });
});

// Redirect root to /auth.html
app.get('/', (req, res) => {
  res.redirect('/auth.html');
});

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('Closing database...');
  db.close((err) => {
    if (!err) console.log('DB closed.');
    process.exit(0);
  });
});

// Render/production port support
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

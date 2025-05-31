require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const multer = require('multer');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const bodyParser = require('body-parser');
const sgMail = require('@sendgrid/mail');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// SendGrid setup
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

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

// OTP store (in memory)
const otpStore = {};

// Send OTP via email
app.post('/send-email-otp', (req, res) => {
  const { email, username } = req.body;
  const otp = Math.floor(100000 + Math.random() * 900000).toString();

  otpStore[email] = { otp, expires: Date.now() + 5 * 60 * 1000 };

  const msg = {
    to: email,
    from: process.env.EMAIL_FROM,
    subject: 'Your Twddle OTP',
    text: `Hi ${username},\n\nYour Twddle OTP is: ${otp}\nIt expires in 5 minutes.`,
  };

  sgMail.send(msg)
    .then(() => {
      console.log(`✅ OTP sent to ${email}: ${otp}`);
      res.json({ success: true });
    })
    .catch(err => {
      console.error('Email send error:', err.response?.body || err.message);
      res.status(500).json({ success: false });
    });
});

// Verify email OTP and save user
app.post('/verify-email-otp', (req, res) => {
  const { email, otp } = req.body;
  const stored = otpStore[email];

  if (!stored || stored.otp !== otp || stored.expires < Date.now()) {
    return res.status(400).json({ success: false, message: 'Invalid or expired OTP.' });
  }

  db.run(
    `INSERT OR REPLACE INTO users (username, phone, is_verified) VALUES (?, ?, 1)`,
    [email, email],
    (err) => {
      if (err) {
        console.error('DB error:', err);
        return res.status(500).json({ success: false });
      }
      delete otpStore[email];
      res.json({ success: true });
    }
  );
});

// 🔧 Test SendGrid email delivery
app.get('/test-email', (req, res) => {
  const msg = {
    to: 'sanjayindus1111@gmail.com', // change if needed
    from: process.env.EMAIL_FROM,
    subject: 'Twddle Test Email',
    text: 'This is a test message to confirm SendGrid email delivery is working.',
  };

  sgMail.send(msg)
    .then(() => res.send('✅ Test email sent.'))
    .catch(err => {
      console.error('SendGrid error:', err.response?.body || err.message);
      res.status(500).send('❌ Failed to send test email.');
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

// Get chat messages
app.get('/api/messages', (req, res) => {
  db.all("SELECT * FROM messages ORDER BY timestamp ASC", (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// Delete chat messages
app.delete('/api/messages', (req, res) => {
  db.run("DELETE FROM messages", (err) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: "Chat history cleared" });
  });
});

// Admin: View all users
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

// Redirect to auth.html by default
app.get('/', (req, res) => {
  res.redirect('/auth.html');
});

// Shutdown DB on exit
process.on('SIGINT', () => {
  console.log('Closing database...');
  db.close((err) => {
    if (!err) console.log('DB closed.');
    process.exit(0);
  });
});

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
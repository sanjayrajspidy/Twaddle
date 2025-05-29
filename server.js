const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const multer = require('multer');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Create uploads directory if it doesn't exist
if (!fs.existsSync('uploads')) {
  fs.mkdirSync('uploads');
}

// Initialize SQLite database
const db = new sqlite3.Database('./chat_history.db');

// Create messages table if it doesn't exist
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
});

// File upload config
const storage = multer.diskStorage({
  destination: 'uploads/',
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  }
});
const upload = multer({ storage });

app.use(express.static('public'));
app.use('/uploads', express.static('uploads'));

// File upload endpoint
app.post('/upload', upload.single('file'), (req, res) => {
  res.json({ 
    fileUrl: `/uploads/${req.file.filename}`,
    fileName: req.file.originalname
  });
});

// API endpoint to get chat history
app.get('/api/messages', (req, res) => {
  db.all("SELECT * FROM messages ORDER BY timestamp ASC", (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json(rows);
  });
});

// API endpoint to clear chat history (optional)
app.delete('/api/messages', (req, res) => {
  db.run("DELETE FROM messages", (err) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json({ message: "Chat history cleared" });
  });
});

io.on('connection', (socket) => {
  console.log('User connected');

  // Send chat history to newly connected user
  db.all("SELECT * FROM messages ORDER BY timestamp ASC", (err, rows) => {
    if (err) {
      console.error('Error fetching chat history:', err);
      return;
    }
    socket.emit('chat history', rows);
  });

  socket.on('chat message', (data) => {
    // Add timestamp to message data
    const messageData = {
      ...data,
      timestamp: new Date()
    };

    // Save message to database
    const stmt = db.prepare(`INSERT INTO messages 
      (username, user_color, message_text, file_url, file_name) 
      VALUES (?, ?, ?, ?, ?)`);
    
    stmt.run(
      data.user,
      data.color,
      data.text || null,
      data.fileUrl || null,
      data.fileName || null,
      function(err) {
        if (err) {
          console.error('Error saving message:', err);
        } else {
          console.log('Message saved with ID:', this.lastID);
        }
      }
    );
    stmt.finalize();

    // Broadcast message to all clients
    io.emit('chat message', messageData);
  });

  socket.on('disconnect', () => {
    console.log('User disconnected');
  });
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('Closing database connection...');
  db.close((err) => {
    if (err) {
      console.error(err.message);
    }
    console.log('Database connection closed.');
    process.exit(0);
  });
});

server.listen(3000, () => {
  console.log('Server running at http://localhost:3000');
});

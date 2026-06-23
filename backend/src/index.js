require('dotenv').config();
const logger = require('./logger'); // Must be first — overrides console

const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const prisma = require('./db');
const { startPurgeScheduler } = require('./services/purge');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Port configuration
const PORT = process.env.PORT || 5000;

// Enable CORS
app.use(cors());

// Parse incoming request payloads
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// Ensure upload folder exists and serve statically
const uploadsDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Write a fallback default image if it doesn't exist
const defaultImagePath = path.join(uploadsDir, 'default_vehicle.jpg');
if (!fs.existsSync(defaultImagePath)) {
  // Save a tiny blank dummy image or write a simple shape
  fs.writeFileSync(defaultImagePath, '');
}

// Save mock images for seed file if they don't exist
for (let i = 1; i <= 5; i++) {
  const mockPath = path.join(uploadsDir, `mock_plate_${i}.jpg`);
  if (!fs.existsSync(mockPath)) {
    fs.writeFileSync(mockPath, '');
  }
}

app.use('/uploads', express.static(uploadsDir));

// WebSocket setup & connection management
const clients = new Set();

wss.on('connection', (ws) => {
  clients.add(ws);
  console.log(`[WEBSOCKET] New client connection. Active: ${clients.size}`);

  // Send a welcome message
  ws.send(JSON.stringify({ type: 'WELCOME', message: 'WebSocket connection active' }));

  ws.on('close', () => {
    clients.delete(ws);
    console.log(`[WEBSOCKET] Client disconnected. Active: ${clients.size}`);
  });

  ws.on('error', (error) => {
    console.error('[WEBSOCKET] Client connection error:', error);
    clients.delete(ws);
  });
});

// Broadcast helper function exposed globally via app context
const broadcast = (data) => {
  const payload = JSON.stringify({ type: 'EVENT', data });
  clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  });
};
app.set('broadcast', broadcast);

// API Routes
app.use('/api/ingest', require('./routes/ingest'));
app.use('/api/events', require('./routes/events'));
app.use('/api/analytics', require('./routes/analytics'));
app.use('/api/flags', require('./routes/flags'));

// Basic health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    database: 'connected',
    liveOnly: process.env.LIVE_ONLY === 'true',
    time: new Date()
  });
});

// Start the background data retention purge scheduler
startPurgeScheduler();

// Start Server
server.listen(PORT, async () => {
  console.log(`====================================================`);
  console.log(`  ANPR INGESTION SERVER LISTENING ON PORT ${PORT} `);
  console.log(`  WebSocket Server initialized successfully          `);
  console.log(`====================================================`);
  
  // Verify Database Connection
  try {
    await prisma.$connect();
    console.log('[DATABASE] PostgreSQL database connection successful.');
  } catch (error) {
    console.error('[DATABASE] ERROR connecting to database:', error.message);
    console.warn('[DATABASE] Please ensure PostgreSQL is running and DATABASE_URL is correct in .env');
  }
});
// Trigger nodemon reload for database connection change


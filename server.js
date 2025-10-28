require('dotenv').config();
const express = require('express');
const http = require('http');
const { WebSocketServer } = require('ws');
const cors = require('cors');
const { ethers } = require('ethers');

const app = express();
const PORT = process.env.PORT || 8080;

// Middleware
app.use(cors());
app.use(express.json());

// Create HTTP server (Railway auto upgrades to HTTPS/WSS)
const server = http.createServer(app);

// Prevent Railway from closing active WebSockets
server.keepAliveTimeout = 120000;
server.headersTimeout = 120000;

// WebSocket server
const wss = new WebSocketServer({ server });

// Active connected clients: Map<normalizedWallet, WebSocket>
const clients = new Map();

// Normalize using ethers for case + checksum
function normalizeAddress(address) {
  if (!address) return null;
  try {
    return ethers.getAddress(address).toLowerCase();
  } catch {
    console.warn("Invalid address:", address);
    return null;
  }
}

// Health endpoint
app.get('/health', (req, res) => {
  res.json({
    status: "ok",
    clients: clients.size,
    timestamp: new Date().toISOString(),
  });
});

// Handle WebSocket connections
wss.on('connection', (ws) => {
  console.log("🟣 New WS connection...");
  let walletAddress = null;

  ws.on('message', (data) => {
    let msg;
    try {
      msg = JSON.parse(data.toString());
    } catch (err) {
      console.error("❌ Invalid JSON:", err);
      return;
    }

    // ✅ Registration event
    if (msg.type === "register" && msg.walletAddress) {
      walletAddress = normalizeAddress(msg.walletAddress);
      if (!walletAddress) return;

      clients.set(walletAddress, ws);
      console.log(`✅ Registered: ${walletAddress}`);

      ws.send(JSON.stringify({
        type: "registered",
        walletAddress,
      }));
      return;
    }

    // ✅ Routing for all chat/call/typing events
    if (msg.to) {
      const toAddress = normalizeAddress(msg.to);
      const recipient = clients.get(toAddress);

      if (recipient && recipient.readyState === recipient.OPEN) {
        msg.timestamp = msg.timestamp || Date.now();
        recipient.send(JSON.stringify(msg));
        console.log(`📨 Routed ${msg.type} → ${toAddress}`);
      } else {
        console.log(`⚠️ Recipient not connected: ${toAddress}`);
      }
    }
  });

  ws.on('close', () => {
    if (walletAddress) {
      clients.delete(walletAddress);
      console.log(`🔌 Disconnected: ${walletAddress}`);
    }
  });

  ws.on('error', (err) => {
    console.error("⚠️ WS Error:", err.message);
  });
});

// Cleanup dead clients
setInterval(() => {
  clients.forEach((ws, addr) => {
    if (ws.readyState !== ws.OPEN) {
      clients.delete(addr);
      console.log(`🧹 Cleanup ghost: ${addr}`);
    }
  });
}, 30000);

// Start server ✅
server.listen(PORT, () =>
  console.log(`🚀 Relay Server running on :${PORT} (WS supported)`)
);

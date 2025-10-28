require('dotenv').config();
const express = require('express');
const https = require('https');
const fs = require('fs');
const { WebSocketServer } = require('ws');
const cors = require('cors');
const { ethers } = require('ethers');

const app = express();
const PORT = process.env.PORT || 8080;

// Prevent Railway from closing long-lived WebSockets
const server = https.createServer({
  // Railway provides SSL automatically — no need for custom certs
}, app);

// Keep connections alive
server.keepAliveTimeout = 120000;
server.headersTimeout = 120000;

// Middleware
app.use(cors());
app.use(express.json());

// WebSocket server
const wss = new WebSocketServer({ server });

// Store active connections
const clients = new Map();

// Normalize wallet checksummed & lowercased
function normalizeAddress(address) {
  if (!address) return null;
  try {
    return ethers.getAddress(address).toLowerCase();
  } catch {
    return null;
  }
}

// ✅ WebSocket connection handler
wss.on('connection', (ws) => {
  console.log("🟣 New client attempting WebSocket connection…");
  let walletAddress = null;

  ws.on('open', () => {
    console.log("✅ WebSocket fully open");
  });

  ws.on('message', (data) => {
    let message;
    try {
      message = JSON.parse(data.toString());
    } catch (err) {
      console.error("Invalid JSON:", err);
      return;
    }

    // ✅ Handle wallet registration
    if (message.type === "register" && message.walletAddress) {
      walletAddress = normalizeAddress(message.walletAddress);

      if (!walletAddress) {
        console.log("❌ Invalid wallet provided in register");
        return;
      }

      clients.set(walletAddress, ws);
      console.log(`✅ Wallet registered and live: ${walletAddress}`);

      ws.send(JSON.stringify({
        type: "registered",
        walletAddress,
      }));

      return;
    }

    // ✅ Message routing
    if (message.to) {
      const toAddress = normalizeAddress(message.to);
      const recipient = clients.get(toAddress);

      if (recipient && recipient.readyState === 1) {
        message.timestamp = Date.now(); // Ensure client timestamp
        recipient.send(JSON.stringify(message));
        console.log(`📨 Routed ${message.type} to ${toAddress}`);
      } else {
        console.log(`⚠️ Recipient offline: ${toAddress}`);
      }
    }
  });

  // ✅ Handle WebSocket disconnect
  ws.on('close', () => {
    if (walletAddress) {
      clients.delete(walletAddress);
      console.log(`🔌 Wallet disconnected: ${walletAddress}`);
    }
  });

  ws.on('error', (err) => {
    console.error("⚠️ WS Error:", err.message);
  });
});

// ✅ Health monitoring
app.get('/health', (req, res) => {
  res.json({
    status: "ok",
    clients: clients.size,
    timestamp: new Date().toISOString(),
  });
});

// ✅ Launch secure WebSocket server
server.listen(PORT, () =>
  console.log(`🚀 Secure BlockVault Relay running on :${PORT} (WSS enabled)`)
);

// 🧹 Clean stale clients
setInterval(() => {
  clients.forEach((ws, addr) => {
    if (ws.readyState !== 1) {
      clients.delete(addr);
      console.log(`🧹 Cleaned stale: ${addr}`);
    }
  });
}, 30000);

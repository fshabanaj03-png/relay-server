require('dotenv').config();
const express = require('express');
const { WebSocketServer } = require('ws');
const cors = require('cors');
const { ethers } = require('ethers');

const app = express();
const PORT = process.env.PORT || 8080;

// Middleware
app.use(cors());
app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    connectedClients: clients.size,
    timestamp: new Date().toISOString()
  });
});

// Start HTTP server
const server = app.listen(PORT, () => {
  console.log(`🚀 BlockVault Relay Server running on port ${PORT}`);
});

// WebSocket server
const wss = new WebSocketServer({ server });

// Store connected clients: Map<normalizedAddress, WebSocket>
const clients = new Map();

// Normalize wallet address using ethers checksum
function normalizeAddress(address) {
  if (!address) return null;
  try {
    return ethers.getAddress(address).toLowerCase();
  } catch (error) {
    console.error('Invalid address format:', address);
    return null;
  }
}

// WebSocket connection handler
wss.on('connection', (ws) => {
  let walletAddress = null;

  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data.toString());

      // Handle wallet registration
      if (message.type === 'register' && message.walletAddress) {
        walletAddress = normalizeAddress(message.walletAddress);
        
        if (walletAddress) {
          clients.set(walletAddress, ws);
          console.log(`✅ Registered wallet: ${walletAddress}`);
          
          // Send confirmation
          ws.send(JSON.stringify({ 
            type: 'registered', 
            walletAddress: walletAddress 
          }));
        }
        return;
      }

      // Handle message routing
      if (message.type === 'message' && message.from && message.to) {
        const fromAddress = normalizeAddress(message.from);
        const toAddress = normalizeAddress(message.to);

        if (!fromAddress || !toAddress) {
          console.error('Invalid addresses in message');
          return;
        }

        console.log(`📩 Routing message from ${fromAddress} to ${toAddress}`);

        const recipientWs = clients.get(toAddress);
        
        if (recipientWs && recipientWs.readyState === ws.OPEN) {
          recipientWs.send(JSON.stringify(message));
        } else {
          console.log(`❌ Recipient not connected: ${toAddress}`);
        }
      }

      // Forward other message types (typing, presence, etc.)
      if (message.to) {
        const toAddress = normalizeAddress(message.to);
        const recipientWs = clients.get(toAddress);
        
        if (recipientWs && recipientWs.readyState === ws.OPEN) {
          recipientWs.send(JSON.stringify(message));
        }
      }

    } catch (error) {
      console.error('Error processing message:', error);
    }
  });

  ws.on('close', () => {
    if (walletAddress) {
      clients.delete(walletAddress);
      console.log(`🔌 Disconnected wallet: ${walletAddress}`);
    }
  });

  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
  });
});

// Cleanup disconnected clients every 30 seconds
setInterval(() => {
  clients.forEach((ws, address) => {
    if (ws.readyState !== ws.OPEN) {
      clients.delete(address);
      console.log(`🧹 Cleaned up disconnected wallet: ${address}`);
    }
  });
}, 30000);

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, closing server...');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

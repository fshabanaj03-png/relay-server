# BlockVault Relay Server

WebSocket relay server for BlockVault Chat with wallet-based routing.

## Quick Start

1. Install dependencies:
```bash
npm install
```

2. Create `.env` file (optional):
```
PORT=8080
```

3. Run the server:
```bash
npm start
```

## Deployment to Railway

1. Push this `relay-server/` folder to GitHub
2. In Railway, set **Root Directory** to `relay-server`
3. Railway will auto-detect Node.js and run `npm start`

## Client Protocol

### Register
```json
{
  "type": "register",
  "walletAddress": "0x..."
}
```

### Send Message
```json
{
  "type": "message",
  "from": "0x...",
  "to": "0x...",
  "text": "Hello!"
}
```

## Health Check

GET `/health` - Returns server status and connected client count

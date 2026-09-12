# The Quiet Between Stars — Signaling Service

This is the lightweight, ephemeral WebRTC signaling service for **The Quiet Between Stars**.

It handles the temporary handshake between the player's desktop game and companion phone controller.

## Principles
- **Zero Gameplay Data**: Only relays initial WebRTC SDP offers/answers and ICE candidates.
- **Ephemeral**: Sessions automatically expire in 10 minutes.
- **No Database / No Accounts**: Completely stateless pairing room coordination using Cloudflare Durable Objects.

---

## Local Development

1. Navigate to the signaling directory:
   ```bash
   cd signaling
   npm install
   ```

2. Start the local signaling server:
   ```bash
   npm run dev
   ```
   This will start a local Cloudflare Worker on `http://localhost:8787` (WebSocket on `ws://localhost:8787/ws`).

3. In your root `.env` file for the game:
   ```env
   VITE_SIGNALING_URL=ws://localhost:8787/ws
   ```

---

## Deploying to Cloudflare Workers

1. Log in to Cloudflare with Wrangler:
   ```bash
   npx wrangler login
   ```

2. Deploy the worker:
   ```bash
   npm run deploy
   ```

3. Note your deployed worker URL (e.g. `https://thequietbetweenstars-signaling.<your-name>.workers.dev`).
4. Set the environment variable in your GitHub repository or `.env`:
   ```env
   VITE_SIGNALING_URL=wss://thequietbetweenstars-signaling.<your-name>.workers.dev/ws
   ```

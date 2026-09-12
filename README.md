# THE QUIET BETWEEN STARS

> *A peaceful, funny, psychedelic space exploration RPG.*

[![Deploy to GitHub Pages](https://github.com/JEDIx420/thequietbetweenstars/actions/workflows/deploy.yml/badge.svg)](https://github.com/JEDIx420/thequietbetweenstars/actions/workflows/deploy.yml)
[![Live Game](https://img.shields.io/badge/play-GitHub%20Pages-0284c7?style=flat&logo=github)](https://JEDIx420.github.io/thequietbetweenstars/)

---

## Game Identity

*The Quiet Between Stars* is a cosmic road trip into the gentle strange. Inspired by 1970s hippie science-fiction, Douglas Adams' Hitchhiker-style absurdity, and meditative stargazing:

- **Peaceful & Relaxing**: No combat, no game-over states, no timers, no grinding.
- **Philosophical & Weird**: Strange cosmic phenomena, cosmic solitude, dry humor.
- **Dual-Device Experience**: The desktop or laptop displays the infinite 3D universe. Your smartphone becomes an in-universe **Companion Flight Terminal** connecting via low-latency WebRTC DataChannels.

---

## Milestone v0.0.1 — Ship & Companion Foundation

This milestone establishes the architectural foundation:

- **3D Procedural Space Simulation**: Lightweight Three.js spaceflight prototype with layered starfields, cosmic dust velocity motes, procedural sun with corona, distant serene planet, and a retro-futuristic geometric craft with dynamic thrusters.
- **Companion Touch Controller**: Dedicated, lightweight mobile web controller with multi-touch analog joystick, continuous vertical throttle slider, and tactile action buttons (SCAN, MAP, AUTOPILOT).
- **Dual WebRTC DataChannels**:
  - `realtime`: Low-latency, unordered, unbuffered transmission for joystick and throttle (30–60 Hz).
  - `reliable`: Ordered, guaranteed delivery for discrete actions, context switching, and ping/pong latency monitoring.
- **Ephemeral Signaling**: Cloudflare Worker + Durable Objects backend (`signaling/`) that only introduces the two devices without touching gameplay traffic.
- **Zero-Crash Graceful Fallback**: If signaling is offline or the phone disconnects, desktop smoothly falls back to Keyboard & Mouse controls without losing state.
- **Procedural Ambience**: Web Audio API synthesizer generating a warm, breathing cosmic harmonic drone and retro-futuristic sound effects without external audio files.
- **Persistence Layer**: Versioned IndexedDB schema (with memory/localStorage fallback) saving settings, control preferences, and audio levels.
- **Automated CI/CD**: Native GitHub Actions workflow testing, typechecking, building, and deploying directly to GitHub Pages.

---

## Architecture Overview

```
                      ┌──────────────────────────────────────────────┐
                      │          The Quiet Between Stars             │
                      └──────────────────────┬───────────────────────┘
                                             │
                ┌────────────────────────────┴────────────────────────────┐
                ▼                                                         ▼
     ┌──────────────────────┐                                  ┌──────────────────────┐
     │     DESKTOP MODE     │                                  │    COMPANION MODE    │
     │   (Three.js 3D View) │                                  │ (Lightweight Touch)  │
     └──────────┬───────────┘                                  └──────────┬───────────┘
                │                                                         │
    ┌───────────┼───────────┐                                 ┌───────────┼───────────┐
    ▼           ▼           ▼                                 ▼           ▼           ▼
 ┌──────┐  ┌─────────┐ ┌─────────┐                       ┌─────────┐ ┌─────────┐ ┌─────────┐
 │Three │  │  Audio  │ │Unified  │                       │ Touch   │ │ State   │ │ WebRTC  │
 │Scene │  │ Engine  │ │ Input   │                       │Controls │ │ Sync    │ │ Client  │
 └──────┘  └─────────┘ └───▲─────┘                       └────┬────┘ └─────────┘ └────▲────┘
                           │                                  │                       │
                           ├──────────────────────────────────┘                       │
                           │        WebRTC DataChannels                               │
                           │   (Realtime Unordered + Reliable Actions)                │
                           │                                                          │
                           │               ┌───────────────────┐                      │
                           └───────────────┤ Ephemeral Signaler├──────────────────────┘
                                           │(Cloudflare Worker)│
                                           └───────────────────┘
```

### Clean Subsystem Separation

- `src/protocol/`: Versioned TypeScript protocol contracts, message schemas, and math helpers (deadband, clamp).
- `src/connection/`: Ephemeral signaling client, token generator, and WebRTC PeerConnection dual-datachannel manager.
- `src/game/input/`: Normalized input abstraction (`InputSource`, `KeyboardInput`, `CompanionInput`, `InputManager`).
- `src/game/core/`: Float-smooth flight physics model, velocity damping, and chase camera tracking.
- `src/game/scenes/`: Procedural 3D starfield, sun corona, celestial bodies, and geometric craft.
- `src/game/rendering/`: WebGLRenderer setup, DPR clamping, and background tab throttling.
- `src/companion/`: Touch controller interface, multi-touch Pointer Events, and device detection.
- `src/audio/`: Procedural Web Audio API synthesizer for ambient harmonic drones and sound effects.
- `src/persistence/`: IndexedDB wrapper storing persistent game settings and preferences.
- `signaling/`: Cloudflare Worker and Durable Object pairing room coordination.

---

## Controls

### Companion Phone Controller (Recommended)
- **Left Thumb (Virtual Joystick)**: Smooth 360° steering (Pitch and Yaw) with spring return and deadzone.
- **Right Thumb (Vertical Throttle)**: Continuous 0% to 100% thrust slider.
- **SCAN**: Emits acoustic resonance pulse in 3D space with haptic vibration.
- **MAP**: Toggles cartographic overlay notice.
- **AUTO**: Engages solar drift autopilot.

### Desktop Keyboard & Mouse (Fallback)
- **W / S** or **Up / Down**: Pitch up / down
- **A / D** or **Left / Right**: Yaw turn left / right
- **Q / E**: Roll bank left / right
- **Left Shift**: Increase throttle
- **Left Ctrl / Alt**: Decrease throttle
- **Space**: Trigger Sector Scan
- **M**: Map Cartography
- **X**: Toggle Autopilot
- **` (Backtick)** or **F3**: Toggle Flight Telemetry Debug HUD
- **Escape / P**: Pause

---

## Local Development

### 1. Prerequisites
- Node.js 20+ (recommended v22+)
- npm 10+

### 2. Install and Run Desktop App
```bash
# Clone and enter the repository
git clone https://github.com/JEDIx420/thequietbetweenstars.git
cd thequietbetweenstars

# Install dependencies
npm install

# Start local development server
npm run dev
```

Visit `http://localhost:3000` in your browser.

### 3. Local Companion Testing (Phone & Laptop on same Wi-Fi)

To test phone pairing on your local network:
1. Start Vite with `--host` (enabled by default in `npm run dev`).
2. Run the local signaling server:
   ```bash
   cd signaling
   npm install
   npm run dev
   ```
   (Runs on `ws://localhost:8787/ws`)
3. Create a `.env` file in the root directory:
   ```env
   VITE_SIGNALING_URL=ws://<your-laptop-lan-ip>:8787/ws
   ```
4. Open the desktop game at `http://<your-laptop-lan-ip>:3000`, select **PAIR COMPANION**, and scan the QR code with your phone camera.

---

## Signaling Service Deployment (Cloudflare Workers)

GitHub Pages serves static web files and cannot run a WebSocket server. To enable public phone pairing for the live GitHub Pages site, deploy the ephemeral signaling worker:

1. Install Wrangler CLI and log in:
   ```bash
   cd signaling
   npm install
   npx wrangler login
   ```

2. Deploy the worker:
   ```bash
   npm run deploy
   ```

3. Copy the deployed worker URL:
   `wss://thequietbetweenstars-signaling.<your-subdomain>.workers.dev/ws`

4. Set the GitHub Actions secret or repository variable:
   - Go to your GitHub repository -> **Settings** -> **Secrets and variables** -> **Actions** -> **Variables**.
   - Name: `VITE_SIGNALING_URL`
   - Value: `wss://thequietbetweenstars-signaling.<your-subdomain>.workers.dev/ws`

*Note: If no signaling server is configured, the desktop game automatically informs the player that remote pairing is offline and allows immediate, uninterrupted play with Keyboard & Mouse.*

---

## Verification & Testing

```bash
# Run strict TypeScript typechecking
npm run typecheck

# Run unit tests with Vitest
npm test

# Run production build
npm run build
```

---

## Current Roadmap

- [x] **v0.0.1 Ship & Companion Foundation** (Current)
  - 3D browser space flight prototype
  - Dual WebRTC DataChannels (Realtime + Reliable)
  - Ephemeral signaling service with QR pairing flow
  - Responsive mobile touch companion interface
  - Procedural Web Audio ambience and IndexedDB persistence
  - GitHub Pages deployment workflow
- [ ] **v0.0.2 Local Intelligence Pack**
  - Web Worker architecture for offline local language model integration
  - Procedural narrative engine and companion dialogue logs
- [ ] **v0.0.3 Procedural Solar System**
  - Seamless procedural orbits, gravitational drift, and celestial landmarks
  - Companion interactive stellar map
- [ ] **v0.0.4 Planet Landing & Exploration**
  - Procedural planet terrain generation and atmospheric transitions
  - Surface rover controls on companion
- [ ] **v0.0.5 Procedural Dialogue & Companion Interfaces**
  - Deep character interactions, radio scanning, and journal entries

---

## License

MIT © [JEDIx420](https://github.com/JEDIx420)

# 🎮 NEON SLASH - Multi-Device Fruit Slicer

A complete, high-fidelity browser-based fruit slicing game built with **Phaser.js** for the desktop screen and **Socket.IO** to connect a mobile phone acting as a motion-controlled sword.

---

## ⚡ Key Features

1. **Dual-Screen Play:** Laptop/desktop runs the Phaser.js game scene, while a smartphone acts as the tactile sword hilt controller.
2. **Real-time Synchronization:** Socket.IO streams gyroscope, accelerometer, and touch events with sub-15ms latency on local networks.
3. **QR Code Pairing:** Connect the controller instantly by scanning a dynamically generated QR code (no manual pairing or login required).
4. **Procedural Asset Generation:** The game requires no image downloads! All fruits, slices, bombs, sparks, and juice splatters are procedurally drawn on HTML canvas objects at runtime for instant, offline-compatible gameplay.
5. **Interactive Web Audio Synthesizer:** Sound effects (whoosh, splat, explosion, combos, and game over sounds) are synthesized programmatically using the Web Audio API, eliminating copyright or resource loading issues.
6. **Robust Fallbacks:** Includes a responsive on-screen Touchpad fallback for devices that do not support or block motion sensors.
7. **Dark Cyberpunk Aesthetic:** Polished glassmorphism styling, neon highlights, and custom fonts.

---

## 📂 Folder Structure

```
fruitgame/
├── package.json         # Node.js app dependencies and scripts
├── server.js            # Express & Socket.IO backend with local network IP detection
├── vercel.json          # Static file serving rules for Vercel
├── public/              # Client application served by the server
│   ├── index.html       # Desktop game entry screen
│   ├── mobile.html      # Mobile controller entry screen
│   ├── css/
│   │   ├── desktop.css  # Futuristic dark UI for desktop HUD
│   │   └── mobile.css   # Responsive grid layout for mobile controller hilt
│   └── js/
│       ├── sound-synth.js # Browser-based Web Audio synthesizer for SFX
│       ├── game.js      # Main Phaser.js engine, asset generators, and colliders
│       └── controller.js # Mobile sensor request, normalization, and WebSocket emitters
└── README.md            # Setup, WiFi discovery, and deployment manual
```

---

## ⚙️ Local Setup Instructions

### Prerequisites
- [Node.js](https://nodejs.org/) installed (v16.0.0 or higher recommended).
- A laptop and a smartphone connected to the **SAME WiFi network**.

### 1. Install Dependencies
Clone or copy this folder structure, open a terminal in the `fruitgame` directory, and run:
```bash
npm install
```

### 2. Start the Server
Run the local dev server:
```bash
npm run dev
```

The server will automatically detect your local WiFi IP address and display the links:
```text
==================================================
🎮 FRUIT SLICING GAME RUNNING
💻 Desktop Game URL: http://localhost:3000
📱 Local WiFi URL:   http://192.168.1.10:3000
==================================================
```

### 3. Connection & Gameplay
1. Open the **Desktop Game URL** (`http://localhost:3000`) on your computer.
2. A cyberpunk pairing screen will display a large **QR Code**.
3. Scan the QR code with your phone. (It opens `http://<your-local-ip>:3000/mobile?room=XXXX`).
4. On your phone, tap **ALLOW SENSORS** (and approve the browser prompts if on iOS).
5. Tap **CALIBRATE CENTER** while holding the phone vertically in a neutral position.
6. Hold **HOLD & SWING** on your phone and swing it like a sword to slice incoming fruit!

---

## 🌐 Mobile Sensor Permissions & HTTPS

Modern browsers (especially Chrome on Android and Safari on iOS) block `deviceorientation` and `devicemotion` APIs unless the connection is secure (**HTTPS**).

### A. Testing on same WiFi (HTTP Localhost Bypass)
Some mobile browsers allow HTTP access for local networks (e.g. `192.168.x.x`). If your phone's browser blocks the sensors on HTTP:
- **Android:** Open Chrome on your phone, navigate to `chrome://flags/#unsafely-treat-insecure-origin-as-secure`, add your laptop's local IP (e.g., `http://192.168.1.10:3000`), enable the flag, and relaunch Chrome.
- **Touchpad Fallback:** Simply drag your thumb on the **TOUCHPAD FALLBACK** grid area at the bottom of the phone screen to slice immediately.

### B. Secure Local Testing (Recommended)
Use a secure tunnel tool like **ngrok** to get a free HTTPS URL:
```bash
# Install ngrok and tunnel your local port 3000
ngrok http 3000
```
Open the secure `https://<hash>.ngrok-free.app` URL on your desktop, and scan the QR code with your phone. The phone will connect securely over HTTPS, and sensors will work instantly!

---

## 🚀 Production Deployment Guide

### Option 1: Unified Deployment on Render (Simplest & Recommended)
Render allows running persistent Node.js servers with full WebSockets/Socket.IO support under HTTPS out of the box. Both frontend and backend are served together.

1. Create a free account on [Render](https://render.com/).
2. Click **New +** and select **Web Service**.
3. Connect your Git repository.
4. Set the following configurations:
   - **Name:** `neon-slash`
   - **Environment:** `Node`
   - **Build Command:** `npm install`
   - **Start Command:** `node server.js`
5. Click **Deploy Web Service**.
6. Render will build the project and provide an HTTPS URL (e.g., `https://neon-slash.onrender.com`). Open this link on your desktop and scan the QR code to play!

---

### Option 2: Split Deployment (Vercel Frontend + Render Backend)
If you prefer static hosting on Vercel for the client-side game and Render for the Socket.IO broker:

#### A. Deploy the Backend to Render
Follow the **Option 1** steps above to deploy `server.js` on Render. Keep track of your Render HTTPS URL (e.g., `https://neon-slash-server.onrender.com`).

#### B. Configure Client Scripts
Before deploying to Vercel, open `public/js/game.js` and `public/js/controller.js`, and update the Socket.IO initiation lines:
```javascript
// Change from:
const socket = io(window.location.origin);

// To your deployed Render server URL:
const socket = io("https://neon-slash-server.onrender.com");
```

#### C. Deploy to Vercel
1. Create a free account on [Vercel](https://vercel.com/).
2. Import your Git repository.
3. Vercel will automatically read `vercel.json` and deploy the `public` directory as a static site.
4. Open the deployed Vercel URL on your desktop to play!

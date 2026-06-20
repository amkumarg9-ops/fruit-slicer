// Parse Room ID from URL query parameters (?room=A8B9)
const urlParams = new URLSearchParams(window.location.search);
const roomId = urlParams.get('room');

// DOM Elements
const connStatus = document.getElementById('conn-status');
const permissionOverlay = document.getElementById('permission-overlay');
const requestPermissionBtn = document.getElementById('request-permission-btn');
const calibrateBtn = document.getElementById('calibrate-btn');
const triggerBtn = document.getElementById('trigger-btn');
const touchpad = document.getElementById('touchpad');
const touchPointer = document.getElementById('touch-pointer');
const restartBtn = document.getElementById('restart-btn');

// Debug readout elements
const valXText = document.getElementById('val-x');
const valYText = document.getElementById('val-y');
const valVText = document.getElementById('val-v');

// State Variables
let socket;
let isConnected = false;
let isSlashing = false;

// Calibration references
let baseAlpha = 0;
let baseBeta = 0;
let baseGamma = 0;
let isCalibrated = false;

// Socket connection initialization
if (!roomId) {
  alert("❌ Room ID is missing. Scan the QR code from the game screen again.");
  connStatus.innerText = "NO ROOM ID";
  connStatus.className = "status-indicator disconnected";
} else {
  initSocket();
}

function initSocket() {
  // Connect to the Socket server serving this page
  socket = io(window.location.origin);

  socket.on('connect', () => {
    isConnected = true;
    connStatus.innerText = `ROOM: ${roomId}`;
    connStatus.className = "status-indicator connected";
    
    // Join the assigned room as mobile controller
    socket.emit('join-room', { roomId, role: 'mobile' });
  });

  socket.on('disconnect', () => {
    isConnected = false;
    connStatus.innerText = "DISCONNECTED";
    connStatus.className = "status-indicator disconnected";
  });

  // Listen for game state updates from desktop
  socket.on('sensor-data', (data) => {
    // We can receive events, but mostly desktop receives from mobile.
  });

  // Listener to show restart button when game is over
  socket.on('controller-status', (data) => {
    // If desktop sends game status
  });
}

// ----------------------------------------------------
// Permission Handlers (iOS 13+ and Android support)
// ----------------------------------------------------
requestPermissionBtn.addEventListener('click', async () => {
  if (typeof DeviceOrientationEvent !== 'undefined' && 
      typeof DeviceOrientationEvent.requestPermission === 'function') {
    // iOS 13+ devices
    try {
      const permission = await DeviceOrientationEvent.requestPermission();
      if (permission === 'granted') {
        initSensors();
      } else {
        alert("Permission denied. Fallback touchpad activated.");
        permissionOverlay.classList.add('hidden');
      }
    } catch (err) {
      console.error("Permission request error:", err);
      alert("Error requesting sensor permissions. Using touchpad instead.");
      permissionOverlay.classList.add('hidden');
    }
  } else {
    // Android, standard browsers, or desktop testing
    initSensors();
  }
});

function initSensors() {
  // Register orientation and motion listeners
  window.addEventListener('deviceorientation', handleOrientation, true);
  window.addEventListener('devicemotion', handleMotion, true);
  
  // Hide overlay once sensors are bound
  permissionOverlay.classList.add('hidden');
}

// ----------------------------------------------------
// Sensor Processing & Data Transmission
// ----------------------------------------------------

// Handle orientation coordinates mapping to X/Y
function handleOrientation(event) {
  let alpha = event.alpha || 0; // Yaw (0-360)
  let beta = event.beta || 0;   // Pitch (-180 to 180)
  let gamma = event.gamma || 0; // Roll (-90 to 90)

  // Calibrate on first receipt of data
  if (!isCalibrated) {
    baseAlpha = alpha;
    baseBeta = beta;
    baseGamma = gamma;
    isCalibrated = true;
  }

  // Calculate relative angles compared to calibration base
  let rBeta = beta - baseBeta;
  let rGamma = gamma - baseGamma;

  // Handle wraps for relative coordinates
  if (rBeta > 180) rBeta -= 360;
  if (rBeta < -180) rBeta += 360;
  if (rGamma > 90) rGamma -= 180;
  if (rGamma < -90) rGamma += 180;

  // Display raw values in debug readout
  valXText.innerText = `${Math.round(rGamma)}°`;
  valYText.innerText = `${Math.round(rBeta)}°`;

  // Map angles to 0.0 - 1.0 coordinates
  // Assume a neutral movement window of +/- 30 degrees tilt is full screen width/height
  const SENSITIVITY = 30;
  let pctX = (rGamma / SENSITIVITY) * 0.5 + 0.5;
  let pctY = (rBeta / SENSITIVITY) * 0.5 + 0.5;

  // Clamp values between 0 and 1
  pctX = Math.max(0, Math.min(1, pctX));
  pctY = Math.max(0, Math.min(1, pctY));

  // Send coordinates if socket is open
  if (isConnected && socket) {
    socket.emit('sensor-data', {
      type: 'motion',
      x: pctX,
      y: pctY,
      isSlashing: isSlashing
    });
  }
}

// Accelerometer swing velocity spike check
let lastAcceleration = { x: 0, y: 0, z: 0 };
let lastAccelTime = 0;

function handleMotion(event) {
  const now = Date.now();
  if (now - lastAccelTime < 50) return; // Limit checking to every 50ms

  // Extract acceleration values excluding gravity
  let acc = event.acceleration || { x: 0, y: 0, z: 0 };
  
  // If raw acceleration isn't populated, fall back to acceleration including gravity
  if (acc.x === null || acc.y === null || acc.z === null) {
    acc = event.accelerationIncludingGravity || { x: 0, y: 0, z: 0 };
  }

  const ax = acc.x || 0;
  const ay = acc.y || 0;
  const az = acc.z || 0;

  // Calculate net velocity vector force
  const force = Math.sqrt(ax * ax + ay * ay + az * az);
  valVText.innerText = force.toFixed(1);

  // Trigger high acceleration swing indicator (thresh: 18 m/s²)
  const SWING_FORCE_THRESHOLD = 18;
  if (force > SWING_FORCE_THRESHOLD) {
    if (isConnected && socket) {
      socket.emit('sensor-data', {
        type: 'swing-spike',
        force: force
      });
    }
  }

  lastAcceleration = { x: ax, y: ay, z: az };
  lastAccelTime = now;
}

// Calibration button click
calibrateBtn.addEventListener('click', () => {
  isCalibrated = false;
  // Trigger Calibration indicator in desktop game
  if (isConnected && socket) {
    socket.emit('calibrate');
  }
  
  // Visual haptic indicator
  calibrateBtn.style.background = "var(--neon-cyan)";
  calibrateBtn.style.color = "#000";
  setTimeout(() => {
    calibrateBtn.style.background = "";
    calibrateBtn.style.color = "";
  }, 300);
});

// ----------------------------------------------------
// Grip Trigger Button (Hold to draw sword)
// ----------------------------------------------------
function startSlashing() {
  isSlashing = true;
  if (isConnected && socket) {
    socket.emit('sensor-data', {
      type: 'trigger-state',
      isSlashing: true
    });
  }
}

function stopSlashing() {
  isSlashing = false;
  if (isConnected && socket) {
    socket.emit('sensor-data', {
      type: 'trigger-state',
      isSlashing: false
    });
  }
}

triggerBtn.addEventListener('mousedown', startSlashing);
triggerBtn.addEventListener('mouseup', stopSlashing);
triggerBtn.addEventListener('touchstart', (e) => {
  e.preventDefault();
  startSlashing();
});
triggerBtn.addEventListener('touchend', (e) => {
  e.preventDefault();
  stopSlashing();
});

// ----------------------------------------------------
// Touchpad Fallback Logic
// ----------------------------------------------------
function handleTouchMove(e) {
  e.preventDefault(); // Stop page scrolling
  const touch = e.touches[0];
  const rect = touchpad.getBoundingClientRect();
  
  // Calculate touch coordinates relative to touchpad bounds
  let relativeX = (touch.clientX - rect.left) / rect.width;
  let relativeY = (touch.clientY - rect.top) / rect.height;

  // Clamp coordinates
  relativeX = Math.max(0, Math.min(1, relativeX));
  relativeY = Math.max(0, Math.min(1, relativeY));

  // Display pointer feedback
  touchPointer.style.display = 'block';
  touchPointer.style.left = `${relativeX * 100}%`;
  touchPointer.style.top = `${relativeY * 100}%`;

  // Send touch drag events as high-priority slashes
  if (isConnected && socket) {
    socket.emit('sensor-data', {
      type: 'touch',
      x: relativeX,
      y: relativeY,
      isSlashing: true
    });
  }
}

function handleTouchEnd(e) {
  e.preventDefault();
  touchPointer.style.display = 'none';
  
  if (isConnected && socket) {
    socket.emit('sensor-data', {
      type: 'touch-end',
      isSlashing: false
    });
  }
}

touchpad.addEventListener('touchstart', (e) => {
  isSlashing = true;
  handleTouchMove(e);
});
touchpad.addEventListener('touchmove', handleTouchMove);
touchpad.addEventListener('touchend', handleTouchEnd);

// ----------------------------------------------------
// Game Actions (Restart)
// ----------------------------------------------------
restartBtn.addEventListener('click', () => {
  if (isConnected && socket) {
    socket.emit('sensor-data', { type: 'restart' });
  }
  restartBtn.classList.add('hidden');
});

// Listen for gameover broadcast to display Restart button
window.addEventListener('message', (event) => {});

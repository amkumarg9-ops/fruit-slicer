const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const os = require('os');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.PORT || 3000;

// Serve static files from the public directory
app.use(express.static(path.join(__dirname, 'public')));

// Fallback routes to serve HTML files cleanly
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/mobile', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'mobile.html'));
});

// Helper to get local network IP address
function getLocalIPAddress() {
  const interfaces = os.networkInterfaces();
  for (const interfaceName in interfaces) {
    const addresses = interfaces[interfaceName];
    for (const addr of addresses) {
      // Check for IPv4 and ensure it's not a loopback address
      if (addr.family === 'IPv4' && !addr.internal) {
        return addr.address;
      }
    }
  }
  return 'localhost';
}

const LOCAL_IP = getLocalIPAddress();

// Socket.IO Room management
io.on('connection', (socket) => {
  console.log(`Socket connected: ${socket.id}`);

  // When a desktop or mobile device requests to join a room
  socket.on('join-room', ({ roomId, role }) => {
    if (!roomId) return;
    
    socket.join(roomId);
    socket.roomId = roomId;
    socket.role = role;
    
    console.log(`Socket ${socket.id} joined room ${roomId} as ${role}`);

    // If mobile joined, notify the desktop in the room
    if (role === 'mobile') {
      io.to(roomId).emit('controller-status', { connected: true, id: socket.id });
    }
  });

  // Relay motion details (gyroscope, accelerometer, touch pointer) to the room
  socket.on('sensor-data', (data) => {
    if (socket.roomId && socket.role === 'mobile') {
      // Broadcast to other sockets in the room (the desktop)
      socket.to(socket.roomId).emit('sensor-data', data);
    }
  });

  // Relay calibration trigger
  socket.on('calibrate', () => {
    if (socket.roomId && socket.role === 'mobile') {
      socket.to(socket.roomId).emit('calibrate');
    }
  });

  // Handle client disconnection
  socket.on('disconnect', () => {
    console.log(`Socket disconnected: ${socket.id}`);
    if (socket.roomId && socket.role === 'mobile') {
      io.to(socket.roomId).emit('controller-status', { connected: false, id: socket.id });
    }
  });
});

server.listen(PORT, () => {
  console.log('\n==================================================');
  console.log(`🎮 FRUIT SLICING GAME RUNNING`);
  console.log(`💻 Desktop Game URL: http://localhost:${PORT}`);
  console.log(`📱 Local WiFi URL:   http://${LOCAL_IP}:${PORT}`);
  console.log('==================================================\n');
});

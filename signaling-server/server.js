const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] }
});

const connectedDevices = new Map();

// Endpoint de diagnóstico HTTP
app.get('/status', (req, res) => {
  const devices = Array.from(connectedDevices.values());
  res.json({
    totalConectados: devices.length,
    androidOnline: devices.filter(d => d.isAndroid).map(d => d.roomId),
    todos: devices
  });
});

io.on('connection', (socket) => {
  const ts = () => new Date().toTimeString().split(' ')[0];
  console.log(`[${ts()}] NUEVA CONEXIÓN: ${socket.id} desde ${socket.handshake.address}`);

  connectedDevices.set(socket.id, {
    id: socket.id,
    status: 'Admin Windows (Menú Principal)',
    connectedAt: new Date().toISOString()
  });
  io.emit('devices-update', Array.from(connectedDevices.values()));

  // Registro de dispositivo Android
  socket.on('register-device', (deviceId) => {
    console.log(`[${ts()}] REGISTER-DEVICE: socket=${socket.id} deviceId=${deviceId}`);
    
    // Limpiar conexiones fantasma del mismo equipo
    for (const [existingSocketId, device] of connectedDevices.entries()) {
      if (device.isAndroid && device.roomId === deviceId && existingSocketId !== socket.id) {
        console.log(`[${ts()}] Eliminando conexión fantasma de Android: ${existingSocketId}`);
        const oldSocket = io.sockets.sockets.get(existingSocketId);
        if (oldSocket) oldSocket.disconnect(true);
        connectedDevices.delete(existingSocketId);
      }
    }
    
    socket.join(deviceId);
    connectedDevices.set(socket.id, {
      id: socket.id,
      roomId: deviceId,
      status: 'android-online',
      connectedAt: new Date().toISOString(),
      isAndroid: true
    });
    const onlineIds = Array.from(connectedDevices.values())
      .filter(d => d.isAndroid).map(d => d.roomId);
    console.log(`[${ts()}] Dispositivos Android online: ${JSON.stringify(onlineIds)}`);
    io.emit('online-devices', onlineIds);
    io.emit('devices-update', Array.from(connectedDevices.values()));
  });

  // Admin uniéndose a sala
  socket.on('join-room', (roomId) => {
    console.log(`[${ts()}] JOIN-ROOM: socket=${socket.id} sala=${roomId}`);
    socket.join(roomId);
    connectedDevices.set(socket.id, {
      id: socket.id,
      roomId: roomId,
      status: 'Admin Windows (Viendo Pantalla)',
      connectedAt: new Date().toISOString(),
      isAndroid: false
    });
    io.emit('devices-update', Array.from(connectedDevices.values()));
    socket.to(roomId).emit('user-connected', socket.id);
    console.log(`[${ts()}] user-connected emitido a sala ${roomId}`);
  });

  // WebRTC Signaling
  socket.on('offer', (data) => {
    console.log(`[${ts()}] OFFER recibido: roomId=${data.roomId} desde=${socket.id}`);
    const targets = Array.from(connectedDevices.values())
      .filter(d => d.roomId === data.roomId && d.id !== socket.id);
    console.log(`[${ts()}] Targets para offer: ${targets.map(t => t.id)}`);
    socket.to(data.roomId).emit('offer', data.offer);
  });

  socket.on('answer', (data) => {
    console.log(`[${ts()}] ANSWER recibido: roomId=${data.roomId} desde=${socket.id}`);
    socket.to(data.roomId).emit('answer', data.answer);
  });

  socket.on('ice-candidate', (data) => {
    console.log(`[${ts()}] ICE-CANDIDATE: roomId=${data.roomId} desde=${socket.id}`);
    socket.to(data.roomId).emit('ice-candidate', data.candidate);
  });

  socket.on('disconnect', (reason) => {
    const device = connectedDevices.get(socket.id);
    console.log(`[${ts()}] DESCONEXIÓN: ${socket.id} roomId=${device?.roomId} razón=${reason}`);
    connectedDevices.delete(socket.id);
    const onlineIds = Array.from(connectedDevices.values())
      .filter(d => d.isAndroid).map(d => d.roomId);
    io.emit('online-devices', onlineIds);
    io.emit('devices-update', Array.from(connectedDevices.values()));
  });

  socket.on('error', (err) => {
    console.error(`[${ts()}] ERROR socket ${socket.id}:`, err);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`========================================`);
  console.log(`Servidor de señalización escuchando en puerto ${PORT}`);
  console.log(`Diagnóstico: http://localhost:${PORT}/status`);
  console.log(`========================================`);
});

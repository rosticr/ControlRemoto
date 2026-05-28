const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const dgram = require('dgram');
const fs = require('fs');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Gestión de Usuarios
const USERS_FILE = path.join(__dirname, 'users.json');

function loadUsers() {
  if (!fs.existsSync(USERS_FILE)) {
    // Usuario por defecto
    const defaultUsers = [{ username: 'admin', password: 'R0st1p017', role: 'admin' }];
    fs.writeFileSync(USERS_FILE, JSON.stringify(defaultUsers, null, 2));
    return defaultUsers;
  }
  return JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
}

function saveUsers(users) {
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}

// REST API para Login
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  const users = loadUsers();
  const user = users.find(u => u.username === username && u.password === password);
  
  if (user) {
    res.json({ success: true, username: user.username, role: user.role });
  } else {
    res.status(401).json({ success: false, error: 'Credenciales incorrectas' });
  }
});

// REST API para CRUD de Usuarios
app.get('/api/users', (req, res) => {
  const users = loadUsers();
  // No devolver las contraseñas reales por seguridad en el listado
  const safeUsers = users.map(u => ({ username: u.username, role: u.role, passwordLength: u.password.length }));
  res.json(safeUsers);
});

app.post('/api/users', (req, res) => {
  const { username, password, role } = req.body;
  const users = loadUsers();
  if (users.find(u => u.username === username)) {
    return res.status(400).json({ error: 'El usuario ya existe' });
  }
  users.push({ username, password, role: role || 'user' });
  saveUsers(users);
  res.json({ success: true });
});

app.put('/api/users/:username', (req, res) => {
  const { password, role } = req.body;
  const users = loadUsers();
  const index = users.findIndex(u => u.username === req.params.username);
  if (index === -1) return res.status(404).json({ error: 'Usuario no encontrado' });
  
  if (password) users[index].password = password;
  if (role && req.params.username !== 'admin') users[index].role = role; // No permitir quitar admin al admin principal
  
  saveUsers(users);
  res.json({ success: true });
});

app.delete('/api/users/:username', (req, res) => {
  if (req.params.username === 'admin') {
    return res.status(400).json({ error: 'No se puede eliminar al administrador principal' });
  }
  const users = loadUsers();
  const filteredUsers = users.filter(u => u.username !== req.params.username);
  if (users.length === filteredUsers.length) return res.status(404).json({ error: 'Usuario no encontrado' });
  
  saveUsers(filteredUsers);
  res.json({ success: true });
});

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

// Broadcast por UDP para que Android encuentre el servidor automáticamente
const udpServer = dgram.createSocket('udp4');
udpServer.on('listening', () => {
  udpServer.setBroadcast(true);
  console.log('UDP Broadcaster activo en puerto 44444');
  setInterval(() => {
    const message = Buffer.from('ROSTI_SERVER:3000');
    udpServer.send(message, 0, message.length, 44444, '255.255.255.255');
  }, 2000);
});
udpServer.bind(() => {
  udpServer.setBroadcast(true);
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`========================================`);
  console.log(`Servidor de señalización escuchando en puerto ${PORT}`);
  console.log(`Diagnóstico: http://localhost:${PORT}/status`);
  console.log(`========================================`);
});

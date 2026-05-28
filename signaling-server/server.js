const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const dgram = require('dgram');
const fs = require('fs');
const multer = require('multer');

const app = express();
app.use(cors());
app.use(express.json());

// Sesiones en memoria para consola web y administradores
const activeSessions = new Map();

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

function getAdminPassword() {
  const users = loadUsers();
  const admin = users.find(u => u.username === 'admin');
  return admin ? admin.password : 'R0st1p017';
}

function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  const tokenVal = token || req.query.token;
  
  if (!tokenVal) {
    return res.status(401).json({ error: 'Acceso denegado. Token no proporcionado.' });
  }
  
  const session = activeSessions.get(tokenVal);
  if (!session) {
    return res.status(403).json({ error: 'Sesión inválida o expirada.' });
  }
  
  req.user = session;
  next();
}

// Interceptar descarga directa de app.apk antes de que express.static lo sirva públicamente
app.get('/app.apk', (req, res) => {
  const key = req.query.key;
  const token = req.query.token;
  
  let authorized = false;
  if (key && key === getAdminPassword()) {
    authorized = true;
  }
  if (!authorized && token && activeSessions.has(token)) {
    authorized = true;
  }

  if (!authorized) {
    return res.status(403).send('Acceso denegado. Se requiere autenticacion. Si usas Downloader, agrega la clave de descarga, ej: acceso.rosti.cr/app.apk?key=TU_CLAVE');
  }

  const filePath = path.join(__dirname, 'public', 'app.apk');
  if (!fs.existsSync(filePath)) {
    return res.status(404).send('Archivo APK no encontrado. Sube uno primero.');
  }
  res.download(filePath);
});

app.use(express.static(path.join(__dirname, 'public')));

// REST API para Login
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  const users = loadUsers();
  const user = users.find(u => u.username === username && u.password === password);
  
  if (user) {
    const token = Math.random().toString(36).substring(2) + Date.now().toString(36);
    activeSessions.set(token, { username: user.username, role: user.role });
    res.json({ success: true, token, username: user.username, role: user.role });
  } else {
    res.status(401).json({ success: false, error: 'Credenciales incorrectas' });
  }
});

// REST API para Logout
app.post('/api/logout', (req, res) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  const tokenVal = token || req.query.token;
  if (tokenVal) {
    activeSessions.delete(tokenVal);
  }
  res.json({ success: true });
});

// REST API para CRUD de Usuarios
app.get('/api/users', authenticateToken, (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Acceso denegado. Se requiere rol de administrador.' });
  }
  const users = loadUsers();
  // No devolver las contraseñas reales por seguridad en el listado
  const safeUsers = users.map(u => ({ username: u.username, role: u.role, passwordLength: u.password.length }));
  res.json(safeUsers);
});

app.post('/api/users', authenticateToken, (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Acceso denegado. Se requiere rol de administrador.' });
  }
  const { username, password, role } = req.body;
  const users = loadUsers();
  if (users.find(u => u.username === username)) {
    return res.status(400).json({ error: 'El usuario ya existe' });
  }
  users.push({ username, password, role: role || 'user' });
  saveUsers(users);
  res.json({ success: true });
});

app.put('/api/users/:username', authenticateToken, (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Acceso denegado. Se requiere rol de administrador.' });
  }
  const { password, role } = req.body;
  const users = loadUsers();
  const index = users.findIndex(u => u.username === req.params.username);
  if (index === -1) return res.status(404).json({ error: 'Usuario no encontrado' });
  
  if (password) users[index].password = password;
  if (role && req.params.username !== 'admin') users[index].role = role; // No permitir quitar admin al admin principal
  
  saveUsers(users);
  res.json({ success: true });
});

app.delete('/api/users/:username', authenticateToken, (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Acceso denegado. Se requiere rol de administrador.' });
  }
  if (req.params.username === 'admin') {
    return res.status(400).json({ error: 'No se puede eliminar al administrador principal' });
  }
  const users = loadUsers();
  const filteredUsers = users.filter(u => u.username !== req.params.username);
  if (users.length === filteredUsers.length) return res.status(404).json({ error: 'Usuario no encontrado' });
  
  saveUsers(filteredUsers);
  res.json({ success: true });
});

// Configuración de Multer para Carga de APKs
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const dir = path.join(__dirname, 'public', 'versions');
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    cb(null, dir);
  },
  filename: function (req, file, cb) {
    const version = req.body.version || 'unknown';
    // Reemplazar espacios y caracteres no seguros
    const safeVersion = version.replace(/[^a-zA-Z0-9.-]/g, '_');
    cb(null, `app-v${safeVersion}.apk`);
  }
});

const upload = multer({ storage: storage });

const APK_HISTORY_FILE = path.join(__dirname, 'apks_history.json');

function loadApkHistory() {
  if (!fs.existsSync(APK_HISTORY_FILE)) {
    fs.writeFileSync(APK_HISTORY_FILE, JSON.stringify([], null, 2));
    return [];
  }
  try {
    return JSON.parse(fs.readFileSync(APK_HISTORY_FILE, 'utf8'));
  } catch (e) {
    return [];
  }
}

function saveApkHistory(history) {
  fs.writeFileSync(APK_HISTORY_FILE, JSON.stringify(history, null, 2));
}

// Endpoint para subir APK (solo Administradores)
app.post('/api/upload-apk', authenticateToken, upload.single('apk'), (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Solo los administradores pueden subir APKs.' });
  }

  const { version, notes } = req.body;
  if (!version) {
    return res.status(400).json({ error: 'La versión es requerida.' });
  }

  if (!req.file) {
    return res.status(400).json({ error: 'El archivo APK es requerido.' });
  }

  const filename = req.file.filename;
  const history = loadApkHistory();
  
  // Reemplazar si ya existe la misma versión
  const existingIndex = history.findIndex(h => h.version === version);
  
  const record = {
    version,
    filename,
    uploadedBy: req.user.username,
    uploadedAt: new Date().toISOString(),
    notes: notes || ''
  };

  if (existingIndex !== -1) {
    // Eliminar archivo anterior si cambió de nombre
    const oldRecord = history[existingIndex];
    if (oldRecord.filename !== filename) {
      const oldPath = path.join(__dirname, 'public', 'versions', oldRecord.filename);
      if (fs.existsSync(oldPath)) {
        fs.unlinkSync(oldPath);
      }
    }
    history[existingIndex] = record;
  } else {
    history.push(record);
  }
  
  saveApkHistory(history);

  // Copiar a public/app.apk para descarga directa principal
  const srcPath = req.file.path;
  const destPath = path.join(__dirname, 'public', 'app.apk');
  fs.copyFileSync(srcPath, destPath);

  res.json({ success: true, record });
});

// Endpoint para obtener historial de versiones (todos los usuarios logueados)
app.get('/api/apk-history', authenticateToken, (req, res) => {
  res.json(loadApkHistory());
});

// Endpoint para eliminar versión (solo Administradores)
app.delete('/api/delete-apk/:version', authenticateToken, (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Solo los administradores pueden eliminar versiones.' });
  }

  const version = req.params.version;
  const history = loadApkHistory();
  const index = history.findIndex(h => h.version === version);

  if (index === -1) {
    return res.status(404).json({ error: 'Versión no encontrada.' });
  }

  const record = history[index];
  const filePath = path.join(__dirname, 'public', 'versions', record.filename);
  
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }

  history.splice(index, 1);
  saveApkHistory(history);

  res.json({ success: true });
});

// Endpoint protegido de descarga de versiones de APK
app.get('/download/:filename', (req, res) => {
  const filename = req.params.filename;
  const key = req.query.key;
  const token = req.query.token;

  let authorized = false;

  if (key && key === getAdminPassword()) {
    authorized = true;
  }

  if (!authorized && token && activeSessions.has(token)) {
    authorized = true;
  }

  if (!authorized) {
    return res.status(403).send('Acceso denegado. Se requiere autenticación para descargar.');
  }

  const filePath = filename === 'app.apk' 
    ? path.join(__dirname, 'public', 'app.apk') 
    : path.join(__dirname, 'public', 'versions', filename);

  if (!fs.existsSync(filePath)) {
    return res.status(404).send('Archivo no encontrado.');
  }

  res.download(filePath);
});

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] }
});

// Middleware para autenticar conexiones de Socket.io
io.use((socket, next) => {
  const token = socket.handshake.auth && socket.handshake.auth.token;
  if (token) {
    const session = activeSessions.get(token);
    if (session) {
      socket.user = session;
    }
  }
  next();
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

  // Si el socket se autenticó durante el handshake (ej: app Windows Admin)
  if (socket.user) {
    socket.join('dashboard-room');
    connectedDevices.set(socket.id, {
      id: socket.id,
      status: `Admin Windows (${socket.user.username})`,
      connectedAt: new Date().toISOString()
    });
    io.to('dashboard-room').emit('devices-update', Array.from(connectedDevices.values()));
  }

  // Permitir autenticación después de conectar (para la consola web después de iniciar sesión)
  socket.on('authenticate', (token) => {
    const session = activeSessions.get(token);
    if (session) {
      socket.user = session;
      socket.join('dashboard-room');
      connectedDevices.set(socket.id, {
        id: socket.id,
        status: `Admin Web (${session.username})`,
        connectedAt: new Date().toISOString()
      });
      io.to('dashboard-room').emit('devices-update', Array.from(connectedDevices.values()));
      
      // Enviar lista inicial de equipos online
      const onlineIds = Array.from(connectedDevices.values())
        .filter(d => d.isAndroid).map(d => d.roomId);
      socket.emit('online-devices', onlineIds);
      console.log(`[${ts()}] Socket ${socket.id} autenticado como ${session.username}`);
    } else {
      socket.emit('auth-error', 'Token inválido');
    }
  });

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
    io.to('dashboard-room').emit('online-devices', onlineIds);
    io.to('dashboard-room').emit('devices-update', Array.from(connectedDevices.values()));
  });

  // Admin uniéndose a sala
  socket.on('join-room', (roomId) => {
    console.log(`[${ts()}] JOIN-ROOM: socket=${socket.id} sala=${roomId}`);
    socket.join(roomId);
    connectedDevices.set(socket.id, {
      id: socket.id,
      roomId: roomId,
      status: `Admin Windows (Viendo Pantalla - ${socket.user ? socket.user.username : 'legacy'})`,
      connectedAt: new Date().toISOString(),
      isAndroid: false
    });
    io.to('dashboard-room').emit('devices-update', Array.from(connectedDevices.values()));
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
    io.to('dashboard-room').emit('online-devices', onlineIds);
    io.to('dashboard-room').emit('devices-update', Array.from(connectedDevices.values()));
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

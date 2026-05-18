const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());

// Servir la carpeta public para la consola web
app.use(express.static(path.join(__dirname, 'public')));

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Almacenar el estado de los equipos conectados
// Estructura: { socketId: { type: 'admin'|'android', roomId: string, connectedAt: date } }
const connectedDevices = new Map();

io.on('connection', (socket) => {
  console.log(`Nuevo cliente conectado: ${socket.id}`);
  
  // Por defecto se registra como cliente desconocido hasta que se una a una sala
  connectedDevices.set(socket.id, { 
    id: socket.id, 
    status: 'conectado, sin sala', 
    connectedAt: new Date().toISOString() 
  });
  io.emit('devices-update', Array.from(connectedDevices.values()));

  socket.on('join-room', (roomId) => {
    socket.join(roomId);
    console.log(`Cliente ${socket.id} se unió a la sala: ${roomId}`);
    
    // Actualizar estado
    connectedDevices.set(socket.id, {
      id: socket.id,
      roomId: roomId,
      status: 'en sala',
      connectedAt: new Date().toISOString()
    });
    
    // Emitir a todos (incluyendo la web consola)
    io.emit('devices-update', Array.from(connectedDevices.values()));
    socket.to(roomId).emit('user-connected', socket.id);
  });

  socket.on('offer', (data) => {
    socket.to(data.roomId).emit('offer', data.offer);
  });

  socket.on('answer', (data) => {
    socket.to(data.roomId).emit('answer', data.answer);
  });

  socket.on('ice-candidate', (data) => {
    socket.to(data.roomId).emit('ice-candidate', data.candidate);
  });

  socket.on('disconnect', () => {
    console.log(`Cliente desconectado: ${socket.id}`);
    connectedDevices.delete(socket.id);
    io.emit('devices-update', Array.from(connectedDevices.values()));
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Servidor de señalización escuchando en el puerto ${PORT}`);
  console.log(`Consola web de administración disponible en http://localhost:${PORT}`);
});

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*", // Permitir conexiones desde cualquier origen (Android y Desktop)
    methods: ["GET", "POST"]
  }
});

io.on('connection', (socket) => {
  console.log(`Nuevo cliente conectado: ${socket.id}`);

  // El cliente (Windows o Android) pide unirse a una sala específica
  socket.on('join-room', (roomId) => {
    socket.join(roomId);
    console.log(`Cliente ${socket.id} se unió a la sala: ${roomId}`);
    
    // Notificar a otros en la sala que alguien se unió
    socket.to(roomId).emit('user-connected', socket.id);
  });

  // Señalización WebRTC: Oferta
  socket.on('offer', (data) => {
    socket.to(data.roomId).emit('offer', data.offer);
  });

  // Señalización WebRTC: Respuesta
  socket.on('answer', (data) => {
    socket.to(data.roomId).emit('answer', data.answer);
  });

  // Señalización WebRTC: Candidatos ICE
  socket.on('ice-candidate', (data) => {
    socket.to(data.roomId).emit('ice-candidate', data.candidate);
  });

  socket.on('disconnect', () => {
    console.log(`Cliente desconectado: ${socket.id}`);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Servidor de señalización (WebRTC) escuchando en http://localhost:${PORT}`);
});

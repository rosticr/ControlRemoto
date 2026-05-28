const { contextBridge, ipcRenderer } = require('electron');
const fs = require('fs');
const path = require('path');
const os = require('os');
const io = require('socket.io-client');

let socket = null;

contextBridge.exposeInMainWorld('electronAPI', {
  // Input simulation forwarding
  sendInputCmd: (cmd) => ipcRenderer.send('simulate-input', cmd),

  // Screen source fetching
  getScreenSources: () => ipcRenderer.invoke('get-screen-sources'),

  // Config management
  loadConfig: () => ipcRenderer.invoke('load-config'),
  saveConfig: (config) => ipcRenderer.invoke('save-config', config),
  getHostName: () => os.hostname(),

  // Window control
  minimizeWindow: () => ipcRenderer.send('window-minimize'),
  hideWindow: () => ipcRenderer.send('window-hide'),
  closeWindow: () => ipcRenderer.send('window-close'),

  // Socket Connection and Signaling (via HTML events)
  connectSocket: (url, deviceId) => {
    if (socket) socket.disconnect();
    
    console.log(`Preload connecting to signaling server: ${url} for room: ${deviceId}`);
    socket = io(url, {
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 2000
    });

    socket.on('connect', () => {
      window.dispatchEvent(new CustomEvent('socket-connected'));
      socket.emit('register-device', deviceId);
    });

    socket.on('connect_error', (err) => {
      window.dispatchEvent(new CustomEvent('socket-connect-error', { detail: err.message }));
    });

    socket.on('disconnect', (reason) => {
      window.dispatchEvent(new CustomEvent('socket-disconnected', { detail: reason }));
    });

    socket.on('offer', (offer) => {
      window.dispatchEvent(new CustomEvent('socket-offer', { detail: offer }));
    });

    socket.on('ice-candidate', (candidate) => {
      window.dispatchEvent(new CustomEvent('socket-ice-candidate', { detail: candidate }));
    });
  },

  disconnectSocket: () => {
    if (socket) {
      socket.disconnect();
      socket = null;
      window.dispatchEvent(new CustomEvent('socket-disconnected', { detail: 'manual' }));
    }
  },

  sendAnswer: (deviceId, answer) => {
    if (socket) socket.emit('answer', { roomId: deviceId, answer });
  },

  sendIceCandidate: (deviceId, candidate) => {
    if (socket) socket.emit('ice-candidate', { roomId: deviceId, candidate });
  },

  // File Manager Helpers (to execute inside Node sandbox)
  fs: {
    listDir: (dirPath) => {
      try {
        let targetPath = dirPath;
        
        // If empty path, default to home directory
        if (!targetPath) {
          targetPath = os.homedir();
        }

        // Standardize path separators for Windows
        targetPath = path.resolve(targetPath).replace(/\\/g, '/');

        if (!fs.existsSync(targetPath)) {
          return { error: 'El directorio no existe.' };
        }

        const stats = fs.statSync(targetPath);
        if (!stats.isDirectory()) {
          return { error: 'La ruta no es un directorio.' };
        }

        const filesList = [];

        // Add parent directory link (unless we are at root level like C:/)
        const parentPath = path.dirname(targetPath).replace(/\\/g, '/');
        if (parentPath !== targetPath) {
          filesList.push({
            name: '..',
            type: 'folder',
            size: '',
            date: ''
          });
        }

        const items = fs.readdirSync(targetPath);
        for (const item of items) {
          try {
            const itemPath = path.join(targetPath, item).replace(/\\/g, '/');
            const itemStats = fs.statSync(itemPath);

            // Format date
            const dateStr = itemStats.mtime.toISOString().replace('T', ' ').substring(0, 16);

            // Format size
            let sizeStr = '';
            if (itemStats.isFile()) {
              const bytes = itemStats.size;
              if (bytes < 1024) sizeStr = `${bytes} B`;
              else if (bytes < 1024 * 1024) sizeStr = `${(bytes / 1024).toFixed(1)} KB`;
              else if (bytes < 1024 * 1024 * 1024) sizeStr = `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
              else sizeStr = `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
            }

            filesList.push({
              name: item,
              type: itemStats.isDirectory() ? 'folder' : 'file',
              size: sizeStr,
              date: dateStr
            });
          } catch (e) {
            // Ignore items with access restrictions (e.g. system volume information)
          }
        }

        // Sort: folders first, then files
        filesList.sort((a, b) => {
          if (a.name === '..') return -1;
          if (b.name === '..') return 1;
          if (a.type === 'folder' && b.type !== 'folder') return -1;
          if (a.type !== 'folder' && b.type === 'folder') return 1;
          return a.name.localeCompare(b.name);
        });

        return {
          currentPath: targetPath,
          files: filesList
        };

      } catch (err) {
        return { error: err.message };
      }
    },

    // Reading file chunks for downloading from controlled PC
    startDownloadStream: (filePath, onChunk, onComplete, onError) => {
      try {
        const resolvedPath = path.resolve(filePath);
        if (!fs.existsSync(resolvedPath)) {
          onError('El archivo no existe.');
          return;
        }

        const stats = fs.statSync(resolvedPath);
        if (!stats.isFile()) {
          onError('La ruta no corresponde a un archivo.');
          return;
        }

        const stream = fs.createReadStream(resolvedPath, { highWaterMark: 64 * 1024 }); // 64KB chunks
        
        stream.on('data', (chunk) => {
          // Convert Buffer to ArrayBuffer to pass through ContextBridge
          const arrayBuffer = chunk.buffer.slice(chunk.byteOffset, chunk.byteOffset + chunk.byteLength);
          onChunk(arrayBuffer);
        });

        stream.on('end', () => {
          onComplete();
        });

        stream.on('error', (err) => {
          onError(err.message);
        });

      } catch (err) {
        onError(err.message);
      }
    },

    // Writing files uploaded to this PC
    startUploadStream: (filePath) => {
      try {
        const resolvedPath = path.resolve(filePath);
        // Ensure parent directory exists
        const dir = path.dirname(resolvedPath);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
        
        const writeStream = fs.createWriteStream(resolvedPath);
        return {
          write: (arrayBuffer) => {
            const buffer = Buffer.from(arrayBuffer);
            writeStream.write(buffer);
          },
          close: () => {
            writeStream.end();
          }
        };
      } catch (err) {
        console.error("Error creating upload write stream", err);
        throw err;
      }
    }
  }
});

// Escuchar evento IPC desde la bandeja del sistema para abrir ajustes
ipcRenderer.on('trigger-settings-unlock', () => {
  window.dispatchEvent(new CustomEvent('tray-trigger-settings-unlock'));
});

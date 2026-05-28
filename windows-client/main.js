const { app, BrowserWindow, ipcMain, desktopCapturer, Menu, Tray, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

let mainWindow;
let tray;
let inputSimulator;
const configPath = path.join(app.getPath('userData'), 'config.json');

// Default Configuration
let config = {
  serverUrl: 'https://acceso.rosti.cr',
  deviceId: 'win-' + Math.random().toString(36).substring(2, 8).toUpperCase(),
  deviceName: require('os').hostname(),
  group: 'Sin Grupo',
  runOnStartup: true,
  configured: false
};

// Load Config from disk
function loadConfig() {
  if (fs.existsSync(configPath)) {
    try {
      const data = fs.readFileSync(configPath, 'utf8');
      config = { ...config, ...JSON.parse(data) };
      
      // Force migration to remote cloud URL if it is empty, local, or contains port 3000
      if (!config.serverUrl || config.serverUrl.includes('localhost') || config.serverUrl.includes('127.0.0.1') || config.serverUrl.includes(':3000')) {
        config.serverUrl = 'https://acceso.rosti.cr';
        saveConfig(config);
      }
    } catch (e) {
      console.error("Error parsing config file, using default config", e);
    }
  } else {
    saveConfig(config);
  }
  return config;
}

// Save Config to disk
function saveConfig(newConfig) {
  config = { ...config, ...newConfig };
  try {
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
    // Update startup settings in Windows
    app.setLoginItemSettings({
      openAtLogin: config.runOnStartup,
      path: app.getPath('exe'),
      args: ['--hidden']
    });
  } catch (e) {
    console.error("Error writing config file", e);
  }
}

// Native Input Simulator startup
function startInputSimulator() {
  let simPath = path.join(__dirname, 'InputSimulator.exe');
  if (simPath.includes('app.asar')) {
    simPath = simPath.replace('app.asar', 'app.asar.unpacked');
  }
  if (fs.existsSync(simPath)) {
    console.log("Starting InputSimulator helper from:", simPath);
    inputSimulator = spawn(simPath, [], { stdio: ['pipe', 'pipe', 'pipe'] });

    inputSimulator.stdout.on('data', (data) => {
      console.log(`[Simulator STDOUT]: ${data.toString().trim()}`);
    });

    inputSimulator.stderr.on('data', (data) => {
      console.error(`[Simulator STDERR]: ${data.toString().trim()}`);
    });

    inputSimulator.on('close', (code) => {
      console.log(`InputSimulator process exited with code ${code}. Restarting...`);
      setTimeout(startInputSimulator, 2000);
    });
  } else {
    console.error("InputSimulator.exe not found! Mouse and keyboard control will not work.");
  }
}

// Single Instance Lock
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    // Someone tried to run a second instance, focus our window.
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 440,
    height: 700,
    resizable: false,
    frame: false,
    transparent: true,
    skipTaskbar: false,
    show: false, // will show manually if not launched --hidden
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false
    }
  });

  mainWindow.loadFile('index.html');

  mainWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
    console.log(`[Client Console] ${message} (at ${sourceId}:${line})`);
  });

  // Do not exit app when window is closed, just hide it
  mainWindow.on('close', (event) => {
    if (!app.isQuiting) {
      event.preventDefault();
      mainWindow.hide();
    }
    return false;
  });
}

function createTray() {
  // Create a simple tray icon. We will generate a colored flame icon programmatically if file doesn't exist
  let trayIconPath = path.join(__dirname, 'tray_icon.png');
  
  // For development fallback, use a built-in Electron icon or programmatic nativeImage
  let trayImage;
  if (fs.existsSync(trayIconPath)) {
    trayImage = nativeImage.createFromPath(trayIconPath);
  } else {
    // Generate a simple 16x16 red flame square using buffer
    const buffer = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAABGdBTUEAALGPC/xhBQAAACBjSFJNAAB6JgAAgIQAAPoAAACA6AAAdTAAAOpgAAA6mAAAF3CculE8AAAAX0lEQVR42mP8z8AARjDw/0eCgTwDEyM+eXQD0AxA1kAzAM0AJAOQDUAyANkAJAOQDWD4jw0M/6EYpAcZHwP9HlT3wGoAnP9gDADyP7ofUBwK/tPrQYoDQFqEGAgAAP6+O16Z6/Z+AAAAAElFTkSuQmCC',
      'base64'
    );
    trayImage = nativeImage.createFromBuffer(buffer);
  }

  tray = new Tray(trayImage.resize({ width: 16, height: 16 }));
  const contextMenu = Menu.buildFromTemplate([
    { 
      label: 'Abrir Panel de Control', 
      click: () => {
        mainWindow.show();
        mainWindow.focus();
      } 
    },
    {
      label: 'Configuración Avanzada',
      click: () => {
        mainWindow.show();
        mainWindow.focus();
        mainWindow.webContents.send('trigger-settings-unlock');
      }
    },
    { type: 'separator' },
    { 
      label: 'Salir', 
      click: () => {
        app.isQuiting = true;
        if (inputSimulator) inputSimulator.kill();
        app.quit();
      } 
    }
  ]);

  tray.setToolTip('Rosti - Cliente Windows Remoto');
  tray.setContextMenu(contextMenu);

  tray.on('double-click', () => {
    mainWindow.show();
    mainWindow.focus();
  });
}

app.whenReady().then(() => {
  loadConfig();
  startInputSimulator();
  createWindow();
  createTray();

  // If app is not started with --hidden flag, show the window
  const isHidden = process.argv.includes('--hidden');
  if (!isHidden) {
    mainWindow.once('ready-to-show', () => {
      mainWindow.show();
    });
  }

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') {
    // Keep app running in tray
  }
});

// IPC Handler - Simulate Input via C# program
ipcMain.on('simulate-input', (event, cmd) => {
  if (inputSimulator && inputSimulator.stdin.writable) {
    inputSimulator.stdin.write(cmd + '\n');
  }
});

// IPC Handler - Get Screen Capturing Sources
ipcMain.handle('get-screen-sources', async () => {
  const sources = await desktopCapturer.getSources({ types: ['screen'] });
  return sources.map(source => ({
    id: source.id,
    name: source.name
  }));
});

// IPC Handler - Load & Save Settings
ipcMain.handle('load-config', () => {
  return loadConfig();
});

ipcMain.handle('save-config', (event, newConfig) => {
  saveConfig(newConfig);
  return config;
});

// IPC Handler - Window controls
ipcMain.on('window-minimize', () => {
  if (mainWindow) mainWindow.minimize();
});

ipcMain.on('window-hide', () => {
  if (mainWindow) mainWindow.hide();
});

ipcMain.on('window-close', () => {
  // Minimize to tray instead of closing
  if (mainWindow) mainWindow.hide();
});

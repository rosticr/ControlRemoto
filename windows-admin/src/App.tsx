import { useState, useRef, useEffect } from 'react';
import { io, Socket } from 'socket.io-client';
import { Monitor, FolderUp } from 'lucide-react';
import ConnectionPanel from './components/ConnectionPanel';
import ScreenViewer from './components/ScreenViewer';
import FileManager from './components/FileManager';
import Login from './components/Login';

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [roomId, setRoomId] = useState('');
  const [activeTab, setActiveTab] = useState<'screen' | 'files'>('screen');
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [onlineDevices, setOnlineDevices] = useState<string[]>([]);
  
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const dataChannelRef = useRef<RTCDataChannel | null>(null);

  useEffect(() => {
    if (isAuthenticated) {
      const globalSocket = io('https://rosti-server.onrender.com');
      
      globalSocket.on('connect', () => {
        console.log("Conectado al servidor como Administrador");
      });
      
      globalSocket.on('online-devices', (devices: string[]) => {
        setOnlineDevices(devices);
      });
      
      globalSocket.on('devices-update', (devices: any[]) => {
        const androidIds = devices.filter((d: any) => d.isAndroid).map((d: any) => d.roomId);
        setOnlineDevices(androidIds);
      });
      
      setSocket(globalSocket);
      
      return () => {
        globalSocket.disconnect();
      };
    }
  }, [isAuthenticated]);

  useEffect(() => {
    if (isConnected && roomId && !onlineDevices.includes(roomId)) {
      console.log('El dispositivo remoto se desconectó. Terminando sesión.');
      disconnect();
    }
  }, [onlineDevices, isConnected, roomId]);

  const connectToSignalingServer = async (roomIdToJoin: string) => {
    console.log("CLICK en conectar. Socket es:", socket ? "Existe" : "NULL");
    if (!socket) {
      console.log("ERROR: socket es null");
      return;
    }
    setIsConnecting(true);
    
    // Limpiar listeners anteriores de llamadas
    socket.off('answer');
    socket.off('ice-candidate');

    socket.emit('join-room', roomIdToJoin);
    setIsConnected(true);
    setIsConnecting(false);
    setRoomId(roomIdToJoin);
    
    setupWebRTC(socket, roomIdToJoin);

    // Windows inicia la transmisión de video pidiendo un Offer
    try {
      const offer = await peerConnectionRef.current?.createOffer();
      if (offer) {
        await peerConnectionRef.current?.setLocalDescription(offer);
        socket.emit('offer', { roomId: roomIdToJoin, offer });
      }
    } catch (err) {
      console.error("Error creating offer:", err);
    }

    socket.on('answer', async (answer) => {
      if (!peerConnectionRef.current) return;
      try {
        await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(answer));
      } catch (err) {
        console.error("Error setting remote description from answer:", err);
      }
    });

    socket.on('ice-candidate', async (candidate) => {
      if (!peerConnectionRef.current) return;
      try {
        await peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (e) {
        console.error('Error adding received ice candidate', e);
      }
    });
  };

  const setupWebRTC = (socket: Socket, room: string) => {
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
    }
    
    const configuration = { 
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
        { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' },
        { urls: 'turn:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' }
      ] 
    };
    const peerConnection = new RTCPeerConnection(configuration);
    
    // Explicitly tell the peer connection we want to receive video
    try {
      peerConnection.addTransceiver('video', { direction: 'recvonly' });
    } catch (e) {
      console.error('Error adding transceiver', e);
    }
    
    peerConnection.addEventListener('icecandidate', event => {
      if (event.candidate) {
        socket.emit('ice-candidate', { roomId: room, candidate: event.candidate });
      }
    });

    peerConnection.addEventListener('track', event => {
      console.log('Received remote track', event.streams);
      if (event.streams && event.streams[0]) {
        setRemoteStream(event.streams[0]);
      } else {
        console.warn('No streams found in track event, creating a new MediaStream');
        const newStream = new MediaStream([event.track]);
        setRemoteStream(newStream);
      }
    });

    // Create a data channel for mouse/keyboard controls
    const controlChannel = peerConnection.createDataChannel('control');
    controlChannel.onopen = () => console.log('Control channel opened');
    dataChannelRef.current = controlChannel;
    
    peerConnectionRef.current = peerConnection;
  };

  const disconnect = () => {
    if (socket) {
      socket.off('answer');
      socket.off('ice-candidate');
    }
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }
    dataChannelRef.current = null;
    setIsConnected(false);
    setRemoteStream(null);
  };

  const handleMouseEvent = (type: string, x: number, y: number) => {
    if (dataChannelRef.current && dataChannelRef.current.readyState === 'open') {
      const message = JSON.stringify({ type, x, y });
      dataChannelRef.current.send(message);
    }
  };

  const handleKeyEvent = (key: string) => {
    if (dataChannelRef.current && dataChannelRef.current.readyState === 'open') {
      const message = JSON.stringify({ type: 'key', key });
      dataChannelRef.current.send(message);
    }
  };

  if (!isAuthenticated) {
    return <Login onLoginSuccess={() => setIsAuthenticated(true)} />;
  }

  return (
    <div className="app-container">
      <div className="sidebar">
        <div className="logo">
          <h1>Control Remoto</h1>
        </div>

        <ConnectionPanel 
          isConnected={isConnected} 
          isConnecting={isConnecting}
          onlineDevices={onlineDevices}
          onConnect={connectToSignalingServer} 
          onDisconnect={disconnect} 
        />

        {isConnected && (
          <div className="tabs glass-panel">
            <div 
              className={`tab ${activeTab === 'screen' ? 'active' : ''}`}
              onClick={() => setActiveTab('screen')}
            >
              <Monitor size={18} style={{ marginBottom: '4px' }} />
              <div>Pantalla</div>
            </div>
            <div 
              className={`tab ${activeTab === 'files' ? 'active' : ''}`}
              onClick={() => setActiveTab('files')}
            >
              <FolderUp size={18} style={{ marginBottom: '4px' }} />
              <div>Archivos</div>
            </div>
          </div>
        )}
      </div>

      <div className="main-content">
        {activeTab === 'screen' ? (
          <ScreenViewer stream={remoteStream} onMouseEvent={handleMouseEvent} onKeyEvent={handleKeyEvent} />
        ) : (
          <FileManager />
        )}
      </div>
    </div>
  );
}

export default App;

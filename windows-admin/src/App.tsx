import { useState, useRef, useEffect } from 'react';
import { io, Socket } from 'socket.io-client';
import { Monitor, FolderUp, LogOut } from 'lucide-react';
import ConnectionPanel from './components/ConnectionPanel';
import ScreenViewer from './components/ScreenViewer';
import FileManager from './components/FileManager';
import Login from './components/Login';
import UsersManager from './components/UsersManager';
import { Users } from 'lucide-react';

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [currentServerUrl, setCurrentServerUrl] = useState('https://rosti-server.onrender.com');
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [roomId, setRoomId] = useState('');
  const [activeTab, setActiveTab] = useState<'screen' | 'files' | 'users'>('screen');
  const [currentUser, setCurrentUser] = useState({ username: '', role: '' });
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [onlineDevices, setOnlineDevices] = useState<string[]>([]);
  const [fileChannel, setFileChannel] = useState<RTCDataChannel | null>(null);
  
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const dataChannelRef = useRef<RTCDataChannel | null>(null);
  const isRemoteDescriptionSetRef = useRef(false);
  const pendingIceCandidatesRef = useRef<RTCIceCandidateInit[]>([]);

  useEffect(() => {
    if (isAuthenticated) {
      const globalSocket = io(currentServerUrl);
      
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
        isRemoteDescriptionSetRef.current = true;
        
        // Procesar candidatos encolados
        for (const candidate of pendingIceCandidatesRef.current) {
          try {
            await peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(candidate));
          } catch (e) {
            console.error('Error adding queued ice candidate', e);
          }
        }
        pendingIceCandidatesRef.current = [];
      } catch (err) {
        console.error("Error setting remote description from answer:", err);
      }
    });

    socket.on('ice-candidate', async (candidate) => {
      console.log('Recibido ICE candidate remoto:', JSON.stringify(candidate));
      if (!peerConnectionRef.current) return;
      
      if (isRemoteDescriptionSetRef.current) {
        try {
          await peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (e) {
          console.error('Error adding received ice candidate', e);
        }
      } else {
        // Encolar candidato si la descripción remota aún no está lista
        pendingIceCandidatesRef.current.push(candidate);
      }
    });
  };

  const setupWebRTC = (socket: Socket, room: string) => {
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
    }
    
    isRemoteDescriptionSetRef.current = false;
    pendingIceCandidatesRef.current = [];
    
    const configuration = { 
      iceServers: [
        {
          urls: "stun:stun.relay.metered.ca:80",
        },
        {
          urls: "turn:global.relay.metered.ca:80?transport=tcp",
          username: "93d3531d6cb9d21936c44b01",
          credential: "1WRQmmSv2+K85BnG",
        },
        {
          urls: "turns:global.relay.metered.ca:443?transport=tcp",
          username: "93d3531d6cb9d21936c44b01",
          credential: "1WRQmmSv2+K85BnG",
        }
      ] 
    };
    const peerConnection = new RTCPeerConnection(configuration);
    peerConnectionRef.current = peerConnection;

    // Monitor de estado de ICE
    peerConnection.oniceconnectionstatechange = () => {
      console.log('ICE Connection State:', peerConnection.iceConnectionState);
      if (peerConnection.iceConnectionState === 'failed') {
        console.error('La conexión WebRTC falló (posible bloqueo de firewall o TURN server inactivo).');
      }
    };

    // Monitor de estado de conexión
    peerConnection.onconnectionstatechange = () => {
      console.log('WebRTC Connection State:', peerConnection.connectionState);
    };
    
    // Explicitly tell the peer connection we want to receive video
    try {
      peerConnection.addTransceiver('video', { direction: 'recvonly' });
    } catch (e) {
      console.error('Error adding transceiver', e);
    }
    
    peerConnection.addEventListener('icecandidate', event => {
      if (event.candidate) {
        console.log('Enviando ICE candidate local:', JSON.stringify(event.candidate));
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

    // Create a data channel for file transfer
    const filesChannel = peerConnection.createDataChannel('files');
    filesChannel.binaryType = 'arraybuffer';
    filesChannel.onopen = () => {
      console.log('File channel opened');
      setFileChannel(filesChannel);
    };
    filesChannel.onclose = () => setFileChannel(null);
    
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
    setFileChannel(null);
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

  const handleLogout = () => {
    disconnect();
    if (socket) {
      socket.disconnect();
      setSocket(null);
    }
    setIsAuthenticated(false);
  };

  if (!isAuthenticated) {
    return <Login onLoginSuccess={(url, username, role) => {
      setCurrentServerUrl(url);
      setCurrentUser({ username, role });
      setIsAuthenticated(true);
    }} />;
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
            {currentUser.role === 'admin' && (
              <div 
                className={`tab ${activeTab === 'users' ? 'active' : ''}`}
                onClick={() => setActiveTab('users')}
              >
                <Users size={18} style={{ marginBottom: '4px' }} />
                <div>Usuarios</div>
              </div>
            )}
          </div>
        )}

        <div style={{ marginTop: 'auto', paddingTop: '20px' }}>
          <button 
            onClick={handleLogout}
            style={{
              width: '100%',
              background: 'rgba(239, 68, 68, 0.1)',
              color: '#ef4444',
              border: '1px solid rgba(239, 68, 68, 0.2)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              padding: '10px',
              borderRadius: '8px',
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(239, 68, 68, 0.2)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)';
            }}
          >
            <LogOut size={16} />
            Cerrar Sesión
          </button>
        </div>
      </div>

      <div className="main-content">
        <div style={{ display: activeTab === 'screen' ? 'block' : 'none', height: '100%' }}>
          <ScreenViewer stream={remoteStream} onMouseEvent={handleMouseEvent} onKeyEvent={handleKeyEvent} />
        </div>
        <div style={{ display: activeTab === 'files' ? 'block' : 'none', height: '100%' }}>
          <FileManager fileChannel={fileChannel} />
        </div>
        {currentUser.role === 'admin' && (
          <div style={{ display: activeTab === 'users' ? 'block' : 'none', height: '100%' }}>
            <UsersManager serverUrl={currentServerUrl} />
          </div>
        )}
      </div>
    </div>
  );
}

export default App;

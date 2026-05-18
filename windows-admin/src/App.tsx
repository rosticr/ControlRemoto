import { useState, useRef, useEffect } from 'react';
import { io, Socket } from 'socket.io-client';
import { Monitor, FolderUp } from 'lucide-react';
import ConnectionPanel from './components/ConnectionPanel';
import ScreenViewer from './components/ScreenViewer';
import FileManager from './components/FileManager';

function App() {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [roomId, setRoomId] = useState('');
  const [activeTab, setActiveTab] = useState<'screen' | 'files'>('screen');
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);

  const connectToSignalingServer = (roomIdToJoin: string) => {
    // In a real app, this should be configurable
    const newSocket = io('http://localhost:3000'); 
    
    newSocket.on('connect', () => {
      newSocket.emit('join-room', roomIdToJoin);
      setIsConnected(true);
      setRoomId(roomIdToJoin);
      setSocket(newSocket);
      setupWebRTC(newSocket, roomIdToJoin);
    });

    newSocket.on('offer', async (offer) => {
      if (!peerConnectionRef.current) return;
      await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await peerConnectionRef.current.createAnswer();
      await peerConnectionRef.current.setLocalDescription(answer);
      newSocket.emit('answer', { roomId: roomIdToJoin, answer });
    });

    newSocket.on('ice-candidate', async (candidate) => {
      if (!peerConnectionRef.current) return;
      try {
        await peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (e) {
        console.error('Error adding received ice candidate', e);
      }
    });

    newSocket.on('disconnect', () => {
      setIsConnected(false);
    });
  };

  const setupWebRTC = (socket: Socket, room: string) => {
    const configuration = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };
    const peerConnection = new RTCPeerConnection(configuration);
    
    peerConnection.addEventListener('icecandidate', event => {
      if (event.candidate) {
        socket.emit('ice-candidate', { roomId: room, candidate: event.candidate });
      }
    });

    peerConnection.addEventListener('track', event => {
      console.log('Received remote track', event.streams);
      if (event.streams && event.streams[0]) {
        setRemoteStream(event.streams[0]);
      }
    });

    // Create a data channel for mouse/keyboard controls
    const controlChannel = peerConnection.createDataChannel('control');
    controlChannel.onopen = () => console.log('Control channel opened');
    
    peerConnectionRef.current = peerConnection;
  };

  const disconnect = () => {
    if (socket) socket.disconnect();
    if (peerConnectionRef.current) peerConnectionRef.current.close();
    setSocket(null);
    setIsConnected(false);
    setRemoteStream(null);
  };

  const handleMouseEvent = (type: string, x: number, y: number) => {
    if (peerConnectionRef.current) {
      // Find the data channel and send the event
      // This is a simplified version. In reality, we need to store the channel reference.
    }
  };

  return (
    <div className="app-container">
      <div className="sidebar">
        <div className="logo">
          <h1>Control Remoto</h1>
        </div>

        <ConnectionPanel 
          isConnected={isConnected} 
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
          <ScreenViewer stream={remoteStream} onMouseEvent={handleMouseEvent} />
        ) : (
          <FileManager />
        )}
      </div>
    </div>
  );
}

export default App;

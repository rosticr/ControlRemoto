import { useState } from 'react';
import { Wifi, WifiOff } from 'lucide-react';

interface Props {
  isConnected: boolean;
  onConnect: (roomId: string) => void;
  onDisconnect: () => void;
}

export default function ConnectionPanel({ isConnected, onConnect, onDisconnect }: Props) {
  const [roomId, setRoomId] = useState('');

  return (
    <div className="glass-panel">
      <h2>Conexión</h2>
      <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginBottom: '16px' }}>
        {isConnected ? 'Conectado al dispositivo Android.' : 'Ingresa el ID del dispositivo Android para conectarte.'}
      </p>

      {!isConnected ? (
        <div className="input-group">
          <label>ID del Dispositivo (Sala)</label>
          <input 
            type="text" 
            placeholder="Ej: TAB-8192" 
            value={roomId}
            onChange={(e) => setRoomId(e.target.value)}
          />
          <button 
            style={{ marginTop: '8px' }} 
            onClick={() => onConnect(roomId)}
            disabled={!roomId}
          >
            <Wifi size={18} />
            Conectar
          </button>
        </div>
      ) : (
        <button 
          className="btn-secondary" 
          style={{ width: '100%' }}
          onClick={onDisconnect}
        >
          <WifiOff size={18} />
          Desconectar
        </button>
      )}
    </div>
  );
}

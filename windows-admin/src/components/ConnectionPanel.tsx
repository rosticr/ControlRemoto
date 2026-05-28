import { useState, useEffect } from 'react';
import { Wifi, WifiOff, MonitorSmartphone, Plus, Trash2, ChevronDown, ChevronRight, Folder } from 'lucide-react';

interface Props {
  isConnected: boolean;
  isConnecting: boolean;
  onlineDevices: string[];
  onConnect: (roomId: string) => void;
  onDisconnect: () => void;
}

interface SavedDevice {
  id: string;
  name: string;
  group?: string;
}

export default function ConnectionPanel({ isConnected, isConnecting, onlineDevices, onConnect, onDisconnect }: Props) {
  const [activeTab, setActiveTab] = useState<'list' | 'add'>('list');
  const [savedDevices, setSavedDevices] = useState<SavedDevice[]>([]);
  
  // Form for new device
  const [newId, setNewId] = useState('');
  const [newName, setNewName] = useState('');
  const [newGroup, setNewGroup] = useState('');
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
  
  // Extraer grupos únicos para el datalist
  const uniqueGroups = Array.from(new Set(savedDevices.map(d => d.group).filter(Boolean))) as string[];

  useEffect(() => {
    const saved = localStorage.getItem('rosti_saved_devices');
    if (saved) {
      try {
        setSavedDevices(JSON.parse(saved));
      } catch (e) {
        console.error("Error parsing saved devices", e);
      }
    }
  }, []);

  const saveDevice = () => {
    if (!newId.trim() || !newName.trim()) return;
    const groupVal = newGroup.trim() || undefined;
    const newList = [...savedDevices, { id: newId.trim(), name: newName.trim(), group: groupVal }];
    setSavedDevices(newList);
    localStorage.setItem('rosti_saved_devices', JSON.stringify(newList));
    setNewId('');
    setNewName('');
    setNewGroup('');
    setActiveTab('list');
  };

  const removeDevice = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const newList = savedDevices.filter(d => d.id !== id);
    setSavedDevices(newList);
    localStorage.setItem('rosti_saved_devices', JSON.stringify(newList));
  };

  const toggleGroup = (groupName: string) => {
    setCollapsedGroups(prev => ({
      ...prev,
      [groupName]: !prev[groupName]
    }));
  };

  if (isConnected) {
    return (
      <div className="glass-panel">
        <h2>Conexión</h2>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginBottom: '16px' }}>
          Conectado al dispositivo Android.
        </p>
        <button 
          className="btn-secondary" 
          style={{ width: '100%' }}
          onClick={onDisconnect}
        >
          <WifiOff size={18} />
          Desconectar
        </button>
      </div>
    );
  }

  return (
    <div className="glass-panel connection-panel">
      <div className="tabs" style={{ marginBottom: '16px', background: 'rgba(0,0,0,0.3)' }}>
        <div 
          className={`tab ${activeTab === 'list' ? 'active' : ''}`}
          onClick={() => setActiveTab('list')}
          style={{ fontSize: '0.8rem', padding: '6px 0' }}
        >
          Mis Equipos
        </div>
        <div 
          className={`tab ${activeTab === 'add' ? 'active' : ''}`}
          onClick={() => setActiveTab('add')}
          style={{ fontSize: '0.8rem', padding: '6px 0' }}
        >
          + Vincular
        </div>
      </div>

      {activeTab === 'list' && (
        <div className="device-list">
          {savedDevices.length === 0 ? (
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', textAlign: 'center' }}>
              No hay equipos vinculados.
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {Object.entries(
                savedDevices.reduce((acc, device) => {
                  const group = device.group || 'Sin Grupo';
                  if (!acc[group]) acc[group] = [];
                  acc[group].push(device);
                  return acc;
                }, {} as Record<string, SavedDevice[]>)
              ).map(([groupName, devices]) => {
                const isCollapsed = collapsedGroups[groupName] || false;
                const onlineCount = devices.filter(d => onlineDevices.includes(d.id)).length;
                
                return (
                <div key={groupName} className="device-group" style={{ background: 'rgba(0,0,0,0.2)', borderRadius: '8px', overflow: 'hidden' }}>
                  <div 
                    onClick={() => toggleGroup(groupName)}
                    style={{ 
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '12px 16px',
                      background: 'rgba(255,255,255,0.05)',
                      cursor: 'pointer',
                      borderBottom: isCollapsed ? 'none' : '1px solid rgba(255,255,255,0.05)',
                      transition: 'background 0.2s'
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}
                    onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Folder size={16} color="var(--primary)" />
                      <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>{groupName}</span>
                      <span style={{ 
                        fontSize: '0.7rem', 
                        background: onlineCount > 0 ? 'rgba(74, 222, 128, 0.2)' : 'rgba(255,255,255,0.1)',
                        color: onlineCount > 0 ? '#4ade80' : 'var(--text-muted)',
                        padding: '2px 6px',
                        borderRadius: '12px',
                        marginLeft: '8px'
                      }}>
                        {onlineCount} / {devices.length} activos
                      </span>
                    </div>
                    {isCollapsed ? <ChevronRight size={16} color="var(--text-muted)" /> : <ChevronDown size={16} color="var(--text-muted)" />}
                  </div>
                  
                  {!isCollapsed && (
                    <div style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {devices.map(device => {
                        const isOnline = onlineDevices.includes(device.id);
                        return (
                          <div 
                            key={device.id}
                            className="device-item"
                            onClick={() => onConnect(device.id)}
                            style={{
                              background: 'rgba(255,255,255,0.05)',
                              padding: '12px',
                              borderRadius: '8px',
                              cursor: isConnecting ? 'not-allowed' : 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              border: '1px solid rgba(255,255,255,0.1)',
                              transition: 'all 0.2s',
                              opacity: isConnecting ? 0.6 : 1
                            }}
                            onMouseEnter={(e) => {
                              if(!isConnecting) e.currentTarget.style.background = 'rgba(255,255,255,0.1)';
                            }}
                            onMouseLeave={(e) => {
                              if(!isConnecting) e.currentTarget.style.background = 'rgba(255,255,255,0.05)';
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                              <div style={{ position: 'relative' }}>
                                <MonitorSmartphone size={20} color={isOnline ? '#4ade80' : 'var(--text-muted)'} />
                                <div style={{
                                  position: 'absolute',
                                  bottom: '-2px',
                                  right: '-2px',
                                  width: '8px',
                                  height: '8px',
                                  borderRadius: '50%',
                                  background: isOnline ? '#4ade80' : '#ef4444',
                                  border: '2px solid var(--bg-card)'
                                }} />
                              </div>
                              <div>
                                <div style={{ fontSize: '0.9rem', fontWeight: 600 }}>{device.name}</div>
                                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{device.id}</div>
                              </div>
                            </div>
                            
                            <button 
                              onClick={(e) => removeDevice(device.id, e)}
                              style={{ 
                                background: 'transparent', 
                                padding: '4px', 
                                minWidth: 'auto',
                                color: 'var(--text-muted)' 
                              }}
                              title="Eliminar"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )})}
            </div>
          )}
          {isConnecting && (
            <p style={{ color: 'var(--primary)', fontSize: '0.85rem', textAlign: 'center', marginTop: '12px' }}>
              Conectando...
            </p>
          )}
        </div>
      )}

      {activeTab === 'add' && (
        <div className="input-group">
          <label>Nombre del Equipo</label>
          <input 
            type="text" 
            placeholder="Ej: Tablet Cocina 1" 
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
          />
          <label style={{ marginTop: '8px' }}>Grupo (Opcional)</label>
          <input 
            type="text" 
            placeholder="Ej: Sucursal Centro" 
            list="groupsList"
            value={newGroup}
            onChange={(e) => setNewGroup(e.target.value)}
          />
          <datalist id="groupsList">
            {uniqueGroups.map(g => (
              <option key={g} value={g} />
            ))}
          </datalist>

          <label style={{ marginTop: '8px' }}>ID Permanente (Sala)</label>
          <input 
            type="text" 
            placeholder="Ej: 123-456" 
            value={newId}
            onChange={(e) => setNewId(e.target.value)}
          />
          <button 
            style={{ marginTop: '16px' }} 
            onClick={saveDevice}
            disabled={!newId || !newName}
          >
            <Plus size={18} />
            Vincular Equipo
          </button>
        </div>
      )}
    </div>
  );
}

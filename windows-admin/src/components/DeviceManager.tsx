import { useState, useEffect } from 'react';
import { MonitorSmartphone, Plus, Trash2, ChevronDown, ChevronRight, Folder, Monitor, FolderUp, WifiOff } from 'lucide-react';

import ScreenViewer from './ScreenViewer';
import FileManager from './FileManager';

interface Props {
  isConnected: boolean;
  isConnecting: boolean;
  onlineDevices: string[];
  connectedRoomId: string;
  remoteStream: MediaStream | null;
  fileChannel: RTCDataChannel | null;
  onMouseEvent: (type: string, x: number, y: number) => void;
  onKeyEvent: (key: string) => void;
  onConnectScreen: (roomId: string) => void;
  onConnectFiles: (roomId: string) => void;
  onDisconnect: () => void;
}

interface SavedDevice {
  id: string;
  name: string;
  group?: string;
}

export default function DeviceManager({ 
  isConnected, 
  isConnecting, 
  onlineDevices, 
  connectedRoomId,
  remoteStream,
  fileChannel,
  onMouseEvent,
  onKeyEvent,
  onConnectScreen, 
  onConnectFiles, 
  onDisconnect 
}: Props) {
  const [activeTab, setActiveTab] = useState<'list' | 'add'>('list');
  const [activeTool, setActiveTool] = useState<null | 'screen' | 'files'>(null);
  const [savedDevices, setSavedDevices] = useState<SavedDevice[]>([]);
  const [selectedDevice, setSelectedDevice] = useState<SavedDevice | null>(null);
  
  // Form for new device
  const [newId, setNewId] = useState('');
  const [newName, setNewName] = useState('');
  const [newGroup, setNewGroup] = useState('');
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
  
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
    if (selectedDevice?.id === id) {
      setSelectedDevice(null);
    }
  };

  const toggleGroup = (groupName: string) => {
    setCollapsedGroups(prev => ({
      ...prev,
      [groupName]: !prev[groupName]
    }));
  };

  const renderList = () => (
    <div className="list-panel">
      <div className="list-header">
        <h2>Dispositivos</h2>
        <div className="tabs" style={{ marginTop: '16px', background: 'rgba(0,0,0,0.2)' }}>
          <div 
            className={`tab ${activeTab === 'list' ? 'active' : ''}`}
            onClick={() => setActiveTab('list')}
            style={{ fontSize: '0.8rem', padding: '6px 0' }}
          >
            Contactos
          </div>
          <div 
            className={`tab ${activeTab === 'add' ? 'active' : ''}`}
            onClick={() => setActiveTab('add')}
            style={{ fontSize: '0.8rem', padding: '6px 0' }}
          >
            + Añadir
          </div>
        </div>
      </div>

      {activeTab === 'add' ? (
        <div style={{ padding: '24px' }}>
          <div className="input-group">
            <label>Nombre del Equipo</label>
            <input 
              type="text" 
              placeholder="Ej: Tablet Cocina" 
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

            <label style={{ marginTop: '8px' }}>ID Permanente</label>
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
              Guardar Equipo
            </button>
          </div>
        </div>
      ) : (
        <div className="device-list">
          {savedDevices.length === 0 ? (
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', textAlign: 'center', marginTop: '40px' }}>
              No hay equipos vinculados.
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
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
                <div key={groupName} style={{ marginBottom: '8px' }}>
                  <div 
                    onClick={() => toggleGroup(groupName)}
                    style={{ 
                      display: 'flex', alignItems: 'center', gap: '8px',
                      padding: '8px 12px', cursor: 'pointer',
                      color: 'var(--text-muted)'
                    }}
                  >
                    {isCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                    <Folder size={14} />
                    <span style={{ fontSize: '0.85rem', fontWeight: 600, flex: 1 }}>{groupName}</span>
                    <span style={{ fontSize: '0.75rem', color: onlineCount > 0 ? 'var(--success)' : 'inherit' }}>
                      {onlineCount}/{devices.length}
                    </span>
                  </div>
                  
                  {!isCollapsed && (
                    <div style={{ display: 'flex', flexDirection: 'column', paddingLeft: '12px' }}>
                      {devices.map(device => {
                        const isOnline = onlineDevices.includes(device.id);
                        const isSelected = selectedDevice?.id === device.id;
                        return (
                          <div 
                            key={device.id}
                            className={`device-item ${isSelected ? 'active' : ''}`}
                            onClick={() => {
                              setSelectedDevice(device);
                              if (connectedRoomId !== device.id) {
                                setActiveTool(null);
                              }
                            }}
                          >
                            <div className="device-icon">
                              <MonitorSmartphone size={18} />
                              <div style={{
                                position: 'absolute', bottom: '6px', right: '6px',
                                width: '8px', height: '8px', borderRadius: '50%',
                                background: isOnline ? 'var(--success)' : '#ef4444',
                                border: '2px solid var(--bg-dark)'
                              }} />
                            </div>
                            <div className="device-info">
                              <h4>{device.name}</h4>
                              <p>{isOnline ? 'En línea' : 'Desconectado'}</p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )})}
            </div>
          )}
        </div>
      )}
    </div>
  );

  const renderDetails = () => {
    if (!selectedDevice) {
      return (
        <div className="details-panel">
          <div className="details-empty">
            <MonitorSmartphone size={64} style={{ opacity: 0.2, marginBottom: '24px' }} />
            <h3>Selecciona un dispositivo</h3>
            <p>Haz clic en un equipo de la lista para ver sus detalles y opciones de conexión.</p>
          </div>
        </div>
      );
    }

    const isOnline = onlineDevices.includes(selectedDevice.id);
    const isThisConnected = isConnected && connectedRoomId === selectedDevice.id;

    if (isThisConnected && activeTool) {
      return (
        <div className="details-panel" style={{ padding: '24px', display: 'flex', flexDirection: 'row', gap: '24px', height: '100%', boxSizing: 'border-box' }}>
          {/* Main Area (Screen / Files) */}
          <div style={{ flex: 1, border: '1px solid var(--border)', borderRadius: '16px', overflow: 'hidden', display: 'flex', flexDirection: 'column', background: 'var(--bg-dark)' }}>
            {activeTool === 'screen' && (
              <ScreenViewer stream={remoteStream} onMouseEvent={onMouseEvent} onKeyEvent={onKeyEvent} />
            )}
            {activeTool === 'files' && (
              <FileManager fileChannel={fileChannel} />
            )}
          </div>

          {/* Right Sidebar (Controls) */}
          <div style={{ width: '280px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ background: 'var(--bg-panel)', padding: '20px', borderRadius: '16px', border: '1px solid var(--border)' }}>
              <h3 style={{ margin: '0 0 4px 0', fontSize: '1.2rem' }}>{selectedDevice.name}</h3>
              <p style={{ margin: '0 0 12px 0', fontSize: '0.85rem', color: 'var(--text-muted)' }}>ID: {selectedDevice.id}</p>
              <div className="status-badge" style={{ marginTop: 0 }}>Conexión Activa</div>
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <button 
                className={activeTool === 'screen' ? 'btn-primary' : 'btn-secondary'}
                onClick={() => { setActiveTool('screen'); onConnectScreen(selectedDevice.id); }}
                style={{ justifyContent: 'flex-start', padding: '16px' }}
              >
                <Monitor size={20} /> Ver Pantalla
              </button>
              <button 
                className={activeTool === 'files' ? 'btn-primary' : 'btn-secondary'}
                onClick={() => { setActiveTool('files'); onConnectFiles(selectedDevice.id); }}
                style={{ justifyContent: 'flex-start', padding: '16px' }}
              >
                <FolderUp size={20} /> Archivos
              </button>
              <div style={{ flex: 1 }}></div>
              <button onClick={() => { setActiveTool(null); onDisconnect(); }} style={{ background: '#ef4444', justifyContent: 'flex-start', padding: '16px' }}>
                <WifiOff size={20} /> Desconectar
              </button>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="details-panel">
        <div className="details-content">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div className="device-header-large">
              <div className="icon-wrapper">
                <MonitorSmartphone size={40} />
              </div>
              <div>
                <h2 style={{ fontSize: '1.8rem', marginBottom: '8px' }}>{selectedDevice.name}</h2>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                  <span style={{ color: 'var(--text-muted)' }}>ID: {selectedDevice.id}</span>
                  {isOnline ? (
                    <span className="status-badge">En línea</span>
                  ) : (
                    <span className="status-badge" style={{ background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444' }}>Desconectado</span>
                  )}
                </div>
              </div>
            </div>
            
            <button 
              onClick={(e) => removeDevice(selectedDevice.id, e)}
              className="btn-secondary"
              style={{ color: '#ef4444', border: 'none', background: 'transparent' }}
            >
              <Trash2 size={18} /> Eliminar
            </button>
          </div>

          <h3 style={{ marginBottom: '24px', fontSize: '1.1rem', color: 'var(--text-muted)' }}>Servicios Disponibles</h3>

          <div className="action-grid">
            <div 
              className={`action-card ${isOnline && !isConnecting ? 'primary' : ''}`}
              onClick={() => {
                if (isOnline && !isConnecting) {
                  setActiveTool('screen');
                  onConnectScreen(selectedDevice.id);
                }
              }}
              style={{ opacity: isOnline ? 1 : 0.5, cursor: isOnline ? 'pointer' : 'not-allowed' }}
            >
              <div className="action-icon">
                <Monitor size={24} />
              </div>
              <div>
                <h3>Control Remoto</h3>
                <p>Inicia una conexión de video segura. Podrás ver la pantalla del dispositivo y controlarlo remotamente.</p>
              </div>
              {isConnecting && <div style={{ color: 'var(--primary)', fontWeight: 'bold' }}>Conectando...</div>}
            </div>

            <div 
              className="action-card"
              onClick={() => {
                if (isOnline && !isConnecting) {
                  setActiveTool('files');
                  onConnectFiles(selectedDevice.id);
                }
              }}
              style={{ opacity: isOnline ? 1 : 0.5, cursor: isOnline ? 'pointer' : 'not-allowed' }}
            >
              <div className="action-icon">
                <FolderUp size={24} />
              </div>
              <div>
                <h3>Transferencia de Archivos</h3>
                <p>Explora el sistema de archivos del dispositivo. Sube o descarga documentos de forma bidireccional.</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div style={{ display: 'flex', flex: 1, width: '100%', height: '100%' }}>
      {renderList()}
      {renderDetails()}
    </div>
  );
}

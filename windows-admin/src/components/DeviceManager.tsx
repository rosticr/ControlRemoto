import { useState, useEffect } from 'react';
import { MonitorSmartphone, Plus, Trash2, ChevronDown, ChevronRight, Folder, Monitor, FolderUp, WifiOff, Smartphone } from 'lucide-react';

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
  serverUrl?: string;
  token?: string;
}

interface SavedDevice {
  id: string;
  name: string;
  group?: string;
  platform?: 'android' | 'windows';
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
  onDisconnect,
  serverUrl = '',
  token = ''
}: Props) {
  const [activeTab, setActiveTab] = useState<'list' | 'add'>('list');
  const [activeTool, setActiveTool] = useState<null | 'screen' | 'files'>(null);
  const [savedDevices, setSavedDevices] = useState<SavedDevice[]>([]);
  const [savedGroups, setSavedGroups] = useState<string[]>([]);
  const [selectedDevice, setSelectedDevice] = useState<SavedDevice | null>(null);
  
  // Form for new device & group
  const [newId, setNewId] = useState('');
  const [newName, setNewName] = useState('');
  const [newGroup, setNewGroup] = useState('');
  const [newPlatform, setNewPlatform] = useState<'android' | 'windows'>('android');
  const [newGroupName, setNewGroupName] = useState('');
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});

  const syncGroupsWithServer = async (groupsList: string[]) => {
    if (!serverUrl || !token) return;
    try {
      await fetch(`${serverUrl}/api/groups`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ groups: groupsList })
      });
    } catch (e) {
      console.error("Error syncing groups with server:", e);
    }
  };

  useEffect(() => {
    const savedDevs = localStorage.getItem('rosti_saved_devices');
    let devicesList: SavedDevice[] = [];
    if (savedDevs) {
      try {
        devicesList = JSON.parse(savedDevs);
        setSavedDevices(devicesList);
      } catch (e) {
        console.error("Error parsing saved devices", e);
      }
    }

    const savedGrs = localStorage.getItem('rosti_saved_groups');
    if (savedGrs) {
      try {
        setSavedGroups(JSON.parse(savedGrs));
      } catch (e) {
        console.error("Error parsing saved groups", e);
      }
    } else {
      // Migrate from existing devices if they have groups
      const existingGroups = Array.from(new Set(devicesList.map(d => d.group).filter(Boolean))) as string[];
      if (existingGroups.length > 0) {
        setSavedGroups(existingGroups);
        localStorage.setItem('rosti_saved_groups', JSON.stringify(existingGroups));
      }
    }

    // Sync from server on mount (Merge with local groups)
    if (serverUrl) {
      fetch(`${serverUrl}/api/groups`)
        .then(res => res.json())
        .then(serverGroups => {
          if (Array.isArray(serverGroups)) {
            // Get local groups
            let localGrs: string[] = [];
            const savedGrs = localStorage.getItem('rosti_saved_groups');
            if (savedGrs) {
              try {
                localGrs = JSON.parse(savedGrs);
              } catch (e) {}
            }
            
            // Merge lists (removing duplicates and falsy entries)
            const mergedGroups = Array.from(new Set([...localGrs, ...serverGroups])).filter(Boolean) as string[];
            
            // Ensure 'Sin Grupo' is there or default to it if empty
            if (mergedGroups.length === 0) {
              mergedGroups.push('Sin Grupo');
            }
            
            setSavedGroups(mergedGroups);
            localStorage.setItem('rosti_saved_groups', JSON.stringify(mergedGroups));
            
            // If the server lacks any of our local groups, sync back to server
            const needsSync = mergedGroups.some(g => !serverGroups.includes(g));
            if (needsSync) {
              syncGroupsWithServer(mergedGroups);
            }
          }
        })
        .catch(err => console.error("Error fetching groups from server on mount:", err));
    }
  }, [serverUrl]);

  const saveDevice = () => {
    if (!newId.trim() || !newName.trim()) return;
    const groupVal = newGroup.trim() || undefined;
    
    // Add to savedGroups if it doesn't exist
    if (groupVal && !savedGroups.includes(groupVal)) {
      const updatedGroups = [...savedGroups, groupVal];
      setSavedGroups(updatedGroups);
      localStorage.setItem('rosti_saved_groups', JSON.stringify(updatedGroups));
      syncGroupsWithServer(updatedGroups);
    }

    const newList = [...savedDevices, { id: newId.trim(), name: newName.trim(), group: groupVal, platform: newPlatform }];
    setSavedDevices(newList);
    localStorage.setItem('rosti_saved_devices', JSON.stringify(newList));
    setNewId('');
    setNewName('');
    setNewGroup('');
    setNewPlatform('android');
    setActiveTab('list');
  };

  const saveGroup = () => {
    const trimmed = newGroupName.trim();
    if (!trimmed) return;
    if (savedGroups.includes(trimmed)) {
      alert("El grupo ya existe");
      return;
    }
    const updatedGroups = [...savedGroups, trimmed];
    setSavedGroups(updatedGroups);
    localStorage.setItem('rosti_saved_groups', JSON.stringify(updatedGroups));
    syncGroupsWithServer(updatedGroups);
    setNewGroupName('');
    setActiveTab('list');
  };

  const removeGroup = (groupName: string) => {
    const updatedGroups = savedGroups.filter(g => g !== groupName);
    setSavedGroups(updatedGroups);
    localStorage.setItem('rosti_saved_groups', JSON.stringify(updatedGroups));
    syncGroupsWithServer(updatedGroups);

    // Update devices belonging to this group
    const updatedDevices = savedDevices.map(d => {
      if (d.group === groupName) {
        return { ...d, group: undefined };
      }
      return d;
    });
    setSavedDevices(updatedDevices);
    localStorage.setItem('rosti_saved_devices', JSON.stringify(updatedDevices));
    
    if (selectedDevice && selectedDevice.group === groupName) {
      setSelectedDevice({ ...selectedDevice, group: undefined });
    }
  };

  const updateDeviceGroup = (deviceId: string, groupName: string | undefined) => {
    const updatedDevices = savedDevices.map(d => {
      if (d.id === deviceId) {
        return { ...d, group: groupName || undefined };
      }
      return d;
    });
    setSavedDevices(updatedDevices);
    localStorage.setItem('rosti_saved_devices', JSON.stringify(updatedDevices));
    
    if (selectedDevice && selectedDevice.id === deviceId) {
      setSelectedDevice({ ...selectedDevice, group: groupName || undefined });
    }
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
        <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '24px', overflowY: 'auto', maxHeight: 'calc(100vh - 150px)' }}>
          {/* Formulario de Crear Grupo */}
          <div style={{ background: 'rgba(0,0,0,0.15)', padding: '16px', borderRadius: '12px', border: '1px solid var(--border)' }}>
            <h3 style={{ margin: '0 0 12px 0', fontSize: '0.9rem', color: 'var(--accent)', fontWeight: 600 }}>Crear Nuevo Grupo</h3>
            <div className="input-group">
              <label>Nombre del Grupo</label>
              <input 
                type="text" 
                placeholder="Ej: Sucursal Norte" 
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
              />
              <button 
                style={{ marginTop: '8px', padding: '8px 12px', fontSize: '0.85rem' }} 
                onClick={saveGroup}
                disabled={!newGroupName.trim()}
              >
                <Plus size={16} />
                Crear Grupo
              </button>
            </div>
          </div>

          {/* Formulario de Vincular Equipo */}
          <div style={{ background: 'rgba(0,0,0,0.15)', padding: '16px', borderRadius: '12px', border: '1px solid var(--border)' }}>
            <h3 style={{ margin: '0 0 12px 0', fontSize: '0.9rem', color: 'var(--accent)', fontWeight: 600 }}>Vincular Nuevo Equipo</h3>
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
                {savedGroups.map(g => (
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
              
              <label style={{ marginTop: '8px' }}>Plataforma</label>
              <select
                value={newPlatform}
                onChange={(e) => setNewPlatform(e.target.value as 'android' | 'windows')}
                style={{
                  background: 'rgba(0, 0, 0, 0.2)',
                  border: '1px solid var(--border)',
                  color: 'var(--text-main)',
                  padding: '8px 12px',
                  borderRadius: '8px',
                  fontSize: '0.9rem',
                  outline: 'none',
                  cursor: 'pointer'
                }}
              >
                <option value="android">Android</option>
                <option value="windows">Windows</option>
              </select>

              <button 
                style={{ marginTop: '16px' }} 
                onClick={saveDevice}
                disabled={!newId.trim() || !newName.trim()}
              >
                <Plus size={18} />
                Guardar Equipo
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="device-list">
          {savedDevices.length === 0 && savedGroups.length === 0 ? (
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', textAlign: 'center', marginTop: '40px' }}>
              No hay equipos ni grupos vinculados.
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {(() => {
                const acc: Record<string, SavedDevice[]> = {};
                
                // Initialize all saved groups
                savedGroups.forEach(g => {
                  acc[g] = [];
                });
                
                // Populate devices
                savedDevices.forEach(device => {
                  const group = device.group || 'Sin Grupo';
                  if (!acc[group]) {
                    acc[group] = [];
                  }
                  acc[group].push(device);
                });
                
                return Object.entries(acc);
              })().map(([groupName, devices]) => {
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
                      <span style={{ fontSize: '0.75rem', color: onlineCount > 0 ? 'var(--success)' : 'inherit', marginRight: '4px' }}>
                        {onlineCount}/{devices.length}
                      </span>
                      {groupName !== 'Sin Grupo' && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (confirm(`¿Estás seguro de eliminar el grupo "${groupName}"? Los equipos dentro de él se moverán a "Sin Grupo".`)) {
                              removeGroup(groupName);
                            }
                          }}
                          style={{
                            background: 'transparent',
                            border: 'none',
                            color: '#ef4444',
                            cursor: 'pointer',
                            padding: '2px',
                            display: 'flex',
                            alignItems: 'center'
                          }}
                          title="Eliminar Grupo"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                    
                    {!isCollapsed && (
                      <div style={{ display: 'flex', flexDirection: 'column', paddingLeft: '12px' }}>
                        {devices.length === 0 ? (
                          <p style={{ color: 'var(--text-muted)', fontSize: '0.75rem', padding: '8px 16px', margin: 0, fontStyle: 'italic' }}>
                            (Grupo vacío - Sin equipos)
                          </p>
                        ) : (
                          devices.map(device => {
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
                                  {device.platform === 'windows' ? (
                                    <Monitor size={18} style={{ color: '#38bdf8' }} />
                                  ) : device.platform === 'android' ? (
                                    <Smartphone size={18} style={{ color: '#a78bfa' }} />
                                  ) : (
                                    <MonitorSmartphone size={18} />
                                  )}
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
                          })
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
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
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>Grupo:</span>
                <select
                  value={selectedDevice.group || ''}
                  onChange={(e) => updateDeviceGroup(selectedDevice.id, e.target.value)}
                  style={{
                    background: 'rgba(0, 0, 0, 0.2)',
                    border: '1px solid var(--border)',
                    color: 'var(--text-main)',
                    padding: '4px 8px',
                    borderRadius: '6px',
                    fontSize: '0.8rem',
                    outline: 'none',
                    cursor: 'pointer',
                    flex: 1
                  }}
                >
                  <option value="">Sin Grupo</option>
                  {savedGroups.map(g => (
                    <option key={g} value={g}>{g}</option>
                  ))}
                </select>
              </div>
              <div className="status-badge" style={{ marginTop: 0 }}>Conexión Activa</div>
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <button 
                className={activeTool === 'screen' ? 'btn-primary' : 'btn-secondary'}
                onClick={() => setActiveTool('screen')}
                style={{ justifyContent: 'flex-start', padding: '16px' }}
              >
                <Monitor size={20} /> Ver Pantalla
              </button>
              <button 
                className={activeTool === 'files' ? 'btn-primary' : 'btn-secondary'}
                onClick={() => setActiveTool('files')}
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
                {selectedDevice.platform === 'windows' ? (
                  <Monitor size={40} style={{ color: '#38bdf8' }} />
                ) : selectedDevice.platform === 'android' ? (
                  <Smartphone size={40} style={{ color: '#a78bfa' }} />
                ) : (
                  <MonitorSmartphone size={40} />
                )}
              </div>
              <div>
                <h2 style={{ fontSize: '1.8rem', marginBottom: '8px' }}>{selectedDevice.name}</h2>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
                  <span style={{ color: 'var(--text-muted)' }}>ID: {selectedDevice.id}</span>
                  {isOnline ? (
                    <span className="status-badge">En línea</span>
                  ) : (
                    <span className="status-badge" style={{ background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444' }}>Desconectado</span>
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '12px' }}>
                  <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Grupo:</span>
                  <select
                    value={selectedDevice.group || ''}
                    onChange={(e) => updateDeviceGroup(selectedDevice.id, e.target.value)}
                    style={{
                      background: 'rgba(0, 0, 0, 0.2)',
                      border: '1px solid var(--border)',
                      color: 'var(--text-main)',
                      padding: '4px 8px',
                      borderRadius: '6px',
                      fontSize: '0.85rem',
                      outline: 'none',
                      cursor: 'pointer'
                    }}
                  >
                    <option value="">Sin Grupo</option>
                    {savedGroups.map(g => (
                      <option key={g} value={g}>{g}</option>
                    ))}
                  </select>
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
                  if (!isThisConnected) onConnectScreen(selectedDevice.id);
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
                  if (!isThisConnected) onConnectFiles(selectedDevice.id);
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

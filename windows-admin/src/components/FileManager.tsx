import { useState, useEffect, useRef } from 'react';
import { File as FileIcon, Folder, Download, Upload, RefreshCw } from 'lucide-react';

interface Props {
  fileChannel: RTCDataChannel | null;
}

interface RemoteFile {
  name: string;
  type: 'folder' | 'file';
  path: string;
  size: string;
  date: string;
}

export default function FileManager({ fileChannel }: Props) {
  const [files, setFiles] = useState<RemoteFile[]>([]);
  const [currentPath, setCurrentPath] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadName, setDownloadName] = useState('');
  const [downloadSize, setDownloadSize] = useState(0);
  const [downloadReceived, setDownloadReceived] = useState(0);
  
  const currentPathRef = useRef<string>('');
  const downloadNameRef = useRef<string>('');
  
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  const downloadBufferRef = useRef<ArrayBuffer[]>([]);

  // Seleccion multiple y descarga por lotes
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [batch, setBatch] = useState<{ total: number; done: number; current: string } | null>(null);
  const queueRef = useRef<{ path: string; name: string }[]>([]);
  const foldersRef = useRef<string[]>([]);
  const batchActiveRef = useRef(false);
  const expandingRef = useRef(false);
  const doneRef = useRef(0);
  const totalRef = useRef(0);
  const failedRef = useRef<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const getFullPath = (fileName: string) => {
    if (fileName === '..') {
      const parts = currentPath.split('/');
      if (parts.length <= 1) return currentPath;
      if (parts.length === 2 && parts[1] === '') return parts[0] + '/';
      const parent = parts.slice(0, -1).join('/');
      return parent || '/';
    }
    if (!currentPath) return fileName;
    const separator = currentPath.endsWith('/') || currentPath.endsWith('\\') ? '' : '/';
    return currentPath + separator + fileName;
  };

  useEffect(() => {
    if (!fileChannel) return;

    const handleMessage = (event: MessageEvent) => {
      if (typeof event.data === 'string') {
        try {
          const msg = JSON.parse(event.data);
          
          if (msg.type === 'DIR_LIST') {
            // Listado pedido para expandir una carpeta marcada: no navega, solo
            // alimenta la cola de descarga.
            if (expandingRef.current) {
              const base = msg.data.currentPath || '';
              const sep = base.endsWith('/') || base.endsWith(String.fromCharCode(92)) ? '' : '/';
              (msg.data.files || []).forEach((f: RemoteFile) => {
                if (!f.name || f.name === '..') return;
                const p = f.path || (base + sep + f.name);
                if (f.type === 'folder') foldersRef.current.push(p);
                else queueRef.current.push({ path: p, name: f.name });
              });
              expandNextFolder();
              return;
            }
            setIsLoading(false);
            if (msg.data.error) {
              setErrorMessage(msg.data.error);
              setFiles([]);
            } else {
              setErrorMessage(null);
              setCurrentPath(msg.data.currentPath);
              currentPathRef.current = msg.data.currentPath;
              setFiles(msg.data.files || []);
            }
          } else if (msg.type === 'DOWNLOAD_START') {
            setIsDownloading(true);
            setDownloadName(msg.name);
            downloadNameRef.current = msg.name;
            setDownloadSize(msg.size);
            setDownloadReceived(0);
            downloadBufferRef.current = [];
          } else if (msg.type === 'DOWNLOAD_END') {
            setIsDownloading(false);
            const blob = new Blob(downloadBufferRef.current);
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = downloadNameRef.current;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            downloadBufferRef.current = [];
            if (batchActiveRef.current) {
              doneRef.current += 1;
              downloadNextFile();
            } else {
              setSuccessMessage(`Archivo "${downloadNameRef.current}" descargado con éxito`);
              setTimeout(() => setSuccessMessage(null), 4000);
            }
          } else if (msg.type === 'DOWNLOAD_ERROR') {
            setIsDownloading(false);
            if (batchActiveRef.current) {
              failedRef.current.push(downloadNameRef.current);
              downloadNextFile();
            } else {
              alert('Error al descargar: ' + msg.msg);
            }
          } else if (msg.type === 'UPLOAD_SUCCESS') {
            setIsUploading(false);
            setUploadProgress(0);
            requestDir(currentPathRef.current); // Recargar
            setSuccessMessage('Archivo subido con éxito al dispositivo');
            setTimeout(() => setSuccessMessage(null), 4000);
          }
        } catch (e) {
          console.error("Error parseando mensaje de archivo", e);
        }
      } else if (event.data instanceof ArrayBuffer) {
        // Recibiendo un chunk del archivo
        downloadBufferRef.current.push(event.data);
        setDownloadReceived(prev => prev + event.data.byteLength);
      }
    };

    fileChannel.addEventListener('message', handleMessage);

    // Pedir directorio raíz al iniciar
    if (fileChannel.readyState === 'open') {
      requestDir('');
    } else {
      fileChannel.onopen = () => requestDir('');
    }

    return () => {
      fileChannel.removeEventListener('message', handleMessage);
    };
  }, [fileChannel]);

  const requestDir = (path: string) => {
    if (fileChannel && fileChannel.readyState === 'open') {
      setIsLoading(true);
      setSelected(new Set());
      console.log('Solicitando directorio:', path);
      fileChannel.send(JSON.stringify({ cmd: 'LIST_DIR', path }));
    }
  };

  const handleDownload = (path: string) => {
    if (fileChannel && fileChannel.readyState === 'open') {
      fileChannel.send(JSON.stringify({ cmd: 'REQ_DOWNLOAD', path }));
    }
  };

  const sendCmd = (payload: any) => {
    if (fileChannel && fileChannel.readyState === 'open') {
      fileChannel.send(JSON.stringify(payload));
      return true;
    }
    return false;
  };

  const finishBatch = () => {
    batchActiveRef.current = false;
    expandingRef.current = false;
    setBatch(null);
    setSelected(new Set());
    const fallidos = failedRef.current.length;
    setSuccessMessage(fallidos
      ? `${doneRef.current} archivo(s) descargados, ${fallidos} con error`
      : `${doneRef.current} archivo(s) descargados con éxito`);
    setTimeout(() => setSuccessMessage(null), 5000);
  };

  // Primero se recorren las carpetas marcadas, para conocer el total real
  const expandNextFolder = () => {
    const next = foldersRef.current.shift();
    if (next) {
      expandingRef.current = true;
      if (!sendCmd({ cmd: 'LIST_DIR', path: next })) {
        expandingRef.current = false;
        finishBatch();
      }
      return;
    }
    expandingRef.current = false;
    totalRef.current = queueRef.current.length;
    if (!totalRef.current) {
      batchActiveRef.current = false;
      setBatch(null);
      setErrorMessage('No se encontraron archivos en la selección');
      setTimeout(() => setErrorMessage(null), 4000);
      return;
    }
    downloadNextFile();
  };

  // Uno detrás de otro: el canal solo sirve una descarga a la vez
  const downloadNextFile = () => {
    const next = queueRef.current.shift();
    if (!next) {
      finishBatch();
      return;
    }
    setBatch({ total: totalRef.current, done: doneRef.current, current: next.name });
    if (!sendCmd({ cmd: 'REQ_DOWNLOAD', path: next.path })) finishBatch();
  };

  const startBatchDownload = () => {
    if (batchActiveRef.current || isDownloading || isUploading) return;
    const marcados = files.filter(f => f.name !== '..' && selected.has(f.path || getFullPath(f.name)));
    if (!marcados.length) return;
    queueRef.current = [];
    foldersRef.current = [];
    failedRef.current = [];
    doneRef.current = 0;
    totalRef.current = 0;
    marcados.forEach(f => {
      const p = f.path || getFullPath(f.name);
      if (f.type === 'folder') foldersRef.current.push(p);
      else queueRef.current.push({ path: p, name: f.name });
    });
    batchActiveRef.current = true;
    setBatch({ total: 0, done: 0, current: 'Explorando carpetas...' });
    expandNextFolder();
  };

  const toggleSelected = (p: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(p)) next.delete(p);
      else next.add(p);
      return next;
    });
  };

  const seleccionables = (Array.isArray(files) ? files : []).filter(f => f.name !== '..');
  const todosMarcados = seleccionables.length > 0
    && seleccionables.every(f => selected.has(f.path || getFullPath(f.name)));

  const toggleAll = () => {
    if (todosMarcados) setSelected(new Set());
    else setSelected(new Set(seleccionables.map(f => f.path || getFullPath(f.name))));
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !fileChannel || fileChannel.readyState !== 'open') return;

    setIsUploading(true);
    setUploadProgress(0);

    const remotePath = currentPath + '/' + file.name;
    fileChannel.send(JSON.stringify({ cmd: 'UPLOAD_START', path: remotePath }));

    const chunkSize = 64 * 1024; // 64KB
    const fileReader = new FileReader();
    let offset = 0;

    fileReader.onload = (e) => {
      if (e.target?.result && fileChannel) {
        fileChannel.send(e.target.result as ArrayBuffer);
        offset += (e.target.result as ArrayBuffer).byteLength;
        setUploadProgress(Math.min(100, Math.round((offset / file.size) * 100)));

        if (offset < file.size) {
          readSlice(offset);
        } else {
          fileChannel.send(JSON.stringify({ cmd: 'UPLOAD_END' }));
        }
      }
    };

    const readSlice = (o: number) => {
      const slice = file.slice(o, o + chunkSize);
      fileReader.readAsArrayBuffer(slice);
    };

    readSlice(0);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  if (!fileChannel) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', color: 'var(--text-muted)' }}>
        <p>El canal de archivos no está conectado.</p>
      </div>
    );
  }

  return (
    <div style={{ padding: '24px', height: '100%', boxSizing: 'border-box', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', gap: '16px' }}>
        <div style={{ flex: '1 1 auto', minWidth: 0 }}>
          <h2 style={{ margin: 0, marginBottom: '4px' }}>Gestor de Archivos</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={currentPath}>
            {currentPath || 'Cargando...'}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '12px', flexShrink: 0 }}>
          <button className="btn-secondary" onClick={() => requestDir(currentPath)} title="Refrescar">
            <RefreshCw size={18} />
          </button>
          <button
            className="btn-secondary"
            onClick={startBatchDownload}
            disabled={selected.size === 0 || !!batch || isDownloading || isUploading}
            title="Descargar lo marcado"
          >
            <Download size={18} />
            {batch ? `Descargando ${batch.done}/${batch.total}` : `Descargar (${selected.size})`}
          </button>
          <input 
            type="file" 
            ref={fileInputRef} 
            style={{ display: 'none' }} 
            onChange={handleFileUpload}
          />
          <button 
            className="btn-secondary" 
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading || isDownloading}
          >
            <Upload size={18} />
            {isUploading ? `Subiendo ${uploadProgress}%` : 'Subir Archivo'}
          </button>
        </div>
      </div>

      {errorMessage && (
        <div style={{ padding: '12px', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)', borderRadius: '8px', marginBottom: '16px', color: '#ef4444' }}>
          Error: {errorMessage}
        </div>
      )}

      {successMessage && (
        <div style={{ padding: '12px', background: 'rgba(34, 197, 94, 0.1)', border: '1px solid rgba(34, 197, 94, 0.2)', borderRadius: '8px', marginBottom: '16px', color: '#22c55e', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5"/></svg>
          {successMessage}
        </div>
      )}

      {batch && (
        <div style={{ padding: '12px', background: 'rgba(56, 189, 248, 0.1)', border: '1px solid rgba(56, 189, 248, 0.2)', borderRadius: '8px', marginBottom: '16px', color: '#38bdf8', fontSize: '0.9rem' }}>
          {batch.total > 0
            ? `Descargando ${batch.done + 1} de ${batch.total}: ${batch.current}`
            : batch.current}
        </div>
      )}

      {(isDownloading || isUploading) && (
        <div style={{ padding: '16px', background: 'rgba(56, 189, 248, 0.1)', border: '1px solid rgba(56, 189, 248, 0.2)', borderRadius: '8px', marginBottom: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
            <span style={{ color: '#38bdf8', fontWeight: 500 }}>
              {isDownloading ? `Descargando: ${downloadName}` : `Subiendo archivo...`}
            </span>
            <span style={{ color: '#38bdf8' }}>
              {isDownloading 
                ? Math.round((downloadReceived / downloadSize) * 100) 
                : uploadProgress}%
            </span>
          </div>
          <div style={{ width: '100%', background: 'rgba(255,255,255,0.1)', height: '6px', borderRadius: '3px', overflow: 'hidden' }}>
            <div style={{ 
              height: '100%', 
              background: '#38bdf8', 
              width: `${isDownloading ? Math.round((downloadReceived / downloadSize) * 100) : uploadProgress}%`,
              transition: 'width 0.2s'
            }}></div>
          </div>
        </div>
      )}

      <div className="glass-panel" style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: '0' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', tableLayout: 'fixed' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)', background: 'rgba(0,0,0,0.2)' }}>
              <th style={{ padding: '16px', width: '44px' }}>
                <input
                  type="checkbox"
                  checked={todosMarcados}
                  onChange={toggleAll}
                  title="Marcar todo"
                  style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                />
              </th>
              <th style={{ padding: '16px', width: '42%' }}>Nombre</th>
              <th style={{ padding: '16px', width: '20%' }}>Fecha</th>
              <th style={{ padding: '16px', width: '15%' }}>Tamaño</th>
              <th style={{ padding: '16px', width: '15%' }}>Acción</th>
            </tr>
          </thead>
          <tbody>
            {(Array.isArray(files) ? files : []).map((f, i) => (
              <tr 
                key={i} 
                style={{ 
                  borderBottom: '1px solid rgba(255,255,255,0.05)',
                  cursor: f.type === 'folder' ? 'pointer' : 'default',
                  transition: 'background 0.2s'
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
                onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                onClick={() => {
                  if (f.type === 'folder') requestDir(f.path || getFullPath(f.name));
                }}
              >
                <td style={{ padding: '16px' }} onClick={(e) => e.stopPropagation()}>
                  {f.name !== '..' && (
                    <input
                      type="checkbox"
                      checked={selected.has(f.path || getFullPath(f.name))}
                      onChange={() => toggleSelected(f.path || getFullPath(f.name))}
                      style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                    />
                  )}
                </td>
                <td style={{ padding: '16px', display: 'flex', alignItems: 'center', gap: '12px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={f.name}>
                  <div style={{ flexShrink: 0 }}>
                    {f.type === 'folder' ? <Folder size={20} color="var(--primary)" /> : <FileIcon size={20} color="var(--text-muted)" />}
                  </div>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{f.name}</span>
                </td>
                <td style={{ padding: '16px', color: 'var(--text-muted)', fontSize: '0.85rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.date}</td>
                <td style={{ padding: '16px', color: 'var(--text-muted)', fontSize: '0.85rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.size || '-'}</td>
                <td style={{ padding: '16px' }}>
                  {f.type === 'file' && (
                    <button 
                      className="btn-secondary" 
                      style={{ padding: '8px' }}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDownload(f.path || getFullPath(f.name));
                      }}
                      disabled={isDownloading || isUploading}
                      title="Descargar"
                    >
                      <Download size={16} />
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {isLoading && (
              <tr>
                <td colSpan={5} style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)' }}>
                  Cargando contenido de la carpeta...
                </td>
              </tr>
            )}
            {!isLoading && (!Array.isArray(files) || files.length === 0) && !errorMessage && (
              <tr>
                <td colSpan={5} style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)' }}>
                  Carpeta vacía.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

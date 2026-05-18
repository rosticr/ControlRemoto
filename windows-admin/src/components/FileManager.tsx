import { File, Folder, Download, Upload } from 'lucide-react';

export default function FileManager() {
  // Mock data for UI demonstration
  const files = [
    { name: 'Download', type: 'folder', date: '2026-05-18' },
    { name: 'DCIM', type: 'folder', date: '2026-05-18' },
    { name: 'Documento.pdf', type: 'file', date: '2026-05-17', size: '1.2 MB' },
    { name: 'Foto.jpg', type: 'file', date: '2026-05-16', size: '3.4 MB' },
  ];

  return (
    <div style={{ padding: '24px', height: '100%', boxSizing: 'border-box', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <h2>Gestor de Archivos (Android)</h2>
        <button className="btn-secondary">
          <Upload size={18} />
          Subir Archivo
        </button>
      </div>

      <div className="glass-panel" style={{ flex: 1, overflowY: 'auto', padding: '0' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              <th style={{ padding: '16px' }}>Nombre</th>
              <th style={{ padding: '16px' }}>Fecha</th>
              <th style={{ padding: '16px' }}>Tamaño</th>
              <th style={{ padding: '16px' }}>Acción</th>
            </tr>
          </thead>
          <tbody>
            {files.map((f, i) => (
              <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                <td style={{ padding: '16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                  {f.type === 'folder' ? <Folder size={20} color="var(--primary)" /> : <File size={20} color="var(--text-muted)" />}
                  {f.name}
                </td>
                <td style={{ padding: '16px', color: 'var(--text-muted)' }}>{f.date}</td>
                <td style={{ padding: '16px', color: 'var(--text-muted)' }}>{f.size || '-'}</td>
                <td style={{ padding: '16px' }}>
                  {f.type === 'file' && (
                    <button className="btn-secondary" style={{ padding: '8px' }}>
                      <Download size={16} />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

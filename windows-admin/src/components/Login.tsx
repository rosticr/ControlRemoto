import { useState } from 'react';
import { Lock } from 'lucide-react';

interface LoginProps {
  onLoginSuccess: (serverUrl: string, username: string, role: string) => void;
}

export default function Login({ onLoginSuccess }: LoginProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [serverUrl, setServerUrl] = useState('http://127.0.0.1:3000');
  const [error, setError] = useState('');

  const [isLoading, setIsLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');
    
    try {
      const url = serverUrl || 'http://127.0.0.1:3000';
      const response = await fetch(`${url}/api/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      
      const data = await response.json();
      if (data.success) {
        onLoginSuccess(url, data.username, data.role);
      } else {
        setError(data.error || 'Credenciales incorrectas. Acceso denegado.');
      }
    } catch (err) {
      setError('Error conectando al servidor. Asegúrate de que esté en ejecución.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="login-wrapper">
      <div className="login-panel glass-panel">
        <div className="login-header">
          <div className="icon-circle">
            <Lock size={28} />
          </div>
          <h2>Control Remoto</h2>
          <p>Autenticación Requerida</p>
        </div>

        <form onSubmit={handleLogin} className="login-form">
          <div className="input-group">
            <label>Usuario</label>
            <input 
              type="text" 
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Ingresa tu usuario"
              autoFocus
            />
          </div>
          
          <div className="input-group">
            <label>Contraseña</label>
            <input 
              type="password" 
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
            />
          </div>

          <div className="input-group">
            <label>Servidor de Conexión</label>
            <select 
              value={serverUrl}
              onChange={(e) => setServerUrl(e.target.value)}
              style={{ width: '100%', padding: '12px', background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: 'white', marginBottom: '8px' }}
            >
              <option value="http://127.0.0.1:3000">💻 Servidor Local (LAN)</option>
              <option value="https://acceso.rosti.cr">☁️ Servidor Remoto (Nube)</option>
            </select>
          </div>

          {error && <div className="error-message">{error}</div>}

          <button type="submit" className="login-button" disabled={isLoading}>
            {isLoading ? 'Conectando...' : 'Iniciar Sesión'}
          </button>
        </form>
      </div>
    </div>
  );
}

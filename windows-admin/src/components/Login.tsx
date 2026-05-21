import { useState } from 'react';
import { Lock } from 'lucide-react';

interface LoginProps {
  onLoginSuccess: () => void;
}

export default function Login({ onLoginSuccess }: LoginProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (username === 'admin' && password === 'R0st1p017') {
      onLoginSuccess();
    } else {
      setError('Credenciales incorrectas. Acceso denegado.');
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

          {error && <div className="error-message">{error}</div>}

          <button type="submit" className="login-button">
            Iniciar Sesión
          </button>
        </form>
      </div>
    </div>
  );
}

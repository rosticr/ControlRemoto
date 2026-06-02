import { useEffect, useRef, useState } from 'react';
import { MonitorPlay, Maximize2, Minimize2 } from 'lucide-react';

interface Props {
  stream: MediaStream | null;
  onMouseEvent: (type: string, x: number, y: number) => void;
  onKeyEvent?: (key: string) => void;
  platform?: 'android' | 'windows';
}

export default function ScreenViewer({ stream, onMouseEvent, onKeyEvent, platform = 'android' }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  const handlePointerEvent = (e: React.PointerEvent<HTMLVideoElement>, type: string) => {
    const video = e.currentTarget;
    const rect = video.getBoundingClientRect();
    
    // Obtener dimensiones reales del video recibido
    const videoWidth = video.videoWidth;
    const videoHeight = video.videoHeight;
    
    if (!videoWidth || !videoHeight) return;

    // Calcular la proporción del contenedor y del video
    const containerRatio = rect.width / rect.height;
    const videoRatio = videoWidth / videoHeight;

    let actualWidth, actualHeight, startX, startY;

    // Determinar el tamaño y la posición real del video dentro del contenedor (compensar barras negras)
    if (containerRatio > videoRatio) {
      // El contenedor es más ancho que el video -> Barras negras a los lados
      actualHeight = rect.height;
      actualWidth = actualHeight * videoRatio;
      startX = (rect.width - actualWidth) / 2;
      startY = 0;
    } else {
      // El contenedor es más alto que el video -> Barras negras arriba y abajo
      actualWidth = rect.width;
      actualHeight = actualWidth / videoRatio;
      startX = 0;
      startY = (rect.height - actualHeight) / 2;
    }

    // Calcular las coordenadas X, Y excluyendo las barras negras
    const x = (e.clientX - rect.left - startX) / actualWidth;
    const y = (e.clientY - rect.top - startY) / actualHeight;
    
    // Asegurarse de que el clic ocurrió DENTRO del área del video, no en las barras negras
    if (x >= 0 && x <= 1 && y >= 0 && y <= 1) {
      let eventType = type;
      if (e.button === 2) {
        if (type === 'down') eventType = 'rightdown';
        else if (type === 'up') eventType = 'rightup';
      }
      onMouseEvent(eventType, x, y);
    }
  };

  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (!onKeyEvent) return;
      
      // Ignorar si el usuario está escribiendo en un input de Windows (ej. chat, archivos)
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      // Interceptar Ctrl+V o Cmd+V para portapapeles compartido
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v') {
        e.preventDefault();
        navigator.clipboard.readText().then(text => {
          if (text) {
            onKeyEvent('CLIPBOARD_PASTE:' + text);
          }
        }).catch(err => {
          console.error("Failed to read local clipboard:", err);
        });
        return;
      }

      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Backspace', 'Escape'].includes(e.code) || e.key.length === 1) {
        e.preventDefault();
        onKeyEvent(e.key);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        onKeyEvent('Enter');
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [onKeyEvent]);

  const handleWheelEvent = (e: React.WheelEvent<HTMLVideoElement>) => {
    // deltaY > 0 means scroll down (send negative value to csc), deltaY < 0 means scroll up (send positive)
    const scrollAmount = e.deltaY > 0 ? -120 : 120;
    onMouseEvent('wheel', scrollAmount, 0);
  };

  return (
    <div 
      className={`screen-viewer ${platform === 'windows' ? 'platform-windows' : 'platform-android'} ${isFullscreen ? 'fullscreen' : ''}`}
      style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', width: '100%', position: 'relative' }}
    >
      {stream ? (
        <>
          <video 
            ref={videoRef} 
            autoPlay 
            playsInline
            style={{ 
              width: '100%', 
              height: '100%', 
              objectFit: 'contain',
              touchAction: 'none'
            }}
            onPointerDown={(e) => handlePointerEvent(e, 'down')}
            onPointerUp={(e) => handlePointerEvent(e, 'up')}
            onPointerMove={(e) => handlePointerEvent(e, 'move')}
            onWheel={handleWheelEvent}
            onContextMenu={(e) => e.preventDefault()}
          />
          <button
            onClick={() => setIsFullscreen(!isFullscreen)}
            className="fullscreen-toggle-btn"
            title={isFullscreen ? "Salir de pantalla completa" : "Pantalla completa"}
          >
            {isFullscreen ? <Minimize2 size={20} /> : <Maximize2 size={20} />}
          </button>
        </>
      ) : (
        <div className="placeholder">
          <MonitorPlay />
          <p>Esperando la transmisión de pantalla...</p>
        </div>
      )}
    </div>
  );
}

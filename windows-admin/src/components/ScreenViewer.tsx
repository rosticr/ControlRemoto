import { useEffect, useRef, useState } from 'react';
import { MonitorPlay } from 'lucide-react';

interface Props {
  stream: MediaStream | null;
  onMouseEvent: (type: string, x: number, y: number) => void;
  onKeyEvent?: (key: string) => void;
}

export default function ScreenViewer({ stream, onMouseEvent, onKeyEvent }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);

  const [videoAspect, setVideoAspect] = useState<number | null>(null);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
      // Reset aspect ratio until new stream loads metadata
      setVideoAspect(null);
    }
  }, [stream]);

  const handleMetadata = (e: React.SyntheticEvent<HTMLVideoElement>) => {
    const video = e.currentTarget;
    if (video.videoHeight > 0) {
      setVideoAspect(video.videoWidth / video.videoHeight);
    }
  };

  const handlePointerEvent = (e: React.PointerEvent<HTMLVideoElement>, type: string) => {
    const rect = e.currentTarget.getBoundingClientRect();
    
    // Coordenadas relativas exactas al contenedor de video, que ahora siempre
    // encaja perfecto sin franjas negras gracias al CSS aspect-ratio
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    
    if (x >= 0 && x <= 1 && y >= 0 && y <= 1) {
      onMouseEvent(type, x, y);
    }
  };

  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (!onKeyEvent) return;
      
      // Ignorar si el usuario está escribiendo en un input de Windows (ej. chat, archivos)
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

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

  return (
    <div className="screen-viewer" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', width: '100%' }}>
      {stream ? (
        <video 
          ref={videoRef} 
          autoPlay 
          playsInline
          onLoadedMetadata={handleMetadata}
          style={videoAspect ? { 
            aspectRatio: videoAspect, 
            maxHeight: '100%', 
            maxWidth: '100%', 
            objectFit: 'fill',
            touchAction: 'none' // Prevenir pull-to-refresh o scrolls nativos
          } : { opacity: 0 }}
          onPointerDown={(e) => handlePointerEvent(e, 'down')}
          onPointerUp={(e) => handlePointerEvent(e, 'up')}
          onPointerMove={(e) => handlePointerEvent(e, 'move')}
        />
      ) : (
        <div className="placeholder">
          <MonitorPlay />
          <p>Esperando la transmisión de pantalla...</p>
        </div>
      )}
    </div>
  );
}

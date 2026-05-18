import { useEffect, useRef } from 'react';
import { MonitorPlay } from 'lucide-react';

interface Props {
  stream: MediaStream | null;
  onMouseEvent: (type: string, x: number, y: number) => void;
}

export default function ScreenViewer({ stream, onMouseEvent }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  const handlePointerEvent = (e: React.PointerEvent<HTMLVideoElement>, type: string) => {
    if (!videoRef.current) return;
    
    // Calculate relative coordinates (0 to 1) based on video dimensions
    const rect = videoRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    
    onMouseEvent(type, x, y);
  };

  return (
    <div className="screen-viewer">
      {stream ? (
        <video 
          ref={videoRef} 
          autoPlay 
          playsInline 
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

import { useEffect, useRef, useState } from 'react';
import { MonitorPlay, Maximize2, Minimize2, Keyboard, MousePointer, ChevronUp, ChevronDown, Clipboard, XCircle } from 'lucide-react';

interface Props {
  stream: MediaStream | null;
  onMouseEvent: (type: string, x: number, y: number) => void;
  onKeyEvent?: (key: string) => void;
  platform?: 'android' | 'windows';
  onDisconnect?: () => void;
}

export default function ScreenViewer({ stream, onMouseEvent, onKeyEvent, platform = 'android', onDisconnect }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const keyboardInputRef = useRef<HTMLInputElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isRightClickMode, setIsRightClickMode] = useState(false);

  // States and refs for touch pinch-to-zoom and panning
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const touchStartRef = useRef({
    distance: 0,
    scale: 1,
    x: 0,
    y: 0,
    posX: 0,
    posY: 0,
    isPinching: false
  });

  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length === 1) {
      // Single finger: panning
      const touch = e.touches[0];
      touchStartRef.current = {
        ...touchStartRef.current,
        x: touch.clientX,
        y: touch.clientY,
        posX: position.x,
        posY: position.y,
        isPinching: false
      };
    } else if (e.touches.length === 2) {
      // Two fingers: pinch zoom
      const touch1 = e.touches[0];
      const touch2 = e.touches[1];
      const dist = Math.hypot(touch2.clientX - touch1.clientX, touch2.clientY - touch1.clientY);
      touchStartRef.current = {
        ...touchStartRef.current,
        distance: dist,
        scale: scale,
        posX: position.x,
        posY: position.y,
        isPinching: true
      };
    }
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length === 1 && !touchStartRef.current.isPinching) {
      if (scale > 1) {
        // Only allow scroll/pan on remote screen if zoomed in
        e.preventDefault();
        const touch = e.touches[0];
        const dx = touch.clientX - touchStartRef.current.x;
        const dy = touch.clientY - touchStartRef.current.y;
        
        // Calculate translation relative to zoom scale factor
        const newX = touchStartRef.current.posX + dx / scale;
        const newY = touchStartRef.current.posY + dy / scale;

        // Cap pan boundaries based on current scale to prevent dragging video off screen
        const maxPanX = (scale - 1) * 180;
        const maxPanY = (scale - 1) * 180;

        setPosition({
          x: Math.min(Math.max(newX, -maxPanX), maxPanX),
          y: Math.min(Math.max(newY, -maxPanY), maxPanY)
        });
      }
    } else if (e.touches.length === 2) {
      // Pinching
      e.preventDefault();
      const touch1 = e.touches[0];
      const touch2 = e.touches[1];
      const dist = Math.hypot(touch2.clientX - touch1.clientX, touch2.clientY - touch1.clientY);
      const factor = dist / touchStartRef.current.distance;
      const newScale = Math.min(Math.max(touchStartRef.current.scale * factor, 1), 5);
      setScale(newScale);
      
      // If scale returns to 1, reset panning coordinates
      if (newScale === 1) {
        setPosition({ x: 0, y: 0 });
      }
    }
  };

  const handleTouchEnd = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length === 0) {
      touchStartRef.current.isPinching = false;
    }
  };

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
      if (e.button === 2 || isRightClickMode) {
        if (type === 'down') eventType = 'rightdown';
        else if (type === 'up') {
          eventType = 'rightup';
          setIsRightClickMode(false); // Reset right click mode after action
        }
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

  const handleKeyboardInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!onKeyEvent) return;
    const text = e.target.value;
    if (text.length > 0) {
      for (let i = 0; i < text.length; i++) {
        onKeyEvent(text[i]);
      }
      e.target.value = '';
    }
  };

  const handleKeyboardKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!onKeyEvent) return;
    if (e.key === 'Backspace') {
      onKeyEvent('Backspace');
    } else if (e.key === 'Enter') {
      onKeyEvent('Enter');
    }
  };

  const handleMobilePaste = () => {
    if (!onKeyEvent) return;
    navigator.clipboard.readText().then(text => {
      if (text) {
        onKeyEvent('CLIPBOARD_PASTE:' + text);
      }
    }).catch(err => {
      console.error("Failed to read local clipboard:", err);
    });
  };

  const triggerMobileKeyboard = () => {
    if (keyboardInputRef.current) {
      keyboardInputRef.current.focus();
    }
    const bridge = (window as any).AndroidBridge;
    if (bridge && typeof bridge.showKeyboard === 'function') {
      try {
        bridge.showKeyboard();
      } catch (e) {
        console.error("Error calling AndroidBridge.showKeyboard:", e);
      }
    }
  };

  const preventPropagation = (e: React.SyntheticEvent | React.TouchEvent | React.PointerEvent | React.MouseEvent) => {
    e.stopPropagation();
  };

  const stopPropagationProps = {
    onPointerDown: preventPropagation,
    onPointerUp: preventPropagation,
    onPointerMove: preventPropagation,
    onMouseDown: preventPropagation,
    onMouseUp: preventPropagation,
    onClick: preventPropagation,
    onTouchStart: preventPropagation,
    onTouchMove: preventPropagation,
    onTouchEnd: preventPropagation,
  };

  return (
    <div 
      className={`screen-viewer ${platform === 'windows' ? 'platform-windows' : 'platform-android'} ${isFullscreen ? 'fullscreen' : ''}`}
      style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        height: '100%', 
        width: '100%', 
        position: 'relative',
        overflow: 'hidden' // Clip scaled content
      }}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
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
              touchAction: 'none',
              transform: `scale(${scale}) translate(${position.x}px, ${position.y}px)`,
              transformOrigin: 'center center',
              transition: scale === 1 ? 'transform 0.2s ease-out' : 'none'
            }}
            onPointerDown={(e) => handlePointerEvent(e, 'down')}
            onPointerUp={(e) => handlePointerEvent(e, 'up')}
            onPointerMove={(e) => handlePointerEvent(e, 'move')}
            onWheel={handleWheelEvent}
            onContextMenu={(e) => e.preventDefault()}
          />

          {/* Hidden Input for Mobile Keyboard */}
          <input
            ref={keyboardInputRef}
            type="text"
            onChange={handleKeyboardInput}
            onKeyDown={handleKeyboardKeyDown}
            style={{
              position: 'absolute',
              bottom: '12px',
              right: '12px',
              width: '30px',
              height: '30px',
              opacity: 0.01,
              border: 'none',
              background: 'transparent',
              color: 'transparent',
              pointerEvents: 'auto',
              zIndex: 1000
            }}
          />

          {/* Mobile Floating Overlay Controls (visible only on mobile) */}
          <div className="mobile-controls-bar" style={{ display: 'none' }} {...stopPropagationProps}>
            <button 
              className="mobile-control-btn"
              onClick={triggerMobileKeyboard}
              title="Teclado"
            >
              <Keyboard size={20} />
            </button>
            <button 
              className={`mobile-control-btn ${isRightClickMode ? 'active' : ''}`}
              onClick={() => setIsRightClickMode(!isRightClickMode)}
              title="Clic Derecho"
            >
              <MousePointer size={20} />
            </button>
            <button 
              className="mobile-control-btn"
              onClick={() => onMouseEvent('wheel', 120, 0)}
              title="Scroll Arriba"
            >
              <ChevronUp size={20} />
            </button>
            <button 
              className="mobile-control-btn"
              onClick={() => onMouseEvent('wheel', -120, 0)}
              title="Scroll Abajo"
            >
              <ChevronDown size={20} />
            </button>
            <button 
              className="mobile-control-btn"
              onClick={handleMobilePaste}
              title="Pegar"
            >
              <Clipboard size={20} />
            </button>
            {onDisconnect && (
              <button 
                className="mobile-control-btn"
                onClick={onDisconnect}
                style={{ color: '#ef4444' }}
                title="Desconectar"
              >
                <XCircle size={20} />
              </button>
            )}
          </div>

          <button
            {...stopPropagationProps}
            onClick={(e) => { e.stopPropagation(); setIsFullscreen(!isFullscreen); }}
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

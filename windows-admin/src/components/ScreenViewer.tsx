import { useEffect, useRef, useState } from 'react';
import {
  MonitorPlay, Maximize2, Minimize2, Keyboard, MousePointer, ChevronUp, ChevronDown,
  Clipboard, XCircle, Hand, Crosshair, Command, CornerDownLeft,
  ArrowUp, ArrowDown, ArrowLeft, ArrowRight
} from 'lucide-react';

interface Props {
  stream: MediaStream | null;
  onMouseEvent: (type: string, x: number, y: number) => void;
  onKeyEvent?: (key: string) => void;
  platform?: 'android' | 'windows';
  onDisconnect?: () => void;
}

type PointerMode = 'direct' | 'touchpad';

const TAP_MAX_MOVE = 10;      // px de dedo antes de empezar a mover el puntero
const LONG_PRESS_MS = 450;    // pulsación larga -> clic derecho
const LONG_PRESS_SLOP = 24;   // deriva tolerada sin cancelar la pulsación larga
const DOUBLE_TAP_MS = 320;    // ventana para encadenar el segundo toque

const readStoredMode = (): PointerMode => {
  try {
    const saved = localStorage.getItem('cr_pointer_mode');
    if (saved === 'direct' || saved === 'touchpad') return saved;
    // En teléfono el modo touchpad es mucho más preciso; en escritorio no aplica.
    const isPhone = window.matchMedia('(pointer: coarse)').matches && window.innerWidth <= 768;
    return isPhone ? 'touchpad' : 'direct';
  } catch (e) {
    return 'direct';
  }
};

export default function ScreenViewer({ stream, onMouseEvent, onKeyEvent, platform = 'android', onDisconnect }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const keyboardInputRef = useRef<HTMLInputElement>(null);
  const cursorElRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isRightClickMode, setIsRightClickMode] = useState(false);
  const [pointerMode, setPointerMode] = useState<PointerMode>(readStoredMode);
  const [showKeysBar, setShowKeysBar] = useState(false);

  const isKeyboardActiveRef = useRef(false);
  const touchMouseStartRef = useRef<{ x: number; y: number; time: number; isTap: boolean } | null>(null);

  const scaleRef = useRef(1);
  const positionRef = useRef({ x: 0, y: 0 });
  const refocusTimeoutRef = useRef<any>(null);

  // Posición normalizada (0..1) del puntero sobre la pantalla remota
  const cursorRef = useRef({ x: 0.5, y: 0.5 });
  const pointerModeRef = useRef<PointerMode>(pointerMode);
  const isRightClickModeRef = useRef(false);
  const multiTouchRef = useRef(false);

  useEffect(() => {
    pointerModeRef.current = pointerMode;
    try { localStorage.setItem('cr_pointer_mode', pointerMode); } catch (e) {}
  }, [pointerMode]);

  useEffect(() => {
    isRightClickModeRef.current = isRightClickMode;
  }, [isRightClickMode]);

  // Geometría real del vídeo dentro del contenedor (contempla letterbox y zoom)
  const getVideoGeometry = () => {
    const video = videoRef.current;
    if (!video) return null;
    const rect = video.getBoundingClientRect();
    const videoWidth = video.videoWidth;
    const videoHeight = video.videoHeight;
    if (!videoWidth || !videoHeight || !rect.width || !rect.height) return null;

    const containerRatio = rect.width / rect.height;
    const videoRatio = videoWidth / videoHeight;

    let actualWidth, actualHeight, startX, startY;
    if (containerRatio > videoRatio) {
      actualHeight = rect.height;
      actualWidth = actualHeight * videoRatio;
      startX = (rect.width - actualWidth) / 2;
      startY = 0;
    } else {
      actualWidth = rect.width;
      actualHeight = actualWidth / videoRatio;
      startX = 0;
      startY = (rect.height - actualHeight) / 2;
    }
    return { rect, actualWidth, actualHeight, startX, startY };
  };

  const updateCursorOverlay = () => {
    const el = cursorElRef.current;
    const container = containerRef.current;
    if (!el || !container) return;
    const geo = getVideoGeometry();
    if (!geo) return;
    const cRect = container.getBoundingClientRect();
    const left = geo.rect.left - cRect.left + geo.startX + cursorRef.current.x * geo.actualWidth;
    const top = geo.rect.top - cRect.top + geo.startY + cursorRef.current.y * geo.actualHeight;
    el.style.transform = `translate(${left}px, ${top}px)`;
  };

  const updateVideoTransform = () => {
    if (videoRef.current) {
      videoRef.current.style.transform = `scale(${scaleRef.current}) translate(${positionRef.current.x}px, ${positionRef.current.y}px)`;
      videoRef.current.style.transition = scaleRef.current === 1 ? 'transform 0.2s ease-out' : 'none';
    }
    updateCursorOverlay();
  };

  // Límite de paneo real: el sobrante visible a cada lado es (escala-1)/2 del tamaño del
  // contenedor, y translate se aplica dentro del sistema ya escalado (por eso /escala).
  const getMaxPan = (scale: number) => {
    const container = containerRef.current;
    const w = container ? container.clientWidth : 360;
    const h = container ? container.clientHeight : 240;
    return {
      x: (w * (scale - 1)) / (2 * scale),
      y: (h * (scale - 1)) / (2 * scale)
    };
  };

  // Indicador temporal de diagnostico: muestra el ultimo comando enviado al
  // equipo remoto, para ver desde el telefono que llega de verdad.
  const hudRef = useRef<HTMLDivElement>(null);
  const emit = (type: string, x: number, y: number) => {
    const el = hudRef.current;
    if (el) {
      el.textContent = (type === 'move' || type === 'wheel')
        ? type
        : type + '  ' + x.toFixed(2) + ' ' + y.toFixed(2);
      el.classList.remove('flash');
      void el.offsetWidth;
      el.classList.add('flash');
    }
    onMouseEvent(type, x, y);
  };

  const touchStartRef = useRef({
    distance: 0,
    scale: 1,
    x: 0,
    y: 0,
    posX: 0,
    posY: 0,
    isPinching: false
  });

  // --- Envío de movimiento agrupado por frame ---------------------------------
  const pendingMoveRef = useRef<{ x: number; y: number } | null>(null);
  const rafRef = useRef<number | null>(null);

  const flushPendingMove = () => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    const p = pendingMoveRef.current;
    pendingMoveRef.current = null;
    if (p) emit('move', p.x, p.y);
  };

  const queueMove = (x: number, y: number) => {
    pendingMoveRef.current = { x, y };
    if (rafRef.current === null) {
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        const p = pendingMoveRef.current;
        pendingMoveRef.current = null;
        if (p) emit('move', p.x, p.y);
      });
    }
  };

  const clickAtCursor = (forceRight?: boolean) => {
    flushPendingMove();
    const { x, y } = cursorRef.current;
    const useRight = forceRight === true || isRightClickModeRef.current;
    emit(useRight ? 'rightdown' : 'down', x, y);
    setTimeout(() => emit(useRight ? 'rightup' : 'up', x, y), 20);
    if (isRightClickModeRef.current && forceRight !== true) setIsRightClickMode(false);
  };

  const doubleClickAtCursor = () => {
    flushPendingMove();
    const { x, y } = cursorRef.current;
    emit('down', x, y);
    setTimeout(() => emit('up', x, y), 20);
    setTimeout(() => emit('down', x, y), 70);
    setTimeout(() => emit('up', x, y), 90);
  };

  const vibrate = (ms: number) => {
    try {
      if (typeof navigator !== 'undefined' && (navigator as any).vibrate) (navigator as any).vibrate(ms);
    } catch (e) {}
  };

  // --- Modo touchpad ----------------------------------------------------------
  const padRef = useRef({
    active: false,
    pointerId: -1,
    startX: 0,
    startY: 0,
    lastX: 0,
    lastY: 0,
    lastT: 0,
    moved: false,
    dragging: false,
    didLongPress: false,
    secondTap: false,
    longPressTimer: null as any
  });
  const lastTapRef = useRef<{ t: number; x: number; y: number } | null>(null);

  // Anillo que se cierra alrededor del cursor mientras se mantiene pulsado:
  // sin esta señal no hay forma de saber cuánto falta para el clic derecho.
  const setPressing = (on: boolean) => {
    const el = cursorElRef.current;
    if (!el) return;
    el.classList.remove('pressing');
    if (on) {
      void el.offsetWidth; // reinicia la animación
      el.classList.add('pressing');
    }
  };

  const clearPadTimers = () => {
    const p = padRef.current;
    if (p.longPressTimer) { clearTimeout(p.longPressTimer); p.longPressTimer = null; }
    setPressing(false);
  };

  const cancelPadGesture = () => {
    const p = padRef.current;
    clearPadTimers();
    if (p.dragging) {
      flushPendingMove();
      emit('up', cursorRef.current.x, cursorRef.current.y);
    }
    p.active = false;
    p.dragging = false;
    p.secondTap = false;
    p.didLongPress = false;
    lastTapRef.current = null;
  };

  // Un único sitio donde nace el clic derecho táctil, para que los tres caminos
  // (temporizador, contextmenu del WebView y pointercancel) no lo dupliquen.
  const fireRightClick = () => {
    const p = padRef.current;
    if (p.didLongPress) return;
    clearPadTimers();
    p.didLongPress = true;
    clickAtCursor(true);
    vibrate(25);
  };

  const beginDrag = () => {
    const p = padRef.current;
    if (!p.active || p.dragging) return;
    clearPadTimers();
    p.dragging = true;
    lastTapRef.current = null;
    flushPendingMove();
    emit('down', cursorRef.current.x, cursorRef.current.y);
    vibrate(15);
  };

  // Ganancia con aceleración: lento = precisión fina, rápido = recorrer la pantalla
  const moveCursorBy = (dx: number, dy: number, dt: number) => {
    const geo = getVideoGeometry();
    if (!geo) return;
    const speed = dt > 0 ? Math.hypot(dx, dy) / dt : 0;
    const accel = Math.min(2.2, Math.max(0.65, 0.65 + speed * 0.6));
    const nx = cursorRef.current.x + (dx * accel) / geo.actualWidth;
    const ny = cursorRef.current.y + (dy * accel) / geo.actualHeight;
    cursorRef.current = {
      x: Math.min(1, Math.max(0, nx)),
      y: Math.min(1, Math.max(0, ny))
    };
    updateCursorOverlay();
    queueMove(cursorRef.current.x, cursorRef.current.y);
  };

  const handleTouchpadPointer = (e: React.PointerEvent<HTMLVideoElement>, type: string) => {
    const p = padRef.current;
    const now = Date.now();

    if (type === 'down') {
      if (multiTouchRef.current) return;
      clearPadTimers();

      const prevTap = lastTapRef.current;
      const isSecond = !!prevTap
        && (now - prevTap.t) < DOUBLE_TAP_MS
        && Math.hypot(e.clientX - prevTap.x, e.clientY - prevTap.y) < 40;

      p.active = true;
      p.pointerId = e.pointerId;
      p.startX = e.clientX;
      p.startY = e.clientY;
      p.lastX = e.clientX;
      p.lastY = e.clientY;
      p.lastT = now;
      p.moved = false;
      p.dragging = false;
      p.didLongPress = false;
      p.secondTap = isSecond;

      // La pulsación larga se arma SIEMPRE, también cuando viene de un toque previo:
      // tocar un archivo y mantener pulsado es justo como se pide el menú contextual.
      // El arrastre se activa al mover el segundo toque, no por mantenerlo quieto.
      setPressing(true);
      p.longPressTimer = setTimeout(() => {
        p.longPressTimer = null;
        setPressing(false);
        if (!p.active || p.dragging) return;
        fireRightClick();
      }, LONG_PRESS_MS);
      return;
    }

    if (!p.active || e.pointerId !== p.pointerId) return;

    if (type === 'move') {
      const dx = e.clientX - p.lastX;
      const dy = e.clientY - p.lastY;
      const dt = Math.max(1, now - p.lastT);
      p.lastX = e.clientX;
      p.lastY = e.clientY;
      p.lastT = now;

      const drift = Math.hypot(e.clientX - p.startX, e.clientY - p.startY);

      if (!p.moved && drift > TAP_MAX_MOVE) {
        p.moved = true;
        // Segundo toque que además se arrastra: gesto de arrastre del trackpad
        if (p.secondTap && !p.dragging) beginDrag();
      }

      // La pulsación larga solo se cancela si el dedo se va de verdad, no por el temblor
      if (p.longPressTimer && drift > LONG_PRESS_SLOP) {
        clearTimeout(p.longPressTimer);
        p.longPressTimer = null;
        setPressing(false);
      }

      if (p.moved || p.dragging) moveCursorBy(dx, dy, dt);
      return;
    }

    if (type === 'up') {
      clearPadTimers();

      if (p.dragging) {
        flushPendingMove();
        emit('up', cursorRef.current.x, cursorRef.current.y);
        p.dragging = false;
        lastTapRef.current = null;
      } else if (!p.moved && !p.didLongPress) {
        // Un toque = un clic. Dos toques seguidos llegan como dos clics en la misma
        // coordenada, que es justo lo que Windows interpreta como doble clic.
        clickAtCursor();
        lastTapRef.current = p.secondTap ? null : { t: now, x: e.clientX, y: e.clientY };
      } else {
        lastTapRef.current = null;
      }

      p.active = false;
      p.secondTap = false;
      p.didLongPress = false;
      return;
    }
  };

  // --- Gestos del contenedor (zoom y paneo) -----------------------------------
  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length === 1) {
      const touch = e.touches[0];
      touchStartRef.current = {
        ...touchStartRef.current,
        x: touch.clientX,
        y: touch.clientY,
        posX: positionRef.current.x,
        posY: positionRef.current.y,
        isPinching: false
      };
    } else if (e.touches.length === 2) {
      // Dos dedos: zoom y paneo. Cancela cualquier gesto de puntero en curso.
      multiTouchRef.current = true;
      cancelPadGesture();
      const touch1 = e.touches[0];
      const touch2 = e.touches[1];
      const dist = Math.hypot(touch2.clientX - touch1.clientX, touch2.clientY - touch1.clientY);
      touchStartRef.current = {
        distance: dist,
        scale: scaleRef.current,
        x: (touch1.clientX + touch2.clientX) / 2,
        y: (touch1.clientY + touch2.clientY) / 2,
        posX: positionRef.current.x,
        posY: positionRef.current.y,
        isPinching: true
      };
    }
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length === 1 && !touchStartRef.current.isPinching) {
      // Con un dedo solo se panea en modo directo; en touchpad el dedo mueve el puntero.
      if (scaleRef.current > 1 && pointerModeRef.current === 'direct') {
        e.preventDefault();
        const touch = e.touches[0];
        const dx = touch.clientX - touchStartRef.current.x;
        const dy = touch.clientY - touchStartRef.current.y;

        const newX = touchStartRef.current.posX + dx / scaleRef.current;
        const newY = touchStartRef.current.posY + dy / scaleRef.current;
        const max = getMaxPan(scaleRef.current);

        positionRef.current = {
          x: Math.min(Math.max(newX, -max.x), max.x),
          y: Math.min(Math.max(newY, -max.y), max.y)
        };

        updateVideoTransform();
      }
    } else if (e.touches.length === 2) {
      e.preventDefault();
      const touch1 = e.touches[0];
      const touch2 = e.touches[1];
      const dist = Math.hypot(touch2.clientX - touch1.clientX, touch2.clientY - touch1.clientY);
      const factor = dist / touchStartRef.current.distance;
      const newScale = Math.min(Math.max(touchStartRef.current.scale * factor, 1), 5);

      scaleRef.current = newScale;

      if (newScale === 1) {
        positionRef.current = { x: 0, y: 0 };
      } else {
        // Paneo con el centroide de los dos dedos
        const cx = (touch1.clientX + touch2.clientX) / 2;
        const cy = (touch1.clientY + touch2.clientY) / 2;
        const dx = cx - touchStartRef.current.x;
        const dy = cy - touchStartRef.current.y;
        const newX = touchStartRef.current.posX + dx / newScale;
        const newY = touchStartRef.current.posY + dy / newScale;
        const max = getMaxPan(newScale);
        positionRef.current = {
          x: Math.min(Math.max(newX, -max.x), max.x),
          y: Math.min(Math.max(newY, -max.y), max.y)
        };
      }

      updateVideoTransform();
    }
  };

  const handleTouchEnd = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length === 0) {
      touchStartRef.current.isPinching = false;
      multiTouchRef.current = false;
    }
  };

  useEffect(() => {
    const videoElement = videoRef.current;
    if (videoElement) {
      videoElement.srcObject = stream;
      if (!stream) {
        try {
          videoElement.pause();
          videoElement.src = "";
          videoElement.load();
        } catch (e) {}
      }
    }
    // Reset zoom on stream change
    scaleRef.current = 1;
    positionRef.current = { x: 0, y: 0 };
    cursorRef.current = { x: 0.5, y: 0.5 };
    updateVideoTransform();

    return () => {
      if (videoElement) {
        try {
          videoElement.pause();
          videoElement.srcObject = null;
          videoElement.src = "";
          videoElement.load();
        } catch (e) {}
      }
    };
  }, [stream]);

  useEffect(() => {
    const onResize = () => updateCursorOverlay();
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
      clearPadTimers();
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  const sendMouseEventAtPointer = (clientX: number, clientY: number, button: number, _video: HTMLVideoElement, type: string) => {
    const geo = getVideoGeometry();
    if (!geo) return;

    const x = (clientX - geo.rect.left - geo.startX) / geo.actualWidth;
    const y = (clientY - geo.rect.top - geo.startY) / geo.actualHeight;

    if (x >= 0 && x <= 1 && y >= 0 && y <= 1) {
      cursorRef.current = { x, y };
      let eventType = type;
      if (button === 2 || isRightClickMode) {
        if (type === 'down') eventType = 'rightdown';
        else if (type === 'up') {
          eventType = 'rightup';
          setIsRightClickMode(false);
        }
      }
      emit(eventType, x, y);
    }
  };

  const handlePointerEvent = (e: React.PointerEvent<HTMLVideoElement>, type: string) => {
    // Ignore secondary pointers for touch
    if (e.pointerType === 'touch' && !e.isPrimary) {
      return;
    }

    const video = e.currentTarget;

    if (e.pointerType === 'touch' && pointerModeRef.current === 'touchpad') {
      if (type === 'down') {
        try { video.setPointerCapture(e.pointerId); } catch (err) {}
      }
      handleTouchpadPointer(e, type);
      return;
    }

    if (e.pointerType === 'touch' && scaleRef.current > 1) {
      if (type === 'down') {
        touchMouseStartRef.current = {
          x: e.clientX,
          y: e.clientY,
          time: Date.now(),
          isTap: true
        };
        return;
      }

      if (type === 'move') {
        if (touchMouseStartRef.current) {
          const dx = e.clientX - touchMouseStartRef.current.x;
          const dy = e.clientY - touchMouseStartRef.current.y;
          if (Math.hypot(dx, dy) > 10) {
            touchMouseStartRef.current.isTap = false;
          }
        }
        return;
      }

      if (type === 'up') {
        if (touchMouseStartRef.current && touchMouseStartRef.current.isTap) {
          const elapsed = Date.now() - touchMouseStartRef.current.time;
          if (elapsed < 300) {
            sendMouseEventAtPointer(e.clientX, e.clientY, e.button, video, 'down');
            setTimeout(() => {
              sendMouseEventAtPointer(e.clientX, e.clientY, e.button, video, 'up');
            }, 20);
          }
        }
        touchMouseStartRef.current = null;
        return;
      }
    }

    // Normal behavior (mouse, or touch when scale === 1)
    sendMouseEventAtPointer(e.clientX, e.clientY, e.button, video, type);
  };

  // El espacio llega al cliente Windows como "key  " y el Trim() lo descarta:
  // hay que enviarlo con nombre.
  const normalizeKey = (key: string) => (key === ' ' ? 'Space' : key);

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
        onKeyEvent(normalizeKey(e.key));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        onKeyEvent('Enter');
      } else if (e.key === 'Tab' || e.key === 'Delete') {
        e.preventDefault();
        onKeyEvent(e.key);
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [onKeyEvent]);

  // Watchdog hook to prevent the video element from getting paused/stuck by browser autoplay or focus throttling
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handlePause = () => {
      if (stream && video.paused) {
        video.play().catch(err => console.warn("[ScreenViewer] video.play failed on pause event:", err));
      }
    };

    video.addEventListener('pause', handlePause);
    return () => {
      video.removeEventListener('pause', handlePause);
    };
  }, [stream]);

  const handleWheelEvent = (e: React.WheelEvent<HTMLVideoElement>) => {
    // deltaY > 0 means scroll down (send negative value to csc), deltaY < 0 means scroll up (send positive)
    const scrollAmount = e.deltaY > 0 ? -120 : 120;
    emit('wheel', scrollAmount, 0);
  };

  const handleKeyboardInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!onKeyEvent) return;
    const value = e.target.value;

    if (value === "") {
      // Android Backspace case: the spacer space was deleted
      onKeyEvent("Backspace");
      e.target.value = " ";
    } else if (value === " ") {
      // No change
    } else {
      // Characters were added.
      // Since it starts with " ", we extract the added characters
      if (value.startsWith(" ")) {
        const added = value.slice(1);
        for (let i = 0; i < added.length; i++) {
          onKeyEvent(normalizeKey(added[i]));
        }
      } else {
        // In case the spacer space was replaced/deleted during composition
        for (let i = 0; i < value.length; i++) {
          onKeyEvent(normalizeKey(value[i]));
        }
      }
      // Reset the spacer space
      e.target.value = " ";
    }
  };

  const handleKeyboardKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!onKeyEvent) return;
    if (e.key === 'Backspace') {
      e.preventDefault();
      onKeyEvent('Backspace');
    } else if (e.key === 'Enter') {
      e.preventDefault();
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

  const handleInputBlur = () => {
    if (isKeyboardActiveRef.current) {
      if (refocusTimeoutRef.current) {
        clearTimeout(refocusTimeoutRef.current);
      }
      refocusTimeoutRef.current = setTimeout(() => {
        if (isKeyboardActiveRef.current && keyboardInputRef.current) {
          keyboardInputRef.current.focus();
        }
      }, 150);
    }
  };

  const handleInputFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    e.target.value = " ";
  };

  useEffect(() => {
    if (keyboardInputRef.current) {
      keyboardInputRef.current.value = " ";
    }
    return () => {
      if (refocusTimeoutRef.current) {
        clearTimeout(refocusTimeoutRef.current);
      }
    };
  }, []);

  const triggerMobileKeyboard = () => {
    if (keyboardInputRef.current) {
      if (isKeyboardActiveRef.current) {
        isKeyboardActiveRef.current = false;
        keyboardInputRef.current.blur();
        const bridge = (window as any).AndroidBridge;
        if (bridge && typeof bridge.hideKeyboard === 'function') {
          try {
            bridge.hideKeyboard();
          } catch (e) {}
        }
      } else {
        isKeyboardActiveRef.current = true;
        keyboardInputRef.current.focus();
        setTimeout(() => {
          const bridge = (window as any).AndroidBridge;
          if (bridge && typeof bridge.showKeyboard === 'function') {
            try {
              bridge.showKeyboard();
            } catch (e) {
              console.error("Error calling AndroidBridge.showKeyboard:", e);
            }
          }
        }, 100);
      }
    }
  };

  const togglePointerMode = () => {
    setPointerMode(prev => {
      const next: PointerMode = prev === 'touchpad' ? 'direct' : 'touchpad';
      if (next === 'touchpad') {
        // Alinea el puntero real con el cursor que dibujamos
        setTimeout(() => {
          updateCursorOverlay();
          emit('move', cursorRef.current.x, cursorRef.current.y);
        }, 0);
      }
      return next;
    });
  };

  const sendKey = (key: string) => {
    if (onKeyEvent) onKeyEvent(key);
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
      ref={containerRef}
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
            muted
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'contain',
              touchAction: 'none',
              transform: `scale(${scaleRef.current}) translate(${positionRef.current.x}px, ${positionRef.current.y}px)`,
              transformOrigin: 'center center',
              transition: scaleRef.current === 1 ? 'transform 0.2s ease-out' : 'none'
            }}
            onPointerDown={(e) => handlePointerEvent(e, 'down')}
            onPointerUp={(e) => handlePointerEvent(e, 'up')}
            onPointerMove={(e) => handlePointerEvent(e, 'move')}
            onPointerCancel={() => {
              // Si el WebView nos arrebata el toque en plena pulsación larga,
              // la damos por buena en vez de perderla.
              const p = padRef.current;
              if (p.active && !p.moved && !p.dragging && !p.didLongPress && p.longPressTimer) {
                fireRightClick();
              }
              cancelPadGesture();
            }}
            onWheel={handleWheelEvent}
            onContextMenu={(e) => {
              e.preventDefault();
              // Android dispara contextmenu en su propia pulsación larga. Usar su
              // detección es más fiable que nuestro temporizador dentro del WebView.
              const p = padRef.current;
              if (p.active && !p.dragging && !p.didLongPress) {
                fireRightClick();
              }
            }}
          />

          {/* Cursor dibujado: sin él el modo touchpad sería a ciegas */}
          {pointerMode === 'touchpad' && (
            <div ref={cursorElRef} className="remote-cursor" aria-hidden="true">
              <span className="press-ring" />
              <svg viewBox="0 0 24 24" width="24" height="24">
                <path
                  d="M4 2 L4 19 L8.6 14.6 L11.6 21 L14.2 19.8 L11.2 13.6 L17.6 13.6 Z"
                  fill="#ffffff"
                  stroke="#0b1220"
                  strokeWidth="1.4"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
          )}

          {/* Hidden Input for Mobile Keyboard */}
          <input
            ref={keyboardInputRef}
            type="text"
            onChange={handleKeyboardInput}
            onKeyDown={handleKeyboardKeyDown}
            onBlur={handleInputBlur}
            onFocus={handleInputFocus}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck="false"
            style={{
              // 1x1 px, sin eventos y fuera de la zona de botones: antes ocupaba
              // 30x30 px sobre la esquina inferior derecha y se comía los toques
              // de la barra (por eso la X no respondía).
              position: 'absolute',
              top: '50%',
              left: '0px',
              width: '1px',
              height: '1px',
              opacity: 0.01,
              border: 'none',
              padding: 0,
              background: 'transparent',
              color: 'transparent',
              pointerEvents: 'none',
              zIndex: 1
            }}
          />

          <div ref={hudRef} className="input-hud" aria-hidden="true" />

          {/* Controles táctiles: teclas especiales + dos filas fijas, sin scroll */}
          <div className="mobile-controls-wrap" style={{ display: 'none' }} {...stopPropagationProps}>
          {showKeysBar && (
            <div className="mobile-keys-bar">
              <button className="mobile-key-btn wide" onClick={() => sendKey('Escape')} title="Escape">Esc</button>
              <button className="mobile-key-btn wide" onClick={() => sendKey('Tab')} title="Tabulador">Tab</button>
              <button className="mobile-key-btn wide" onClick={() => sendKey('Backspace')} title="Retroceso">⌫</button>
              <button className="mobile-key-btn wide" onClick={() => sendKey('Delete')} title="Suprimir">Supr</button>
              <button className="mobile-key-btn" onClick={() => sendKey('Enter')} title="Enter">
                <CornerDownLeft size={18} />
              </button>
              <button className="mobile-key-btn" onClick={() => sendKey('ArrowLeft')} title="Izquierda">
                <ArrowLeft size={18} />
              </button>
              <button className="mobile-key-btn" onClick={() => sendKey('ArrowUp')} title="Arriba">
                <ArrowUp size={18} />
              </button>
              <button className="mobile-key-btn" onClick={() => sendKey('ArrowDown')} title="Abajo">
                <ArrowDown size={18} />
              </button>
              <button className="mobile-key-btn" onClick={() => sendKey('ArrowRight')} title="Derecha">
                <ArrowRight size={18} />
              </button>
            </div>
          )}

          {/* Fila 1: ratón */}
          <div className="mobile-controls-bar">
            <button
              className={`mobile-control-btn ${pointerMode === 'touchpad' ? 'active' : ''}`}
              onClick={togglePointerMode}
              title={pointerMode === 'touchpad' ? 'Modo touchpad (tocar para pasar a directo)' : 'Modo directo (tocar para pasar a touchpad)'}
            >
              {pointerMode === 'touchpad' ? <Hand size={20} /> : <Crosshair size={20} />}
            </button>
            <button
              className={`mobile-control-btn right-click-btn ${isRightClickMode ? 'active' : ''}`}
              onClick={() => {
                // En touchpad el cursor ya está donde el usuario quiere: clic derecho al momento.
                if (pointerMode === 'touchpad') clickAtCursor(true);
                else setIsRightClickMode(!isRightClickMode);
              }}
              title={pointerMode === 'touchpad' ? 'Clic derecho aquí' : 'Clic derecho (en el siguiente toque)'}
            >
              <MousePointer size={20} />
              <span className="btn-tag">der</span>
            </button>
            <button
              className="mobile-control-btn"
              onClick={doubleClickAtCursor}
              title="Doble clic"
            >
              <span className="dbl-click-label">2x</span>
            </button>
            <button
              className="mobile-control-btn"
              onClick={() => emit('wheel', 120, 0)}
              title="Scroll Arriba"
            >
              <ChevronUp size={20} />
            </button>
            <button
              className="mobile-control-btn"
              onClick={() => emit('wheel', -120, 0)}
              title="Scroll Abajo"
            >
              <ChevronDown size={20} />
            </button>
          </div>

          {/* Fila 2: teclado y sesión */}
          <div className="mobile-controls-bar">
            <button
              className="mobile-control-btn"
              onClick={triggerMobileKeyboard}
              title="Teclado"
            >
              <Keyboard size={20} />
            </button>
            <button
              className={`mobile-control-btn ${showKeysBar ? 'active' : ''}`}
              onClick={() => setShowKeysBar(v => !v)}
              title="Teclas especiales"
            >
              <Command size={20} />
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
                className="mobile-control-btn danger"
                onClick={onDisconnect}
                title="Desconectar"
              >
                <XCircle size={20} />
              </button>
            )}
          </div>
          </div>

          {platform === 'windows' && (
            <button
              {...stopPropagationProps}
              onClick={(e) => { e.stopPropagation(); if (onKeyEvent) onKeyEvent('SEND_SAS'); }}
              className="sas-btn"
              title="Enviar Ctrl+Alt+Supr"
            >
              <Keyboard size={16} />
              <span>Ctrl+Alt+Supr</span>
            </button>
          )}

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

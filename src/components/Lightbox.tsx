import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import type { ImgHTMLAttributes } from 'react';

const OPEN_EVENT = 'called-it:lightbox-open';

// Any image anywhere can open the shared full-screen viewer by dispatching this
// event (see ZoomableImage). Keeping it event-based means a single <Lightbox />
// at the app root covers every image without threading context everywhere.
export function openLightbox(src: string, alt = '') {
  if (typeof window === 'undefined' || !src) return;
  window.dispatchEvent(new CustomEvent(OPEN_EVENT, { detail: { src, alt } }));
}

// Drop-in replacement for <img> that opens the full-screen viewer on click/tap.
export function ZoomableImage({
  src,
  alt = '',
  className = '',
  ...rest
}: ImgHTMLAttributes<HTMLImageElement>) {
  return (
    <img
      {...rest}
      src={src}
      alt={alt}
      onClick={(event) => {
        event.stopPropagation();
        if (typeof src === 'string') openLightbox(src, typeof alt === 'string' ? alt : '');
      }}
      className={`cursor-zoom-in ${className}`}
    />
  );
}

export function Lightbox() {
  const [image, setImage] = useState<{ src: string; alt: string } | null>(null);
  const [scale, setScale] = useState(1);
  const [transformOrigin, setTransformOrigin] = useState('50% 50%');
  const pinchStartRef = useRef<{ distance: number; scale: number } | null>(null);

  function touchDistance(touches: React.TouchList) {
    const first = touches.item(0);
    const second = touches.item(1);
    if (!first || !second) return 0;
    return Math.hypot(second.clientX - first.clientX, second.clientY - first.clientY);
  }

  useEffect(() => {
    function onOpen(event: Event) {
      const detail = (event as CustomEvent<{ src: string; alt: string }>).detail;
      if (detail?.src) {
        setScale(1);
        setTransformOrigin('50% 50%');
        setImage(detail);
      }
    }
    window.addEventListener(OPEN_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_EVENT, onOpen);
  }, []);

  useEffect(() => {
    if (!image) return undefined;
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setImage(null);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [image]);

  if (!image) return null;

  return (
    <div
      className="fixed inset-0 z-[100] grid place-items-center bg-ink/85 p-4 backdrop-blur-sm animate-soft-enter"
      onClick={() => setImage(null)}
    >
      <button
        type="button"
        onClick={() => setImage(null)}
        aria-label="Close image"
        className="absolute right-4 top-4 grid h-10 w-10 place-items-center rounded-full bg-white/15 text-white transition hover:bg-white/25"
      >
        <X size={20} />
      </button>
      <img
        src={image.src}
        alt={image.alt}
        draggable={false}
        onClick={(event) => event.stopPropagation()}
        onTouchStart={(event) => {
          if (event.touches.length !== 2) return;
          event.stopPropagation();
          const first = event.touches.item(0);
          const second = event.touches.item(1);
          if (first && second) {
            const rect = event.currentTarget.getBoundingClientRect();
            const midpointX = (first.clientX + second.clientX) / 2;
            const midpointY = (first.clientY + second.clientY) / 2;
            setTransformOrigin(`${midpointX - rect.left}px ${midpointY - rect.top}px`);
          }
          pinchStartRef.current = {
            distance: touchDistance(event.touches),
            scale,
          };
        }}
        onTouchMove={(event) => {
          if (event.touches.length !== 2 || !pinchStartRef.current) return;
          event.preventDefault();
          event.stopPropagation();
          const distance = touchDistance(event.touches);
          if (distance <= 0 || pinchStartRef.current.distance <= 0) return;
          setScale(Math.min(4, Math.max(1, pinchStartRef.current.scale * distance / pinchStartRef.current.distance)));
        }}
        onTouchEnd={(event) => {
          event.stopPropagation();
          if (event.touches.length < 2) {
            pinchStartRef.current = null;
            setScale(1);
            setTransformOrigin('50% 50%');
          }
        }}
        onTouchCancel={(event) => {
          event.stopPropagation();
          pinchStartRef.current = null;
          setScale(1);
          setTransformOrigin('50% 50%');
        }}
        className="max-h-[90vh] max-w-full rounded-md object-contain shadow-lift"
        style={{
          touchAction: 'none',
          transform: `scale(${scale})`,
          transformOrigin,
          transition: pinchStartRef.current ? 'none' : 'transform 180ms ease-out',
        }}
      />
    </div>
  );
}

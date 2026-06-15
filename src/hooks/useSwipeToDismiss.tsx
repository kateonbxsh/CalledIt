import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';

const DISMISS_DISTANCE = 96;
const DISMISS_VELOCITY = 0.55;

export function useSwipeToDismiss(onDismiss: () => void) {
  const startRef = useRef({ x: 0, y: 0, time: 0, active: false });
  const [offset, setOffset] = useState(0);

  function onPointerDown(event: ReactPointerEvent<HTMLElement>) {
    if (event.pointerType === 'mouse') return;
    const target = event.target as HTMLElement;
    const scrollPanel = target.closest<HTMLElement>('[data-sheet-scroll]');
    if (scrollPanel && scrollPanel.scrollTop > 0) return;
    startRef.current = {
      x: event.clientX,
      y: event.clientY,
      time: performance.now(),
      active: true,
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }

  function onPointerMove(event: ReactPointerEvent<HTMLElement>) {
    if (!startRef.current.active) return;
    const deltaX = event.clientX - startRef.current.x;
    const deltaY = event.clientY - startRef.current.y;
    if (deltaY <= 0 || Math.abs(deltaX) > deltaY) {
      setOffset(0);
      return;
    }
    setOffset(Math.min(220, deltaY));
  }

  function finish(event: ReactPointerEvent<HTMLElement>) {
    if (!startRef.current.active) return;
    const distance = Math.max(0, event.clientY - startRef.current.y);
    const elapsed = Math.max(1, performance.now() - startRef.current.time);
    startRef.current.active = false;
    setOffset(0);
    if (distance >= DISMISS_DISTANCE || distance / elapsed >= DISMISS_VELOCITY) {
      onDismiss();
    }
  }

  return {
    sheetProps: {
      onPointerDown,
      onPointerMove,
      onPointerUp: finish,
      onPointerCancel: finish,
      style: {
        transform: offset ? `translateY(${offset}px)` : undefined,
        transition: offset ? 'none' : 'transform 180ms ease',
      },
    },
    dragHandle: (
      <span
        aria-hidden="true"
        className="mx-auto mb-2 block h-1 w-10 shrink-0 rounded-full bg-ink/20 sm:hidden"
      />
    ),
  };
}

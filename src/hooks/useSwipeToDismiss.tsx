import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';

const DISMISS_DISTANCE = 96;
const DISMISS_VELOCITY = 0.55;
let bodyLockCount = 0;
let previousBodyOverflow = '';
let previousBodyOverscrollBehavior = '';

function lockPageScroll() {
  if (bodyLockCount === 0) {
    previousBodyOverflow = document.body.style.overflow;
    previousBodyOverscrollBehavior = document.body.style.overscrollBehavior;
    document.body.style.overflow = 'hidden';
    document.body.style.overscrollBehavior = 'none';
  }
  bodyLockCount += 1;
}

function unlockPageScroll() {
  bodyLockCount = Math.max(0, bodyLockCount - 1);
  if (bodyLockCount === 0) {
    document.body.style.overflow = previousBodyOverflow;
    document.body.style.overscrollBehavior = previousBodyOverscrollBehavior;
  }
}

export function useSwipeToDismiss(onDismiss: () => void, active = true) {
  const startRef = useRef({ x: 0, y: 0, time: 0, active: false });
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    if (!active) return;
    lockPageScroll();
    return unlockPageScroll;
  }, [active]);

  function onPointerDown(event: ReactPointerEvent<HTMLElement>) {
    if (event.pointerType === 'mouse') return;
    const target = event.target as HTMLElement | null;
    const scrollHost = target?.closest?.('[data-sheet-scroll]') as HTMLElement | null;
    if (scrollHost && scrollHost.scrollTop > 0) return;
    if (target && (
      target.closest('input') ||
      target.closest('textarea') ||
      target.closest('select') ||
      target.closest('button')
    ) && !target.closest('[data-sheet-drag-handle]')) {
      return;
    }
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
    event.preventDefault();
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
      style: {
        transform: offset ? `translateY(${offset}px)` : undefined,
        transition: offset ? 'none' : 'transform 180ms ease',
      },
      onPointerDown,
      onPointerMove,
      onPointerUp: finish,
      onPointerCancel: finish,
    },
    dragHandle: (
      <div
        aria-label="Swipe down to close"
        data-sheet-drag-handle
        className="mx-auto -mt-2 mb-1 flex h-8 w-20 shrink-0 touch-none items-center justify-center sm:hidden"
      >
        <span aria-hidden="true" className="block h-1 w-10 rounded-full bg-ink/20" />
      </div>
    ),
  };
}

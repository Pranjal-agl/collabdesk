// Motion vocabulary for the desk: things behave like paper and ink.
//  - Odometer: counts roll like a mechanical counter instead of swapping.
//  - Stamp: a rubber stamp that slams onto finished work.
//  - TypingDots: someone's pen is moving.
//  - CuttingMat: a self-healing mat grid that dents under every cursor nearby.
//  - RevealLines: a headline that rises line by line, once, on arrival.

import { useEffect, useRef, type MutableRefObject, type ReactNode } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { cn } from '../lib/utils';

// ---------------------------------------------------------------------------

export function Odometer({ value, className }: { value: number; className?: string }) {
  const digits = String(Math.max(0, Math.floor(value))).split('');
  return (
    <span className={cn('numeric inline-flex overflow-hidden', className)} aria-label={String(value)} role="text">
      {digits.map((digit, index) => (
        <Digit key={digits.length - index} digit={Number(digit)} />
      ))}
    </span>
  );
}

function Digit({ digit }: { digit: number }) {
  return (
    <span className="relative inline-block h-[1em] overflow-hidden leading-none" aria-hidden="true">
      <span className="invisible">0</span>
      <motion.span
        className="absolute inset-x-0 top-0 flex flex-col"
        initial={false}
        animate={{ y: `${-digit * 10}%` }}
        transition={{ type: 'spring', stiffness: 220, damping: 24, mass: 0.8 }}
      >
        {Array.from({ length: 10 }, (_, n) => (
          <span key={n} className="h-[1em] leading-none">
            {n}
          </span>
        ))}
      </motion.span>
    </span>
  );
}

// ---------------------------------------------------------------------------

/** "Done" rubber stamp. `slam` plays the impact; otherwise it rests in place. */
export function Stamp({ slam, className, label = 'Done' }: { slam?: boolean; className?: string; label?: string }) {
  return (
    <motion.span
      aria-hidden="true"
      initial={slam ? { scale: 2.4, opacity: 0, rotate: -24 } : false}
      animate={{ scale: 1, opacity: 1, rotate: -11 }}
      transition={slam ? { type: 'spring', stiffness: 520, damping: 17, mass: 0.9 } : { duration: 0 }}
      className={cn(
        'pointer-events-none inline-flex select-none items-center rounded-[5px] border-[2.5px] border-double border-person-moss px-2 py-0.5 text-person-moss',
        className,
      )}
      style={{ fontFamily: '"Space Mono", monospace', fontWeight: 700, letterSpacing: '0.08em', mixBlendMode: 'multiply' }}
    >
      {label.toUpperCase()}
    </motion.span>
  );
}

// ---------------------------------------------------------------------------

export function TypingDots({ color }: { color?: string }) {
  return (
    <span className="inline-flex items-end gap-[3px]" aria-hidden="true">
      {[0, 1, 2].map((dot) => (
        <motion.span
          key={dot}
          className="h-[5px] w-[5px] rounded-full"
          style={{ backgroundColor: color ?? 'currentColor' }}
          animate={{ y: [0, -4, 0], opacity: [0.45, 1, 0.45] }}
          transition={{ duration: 0.9, repeat: Infinity, delay: dot * 0.15, ease: 'easeInOut' }}
        />
      ))}
    </span>
  );
}

// ---------------------------------------------------------------------------

export function RevealLines({ lines, className, lineClassName, delay = 0 }: { lines: ReactNode[]; className?: string; lineClassName?: string; delay?: number }) {
  return (
    <span className={className}>
      {lines.map((line, index) => (
        <span key={index} className="block overflow-hidden pb-[0.06em]">
          <motion.span
            className={cn('block', lineClassName)}
            initial={{ y: '105%', rotate: 2 }}
            animate={{ y: '0%', rotate: 0 }}
            transition={{ delay: delay + index * 0.09, duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
          >
            {line}
          </motion.span>
        </span>
      ))}
    </span>
  );
}

// ---------------------------------------------------------------------------

export type MatPointer = { x: number; y: number; color: string } | null;

/**
 * A cutting-mat grid drawn on canvas. Grid crossings are pushed away from
 * every pointer passed in (yours, plus any scripted teammate cursor) and
 * spring back afterwards, like a self-healing mat. Static under reduced motion.
 */
export function CuttingMat({ getPointers, className }: { getPointers: () => MatPointer[]; className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const source: MutableRefObject<() => MatPointer[]> = useRef(getPointers);
  source.current = getPointers;
  const reduce = useReducedMotion();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext('2d');
    if (!context) return;

    const GAP = 28;
    const RADIUS = 150;
    let width = 0;
    let height = 0;
    let cols = 0;
    let rows = 0;
    let offsets = new Float32Array(0); // dx, dy, vx, vy per node
    let frame = 0;
    let running = true;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      width = rect.width;
      height = rect.height;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      cols = Math.ceil(width / GAP) + 1;
      rows = Math.ceil(height / GAP) + 1;
      offsets = new Float32Array(cols * rows * 4);
    };

    const draw = () => {
      context.clearRect(0, 0, width, height);
      const active = source.current().filter(Boolean) as NonNullable<MatPointer>[];
      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          const index = (row * cols + col) * 4;
          const baseX = col * GAP;
          const baseY = row * GAP;
          let targetX = 0;
          let targetY = 0;
          let heat = 0;
          let tint: string | null = null;
          for (const pointer of active) {
            const dx = baseX - pointer.x;
            const dy = baseY - pointer.y;
            const distance = Math.hypot(dx, dy);
            if (distance < RADIUS && distance > 0.01) {
              const force = (1 - distance / RADIUS) ** 2;
              targetX += (dx / distance) * force * 14;
              targetY += (dy / distance) * force * 14;
              if (force > heat) {
                heat = force;
                tint = pointer.color;
              }
            }
          }
          if (!reduce) {
            // Spring each crossing toward its displaced target.
            offsets[index + 2] = (offsets[index + 2] + (targetX - offsets[index]) * 0.16) * 0.78;
            offsets[index + 3] = (offsets[index + 3] + (targetY - offsets[index + 1]) * 0.16) * 0.78;
            offsets[index] += offsets[index + 2];
            offsets[index + 1] += offsets[index + 3];
          }
          const x = baseX + offsets[index];
          const y = baseY + offsets[index + 1];
          const major = col % 5 === 0 && row % 5 === 0;
          const size = (major ? 2.2 : 1.3) + heat * 2.2;
          context.globalAlpha = 0.5 + heat * 0.5;
          context.fillStyle = heat > 0.15 && tint ? tint : major ? '#8E998F' : '#A9B3A8';
          context.fillRect(x - size / 2, y - size / 2, size, size);
        }
      }
      context.globalAlpha = 1;
    };

    const loop = () => {
      if (!running) return;
      draw();
      frame = requestAnimationFrame(loop);
    };

    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    if (reduce) draw();
    else frame = requestAnimationFrame(loop);

    const onVisibility = () => {
      running = !document.hidden && !reduce;
      if (running) frame = requestAnimationFrame(loop);
      else cancelAnimationFrame(frame);
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      running = false;
      cancelAnimationFrame(frame);
      observer.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [reduce]);

  return <canvas ref={canvasRef} aria-hidden="true" className={cn('pointer-events-none absolute inset-0 h-full w-full', className)} />;
}

// Soft cursor glow that trails the pointer with spring physics — the tactile
// "the site responds to my hand" layer. Only mounts for fine-pointer devices
// (mouse/trackpad, not touch) and never when the user prefers reduced motion.

import { useEffect, useState } from 'react';
import { motion, useMotionValue, useSpring } from 'framer-motion';

export function CursorGlow() {
  const [enabled, setEnabled] = useState(false);
  const x = useMotionValue(-400);
  const y = useMotionValue(-400);
  const glowX = useSpring(x, { stiffness: 250, damping: 28, mass: 0.6 });
  const glowY = useSpring(y, { stiffness: 250, damping: 28, mass: 0.6 });

  useEffect(() => {
    const fine = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    setEnabled(fine && !reduced);
    if (!fine || reduced) return;

    const move = (event: PointerEvent) => {
      x.set(event.clientX - 250);
      y.set(event.clientY - 250);
    };
    window.addEventListener('pointermove', move, { passive: true });
    return () => window.removeEventListener('pointermove', move);
  }, [x, y]);

  if (!enabled) return null;

  return (
    <motion.div
      aria-hidden="true"
      className="pointer-events-none fixed left-0 top-0 z-0 h-[500px] w-[500px] rounded-full opacity-60"
      style={{
        x: glowX,
        y: glowY,
        background: 'radial-gradient(circle, rgba(99,102,241,0.09) 0%, rgba(34,211,238,0.05) 35%, transparent 65%)',
      }}
    />
  );
}

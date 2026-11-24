// Lenis smooth scrolling for the page. Off when the OS asks for reduced
// motion, and off for touch (native momentum already feels right there).
// Scroll containers that must keep native scrolling carry data-lenis-prevent.

import Lenis from 'lenis';
import 'lenis/dist/lenis.css';

let lenis: Lenis | null = null;

export function startSmoothScroll(): void {
  if (lenis || typeof window === 'undefined') return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  lenis = new Lenis({ autoRaf: true, lerp: 0.11, wheelMultiplier: 0.95, smoothWheel: true });
}

export function scrollToTop(): void {
  if (lenis) lenis.scrollTo(0, { immediate: true });
  else window.scrollTo(0, 0);
}

/** Pause while something modal (palette, menus) owns the scroll wheel. */
export function lockScroll(locked: boolean): void {
  if (!lenis) return;
  if (locked) lenis.stop();
  else lenis.start();
}

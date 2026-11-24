// Live cursors on a board. Each teammate's pointer is relayed over the socket
// (/app/cursor/{projectId} -> /topic/cursors/{projectId}) as x = fraction of
// the board's width and y = px from its top, so it lands in roughly the same
// spot on a different screen size. If they're dragging a card, a ghost copy
// of it rides along under their cursor.

import { useEffect, useRef, useState, type RefObject } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ws } from '../lib/ws';
import type { CursorEvent, Issue } from '../lib/types';
import { firstName, personInk, rememberPerson } from '../lib/utils';
import { PriorityMark } from './ui';

export interface RemoteCursor {
  userId: string;
  name: string;
  x: number;
  y: number;
  dragging: string | null;
  at: number;
}

const STALE_MS = 6000;
const SEND_EVERY_MS = 33;

/** Subscribes to teammates' cursors and broadcasts our own. */
export function useLiveCursors(projectId: string, selfId: string | undefined, boardRef: RefObject<HTMLElement>, dragging: string | null) {
  const [cursors, setCursors] = useState<Record<string, RemoteCursor>>({});
  const draggingRef = useRef(dragging);
  draggingRef.current = dragging;

  // Receive.
  useEffect(() => {
    if (!selfId) return;
    const unsubscribe = ws.subscribe<CursorEvent>(`/topic/cursors/${projectId}`, (event) => {
      if (event.userId === selfId) return;
      rememberPerson(event.userId, event.displayName);
      setCursors((current) => {
        if (event.gone) {
          if (!current[event.userId]) return current;
          const next = { ...current };
          delete next[event.userId];
          return next;
        }
        return {
          ...current,
          [event.userId]: {
            userId: event.userId,
            name: event.displayName,
            x: event.x ?? 0,
            y: event.y ?? 0,
            dragging: event.dragging ?? null,
            at: Date.now(),
          },
        };
      });
    });
    const prune = setInterval(() => {
      setCursors((current) => {
        const now = Date.now();
        const alive = Object.values(current).filter((cursor) => now - cursor.at < STALE_MS);
        return alive.length === Object.keys(current).length ? current : Object.fromEntries(alive.map((cursor) => [cursor.userId, cursor]));
      });
    }, 1000);
    return () => {
      unsubscribe();
      clearInterval(prune);
    };
  }, [projectId, selfId]);

  // Send (throttled). Only on wide layouts, where everyone sees the same four columns.
  useEffect(() => {
    if (!selfId) return;
    const wide = window.matchMedia('(min-width: 1024px)');
    let last = 0;
    let inside = false;
    const send = (body: object) => ws.publish(`/app/cursor/${projectId}`, body);

    const onMove = (event: PointerEvent) => {
      const board = boardRef.current;
      if (!board || !wide.matches) return;
      const rect = board.getBoundingClientRect();
      const x = (event.clientX - rect.left) / rect.width;
      const y = event.clientY - rect.top;
      const within = x >= -0.02 && x <= 1.02 && y >= -140 && y <= rect.height + 40;
      if (!within) {
        if (inside) send({ gone: true });
        inside = false;
        return;
      }
      inside = true;
      const now = performance.now();
      if (now - last < SEND_EVERY_MS) return;
      last = now;
      send({ x: Math.min(1, Math.max(0, x)), y: Math.max(-140, y), dragging: draggingRef.current });
    };
    const onLeave = () => {
      if (inside) send({ gone: true });
      inside = false;
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    document.addEventListener('pointerleave', onLeave);
    window.addEventListener('blur', onLeave);
    return () => {
      window.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerleave', onLeave);
      window.removeEventListener('blur', onLeave);
      send({ gone: true });
    };
  }, [projectId, selfId, boardRef]);

  return cursors;
}

/** Renders remote cursors (and any card they're carrying) over the board. */
export function CursorLayer({ cursors, issues, boardRef }: { cursors: Record<string, RemoteCursor>; issues: Issue[]; boardRef: RefObject<HTMLElement> }) {
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const board = boardRef.current;
    if (!board) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(board);
    return () => observer.disconnect();
  }, [boardRef]);

  if (!width) return null;

  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-30 hidden lg:block">
      <AnimatePresence>
        {Object.values(cursors).map((cursor) => {
          const ink = personInk(cursor.userId);
          const carried = cursor.dragging ? issues.find((issue) => issue.id === cursor.dragging) : undefined;
          return (
            <motion.div
              key={cursor.userId}
              className="absolute left-0 top-0"
              initial={{ opacity: 0, x: cursor.x * width, y: cursor.y, scale: 0.6 }}
              animate={{ opacity: 1, x: cursor.x * width, y: cursor.y, scale: 1 }}
              exit={{ opacity: 0, scale: 0.6 }}
              transition={{ x: { type: 'spring', stiffness: 380, damping: 34, mass: 0.6 }, y: { type: 'spring', stiffness: 380, damping: 34, mass: 0.6 }, opacity: { duration: 0.2 } }}
            >
              <AnimatePresence>
                {carried && (
                  <motion.div
                    key={carried.id}
                    className="absolute left-4 top-10 w-60"
                    initial={{ opacity: 0, scale: 0.9, rotate: 0 }}
                    animate={{ opacity: 0.94, scale: 1.03, rotate: -4 }}
                    exit={{ opacity: 0, scale: 0.92, rotate: 0 }}
                    transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                  >
                    <div className="paper px-3.5 py-3 shadow-lifted" style={{ boxShadow: `inset 3px 0 0 ${ink}, 0 1px 0 #B4BDB2, 0 22px 40px -18px rgba(24,33,28,0.45)` }}>
                      <PriorityMark priority={carried.priority} />
                      <p className="mt-1.5 text-sm font-medium leading-snug">{carried.title}</p>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
              <svg width="18" height="20" viewBox="0 0 18 20" className="relative drop-shadow-sm" style={{ color: ink }}>
                <path d="M1.5 1.5v15l4.2-3.6 2.7 6 2.6-1.2-2.6-5.8h5.6z" fill="currentColor" stroke="#FBFCF8" strokeWidth="1.4" strokeLinejoin="round" />
              </svg>
              <span className="relative -top-1 left-3 inline-block whitespace-nowrap rounded-[4px] px-1.5 py-0.5 text-xs font-semibold text-card" style={{ backgroundColor: ink }}>
                {firstName(cursor.name)}
                {carried ? ' is moving this' : ''}
              </span>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}

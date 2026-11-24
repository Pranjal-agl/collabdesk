// Fixed ambient background. Tiered by capability:
//  - WebGL available + motion allowed  -> lazy-loaded GLSL shader (WebGLAurora)
//  - anything else                     -> the CSS aurora below stays as fallback
// Plus a faint engineering grid, film grain and vignette on top either way.
// Purely decorative: pointer-events none, hidden from screen readers.

import { lazy, Suspense, useEffect, useState } from 'react';

const WebGLAurora = lazy(() => import('./WebGLAurora'));

const NOISE =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.5'/%3E%3C/svg%3E";

export function Background() {
  const [useWebGL, setUseWebGL] = useState(false);

  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) return;
    const probe = document.createElement('canvas');
    const gl = probe.getContext('webgl2') ?? probe.getContext('webgl');
    setUseWebGL(!!gl);
  }, []);

  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-ink-950">
      {/* Shader layer (preferred) */}
      {useWebGL && (
        <Suspense fallback={null}>
          <WebGLAurora />
        </Suspense>
      )}

      {/* CSS aurora: fallback when WebGL/reduced-motion, invisible layer when the
          shader is running (kept mounted for seamless hot fallback) */}
      <div className={useWebGL ? 'hidden' : undefined}>
        <div className="animate-aurora-a absolute -top-40 left-[8%] h-[34rem] w-[34rem] rounded-full bg-indigo-600/20 blur-[130px]" />
        <div className="animate-aurora-b absolute right-[4%] top-[30%] h-[30rem] w-[30rem] rounded-full bg-cyan-500/[0.13] blur-[130px]" />
        <div className="animate-aurora-a absolute bottom-[-20%] left-[35%] h-[28rem] w-[28rem] rounded-full bg-fuchsia-600/[0.11] blur-[140px]" />
      </div>

      {/* Grid */}
      <div
        className="absolute inset-0 opacity-[0.13] [mask-image:radial-gradient(ellipse_75%_65%_at_50%_0%,black,transparent)]"
        style={{
          backgroundImage:
            'linear-gradient(rgba(148,163,184,0.35) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,0.35) 1px, transparent 1px)',
          backgroundSize: '56px 56px',
        }}
      />

      {/* Grain */}
      <div className="absolute inset-0 opacity-[0.05]" style={{ backgroundImage: `url("${NOISE}")` }} />

      {/* Vignette */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_45%,rgba(5,5,8,0.75))]" />
    </div>
  );
}

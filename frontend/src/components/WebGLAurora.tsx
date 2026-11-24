// Hand-written WebGL background: a domain-warped fbm noise shader rendered as a
// single fullscreen triangle — no three.js, no dependencies, ~4KB of code.
// This is the "agency tier" backdrop: liquid color fields instead of CSS blobs.
//
// Performance guardrails, on purpose:
//  - lazy-loaded (React.lazy in Background.tsx) so it never blocks first paint
//  - devicePixelRatio capped at 1.25 — the shader is soft, supersampling is waste
//  - render loop pauses while the tab is hidden
//  - only mounts at all when WebGL exists AND the user hasn't asked for reduced
//    motion; Background.tsx keeps the CSS aurora as the fallback layer

import { useEffect, useRef } from 'react';

const VERT = `
attribute vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
`;

const FRAG = `
precision highp float;
uniform float uTime;
uniform vec2 uRes;
uniform vec2 uMouse;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
    mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x),
    f.y
  );
}

// 5 octaves of fbm — enough richness, still one cheap fragment shader
float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 5; i++) {
    v += a * noise(p);
    p = p * 2.03 + vec2(1.7, 9.2);
    a *= 0.5;
  }
  return v;
}

void main() {
  vec2 uv = gl_FragCoord.xy / uRes.xy;
  vec2 p = uv * vec2(uRes.x / uRes.y, 1.0);
  float t = uTime * 0.045;

  // Domain warping: two rounds of fbm-displaced fbm = liquid color fields
  vec2 q = vec2(fbm(p + t), fbm(p + vec2(5.2, 1.3) - t));
  vec2 r = vec2(
    fbm(p + 2.4 * q + vec2(1.7, 9.2) + 0.14 * uTime),
    fbm(p + 2.4 * q + vec2(8.3, 2.8) - 0.11 * uTime)
  );
  float f = fbm(p + 2.6 * r);

  vec3 ink     = vec3(0.020, 0.020, 0.031); // #050508 base
  vec3 indigo  = vec3(0.243, 0.227, 0.745);
  vec3 cyan    = vec3(0.098, 0.478, 0.635);
  vec3 fuchsia = vec3(0.541, 0.169, 0.631);

  vec3 col = mix(ink, indigo, clamp(f * f * 2.1, 0.0, 1.0));
  col = mix(col, cyan, clamp(length(q) * 0.55, 0.0, 1.0) * 0.45);
  col = mix(col, fuchsia, clamp(r.x * 0.55, 0.0, 1.0) * 0.30);

  // Gentle glow that trails the cursor
  float d = distance(uv, uMouse);
  col += cyan * 0.10 * exp(-d * 4.5);

  // Vignette so UI panels stay readable on top
  col *= 1.0 - 0.50 * smoothstep(0.32, 1.05, distance(uv, vec2(0.5, 0.45)));

  gl_FragColor = vec4(col, 1.0);
}
`;

function compile(gl: WebGLRenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type)!;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error(gl.getShaderInfoLog(shader) ?? 'shader compile failed');
  }
  return shader;
}

export default function WebGLAurora() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const gl = canvas.getContext('webgl', { antialias: false, alpha: false });
    if (!gl) return;

    let program: WebGLProgram;
    try {
      const vs = compile(gl, gl.VERTEX_SHADER, VERT);
      const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
      program = gl.createProgram()!;
      gl.attachShader(program, vs);
      gl.attachShader(program, fs);
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error('link failed');
    } catch {
      return; // Background.tsx CSS aurora remains visible underneath
    }
    gl.useProgram(program);

    // Fullscreen triangle
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const aPos = gl.getAttribLocation(program, 'aPos');
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    const uTime = gl.getUniformLocation(program, 'uTime');
    const uRes = gl.getUniformLocation(program, 'uRes');
    const uMouse = gl.getUniformLocation(program, 'uMouse');

    let raf = 0;
    let running = true;
    const start = performance.now();
    // Smoothed cursor: raw input is jittery, the glow should feel heavy
    let targetX = 0.5;
    let targetY = 0.45;
    let mouseX = 0.5;
    let mouseY = 0.45;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 1.25);
      canvas.width = Math.floor(canvas.clientWidth * dpr);
      canvas.height = Math.floor(canvas.clientHeight * dpr);
      gl.viewport(0, 0, canvas.width, canvas.height);
    };
    resize();
    window.addEventListener('resize', resize);

    const onPointerMove = (event: PointerEvent) => {
      targetX = event.clientX / window.innerWidth;
      targetY = 1 - event.clientY / window.innerHeight;
    };
    window.addEventListener('pointermove', onPointerMove, { passive: true });

    const onVisibility = () => {
      running = document.visibilityState === 'visible';
      if (running) raf = requestAnimationFrame(frame);
    };
    document.addEventListener('visibilitychange', onVisibility);

    const frame = (nowMs: number) => {
      if (!running) return;
      mouseX += (targetX - mouseX) * 0.04;
      mouseY += (targetY - mouseY) * 0.04;
      gl.uniform1f(uTime, (nowMs - start) / 1000);
      gl.uniform2f(uRes, canvas.width, canvas.height);
      gl.uniform2f(uMouse, mouseX, mouseY);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      window.removeEventListener('pointermove', onPointerMove);
      document.removeEventListener('visibilitychange', onVisibility);
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    };
  }, []);

  return <canvas ref={canvasRef} aria-hidden="true" className="absolute inset-0 h-full w-full" />;
}

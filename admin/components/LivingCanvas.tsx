"use client";

import { useEffect, useRef } from "react";

/**
 * Living canvas: three slow-drifting warm gradient orbs.
 * Ported from mythic_labs_landing.html so the dashboard inherits the
 * same atmospheric breath as the public brand site.
 */
export default function LivingCanvas() {
  const ref = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Soft gradients look the same at 1x, and the orbs drift so slowly that
    // 15fps is indistinguishable from 60. Both keep the main thread free for clicks.
    const dpr = 1;
    const FRAME_MS = 66;
    let raf = 0;
    let last = -Infinity;
    let time = 0;
    let w = 0;
    let h = 0;

    const resize = () => {
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const draw = (now = 0) => {
      raf = requestAnimationFrame(draw);
      if (document.hidden || now - last < FRAME_MS) return;
      time += 0.0018 * Math.min(4, (now - last) / 16.7 || 1);
      last = now;
      ctx.clearRect(0, 0, w, h);

      // Three slow-drifting warm orbs at different depths.
      for (let i = 0; i < 3; i++) {
        const cx = w * (0.2 + i * 0.3 + Math.sin(time + i) * 0.1);
        const cy = h * (0.3 + Math.cos(time * 0.7 + i * 2) * 0.2);
        const r = 320 + Math.sin(time + i) * 110;
        const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
        grad.addColorStop(0, "rgba(196, 168, 130, 0.045)");
        grad.addColorStop(1, "rgba(196, 168, 130, 0)");
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, w, h);
      }
    };

    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;

    resize();
    window.addEventListener("resize", resize);
    if (reduceMotion) {
      // Draw a single static frame and stop.
      draw();
      cancelAnimationFrame(raf);
    } else {
      draw();
    }

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return <canvas ref={ref} className="living-canvas" aria-hidden="true" />;
}

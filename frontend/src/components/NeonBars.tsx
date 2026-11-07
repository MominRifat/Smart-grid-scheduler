import { useMemo } from "react";
import { rng, useCanvasLoop } from "./useCanvasLoop";

/**
 * Neon light bars for the hero. Each cluster of bars is a "shop": every couple
 * of seconds one is shed (fades dark) and another is restored - load shedding,
 * drawn in light. A hot white line sweeps across like the generator's pulse.
 */
interface Band { x0: number; x1: number; y0: number; y1: number; hue: number; level: number; on: boolean; seed: number }

const GREEN = [0, 229, 153];
const CYAN = [47, 212, 255];

function mix(t: number, a = GREEN, b = CYAN) {
  return a.map((v, i) => Math.round(v + (b[i] - v) * t));
}

export function NeonBars() {
  const bands = useMemo<Band[]>(() => {
    const r = rng(7);
    return Array.from({ length: 20 }, (_, i) => {
      const x0 = r() * 0.95;
      const y0 = 0.05 + r() * 0.5;
      return {
        x0, x1: Math.min(1, x0 + 0.08 + r() * 0.22),
        y0, y1: Math.min(0.96, y0 + 0.12 + r() * 0.32),
        hue: r(), level: i % 4 === 3 ? 0 : 1, on: i % 4 !== 3, seed: Math.floor(r() * 1e6),
      };
    });
  }, []);

  const ref = useCanvasLoop((ctx, w, h, t) => {
    ctx.clearRect(0, 0, w, h);
    ctx.globalCompositeOperation = "lighter";

    // toggle a band roughly every 1.6 s (deterministic in t)
    const tick = Math.floor(t / 1.6);
    const pick = rng(tick * 31 + 3);
    const target = Math.floor(pick() * bands.length);
    if ((bands as Band[] & { _tick?: number })._tick !== tick) {
      (bands as Band[] & { _tick?: number })._tick = tick;
      bands[target].on = !bands[target].on;
    }

    const gap = 7;
    for (const b of bands) {
      b.level += ((b.on ? 1 : 0) - b.level) * 0.06;
      const xs = Math.floor((b.x0 * w) / gap) * gap;
      const xe = b.x1 * w;
      const r = rng(b.seed);
      for (let x = xs, i = 0; x < xe; x += gap, i++) {
        const jitterTop = r() * 18, jitterBot = r() * 18;
        const flick = 0.55 + 0.45 * Math.sin(t * (1.3 + r() * 2.2) + i * 1.7);
        const a = Math.max(0.04, b.level * flick);
        const [cr, cg, cb] = mix(Math.min(1, b.hue * 0.8 + r() * 0.35));
        const y0 = b.y0 * h + jitterTop, y1 = b.y1 * h - jitterBot;
        // glow passes then a crisp core
        for (const [lw, la] of [[7, 0.06], [3.5, 0.16], [1.6, 0.85]] as const) {
          ctx.strokeStyle = `rgba(${cr},${cg},${cb},${a * la})`;
          ctx.lineWidth = lw;
          ctx.beginPath();
          ctx.moveTo(x + 0.5, y0);
          ctx.lineTo(x + 0.5, y1);
          ctx.stroke();
        }
      }
    }

    // hot white sweep line
    const sx = ((t * 0.07) % 1.2 - 0.1) * w;
    const pulse = 0.65 + 0.35 * Math.sin(t * 9);
    for (const [lw, col] of [[18, "rgba(0,229,153,0.10)"], [7, "rgba(160,255,220,0.30)"], [2, `rgba(255,255,255,${0.9 * pulse})`]] as const) {
      ctx.strokeStyle = col;
      ctx.lineWidth = lw;
      ctx.beginPath();
      ctx.moveTo(sx, h * 0.02);
      ctx.lineTo(sx, h * 0.78);
      ctx.stroke();
    }
    ctx.globalCompositeOperation = "source-over";
  }, [bands]);

  return (
    <div className="neon-bars" aria-hidden="true">
      <canvas ref={ref} />
      <div className="scanlines" />
    </div>
  );
}

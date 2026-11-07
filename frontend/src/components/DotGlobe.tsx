import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { useCanvasLoop } from "./useCanvasLoop";

/**
 * Rotating halftone globe. The shop names are cut into its bands, so the
 * market literally turns in front of you. Points are precomputed once; each
 * frame only rotates and projects them.
 */
function buildPoints(names: string[]) {
  // equirectangular "ink" texture: bands with shop names
  const TW = 1400, TH = 700;
  const tex = document.createElement("canvas");
  tex.width = TW; tex.height = TH;
  const g = tex.getContext("2d");
  const ink: Uint8ClampedArray | null = (() => {
    if (!g) return null;
    g.fillStyle = "#000";
    g.fillRect(0, 0, TW, TH);
    g.fillStyle = "#fff";
    const bands = [0.27, 0.39, 0.51, 0.63];
    bands.forEach((v, bi) => {
      g.fillRect(0, v * TH - 4, TW, 5); // band separator
      g.font = `900 ${Math.round(TH * 0.085)}px "Geist Variable", Arial Black, sans-serif`;
      g.textBaseline = "middle";
      let x = bi * 140;
      let k = bi * 3;
      while (x < TW + 400) {
        const word = (names[k % names.length] || "shop").toUpperCase().replace(/_/g, " ");
        g.fillText(word, x, (v + 0.06) * TH);
        x += g.measureText(word).width + 90;
        k++;
      }
    });
    return g.getImageData(0, 0, TW, TH).data;
  })();

  const pts: number[] = []; // lat, lon, bright
  const step = (1.55 * Math.PI) / 180;
  for (let lat = -Math.PI / 2 + step; lat < Math.PI / 2; lat += step) {
    const n = Math.max(1, Math.round((2 * Math.PI * Math.cos(lat)) / step));
    for (let i = 0; i < n; i++) {
      const lon = (i / n) * 2 * Math.PI;
      let bright = 1;
      if (ink) {
        const u = Math.floor((lon / (2 * Math.PI)) * TW) % TW;
        const v = Math.floor(((Math.PI / 2 - lat) / Math.PI) * TH);
        if (ink[(v * TW + u) * 4] > 100) continue; // carved out
      }
      if (i % Math.max(1, Math.round(n / 14)) === 0) bright = 1.8; // meridian ticks
      pts.push(lat, lon, bright);
    }
  }
  return new Float32Array(pts);
}

interface Props {
  names: string[];
  value?: number;
  fuel?: number;
  budget?: number;
  status?: string;
}

export function DotGlobe({ names, value, fuel, budget, status }: Props) {
  const key = names.join(",");
  const [fontsReady, setFontsReady] = useState(false);
  useEffect(() => { document.fonts?.ready.then(() => setFontsReady(true)).catch(() => undefined); }, []);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const pts = useMemo(() => buildPoints(names), [key, fontsReady]);

  const ref = useCanvasLoop((ctx, w, h, t) => {
    ctx.clearRect(0, 0, w, h);
    const R = Math.min(w * 0.46, h * 0.62);
    const cx = w * 0.62, cy = h * 0.62;
    const rot = -t * 0.12;
    const tilt = -0.32, ct = Math.cos(tilt), st = Math.sin(tilt);
    for (let i = 0; i < pts.length; i += 3) {
      const lat = pts[i], lon = pts[i + 1] + rot, b = pts[i + 2];
      const cl = Math.cos(lat);
      const x = cl * Math.sin(lon);
      const y0 = -Math.sin(lat);
      const z0 = cl * Math.cos(lon);
      const y = y0 * ct - z0 * st;
      const z = y0 * st + z0 * ct;
      if (z < -0.05) continue;
      const shade = Math.min(1, (0.25 + 0.75 * z) * b);
      ctx.fillStyle = `rgba(${210 + 30 * shade | 0},${235 + 20 * shade | 0},${225 + 20 * shade | 0},${shade * 0.85})`;
      const s = 1.05 + z * 0.55;
      ctx.fillRect(cx + x * R, cy + y * R, s, s);
    }
  }, [pts]);

  return (
    <div className="globe-wrap">
      <canvas ref={ref} className="globe" aria-hidden="true" />
      <motion.div
        className="globe-card"
        initial={{ opacity: 0, y: 24 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-80px" }}
        transition={{ duration: 0.7 }}
      >
        <div className="globe-card-bar">Served from one generator</div>
        <div className="globe-card-body">
          <div className="globe-big">{value ?? "—"}</div>
          <div className="globe-sub">
            value served across {names.length} shops
            {fuel !== undefined && budget !== undefined && <> on {fuel.toFixed(2)} of {budget.toFixed(2)} L diesel</>}
            {status === "infeasible" && <> · best effort</>}
          </div>
        </div>
      </motion.div>
    </div>
  );
}

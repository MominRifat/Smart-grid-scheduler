import { useState } from "react";
import { motion } from "framer-motion";
import { NeonBars } from "./NeonBars";

export function Bolt({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M13.5 2 4 14h6.5L9 22l10-13h-6.6z" fill="var(--accent)" />
    </svg>
  );
}

/** Logo: an outlined square whose stroke breaks open at the bottom into a bolt. */
export function Logo({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" className="logo-mark">
      <g fill="none" stroke="#00e599" strokeWidth="4.5" strokeLinejoin="miter" strokeLinecap="butt">
        <path d="M14 29.75H2.25V2.25H29.75V29.75H23.5" />
        <path d="M20.5 8 13.5 17.5H20L15.5 31" />
      </g>
    </svg>
  );
}

function hourRanges(grid: boolean[]): string {
  const out: string[] = [];
  for (let h = 0; h < grid.length; h++) {
    if (grid[h]) continue;
    let e = h;
    while (e + 1 < grid.length && !grid[e + 1]) e++;
    out.push(`${10 + h}:00–${11 + e}:00`);
    h = e;
  }
  return out.join(" and ");
}

export function AnnouncementBar({ grid, budget, status }: { grid?: boolean[]; budget?: number; status?: string }) {
  const text = grid
    ? grid.every(Boolean)
      ? "No load shedding today: everyone runs on the grid"
      : `DESCO load shedding today: ${hourRanges(grid)} · ${Number(budget ?? 0).toFixed(2)} L diesel · ${status === "ok" ? "roster ready" : status === "infeasible" ? "best-effort roster" : "check input"}`
    : "Load-shedding roster for Shapla Shopping Complex · one generator, every hour planned";
  return (
    <a className="announce no-print" href="#board">
      <span className="announce-dots left" aria-hidden="true" />
      <span className="announce-text">{text}</span>
      <span className="announce-chev" aria-hidden="true">›</span>
      <span className="announce-dots right" aria-hidden="true" />
    </a>
  );
}

export function Header({ onPrint, onDownload, canExport }: { onPrint: () => void; onDownload: () => void; canExport: boolean }) {
  return (
    <header className="header no-print">
      <div className="container header-inner">
        <a className="brand" href="#top" aria-label="Who Stays On? home">
          <Logo />
          <span className="wordmark">WHO STAYS ON</span>
        </a>
        <nav className="nav" aria-label="Sections">
          <a href="#input">Input</a>
          <a href="#board">Roster</a>
          <a href="#reasons">Reasons</a>
          <a href="#how">How it works</a>
          <a href="#api">API</a>
        </nav>
        <div className="header-right">
          <button className="btn btn-pill-outline" onClick={onPrint} disabled={!canExport}>Print</button>
          <button className="btn btn-pill-white" onClick={onDownload} disabled={!canExport}>Download JSON</button>
        </div>
      </div>
    </header>
  );
}

export function Hero() {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard?.writeText("curl -X POST http://localhost:8088/api/roster -H 'Content-Type: application/json' --data @inputs/sample_input.json")
      .then(() => { setCopied(true); setTimeout(() => setCopied(false), 1400); })
      .catch(() => undefined);
  };
  return (
    <section className="hero" id="top">
      <NeonBars />
      <div className="container hero-content">
        <motion.h1 initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.9 }}>
          Who stays on <span className="hero-dim">when the grid goes dark.</span>
        </motion.h1>
        <motion.div className="hero-foot" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.9, delay: 0.15 }}>
          <p className="lead">
            One generator, one tank of diesel, twelve shops.<br />
            <span>Every outage hour planned together, every dark shop explained.</span>
          </p>
          <div className="hero-actions">
            <a className="btn-pill-white btn-lg" href="#input">Build a roster</a>
            <a className="btn-pill-outline btn-lg" href="#how">How it works</a>
            <button className="btn-cmd" onClick={copy} aria-label="Copy curl command">
              <span>$ curl -X POST /api/roster</span>
              <span className="btn-cmd-icon" aria-hidden="true">{copied ? "✓" : "⧉"}</span>
            </button>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

export function Footer() {
  return (
    <footer className="footer no-print">
      <div className="container">
        <span>Who Stays On? · built for Rokeya Apa &amp; Monir bhai</span>
        <span className="mono">don't trip the generator</span>
      </div>
    </footer>
  );
}

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

/**
 * Neon-style system diagram: how a request becomes a roster.
 * The orange markers are interactive - hover for a label, click to light up
 * that step's data flow and read what it guarantees in the callout card.
 */

type Key = "check" | "solve" | "explain" | "infeasible" | "output";

const STEPS: Record<Key, { x: number; y: number; label: string; title: string; lines: [string, string]; flows: string[] }> = {
  check: {
    x: 372, y: 100, label: "Input check",
    title: "STRICT INPUT CHECK", lines: ["Every bad field is named", "Litres kept in hundredths"],
    flows: ["M190 278 H 250", "M372 255 V 275"],
  },
  solve: {
    x: 615, y: 145, label: "Whole-day solve",
    title: "ONE PLAN FOR THE DAY", lines: ["All outage hours solved together", "No noon diesel the evening needs"],
    flows: ["M452 220 H 505"],
  },
  explain: {
    x: 861, y: 100, label: "Explain each ✗",
    title: "EVERY ✗ EXPLAINED", lines: ["Re-solve with the shop forced on", "Report the exact value it costs"],
    flows: ["M725 220 H 777"],
  },
  infeasible: {
    x: 615, y: 355, label: "Infeasible days",
    title: "INFEASIBLE, NOT SILENT", lines: ["Names the rule, shops and hours", "Attaches a best-effort roster"],
    flows: ["M615 335 V 355"],
  },
  output: {
    x: 861, y: 485, label: "Same endpoint",
    title: "ONE ENDPOINT FOR ALL", lines: ["Screen and markets share it", "200 ok/infeasible · 400 invalid"],
    flows: ["M861 275 V 300"],
  },
};

function Marker({ k, active, hover, onHover, onClick }: { k: Key; active: boolean; hover: boolean; onHover: (k: Key | null) => void; onClick: (k: Key) => void }) {
  const s = STEPS[k];
  return (
    <g
      className={`arch-marker ${active ? "active" : ""}`}
      transform={`translate(${s.x} ${s.y})`}
      role="button"
      tabIndex={0}
      aria-label={`${s.label}: trace this step`}
      aria-pressed={active}
      onMouseEnter={() => { onHover(k); onClick(k); }}
      onMouseLeave={() => onHover(null)}
      onFocus={() => { onHover(k); onClick(k); }}
      onBlur={() => onHover(null)}
      onClick={() => onClick(k)}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), onClick(k))}
    >
      <rect x="-14" y="-14" width="28" height="28" fill="transparent" />
      {active && <circle r="13" className="arch-ring" />}
      <rect x="-7" y="-7" width="14" height="14" className="arch-plus-box" />
      <path d={active ? "M-3.5 0h7" : "M0 -3.5v7M-3.5 0h7"} stroke="#2a1405" strokeWidth="1.4" />
      {hover && (
        <g transform="translate(0 -22)" pointerEvents="none">
          <rect x={-(s.label.length * 3.6 + 12)} y="-15" width={s.label.length * 7.2 + 24} height="22" fill="#121515" />
          <text textAnchor="middle" y="0" className="arch-tip">{s.label}</text>
        </g>
      )}
    </g>
  );
}

function Art({ k }: { k: Key }) {
  const stroke = "#fff";
  switch (k) {
    case "check":
      return (
        <g>
          {[0, 1, 2].map((i) => (
            <g key={i} transform={`translate(30 ${14 + i * 18})`}>
              <rect width="10" height="10" fill={i === 2 ? "none" : stroke} stroke={stroke} />
              <line x1="18" y1="5" x2={i === 2 ? 90 : 130} y2="5" stroke={stroke} strokeDasharray={i === 2 ? "3 3" : undefined} />
            </g>
          ))}
          <text x="140" y="58" className="arch-art-text">400</text>
        </g>
      );
    case "solve":
      return (
        <g>
          {Array.from({ length: 7 }, (_, i) => (
            <g key={i}>
              <rect x={10 + i * 26} y={34} width="13" height="13" fill={i === 3 ? stroke : "none"} stroke={stroke} />
              {i < 6 && <line x1={23 + i * 26} y1={40.5} x2={36 + i * 26} y2={40.5} stroke={stroke} strokeDasharray="3 3" />}
            </g>
          ))}
          <path d="M16 34 V 14 H 172 V 34" fill="none" stroke="#00e599" strokeDasharray="3 3" className="arch-flow" />
        </g>
      );
    case "explain":
      return (
        <g>
          <text x="22" y="47" className="arch-art-big">✗</text>
          <path d="M52 40 H 112" stroke="#00e599" strokeDasharray="4 4" className="arch-flow" markerEnd="url(#arrowW)" />
          <text x="122" y="47" className="arch-art-text">186→185</text>
        </g>
      );
    case "infeasible":
      return (
        <g>
          <path d="M40 58 L60 20 L80 58 Z" fill="none" stroke={stroke} />
          <line x1="60" y1="33" x2="60" y2="46" stroke={stroke} />
          <circle cx="60" cy="52" r="1.5" fill={stroke} />
          <text x="98" y="44" className="arch-art-text">17.60 &gt; 17.00</text>
        </g>
      );
    case "output":
      return (
        <g>
          <text x="22" y="48" className="arch-art-big">{"{ }"}</text>
          <path d="M70 40 H 120" stroke="#00e599" strokeDasharray="4 4" className="arch-flow" />
          <rect x="126" y="28" width="48" height="24" fill="none" stroke={stroke} />
          <text x="150" y="44" textAnchor="middle" className="arch-art-text">200</text>
        </g>
      );
  }
}

export function Architecture() {
  const [active, setActive] = useState<Key>("solve");
  const [hover, setHover] = useState<Key | null>(null);
  const step = STEPS[active];
  const CARD = { x: 8, y: 352, w: 232, h: 196 };

  return (
    <motion.div className="arch" initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-80px" }} transition={{ duration: 0.7 }}>
      <svg viewBox="0 0 1000 560" role="group" aria-label="Engine architecture. Orange markers are buttons that highlight each step.">
        <defs>
          <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0 0L10 5L0 10z" fill="#1d2b26" />
          </marker>
          <marker id="arrowW" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
            <path d="M0 0L10 5L0 10z" fill="#00e599" />
          </marker>
          <pattern id="hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="6" stroke="#9fc9b6" strokeWidth="1" />
          </pattern>
        </defs>

        {/* market */}
        <rect x="20" y="250" width="170" height="56" fill="#f6fbf9" stroke="#1d2b26" strokeWidth="1.2" />
        <rect x="36" y="269" width="24" height="18" fill="none" stroke="#1d2b26" />
        <line x1="36" y1="274" x2="60" y2="274" stroke="#1d2b26" />
        <text x="72" y="284" className="arch-title" style={{ textAnchor: "start" }}>Your market</text>
        <text x="220" y="266" className="arch-mono" textAnchor="middle">POST</text>

        {/* engine frame */}
        <rect x="255" y="40" width="725" height="490" fill="#d7ece3" stroke="#1d2b26" strokeWidth="1.2" />
        <text x="277" y="72" className="arch-big">Who Stays On? engine</text>
        {/* link from the callout card to the active marker, drawn behind the boxes */}
        <motion.path
          key={`link-${active}`}
          d={`M${CARD.x + CARD.w} ${CARD.y + 40} L ${step.x} ${step.y}`}
          stroke="#121515" strokeWidth="1.2" fill="none"
          initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.5 }}
        />

        <text x="960" y="72" className="arch-mono" textAnchor="end">/api/roster · offline</text>

        {/* check */}
        <rect x="277" y="100" width="190" height="400" fill="none" stroke="#5f7d71" strokeDasharray="4 4" />
        <text x="295" y="128" className="arch-label">Check</text>
        <rect x="292" y="145" width="160" height="110" fill="#bfe3d3" stroke="#1d2b26" strokeWidth="1.2" />
        <rect x="292" y="145" width="160" height="24" fill="#e6f3ed" stroke="#1d2b26" strokeWidth="1.2" />
        <text x="372" y="161" className="arch-head">validate.py</text>
        <text x="372" y="204" className="arch-title">Format</text>
        <text x="372" y="224" className="arch-mono" textAnchor="middle">fields · lengths</text>
        <rect x="292" y="275" width="160" height="100" fill="#e6f3ed" stroke="#1d2b26" strokeWidth="1.2" />
        <text x="372" y="320" className="arch-title">Litres → 0.01 L</text>
        <text x="372" y="340" className="arch-sub">integers, no float error</text>
        <rect x="292" y="395" width="160" height="90" fill="#d7ece3" />
        <rect x="292" y="395" width="160" height="90" fill="url(#hatch)" stroke="#1d2b26" strokeOpacity=".4" />
        <text x="372" y="436" className="arch-title arch-faint">invalid_input</text>
        <text x="372" y="456" textAnchor="middle" className="arch-mono arch-faint">HTTP 400 + field</text>

        {/* decide */}
        <rect x="490" y="100" width="250" height="400" fill="none" stroke="#5f7d71" strokeDasharray="4 4" />
        <text x="508" y="128" className="arch-label">Decide</text>
        <rect x="505" y="145" width="220" height="190" fill="#bfe3d3" stroke="#1d2b26" strokeWidth="1.2" />
        <rect x="505" y="145" width="220" height="24" fill="#e6f3ed" stroke="#1d2b26" strokeWidth="1.2" />
        <text x="615" y="161" className="arch-head">solver.py · CP-SAT</text>
        <text x="615" y="198" className="arch-title">Whole-day plan</text>
        <text x="615" y="217" className="arch-mono" textAnchor="middle">max value, then less diesel</text>
        {["capacity ≤ kW", "fuel per hour", "mandatory on", "dark ≤ max run"].map((t, i) => (
          <g key={t} transform={`translate(${517 + (i % 2) * 101} ${238 + Math.floor(i / 2) * 38})`}>
            <rect width="95" height="28" fill="#f6fbf9" stroke="#1d2b26" strokeOpacity=".6" />
            <text x="47.5" y="18" textAnchor="middle" className="arch-chip">{t}</text>
          </g>
        ))}
        <rect x="505" y="355" width="220" height="130" fill="#d7ece3" />
        <rect x="505" y="355" width="220" height="130" fill="url(#hatch)" stroke="#1d2b26" strokeOpacity=".4" />
        <text x="615" y="408" className="arch-title arch-faint">diagnose.py</text>
        <text x="615" y="428" textAnchor="middle" className="arch-mono arch-faint">infeasible → which rule</text>
        <text x="615" y="446" textAnchor="middle" className="arch-mono arch-faint">+ best-effort roster</text>

        {/* explain */}
        <rect x="762" y="100" width="198" height="400" fill="none" stroke="#5f7d71" strokeDasharray="4 4" />
        <text x="780" y="128" className="arch-label">Explain</text>
        <rect x="777" y="145" width="168" height="130" fill="#bfe3d3" stroke="#1d2b26" strokeWidth="1.2" />
        <rect x="777" y="145" width="168" height="24" fill="#e6f3ed" stroke="#1d2b26" strokeWidth="1.2" />
        <text x="861" y="161" className="arch-head">explain.py</text>
        <text x="861" y="214" className="arch-title">Re-solve per ✗</text>
        <text x="861" y="234" className="arch-mono" textAnchor="middle">force on → value drop</text>
        <rect x="777" y="300" width="168" height="185" fill="#bfe3d3" stroke="#1d2b26" strokeWidth="1.2" />
        <rect x="777" y="300" width="168" height="24" fill="#e6f3ed" stroke="#1d2b26" strokeWidth="1.2" />
        <text x="861" y="316" className="arch-head">Output</text>
        <text x="861" y="392" className="arch-title">Roster JSON</text>
        <text x="861" y="412" className="arch-mono" textAnchor="middle">status · totals</text>
        <text x="861" y="428" className="arch-mono" textAnchor="middle">reasons per ✗</text>

        {/* connectors (base) */}
        {["M190 278 H 250", "M372 255 V 275", "M452 220 H 505", "M725 220 H 777", "M861 275 V 300", "M615 335 V 355"].map((d) => (
          <path key={d} d={d} fill="none" stroke="#1d2b26" strokeWidth="1.3" markerEnd="url(#arrow)" />
        ))}
        <text x="478" y="208" className="arch-mono arch-arrow-label" textAnchor="middle">ok</text>
        <text x="751" y="208" className="arch-mono arch-arrow-label" textAnchor="middle">plan</text>

        {/* highlighted flow for the active step */}
        <AnimatePresence>
          {step.flows.map((d) => (
            <motion.path key={active + d} d={d} fill="none" className="arch-flow-hot" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />
          ))}
        </AnimatePresence>

        {/* callout card linked to the active marker */}
        <g transform={`translate(${CARD.x} ${CARD.y})`}>
          <rect width={CARD.w} height={CARD.h} fill="#121515" />
          <rect x="8" y="8" width={CARD.w - 16} height="84" fill="#262a29" />
          <path d={`M12 12h8M12 12v8M${CARD.w - 12} 12h-8M${CARD.w - 12} 12v8M12 88h8M12 88v-8M${CARD.w - 12} 88h-8M${CARD.w - 12} 88v-8`} stroke="#9aa3a0" />
          <AnimatePresence mode="wait">
            <motion.g key={active} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
              <g transform="translate(8 14)"><Art k={active} /></g>
              <text x="12" y="122" className="arch-card-title">{step.title}</text>
              <text x="12" y="148" className="arch-card-line">{step.lines[0]}</text>
              <text x="12" y="166" className="arch-card-line">{step.lines[1]}</text>
            </motion.g>
          </AnimatePresence>
        </g>

        {(Object.keys(STEPS) as Key[]).map((k) => (
          <Marker key={k} k={k} active={active === k} hover={hover === k} onHover={setHover} onClick={setActive} />
        ))}
      </svg>
      <p className="arch-hint">Hover a <span className="arch-hint-plus">+</span> to trace that step</p>
    </motion.div>
  );
}

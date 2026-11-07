import { useEffect, useMemo, useRef, useState } from "react";
import { animate, motion, useInView } from "framer-motion";
import type { Board } from "../lib/board";
import type { Conflict, RosterBlock } from "../lib/types";
import { HOURS } from "../lib/types";
import type { Selected } from "./RosterBoard";

export function Reveal({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) {
  return (
    <motion.div initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-40px" }} transition={{ duration: 0.6, delay }}>
      {children}
    </motion.div>
  );
}

export function CountUp({ value, decimals = 0 }: { value: number; decimals?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });
  useEffect(() => {
    if (!inView || !ref.current) return;
    const node = ref.current;
    const controls = animate(0, value, {
      duration: 0.9,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (v) => { node.textContent = v.toFixed(decimals); },
    });
    return () => controls.stop();
  }, [value, decimals, inView]);
  return <span ref={ref}>{value.toFixed(decimals)}</span>;
}

interface StatsProps {
  status: "ok" | "infeasible";
  block: RosterBlock;
  budget: number;
  optimal?: boolean;
  solver?: string;
  ms: number;
}

export function Stats({ status, block, budget, optimal, solver, ms }: StatsProps) {
  const pct = budget > 0 ? Math.min(100, (block.fuel_total_litres / budget) * 100) : 0;
  const totalDark = Object.values(block.dark_hours).reduce((a, b) => a + b, 0);
  return (
    <div className="stats">
      <div className="card stat">
        <div className="label">Status</div>
        <div style={{ marginTop: 12 }}>
          {status === "ok" ? <span className="badge badge-ok">● ok</span> : <span className="badge badge-bad">● infeasible</span>}
        </div>
        <div className="hint" style={{ marginTop: 10 }}>
          {status === "ok" ? (optimal ? "proven optimal" : solver === "backup" ? "backup solver" : "best found in time") : "best-effort shown"} · {ms} ms
        </div>
      </div>
      <div className="card stat">
        <div className="label">Total value</div>
        <div className="num"><CountUp value={block.value_total} /></div>
      </div>
      <div className="card stat">
        <div className="label">Diesel used</div>
        <div className="num"><CountUp value={block.fuel_total_litres} decimals={2} /><small>/ {budget.toFixed(2)} L</small></div>
        <div className={`meter ${pct > 98 ? "warn" : ""}`}><motion.i initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.9 }} /></div>
      </div>
      <div className="card stat">
        <div className="label">Outage hours</div>
        <div className="num"><CountUp value={block.roster.length} /><small>/ 10</small></div>
      </div>
      <div className="card stat">
        <div className="label">Shop-hours dark</div>
        <div className="num"><CountUp value={totalDark} /></div>
      </div>
    </div>
  );
}

export function ReasonList({ block, selected, onSelect }: { block: RosterBlock; selected: Selected | null; onSelect: (s: Selected | null) => void }) {
  const [filter, setFilter] = useState<string | null>(null);
  const shops = useMemo(() => Object.keys(block.dark_hours).filter((s) => block.dark_hours[s] > 0), [block]);
  const items = useMemo(
    () => block.roster.flatMap((r) => r.dark.map((d) => ({ ...d, slot: r.slot }))).filter((d) => !filter || d.id === filter),
    [block, filter],
  );
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!selected || !listRef.current) return;
    const el = listRef.current.querySelector(`[data-key="${selected.shop}@${selected.slot}"]`);
    el?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [selected]);

  return (
    <div className="card" id="reasons">
      <div className="card-pad" style={{ paddingBottom: 6 }}>
        <div className="label">Every ✗, explained</div>
        <h3 className="section-title" style={{ fontSize: 18 }}>Why is it dark?</h3>
      </div>
      <div className="filter-row">
        <button className="fchip" aria-pressed={filter === null} onClick={() => setFilter(null)}>All</button>
        {shops.map((s) => (
          <button key={s} className="fchip" aria-pressed={filter === s} onClick={() => setFilter(filter === s ? null : s)}>
            {s} · {block.dark_hours[s]}
          </button>
        ))}
      </div>
      <div className="reasons" ref={listRef}>
        {items.length === 0 && <div className="empty">Nobody is dark. Every shop is powered every outage hour.</div>}
        {items.map((d) => {
          const isSel = selected?.shop === d.id && selected.slot === d.slot;
          return (
            <div
              key={`${d.id}@${d.slot}`}
              data-key={`${d.id}@${d.slot}`}
              className="reason"
              data-selected={isSel}
              onClick={() => onSelect(isSel ? null : { shop: d.id, slot: d.slot })}
            >
              <div className="when">{HOURS[d.slot]}</div>
              <div>
                <div className="who"><span style={{ color: "var(--danger)" }}>✗</span> {d.id}</div>
                <div className="why">{d.reason}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Running diesel vs budget across the day - shows the evening is protected. */
export function FuelChart({ board }: { board: Board }) {
  const W = 560, H = 230, P = { l: 40, r: 16, t: 18, b: 30 };
  const budget = Number(board.hours[0]?.budget ?? 0);
  const maxY = Math.max(budget, ...board.hours.map((h) => h.running)) * 1.12 || 1;
  const x = (i: number) => P.l + (i * (W - P.l - P.r)) / 9;
  const y = (v: number) => H - P.b - (v / maxY) * (H - P.t - P.b);
  const pts = board.hours.map((h, i) => `${x(i)},${y(h.running)}`);
  const area = `M${x(0)},${y(0)} L${pts.join(" L")} L${x(9)},${y(0)} Z`;
  const ticks = [0, budget / 2, budget];
  return (
    <div className="card chart">
      <div className="card-pad" style={{ paddingBottom: 0 }}>
        <div className="label">Diesel across the day</div>
        <h3 className="section-title" style={{ fontSize: 18 }}>Running total vs budget</h3>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Running fuel total by hour against budget">
        <defs>
          <linearGradient id="fuelArea" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="#00e599" stopOpacity=".28" />
            <stop offset="1" stopColor="#00e599" stopOpacity="0" />
          </linearGradient>
        </defs>
        {board.hours.map((h, i) => !h.outage && (
          <rect key={i} x={x(i) - (W - P.l - P.r) / 18} y={P.t} width={(W - P.l - P.r) / 9} height={H - P.t - P.b} fill="rgba(255,255,255,.025)" />
        ))}
        {ticks.map((t, i) => (
          <g key={i}>
            <line x1={P.l} x2={W - P.r} y1={y(t)} y2={y(t)} stroke="rgba(255,255,255,.06)" />
            <text x={P.l - 8} y={y(t) + 3} textAnchor="end">{t.toFixed(t % 1 ? 1 : 0)}</text>
          </g>
        ))}
        <line x1={P.l} x2={W - P.r} y1={y(budget)} y2={y(budget)} stroke="#ffb547" strokeDasharray="4 4" />
        <text x={W - P.r} y={y(budget) - 6} textAnchor="end" style={{ fill: "#ffb547" }}>budget {budget.toFixed(2)} L</text>
        <motion.path d={area} fill="url(#fuelArea)" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.8, delay: 0.3 }} />
        <motion.polyline
          points={pts.join(" ")}
          fill="none"
          stroke="#00e599"
          strokeWidth="2"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 1.1 }}
        />
        {board.hours.map((h, i) => h.outage && (
          <circle key={i} cx={x(i)} cy={y(h.running)} r="3.5" fill="#060807" stroke="#00e599" strokeWidth="1.5">
            <title>{`${HOURS[i]}: +${h.fuel.toFixed(2)} L → ${h.running.toFixed(2)} L`}</title>
          </circle>
        ))}
        {board.hours.map((_, i) => (
          <text key={i} x={x(i)} y={H - 10} textAnchor="middle">{HOURS[i].slice(0, 2)}</text>
        ))}
      </svg>
    </div>
  );
}

export function InfeasibleAlert({ message, conflicts, violations }: { message: string; conflicts: Conflict[]; violations: { rule: string; shop: string; hours: string[] }[] }) {
  return (
    <motion.div className="alert alert-bad" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <span className="badge badge-bad">infeasible</span>
        <h3>No roster can keep every rule today</h3>
      </div>
      {conflicts.length === 0 && <div style={{ color: "var(--muted)", fontSize: 14 }}>{message}</div>}
      {conflicts.map((c, i) => (
        <div className="conflict" key={i}>
          <span className="mono" style={{ color: "var(--danger)" }}>{c.rule}</span> — {c.detail}
          <div className="tags">
            {c.shops.slice(0, 14).map((s) => <span key={s} className="badge badge-muted" style={{ textTransform: "none" }}>{s}</span>)}
            {c.hours.length > 0 && <span className="badge badge-warn">{c.hours[0]}–{c.hours[c.hours.length - 1]}</span>}
          </div>
        </div>
      ))}
      {violations.length > 0 && (
        <div className="alert alert-warn" style={{ marginTop: 4 }}>
          <b style={{ fontSize: 14 }}>Best-effort roster below (labelled). It keeps capacity and diesel, and breaks only:</b>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13.5, color: "var(--muted)" }}>
            {violations.map((v, i) => (
              <li key={i}><span className="mono">{v.rule}</span>: {v.shop} at {v.hours.join(", ")}</li>
            ))}
          </ul>
        </div>
      )}
    </motion.div>
  );
}

export function InvalidAlert({ field, message, httpStatus }: { field: string; message: string; httpStatus: number }) {
  return (
    <motion.div className="alert alert-bad" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} role="alert">
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <span className="badge badge-bad">invalid_input · HTTP {httpStatus}</span>
        <h3>The input doesn't match the format</h3>
      </div>
      <div>Field <code style={{ color: "var(--danger)" }}>{field}</code></div>
      <div className="mono" style={{ color: "var(--muted)" }}>{message}</div>
    </motion.div>
  );
}

export function DarkHoursBars({ block }: { block: RosterBlock }) {
  const max = Math.max(1, block.roster.length);
  const entries = Object.entries(block.dark_hours).sort((a, b) => b[1] - a[1]);
  return (
    <div className="card">
      <div className="card-pad" style={{ paddingBottom: 12 }}>
        <div className="label">Fairness</div>
        <h3 className="section-title" style={{ fontSize: 18 }}>Dark hours per shop</h3>
      </div>
      <div className="hbars">
        {entries.map(([id, n], i) => (
          <div className="hbar" key={id}>
            <span className="name" title={id}>{id}</span>
            <span className="track">
              <motion.i initial={{ width: 0 }} whileInView={{ width: `${(n / max) * 100}%` }} viewport={{ once: true }} transition={{ duration: 0.7, delay: i * 0.03 }} />
            </span>
            <span className="n">{n}/{max}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

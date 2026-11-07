import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { runGreedy } from "../lib/greedy";
import type { Board } from "../lib/board";
import type { RosterBlock, RosterInput } from "../lib/types";
import { HOURS } from "../lib/types";

type Mode = "blackouts" | "diesel";

interface Series { slot: number; outage: boolean; v: number; bad?: boolean }

function Panel({ title, series, max, limit, limitLabel, good, card, idPrefix }: {
  title: string; series: Series[]; max: number; limit: number; limitLabel: string; good: boolean;
  card: { head: string; rows: [string, string, boolean?][] }; idPrefix: string;
}) {
  const W = 520, H = 300, top = 34, bottom = H - 6;
  const x = (i: number) => (i * W) / 10;
  const y = (v: number) => bottom - (v / max) * (bottom - top - 50);
  // stepped area across hours
  let d = `M0 ${bottom}`;
  series.forEach((s, i) => { d += ` L${x(i)} ${y(s.v)} L${x(i + 1)} ${y(s.v)}`; });
  d += ` L${W} ${bottom} Z`;
  const badIdx = series.findIndex((s) => s.bad);
  const color = good ? "#00e599" : "#ff5f5f";
  return (
    <div className={`cmp-panel ${good ? "good" : "bad"}`}>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
        <defs>
          <pattern id={`${idPrefix}-stripes`} width="5" height="10" patternUnits="userSpaceOnUse">
            <line x1="0.5" y1="0" x2="0.5" y2="10" stroke="rgba(255,255,255,.07)" />
          </pattern>
          <pattern id={`${idPrefix}-dots`} width="6" height="6" patternUnits="userSpaceOnUse">
            <circle cx="1.5" cy="1.5" r="1" fill={color} fillOpacity=".55" />
          </pattern>
        </defs>
        <rect x="0" y={y(limit)} width={W} height={bottom - y(limit)} fill={`url(#${idPrefix}-stripes)`} />
        <line x1="0" x2={W} y1={y(limit)} y2={y(limit)} stroke="rgba(255,255,255,.25)" strokeDasharray="2 4" />
        <text x="10" y={y(limit) - 8} className="cmp-axis">{limitLabel}</text>
        {series.map((s, i) => !s.outage && <rect key={i} x={x(i)} y={top} width={W / 10} height={bottom - top} fill="rgba(255,255,255,.025)" />)}
        <motion.path
          d={d}
          fill={`url(#${idPrefix}-dots)`}
          stroke={color}
          strokeWidth="1.5"
          initial={{ clipPath: "inset(0 100% 0 0)" }}
          whileInView={{ clipPath: "inset(0 0% 0 0)" }}
          viewport={{ once: true }}
          transition={{ duration: 1.4, ease: "easeInOut" }}
        />
        {badIdx >= 0 && (
          <motion.rect
            x={x(badIdx)} y={top} width={W / 10} height={bottom - top} fill="rgba(255,95,95,.18)"
            animate={{ opacity: [0.3, 1, 0.3] }} transition={{ duration: 1.6, repeat: Infinity }}
          />
        )}
        {series.map((s, i) => <text key={i} x={x(i) + W / 20} y={H - 12} textAnchor="middle" className="cmp-axis">{HOURS[s.slot].slice(0, 2)}</text>)}
      </svg>
      <div className="cmp-title">{title}</div>
      <motion.div
        className="cmp-card"
        initial={{ opacity: 0, y: 8 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ delay: 1.2, duration: 0.5 }}
      >
        <div className="cmp-card-head"><span className={good ? "ok" : "warn"}>{good ? "●" : "▲"}</span> {card.head}</div>
        {card.rows.map(([k, v, hot]) => (
          <div key={k} className="cmp-row"><span>{k}</span><b className={hot ? (good ? "ok" : "warn") : ""}>{v}</b></div>
        ))}
      </motion.div>
    </div>
  );
}

export function Comparison({ input, block, board }: { input: RosterInput; block: RosterBlock; board: Board }) {
  const [mode, setMode] = useState<Mode>("blackouts");
  const greedy = useMemo(() => runGreedy(input), [input]);
  const budget = Number(input.fuel_budget_litres);
  const cap = input.generator_capacity_kw;
  const lastRunning = board.hours.reduce((a, h) => (h.outage ? h.running : a), 0);

  const g: Series[] = greedy.hours.map((h) => ({
    slot: h.slot, outage: h.outage, v: mode === "blackouts" ? h.load : h.running, bad: greedy.exhaustedAt === h.slot,
  }));
  const p: Series[] = board.hours.map((h) => ({ slot: h.slot, outage: h.outage, v: mode === "blackouts" ? h.load : h.running }));
  const max = mode === "blackouts" ? cap * 1.15 : Math.max(budget, greedy.fuel, lastRunning) * 1.12 || 1;
  const limit = mode === "blackouts" ? cap : budget;
  const limitLabel = mode === "blackouts" ? `${cap} kW capacity` : `${budget.toFixed(2)} L budget`;

  const exhausted = greedy.exhaustedAt !== null ? HOURS[greedy.exhaustedAt] : null;
  const valueGain = block.value_total - greedy.value;

  return (
    <div className="cmp">
      <div className="cmp-tabs" role="tablist">
        {(["blackouts", "diesel"] as Mode[]).map((m) => (
          <button key={m} role="tab" aria-selected={mode === m} className="cmp-tab" onClick={() => setMode(m)}>
            {m === "blackouts" ? "Avoid blackouts" : "Save diesel"}
          </button>
        ))}
      </div>
      <AnimatePresence mode="wait">
        <motion.div key={mode} className="cmp-grid" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}>
          <Panel
            idPrefix="g"
            title="Hour-by-hour greedy"
            series={g}
            max={max}
            limit={limit}
            limitLabel={limitLabel}
            good={false}
            card={exhausted
              ? { head: "Diesel exhausted", rows: [["Generator stops:", exhausted, true], ["Mandatory shops:", "Dark", true], ["Rule breaks:", String(greedy.ruleBreaks), true]] }
              : { head: greedy.ruleBreaks ? "Rules broken" : "Short-sighted", rows: [["Value:", String(greedy.value)], ["Diesel:", `${greedy.fuel.toFixed(2)} L`], ["Rule breaks:", String(greedy.ruleBreaks), greedy.ruleBreaks > 0]] }}
          />
          <Panel
            idPrefix="p"
            title="Whole-day plan"
            series={p}
            max={max}
            limit={limit}
            limitLabel={limitLabel}
            good
            card={{ head: "Plan active", rows: [["Diesel left:", `${Math.max(0, budget - block.fuel_total_litres).toFixed(2)} L`, true], ["Value served:", String(block.value_total)], ["Status:", "Stable"]] }}
          />
        </motion.div>
      </AnimatePresence>
      <div className="cmp-strip">
        {greedy.ruleBreaks > 0 && valueGain < 0
          ? <>Greedy reaches <b>{greedy.value}</b> only by breaking <b>{greedy.ruleBreaks}</b> rules · the plan keeps every rule at <b>{block.value_total}</b></>
          : <><b>+{Math.max(0, valueGain)}</b> value and <b>{greedy.ruleBreaks}</b> rule breaks avoided by planning the whole day</>}
      </div>
      <div className="cmp-legend">
        <span><i className="lg-plan" /> Whole-day plan</span>
        <span><i className="lg-greedy" /> Greedy baseline</span>
        <span><i className="lg-limit" /> {mode === "blackouts" ? "Generator capacity" : "Diesel budget"}</span>
        <p>Computed live from the input on screen: the greedy side is the brief's "obvious start", the plan side is the API's answer.</p>
      </div>
    </div>
  );
}

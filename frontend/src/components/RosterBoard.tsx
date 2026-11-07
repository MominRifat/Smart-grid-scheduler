import { useState } from "react";
import { motion } from "framer-motion";
import type { Board } from "../lib/board";
import { HOURS } from "../lib/types";

export interface Selected {
  shop: string;
  slot: number;
}

interface Props {
  board: Board;
  selected: Selected | null;
  onSelect: (s: Selected | null) => void;
  violations?: Set<string>; // "shop@slot" cells that break a rule (best-effort only)
}

interface Tip {
  x: number;
  y: number;
  shop: string;
  hour: string;
  reason: string;
}

export function RosterBoard({ board, selected, onSelect, violations }: Props) {
  const [tip, setTip] = useState<Tip | null>(null);

  const showTip = (e: React.MouseEvent | React.FocusEvent, shop: string, slot: number, reason: string) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const x = Math.min(r.left + r.width / 2, window.innerWidth - 200);
    setTip({ x: Math.max(x, 200), y: r.bottom + 10, shop, hour: HOURS[slot], reason });
  };

  return (
    <div className="board-wrap">
      <table className="board" aria-label="Roster board">
        <colgroup>
          <col className="c-shop" />
          {board.hours.map((h) => <col key={h.slot} />)}
          <col className="c-dark" />
        </colgroup>
        <thead>
          <tr>
            <th className="shop-h">Shop</th>
            {board.hours.map((h) => (
              <th key={h.slot} className={h.outage ? "outage-h" : ""} scope="col">
                {HOURS[h.slot]}
                <span className="hsub">{h.outage ? "outage" : "grid"}</span>
              </th>
            ))}
            <th scope="col" style={{ paddingInline: 18 }}>Dark h</th>
          </tr>
        </thead>
        <tbody>
          {board.rows.map((row, ri) => (
            <tr key={row.id}>
              <td className="shop">
                <span className="shop-name">{row.id}</span>
                {row.mandatory && <span className="star" title="Mandatory: on every outage hour" aria-label="mandatory">★</span>}
                <span className="shop-meta">{row.kw} kW</span>
              </td>
              {row.cells.map((c) => {
                const isSel = selected?.shop === row.id && selected.slot === c.slot;
                const viol = violations?.has(`${row.id}@${c.slot}`);
                return (
                  <td key={c.slot} className="cell">
                    <motion.div
                      initial={{ opacity: 0, scale: 0.85 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ duration: 0.35, delay: Math.min(ri * 0.025 + c.slot * 0.018, 0.6) }}
                      className={`chip chip-${c.kind}${viol ? " chip-viol" : ""}`}
                      data-selected={isSel}
                      role={c.kind === "off" ? "button" : undefined}
                      tabIndex={c.kind === "off" ? 0 : undefined}
                      aria-label={
                        c.kind === "grid" ? `${row.id} ${HOURS[c.slot]} grid` :
                        c.kind === "on" ? `${row.id} ${HOURS[c.slot]} powered` :
                        `${row.id} ${HOURS[c.slot]} dark: ${c.reason}`
                      }
                      onMouseEnter={c.kind === "off" ? (e) => showTip(e, row.id, c.slot, c.reason ?? "") : undefined}
                      onMouseLeave={() => setTip(null)}
                      onFocus={c.kind === "off" ? (e) => showTip(e, row.id, c.slot, c.reason ?? "") : undefined}
                      onBlur={() => setTip(null)}
                      onClick={c.kind === "off" ? () => onSelect(isSel ? null : { shop: row.id, slot: c.slot }) : undefined}
                      onKeyDown={c.kind === "off" ? (e) => e.key === "Enter" && onSelect({ shop: row.id, slot: c.slot }) : undefined}
                    >
                      {c.kind === "grid" ? "grid" : c.kind === "on" ? "✓" : "✗"}
                    </motion.div>
                  </td>
                );
              })}
              <td className="darkcount">
                <span className={row.longestRun > 0 && row.darkHours > 0 ? "num-strong" : ""}>{row.darkHours}</span>
                <span className="run">{row.mandatory ? "mandatory" : `max run ${row.longestRun}`}</span>
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td className="shop">Load / capacity</td>
            {board.hours.map((h) => (
              <td key={h.slot}>
                {h.outage ? (
                  <>
                    <div className={`bar no-print ${h.load === h.capacity ? "full" : ""}`} title={`${h.load} of ${h.capacity} kW`}>
                      <motion.i initial={{ height: 0 }} animate={{ height: `${(h.load / Math.max(h.capacity, 1)) * 100}%` }} transition={{ duration: 0.7, delay: 0.2 + h.slot * 0.04 }} />
                    </div>
                    <span className={h.load > h.capacity ? "over" : "num-strong"}>{h.load}</span>/{h.capacity} kW
                  </>
                ) : "–"}
              </td>
            ))}
            <td />
          </tr>
          <tr>
            <td className="shop">Fuel this hour</td>
            {board.hours.map((h) => <td key={h.slot}>{h.outage ? <span className="num-strong">{h.fuel.toFixed(2)} L</span> : "–"}</td>)}
            <td />
          </tr>
          <tr>
            <td className="shop">Running / budget</td>
            {board.hours.map((h) => (
              <td key={h.slot}>
                {h.outage ? (
                  <>
                    <span className={h.running > h.budget ? "over" : "num-strong"}>{h.running.toFixed(2)}</span>/{Number(h.budget).toFixed(2)}
                  </>
                ) : "–"}
              </td>
            ))}
            <td />
          </tr>
          <tr>
            <td className="shop">Value served</td>
            {board.hours.map((h) => <td key={h.slot}>{h.outage ? <span className="num-strong">{h.value}</span> : "–"}</td>)}
            <td />
          </tr>
        </tfoot>
      </table>

      {tip && (
        <motion.div
          className="tooltip"
          role="tooltip"
          style={{ left: tip.x, top: tip.y, translateX: "-50%" }}
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.15 }}
        >
          <b>{tip.shop}</b> is dark at <b>{tip.hour}</b>
          <div style={{ marginTop: 4 }}>{tip.reason}</div>
        </motion.div>
      )}
    </div>
  );
}

import { useMemo } from "react";
import { motion } from "framer-motion";
import type { RosterBlock, RosterInput } from "../lib/types";

/** A slowly scrolling wall of every real decision, behind a closing call to action. */
export function LogWall({ input, block, status }: { input: RosterInput; block: RosterBlock; status: string }) {
  const rows = useMemo(() => {
    const kw = Object.fromEntries(input.shops.map((s) => [s.id, s.kw]));
    const out: { n: number; shop: string; hour: string; kw: number; fuel: string; on: boolean }[] = [];
    let n = 1;
    for (const r of block.roster) {
      for (const id of r.powered) out.push({ n: n++, shop: id, hour: r.hour, kw: kw[id], fuel: r.fuel_litres.toFixed(2), on: true });
      for (const d of r.dark) out.push({ n: n++, shop: d.id, hour: r.hour, kw: kw[d.id], fuel: "0.00", on: false });
    }
    while (out.length && out.length < 40) out.push(...out.slice(0, 40 - out.length));
    return out;
  }, [input, block]);

  const Row = ({ r, k }: { r: (typeof rows)[number]; k: string }) => (
    <div className={`lw-row ${r.on ? "on" : ""}`} key={k}>
      <span>{String(10000 + r.n * 37).slice(-5)}</span>
      <span>{r.shop}</span>
      <span>{r.hour}</span>
      <span>{r.kw} kW</span>
      <span>{r.on ? r.fuel : "—"}</span>
      <span>{r.on ? "powered" : "dark"}</span>
    </div>
  );

  return (
    <div className="logwall">
      <div className="lw-table" aria-hidden="true">
        <div className="lw-track">
          {rows.map((r, i) => <Row r={r} k={`a${i}`} key={`a${i}`} />)}
          {rows.map((r, i) => <Row r={r} k={`b${i}`} key={`b${i}`} />)}
        </div>
      </div>
      <div className="lw-content">
        <motion.h2 initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.8 }}>
          Every outage hour,<br />decided.
        </motion.h2>
        <motion.div className="lw-toast" initial={{ opacity: 0, scale: 0.96 }} whileInView={{ opacity: 1, scale: 1 }} viewport={{ once: true }} transition={{ delay: 0.4, duration: 0.6 }}>
          <span className="lw-orb" />
          <span>✓ {status === "ok" ? "Roster ready" : "Best effort ready"} · value {block.value_total} · {block.fuel_total_litres.toFixed(2)} L</span>
        </motion.div>
        <div className="lw-bottom">
          <p>Proven optimal.<br /><span>Explained cell by cell.</span></p>
          <div className="lw-actions">
            <a className="btn btn-light" href="#input">Build a roster</a>
            <a className="btn btn-outline-light" href="#api">Read the API</a>
            <a className="btn btn-primary" href="#api"><span className="mono">$ curl -X POST /api/roster</span></a>
          </div>
        </div>
      </div>
    </div>
  );
}

import { motion, type Variants } from "framer-motion";
import type { RosterBlock, RosterInput } from "../lib/types";

/**
 * Cascading "windows", one per outage hour - the day unfolding as one plan.
 * The stack deals in one window at a time every time it scrolls into view
 * (viewport.once = false), and each window then lights its shops in order.
 */
const stack: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.14, delayChildren: 0.05 } },
};

const win: Variants = {
  hidden: { opacity: 0, x: -70, y: -46, scale: 0.94, filter: "blur(6px)" },
  show: {
    opacity: 1, x: 0, y: 0, scale: 1, filter: "blur(0px)",
    transition: { type: "spring", stiffness: 170, damping: 22, mass: 0.9, staggerChildren: 0.025, delayChildren: 0.18 },
  },
};

const dot: Variants = {
  hidden: { opacity: 0, scale: 0.3 },
  show: { opacity: 1, scale: 1, transition: { type: "spring", stiffness: 420, damping: 18 } },
};

const stats: Variants = {
  hidden: { opacity: 0, y: 6 },
  show: { opacity: 1, y: 0, transition: { duration: 0.35 } },
};

export function HourStack({ block, input }: { block: RosterBlock; input: RosterInput }) {
  const n = block.roster.length;
  return (
    <div className="stack-section">
      <motion.div
        className="hour-stack"
        style={{ height: 210 + Math.max(0, n - 1) * 52 }}
        variants={stack}
        initial="hidden"
        whileInView="show"
        viewport={{ once: false, amount: 0.25 }}
      >
        {block.roster.map((r, i) => (
          <motion.div
            key={r.slot}
            className="win"
            style={{ left: `calc(${i} * min(8.2%, 64px))`, top: i * 52, zIndex: i + 1 }}
            variants={win}
            whileHover={{ y: -8, transition: { duration: 0.2 } }}
          >
            <div className="win-bar">
              <span>{r.hour} · outage</span>
              <span className="win-x" aria-hidden="true">⊠</span>
            </div>
            <div className="win-body">
              <div className="win-dots">
                {input.shops.map((s) => {
                  const on = r.powered.includes(s.id);
                  return <motion.i key={s.id} variants={dot} className={on ? "on" : "off"} title={`${s.id}: ${on ? "on" : "dark"}`} />;
                })}
              </div>
              <motion.div className="win-stats" variants={stats}>
                <span><b>{r.load_kw}</b>/{input.generator_capacity_kw} kW</span>
                <span><b>{r.fuel_litres.toFixed(2)}</b> L</span>
                <span>Σ <b>{r.fuel_running_litres.toFixed(2)}</b> L</span>
              </motion.div>
            </div>
          </motion.div>
        ))}
      </motion.div>
      <motion.blockquote
        className="quote card"
        initial={{ opacity: 0, y: 28 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: false, amount: 0.4 }}
        transition={{ duration: 0.7, delay: 0.15 + n * 0.08 }}
      >
        <p>“Apa, it's a 20-kilowatt machine. Put them all on and it trips.”</p>
        <footer>
          <span className="quote-mark">⚡</span>
          <span><b>Monir bhai</b><br />runs the generator room</span>
        </footer>
        <div className="quote-note">
          {n} outage hours, planned together: {block.fuel_total_litres.toFixed(2)} L of {Number(input.fuel_budget_litres).toFixed(2)} L,
          never over {input.generator_capacity_kw} kW.
        </div>
      </motion.blockquote>
    </div>
  );
}

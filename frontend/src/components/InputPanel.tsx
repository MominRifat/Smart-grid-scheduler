import { useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { RosterInput } from "../lib/types";

export const EXAMPLES = [
  { file: "shapla_sample.json", title: "Shapla · Thursday", note: "12 shops · 20 kW · 17 L · outages 12–16 & 17–20" },
  { file: "minute150_predicted.json", title: "Minute-150 (predicted)", note: "Afternoon block extended through 16:00" },
  { file: "worked_example.json", title: "Worked example", note: "5 shops · 10 kW · 8 L · best value 84" },
  { file: "infeasible_demo.json", title: "Infeasible demo", note: "Mandatory pharmacy bigger than the generator" },
  { file: "invalid_demo.json", title: "Invalid demo", note: "Duplicate shop id → HTTP 400" },
];

type Tab = "examples" | "paste" | "upload";

interface Props {
  text: string;
  onText: (t: string) => void;
  onRun: () => void;
  loading: boolean;
  parsed: RosterInput | null;
  activeExample: string | null;
  onExample: (file: string) => void;
}

export function InputPanel({ text, onText, onRun, loading, parsed, activeExample, onExample }: Props) {
  const [tab, setTab] = useState<Tab>("examples");
  const [drag, setDrag] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const readFile = async (f: File | undefined) => {
    if (!f) return;
    onText(await f.text());
    setTab("paste");
  };

  const outages = parsed?.grid_available?.filter((g) => g === false).length ?? 0;
  const mandatory = parsed?.shops?.filter((s) => s.type === "mandatory").length ?? 0;

  return (
    <section className="section" id="input">
      <div className="container input-grid">
        <div className="card card-pad">
          <div className="section-head" style={{ marginBottom: 0 }}>
            <div>
              <div className="label">Step 1</div>
              <h2 className="section-title">Today's situation</h2>
            </div>
            <div className="tabs" role="tablist" aria-label="Input method">
              {(["examples", "paste", "upload"] as Tab[]).map((t) => (
                <button key={t} role="tab" className="tab" aria-selected={tab === t} onClick={() => setTab(t)}>
                  {tab === t && <motion.span layoutId="tab-pill" className="tab-pill" transition={{ type: "spring", bounce: 0.18, duration: 0.5 }} />}
                  {t[0].toUpperCase() + t.slice(1)}
                </button>
              ))}
            </div>
          </div>

          <AnimatePresence mode="wait">
            <motion.div key={tab} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.22 }}>
              {tab === "examples" && (
                <div className="example-list">
                  {EXAMPLES.map((e) => (
                    <button key={e.file} className="example" data-active={activeExample === e.file} onClick={() => onExample(e.file)}>
                      <b>{e.title}</b>
                      <span>{e.note}</span>
                    </button>
                  ))}
                </div>
              )}
              {tab === "paste" && (
                <textarea
                  className="editor"
                  spellCheck={false}
                  aria-label="Input JSON"
                  value={text}
                  onChange={(e) => onText(e.target.value)}
                  onKeyDown={(e) => {
                    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") onRun();
                  }}
                  placeholder='{"grid_available": [...], "shops": [...]}'
                />
              )}
              {tab === "upload" && (
                <div
                  className={`dropzone ${drag ? "drag" : ""}`}
                  role="button"
                  tabIndex={0}
                  onClick={() => fileRef.current?.click()}
                  onKeyDown={(e) => e.key === "Enter" && fileRef.current?.click()}
                  onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
                  onDragLeave={() => setDrag(false)}
                  onDrop={(e) => { e.preventDefault(); setDrag(false); readFile(e.dataTransfer.files[0]); }}
                >
                  <div>
                    <div style={{ fontSize: 15, color: "var(--text)" }}>Drop an input .json here</div>
                    <div className="hint" style={{ marginTop: 6 }}>or click to choose a file</div>
                  </div>
                  <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => readFile(e.target.files?.[0])} />
                </div>
              )}
            </motion.div>
          </AnimatePresence>

          <div className="run-row">
            <button className="btn btn-primary" onClick={onRun} disabled={loading || !text.trim()}>
              {loading ? <span className="spinner" /> : null}
              {loading ? "Solving…" : "Build roster"}
              {!loading && <span className="kbd">⌘↵</span>}
            </button>
            <span className="hint">POST /api/roster · same endpoint any market can call</span>
          </div>
        </div>

        <div className="card card-pad">
          <div className="label">At a glance</div>
          <h2 className="section-title">Generator &amp; shops</h2>
          {parsed ? (
            <>
              <div className="facts">
                <div className="fact"><div className="label">Capacity</div><div className="v">{parsed.generator_capacity_kw} kW</div></div>
                <div className="fact"><div className="label">Diesel</div><div className="v">{Number(parsed.fuel_budget_litres).toFixed(2)} L</div></div>
                <div className="fact"><div className="label">Outage hours</div><div className="v">{outages} / 10</div></div>
                <div className="fact"><div className="label">Max dark in a row</div><div className="v">{parsed.max_consecutive_dark} h</div></div>
                <div className="fact"><div className="label">Shops</div><div className="v">{parsed.shops.length} · {mandatory} mandatory</div></div>
                <div className="fact"><div className="label">Total demand</div><div className="v">{parsed.shops.reduce((a, s) => a + (Number(s.kw) || 0), 0)} kW</div></div>
              </div>
              {Array.isArray(parsed.fuel_table) && (
                <div style={{ marginTop: 14 }}>
                  <div className="label" style={{ marginBottom: 6 }}>Fuel table · litres per hour by combined load</div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {parsed.fuel_table.map((l, i) => (
                      <span key={i} className="badge badge-muted">≤{l.load_kw} kW · {Number(l.litres_per_hour).toFixed(2)} L</span>
                    ))}
                  </div>
                </div>
              )}
              {parsed._story && <div className="story">{parsed._story}</div>}
            </>
          ) : (
            <div className="empty"><div className="big">No input yet</div>Pick an example, paste JSON or upload a file.</div>
          )}
        </div>
      </div>
    </section>
  );
}

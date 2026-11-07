import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ApiSection } from "./components/ApiSection";
import { DotGlobe } from "./components/DotGlobe";
import { HourStack } from "./components/HourStack";
import { AnnouncementBar, Footer, Header, Hero } from "./components/Chrome";
import { Architecture } from "./components/Architecture";
import { Comparison } from "./components/Comparison";
import { LogWall } from "./components/LogWall";
import { DeepDive } from "./components/DeepDive";
import { EXAMPLES, InputPanel } from "./components/InputPanel";
import { DarkHoursBars, FuelChart, InfeasibleAlert, InvalidAlert, ReasonList, Reveal, Stats } from "./components/Panels";
import { RosterBoard, type Selected } from "./components/RosterBoard";
import { downloadJson, postRoster, type ApiResult } from "./lib/api";
import { buildBoard, tryParseInput } from "./lib/board";
import type { RosterInput } from "./lib/types";
import { HOURS } from "./lib/types";

interface Run {
  input: RosterInput | null; // snapshot of the input this result belongs to
  result: ApiResult;
}

export default function App() {
  const [text, setText] = useState("");
  const [activeExample, setActiveExample] = useState<string | null>(null);
  const [run, setRun] = useState<Run | null>(null);
  const [loading, setLoading] = useState(false);
  const [netError, setNetError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Selected | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const parsed = useMemo(() => tryParseInput(text), [text]);

  const solve = useCallback(async (body: string, scroll = true) => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setLoading(true);
    setNetError(null);
    setSelected(null);
    try {
      const result = await postRoster(body, ctrl.signal);
      setRun({ input: tryParseInput(body), result });
      if (scroll) requestAnimationFrame(() => document.getElementById("results")?.scrollIntoView({ behavior: "smooth", block: "start" }));
    } catch (e) {
      if ((e as Error).name !== "AbortError") setNetError((e as Error).message || "Could not reach the API");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadExample = useCallback(async (file: string, autorun = true, scroll = true) => {
    const res = await fetch(`/examples/${file}`);
    const body = await res.text();
    setText(body);
    setActiveExample(file);
    if (autorun) await solve(body, scroll);
  }, [solve]);

  useEffect(() => {
    loadExample(EXAMPLES[0].file, true, false).catch(() => undefined);
  }, [loadExample]);

  const body = run?.result.body;
  const block = body?.status === "ok" ? body : body?.status === "infeasible" ? body.best_effort : null;
  const board = useMemo(() => (run?.input && block ? buildBoard(run.input, block) : null), [run, block]);
  const violations = useMemo(() => {
    if (body?.status !== "infeasible") return undefined;
    const set = new Set<string>();
    for (const v of body.best_effort.violations) for (const h of v.hours) set.add(`${v.shop}@${HOURS.indexOf(h)}`);
    return set;
  }, [body]);

  const download = () => body && downloadJson(body, "roster_output.json");

  return (
    <>
      <AnnouncementBar grid={run?.input?.grid_available} budget={run?.input ? Number(run.input.fuel_budget_litres) : undefined} status={body?.status} />
      <Header onPrint={() => window.print()} onDownload={download} canExport={!!body && body.status !== "invalid_input"} />
      <main>
        <div className="no-print">
          <Hero />
          <InputPanel
            text={text}
            onText={(t) => { setText(t); setActiveExample(null); }}
            onRun={() => solve(text)}
            loading={loading}
            parsed={parsed}
            activeExample={activeExample}
            onExample={(f) => loadExample(f, true)}
          />
        </div>

        <section className="section" id="results">
          <div className="container" style={{ display: "grid", gap: 16 }}>
            {netError && (
              <div className="alert alert-bad no-print" role="alert">
                <h3>Couldn't reach the API</h3>
                <div className="mono">{netError}</div>
              </div>
            )}

            {!run && !netError && (
              <div className="card no-print">
                <div className="skeleton" style={{ height: 380 }} />
              </div>
            )}

            <AnimatePresence mode="wait">
              {body?.status === "invalid_input" && (
                <motion.div key="invalid" className="no-print" exit={{ opacity: 0 }}>
                  <InvalidAlert field={body.field} message={body.message} httpStatus={run!.result.httpStatus} />
                </motion.div>
              )}
            </AnimatePresence>

            {body?.status === "infeasible" && (
              <div className="no-print">
                <InfeasibleAlert message={body.message} conflicts={body.conflicts} violations={body.best_effort.violations} />
              </div>
            )}

            {board && block && run?.input && (
              <motion.div key={run.result.ms + ":" + block.value_total} style={{ display: "grid", gap: 16 }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4 }}>
                <div className="no-print">
                  <Stats
                    status={body!.status as "ok" | "infeasible"}
                    block={block}
                    budget={Number(run.input.fuel_budget_litres)}
                    optimal={body?.status === "ok" ? body.optimal : undefined}
                    solver={body?.status === "ok" ? body.solver : undefined}
                    ms={run.result.ms}
                  />
                </div>

                <div className="print-only print-head">
                  <h1>Generator roster · {body?.status === "ok" ? "today" : "BEST EFFORT (infeasible day)"}</h1>
                  <span>Capacity {run.input.generator_capacity_kw} kW · diesel {Number(run.input.fuel_budget_litres).toFixed(2)} L · max {run.input.max_consecutive_dark} h dark in a row</span>
                </div>
                <div className="print-only print-totals">
                  <span>Status: <b>{body?.status}</b></span>
                  <span>Total value: <b>{block.value_total}</b></span>
                  <span>Total fuel: <b>{block.fuel_total_litres.toFixed(2)} L</b></span>
                  <span>★ = mandatory · ✓ on generator · ✗ dark · grid = mains power</span>
                </div>

                <div className="card print-break-avoid" id="board">
                  <div className="card-pad section-head no-print" style={{ marginBottom: 0 }}>
                    <div>
                      <div className="label">Step 2 · The roster</div>
                      <h2 className="section-title">
                        {body?.status === "infeasible" ? "Best-effort board" : "Roster board"}
                        {body?.status === "infeasible" && <span className="badge badge-warn" style={{ marginLeft: 10, verticalAlign: "middle" }}>best effort</span>}
                      </h2>
                      <p className="section-sub">Hover or click any ✗ to see why that shop is dark.</p>
                    </div>
                    <div className="legend">
                      <span><i style={{ background: "rgba(0,229,153,.12)", borderColor: "rgba(0,229,153,.4)" }} />on generator</span>
                      <span><i style={{ background: "rgba(255,95,95,.1)", borderColor: "rgba(255,95,95,.4)" }} />dark</span>
                      <span><i style={{ background: "#121816", borderColor: "#26302d" }} />grid</span>
                      <span><span className="star" style={{ margin: 0 }}>★</span>mandatory</span>
                    </div>
                  </div>
                  <RosterBoard board={board} selected={selected} onSelect={setSelected} violations={violations} />
                </div>

                <div className="two-col no-print">
                  <Reveal><ReasonList block={block} selected={selected} onSelect={setSelected} /></Reveal>
                  <div className="stack">
                    <Reveal delay={0.08}><FuelChart board={board} /></Reveal>
                    <Reveal delay={0.12}><DarkHoursBars block={block} /></Reveal>
                  </div>
                </div>
              </motion.div>
            )}
          </div>
        </section>

        {board && block && run?.input && block.roster.length > 0 && (
          <section className="section no-print" id="plan">
            <div className="container">
              <Reveal>
                <div className="section-head">
                  <div>
                    <div className="label">The day as one plan</div>
                    <h2 className="section-title">Hour by hour, never over the line</h2>
                    <p className="section-sub">Each window is one outage hour: who is on, the combined load, and the diesel it burns.</p>
                  </div>
                </div>
              </Reveal>
              <HourStack block={block} input={run.input} />
            </div>
          </section>
        )}

        <DeepDive
          items={[
            { id: "how", label: "Engine architecture", node: (
              <>
                <h2 className="dd-title">A request becomes a roster in under two seconds. <span>Checked, decided as one plan, explained cell by cell.</span></h2>
                <Architecture />
              </>
            ) },
            ...(board && block && run?.input && block.roster.length > 0 ? [{ id: "versus", label: "Planning vs greedy", node: (
              <>
                <h2 className="dd-title">Planning protects the evening rush. <span>Hour-by-hour greedy burns the diesel by noon.</span></h2>
                <Comparison input={run.input} block={block} board={board} />
              </>
            ) }] : []),
          ]}
        />

        {block && run?.input && block.roster.length > 0 && (
          <section className="no-print" id="decisions">
            <LogWall input={run.input} block={block} status={body!.status} />
          </section>
        )}

        <section className="section no-print" id="globe">
          <div className="container">
            <DotGlobe
              names={(run?.input?.shops ?? []).map((s) => s.id).concat(run?.input?.shops?.length ? [] : ["pharmacy", "atm booth", "tailor", "restaurant", "grocery", "tea stall"])}
              value={block?.value_total}
              fuel={block?.fuel_total_litres}
              budget={run?.input ? Number(run.input.fuel_budget_litres) : undefined}
              status={body?.status}
            />
          </div>
        </section>

        <ApiSection />
      </main>
      <Footer />
    </>
  );
}

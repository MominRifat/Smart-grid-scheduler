import { useState } from "react";
import { Reveal } from "./Panels";

const CURL = `curl -X POST http://localhost:8088/api/roster \\
  -H "Content-Type: application/json" \\
  --data @inputs/sample_input.json`;

export function ApiSection() {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(CURL);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      /* clipboard blocked */
    }
  };
  return (
    <section className="section no-print" id="api">
      <div className="container">
        <Reveal>
          <div className="section-head">
            <div>
              <div className="label">For Uttara, Chattogram and everyone else</div>
              <h2 className="section-title">One endpoint. Any market.</h2>
              <p className="section-sub">This screen calls exactly the same API. No internet needed.</p>
            </div>
          </div>
          <div className="api-grid">
            <div className="card card-pad">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <span className="badge badge-ok">POST /api/roster</span>
                <button className="btn btn-sm" onClick={copy}>{copied ? "Copied ✓" : "Copy"}</button>
              </div>
              <pre className="code">
                <span className="k">curl</span> -X POST http://localhost:8088/api/roster \{"\n"}
                {"  "}-H <span className="s">"Content-Type: application/json"</span> \{"\n"}
                {"  "}--data @inputs/sample_input.json{"\n\n"}
                <span className="c"># → {"{"} "status": "ok", "roster": [...], "value_total": 186,</span>{"\n"}
                <span className="c">#     "fuel_total_litres": 16.4, "dark_hours": {"{"}...{"}"} {"}"}</span>
              </pre>
            </div>
            <div className="card card-pad">
              <table className="status-table">
                <tbody>
                  <tr><td><span className="badge badge-ok">200</span></td><td><b>ok</b> — the optimal roster, a reason for every dark shop, totals recomputed from the roster.</td></tr>
                  <tr><td><span className="badge badge-warn">200</span></td><td><b>infeasible</b> — which rule, which shops and hours conflict, plus a labelled best-effort roster.</td></tr>
                  <tr><td><span className="badge badge-bad">400</span></td><td><b>invalid_input</b> — names the exact field, e.g. <code className="mono">shops[2].id</code>.</td></tr>
                </tbody>
              </table>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

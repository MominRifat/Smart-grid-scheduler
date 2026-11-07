import type { RosterOutput } from "./types";

export interface ApiResult {
  httpStatus: number;
  body: RosterOutput;
  ms: number;
}

/** The screen uses exactly the public endpoint: POST /api/roster with the raw input text. */
export async function postRoster(text: string, signal?: AbortSignal): Promise<ApiResult> {
  const t0 = performance.now();
  const res = await fetch("/api/roster", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: text,
    signal,
  });
  let body: RosterOutput;
  try {
    body = (await res.json()) as RosterOutput;
  } catch {
    throw new Error(`Server answered HTTP ${res.status} without JSON`);
  }
  return { httpStatus: res.status, body, ms: Math.round(performance.now() - t0) };
}

export function downloadJson(data: unknown, filename: string): void {
  const blob = new Blob([JSON.stringify(data, null, 2) + "\n"], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

"""HTTP layer. POST /api/roster -> app.roster.run_text -> app.solver."""
from __future__ import annotations

import asyncio
import os
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from .roster import run_text

app = FastAPI(title="Who Stays On?", version="1.0.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


@app.get("/api/health")
def health() -> dict:
    return {"ok": True}


@app.post("/api/roster")
@app.post("/api/roster/", include_in_schema=False)
async def roster(request: Request) -> JSONResponse:
    body = await request.body()
    status, out = await asyncio.to_thread(run_text, body)
    return JSONResponse(out, status_code=status)


@app.api_route("/api/roster", methods=["GET", "PUT", "PATCH", "DELETE"], include_in_schema=False)
def roster_wrong_method() -> JSONResponse:
    return JSONResponse({"detail": "Use POST /api/roster with the input JSON as the body"}, status_code=405,
                        headers={"Allow": "POST"})


# Optional: serve a built frontend from the same port (used when running without nginx).
STATIC = Path(os.environ.get("STATIC_DIR", Path(__file__).resolve().parents[2] / "frontend" / "dist"))
if STATIC.is_dir():
    app.mount("/assets", StaticFiles(directory=STATIC / "assets"), name="assets")

    @app.get("/{path:path}")
    def spa(path: str):
        if path.startswith("api/"):
            return JSONResponse({"detail": "Not found"}, status_code=404)
        f = STATIC / path
        return FileResponse(f if path and f.is_file() else STATIC / "index.html")

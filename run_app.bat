@echo off
setlocal
cd /d "%~dp0"

echo =======================================================
echo   Starting "Who Stays On?" System...
echo =======================================================
echo.
echo [1/2] Verifying Python and dependencies...
python -c "import fastapi, uvicorn, ortools; print('All Python dependencies are ready!')" 2>nul
if %errorlevel% neq 0 (
    echo [!] Missing Python packages. Installing required packages...
    python -m pip install -r backend\requirements.txt
    if %errorlevel% neq 0 (
        echo [ERROR] Failed to install dependencies. Please ensure Python is on PATH.
        pause
        exit /b 1
    )
)

echo [2/2] Launching Web Application and API on http://localhost:8000...
echo.
echo =======================================================
echo   - App URL : http://localhost:8000
echo   - API URL : http://localhost:8000/api/roster
echo   (Press Ctrl+C in this window to stop the server)
echo =======================================================
echo.

start "" "http://localhost:8000"

cd backend
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
pause

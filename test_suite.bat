@echo off
setlocal
cd /d "%~dp0"

echo =======================================================
echo   Running "Who Stays On?" Full Test Suite
echo =======================================================
echo.

echo [1/3] Running Backend Tests (pytest)...
set PYTHONUTF8=1
python -m pytest backend\tests
if %errorlevel% neq 0 (
    echo [ERROR] Backend tests failed!
    pause
    exit /b 1
)

echo.
echo [2/3] Running Frontend Tests (vitest)...
cd frontend
call npm test
cd ..
if %errorlevel% neq 0 (
    echo [ERROR] Frontend tests failed!
    pause
    exit /b 1
)

echo.
echo [3/3] Running Independent Output Validator...
python scripts\validate_output.py inputs\sample_input.json outputs\sample_output.json
python scripts\validate_output.py examples\worked_example_input.json outputs\worked_example_output.json

echo.
echo =======================================================
echo   SUCCESS! All backend, frontend, and validator tests passed!
echo =======================================================
pause

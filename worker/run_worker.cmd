@echo off
setlocal
set "WORKER_DIR=%~dp0"
for %%I in ("%WORKER_DIR%..") do set "ROOT_DIR=%%~fI"
set "PYTHON=%WORKER_DIR%.venv\Scripts\python.exe"
set "LOG_DIR=%WORKER_DIR%debug"
set "LOG_FILE=%LOG_DIR%\worker.log"

if not exist "%PYTHON%" exit /b 1
if not exist "%LOG_DIR%" mkdir "%LOG_DIR%"

cd /d "%ROOT_DIR%"
"%PYTHON%" -m cafe_ocr_worker.main >> "%LOG_FILE%" 2>&1

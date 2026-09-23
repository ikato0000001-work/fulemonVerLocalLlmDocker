@echo off
setlocal

cd /d "%~dp0"
set "COMPOSE_FILE=%~dp0docker-compose.yml"

if not exist "%COMPOSE_FILE%" (
	echo docker-compose.yml was not found.
	echo Checked: "%~dp0docker-compose.yml"
	goto :error
)

for %%F in ("%COMPOSE_FILE%") do set "PROJECT_DIR=%%~dpF"
cd /d "%PROJECT_DIR%"

echo [1/10] Starting Ollama container...
docker compose -f "%COMPOSE_FILE%" up -d ollama
if errorlevel 1 goto :error

echo [2/10] Pulling gemma4:e4b...
docker compose -f "%COMPOSE_FILE%" exec ollama ollama pull gemma4:e4b
if errorlevel 1 goto :error

echo [3/10] Pulling gemma4:e2b...
docker compose -f "%COMPOSE_FILE%" exec ollama ollama pull gemma4:e2b
if errorlevel 1 goto :error

echo [4/10] Pulling qwen3:14b...
docker compose -f "%COMPOSE_FILE%" exec ollama ollama pull qwen3:14b
if errorlevel 1 goto :error

echo [5/10] Pulling qwen3.5:9b...
docker compose -f "%COMPOSE_FILE%" exec ollama ollama pull qwen3.5:9b
if errorlevel 1 goto :error

echo [6/10] Pulling deepseek-r1:8b...
docker compose -f "%COMPOSE_FILE%" exec ollama ollama pull deepseek-r1:8b
if errorlevel 1 goto :error

echo [7/10] Pulling phi4...
docker compose -f "%COMPOSE_FILE%" exec ollama ollama pull phi4
if errorlevel 1 goto :error

echo [8/10] Pulling llama3.2:3b...
docker compose -f "%COMPOSE_FILE%" exec ollama ollama pull llama3.2:3b
if errorlevel 1 goto :error

echo [9/10] Pulling codestral...
docker compose -f "%COMPOSE_FILE%" exec ollama ollama pull codestral
if errorlevel 1 goto :error

echo [10/10] Building and starting Next.js...
docker compose -f "%COMPOSE_FILE%" up -d --build app
if errorlevel 1 goto :error

echo.
echo Started successfully: http://localhost:3000
pause
exit /b 0

:error
echo.
echo Startup failed. Check the error message above.
pause
exit /b 1
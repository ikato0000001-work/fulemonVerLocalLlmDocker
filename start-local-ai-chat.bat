@echo off
setlocal

cd /d "%~dp0"
set "COMPOSE_FILE=%~dp0docker-compose.yml"

if not exist "%COMPOSE_FILE%" (
	set "COMPOSE_FILE=C:\Portfolio\ai-chat-fulemon\docker-compose.yml"
)

if not exist "%COMPOSE_FILE%" (
	echo docker-compose.yml was not found.
	echo Checked: "%~dp0docker-compose.yml"
	echo Checked: "C:\Portfolio\ai-chat-fulemon\docker-compose.yml"
	goto :error
)

for %%F in ("%COMPOSE_FILE%") do set "PROJECT_DIR=%%~dpF"
cd /d "%PROJECT_DIR%"

echo [1/4] Starting Ollama container...
docker compose -f "%COMPOSE_FILE%" up -d ollama
if errorlevel 1 goto :error

echo [2/4] Pulling gemma4:e4b...
docker compose -f "%COMPOSE_FILE%" exec ollama ollama pull gemma4:e4b
if errorlevel 1 goto :error

echo [3/4] Pulling gemma4:e2b...
docker compose -f "%COMPOSE_FILE%" exec ollama ollama pull gemma4:e2b
if errorlevel 1 goto :error

echo [4/4] Building and starting Next.js...
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

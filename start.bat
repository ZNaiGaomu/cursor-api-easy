@echo off
setlocal
set "PATH=%USERPROFILE%\.bun\bin;%PATH%"
cd /d "%~dp0"

if not exist "node_modules" (
  echo Installing dependencies...
  call bun install
  if errorlevel 1 exit /b 1
)

if not exist "dist\cli.js" (
  echo Building...
  call bun run build
  if errorlevel 1 exit /b 1
)

bun run dist\cli.js whoami
if errorlevel 1 (
  echo.
  echo Not logged in. Starting login...
  bun run dist\cli.js login
  if errorlevel 1 exit /b 1
)

if not defined PORT set PORT=3000
echo.
echo Starting server on http://localhost:%PORT%/v1
if defined HTTPS_PROXY (
  echo Cursor egress via %HTTPS_PROXY%
) else if defined HTTP_PROXY (
  echo Cursor egress via %HTTP_PROXY%
) else (
  echo Cursor egress: direct
  echo If Claude/GPT/Gemini fail with a region error, set HTTPS_PROXY first.
  echo Example: set HTTPS_PROXY=http://127.0.0.1:7890
)
bun run dist\cli.js serve

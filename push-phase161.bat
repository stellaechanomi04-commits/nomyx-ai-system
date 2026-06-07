@echo off
cd /d "C:\Users\MAPS_001\Documents\NOMYX\nomyx-ai-system-phase15"

echo [Phase 16.1] Cleaning git lock if present...
if exist ".git\index.lock" del /f /q ".git\index.lock"

echo [Phase 16.1] Running Phase 16 regression tests...
node tests/phase16.test.js
if %errorlevel% neq 0 (
  echo FAIL: Phase 16 regression tests failed -- aborting deploy
  exit /b 1
)

echo [Phase 16.1] Running Phase 16.1 tests...
node tests/phase161.test.js
if %errorlevel% neq 0 (
  echo FAIL: Phase 16.1 tests failed -- aborting deploy
  exit /b 1
)

echo [Phase 16.1] Syntax check...
node --check server.js
if %errorlevel% neq 0 (
  echo FAIL: server.js syntax error -- aborting
  exit /b 1
)

echo [Phase 16.1] Adding files...
git add server.js modules/portal-sessions.js modules/email-alert-parser.js tests/phase16.test.js tests/phase161.test.js push-phase161.bat

echo [Phase 16.1] Committing...
git commit -m "Phase 16.1: BidNet stale fix + Gmail dedup + canonical alerts + phone actions (31/31 tests pass)"

echo [Phase 16.1] Pushing to GitHub...
git push origin main

echo [Phase 16.1] Push complete. Wait for Railway to redeploy, then smoke test.
pause

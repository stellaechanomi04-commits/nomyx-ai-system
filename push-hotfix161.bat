@echo off
cd /d "C:\Users\MAPS_001\Documents\NOMYX\nomyx-ai-system-phase15"

echo [Hotfix 16.1] Cleaning git lock if present...
if exist ".git\index.lock" del /f /q ".git\index.lock"

echo [Hotfix 16.1] Running Phase 16 regression tests...
node tests/phase16.test.js
if %errorlevel% neq 0 (
  echo FAIL: Phase 16 regression tests failed -- aborting
  exit /b 1
)

echo [Hotfix 16.1] Running Phase 16.1 tests (17 tests)...
node tests/phase161.test.js
if %errorlevel% neq 0 (
  echo FAIL: Phase 16.1 tests failed -- aborting
  exit /b 1
)

echo [Hotfix 16.1] Syntax check...
node --check server.js
if %errorlevel% neq 0 (
  echo FAIL: server.js syntax error -- aborting
  exit /b 1
)

echo [Hotfix 16.1] Adding files...
git add server.js tests/phase161.test.js push-hotfix161.bat

echo [Hotfix 16.1] Committing...
git commit -m "Hotfix 16.1b: patch /health version 3.4 + Phase 16.1 string (32/32 tests pass)"

echo [Hotfix 16.1] Pushing to GitHub...
git push origin main

echo [Hotfix 16.1] Push complete. Wait for Railway ACTIVE then smoke test.
pause

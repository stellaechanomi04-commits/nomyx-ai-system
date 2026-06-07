@echo off
echo ============================================================
echo  NOMYX AI -- Phase 16 Deploy
echo  Alert Verification + Opportunity Pipeline
echo ============================================================

cd /d C:\Users\MAPS_001\Documents\NOMYX\nomyx-ai-system-phase15

echo.
echo [1/6] Running Phase 16 tests...
node tests/phase16.test.js
if %errorlevel% neq 0 (
  echo FAIL: Phase 16 tests failed -- aborting deploy
  exit /b 1
)

echo.
echo [2/6] Running prior phase tests (regression check)...
node tests/phase15.test.js
if %errorlevel% neq 0 (
  echo FAIL: Phase 15 regression tests failed -- aborting deploy
  exit /b 1
)

echo.
echo [3/6] Staging files...
git add modules/opportunity-pipeline.js
git add modules/email-alert-parser.js
git add server.js
git add tests/phase16.test.js
git add push-phase16.bat

echo.
echo [4/6] Committing...
git commit -m "Phase 16: Alert Verification + Opportunity Pipeline (15 tests pass)"

echo.
echo [5/6] Pushing to GitHub...
git push origin main

echo.
echo [6/6] Deploy triggered. Watch Railway for ACTIVE status.
echo  Dashboard: https://railway.com/project/9aa2be2b-9ebb-4f17-ae26-38bd8bd0615c
echo  Production: https://nomyx-ai-system-production.up.railway.app/m
echo.
echo Smoke test after ACTIVE:
echo   /gmail/status    -- expect CONNECTED
echo   /gmail/scan      -- expect ok + alerts
echo   /opportunities/pipeline  -- expect scored alerts
echo   /alerts/deduplicate  -- expect canonical + duplicate counts
echo   /m               -- expect Gmail Connected + action buttons
echo ============================================================

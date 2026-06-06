/**
 * Session Worker — Phase 14
 * Architecture scaffold for browser-based portal scanning using Playwright.
 *
 * CURRENT STATUS: Scaffold only. Playwright not installed on Railway by default.
 *
 * ── DESIGN PRINCIPLES ────────────────────────────────────────────────────────
 * - Read-only scanning ONLY
 * - No bid submission
 * - No profile changes
 * - No purchases or payment actions
 * - No document uploads
 * - No email sending
 * - No CAPTCHA solving or bypass
 * - Stops immediately and requests Stella if MFA/CAPTCHA/login appears
 * - Stella types credentials directly into browser — never into NOMYX AI
 *
 * ── TO ACTIVATE FULL BROWSER WORKER ─────────────────────────────────────────
 * 1. Add 'playwright' to package.json dependencies
 * 2. Add Railway Nixpacks build config for Chromium (nixpacks.toml):
 *    [phases.setup]
 *    nixPkgs = ['chromium', 'nss', 'freetype', 'harfbuzz', 'ca-certificates', 'ttf-opensans']
 * 3. Set Railway env var: PLAYWRIGHT_ENABLED=true
 * 4. Worker will then run real browser sessions for read-only scanning
 *
 * ── RAILWAY NOTES ────────────────────────────────────────────────────────────
 * Railway free tier does not have persistent storage for browser sessions.
 * For persistent session cookies, a Railway volume or external encrypted KV
 * store (Redis/Upstash) is needed. Cookie storage would be encrypted at rest.
 * Raw credentials are NEVER stored — only encrypted session cookies.
 *
 * ── ARCHITECTURE ─────────────────────────────────────────────────────────────
 * [Phone Request] -> [NOMYX AI] -> [Approval Task Queue]
 *       |                               |
 *       v                               v
 * [Stella opens portal]      [Session Worker waits]
 * [Stella logs in]           [Stella marks Active]
 * [Stella returns to NOMYX]  [Worker resumes scan]
 *       |
 *       v
 * [Read-only portal scan]
 *       |
 *       v
 * [Import to Dashboard -> Score -> Notify Stella]
 */

var WORKER_STATUS = {
  NOT_INSTALLED: 'not_installed',
  SCAFFOLD: 'scaffold',
  AVAILABLE: 'available',
  RUNNING: 'running',
  WAITING_LOGIN: 'waiting_login',
  STOPPED: 'stopped',
  ERROR: 'error'
};

var workerStatus = WORKER_STATUS.NOT_INSTALLED;
var lastWorkerRun = null;
var workerLog = [];

function log(msg) {
  var entry = { time: new Date().toISOString(), msg: msg };
  workerLog.push(entry);
  if (workerLog.length > 100) workerLog.shift();
  console.log('[Worker]', msg);
}

function isPlaywrightEnabled() {
  return process.env.PLAYWRIGHT_ENABLED === 'true';
}

function isPlaywrightInstalled() {
  try { require('playwright'); return true; } catch(e) { return false; }
}

// Login detection patterns (portal-specific)
var LOGIN_SIGNALS = {
  generic: ['login', 'sign in', 'authenticate', 'session expired', 'access denied', 'password'],
  bidnetDirect: ['log in to bidnet', 'sign in to bidnet', 'session timeout'],
  njstart: ['bso/external/login', 'session has expired', 'log in to njstart'],
  samgov: ['sign.in.to.sam', 'login.gov'] // SAM uses API — this is fallback only
};

var CAPTCHA_SIGNALS = ['captcha', 'robot', 'verify you are human', 'recaptcha', 'hcaptcha', 'cloudflare'];
var MFA_SIGNALS = ['multi-factor', 'two-factor', 'mfa', 'verification code', 'authenticator', 'otp'];

function detectLoginWall(pageTitle, pageContent) {
  var combined = ((pageTitle || '') + ' ' + (pageContent || '')).toLowerCase();

  var isCaptcha = CAPTCHA_SIGNALS.some(function(s) { return combined.includes(s); });
  var isMfa = MFA_SIGNALS.some(function(s) { return combined.includes(s); });
  var isLogin = Object.values(LOGIN_SIGNALS).some(function(signals) {
    return signals.some(function(s) { return combined.includes(s); });
  });

  if (isCaptcha) return { detected: true, type: 'captcha', message: 'CAPTCHA detected — manual completion required' };
  if (isMfa) return { detected: true, type: 'mfa', message: 'MFA required — Stella must authenticate' };
  if (isLogin) return { detected: true, type: 'login', message: 'Login required — session expired or not active' };
  return { detected: false };
}

async function scanPortalWithBrowser(portalId, scanUrl, opts) {
  opts = opts || {};

  if (!isPlaywrightEnabled() || !isPlaywrightInstalled()) {
    log('Browser worker not active for ' + portalId + ' (PLAYWRIGHT_ENABLED=' + process.env.PLAYWRIGHT_ENABLED + ')');
    return {
      portalId: portalId,
      status: 'manual_required',
      workerEnabled: false,
      message: 'Browser worker is in scaffold mode. Set PLAYWRIGHT_ENABLED=true and install playwright to enable automated scanning.',
      action: 'Stella logs in manually, then marks session active in NOMYX',
      howToEnable: 'Set PLAYWRIGHT_ENABLED=true in Railway env vars and add playwright to package.json',
      manualUrl: scanUrl
    };
  }

  workerStatus = WORKER_STATUS.RUNNING;
  log('Browser scan started: ' + portalId + ' -> ' + scanUrl);

  var browser = null;
  try {
    var playwright = require('playwright');
    browser = await playwright.chromium.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-blink-features=AutomationControlled'
      ]
    });

    var context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      viewport: { width: 1280, height: 800 }
      // NOTE: Session cookies would be loaded here from encrypted storage
      // when persistent session support is added (Railway volume or Upstash Redis)
    });

    var page = await context.newPage();

    // Navigate with timeout
    await page.goto(scanUrl, { waitUntil: 'networkidle', timeout: 30000 });

    var title = await page.title().catch(function() { return ''; });
    var bodyText = await page.evaluate(function() { return document.body ? document.body.innerText.slice(0, 2000) : ''; }).catch(function() { return ''; });

    // Check for login/MFA/CAPTCHA walls — STOP immediately if detected
    var wall = detectLoginWall(title, bodyText);
    if (wall.detected) {
      log('Wall detected on ' + portalId + ': ' + wall.type);
      await browser.close();
      workerStatus = WORKER_STATUS.WAITING_LOGIN;
      return {
        portalId: portalId,
        status: wall.type + '_required',
        wallType: wall.type,
        message: wall.message,
        action: wall.type === 'captcha'
          ? 'CAPTCHA cannot be bypassed. Stella must log in manually.'
          : 'Stella must ' + (wall.type === 'mfa' ? 'complete MFA' : 'log in') + ' to ' + portalId + '. After login, mark session active in NOMYX.',
        approvalRequired: true
      };
    }

    // Read-only: extract listing content
    // Only reads text — no clicks, no form submissions, no downloads
    var listings = await page.evaluate(function() {
      // Generic: grab text from table rows or list items that look like bid listings
      var rows = Array.from(document.querySelectorAll('tr, li, .bid-item, .solicitation-item, .result-item'));
      return rows.slice(0, 50).map(function(r) { return r.innerText ? r.innerText.trim().slice(0, 300) : ''; }).filter(function(t) { return t.length > 20; });
    }).catch(function() { return []; });

    await browser.close();
    workerStatus = WORKER_STATUS.AVAILABLE;
    lastWorkerRun = new Date().toISOString();

    log('Scan complete: ' + portalId + ' — ' + listings.length + ' rows found');

    return {
      portalId: portalId,
      status: 'ok',
      pageTitle: title,
      rowsFound: listings.length,
      rawListings: listings,
      scanDate: lastWorkerRun,
      note: 'Read-only scan complete. Raw listings need manual review or structured import.'
    };

  } catch (e) {
    log('Browser error on ' + portalId + ': ' + e.message);
    if (browser) { try { await browser.close(); } catch(ex) {} }
    workerStatus = WORKER_STATUS.ERROR;
    return { portalId: portalId, status: 'error', error: e.message };
  }
}

function getWorkerStatus() {
  return {
    status: workerStatus,
    playwrightEnabled: isPlaywrightEnabled(),
    playwrightInstalled: isPlaywrightInstalled(),
    lastRun: lastWorkerRun,
    recentLog: workerLog.slice(-20),
    designPrinciples: [
      'Read-only scanning only',
      'No bid submission',
      'No CAPTCHA bypass',
      'Stops at login/MFA/CAPTCHA walls',
      'Stella types credentials directly — never into NOMYX AI'
    ],
    activationSteps: isPlaywrightEnabled() ? 'Enabled' : [
      '1. Set PLAYWRIGHT_ENABLED=true in Railway env vars',
      '2. Add playwright to package.json dependencies',
      '3. Add Chromium to Railway nixpacks.toml build config',
      '4. Redeploy — worker will activate'
    ]
  };
}

module.exports = {
  WORKER_STATUS,
  detectLoginWall,
  scanPortalWithBrowser,
  getWorkerStatus,
  isPlaywrightEnabled,
  isPlaywrightInstalled
};

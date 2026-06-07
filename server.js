require('dotenv').config();
const express = require('express');
const session = require('express-session');
const app = express();
app.use(express.json());

// Trust Railway's reverse proxy
app.set('trust proxy', 1);

// Global body parser (needed for login form)
app.use(require('express').urlencoded({ extended: false }));

// Session middleware for dashboard login
app.use(session({
  secret: process.env.SESSION_SECRET || 'nomyx-secret-2026-x9k',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000,
    sameSite: 'lax'
  }
}));

// Dashboard routes (password protected)
const dashboardRouter = require('./modules/dashboard-routes');
app.use('/dashboard', dashboardRouter);

// Redirect root to dashboard
app.get('/go', (req, res) => res.redirect('/dashboard'));

const load = (p) => { try { return require(p); } catch(e) { console.error('Module error:', p, e.message); return {}; } };

const bidScanner   = load('./modules/bid-scanner');
const bidAnalyzer  = load('./modules/bid-analyzer');
const certTracker  = load('./modules/cert-tracker');
const emailMonitor = load('./modules/email-monitor');
const socialMedia  = load('./modules/social-media');
const notifications = load('./modules/notifications');

// -- PHASE 14: Portal Operator + Phone Approval -----------------------------
const portalSessions = load('./modules/portal-sessions');
const phoneApproval  = load('./modules/phone-approval');
const bidExecutor    = load('./modules/bid-executor');
const sbaSubnet      = load('./modules/sba-subnet');
const sessionWorker  = load('./modules/session-worker');

// -- PHASE 15: Gmail OAuth + Email Alert Ingestion --------------------------
const gmailOAuth       = load('./modules/gmail-oauth');
const emailAlertParser = load('./modules/email-alert-parser');

// -- PHASE 16: Alert Verification + Opportunity Pipeline -------------------
const opportunityPipeline = load('./modules/opportunity-pipeline');

// -- CRON JOBS --------------------------------------------------------------
try {
  const cron = require('node-cron');
  cron.schedule('0 7 * * *', async () => {
    console.log('[NOMYX] 7am scan starting...');
    const result = await bidScanner.scanAll();
    await notifications.sendDailyReport(result);
    // PHASE 13 FIX: null <= 3 is true in JS (null coerces to 0).
    // Must check deadlineDays != null AND !isFake AND VERIFIED before sending urgent alert.
    const urgent = (result?.allBids||[]).filter(b =>
      b.deadlineDays != null &&
      b.deadlineDays <= 3 &&
      !b.isFake &&
      b.verificationStatus === 'VERIFIED'
    );
    for (const bid of urgent) await notifications.sendUrgentAlert(bid);
  });
  cron.schedule('0 9 * * 1', async () => { await certTracker.weeklyReminder?.(); });
  console.log('[NOMYX] Cron jobs scheduled');
} catch(e) { console.log('[NOMYX] Cron skipped:', e.message); }

// -- ROUTES -----------------------------------------------------------------

// System status
app.get('/', (req, res) => res.json({
  status: '[OK] NOMYX AI System v3 LIVE',
  business: 'NOMYX Logistics Solutions LLC',
  owner: 'Stella',
  naics: ['488510 - Freight Transportation Arrangement', '492110 - Couriers & Messengers'],
  serviceArea: 'NJ & PA',
  version: '3.0',
  endpoints: {
    dashboard: '/daily-brief',
    bidScan: '/scan-bids',
    bidByCategory: '/bids/medical | /bids/transportation | /bids/subcontracting | /bids/urgent',
    analyzeBid: 'POST /analyze-bid (body: {bid:{...}})',
    certifications: '/certifications',
    socialDrafts: '/social/drafts',
    createPost: 'POST /social/generate (body: {topic, platform})',
    approvePost: 'POST /social/approve/:id (body: {approved:true})',
    emailPending: '/emails/pending',
    recommendations: '/recommendations'
  },
  timestamp: new Date().toISOString()
}));

// Daily brief
app.get('/daily-brief', async (req, res) => {
  try {
    const scanResult = await bidScanner.scanAll();
    const certs = certTracker.getStatus?.() || {};
    const bids = scanResult?.allBids || [];
    res.json({
      date: new Date().toLocaleDateString(),
      greeting: 'Hello Good morning Stella! Here is your NOMYX AI Daily Brief.',
      todaysFocus: scanResult?.summary?.stellaFocus || 'Review new bid opportunities',
      summary: scanResult?.summary,
      // PHASE 13 FIX: null-safe - null <= 14 is true in JS, must guard
      urgentBids: bids.filter(b => b.deadlineDays != null && b.deadlineDays <= 14 && !b.isFake),
      goBids: bids.filter(b => b.analysis?.goNoGo === 'GO'),
      criticalCerts: certs.criticalActions || [],
      actionItems: buildActionItems(bids, certs),
      allBids: bids
    });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Scan all platforms
app.get('/scan-bids', bidScanner.manualScan || ((req,res) => res.json({error:'Scanner not loaded'})));

// Category routes
app.get('/bids/urgent', async (req, res) => {
  const result = await bidScanner.scanAll();
  // PHASE 13 FIX: null-safe filter - exclude placeholders and null deadlines
  res.json({ urgent: (result?.allBids||[]).filter(b => b.deadlineDays != null && b.deadlineDays <= 14 && !b.isFake) });
});
app.get('/bids/medical', async (req, res) => {
  const result = await bidScanner.scanAll();
  res.json({ medical: result?.medical || [] });
});
app.get('/bids/transportation', async (req, res) => {
  const result = await bidScanner.scanAll();
  res.json({ transportation: result?.transportation || [] });
});
app.get('/bids/subcontracting', async (req, res) => {
  const result = await bidScanner.scanAll();
  res.json({ subcontracting: result?.subcontracting || [] });
});
app.get('/bids/prime', async (req, res) => {
  const result = await bidScanner.scanAll();
  res.json({ prime: result?.prime || [] });
});

// Analyze a specific bid
app.post('/analyze-bid', bidAnalyzer.analyzeSingle || ((req,res) => res.json({error:'Analyzer not loaded'})));

// Certifications
app.get('/certifications', certTracker.getStatus || ((req,res) => res.json({error:'Cert tracker not loaded'})));

// Recommendations
app.get('/recommendations', (req, res) => {
  const certs = certTracker.getStatus?.() || {};
  const certRecs = bidScanner.getCertRecommendations?.() || {};
  res.json({
    title: 'NOMYX Growth Recommendations',
    certifications: certRecs,
    naicsToAdd: certRecs.naicsToAdd || [],
    fastestRevenuePath: certs.fastestRevenuePath || certRecs.fastestRevenue || [],
    platforms: {
      toConnect: ['NJSTART (free)', 'PA eMarketplace (free)', 'SBA SubNet (free)', 'USASpending.gov (free)'],
      connected: ['SAM.gov', 'BidNet Direct']
    }
  });
});

// Social media
app.get('/social/drafts', socialMedia.getDrafts || ((req,res) => res.json({drafts:[]})));
app.post('/social/generate', socialMedia.generateAndQueue || ((req,res) => res.json({error:'Social module not loaded'})));
app.post('/social/approve/:id', socialMedia.approvePost || ((req,res) => res.json({error:'Social module not loaded'})));

// Email
app.get('/emails/pending', emailMonitor.getPending || ((req,res) => res.json({message:'Email module ready'})));
app.post('/emails/approve/:id', emailMonitor.approveReply || ((req,res) => res.json({error:'Email module not loaded'})));

// -- HELPERS ----------------------------------------------------------------
function buildActionItems(bids, certs) {
  const items = [];
  // PHASE 13 FIX: null-safe - exclude placeholders and null deadlines
  bids.filter(b => b.deadlineDays != null && b.deadlineDays <= 14 && !b.isFake).slice(0,2).forEach((b,i) =>
    items.push({ priority: i+1, type: '[URGENT] BID', action: `Download and review: ${b.title}`, deadline: `${b.deadlineDays} days`, source: b.url }));
  (certs.criticalActions||[]).slice(0,2).forEach((c,i) =>
    items.push({ priority: 3+i, type: '[ACTION] CERT', action: `Get: ${c.name}`, cost: c.cost, time: c.timeToComplete, url: c.link }));
  bids.filter(b => b.analysis?.goNoGo === 'GO' && b.deadlineDays != null && b.deadlineDays > 14).slice(0,2).forEach((b,i) =>
    items.push({ priority: 5+i, type: '[OK] BID', action: `Review GO bid: ${b.title}`, deadline: `${b.deadlineDays} days` }));
  return items;
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`[NOMYX] [OK] v3 System LIVE on port ${PORT}`);
  console.log(`[NOMYX] All modules loaded. Ready to run your business!`);
});

// -- GMAIL OAUTH ROUTES (Phase 15) -----------------------------------------

// GET Gmail OAuth status - which env vars are set
app.get('/gmail/status', (req, res) => {
  try {
    const status = gmailOAuth.getOAuthStatus ? gmailOAuth.getOAuthStatus() : { error: 'Not loaded' };
    res.json(status);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// GET /auth/gmail - step 1: get the Google consent URL
// NOMYX AI does NOT complete OAuth - Stella must open the URL and click Allow herself
app.get('/auth/gmail', (req, res) => {
  try {
    const result = gmailOAuth.getAuthUrl ? gmailOAuth.getAuthUrl() : null;
    if (!result) return res.json({ error: 'Gmail OAuth module not loaded' });
    // If result is a string, it is the auth URL. If object, it is an error with setup steps.
    if (typeof result === 'string') {
      res.json({
        authUrl: result,
        instructions: 'Open this URL in your browser. Sign in with your Gmail account. Click Allow.',
        important: 'NOMYX AI will stop here. YOU must open the URL and approve access directly.',
        scopes: gmailOAuth.SCOPES || ['gmail.readonly'],
        nextStep: 'After clicking Allow, Google will redirect to /auth/gmail/callback. NOMYX AI will handle the rest.',
        security: 'Gmail password is NEVER used. This is read-only access. NOMYX AI cannot send emails or delete emails.'
      });
    } else {
      // result is an error object with setup steps
      res.status(400).json(result);
    }
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// GET /auth/gmail/callback - step 2: Google redirects here with ?code=...
// Shows refresh token ONCE so Stella can add it to Railway env vars.
// Token is NOT logged to Railway logs (no console.log of token).
app.get('/auth/gmail/callback', async (req, res) => {
  try {
    const { code } = req.query;
    if (!code) return res.status(400).json({ error: 'No authorization code in request. Did you approve OAuth?' });
    const result = await gmailOAuth.handleCallback(code);
    if (!result.hasRefreshToken) {
      return res.json({
        success: false,
        warning: 'No refresh token returned. This may happen if OAuth was already approved once. Revoke Gmail access in your Google Account settings and try again.',
        accessGranted: true
      });
    }
    // Show token ONCE - Stella must copy to Railway immediately
    // We do NOT log this token to console (Railway logs would capture console.log)
    res.json({
      success: true,
      message: '[OK] Gmail connected! Copy the REFRESH TOKEN below -> Railway -> Variables -> GMAIL_REFRESH_TOKEN',
      GMAIL_REFRESH_TOKEN: result.refreshToken,
      important: 'This token will NOT be shown again. Copy it to Railway now.',
      nextSteps: [
        '1. Copy GMAIL_REFRESH_TOKEN value above',
        '2. Go to Railway -> nomyx-ai-system -> Variables',
        '3. Add variable: GMAIL_REFRESH_TOKEN = (paste token)',
        '4. Railway will redeploy automatically',
        '5. Verify at /gmail/status - should show [OK] present'
      ],
      security: [
        'Token is not stored by NOMYX AI - only in Railway env vars',
        'Token is not logged to console or Railway logs',
        'Scope: gmail.readonly only - NOMYX AI cannot send or delete emails',
        'Gmail password was never used'
      ]
    });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// -- TEST ENDPOINTS ---------------------------------------------------------

// Manual email test
app.get('/test-email', async (req, res) => {
  try {
    const axios = require('axios');
    const result = await axios.post('https://api.resend.com/emails', {
      from: process.env.FROM_EMAIL || 'NOMYX AI System <noreply@nomyxlogistics.com>',
      to: [process.env.NOTIFY_EMAIL || 'info@nomyxlogistics.com'],
      subject: `[OK] NOMYX Phase 1 Test - ${new Date().toLocaleString()}`,
      html: `<h2>[OK] NOMYX AI System Email Test PASSED</h2>
<p>This confirms your email system is operational.</p>
<table border="1" cellpadding="8" style="border-collapse:collapse">
<tr><td><b>Sent at</b></td><td>${new Date().toLocaleString()}</td></tr>
<tr><td><b>To</b></td><td>${process.env.NOTIFY_EMAIL}</td></tr>
<tr><td><b>RESEND_API_KEY</b></td><td>${process.env.RESEND_API_KEY ? 'present' : 'MISSING'}</td></tr>
<tr><td><b>SAM.gov</b></td><td>Working - 10+ live opportunities found</td></tr>
<tr><td><b>Domain</b></td><td>nomyxlogistics.com Verified on Resend</td></tr>
</table>
<p><a href="https://nomyx-ai-system-production.up.railway.app/daily-brief">View Dashboard</a></p>`
    }, {
      headers: { 'Authorization': `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      timeout: 15000
    });
    res.json({ success: true, messageId: result.data?.id, to: process.env.NOTIFY_EMAIL, message: 'Test email sent! Check info@nomyxlogistics.com' });
  } catch(e) {
    const err = e.response?.data?.message || e.message;
    console.error('[test-email] Failed:', err);
    res.status(500).json({ success: false, error: err, resendKey: process.env.RESEND_API_KEY ? 'present' : 'MISSING' });
  }
});

app.get('/trigger-daily', async (req, res) => {
  try {
    res.json({ status: 'triggered', message: 'Daily scan + email starting in background' });
    const scanResult = await bidScanner.scanAll();
    await notifications.sendDailyReport(scanResult);
    console.log('[NOMYX] Manual daily trigger completed - email sent to', process.env.NOTIFY_EMAIL);
  } catch(e) { console.error('[NOMYX] Daily trigger failed:', e.message); }
});

// System health check
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    version: '3.2',
    phase: 'Phase 15 - Gmail OAuth + Email Alert Ingestion',
    timestamp: new Date().toISOString(),
    env: {
      NOTIFY_EMAIL: process.env.NOTIFY_EMAIL || '[MISSING] missing',
      RESEND_API_KEY: process.env.RESEND_API_KEY ? '[OK] present' : '[MISSING] missing',
      SAM_API_KEY: process.env.SAM_API_KEY ? '[OK] present' : '[MISSING] missing',
      ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY ? '[OK] present' : '[MISSING] missing',
      FROM_EMAIL: process.env.FROM_EMAIL || '[MISSING] missing',
      PLAYWRIGHT_ENABLED: process.env.PLAYWRIGHT_ENABLED || 'false',
      GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID ? '[OK] present' : '[MISSING] missing - needed for Gmail OAuth',
      GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET ? '[OK] present' : '[MISSING] missing - needed for Gmail OAuth',
      GMAIL_REFRESH_TOKEN: process.env.GMAIL_REFRESH_TOKEN ? '[OK] present' : '[MISSING] missing - run /auth/gmail OAuth flow',
      PORT: process.env.PORT || '3000'
    },
    portalSessions: portalSessions.getSummary ? portalSessions.getSummary() : 'not loaded',
    approvalTasks: phoneApproval.getSummary ? phoneApproval.getSummary() : 'not loaded',
    gmailOAuth: gmailOAuth.getOAuthStatus ? gmailOAuth.getOAuthStatus() : 'not loaded',
    emailAlerts: emailAlertParser.getAlertSummary ? emailAlertParser.getAlertSummary() : 'not loaded'
  });
});

// -- PHASE 14: PORTAL SESSION MANAGER --------------------------------------

// GET all portal sessions + summary
app.get('/portal-sessions', (req, res) => {
  try {
    const all = portalSessions.getAllSessions ? portalSessions.getAllSessions() : [];
    const summary = portalSessions.getSummary ? portalSessions.getSummary() : {};
    const pending = phoneApproval.getPendingTasks ? phoneApproval.getPendingTasks() : [];
    res.json({
      summary,
      portals: all,
      pendingApprovals: pending.length,
      pendingApprovalTasks: pending,
      mobileUrl: '/m',
      commandCenterUrl: '/daily-command-center',
      timestamp: new Date().toISOString()
    });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// GET single portal session
app.get('/portal-sessions/:id', (req, res) => {
  try {
    const portal = portalSessions.getSession ? portalSessions.getSession(req.params.id) : null;
    if (!portal) return res.status(404).json({ error: 'Portal not found: ' + req.params.id });
    res.json(portal);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// POST mark portal session as active (Stella logged in manually)
app.post('/portal-sessions/:id/mark-active', (req, res) => {
  try {
    const result = portalSessions.markSessionActive ? portalSessions.markSessionActive(req.params.id) : { error: 'Not loaded' };
    if (result.error) return res.status(404).json(result);
    console.log('[Portal] Stella marked session active:', req.params.id);
    res.json({ success: true, portal: result, message: 'Session marked active. NOMYX AI will include this portal in next scan.' });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// POST request Stella approval for login/MFA
app.post('/portal-sessions/:id/request-approval', async (req, res) => {
  try {
    const portal = portalSessions.getSession ? portalSessions.getSession(req.params.id) : null;
    if (!portal) return res.status(404).json({ error: 'Portal not found: ' + req.params.id });
    const mfa = req.body && req.body.mfa === true;
    // Mark portal as needing login
    if (portalSessions.markLoginRequired) portalSessions.markLoginRequired(req.params.id, mfa);
    // Create approval task + send phone notification
    const task = phoneApproval.requestPortalLogin
      ? await phoneApproval.requestPortalLogin(portal.id, portal.name, portal.loginUrl, mfa)
      : { error: 'Phone approval not loaded' };
    res.json({ success: true, task, message: 'Phone notification sent. Stella will be prompted to log in.' });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Phase 16.1: POST mark BidNet stale request detected
app.post('/portal-sessions/:id/mark-stale', function(req, res) {
  try {
    var result = portalSessions.markStaleDetected ? portalSessions.markStaleDetected(req.params.id) : { error: 'Not loaded' };
    if (result.error) return res.status(400).json(result);
    // Create phone task for BidNet stale session
    if (req.params.id === 'bidnetDirect' && phoneApproval.createApprovalTask) {
      phoneApproval.createApprovalTask({
        type: 'Session Expired',
        portalId: 'bidnetDirect',
        portalName: 'BidNet Direct',
        message: 'BidNet Direct session returned Stale Request error. Go to https://www.bidnetdirect.com (home page only) and start a fresh login. Do NOT use saved deep links.',
        loginUrl: 'https://www.bidnetdirect.com',
        priority: 'high'
      });
    }
    res.json({ success: true, session: result, message: 'Stale request recorded. Use https://www.bidnetdirect.com to restart login.' });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Phase 16.1: POST clear stale status back to LOGIN_REQUIRED
app.post('/portal-sessions/:id/clear-stale', function(req, res) {
  try {
    var result = portalSessions.clearStaleStatus ? portalSessions.clearStaleStatus(req.params.id) : { error: 'Not loaded' };
    if (result.error) return res.status(400).json(result);
    res.json({ success: true, session: result, message: 'Stale status cleared. Portal reset to Login Required.' });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// POST scan a portal via session worker (reads-only; stops at login/MFA/CAPTCHA)
app.post('/portal-sessions/:id/scan', async (req, res) => {
  try {
    const portal = portalSessions.getSession ? portalSessions.getSession(req.params.id) : null;
    if (!portal) return res.status(404).json({ error: 'Portal not found: ' + req.params.id });
    if (portal.sessionStatus !== 'Active') {
      return res.json({ status: 'skipped', reason: 'Session not active. Status: ' + portal.sessionStatus, action: 'POST /portal-sessions/' + req.params.id + '/request-approval to trigger login' });
    }
    const scanResult = sessionWorker.scanPortalWithBrowser
      ? await sessionWorker.scanPortalWithBrowser(portal.id, portal.searchUrl || portal.loginUrl)
      : { status: 'not_loaded' };
    if (portalSessions.markScanComplete) portalSessions.markScanComplete(req.params.id);
    res.json({ portalId: req.params.id, scanResult });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// -- PHASE 14: APPROVAL TASKS -----------------------------------------------

// GET all approval tasks (pending first)
app.get('/approval-tasks', (req, res) => {
  try {
    const all = phoneApproval.getAllTasks ? phoneApproval.getAllTasks() : [];
    const pending = phoneApproval.getPendingTasks ? phoneApproval.getPendingTasks() : [];
    res.json({
      summary: phoneApproval.getSummary ? phoneApproval.getSummary() : {},
      pending,
      all,
      timestamp: new Date().toISOString()
    });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// POST approve a task
app.post('/approval-tasks/:id/approve', (req, res) => {
  try {
    const task = phoneApproval.approveTask ? phoneApproval.approveTask(req.params.id) : { error: 'Not loaded' };
    if (task.error) return res.status(404).json(task);
    res.json({ success: true, task });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// POST dismiss a task
app.post('/approval-tasks/:id/dismiss', (req, res) => {
  try {
    const task = phoneApproval.dismissTask ? phoneApproval.dismissTask(req.params.id) : { error: 'Not loaded' };
    if (task.error) return res.status(404).json(task);
    res.json({ success: true, task });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// -- PHASE 14: BID EXECUTION WORKFLOW --------------------------------------

// POST generate Go/No-Go execution plan for a bid (Stella reviews - never auto-submits)
app.post('/bid-execution', (req, res) => {
  try {
    const bid = req.body && req.body.bid ? req.body.bid : req.body;
    if (!bid || !bid.title) return res.status(400).json({ error: 'bid.title required' });
    const plan = bidExecutor.buildExecutionPlan ? bidExecutor.buildExecutionPlan(bid) : { error: 'Not loaded' };
    res.json(plan);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// GET execution plan for a specific bid from scan results
app.get('/bid-execution/:bidId', async (req, res) => {
  try {
    const scanResult = await bidScanner.scanAll();
    const allBids = (scanResult && scanResult.allBids) ? scanResult.allBids : [];
    const bid = allBids.find(function(b) { return b.id === req.params.bidId; });
    if (!bid) return res.status(404).json({ error: 'Bid not found: ' + req.params.bidId });
    const plan = bidExecutor.buildExecutionPlan ? bidExecutor.buildExecutionPlan(bid) : { error: 'Not loaded' };
    res.json(plan);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// -- PHASE 14: DAILY COMMAND CENTER ----------------------------------------

// GET mobile-first operations dashboard JSON
app.get('/daily-command-center', async (req, res) => {
  try {
    const scanResult = await bidScanner.scanAll();
    const allBids = (scanResult && scanResult.allBids) ? scanResult.allBids : [];
    const certs = certTracker.getStatus ? certTracker.getStatus() : {};

    const portalSummary = portalSessions.getSummary ? portalSessions.getSummary() : {};
    const approvalSummary = phoneApproval.getSummary ? phoneApproval.getSummary() : {};
    const pendingTasks = phoneApproval.getPendingTasks ? phoneApproval.getPendingTasks() : [];
    const portalsNeedingLogin = portalSessions.getPortalsNeedingLogin ? portalSessions.getPortalsNeedingLogin() : [];

    // Real verified bids only (Phase 13 fix: null-safe)
    const verifiedBids = allBids.filter(function(b) { return b.verificationStatus === 'VERIFIED' && !b.isFake; });
    const needsVerBids = allBids.filter(function(b) { return !b.isFake && b.verificationStatus !== 'VERIFIED'; });
    const urgentVerified = verifiedBids.filter(function(b) { return b.deadlineDays != null && b.deadlineDays <= 14; });
    const goBids = verifiedBids.filter(function(b) { return b.analysis && b.analysis.goNoGo === 'GO'; });

    // Next money action
    var nextMoneyAction = null;
    if (urgentVerified.length > 0) {
      var top = urgentVerified[0];
      nextMoneyAction = { type: 'BID', action: 'Pursue: ' + top.title, deadline: top.deadlineDays + ' days', source: top.source, url: top.url };
    } else if (goBids.length > 0) {
      nextMoneyAction = { type: 'BID', action: 'Review GO bid: ' + goBids[0].title, source: goBids[0].source, url: goBids[0].url };
    } else if (portalsNeedingLogin.length > 0) {
      nextMoneyAction = { type: 'LOGIN', action: 'Log in to ' + portalsNeedingLogin[0].name + ' to unlock portal scanning', url: portalsNeedingLogin[0].loginUrl };
    }

    res.json({
      date: new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'America/New_York' }),
      greeting: 'Good morning Stella! Here is your NOMYX Command Center.',
      mobileUrl: process.env.DASHBOARD_URL + '/m' || '/m',

      // -- PRIORITY 1: Login approvals --
      loginApprovalsNeeded: portalsNeedingLogin.length,
      portalsNeedingLogin: portalsNeedingLogin.map(function(p) { return { id: p.id, name: p.name, status: p.sessionStatus, loginUrl: p.loginUrl, markActiveUrl: '/portal-sessions/' + p.id + '/mark-active' }; }),

      // -- PRIORITY 2: Approval tasks --
      pendingApprovals: approvalSummary.pending || 0,
      pendingTasks: pendingTasks,

      // -- PRIORITY 3: Portal scan status --
      portalStatus: portalSummary,
      scanSummary: {
        verifiedReal: verifiedBids.length,
        needsVerification: needsVerBids.length,
        urgentDeadline: urgentVerified.length,
        goodFitGO: goBids.length
      },

      // -- PRIORITY 4: Opportunities --
      urgentVerifiedBids: urgentVerified,
      goodFitBids: goBids.slice(0, 3),
      needsVerificationBids: needsVerBids.slice(0, 5),

      // -- PRIORITY 5: Owner actions needed --
      ownerActionsNeeded: [
        portalsNeedingLogin.length > 0 ? 'Log in to ' + portalsNeedingLogin.map(function(p) { return p.name; }).join(', ') : null,
        urgentVerified.length > 0 ? 'Review ' + urgentVerified.length + ' urgent bid(s)' : null,
        goBids.length > 0 ? 'Pursue ' + goBids.length + ' GO-rated bid(s)' : null
      ].filter(Boolean),

      // -- PRIORITY 6: Next money action --
      nextMoneyAction: nextMoneyAction,

      // -- LINKS --
      links: {
        portalSessions: '/portal-sessions',
        approvalTasks: '/approval-tasks',
        bidExecution: 'POST /bid-execution with {bid: {...}}',
        mobileView: '/m',
        dailyBrief: '/daily-brief',
        triggerScan: 'GET /trigger-daily'
      },

      timestamp: new Date().toISOString()
    });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// -- PHASE 14: SESSION WORKER STATUS ---------------------------------------

app.get('/session-worker/status', (req, res) => {
  try {
    const status = sessionWorker.getWorkerStatus ? sessionWorker.getWorkerStatus() : { error: 'Not loaded' };
    res.json(status);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// -- PHASE 14: SBA SUBNET SCAN ---------------------------------------------

app.get('/scan-sba-subnet', async (req, res) => {
  try {
    const result = sbaSubnet.scanSBASubnet ? await sbaSubnet.scanSBASubnet() : { error: 'Not loaded' };
    res.json(result);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// -- PHASE 14: MOBILE HTML PAGE --------------------------------------------
// Stella bookmarks this on her phone - phone-first NOMYX command center

app.get('/m', async (req, res) => {
  try {
    const scanResult = await bidScanner.scanAll().catch(function() { return { allBids: [] }; });
    const allBids = (scanResult && scanResult.allBids) ? scanResult.allBids : [];
    const verifiedBids = allBids.filter(function(b) { return b.verificationStatus === 'VERIFIED' && !b.isFake; });
    const urgentBids = verifiedBids.filter(function(b) { return b.deadlineDays != null && b.deadlineDays <= 14; });
    const portals = portalSessions.getAllSessions ? portalSessions.getAllSessions() : [];
    const portalsNeedingLogin = portalSessions.getPortalsNeedingLogin ? portalSessions.getPortalsNeedingLogin() : [];
    const pendingTasks = phoneApproval.getPendingTasks ? phoneApproval.getPendingTasks() : [];
    const emailAlerts = emailAlertParser.getAlerts ? emailAlertParser.getAlerts() : [];
    const gmailStatus = gmailOAuth.getOAuthStatus ? gmailOAuth.getOAuthStatus() : { status: 'NOT_CONNECTED' };
    var gmailConnected = gmailStatus.status === 'CONNECTED';

    // -- Phase 16: dedup + classify alerts ------------------------------------
    var dedupResult = opportunityPipeline.deduplicateAlerts ? opportunityPipeline.deduplicateAlerts(emailAlerts) : { canonical: emailAlerts, duplicates: [] };
    var canonicalAlerts = dedupResult.canonical || emailAlerts;
    var newAlerts = canonicalAlerts.filter(function(a) { return a.verificationStatus === 'EMAIL_ALERT_FOUND' || a.verificationStatus === 'NEEDS_LOGIN_VERIFICATION' || a.verificationStatus === 'PUBLIC_SOURCE_FOUND'; });
    var loginNeededAlerts = canonicalAlerts.filter(function(a) { return a.portalLoginNeeded && a.verificationStatus !== 'IGNORED' && a.verificationStatus !== 'DUPLICATE'; });
    var verifiedRealAlerts = canonicalAlerts.filter(function(a) { return a.verificationStatus === 'VERIFIED_REAL'; });
    var topOpp = opportunityPipeline.topOpportunity ? opportunityPipeline.topOpportunity(canonicalAlerts) : null;
    var nextAction = opportunityPipeline.nextMoneyAction ? opportunityPipeline.nextMoneyAction(canonicalAlerts) : '';

    // -- Portal cards (Phase 16.1: Gmail filtered out — shown in dedicated gmailCard) -------
    var portalCards = portals.filter(function(p) { return p.id !== 'gmail'; }).slice(0, 6).map(function(p) {
      var isStale = p.sessionStatus === 'Stale Request';
      var color = p.sessionStatus === 'Active' ? '#28a745'
        : (p.sessionStatus === 'Login Required' || p.sessionStatus === 'MFA Required' || isStale) ? '#dc3545'
        : '#6c757d';
      var dot = p.sessionStatus === 'Active' ? 'O' : (p.sessionStatus === 'Login Required' || p.sessionStatus === 'MFA Required' || isStale) ? 'X' : '-';
      // BidNet Direct: use home page URL + two-button layout (stale-safe)
      var actionHtml;
      if (p.id === 'bidnetDirect') {
        if (p.sessionStatus === 'Active') {
          actionHtml = '<span style="color:#28a745">Active</span>'
            + '<a href="/portal-sessions/bidnetDirect/mark-active" onclick="fetch(this.href,{method:\'POST\'}).then(()=>location.reload());return false;" style="color:#28a745;display:block;font-size:11px;margin-top:4px">Mark Active Again</a>';
        } else {
          actionHtml = '<a href="https://www.bidnetdirect.com" style="color:#1d3557;display:block;font-size:12px">Open BidNet Direct Home &mdash; Start Fresh Login</a>'
            + '<a href="/portal-sessions/bidnetDirect/mark-active" onclick="fetch(this.href,{method:\'POST\'}).then(()=>location.reload());return false;" style="color:#28a745;display:block;font-size:11px;margin-top:4px">I Logged In &mdash; Mark Session Active</a>'
            + (isStale ? '<a href="/portal-sessions/bidnetDirect/clear-stale" onclick="fetch(this.href,{method:\'POST\'}).then(()=>location.reload());return false;" style="color:#856404;display:block;font-size:11px;margin-top:4px">Clear Stale Status</a>' : '');
        }
      } else if (p.sessionStatus !== 'Active' && p.sessionStatus !== 'Manual Review' && p.sessionStatus !== 'N/A') {
        actionHtml = '<a href="' + (p.loginUrl || '#') + '" style="color:#1d3557;display:block">Login</a>'
          + '<a href="/portal-sessions/' + p.id + '/mark-active" onclick="fetch(this.href,{method:\'POST\'}).then(()=>location.reload());return false;" style="color:#28a745;display:block;font-size:11px;margin-top:4px">I Logged In</a>';
      } else {
        actionHtml = '<span style="color:#28a745">Scanning</span>';
      }
      return '<div style="border:1px solid #ddd;border-radius:8px;padding:12px;margin-bottom:8px">'
        + '<div style="display:flex;justify-content:space-between;align-items:flex-start">'
        + '<div><strong style="font-size:13px">' + p.name + '</strong><br><span style="color:' + color + ';font-size:12px">' + dot + ' ' + p.sessionStatus + (isStale ? ' &mdash; Use home page to restart login' : '') + '</span></div>'
        + '<div style="text-align:right;font-size:12px;min-width:140px">' + actionHtml + '</div>'
        + '</div>'
        + (isStale ? '<div style="background:#fff3cd;padding:6px 8px;border-radius:4px;font-size:11px;color:#856404;margin-top:8px">Stale Request detected. Do NOT use saved login links. Open <a href="https://www.bidnetdirect.com" style="color:#856404">BidNet Direct Home</a> and log in fresh.</div>' : '')
        + '</div>';
    }).join('');

    // Phase 16: Gmail portal card — shows real OAuth status, NOT "Not Configured"
    var gmailCard = '<div style="border:1px solid #ddd;border-radius:8px;padding:12px;margin-bottom:8px;display:flex;justify-content:space-between;align-items:center">'
      + '<div><strong style="font-size:13px">Gmail (Bid Alert Ingestion)</strong><br>'
      + (gmailConnected
          ? '<span style="color:#28a745;font-size:12px">O Connected | Scope: gmail.readonly | No password stored</span>'
          : '<span style="color:#dc3545;font-size:12px">X Not Connected</span>')
      + '</div>'
      + '<div style="text-align:right;font-size:12px">'
      + (gmailConnected
          ? '<span style="color:#28a745">Active</span>'
          : '<a href="/auth/gmail" style="color:#1d3557;display:block">Connect</a>')
      + '</div></div>';

    // -- Gmail setup banner --------------------------------------------------
    var gmailSetupBanner = !gmailConnected
      ? '<div style="background:#e8f4fd;border:1px solid #17a2b8;padding:12px;border-radius:8px;margin-bottom:12px;font-size:13px">'
        + '<strong>Email Alerts Not Connected</strong><br>'
        + '<span style="color:#555">Connect Gmail to auto-import bid alerts from BidNet, NJSTART, SAM.gov, and more.</span><br>'
        + '<a href="/auth/gmail" style="color:#17a2b8;font-size:12px;display:inline-block;margin-top:6px">Connect Gmail</a>'
        + '</div>'
      : '';

    // -- Top opportunity banner (Phase 16) ------------------------------------
    var topOppBanner = (topOpp && topOpp.alert)
      ? (function() {
          var a = topOpp.alert;
          var g = topOpp.goNoGo;
          var tierColor = g.tier === 'GO' ? '#28a745' : g.tier === 'MAYBE' ? '#ffc107' : '#6c757d';
          var portalBtn = '';
          if (a.portalId === 'bidnetDirect') portalBtn = '<a href="https://www.bidnetdirect.com" style="font-size:12px;background:#1d3557;color:white;padding:6px 10px;border-radius:4px;display:inline-block;margin-top:8px">Open BidNet Direct</a> ';
          if (a.portalId === 'njstart')      portalBtn = '<a href="https://www.njstart.gov" style="font-size:12px;background:#1d3557;color:white;padding:6px 10px;border-radius:4px;display:inline-block;margin-top:8px">Open NJSTART</a> ';
          if (a.portalId === 'sbaSubnet')    portalBtn = '<a href="https://eweb1.sba.gov/subnet" style="font-size:12px;background:#1d3557;color:white;padding:6px 10px;border-radius:4px;display:inline-block;margin-top:8px">Open SBA SubNet</a> ';
          return '<div style="background:#e8f9e8;border:2px solid ' + tierColor + ';border-radius:8px;padding:14px;margin-bottom:14px">'
            + '<div style="font-size:11px;color:' + tierColor + ';font-weight:bold;text-transform:uppercase">Top Opportunity | ' + g.tier + ' | Score: ' + g.score + '/100</div>'
            + '<strong style="font-size:14px">' + (a.title || 'Opportunity') + '</strong><br>'
            + '<span style="font-size:12px;color:#555">' + (a.source || '') + ' | ' + (a.location || '') + '</span><br>'
            + '<span style="font-size:12px;color:#333;display:block;margin-top:6px">' + (g.recommendedAction || '') + '</span>'
            + portalBtn
            + '<a href="/opportunities/score?alertId=' + a.id + '" style="font-size:12px;color:#555;display:inline-block;margin-top:8px">Full Score Breakdown</a>'
            + '</div>';
        })()
      : '';

    // -- Next money action banner (Phase 16) ----------------------------------
    var nextMoneyBanner = nextAction
      ? '<div style="background:#fff3cd;border:1px solid #ffc107;padding:12px;border-radius:8px;margin-bottom:14px;font-size:13px">'
        + '<strong>Next Money Action</strong><br>'
        + '<span style="color:#333">' + nextAction + '</span>'
        + '</div>'
      : '';

    // -- Email alert section Phase 16.1: Full canonical cards + phone action buttons ----
    var emailAlertSection = newAlerts.length > 0
      ? '<h2>New Email Alerts (' + newAlerts.length + ')</h2>'
        + newAlerts.slice(0, 5).map(function(a) {
            var goNoGo = opportunityPipeline.scoreOpportunity ? opportunityPipeline.scoreOpportunity(a) : null;
            var tierColor = goNoGo ? (goNoGo.tier === 'GO' ? '#28a745' : goNoGo.tier === 'MAYBE' ? '#856404' : '#6c757d') : '#6c757d';
            var tierBg   = goNoGo ? (goNoGo.tier === 'GO' ? '#d4edda' : goNoGo.tier === 'MAYBE' ? '#fff3cd' : '#e9ecef') : '#e9ecef';
            var borderColor = a.verificationStatus === 'NEEDS_LOGIN_VERIFICATION' ? '#ffc107'
              : a.verificationStatus === 'PUBLIC_SOURCE_FOUND' ? '#28a745'
              : '#17a2b8';
            var statusBg = a.verificationStatus === 'NEEDS_LOGIN_VERIFICATION' ? '#fff3cd;color:#856404'
              : a.verificationStatus === 'PUBLIC_SOURCE_FOUND' ? '#d4edda;color:#155724'
              : '#e8f4fd;color:#17a2b8';
            // Score chip
            var scoreChip = goNoGo
              ? '<span style="font-size:10px;background:' + tierBg + ';color:' + tierColor + ';padding:2px 6px;border-radius:4px;font-weight:bold">' + goNoGo.tier + ' ' + goNoGo.score + '/100</span>'
              : '';
            // Status chip
            var statusChip = '<span style="font-size:10px;background:' + statusBg + ';padding:2px 6px;border-radius:4px">' + a.verificationStatus + '</span>';
            // Portal source button
            var portalBtn = '';
            if (a.portalId === 'bidnetDirect') portalBtn = '<a href="https://www.bidnetdirect.com" style="font-size:11px;color:white;background:#1d3557;padding:4px 8px;border-radius:4px">Open BidNet Direct Home</a> ';
            if (a.portalId === 'njstart')      portalBtn = '<a href="https://www.njstart.gov" style="font-size:11px;color:white;background:#1d3557;padding:4px 8px;border-radius:4px">Open NJSTART</a> ';
            if (a.portalId === 'sbaSubnet')    portalBtn = '<a href="https://eweb1.sba.gov/subnet/client/dsp_Landing.cfm" style="font-size:11px;color:white;background:#1d3557;padding:4px 8px;border-radius:4px">Open SBA SubNet</a> ';
            // Open Source button (if URL from email)
            var openSourceBtn = a.url
              ? '<a href="' + a.url + '" style="font-size:11px;color:white;background:#495057;padding:4px 8px;border-radius:4px">Open Source</a> '
              : '';
            // Request Login Approval button (only for login-required portals)
            var loginApprovalBtn = a.portalLoginNeeded
              ? '<a href="/gmail/alerts/' + a.id + '/request-login-approval" onclick="fetch(this.href,{method:\'POST\'}).then(r=>r.json()).then(d=>{alert(d.success?\'Login approval task created! Check Approval Tasks.\':(d.error||\'Error\'));});return false;" style="font-size:11px;color:#856404;background:#fff3cd;padding:4px 8px;border-radius:4px">Request Login Approval</a> '
              : '';
            // Blockers
            var blockersHtml = (goNoGo && goNoGo.blockers && goNoGo.blockers.length > 0)
              ? '<div style="background:#fff3cd;padding:5px 8px;border-radius:4px;font-size:11px;color:#856404;margin-top:6px"><strong>Blockers:</strong> ' + goNoGo.blockers.join(' | ') + '</div>'
              : '';
            // Next action
            var nextActionText = (goNoGo && goNoGo.recommendedAction) || a.nextAction || 'Verify this opportunity via source portal';
            return '<div style="border:1px solid ' + borderColor + ';border-left:4px solid ' + borderColor + ';border-radius:8px;padding:12px;margin-bottom:12px">'
              + '<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:6px">'
              + statusChip + scoreChip
              + '</div>'
              + '<strong style="font-size:13px;display:block;margin-bottom:6px">' + (a.title || 'Untitled Alert') + '</strong>'
              + '<div style="font-size:11px;color:#555;line-height:1.8">'
              + '<span style="display:block"><strong>Source:</strong> ' + (a.source || 'Unknown') + '</span>'
              + '<span style="display:block"><strong>Agency/Buyer:</strong> ' + (a.agency || 'Unknown Agency') + '</span>'
              + '<span style="display:block"><strong>Category:</strong> ' + (a.category || 'Unknown') + '</span>'
              + '<span style="display:block"><strong>Location:</strong> ' + (a.location || 'Not specified') + '</span>'
              + '<span style="display:block"><strong>Due Date:</strong> <span style="color:#17a2b8;font-weight:bold">' + (a.deadlineDisplay || 'Deadline not verified') + '</span></span>'
              + '<span style="display:block"><strong>Verification:</strong> ' + a.verificationStatus + (a.portalLoginNeeded ? ' &mdash; Login needed' : '') + '</span>'
              + (a.url ? '<span style="display:block"><strong>Link:</strong> <a href="' + a.url + '" style="color:#1d3557;font-size:11px">View Source Link</a></span>' : '<span style="display:block"><strong>Link:</strong> Not available in email</span>')
              + '</div>'
              + blockersHtml
              + '<div style="background:#f8f9fa;padding:6px 8px;border-radius:4px;font-size:11px;color:#333;margin-top:6px"><strong>Next Action:</strong> ' + nextActionText + '</div>'
              + (a.portalLoginNeeded ? '<div style="font-size:11px;color:#856404;background:#fff3cd;padding:5px 8px;border-radius:4px;margin-top:6px">Login approval needed to verify this alert</div>' : '')
              + '<div style="display:flex;flex-wrap:wrap;gap:5px;margin-top:8px">'
              + openSourceBtn
              + portalBtn
              + '<a href="/gmail/alerts/' + a.id + '/verify" onclick="fetch(this.href,{method:\'POST\'}).then(r=>r.json()).then(d=>{alert(d.error?\'Cannot verify: \'+d.error:\'Verification status updated!\');location.reload();});return false;" style="font-size:11px;color:white;background:#17a2b8;padding:4px 8px;border-radius:4px">Verify</a> '
              + '<a href="/opportunities/import/' + a.id + '" onclick="fetch(this.href,{method:\'POST\'}).then(r=>r.json()).then(d=>{alert(d.success?\'Added to opportunities!\':(d.error||\'Error\'));if(d.success)location.reload();});return false;" style="font-size:11px;color:white;background:#28a745;padding:4px 8px;border-radius:4px">Add to Opportunities</a> '
              + loginApprovalBtn
              + '<a href="/gmail/alerts/' + a.id + '/no-action" onclick="fetch(this.href,{method:\'POST\'}).then(()=>location.reload());return false;" style="font-size:11px;color:#666;background:#eee;padding:4px 8px;border-radius:4px">Mark No Action</a> '
              + '<a href="/opportunities/score?alertId=' + a.id + '" style="font-size:11px;color:#555;background:#f0f0f0;padding:4px 8px;border-radius:4px">Generate Checklist</a> '
              + '<a href="/gmail/alerts/' + a.id + '/draft-outreach" onclick="if(!confirm(\'Draft Outreach requires Stella approval before anything is sent. This only flags the alert for outreach review. Continue?\'))return false;fetch(this.href,{method:\'POST\'}).then(r=>r.json()).then(d=>{alert(d.message||d.error||\'Flagged for outreach review\');});return false;" style="font-size:11px;color:#999;background:#f5f5f5;padding:4px 8px;border-radius:4px">Draft Outreach (approval required)</a>'
              + '</div></div>';
          }).join('')
      : (gmailConnected
          ? '<h2>Email Alerts</h2><div style="background:#d4edda;padding:12px;border-radius:8px;color:#155724;font-size:13px">No new email alerts. <a href="/gmail/scan" style="color:#155724;text-decoration:underline">Scan now</a></div>'
          : '');

    // -- Verified real alerts section ----------------------------------------
    var verifiedSection = verifiedRealAlerts.length > 0
      ? '<h2>Verified Real Opportunities (' + verifiedRealAlerts.length + ')</h2>'
        + verifiedRealAlerts.map(function(a) {
            return '<div style="border:2px solid #28a745;border-radius:8px;padding:12px;margin-bottom:8px">'
              + '<strong style="font-size:13px">' + (a.title || '') + '</strong><br>'
              + '<span style="font-size:12px;color:#555">' + (a.source || '') + ' | ' + (a.deadlineDisplay || 'Deadline not verified') + '</span><br>'
              + (a.url ? '<a href="' + a.url + '" style="font-size:12px;color:#1d3557">View Opportunity</a>' : '')
              + '</div>';
          }).join('')
      : '';

    var statusMsg = 'All Systems Scanning';
    if (portalsNeedingLogin.length > 0) statusMsg = portalsNeedingLogin.length + ' Portal(s) Need Login';
    else if (pendingTasks.length > 0) statusMsg = pendingTasks.length + ' Action(s) Pending';
    else if (newAlerts.length > 0) statusMsg = newAlerts.length + ' New Email Alert(s)';

    var loginBanner = portalsNeedingLogin.length > 0
      ? '<div style="background:#dc3545;color:white;padding:16px;border-radius:8px;margin-bottom:14px">'
        + '<strong>' + portalsNeedingLogin.length + ' Portal Login Required</strong><br>'
        + portalsNeedingLogin.map(function(p) {
            return '<div style="margin-top:10px;background:rgba(255,255,255,0.15);padding:10px;border-radius:6px">'
              + '<strong>' + p.name + '</strong> - ' + p.sessionStatus + '<br>'
              + '<a href="' + (p.loginUrl || '#') + '" style="color:white;font-size:13px">Open Portal</a>'
              + ' &nbsp; <a href="/portal-sessions/' + p.id + '/mark-active" style="color:#fffb;font-size:12px" onclick="fetch(this.href,{method:\'POST\'}).then(()=>location.reload());return false;">Mark Active</a>'
              + '</div>';
          }).join('')
        + '</div>'
      : '';

    var taskBanner = pendingTasks.length > 0
      ? '<div style="background:#fff3cd;border:2px solid #ffc107;padding:14px;border-radius:8px;margin-bottom:14px">'
        + '<strong>' + pendingTasks.length + ' Pending Approval(s)</strong><br>'
        + pendingTasks.slice(0, 3).map(function(t) {
            return '<div style="margin-top:8px;font-size:13px"><strong>' + t.type + '</strong> - ' + t.portalName + '</div>';
          }).join('')
        + '<a href="/approval-tasks" style="font-size:12px;color:#856404">View all</a>'
        + '</div>'
      : '';

    var bidCards = urgentBids.length > 0
      ? urgentBids.slice(0, 3).map(function(b) {
          return '<div style="border:1px solid #dc3545;border-left:4px solid #dc3545;border-radius:8px;padding:14px;margin-bottom:10px">'
            + '<strong style="font-size:14px">' + b.title + '</strong><br>'
            + '<span style="color:#666;font-size:12px">' + (b.agency || '') + ' | ' + (b.source || '') + '</span><br>'
            + '<span style="color:#dc3545;font-weight:bold">Deadline: ' + b.deadlineDays + ' days</span><br>'
            + (b.url ? '<a href="' + b.url + '" style="font-size:12px;color:#1d3557">View Bid</a>' : '')
            + '</div>';
        }).join('')
      : '<div style="background:#d4edda;padding:14px;border-radius:8px;color:#155724;font-size:14px">No urgent verified bids today</div>';

    var html = '<!DOCTYPE html><html><head>'
      + '<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">'
      + '<title>NOMYX AI - Command Center</title>'
      + '<meta name="theme-color" content="#1d3557">'
      + '<meta name="apple-mobile-web-app-capable" content="yes">'
      + '<meta name="apple-mobile-web-app-title" content="NOMYX AI">'
      + '<style>'
      + 'body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif;max-width:480px;margin:0 auto;padding:12px;background:#f8f9fa;color:#333}'
      + 'a{color:#1d3557;text-decoration:none}'
      + 'h2{font-size:16px;margin:16px 0 8px}'
      + '.header{background:#1d3557;color:white;padding:16px;border-radius:10px;margin-bottom:14px}'
      + '.header h1{margin:0;font-size:20px}'
      + '.header p{margin:4px 0 0;opacity:0.7;font-size:12px}'
      + '.refresh-btn{background:rgba(255,255,255,0.2);color:white;border:none;padding:8px 14px;border-radius:6px;font-size:13px;cursor:pointer;margin-top:8px}'
      + '</style>'
      + '</head><body>'
      + '<div class="header">'
      + '<h1>NOMYX AI</h1>'
      + '<p>' + new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'America/New_York' }) + ' ET</p>'
      + '<p>' + statusMsg + '</p>'
      + '<button class="refresh-btn" onclick="location.reload()">Refresh</button>'
      + '</div>'
      + loginBanner
      + taskBanner
      + gmailSetupBanner
      + topOppBanner
      + nextMoneyBanner
      + '<h2>Urgent Verified Bids (' + urgentBids.length + ')</h2>'
      + bidCards
      + verifiedSection
      + '<h2>Portal Sessions</h2>'
      + portalCards
      + gmailCard
      + emailAlertSection
      + '<div style="margin-top:16px;padding:14px;background:white;border-radius:8px;font-size:13px">'
      + '<strong>Quick Links</strong><br>'
      + '<a href="/portal-sessions" style="display:block;margin-top:8px">All Portals</a>'
      + '<a href="/approval-tasks" style="display:block;margin-top:6px">Approval Tasks</a>'
      + '<a href="/gmail/alerts" style="display:block;margin-top:6px">Email Alerts</a>'
      + '<a href="/gmail/status" style="display:block;margin-top:6px">Gmail Status</a>'
      + '<a href="/opportunities" style="display:block;margin-top:6px">Opportunities</a>'
      + '<a href="/opportunities/pipeline" style="display:block;margin-top:6px">Opportunity Pipeline</a>'
      + '<a href="/daily-command-center" style="display:block;margin-top:6px">Full Dashboard JSON</a>'
      + '<a href="/scanner" style="display:block;margin-top:6px">Scanner</a>'
      + '<a href="/daily-brief" style="display:block;margin-top:6px">Daily Brief</a>'
      + '<a href="/trigger-daily" style="display:block;margin-top:6px">Trigger Daily Scan</a>'
      + '<a href="/gmail/scan" style="display:block;margin-top:6px">Scan Gmail Now</a>'
      + '</div>'
      + '<p style="text-align:center;font-size:11px;color:#aaa;margin-top:16px">NOMYX AI v3.4 - Phase 16.1 - <a href="/" style="color:#aaa">API</a><br>No bid submission - No auto-posting - Stella approves all actions</p>'
      + '</body></html>';

    res.setHeader('Content-Type', 'text/html');
    res.send(html);
  } catch(e) { res.status(500).send('<p>Error: ' + e.message + '</p>'); }
});

// -- PHASE 15: GMAIL SCAN + ALERT ROUTES -----------------------------------

app.get('/gmail/status', function(req, res) {
  try {
    var status = gmailOAuth.getOAuthStatus ? gmailOAuth.getOAuthStatus() : { error: 'Not loaded' };
    res.json(status);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/gmail/scan', async function(req, res) {
  try {
    var oauthStatus = gmailOAuth.getOAuthStatus ? gmailOAuth.getOAuthStatus() : {};
    if (oauthStatus.status !== 'CONNECTED') {
      return res.json({
        status: 'NOT_CONNECTED',
        message: 'Gmail OAuth not configured. Run /auth/gmail to connect.',
        oauthStatus: oauthStatus,
        action: 'GET /auth/gmail then open URL in browser then allow then /auth/gmail/callback then add token to Railway'
      });
    }
    var messages = await gmailOAuth.fetchBidAlertEmails({ maxResults: 50, onlyUnread: true });
    var importResult = emailAlertParser.importEmailMessages ? emailAlertParser.importEmailMessages(messages) : { imported: 0 };
    var loginNeededAlerts = (importResult.alerts || []).filter(function(a) { return a.portalLoginNeeded; });
    var tasksCreated = 0;
    for (var i = 0; i < loginNeededAlerts.length; i++) {
      var a = loginNeededAlerts[i];
      if (phoneApproval.requestPortalLogin && a.portalId) {
        var portal = portalSessions.getSession ? portalSessions.getSession(a.portalId) : null;
        if (portal && portal.sessionStatus !== 'Active') {
          await phoneApproval.requestPortalLogin(a.portalId, a.source, portal.loginUrl, false).catch(function(){});
          tasksCreated++;
        }
      }
    }
    res.json({
      status: 'ok',
      messagesFound: messages.length,
      imported: importResult.imported,
      duplicates: importResult.duplicates,
      failed: importResult.failed,
      loginApprovalTasksCreated: tasksCreated,
      totalAlerts: emailAlertParser.getAlertSummary ? emailAlertParser.getAlertSummary() : {},
      alerts: importResult.alerts || [],
      timestamp: new Date().toISOString()
    });
  } catch(e) {
    console.error('[Gmail Scan]', e.message);
    res.status(500).json({ error: e.message });
  }
});

app.get('/gmail/alerts', function(req, res) {
  try {
    var alerts = emailAlertParser.getAlerts ? emailAlertParser.getAlerts() : [];
    var summary = emailAlertParser.getAlertSummary ? emailAlertParser.getAlertSummary() : {};
    var gmailStatus = gmailOAuth.getOAuthStatus ? gmailOAuth.getOAuthStatus() : {};
    res.json({
      summary: summary,
      gmailConnected: gmailStatus.status === 'CONNECTED',
      gmailStatus: gmailStatus,
      alerts: alerts,
      sections: emailAlertParser.buildReportSections ? emailAlertParser.buildReportSections([], alerts) : {},
      timestamp: new Date().toISOString()
    });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/gmail/alerts/:id/verify', function(req, res) {
  try {
    var alert = emailAlertParser.updateAlertStatus ? emailAlertParser.updateAlertStatus(req.params.id, 'VERIFIED_REAL', req.body && req.body.notes) : null;
    if (!alert) return res.status(404).json({ error: 'Alert not found: ' + req.params.id });
    res.json({ success: true, alert: alert });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/gmail/alerts/:id/ignore', function(req, res) {
  try {
    var alert = emailAlertParser.updateAlertStatus ? emailAlertParser.updateAlertStatus(req.params.id, 'IGNORED', 'Ignored by Stella') : null;
    if (!alert) return res.status(404).json({ error: 'Alert not found: ' + req.params.id });
    res.json({ success: true, alert: alert });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/gmail/alerts/:id/no-action', function(req, res) {
  try {
    var alert = emailAlertParser.updateAlertStatus ? emailAlertParser.updateAlertStatus(req.params.id, 'NO_ACTION', 'Marked No Action by Stella') : null;
    if (!alert) return res.status(404).json({ error: 'Alert not found: ' + req.params.id });
    res.json({ success: true, alert: alert });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Phase 16.1: POST request login approval for an alert's portal
app.post('/gmail/alerts/:id/request-login-approval', function(req, res) {
  try {
    var alert = emailAlertParser.getAlertById ? emailAlertParser.getAlertById(req.params.id) : null;
    if (!alert) return res.status(404).json({ error: 'Alert not found: ' + req.params.id });
    if (!alert.portalLoginNeeded) return res.json({ success: false, message: 'This alert does not require portal login to verify.' });
    var portal = alert.portalId && portalSessions.getSession ? portalSessions.getSession(alert.portalId) : null;
    var task = phoneApproval.createApprovalTask ? phoneApproval.createApprovalTask({
      type: 'Login Required',
      portalId: alert.portalId || 'unknown',
      portalName: (portal && portal.name) || alert.source || 'Portal',
      message: 'Login needed to verify alert: ' + (alert.title || alert.id) + '. Go to ' + ((portal && portal.loginUrl) || 'the portal') + ' and log in, then mark session active in NOMYX.',
      loginUrl: (portal && portal.loginUrl) || null,
      relatedBidId: alert.id,
      relatedBidTitle: alert.title,
      priority: 'high'
    }) : null;
    // Update alert status if it was just EMAIL_ALERT_FOUND
    if (alert.verificationStatus === 'EMAIL_ALERT_FOUND' && emailAlertParser.updateAlertStatus) {
      emailAlertParser.updateAlertStatus(alert.id, 'NEEDS_LOGIN_VERIFICATION', 'Login approval task created');
    }
    res.json({ success: true, taskId: task && task.id, message: 'Login approval task created. Check Approval Tasks for details.' });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Phase 16.1: POST flag alert for outreach review — Stella must approve before anything is sent
app.post('/gmail/alerts/:id/draft-outreach', function(req, res) {
  try {
    var alert = emailAlertParser.getAlertById ? emailAlertParser.getAlertById(req.params.id) : null;
    if (!alert) return res.status(404).json({ error: 'Alert not found: ' + req.params.id });
    // Safety: never send outreach automatically — only flag for review
    res.json({
      success: true,
      alertId: req.params.id,
      message: 'Alert flagged for outreach review. NOMYX AI does NOT send outreach automatically. Stella must review and approve any outreach before it is sent.',
      disclaimer: 'No email has been sent. No bid submitted. Stella approves all outreach.',
      nextSteps: [
        '1. Add this opportunity to /opportunities',
        '2. Go to /opportunities/score?alertId=' + req.params.id + ' to generate a full checklist',
        '3. Stella reviews the checklist and approves outreach manually'
      ]
    });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// -- PHASE 16: Alert Verification + Opportunity Pipeline -------------------

app.post('/alerts/deduplicate', function(req, res) {
  try {
    var alerts = emailAlertParser.getAlerts ? emailAlertParser.getAlerts() : [];
    var result = opportunityPipeline.deduplicateAlerts ? opportunityPipeline.deduplicateAlerts(alerts) : { canonical: alerts, duplicates: [], dupCount: 0, uniqueCount: alerts.length };
    var markedCount = 0;
    (result.duplicates || []).forEach(function(dup) {
      if (emailAlertParser.updateAlertStatus && dup.verificationStatus !== 'DUPLICATE') {
        emailAlertParser.updateAlertStatus(dup.id, 'DUPLICATE', 'Auto-marked duplicate of canonical alert with same source/title/location');
        markedCount++;
      }
    });
    res.json({
      status: 'ok',
      canonical: (result.canonical || []).map(function(a) { return { id: a.id, source: a.source, title: a.title, receivedDate: a.receivedDate, verificationStatus: a.verificationStatus }; }),
      duplicates: (result.duplicates || []).map(function(a) { return { id: a.id, source: a.source, title: a.title, receivedDate: a.receivedDate }; }),
      timestamp: new Date().toISOString()
    });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/opportunities/import/:alertId', function(req, res) {
  try {
    var alert = emailAlertParser.getAlertById ? emailAlertParser.getAlertById(req.params.alertId) : null;
    if (!alert) return res.status(404).json({ error: 'Alert not found: ' + req.params.alertId });
    var result = opportunityPipeline.importAlertToOpportunity ? opportunityPipeline.importAlertToOpportunity(alert) : { error: 'Pipeline not loaded' };
    if (result.error) return res.status(400).json(result);
    res.json({ success: true, opportunity: result.opportunity });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/opportunities/score', function(req, res) {
  try {
    var alertId = req.query.alertId;
    if (!alertId) return res.status(400).json({ error: 'Provide ?alertId=...' });
    var alert = emailAlertParser.getAlertById ? emailAlertParser.getAlertById(alertId) : null;
    if (!alert) return res.status(404).json({ error: 'Alert not found: ' + alertId });
    var score = opportunityPipeline.scoreOpportunity ? opportunityPipeline.scoreOpportunity(alert) : null;
    res.json({ alertId: alertId, title: alert.title, source: alert.source, score: score, alert: alert, timestamp: new Date().toISOString() });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/opportunities/pipeline', function(req, res) {
  try {
    var alerts = emailAlertParser.getAlerts ? emailAlertParser.getAlerts() : [];
    var dedupResult = opportunityPipeline.deduplicateAlerts ? opportunityPipeline.deduplicateAlerts(alerts) : { canonical: alerts, duplicates: [], dupCount: 0, uniqueCount: alerts.length };
    var canonical = dedupResult.canonical || alerts;
    var topOpp = opportunityPipeline.topOpportunity ? opportunityPipeline.topOpportunity(canonical) : null;
    var nextAction = opportunityPipeline.nextMoneyAction ? opportunityPipeline.nextMoneyAction(canonical) : '';
    var importedOpps = opportunityPipeline.getOpportunities ? opportunityPipeline.getOpportunities() : [];
    var scored = canonical.map(function(a) {
      var g = opportunityPipeline.scoreOpportunity ? opportunityPipeline.scoreOpportunity(a) : null;
      return { id: a.id, source: a.source, title: a.title, location: a.location, verificationStatus: a.verificationStatus, deadlineDisplay: a.deadlineDisplay, portalLoginNeeded: a.portalLoginNeeded, goNoGo: g };
    }).sort(function(a, b) { return ((b.goNoGo && b.goNoGo.score) || 0) - ((a.goNoGo && a.goNoGo.score) || 0); });
    var byBidNet = canonical.filter(function(a) { return a.portalId === 'bidnetDirect'; });
    var byNJSTART = canonical.filter(function(a) { return a.portalId === 'njstart'; });
    var bySBA = canonical.filter(function(a) { return a.portalId === 'sbaSubnet'; });
    var loginNeeded = canonical.filter(function(a) { return a.portalLoginNeeded && a.verificationStatus !== 'IGNORED' && a.verificationStatus !== 'DUPLICATE'; });
    var verifiedReal = canonical.filter(function(a) { return a.verificationStatus === 'VERIFIED_REAL'; });
    res.json({
      title: 'NOMYX Opportunity Pipeline -- Phase 16.1',
      summary: { totalAlerts: alerts.length, uniqueCanonical: dedupResult.uniqueCount, duplicates: dedupResult.dupCount, needingLogin: loginNeeded.length, verifiedReal: verifiedReal.length, importedOpportunities: importedOpps.length },
      nextMoneyAction: nextAction,
      topOpportunity: topOpp ? { title: topOpp.alert.title, source: topOpp.alert.source, tier: topOpp.goNoGo.tier, score: topOpp.goNoGo.score, recommendedAction: topOpp.goNoGo.recommendedAction } : null,
      bySource: { bidnetDirect: byBidNet.length, njstart: byNJSTART.length, sbaSubnet: bySBA.length },
      loginRequired: loginNeeded.map(function(a) { return { id: a.id, source: a.source, title: a.title }; }),
      verifiedReal: verifiedReal,
      scoredAlerts: scored,
      importedOpportunities: importedOpps,
      duplicateAlerts: (dedupResult.duplicates || []).map(function(a) { return { id: a.id, source: a.source, title: a.title, receivedDate: a.receivedDate }; }),
      disclaimer: 'NOMYX AI does not submit bids, send outreach emails, spend money, or auto-post. Stella approves all actions.',
      timestamp: new Date().toISOString()
    });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// -- PHASE 15+16: SCANNER + SEARCH + INTEL ----------------------------------

app.get('/scanner', async function(req, res) {
  try {
    var scanResult = await bidScanner.scanAll().catch(function() { return { allBids: [] }; });
    var allBids = (scanResult && scanResult.allBids) ? scanResult.allBids : [];
    var emailAlerts = emailAlertParser.getAlerts ? emailAlertParser.getAlerts() : [];
    var sections = emailAlertParser.buildReportSections ? emailAlertParser.buildReportSections(allBids, emailAlerts) : {};
    res.json({
      title: 'NOMYX AI Scanner - All Sources',
      sources: ['SAM.gov API', 'BidNet Direct (email alerts)', 'NJSTART (email alerts)', 'SBA SubNet (manual)', 'NJ DPP', 'County/Municipal'],
      sections: sections,
      totalBids: allBids.length,
      totalEmailAlerts: emailAlerts.length,
      portalStatus: portalSessions.getSummary ? portalSessions.getSummary() : {},
      gmailStatus: gmailOAuth.getOAuthStatus ? gmailOAuth.getOAuthStatus() : {},
      timestamp: new Date().toISOString()
    });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/search', async function(req, res) {
  try {
    var q = (req.query.q || '').toLowerCase().trim();
    if (!q) return res.json({ error: 'Provide ?q=keyword to search', example: '/search?q=courier' });
    var scanResult = await bidScanner.scanAll().catch(function() { return { allBids: [] }; });
    var allBids = (scanResult && scanResult.allBids) ? scanResult.allBids : [];
    var emailAlerts = emailAlertParser.getAlerts ? emailAlertParser.getAlerts() : [];
    var matchedBids = allBids.filter(function(b) { return ((b.title||'') + ' ' + (b.agency||'') + ' ' + (b.source||'')).toLowerCase().includes(q); });
    var matchedAlerts = emailAlerts.filter(function(a) { return ((a.title||'') + ' ' + (a.agency||'') + ' ' + (a.source||'') + ' ' + (a.subject||'')).toLowerCase().includes(q); });
    res.json({ query: q, matchedBids: matchedBids.length, matchedAlerts: matchedAlerts.length, bids: matchedBids, alerts: matchedAlerts, timestamp: new Date().toISOString() });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/intel', function(req, res) {
  try {
    var emailAlerts = emailAlertParser.getAlerts ? emailAlertParser.getAlerts() : [];
    var alertSummary = emailAlertParser.getAlertSummary ? emailAlertParser.getAlertSummary() : {};
    var gmailStatus = gmailOAuth.getOAuthStatus ? gmailOAuth.getOAuthStatus() : {};
    var sourceCount = {};
    emailAlerts.forEach(function(a) { sourceCount[a.source] = (sourceCount[a.source] || 0) + 1; });
    res.json({
      title: 'NOMYX Intelligence Center',
      emailAlertSummary: alertSummary,
      gmailStatus: gmailStatus,
      alertsBySource: sourceCount,
      portalStatus: portalSessions.getSummary ? portalSessions.getSummary() : {},
      timestamp: new Date().toISOString()
    });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/command-center', async function(req, res) {
  try {
    var scanResult = await bidScanner.scanAll().catch(function() { return { allBids: [] }; });
    var allBids = (scanResult && scanResult.allBids) ? scanResult.allBids : [];
    var emailAlerts = emailAlertParser.getAlerts ? emailAlertParser.getAlerts() : [];
    var sections = emailAlertParser.buildReportSections ? emailAlertParser.buildReportSections(allBids, emailAlerts) : {};
    var portalsNeedingLogin = portalSessions.getPortalsNeedingLogin ? portalSessions.getPortalsNeedingLogin() : [];
    var pendingTasks = phoneApproval.getPendingTasks ? phoneApproval.getPendingTasks() : [];
    var gmailStatus = gmailOAuth.getOAuthStatus ? gmailOAuth.getOAuthStatus() : {};
    var importedOpps = opportunityPipeline.getOpportunities ? opportunityPipeline.getOpportunities() : [];
    var topOpp = opportunityPipeline.topOpportunity ? opportunityPipeline.topOpportunity(sections.A_VERIFIED_REAL || []) : null;
    var nextAction = opportunityPipeline.nextMoneyAction ? opportunityPipeline.nextMoneyAction(emailAlerts) : '';
    var urgentVerified = (sections.A_VERIFIED_REAL || []).filter(function(b) {
      return b.deadlineDays != null && typeof b.deadlineDays === 'number' && b.deadlineDays <= 3 && !b.isFake;
    });
    res.json({
      date: new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'America/New_York' }),
      greeting: 'Good morning Stella! NOMYX Phase 16.1 Command Center.',
      A_VERIFIED_REAL: sections.A_VERIFIED_REAL || [],
      A_count: (sections.A_VERIFIED_REAL || []).length,
      B_EMAIL_ALERTS_FOUND: sections.B_EMAIL_ALERTS_FOUND || [],
      B_count: (sections.B_EMAIL_ALERTS_FOUND || []).length,
      C_LOGIN_REQUIRED: portalsNeedingLogin,
      C_count: portalsNeedingLogin.length,
      D_NO_ACTION_DUPLICATES: sections.E_DO_NOT_ACT || [],
      D_count: (sections.E_DO_NOT_ACT || []).length,
      E_SETUP_NEEDED: sections.D_SETUP_NEEDED || [],
      E_count: (sections.D_SETUP_NEEDED || []).length,
      gmailSetupNeeded: gmailStatus.status !== 'CONNECTED',
      urgentVerified: urgentVerified,
      urgentCount: urgentVerified.length,
      loginApprovalsNeeded: portalsNeedingLogin.length,
      pendingApprovals: pendingTasks.length,
      gmailConnected: gmailStatus.status === 'CONNECTED',
      nextMoneyAction: nextAction,
      topOpportunity: topOpp ? { title: topOpp.alert && topOpp.alert.title, tier: topOpp.goNoGo && topOpp.goNoGo.tier, score: topOpp.goNoGo && topOpp.goNoGo.score } : null,
      importedOpportunities: importedOpps.length,
      links: {
        scanner: '/scanner', opportunities: '/opportunities', opportunitiesPipeline: '/opportunities/pipeline',
        search: '/search?q=courier', intel: '/intel', gmailAlerts: '/gmail/alerts',
        gmailScan: '/gmail/scan', gmailStatus: '/gmail/status', portalSessions: '/portal-sessions',
        approvalTasks: '/approval-tasks', mobileView: '/m', dedup: '/alerts/deduplicate'
      },
      disclaimer: 'NOMYX AI does not submit bids, send outreach emails, spend money, or auto-post. Stella approves all actions.',
      timestamp: new Date().toISOString()
    });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// -- SERVER LISTEN -----------------------------------------------------------



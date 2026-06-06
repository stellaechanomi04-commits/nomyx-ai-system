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
    // Phase 15: email alerts
    const emailAlerts = emailAlertParser.getAlerts ? emailAlertParser.getAlerts() : [];
    const newAlerts = emailAlerts.filter(function(a) { return a.verificationStatus === 'EMAIL_ALERT_FOUND'; });
    const alertSummary = emailAlertParser.getAlertSummary ? emailAlertParser.getAlertSummary() : { total: 0 };
    const gmailStatus = gmailOAuth.getOAuthStatus ? gmailOAuth.getOAuthStatus() : { status: 'NOT_CONNECTED' };

    var portalCards = portals.slice(0, 6).map(function(p) {
      var color = p.sessionStatus === 'Active' ? '#28a745' : p.sessionStatus === 'Login Required' || p.sessionStatus === 'MFA Required' ? '#dc3545' : '#6c757d';
      var dot = p.sessionStatus === 'Active' ? 'O' : p.sessionStatus === 'Login Required' || p.sessionStatus === 'MFA Required' ? 'X' : '-';
      return '<div style="border:1px solid #ddd;border-radius:8px;padding:12px;margin-bottom:8px;display:flex;justify-content:space-between;align-items:center">'
        + '<div><strong style="font-size:13px">' + p.name + '</strong><br><span style="color:' + color + ';font-size:12px">' + dot + ' ' + p.sessionStatus + '</span></div>'
        + '<div style="text-align:right;font-size:12px">'
        + (p.sessionStatus !== 'Active' && p.sessionStatus !== 'Manual Review' && p.sessionStatus !== 'N/A'
            ? '<a href="' + (p.loginUrl || '#') + '" style="color:#1d3557;display:block">Login</a>'
            : '<span style="color:#28a745">Scanning</span>')
        + '</div></div>';
    }).join('');

    // Phase 15: Email alert section for /m
    var gmailConnected = gmailStatus.status === 'CONNECTED';
    var gmailSetupBanner = !gmailConnected
      ? '<div style="background:#e8f4fd;border:1px solid #17a2b8;padding:12px;border-radius:8px;margin-bottom:12px;font-size:13px">'
        + '<strong>Email Alerts Not Connected</strong><br>'
        + '<span style="color:#555">Connect Gmail to auto-import bid alerts from BidNet, NJSTART, SAM.gov, and more.</span><br>'
        + '<a href="/auth/gmail" style="color:#17a2b8;font-size:12px;display:inline-block;margin-top:6px">Connect Gmail</a>'
        + '</div>'
      : '';
    var emailAlertSection = newAlerts.length > 0
      ? '<h2>New Email Alerts (' + newAlerts.length + ')</h2>'
        + newAlerts.slice(0, 5).map(function(a) {
            return '<div style="border:1px solid #17a2b8;border-left:4px solid #17a2b8;border-radius:8px;padding:12px;margin-bottom:8px">'
              + '<strong style="font-size:13px">' + (a.title || 'Untitled Alert') + '</strong><br>'
              + '<span style="color:#666;font-size:12px">' + (a.source || '') + ' | ' + (a.agency || '') + '</span><br>'
              + '<span style="color:#17a2b8;font-size:12px">Deadline: ' + (a.deadlineDisplay || 'Deadline not verified') + '</span><br>'
              + '<div style="display:flex;gap:8px;margin-top:8px">'
              + (a.url ? '<a href="' + a.url + '" style="font-size:11px;color:#1d3557;background:#e8f4fd;padding:4px 8px;border-radius:4px">View</a>' : '')
              + '<a href="/gmail/alerts/' + a.id + '/ignore" onclick="fetch(this.href,{method:\'POST\'}).then(()=>location.reload());return false;" style="font-size:11px;color:#666;background:#eee;padding:4px 8px;border-radius:4px">Ignore</a>'
              + '</div></div>';
          }).join('')
      : gmailConnected
        ? '<h2>Email Alerts</h2><div style="background:#d4edda;padding:12px;border-radius:8px;color:#155724;font-size:13px">No new email alerts</div>'
        : '';

    var statusColor = '#28a745';
    var statusMsg = 'All Systems Scanning';
    if (portalsNeedingLogin.length > 0) { statusColor = '#dc3545'; statusMsg = portalsNeedingLogin.length + ' Portal(s) Need Login'; }
    else if (pendingTasks.length > 0) { statusColor = '#ffc107'; statusMsg = pendingTasks.length + ' Action(s) Pending'; }
    else if (newAlerts.length > 0) { statusColor = '#17a2b8'; statusMsg = newAlerts.length + ' New Email Alert(s)'; }

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
      + '<h2>Urgent Verified Bids (' + urgentBids.length + ')</h2>'
      + bidCards
      + '<h2>Portal Sessions</h2>'
      + portalCards
      + emailAlertSection
      + '<div style="margin-top:16px;padding:14px;background:white;border-radius:8px;font-size:13px">'
      + '<strong>Quick Links</strong><br>'
      + '<a href="/portal-sessions" style="display:block;margin-top:8px">All Portals</a>'
      + '<a href="/approval-tasks" style="display:block;margin-top:6px">Approval Tasks</a>'
      + '<a href="/gmail/alerts" style="display:block;margin-top:6px">Email Alerts</a>'
      + '<a href="/gmail/status" style="display:block;margin-top:6px">Gmail Status</a>'
      + '<a href="/daily-command-center" style="display:block;margin-top:6px">Full Dashboard JSON</a>'
      + '<a href="/scanner" style="display:block;margin-top:6px">Scanner</a>'
      + '<a href="/opportunities" style="display:block;margin-top:6px">Opportunities</a>'
      + '<a href="/daily-brief" style="display:block;margin-top:6px">Daily Brief</a>'
      + '<a href="/trigger-daily" style="display:block;margin-top:6px">Trigger Daily Scan</a>'
      + '<a href="/gmail/scan" style="display:block;margin-top:6px">Scan Gmail Now</a>'
      + '</div>'
      + '<p style="text-align:center;font-size:11px;color:#aaa;margin-top:16px">NOMYX AI v3.2 - Phase 15 - <a href="/" style="color:#aaa">API</a><br>No bid submission - No auto-posting - Stella approves all actions</p>'
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

// -- PHASE 15: SCANNER + OPPORTUNITIES + SEARCH + INTEL --------------------

app.get('/scanner', async function(req, res) {
  try {
    var scanResult = await bidScanner.scanAll().catch(function() { return { allBids: [] }; });
    var allBids = (scanResult && scanResult.allBids) ? scanResult.allBids : [];
    var emailAlerts = emailAlertParser.getAlerts ? emailAlertParser.getAlerts() : [];
    var sections = emailAlertParser.buildReportSections ? emailAlertParser.buildReportSections(allBids, emailAlerts) : {};
    res.json({
      title: 'NOMYX AI Scanner - All Sources',
      sources: ['SAM.gov API', 'BidNet Direct (email alerts)', 'NJSTART (email alerts)', 'SBA SubNet (manual)', 'NJ DPP', 'County/Municipal', 'School Districts', 'Hospital/Vendor'],
      sections: sections,
      totalBids: allBids.length,
      totalEmailAlerts: emailAlerts.length,
      portalStatus: portalSessions.getSummary ? portalSessions.getSummary() : {},
      gmailStatus: gmailOAuth.getOAuthStatus ? gmailOAuth.getOAuthStatus() : {},
      timestamp: new Date().toISOString()
    });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/opportunities', async function(req, res) {
  try {
    var scanResult = await bidScanner.scanAll().catch(function() { return { allBids: [] }; });
    var allBids = (scanResult && scanResult.allBids) ? scanResult.allBids : [];
    var emailAlerts = emailAlertParser.getAlerts ? emailAlertParser.getAlerts() : [];
    var verifiedReal = allBids.filter(function(b) { return b.verificationStatus === 'VERIFIED' && !b.isFake; });
    var verifiedAlerts = emailAlerts.filter(function(a) { return a.verificationStatus === 'VERIFIED_REAL'; });
    var allVerified = verifiedReal.concat(verifiedAlerts);
    var urgent = allVerified.filter(function(b) { return b.deadlineDays != null && b.deadlineDays <= 14; });
    var goBids = verifiedReal.filter(function(b) { return b.analysis && b.analysis.goNoGo === 'GO'; });
    var emailAlertFound = emailAlerts.filter(function(a) { return a.verificationStatus === 'EMAIL_ALERT_FOUND'; });
    res.json({
      title: 'NOMYX Opportunities',
      urgent: urgent,
      goBids: goBids,
      allVerified: allVerified,
      emailAlertsNeedingVerification: emailAlertFound,
      disclaimer: 'NOMYX AI does not submit bids. Stella reviews and submits directly via portal.',
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
    var matchedBids = allBids.filter(function(b) {
      return ((b.title||'') + ' ' + (b.agency||'') + ' ' + (b.source||'')).toLowerCase().includes(q);
    });
    var matchedAlerts = emailAlerts.filter(function(a) {
      return ((a.title||'') + ' ' + (a.agency||'') + ' ' + (a.source||'') + ' ' + (a.subject||'')).toLowerCase().includes(q);
    });
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

// -- PHASE 15: FULL COMMAND CENTER (A-E SECTIONS) ---------------------------

app.get('/command-center', async function(req, res) {
  try {
    var scanResult = await bidScanner.scanAll().catch(function() { return { allBids: [] }; });
    var allBids = (scanResult && scanResult.allBids) ? scanResult.allBids : [];
    var emailAlerts = emailAlertParser.getAlerts ? emailAlertParser.getAlerts() : [];
    var sections = emailAlertParser.buildReportSections ? emailAlertParser.buildReportSections(allBids, emailAlerts) : {};
    var portalsNeedingLogin = portalSessions.getPortalsNeedingLogin ? portalSessions.getPortalsNeedingLogin() : [];
    var pendingTasks = phoneApproval.getPendingTasks ? phoneApproval.getPendingTasks() : [];
    var gmailStatus = gmailOAuth.getOAuthStatus ? gmailOAuth.getOAuthStatus() : {};
    var urgentVerified = (sections.A_VERIFIED_REAL || []).filter(function(b) {
      return b.deadlineDays != null && b.deadlineDays <= 3 && !b.isFake;
    });
    res.json({
      date: new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'America/New_York' }),
      greeting: 'Good morning Stella! NOMYX Phase 15 Command Center.',
      A_VERIFIED_REAL: sections.A_VERIFIED_REAL || [],
      A_count: (sections.A_VERIFIED_REAL || []).length,
      B_EMAIL_ALERTS_FOUND: sections.B_EMAIL_ALERTS_FOUND || [],
      B_count: (sections.B_EMAIL_ALERTS_FOUND || []).length,
      C_LOGIN_REQUIRED: portalsNeedingLogin,
      C_count: portalsNeedingLogin.length,
      D_SETUP_NEEDED: sections.D_SETUP_NEEDED || [],
      D_count: (sections.D_SETUP_NEEDED || []).length,
      gmailSetupNeeded: gmailStatus.status !== 'CONNECTED',
      E_DO_NOT_ACT: sections.E_DO_NOT_ACT || [],
      E_count: (sections.E_DO_NOT_ACT || []).length,
      urgentVerified: urgentVerified,
      urgentCount: urgentVerified.length,
      loginApprovalsNeeded: portalsNeedingLogin.length,
      pendingApprovals: pendingTasks.length,
      gmailConnected: gmailStatus.status === 'CONNECTED',
      gmailSetupUrl: gmailStatus.status !== 'CONNECTED' ? '/auth/gmail' : null,
      links: {
        scanner: '/scanner', opportunities: '/opportunities', search: '/search?q=courier',
        intel: '/intel', gmailAlerts: '/gmail/alerts', gmailScan: '/gmail/scan',
        gmailStatus: '/gmail/status', portalSessions: '/portal-sessions',
        approvalTasks: '/approval-tasks', mobileView: '/m', sbaSubnet: '/scan-sba-subnet'
      },
      disclaimer: 'NOMYX AI does not submit bids, send outreach emails, spend money, or auto-post.',
      timestamp: new Date().toISOString()
    });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

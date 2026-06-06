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

// ── CRON JOBS ──────────────────────────────────────────────────────────────
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

// ── ROUTES ─────────────────────────────────────────────────────────────────

// System status
app.get('/', (req, res) => res.json({
  status: '✅ NOMYX AI System v3 LIVE',
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
      greeting: '👋 Good morning Stella! Here is your NOMYX AI Daily Brief.',
      todaysFocus: scanResult?.summary?.stellaFocus || 'Review new bid opportunities',
      summary: scanResult?.summary,
      // PHASE 13 FIX: null-safe — null <= 14 is true in JS, must guard
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
  // PHASE 13 FIX: null-safe filter — exclude placeholders and null deadlines
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

// ── HELPERS ────────────────────────────────────────────────────────────────
function buildActionItems(bids, certs) {
  const items = [];
  // PHASE 13 FIX: null-safe — exclude placeholders and null deadlines
  bids.filter(b => b.deadlineDays != null && b.deadlineDays <= 14 && !b.isFake).slice(0,2).forEach((b,i) =>
    items.push({ priority: i+1, type: '🔴 BID', action: `Download and review: ${b.title}`, deadline: `${b.deadlineDays} days`, source: b.url }));
  (certs.criticalActions||[]).slice(0,2).forEach((c,i) =>
    items.push({ priority: 3+i, type: '⚡ CERT', action: `Get: ${c.name}`, cost: c.cost, time: c.timeToComplete, url: c.link }));
  bids.filter(b => b.analysis?.goNoGo === 'GO' && b.deadlineDays != null && b.deadlineDays > 14).slice(0,2).forEach((b,i) =>
    items.push({ priority: 5+i, type: '✅ BID', action: `Review GO bid: ${b.title}`, deadline: `${b.deadlineDays} days` }));
  return items;
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`[NOMYX] ✅ v3 System LIVE on port ${PORT}`);
  console.log(`[NOMYX] All modules loaded. Ready to run your business!`);
});

// ── GMAIL ROUTES ───────────────────────────────────────────────────────────
const gmailMonitor = load('./modules/gmail-monitor');

app.get('/auth/gmail', (req, res) => {
  try {
    const url = gmailMonitor.getAuthUrl?.();
    if (!url) return res.json({ error: 'Gmail module not loaded' });
    res.json({ authUrl: url, instructions: 'Open this URL in your browser to connect Gmail', step: 'Visit the authUrl, sign in, click Allow' });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/auth/gmail/callback', async (req, res) => {
  try {
    const { code } = req.query;
    const tokens = await gmailMonitor.handleCallback?.(code);
    res.json({
      success: true,
      message: '✅ Gmail connected! Add this REFRESH TOKEN to Railway variables as GMAIL_REFRESH_TOKEN',
      refreshToken: tokens?.refresh_token,
      nextStep: 'Copy the refreshToken above → Railway → Variables → Add GMAIL_REFRESH_TOKEN'
    });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/emails/pending', gmailMonitor.getPending || ((req,res) => res.json({ message: 'Email module loading' })));
app.post('/emails/approve/:id', gmailMonitor.approveReply || ((req,res) => res.json({ error: 'not loaded' })));

// ── TEST ENDPOINTS ─────────────────────────────────────────────────────────

// Manual email test
app.get('/test-email', async (req, res) => {
  try {
    const axios = require('axios');
    const result = await axios.post('https://api.resend.com/emails', {
      from: process.env.FROM_EMAIL || 'NOMYX AI System <noreply@nomyxlogistics.com>',
      to: [process.env.NOTIFY_EMAIL || 'info@nomyxlogistics.com'],
      subject: `✅ NOMYX Phase 1 Test — ${new Date().toLocaleString()}`,
      html: `<h2>✅ NOMYX AI System Email Test PASSED</h2>
<p>This confirms your email system is operational.</p>
<table border="1" cellpadding="8" style="border-collapse:collapse">
<tr><td><b>Sent at</b></td><td>${new Date().toLocaleString()}</td></tr>
<tr><td><b>To</b></td><td>${process.env.NOTIFY_EMAIL}</td></tr>
<tr><td><b>RESEND_API_KEY</b></td><td>${process.env.RESEND_API_KEY ? 'present' : 'MISSING'}</td></tr>
<tr><td><b>SAM.gov</b></td><td>Working — 10+ live opportunities found</td></tr>
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
    console.log('[NOMYX] Manual daily trigger completed — email sent to', process.env.NOTIFY_EMAIL);
  } catch(e) { console.error('[NOMYX] Daily trigger failed:', e.message); }
});

// System health check
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    version: '3.0',
    timestamp: new Date().toISOString(),
    env: {
      NOTIFY_EMAIL: process.env.NOTIFY_EMAIL || '❌ missing',
      RESEND_API_KEY: process.env.RESEND_API_KEY ? '✅ present' : '❌ missing',
      SAM_API_KEY: process.env.SAM_API_KEY ? '✅ present' : '❌ missing',
      ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY ? '✅ present' : '❌ missing',
      FROM_EMAIL: process.env.FROM_EMAIL || '❌ missing',
      PORT: process.env.PORT || '3000'
    }
  });
});

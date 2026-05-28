// NOMYX Dashboard Routes
// Password-protected server-rendered dashboard

const express = require('express');
const router = express.Router();
const html = require('./dashboard-html');

// In-memory bid store and decisions (resets on redeploy — acceptable for Phase 2)
let cachedScanData = null;
let decisions = {};
let pendingApprovals = [];
let generatedPosts = [];

// ── AUTH MIDDLEWARE ────────────────────────────────────────────────────────
function requireLogin(req, res, next) {
  if (req.session && req.session.loggedIn) return next();
  res.redirect('/dashboard/login');
}

// ── LOGIN ──────────────────────────────────────────────────────────────────
router.get('/login', (req, res) => {
  if (req.session?.loggedIn) return res.redirect('/dashboard');
  res.send(html.loginPage());
});

router.post('/login', express.urlencoded({ extended: false }), (req, res) => {
  const password = req.body.password;
  const correctPassword = process.env.DASHBOARD_PASSWORD || 'nomyx2026';
  if (password === correctPassword) {
    req.session.loggedIn = true;
    req.session.loginTime = new Date().toISOString();
    res.redirect('/dashboard');
  } else {
    res.send(html.loginPage('Incorrect password. Please try again.'));
  }
});

router.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/dashboard/login');
});

// ── HOME ───────────────────────────────────────────────────────────────────
router.get('/', requireLogin, async (req, res) => {
  // Use cached data or trigger a scan
  if (!cachedScanData) {
    try {
      const bidScanner = require('./bid-scanner');
      cachedScanData = await bidScanner.scanAll();
    } catch(e) {
      console.error('[Dashboard] Scan error:', e.message);
    }
  }
  res.send(html.homePage(cachedScanData));
});

// ── MANUAL SCAN ────────────────────────────────────────────────────────────
router.get('/scan', requireLogin, async (req, res) => {
  try {
    const bidScanner = require('./bid-scanner');
    cachedScanData = await bidScanner.scanAll();
    res.redirect('/dashboard/bids');
  } catch(e) {
    res.send(html.page('Error', `<div class="card"><p style="color:#ff6b6b">Scan error: ${e.message}</p><br><a href="/dashboard" class="btn btn-primary">Back</a></div>`));
  }
});

// ── TEST EMAIL ─────────────────────────────────────────────────────────────
router.get('/test-email', requireLogin, async (req, res) => {
  try {
    const axios = require('axios');
    const result = await axios.post('https://api.resend.com/emails', {
      from: process.env.FROM_EMAIL || 'NOMYX AI <noreply@nomyxlogistics.com>',
      to: [process.env.NOTIFY_EMAIL || 'info@nomyxlogistics.com'],
      subject: `✅ NOMYX Dashboard Test — ${new Date().toLocaleString('en-US', {timeZone:'America/New_York'})} ET`,
      html: `<h2>✅ Dashboard Test Email</h2><p>Sent from NOMYX AI dashboard at ${new Date().toLocaleString('en-US', {timeZone:'America/New_York'})} Eastern Time.</p>`
    }, {
      headers: { 'Authorization': `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      timeout: 15000
    });
    res.send(html.page('Email Sent', `<div class="card"><div class="alert alert-ok">✅ Test email sent to ${process.env.NOTIFY_EMAIL}! Check your inbox.</div><p style="font-size:13px;color:#7a9bb5">Message ID: ${result.data?.id}</p><br><a href="/dashboard" class="btn btn-primary">← Back to Dashboard</a></div>`));
  } catch(e) {
    res.send(html.page('Email Error', `<div class="card"><div class="alert" style="background:#1a0000;border:1px solid #ff174444;color:#ff6b6b">❌ Email failed: ${e.response?.data?.message || e.message}</div><br><a href="/dashboard" class="btn btn-primary">← Back</a></div>`));
  }
});

// ── TRIGGER DAILY ──────────────────────────────────────────────────────────
router.get('/trigger', requireLogin, async (req, res) => {
  res.send(html.page('Triggered', `<div class="card"><div class="alert alert-ok">🚀 Daily scan + email triggered! Check info@nomyxlogistics.com in ~30 seconds.</div><br><a href="/dashboard" class="btn btn-primary">← Back</a></div>`));
  try {
    const bidScanner = require('./bid-scanner');
    const notifications = require('./notifications');
    cachedScanData = await bidScanner.scanAll();
    await notifications.sendDailyReport(cachedScanData);
  } catch(e) { console.error('[Dashboard] Trigger error:', e.message); }
});

// ── BIDS ───────────────────────────────────────────────────────────────────
router.get('/bids', requireLogin, async (req, res) => {
  if (!cachedScanData) {
    try {
      const bidScanner = require('./bid-scanner');
      cachedScanData = await bidScanner.scanAll();
    } catch(e) {}
  }
  const bids = (cachedScanData?.allBids || []).filter(b => decisions[b.id] !== 'NO-GO');
  res.send(html.bidsPage(bids, decisions));
});

// ── BID DETAIL ─────────────────────────────────────────────────────────────
router.get('/bid/:id', requireLogin, (req, res) => {
  const bid = (cachedScanData?.allBids || []).find(b => b.id === req.params.id);
  res.send(html.bidDetailPage(bid));
});

// ── BID DECISION ───────────────────────────────────────────────────────────
router.get('/bid/:id/decision', requireLogin, (req, res) => {
  const { d } = req.query;
  if (['GO', 'REVIEW', 'NO-GO'].includes(d)) {
    decisions[req.params.id] = d;
    console.log(`[Dashboard] Bid ${req.params.id} marked as ${d}`);
  }
  res.redirect('/dashboard/bids');
});

// ── APPROVALS ──────────────────────────────────────────────────────────────
router.get('/approvals', requireLogin, (req, res) => {
  res.send(html.approvalsPage(pendingApprovals));
});

// ── CONNECTIONS ────────────────────────────────────────────────────────────
router.get('/connections', requireLogin, (req, res) => {
  res.send(html.connectionsPage());
});

// ── SOCIAL ─────────────────────────────────────────────────────────────────
router.get('/social', requireLogin, (req, res) => {
  res.send(html.socialPage());
});

router.post('/social/generate', requireLogin, express.urlencoded({ extended: false }), async (req, res) => {
  const { business, topic, platform } = req.body;
  try {
    const axios = require('axios');
    const Anthropic = require('@anthropic-ai/sdk');
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const businessName = business === 'stellabella' ? 'Stella Bella Juicery' : 'NOMYX Logistics Solutions LLC';
    const prompt = `Create a professional ${platform} post for ${businessName}.
Topic: ${topic}
${business === 'stellabella' ? 'Tone: warm, health-focused, inviting. Juice bar in Florence NJ.' : 'Tone: professional, credible. Woman-owned logistics/government contracting company in NJ & PA.'}
Max 200 words. Include 3-5 relevant hashtags. Ready to copy-paste.`;

    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514', max_tokens: 400,
      messages: [{ role: 'user', content: prompt }]
    });
    const postText = response.content[0].text;
    const post = { id: `post_${Date.now()}`, business: businessName, platform, topic, postText, status: 'PENDING_APPROVAL', createdAt: new Date().toLocaleString() };
    generatedPosts.push(post);
    pendingApprovals.push({ id: post.id, title: `${platform} post for ${businessName}`, type: 'Social Media Post', preview: postText.substring(0, 200) + '...', createdAt: post.createdAt });

    res.send(html.page('Post Generated', `
<div class="card"><div class="card-title">✅ Post Generated — Awaiting Your Approval</div>
<div style="background:#060d14;border:1px solid #1e3a5f;border-radius:8px;padding:16px;margin:14px 0;white-space:pre-wrap;font-size:14px;color:#b2dfdb;line-height:1.7">${postText}</div>
<div style="font-size:13px;color:#7a9bb5;margin-bottom:14px">Platform: ${platform} · Business: ${businessName}</div>
<div style="display:flex;gap:10px;flex-wrap:wrap">
<a href="/dashboard/approvals" class="btn btn-go">✅ Go to Approval Center</a>
<a href="/dashboard/social" class="btn btn-primary">← Generate Another</a>
</div></div>`, 'social'));
  } catch(e) {
    res.send(html.page('Error', `<div class="card"><p style="color:#ff6b6b">Error: ${e.message}</p><a href="/dashboard/social" class="btn btn-primary">← Back</a></div>`));
  }
});

// ── APPROVE ACTION ─────────────────────────────────────────────────────────
router.get('/approve/:id', requireLogin, (req, res) => {
  const { action } = req.query;
  const item = pendingApprovals.find(p => p.id === req.params.id);
  if (item) {
    if (action === 'approve') {
      item.status = 'APPROVED — Connect social API to publish';
      res.send(html.page('Approved', `<div class="card"><div class="alert alert-ok">✅ Approved! Connect social media API to publish automatically, or copy the post text to publish manually.</div><br><a href="/dashboard/approvals" class="btn btn-primary">← Back to Approvals</a></div>`));
    } else if (action === 'reject') {
      pendingApprovals = pendingApprovals.filter(p => p.id !== req.params.id);
      res.redirect('/dashboard/approvals');
    } else {
      res.redirect('/dashboard/approvals');
    }
  } else {
    res.redirect('/dashboard/approvals');
  }
});

module.exports = router;
module.exports.getCachedScanData = () => cachedScanData;
module.exports.setCachedScanData = (data) => { cachedScanData = data; };

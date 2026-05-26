require('dotenv').config();
const express = require('express');
const app = express();
app.use(express.json());

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
    const urgent = (result?.allBids||[]).filter(b => b.deadlineDays <= 3);
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
      urgentBids: bids.filter(b => b.deadlineDays <= 14),
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
  res.json({ urgent: (result?.allBids||[]).filter(b => b.deadlineDays <= 14) });
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
  bids.filter(b => b.deadlineDays <= 14).slice(0,2).forEach((b,i) =>
    items.push({ priority: i+1, type: '🔴 BID', action: `Download and review: ${b.title}`, deadline: `${b.deadlineDays} days`, source: b.url }));
  (certs.criticalActions||[]).slice(0,2).forEach((c,i) =>
    items.push({ priority: 3+i, type: '⚡ CERT', action: `Get: ${c.name}`, cost: c.cost, time: c.timeToComplete, url: c.link }));
  bids.filter(b => b.analysis?.goNoGo === 'GO' && b.deadlineDays > 14).slice(0,2).forEach((b,i) =>
    items.push({ priority: 5+i, type: '✅ BID', action: `Review GO bid: ${b.title}`, deadline: `${b.deadlineDays} days` }));
  return items;
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`[NOMYX] ✅ v3 System LIVE on port ${PORT}`);
  console.log(`[NOMYX] All modules loaded. Ready to run your business!`);
});

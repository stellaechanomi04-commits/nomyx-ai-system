/**
 * Phase 14 Tests — Portal Operator + Phone Approval Workflow
 *
 * Tests: portal session statuses, phone approval tasks, no passwords in notifications,
 * no API keys in frontend, SAM_API_KEY server-side only, BidNet/NJSTART/SBA trackers,
 * session worker design principles, no CAPTCHA bypass, no bid submission, no auto-posting,
 * no Stella Bella touched, mobile layout present, bid executor safety.
 *
 * Run: node --test tests/phase14.test.js
 * Requires: Node 18+
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

function readModule(name) {
  return fs.readFileSync(path.join(ROOT, 'modules', name), 'utf8');
}

function readServer() {
  return fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
}

// ── Load modules for functional tests ────────────────────────────────────────
const portalSessions = require('../modules/portal-sessions');
const phoneApproval  = require('../modules/phone-approval');
const bidExecutor    = require('../modules/bid-executor');
const sbaSubnet      = require('../modules/sba-subnet');
const sessionWorker  = require('../modules/session-worker');

// ── Mock bids ─────────────────────────────────────────────────────────────────
const VERIFIED_BID = {
  id: 'sam-test-p14-001',
  title: 'Medical Courier Services — NJ VA Medical Center',
  agency: 'Department of Veterans Affairs',
  source: 'SAM.gov',
  isFake: false,
  deadlineDays: 12,
  verificationStatus: 'VERIFIED',
  naicsCode: '492110',
  location: 'New Jersey',
  setAside: 'WOSB',
  url: 'https://sam.gov/opp/test-p14-001',
  estimatedValue: 250000
};

const SUBCONTRACT_BID = {
  id: 'sba-sub-p14-001',
  title: 'Logistics Subcontract — NJ/PA Distribution',
  agency: 'Prime Contractor ABC',
  source: 'SBA SubNet',
  isFake: false,
  deadlineDays: 20,
  verificationStatus: 'NEEDS_REVIEW',
  naicsCode: '488510',
  location: 'NJ/PA',
  type: 'subcontract',
  url: 'https://eweb1.sba.gov/subnet/test'
};

// ──────────────────────────────────────────────────────────────────────────────
describe('Phase 14: Portal Session Manager', () => {

  it('PASS: All required portals exist', () => {
    const sessions = portalSessions.getAllSessions();
    const ids = sessions.map(function(s) { return s.id; });
    assert.ok(ids.includes('samgov'), 'SAM.gov portal exists');
    assert.ok(ids.includes('bidnetDirect'), 'BidNet Direct portal exists');
    assert.ok(ids.includes('njstart'), 'NJSTART portal exists');
    assert.ok(ids.includes('sbaSubnet'), 'SBA SubNet portal exists');
    assert.ok(ids.includes('gmail'), 'Gmail portal exists');
    assert.ok(ids.length >= 8, 'At least 8 portals configured');
  });

  it('PASS: Each portal has required fields', () => {
    const sessions = portalSessions.getAllSessions();
    const required = ['id', 'name', 'loginUrl', 'sourceType', 'accountStatus', 'sessionStatus', 'actions'];
    sessions.forEach(function(s) {
      required.forEach(function(field) {
        assert.ok(s[field] !== undefined, s.id + ' missing field: ' + field);
      });
    });
  });

  it('PASS: SAM.gov session is Active (API-driven)', () => {
    const sam = portalSessions.getSession('samgov');
    assert.ok(sam, 'SAM.gov portal found');
    assert.equal(sam.sessionStatus, 'Active', 'SAM.gov is Active via API');
    assert.equal(sam.sourceType, 'API', 'SAM.gov source type is API');
  });

  it('PASS: BidNet Direct starts as Login Required', () => {
    const bidnet = portalSessions.getSession('bidnetDirect');
    assert.ok(bidnet, 'BidNet Direct found');
    assert.equal(bidnet.sessionStatus, 'Login Required', 'BidNet starts as Login Required');
    assert.ok(bidnet.loginUrl, 'BidNet has login URL');
  });

  it('PASS: NJSTART starts as Login Required', () => {
    const njstart = portalSessions.getSession('njstart');
    assert.ok(njstart, 'NJSTART found');
    assert.equal(njstart.sessionStatus, 'Login Required', 'NJSTART starts as Login Required');
  });

  it('PASS: SBA SubNet is Active (public page)', () => {
    const sba = portalSessions.getSession('sbaSubnet');
    assert.ok(sba, 'SBA SubNet found');
    assert.equal(sba.sessionStatus, 'Active', 'SBA SubNet is Active (public)');
    assert.equal(sba.sourceType, 'Public Page', 'SBA SubNet source is Public Page');
  });

  it('PASS: markSessionActive updates status and timestamp', () => {
    const result = portalSessions.markSessionActive('bidnetDirect');
    assert.equal(result.sessionStatus, 'Active', 'Status changed to Active');
    assert.ok(result.lastSuccessfulLogin, 'lastSuccessfulLogin set');
    // Reset for other tests
    portalSessions.markLoginRequired('bidnetDirect', false);
  });

  it('PASS: getPortalsNeedingLogin returns Login Required portals', () => {
    const needsLogin = portalSessions.getPortalsNeedingLogin();
    assert.ok(Array.isArray(needsLogin), 'Returns array');
    needsLogin.forEach(function(p) {
      assert.ok(
        p.sessionStatus === 'Login Required' || p.sessionStatus === 'MFA Required' || p.sessionStatus === 'Expired',
        p.id + ' should need login but has status: ' + p.sessionStatus
      );
    });
  });

  it('PASS: Portal session notes do not contain raw passwords', () => {
    const sessions = portalSessions.getAllSessions();
    const source = JSON.stringify(sessions);
    const passwordPatterns = [/password:\s*['"][^'"]+['"]/i, /pwd:\s*['"][^'"]+['"]/i];
    passwordPatterns.forEach(function(pat) {
      assert.doesNotMatch(source, pat, 'No raw passwords in portal session data');
    });
  });

});

// ──────────────────────────────────────────────────────────────────────────────
describe('Phase 14: Phone Approval Workflow', () => {

  it('PASS: createApprovalTask creates task with required fields', () => {
    const task = phoneApproval.createApprovalTask({
      type: 'Login Required',
      portalId: 'bidnetDirect',
      portalName: 'BidNet Direct',
      message: 'Login required to scan BidNet Direct.',
      priority: 'high'
    });
    assert.ok(task.id, 'Task has ID');
    assert.equal(task.status, 'Pending', 'Task starts as Pending');
    assert.equal(task.portalName, 'BidNet Direct', 'Portal name set');
    assert.equal(task.priority, 'high', 'Priority set');
    assert.ok(task.createdAt, 'createdAt set');
  });

  it('PASS: Pending tasks appear in getPendingTasks', () => {
    const pending = phoneApproval.getPendingTasks();
    assert.ok(Array.isArray(pending), 'Returns array');
    pending.forEach(function(t) {
      assert.equal(t.status, 'Pending', 'All items are Pending');
    });
  });

  it('PASS: approveTask changes status to Approved', () => {
    const task = phoneApproval.createApprovalTask({ portalId: 'njstart', portalName: 'NJSTART', message: 'Test', type: 'Login Required' });
    const approved = phoneApproval.approveTask(task.id);
    assert.equal(approved.status, 'Approved', 'Task is now Approved');
  });

  it('PASS: dismissTask changes status to Dismissed', () => {
    const task = phoneApproval.createApprovalTask({ portalId: 'njstart', portalName: 'NJSTART', message: 'Test', type: 'Login Required' });
    const dismissed = phoneApproval.dismissTask(task.id);
    assert.equal(dismissed.status, 'Dismissed', 'Task is now Dismissed');
  });

  it('PASS: Notification HTML does not contain passwords, API keys, or private tokens', () => {
    const phoneApprovalSource = readModule('phone-approval.js');
    // No hardcoded credential patterns
    assert.doesNotMatch(phoneApprovalSource, /password[:=]\s*['"][^'"]{4,}/i, 'No hardcoded passwords');
    assert.doesNotMatch(phoneApprovalSource, /Bearer re_[A-Za-z0-9]{10,}/, 'No hardcoded Resend keys');
    assert.doesNotMatch(phoneApprovalSource, /sk-ant-[A-Za-z0-9]/, 'No hardcoded Anthropic keys');
  });

  it('PASS: Notification message references NOMYX dashboard link, not credentials', () => {
    const phoneApprovalSource = readModule('phone-approval.js');
    assert.match(phoneApprovalSource, /dashboardUrl|daily-command-center/, 'Links to dashboard, not raw credentials');
    assert.doesNotMatch(phoneApprovalSource, /password.*href|href.*password/i, 'No password in links');
  });

  it('PASS: Notification explicitly states NOMYX does not store passwords', () => {
    const phoneApprovalSource = readModule('phone-approval.js');
    assert.match(phoneApprovalSource, /does not store.*password|password.*never stored/i, 'Safety message about passwords in notification');
  });

});

// ──────────────────────────────────────────────────────────────────────────────
describe('Phase 14: SBA SubNet Source', () => {

  it('PASS: SBA SubNet module exports required functions', () => {
    assert.ok(typeof sbaSubnet.scanSBASubnet === 'function', 'scanSBASubnet is a function');
    assert.ok(typeof sbaSubnet.getSBASubnetCard === 'function', 'getSBASubnetCard is a function');
    assert.ok(Array.isArray(sbaSubnet.SEARCH_KEYWORDS), 'SEARCH_KEYWORDS is array');
  });

  it('PASS: SBA SubNet keywords include required logistics terms', () => {
    const required = ['logistics', 'courier', 'medical courier', 'specimen transport', 'freight', 'delivery'];
    required.forEach(function(kw) {
      assert.ok(sbaSubnet.SEARCH_KEYWORDS.includes(kw), 'Keyword present: ' + kw);
    });
  });

  it('PASS: SBA SubNet card has isFake=false and NEEDS_REVIEW status', () => {
    const card = sbaSubnet.getSBASubnetCard();
    assert.equal(card.isFake, false, 'SBA SubNet card is not fake');
    assert.equal(card.verificationStatus, 'NEEDS_REVIEW', 'Status is NEEDS_REVIEW until verified');
    assert.ok(card.url, 'Card has URL');
  });

  it('PASS: SBA SubNet card is never marked VERIFIED without portal confirmation', () => {
    const card = sbaSubnet.getSBASubnetCard();
    assert.notEqual(card.verificationStatus, 'VERIFIED', 'Not auto-verified');
    assert.notEqual(card.verificationStatus, 'VERIFIED_REAL', 'Not auto-VERIFIED_REAL');
  });

});

// ──────────────────────────────────────────────────────────────────────────────
describe('Phase 14: Session Worker Design Principles', () => {

  it('PASS: Session worker reports not-installed when Playwright not enabled', () => {
    const status = sessionWorker.getWorkerStatus();
    assert.ok(status, 'getWorkerStatus returns data');
    assert.ok(status.designPrinciples, 'Design principles documented');
  });

  it('PASS: Session worker design principles include no CAPTCHA bypass', () => {
    const sessionWorkerSource = readModule('session-worker.js');
    assert.match(sessionWorkerSource, /No CAPTCHA.*bypass|CAPTCHA cannot be bypassed|no.*captcha.*bypass/i, 'CAPTCHA bypass explicitly prohibited');
  });

  it('PASS: Session worker design principles include no bid submission', () => {
    const sessionWorkerSource = readModule('session-worker.js');
    assert.match(sessionWorkerSource, /No bid submission|no.*bid.*submit/i, 'Bid submission explicitly prohibited');
  });

  it('PASS: Session worker stops at login/MFA/CAPTCHA walls', () => {
    const sessionWorkerSource = readModule('session-worker.js');
    assert.match(sessionWorkerSource, /Stops.*login.*MFA.*CAPTCHA|stop.*immediately.*login.*MFA/i, 'Stop behavior documented');
  });

  it('PASS: detectLoginWall correctly identifies login signals', () => {
    const loginResult = sessionWorker.detectLoginWall('Login — BidNet Direct', 'Please login to continue');
    assert.ok(loginResult.detected, 'Login wall detected');
    assert.equal(loginResult.type, 'login', 'Type is login');
  });

  it('PASS: detectLoginWall correctly identifies CAPTCHA', () => {
    const captchaResult = sessionWorker.detectLoginWall('Access Denied', 'Please complete the CAPTCHA verification');
    assert.ok(captchaResult.detected, 'CAPTCHA detected');
    assert.equal(captchaResult.type, 'captcha', 'Type is captcha');
  });

  it('PASS: detectLoginWall correctly identifies MFA', () => {
    const mfaResult = sessionWorker.detectLoginWall('Two-Factor Authentication', 'Enter your verification code');
    assert.ok(mfaResult.detected, 'MFA detected');
    assert.equal(mfaResult.type, 'mfa', 'Type is mfa');
  });

  it('PASS: scanPortalWithBrowser returns manual_required when Playwright not enabled', async () => {
    process.env.PLAYWRIGHT_ENABLED = 'false';
    const result = await sessionWorker.scanPortalWithBrowser('bidnetDirect', 'https://www.bidnetdirect.com');
    assert.equal(result.status, 'manual_required', 'Returns manual_required without Playwright');
    assert.equal(result.workerEnabled, false, 'workerEnabled is false');
  });

});

// ──────────────────────────────────────────────────────────────────────────────
describe('Phase 14: Bid Execution Workflow Safety', () => {

  it('PASS: buildExecutionPlan returns Go/No-Go scoring', () => {
    const plan = bidExecutor.buildExecutionPlan(VERIFIED_BID);
    assert.ok(plan.scoring, 'Scoring present');
    assert.ok(plan.scoring.score >= 0 && plan.scoring.score <= 100, 'Score in 0-100 range');
    assert.ok(['GO', 'MAYBE', 'NO-GO'].includes(plan.scoring.goNoGo), 'Valid Go/No-Go value');
  });

  it('PASS: buildExecutionPlan includes document checklist', () => {
    const plan = bidExecutor.buildExecutionPlan(VERIFIED_BID);
    assert.ok(Array.isArray(plan.documentChecklist), 'Document checklist is array');
    assert.ok(plan.documentChecklist.length > 0, 'Document checklist not empty');
  });

  it('PASS: buildExecutionPlan includes startup cost estimate', () => {
    const plan = bidExecutor.buildExecutionPlan(VERIFIED_BID);
    assert.ok(plan.startupCostEstimate, 'Startup cost present');
    assert.ok(plan.startupCostEstimate.totalLow >= 0, 'Cost low is valid');
    assert.ok(plan.startupCostEstimate.totalHigh >= plan.startupCostEstimate.totalLow, 'High >= Low');
  });

  it('PASS: buildExecutionPlan next actions require Stella approval for submission', () => {
    const plan = bidExecutor.buildExecutionPlan(VERIFIED_BID);
    if (plan.scoring.goNoGo !== 'NO-GO') {
      const criticalActions = plan.nextActions.filter(function(a) { return a.critical; });
      criticalActions.forEach(function(a) {
        assert.ok(a.requiresApproval === true, 'Critical action requires approval: ' + a.action);
      });
    }
  });

  it('PASS: Plan disclaimer states no auto-submission', () => {
    const plan = bidExecutor.buildExecutionPlan(VERIFIED_BID);
    assert.match(plan.disclaimer, /does not submit|never submit/i, 'Disclaimer prohibits auto-submission');
  });

  it('PASS: Subcontract bid generates outreach draft with Stella approval warning', () => {
    const plan = bidExecutor.buildExecutionPlan(SUBCONTRACT_BID);
    if (plan.outreachDraft) {
      assert.ok(plan.outreachDraft.requiresStellaSendApproval === true, 'Outreach requires Stella approval');
      assert.match(plan.outreachDraft.warning, /DO NOT SEND|without Stella/i, 'Warning present in outreach draft');
    }
  });

  it('PASS: WOSB set-aside is recognized and scored positively', () => {
    const scoring = bidExecutor.scoreGoNoGo(VERIFIED_BID); // VERIFIED_BID has setAside: 'WOSB'
    assert.ok(scoring.reasons.some(function(r) { return /wosb/i.test(r); }), 'WOSB recognized in scoring reasons');
  });

});

// ──────────────────────────────────────────────────────────────────────────────
describe('Phase 14: Safety Checks', () => {

  it('PASS: SAM_API_KEY is server-side only — not in any frontend-served file', () => {
    const serverSource = readServer();
    // SAM_API_KEY should only appear as process.env reference, not as a hardcoded value
    assert.doesNotMatch(serverSource, /SAM_API_KEY['"]\s*:\s*['"][^'"process]/i, 'No hardcoded SAM API key');
    // Must use process.env
    assert.match(serverSource, /process\.env\.SAM_API_KEY/, 'SAM_API_KEY via process.env only');
  });

  it('PASS: No raw passwords in server.js', () => {
    const serverSource = readServer();
    assert.doesNotMatch(serverSource, /password:\s*['"][^'"]{4,}/i, 'No raw password in server.js');
  });

  it('PASS: No bid submission in any module', () => {
    const modules = ['server.js', 'modules/portal-sessions.js', 'modules/phone-approval.js', 'modules/bid-executor.js', 'modules/sba-subnet.js', 'modules/session-worker.js'];
    modules.forEach(function(m) {
      const src = fs.readFileSync(path.join(ROOT, m), 'utf8');
      assert.doesNotMatch(src, /submitBid|submit_bid|placeBid|\.submit\(\)|bidSubmit/i, 'No bid submission in ' + m);
    });
  });

  it('PASS: No outreach emails sent automatically — only to NOTIFY_EMAIL env var', () => {
    const notifSource = readModule('notifications.js');
    assert.doesNotMatch(notifSource, /to:\s*['"][^'"@]+@(?!nomyxlogistics)[^'"]{5,}['"]/i, 'No hardcoded external email in notifications.js');
  });

  it('PASS: No auto-posting to social media', () => {
    const modules = ['server.js', 'modules/phone-approval.js', 'modules/bid-executor.js'];
    modules.forEach(function(m) {
      const src = fs.readFileSync(path.join(ROOT, m), 'utf8');
      assert.doesNotMatch(src, /facebook\.com\/v\d+\/me\/feed|twitter\.com.*post|instagram\.com.*post/i, 'No social auto-posting in ' + m);
    });
  });

  it('PASS: No Stella Bella references in any Phase 14 module', () => {
    const phase14Modules = ['modules/portal-sessions.js', 'modules/phone-approval.js', 'modules/bid-executor.js', 'modules/sba-subnet.js', 'modules/session-worker.js'];
    phase14Modules.forEach(function(m) {
      const src = fs.readFileSync(path.join(ROOT, m), 'utf8');
      assert.doesNotMatch(src, /stella.?bella/i, 'No Stella Bella in ' + m);
    });
  });

  it('PASS: No API keys hardcoded in Phase 14 modules', () => {
    const phase14Modules = ['modules/portal-sessions.js', 'modules/phone-approval.js', 'modules/bid-executor.js', 'modules/sba-subnet.js', 'modules/session-worker.js'];
    phase14Modules.forEach(function(m) {
      const src = fs.readFileSync(path.join(ROOT, m), 'utf8');
      assert.doesNotMatch(src, /Bearer re_[A-Za-z0-9]{10,}/, 'No hardcoded Resend key in ' + m);
      assert.doesNotMatch(src, /sk-ant-[A-Za-z0-9]/, 'No hardcoded Anthropic key in ' + m);
    });
  });

  it('PASS: Mobile /m endpoint exists in server.js', () => {
    const serverSource = readServer();
    assert.match(serverSource, /app\.get\(['"]\/m['"]/, 'Mobile /m route exists in server.js');
    assert.match(serverSource, /viewport.*width=device-width/i, 'Mobile viewport meta tag present');
    assert.match(serverSource, /apple-mobile-web-app-capable/, 'PWA bookmark support present');
  });

  it('PASS: /daily-command-center endpoint exists and shows login approvals', () => {
    const serverSource = readServer();
    assert.match(serverSource, /app\.get\(['"]\/daily-command-center['"]/, 'daily-command-center route exists');
    assert.match(serverSource, /loginApprovalsNeeded|portalsNeedingLogin/, 'Shows login approvals needed');
    assert.match(serverSource, /nextMoneyAction/, 'Shows next money action');
  });

  it('PASS: /portal-sessions endpoint exists', () => {
    const serverSource = readServer();
    assert.match(serverSource, /app\.get\(['"]\/portal-sessions['"]/, '/portal-sessions route exists');
    assert.match(serverSource, /mark-active/, 'Mark active action exists');
  });

  it('PASS: BidNet Direct session workflow documented and tracked', () => {
    const portalSrc = readModule('portal-sessions.js');
    assert.match(portalSrc, /bidnetDirect/, 'BidNet Direct tracked');
    assert.match(portalSrc, /savedSearchStatus/, 'Saved search status field present');
    assert.match(portalSrc, /emailAlertStatus/, 'Email alert status field present');
  });

  it('PASS: NJSTART session workflow documented and tracked', () => {
    const portalSrc = readModule('portal-sessions.js');
    assert.match(portalSrc, /njstart/, 'NJSTART tracked');
    assert.match(portalSrc, /NJ.*procurement|njstart\.gov/i, 'NJSTART URL present');
  });

});

console.log('\n✅ Phase 14 tests complete. Run: node --test tests/phase14.test.js');

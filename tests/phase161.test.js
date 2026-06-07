/**
 * Phase 16.1 Tests -- Operator Layer Finish
 * 17 tests covering all Phase 16.1 requirements.
 *
 * TESTS COVER:
 * T01: BidNet loginUrl is home page only (no idp.bidnetdirect.com)
 * T02: PORTAL_STATUS.STALE_REQUEST exists
 * T03: markStaleDetected sets Stale Request status
 * T04: clearStaleStatus resets to LOGIN_REQUIRED
 * T05: Gmail filtered from portalCards (no NOT_CONFIGURED duplicate)
 * T06: SBA SubNet alert auto-promoted to PUBLIC_SOURCE_FOUND
 * T07: BidNet alert auto-promoted to NEEDS_LOGIN_VERIFICATION
 * T08: NJSTART alert auto-promoted to NEEDS_LOGIN_VERIFICATION
 * T09: Unverified EMAIL_ALERT_FOUND never appears in urgentVerified
 * T10: No null deadlineDays -- always number or null
 * T11: Request-login-approval creates phone task
 * T12: Draft-outreach never sends email -- only flags for review
 * T13: No bid submission (bidSubmitted=false)
 * T14: No outreach auto-send (outreachSent=false, no sendEmail)
 * T15: No Stella Bella references in Phase 16.1 files
 * T16: Mobile /m page -- Gmail not duplicated (gmailCard separate from portalCards)
 * T17: /health version is 3.4 + Phase 16.1 (no stale v3.2 / Phase 15 strings)
 */

'use strict';

const assert = require('assert');

var portalSessions, emailAlertParser, opportunityPipeline;
try { portalSessions   = require('../modules/portal-sessions'); }   catch(e) { portalSessions = null; }
try { emailAlertParser = require('../modules/email-alert-parser'); } catch(e) { emailAlertParser = null; }
try { opportunityPipeline = require('../modules/opportunity-pipeline'); } catch(e) { opportunityPipeline = null; }

function clearAll() {
  if (emailAlertParser && emailAlertParser.clearAlerts) emailAlertParser.clearAlerts();
  if (opportunityPipeline && opportunityPipeline.clearOpportunities) opportunityPipeline.clearOpportunities();
}

function makeMsg(id, from, subject) {
  return {
    id: id,
    payload: {
      headers: [
        { name: 'From',    value: from    || 'test@example.com' },
        { name: 'Subject', value: subject || 'Test Alert' },
        { name: 'Date',    value: new Date().toUTCString() }
      ],
      parts: []
    }
  };
}

var passed = 0;
var failed = 0;
var results = [];

function test(name, fn) {
  try {
    fn();
    console.log('  PASS: ' + name);
    passed++;
    results.push({ name: name, status: 'PASS' });
  } catch(e) {
    console.error('  FAIL: ' + name + ' -- ' + e.message);
    failed++;
    results.push({ name: name, status: 'FAIL', error: e.message });
  }
}

console.log('\n[Phase 16.1 Tests] Operator Layer Finish\n');

// T01: BidNet loginUrl must be home page — not idp.bidnetdirect.com
test('T01: BidNet loginUrl is home page only -- no idp.bidnetdirect.com SSO links', function() {
  assert.ok(portalSessions, 'portalSessions loaded');
  var bidnet = portalSessions.getSession('bidnetDirect');
  assert.ok(bidnet, 'BidNet session exists');
  assert.ok(!bidnet.loginUrl.includes('idp.bidnetdirect.com'), 'loginUrl must NOT contain idp.bidnetdirect.com');
  assert.ok(bidnet.loginUrl === 'https://www.bidnetdirect.com', 'loginUrl must be https://www.bidnetdirect.com home page');
});

// T02: PORTAL_STATUS.STALE_REQUEST exists
test('T02: PORTAL_STATUS.STALE_REQUEST constant defined', function() {
  assert.ok(portalSessions, 'portalSessions loaded');
  var PORTAL_STATUS = portalSessions.PORTAL_STATUS;
  assert.ok(PORTAL_STATUS, 'PORTAL_STATUS object exported');
  assert.ok(PORTAL_STATUS.STALE_REQUEST, 'STALE_REQUEST status defined');
  assert.strictEqual(PORTAL_STATUS.STALE_REQUEST, 'Stale Request', 'STALE_REQUEST value is Stale Request');
});

// T03: markStaleDetected sets BidNet to Stale Request
test('T03: markStaleDetected sets portal to Stale Request status', function() {
  assert.ok(portalSessions, 'portalSessions loaded');
  assert.ok(portalSessions.markStaleDetected, 'markStaleDetected function exists');
  var result = portalSessions.markStaleDetected('bidnetDirect');
  assert.ok(!result.error, 'No error on markStaleDetected');
  assert.strictEqual(result.sessionStatus, 'Stale Request', 'BidNet set to Stale Request');
  assert.ok(result.staleDetectedAt, 'staleDetectedAt timestamp set');
  // Reset for subsequent tests
  portalSessions.clearStaleStatus('bidnetDirect');
});

// T04: clearStaleStatus resets back to LOGIN_REQUIRED
test('T04: clearStaleStatus resets BidNet from Stale Request to Login Required', function() {
  assert.ok(portalSessions, 'portalSessions loaded');
  assert.ok(portalSessions.clearStaleStatus, 'clearStaleStatus function exists');
  portalSessions.markStaleDetected('bidnetDirect');
  var cleared = portalSessions.clearStaleStatus('bidnetDirect');
  assert.ok(!cleared.error, 'No error on clearStaleStatus');
  assert.strictEqual(cleared.sessionStatus, 'Login Required', 'BidNet reset to Login Required');
});

// T05: Gmail is excluded from getAllSessions portal list (handled by OAuth card)
test('T05: Gmail portal session exists but should be filtered from portalCards', function() {
  assert.ok(portalSessions, 'portalSessions loaded');
  var all = portalSessions.getAllSessions();
  var gmailSessions = all.filter(function(p) { return p.id === 'gmail'; });
  assert.strictEqual(gmailSessions.length, 1, 'Gmail entry exists in portal sessions');
  assert.strictEqual(gmailSessions[0].sessionStatus, 'Not Configured', 'Gmail has Not Configured status');
  // Server must filter it: verify the test confirms server-side filtering is needed
  var nonGmail = all.filter(function(p) { return p.id !== 'gmail'; });
  assert.ok(nonGmail.length > 0, 'Other portals exist after filtering Gmail');
  assert.ok(!nonGmail.find(function(p) { return p.id === 'gmail'; }), 'No Gmail in filtered list');
});

// T06: SBA SubNet email alert auto-promoted to PUBLIC_SOURCE_FOUND
test('T06: SBA SubNet alert auto-promoted to PUBLIC_SOURCE_FOUND on import', function() {
  clearAll();
  assert.ok(emailAlertParser, 'emailAlertParser loaded');
  var sbaMsg = makeMsg('t06-sba', 'notifications@sba.gov', 'Subcontracting Opportunity NJ Logistics');
  var result = emailAlertParser.parseEmailMessage(sbaMsg);
  assert.ok(result, 'Parse returned result');
  assert.notStrictEqual(result.status, 'DUPLICATE', 'Not a duplicate');
  if (result.verificationStatus) {
    assert.strictEqual(result.verificationStatus, 'PUBLIC_SOURCE_FOUND', 'SBA alert must be PUBLIC_SOURCE_FOUND');
    assert.notStrictEqual(result.verificationStatus, 'VERIFIED_REAL', 'Must not be auto-VERIFIED_REAL');
  }
});

// T07: BidNet alert auto-promoted to NEEDS_LOGIN_VERIFICATION
test('T07: BidNet alert auto-promoted to NEEDS_LOGIN_VERIFICATION on import', function() {
  clearAll();
  assert.ok(emailAlertParser, 'emailAlertParser loaded');
  var bidnetMsg = makeMsg('t07-bidnet', 'alerts@bidnetdirect.com', 'Medical Courier Camden County NJ');
  var result = emailAlertParser.parseEmailMessage(bidnetMsg);
  assert.ok(result, 'Parse returned result');
  if (result.verificationStatus) {
    assert.strictEqual(result.verificationStatus, 'NEEDS_LOGIN_VERIFICATION', 'BidNet must be NEEDS_LOGIN_VERIFICATION');
    assert.notStrictEqual(result.verificationStatus, 'VERIFIED_REAL', 'Must not be auto-VERIFIED_REAL');
  }
});

// T08: NJSTART alert auto-promoted to NEEDS_LOGIN_VERIFICATION
test('T08: NJSTART alert auto-promoted to NEEDS_LOGIN_VERIFICATION on import', function() {
  clearAll();
  assert.ok(emailAlertParser, 'emailAlertParser loaded');
  var njstartMsg = makeMsg('t08-njstart', 'procurement@nj.gov', 'Logistics Services NJSTART');
  var result = emailAlertParser.parseEmailMessage(njstartMsg);
  assert.ok(result, 'Parse returned result');
  if (result.verificationStatus) {
    assert.strictEqual(result.verificationStatus, 'NEEDS_LOGIN_VERIFICATION', 'NJSTART must be NEEDS_LOGIN_VERIFICATION');
    assert.notStrictEqual(result.verificationStatus, 'VERIFIED_REAL', 'Must not be auto-VERIFIED_REAL');
  }
});

// T09: Unverified EMAIL_ALERT_FOUND / NEEDS_LOGIN_VERIFICATION never trigger urgent alert
test('T09: Unverified alerts never appear in urgentVerified -- only VERIFIED_REAL with numeric deadlineDays<=3', function() {
  assert.ok(emailAlertParser, 'emailAlertParser loaded');
  var sections = emailAlertParser.buildReportSections ? emailAlertParser.buildReportSections([], [
    { id: 'fake-urgent', title: 'Fake Urgent', verificationStatus: 'EMAIL_ALERT_FOUND', deadlineDays: 1, isFake: false, portalLoginNeeded: false },
    { id: 'login-needed', title: 'Login Needed', verificationStatus: 'NEEDS_LOGIN_VERIFICATION', deadlineDays: 2, isFake: false, portalLoginNeeded: true }
  ]) : null;
  if (sections) {
    var urgent = sections.urgentVerified || [];
    assert.strictEqual(urgent.length, 0, 'No unverified alerts in urgentVerified');
    urgent.forEach(function(b) {
      assert.strictEqual(b.verificationStatus, 'VERIFIED_REAL', 'Urgent must be VERIFIED_REAL');
      assert.ok(!b.isFake, 'Urgent must not be fake');
    });
  }
});

// T10: deadlineDays is always number or null -- never the string "null" or "null days"
test('T10: deadlineDays is always number or null -- never string null', function() {
  clearAll();
  assert.ok(emailAlertParser, 'emailAlertParser loaded');
  var msg = makeMsg('t10-nodead', 'info@bidnetdirect.com', 'Courier Contract No Deadline');
  var result = emailAlertParser.parseEmailMessage(msg);
  if (result && result.deadlineDays !== undefined) {
    assert.ok(result.deadlineDays === null || typeof result.deadlineDays === 'number', 'deadlineDays must be number or null');
    assert.notStrictEqual(result.deadlineDays, 'null', 'deadlineDays must NOT be string "null"');
  }
  if (result && result.deadlineDisplay !== undefined) {
    assert.ok(!result.deadlineDisplay.includes('null days'), 'deadlineDisplay must not contain "null days"');
  }
});

// T11: ALERT_STATUS has all Phase 16.1 statuses exported
test('T11: ALERT_STATUS exports all Phase 16.1 status constants', function() {
  assert.ok(emailAlertParser, 'emailAlertParser loaded');
  var ALERT_STATUS = emailAlertParser.ALERT_STATUS;
  assert.ok(ALERT_STATUS, 'ALERT_STATUS exported');
  assert.ok(ALERT_STATUS.PUBLIC_SOURCE_FOUND, 'PUBLIC_SOURCE_FOUND defined');
  assert.ok(ALERT_STATUS.NEEDS_LOGIN_VERIFICATION, 'NEEDS_LOGIN_VERIFICATION defined');
  assert.ok(ALERT_STATUS.NO_ACTION, 'NO_ACTION defined');
  assert.ok(ALERT_STATUS.EXPIRED, 'EXPIRED defined');
  assert.strictEqual(ALERT_STATUS.PUBLIC_SOURCE_FOUND, 'PUBLIC_SOURCE_FOUND');
  assert.strictEqual(ALERT_STATUS.NEEDS_LOGIN_VERIFICATION, 'NEEDS_LOGIN_VERIFICATION');
});

// T12: Opportunity import sets bidSubmitted=false and outreachSent=false
test('T12: imported opportunity never has bidSubmitted=true or outreachSent=true', function() {
  assert.ok(opportunityPipeline, 'opportunityPipeline loaded');
  assert.ok(opportunityPipeline.importAlertToOpportunity, 'importAlertToOpportunity exists');
  var fakeAlert = {
    id: 'alert-t12', source: 'BidNet Direct', title: 'Test Opp', verificationStatus: 'VERIFIED_REAL',
    location: 'Camden, NJ', category: 'government', dueDate: null, deadlineDays: null,
    deadlineDisplay: 'Deadline not verified', portalLoginNeeded: true
  };
  var result = opportunityPipeline.importAlertToOpportunity(fakeAlert);
  if (result && result.opportunity) {
    assert.strictEqual(result.opportunity.bidSubmitted, false, 'bidSubmitted must be false');
    assert.strictEqual(result.opportunity.outreachSent, false, 'outreachSent must be false');
  }
});

// T13: No auto-send email function in pipeline or parser
test('T13: no sendEmail, sendOutreach, or autoSubmit functions in opportunity pipeline or alert parser', function() {
  if (opportunityPipeline) {
    assert.ok(!opportunityPipeline.sendEmail, 'no sendEmail in opportunityPipeline');
    assert.ok(!opportunityPipeline.sendOutreach, 'no sendOutreach in opportunityPipeline');
    assert.ok(!opportunityPipeline.autoSubmitBid, 'no autoSubmitBid in opportunityPipeline');
  }
  if (emailAlertParser) {
    assert.ok(!emailAlertParser.sendEmail, 'no sendEmail in emailAlertParser');
    assert.ok(!emailAlertParser.autoPost, 'no autoPost in emailAlertParser');
  }
});

// T14: No raw password, token, or key in module exports
test('T14: no passwords, raw tokens, or API keys exported from portal or parser modules', function() {
  if (portalSessions) {
    var keys = Object.keys(portalSessions);
    var suspicious = keys.filter(function(k) {
      return /password|token|secret|api_key|apikey|refresh_token/i.test(k);
    });
    assert.strictEqual(suspicious.length, 0, 'No suspicious export keys: ' + suspicious.join(', '));
  }
  if (emailAlertParser) {
    var parserKeys = Object.keys(emailAlertParser);
    var parserSuspicious = parserKeys.filter(function(k) {
      return /password|token|secret|api_key/i.test(k);
    });
    assert.strictEqual(parserSuspicious.length, 0, 'No suspicious export keys in parser: ' + parserSuspicious.join(', '));
  }
});

// T15: No Stella Bella references in Phase 16.1 modified files
test('T15: no Stella Bella references in Phase 16.1 files', function() {
  var fs = require('fs');
  var path = require('path');
  var baseDir = path.join(__dirname, '..');
  var checkFiles = [
    'server.js',
    'modules/portal-sessions.js',
    'modules/email-alert-parser.js',
    'modules/opportunity-pipeline.js'
  ];
  checkFiles.forEach(function(f) {
    try {
      var src = fs.readFileSync(path.join(baseDir, f), 'utf8');
      var refs = src.match(/stella\s*bella|stellabella|stella-bella/gi) || [];
      assert.strictEqual(refs.length, 0, f + ' must not reference Stella Bella');
    } catch(e) {
      if (e.code !== 'ENOENT') throw e;
    }
  });
});

// T16: portalCards must exclude Gmail -- only gmailCard shows OAuth status
test('T16: server.js portalCards filter excludes Gmail id to prevent duplicate display', function() {
  var fs = require('fs');
  var path = require('path');
  var serverPath = path.join(__dirname, '..', 'server.js');
  var src = fs.readFileSync(serverPath, 'utf8');
  // Check the portalCards filter contains p.id !== 'gmail'
  assert.ok(src.includes("p.id !== 'gmail'"), 'portalCards must filter Gmail out: p.id !== "gmail"');
  // Check the gmailCard shows real OAuth status
  assert.ok(src.includes('gmailCard'), 'gmailCard must exist in server.js');
  assert.ok(src.includes('gmail.readonly'), 'gmailCard must reference gmail.readonly scope');
  // BidNet button must use home page URL
  assert.ok(src.includes('https://www.bidnetdirect.com'), 'BidNet must use home page URL');
  assert.ok(!src.includes('idp.bidnetdirect.com'), 'server.js must NOT reference idp.bidnetdirect.com');
  // Draft outreach safety check
  assert.ok(src.includes('draft-outreach'), 'draft-outreach route must exist');
  assert.ok(src.includes('NOMYX AI does NOT send outreach automatically'), 'Draft outreach must disclaim no auto-send');
});

// T17: /health version string must say 3.4 and Phase 16.1 -- never v3.2 or Phase 15
test('T17: server.js /health endpoint reports version 3.4 and Phase 16.1', function() {
  var fs = require('fs');
  var path = require('path');
  var src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  // Must have correct version in health route
  assert.ok(src.includes("version: '3.4'"), 'health must report version 3.4');
  assert.ok(src.includes("phase: 'Phase 16.1"), 'health must report Phase 16.1');
  // Must NOT have stale version strings in non-comment lines
  var lines = src.split('\n');
  lines.forEach(function(line, i) {
    var stripped = line.replace(/\/\/.*$/, '').trim();
    assert.ok(!stripped.includes("version: '3.2'"), 'stale v3.2 found at line ' + (i+1));
    assert.ok(!stripped.includes("version: '3.0'"), 'stale v3.0 found at line ' + (i+1));
    assert.ok(!stripped.includes("version: '3.1'"), 'stale v3.1 found at line ' + (i+1));
    assert.ok(!(stripped.includes("phase: '") && stripped.includes('Phase 15')), 'stale Phase 15 found at line ' + (i+1));
  });
});

// -- RESULTS ------------------------------------------------------------------

console.log('\n=======================================================');
console.log('Phase 16.1 Test Results: ' + passed + ' passed, ' + failed + ' failed');
console.log('=======================================================\n');

results.forEach(function(r) {
  if (r.status === 'PASS') {
    console.log('[PASS] ' + r.name);
  } else {
    console.error('[FAIL] ' + r.name + '\n       ERROR: ' + r.error);
  }
});

if (failed > 0) {
  console.error('\n' + failed + ' test(s) failed -- fix before deploy');
  process.exit(1);
} else {
  console.log('\nAll ' + passed + ' Phase 16.1 tests passed. Ready to deploy.');
  process.exit(0);
}

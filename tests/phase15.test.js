/**
 * Phase 15 Tests - Gmail OAuth + Email Alert Ingestion
 * Run: node --test tests/phase15.test.js
 * All tests must pass before deploying to Railway.
 */

'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

function readFile(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf-8'); }
function loadModule(rel) { return require(path.join(ROOT, rel)); }

// ===========================================================================
// BLOCK 1: Gmail OAuth Module
// ===========================================================================
describe('Block 1: Gmail OAuth Module', () => {

  test('gmail-oauth.js exports required functions', () => {
    var m = loadModule('modules/gmail-oauth');
    assert.ok(typeof m.getAuthUrl === 'function', 'getAuthUrl must be a function');
    assert.ok(typeof m.handleCallback === 'function', 'handleCallback must be a function');
    assert.ok(typeof m.getOAuthStatus === 'function', 'getOAuthStatus must be a function');
    assert.ok(typeof m.fetchBidAlertEmails === 'function', 'fetchBidAlertEmails must be a function');
    assert.ok(typeof m.getAuthenticatedClient === 'function', 'getAuthenticatedClient must be a function');
  });

  test('getOAuthStatus returns required env var fields', () => {
    var m = loadModule('modules/gmail-oauth');
    var status = m.getOAuthStatus();
    assert.ok('googleClientId' in status, 'status must have googleClientId field');
    assert.ok('googleClientSecret' in status, 'status must have googleClientSecret field');
    assert.ok('gmailRefreshToken' in status, 'status must have gmailRefreshToken field');
    assert.ok('status' in status, 'status must have status field');
    assert.ok(
      status.status === 'CONNECTED' || status.status === 'NOT_CONNECTED',
      'status must be CONNECTED or NOT_CONNECTED'
    );
  });

  test('Gmail password is NEVER used - only OAuth2 readonly scope', () => {
    var src = readFile('modules/gmail-oauth.js');
    assert.ok(!src.includes('GMAIL_PASSWORD'), 'gmail-oauth.js must not reference GMAIL_PASSWORD env var');
    assert.ok(src.includes('gmail.readonly'), 'gmail-oauth.js must use readonly scope only');
    assert.ok(!src.includes('gmail.send'), 'gmail-oauth.js must not use gmail.send scope');
    assert.ok(!src.includes('gmail.modify'), 'gmail-oauth.js must not use gmail.modify scope');
  });

  test('OAuth tokens are not hardcoded or logged in gmail-oauth.js', () => {
    var src = readFile('modules/gmail-oauth.js');
    assert.ok(!src.match(/1\/\/[a-zA-Z0-9_\-]{20,}/), 'Must not contain hardcoded Google token format');
    assert.ok(!src.includes('console.log(tokens'), 'Must not log tokens to console');
    assert.ok(!src.includes('console.log(result.refreshToken'), 'Must not log refresh token to console');
  });

  test('Refresh token stored in Railway env var only - not committed', () => {
    var src = readFile('modules/gmail-oauth.js');
    assert.ok(src.includes('process.env.GMAIL_REFRESH_TOKEN'), 'Must read token from Railway env var');
    assert.ok(!src.match(/GMAIL_REFRESH_TOKEN\s*=\s*['"][a-zA-Z0-9]/), 'Must not hardcode token value');
  });

  test('getAuthUrl returns error object when env vars missing', () => {
    var savedId  = process.env.GOOGLE_CLIENT_ID;
    var savedSec = process.env.GOOGLE_CLIENT_SECRET;
    delete process.env.GOOGLE_CLIENT_ID;
    delete process.env.GOOGLE_CLIENT_SECRET;

    // Clear module cache to get fresh state
    var modPath = path.join(ROOT, 'modules/gmail-oauth');
    delete require.cache[require.resolve(modPath)];
    var fresh = require(modPath);
    var result = fresh.getAuthUrl();

    // Restore
    if (savedId)  process.env.GOOGLE_CLIENT_ID = savedId;
    if (savedSec) process.env.GOOGLE_CLIENT_SECRET = savedSec;

    assert.ok(
      typeof result === 'object' && result !== null,
      'getAuthUrl must return error object when env vars missing'
    );
    assert.ok(
      'error' in result || 'setupSteps' in result,
      'Must return error or setupSteps when credentials missing'
    );
  });

  test('SCOPES array exported and contains only gmail.readonly', () => {
    var m = loadModule('modules/gmail-oauth');
    assert.ok(Array.isArray(m.SCOPES), 'SCOPES must be an array');
    assert.ok(m.SCOPES.length > 0, 'SCOPES must not be empty');
    assert.ok(
      m.SCOPES.some(function(s) { return s.includes('gmail.readonly'); }),
      'SCOPES must include gmail.readonly'
    );
    assert.ok(
      !m.SCOPES.some(function(s) { return s.includes('gmail.send') || s.includes('gmail.modify'); }),
      'SCOPES must NOT include send or modify'
    );
  });

});

// ===========================================================================
// BLOCK 2: Email Alert Parser
// ===========================================================================
describe('Block 2: Email Alert Parser', () => {

  test('email-alert-parser.js exports required functions', () => {
    var m = loadModule('modules/email-alert-parser');
    assert.ok(typeof m.parseEmailMessage === 'function', 'parseEmailMessage must be a function');
    assert.ok(typeof m.importEmailMessages === 'function', 'importEmailMessages must be a function');
    assert.ok(typeof m.extractDueDate === 'function', 'extractDueDate must be a function');
    assert.ok(typeof m.getAlerts === 'function', 'getAlerts must be a function');
    assert.ok(typeof m.getAlertSummary === 'function', 'getAlertSummary must be a function');
    assert.ok(typeof m.buildReportSections === 'function', 'buildReportSections must be a function');
    assert.ok(typeof m.isDuplicate === 'function', 'isDuplicate must be a function');
    assert.ok(typeof m.detectSource === 'function', 'detectSource must be a function');
    assert.ok(typeof m.clearAlerts === 'function', 'clearAlerts must be a function');
  });

  test('BidNet alert emails are correctly detected', () => {
    var m = loadModule('modules/email-alert-parser');
    var info = m.detectSource('BidNet Direct Alerts <alerts@bidnetdirect.com>', 'New Bid Alert: Courier Services NJ', '');
    assert.strictEqual(info.source, 'BidNet Direct', 'Must detect BidNet Direct source');
    assert.strictEqual(info.portalId, 'bidnetDirect', 'Must map to bidnetDirect portal');
  });

  test('NJSTART alert emails are correctly detected', () => {
    var m = loadModule('modules/email-alert-parser');
    var info = m.detectSource('NJSTART <noreply@nj.gov>', 'Solicitation Alert: Transportation Services', '');
    assert.ok(
      info.source === 'NJSTART' || info.portalId === 'njstart',
      'Must detect NJSTART source'
    );
  });

  test('Missing due date shows "Deadline not verified" - never "null days"', () => {
    var m = loadModule('modules/email-alert-parser');
    m.clearAlerts();
    var mockMsg = {
      id: 'test-noduedate-' + Date.now(),
      payload: {
        headers: [
          { name: 'from',    value: 'BidNet Direct <alerts@bidnetdirect.com>' },
          { name: 'subject', value: 'New Opportunity: Courier Services' },
          { name: 'date',    value: new Date().toUTCString() }
        ],
        body: {
          data: Buffer.from('New bid available for courier services in NJ. No deadline mentioned.').toString('base64')
        }
      }
    };
    var alert = m.parseEmailMessage(mockMsg);
    assert.ok(alert && typeof alert.deadlineDisplay !== 'undefined', 'Alert must have deadlineDisplay');
    assert.ok(alert.deadlineDisplay !== 'null days', 'deadlineDisplay must never be "null days"');
    assert.ok(alert.deadlineDisplay !== String(null) + ' days', 'deadlineDisplay must never be "null days" via coercion');
    if (alert.deadlineDays === null) {
      assert.strictEqual(
        alert.deadlineDisplay,
        'Deadline not verified',
        'When deadlineDays is null, display must be "Deadline not verified"'
      );
    }
  });

  test('Email alerts default to EMAIL_ALERT_FOUND - never auto-VERIFIED_REAL', () => {
    var m = loadModule('modules/email-alert-parser');
    m.clearAlerts();
    var mockMsg = {
      id: 'test-defaultstatus-' + Date.now(),
      payload: {
        headers: [
          { name: 'from',    value: 'BidNet Direct <alerts@bidnetdirect.com>' },
          { name: 'subject', value: 'Logistics Bid Available' },
          { name: 'date',    value: new Date().toUTCString() }
        ],
        body: {
          data: Buffer.from('Logistics bid available for courier services in Camden NJ.').toString('base64')
        }
      }
    };
    var alert = m.parseEmailMessage(mockMsg);
    assert.ok(alert && alert.verificationStatus, 'parseEmailMessage must return an alert with verificationStatus');
    assert.strictEqual(alert.verificationStatus, 'EMAIL_ALERT_FOUND', 'Alert must default to EMAIL_ALERT_FOUND');
    assert.ok(alert.verificationStatus !== 'VERIFIED_REAL', 'Alert must never auto-set to VERIFIED_REAL');
    assert.ok(alert.verificationStatus !== 'VERIFIED', 'Alert must never auto-set to VERIFIED');
  });

  test('Duplicate email alerts are not imported twice', () => {
    var m = loadModule('modules/email-alert-parser');
    m.clearAlerts();
    var uniqueId = 'test-dedup-' + Date.now();
    var mockMsg = {
      id: uniqueId,
      payload: {
        headers: [
          { name: 'from',    value: 'BidNet Direct <alerts@bidnetdirect.com>' },
          { name: 'subject', value: 'Duplicate Test Alert' },
          { name: 'date',    value: new Date().toUTCString() }
        ],
        body: {
          data: Buffer.from('Courier services bid in NJ.').toString('base64')
        }
      }
    };
    var first  = m.parseEmailMessage(mockMsg);
    var second = m.parseEmailMessage(mockMsg); // Same messageId - must be duplicate
    assert.ok(first && first.verificationStatus === 'EMAIL_ALERT_FOUND', 'First import must succeed');
    assert.ok(second && second.status === 'DUPLICATE', 'Second import of same messageId must return DUPLICATE');
    var count = m.getAlerts().filter(function(a) { return a.messageId === uniqueId; }).length;
    assert.strictEqual(count, 1, 'Only one alert per messageId must be stored');
  });

  test('Unverified alerts do not appear in urgentVerified section', () => {
    var m = loadModule('modules/email-alert-parser');
    var alerts = [
      { id: 'ua1', verificationStatus: 'EMAIL_ALERT_FOUND', deadlineDays: 2, isFake: false },
      { id: 'ua2', verificationStatus: 'EMAIL_ALERT_FOUND', deadlineDays: null, isFake: false }
    ];
    var sections = m.buildReportSections([], alerts);
    assert.strictEqual(
      sections.urgentVerified.length,
      0,
      'Unverified EMAIL_ALERT_FOUND items must NOT appear in urgentVerified'
    );
  });

  test('Phone approval task needed when portal login required for verification', () => {
    var m = loadModule('modules/email-alert-parser');
    var bidnetInfo = m.detectSource('BidNet Direct <alerts@bidnetdirect.com>', 'Bid Alert', '');
    assert.strictEqual(m.needsPortalLogin(bidnetInfo), true, 'BidNet alerts must require portal login');
    var samInfo = m.detectSource('SAM.gov <noreply@sam.gov>', 'SAM Alert', '');
    assert.strictEqual(m.needsPortalLogin(samInfo), false, 'SAM.gov alerts should not require portal login');
  });

  test('ALERT_STATUS constants include all required statuses', () => {
    var m = loadModule('modules/email-alert-parser');
    assert.ok(m.ALERT_STATUS, 'ALERT_STATUS must be exported');
    assert.ok(m.ALERT_STATUS.EMAIL_ALERT_FOUND, 'Must have EMAIL_ALERT_FOUND');
    assert.ok(m.ALERT_STATUS.VERIFIED_REAL, 'Must have VERIFIED_REAL');
    assert.ok(m.ALERT_STATUS.LOGIN_REQUIRED, 'Must have LOGIN_REQUIRED');
    assert.ok(m.ALERT_STATUS.IGNORED, 'Must have IGNORED');
  });

});

// ===========================================================================
// BLOCK 3: Server.js Phase 15 Routes
// ===========================================================================
describe('Block 3: Server.js Phase 15 Routes', () => {

  test('server.js loads gmail-oauth and email-alert-parser', () => {
    var src = readFile('server.js');
    assert.ok(
      src.includes("gmail-oauth"),
      'server.js must load gmail-oauth module'
    );
    assert.ok(
      src.includes("email-alert-parser"),
      'server.js must load email-alert-parser module'
    );
  });

  test('/auth/gmail route exists in server.js', () => {
    var src = readFile('server.js');
    assert.ok(
      src.includes("'/auth/gmail'") || src.includes('"/auth/gmail"'),
      'server.js must have /auth/gmail route'
    );
  });

  test('/auth/gmail/callback route exists in server.js', () => {
    var src = readFile('server.js');
    assert.ok(src.includes('/auth/gmail/callback'), 'server.js must have /auth/gmail/callback route');
  });

  test('/gmail/scan route exists in server.js', () => {
    var src = readFile('server.js');
    assert.ok(src.includes("'/gmail/scan'") || src.includes('"/gmail/scan"'), 'server.js must have /gmail/scan route');
  });

  test('/gmail/alerts route exists in server.js', () => {
    var src = readFile('server.js');
    assert.ok(src.includes('/gmail/alerts'), 'server.js must have /gmail/alerts route');
  });

  test('/m page includes email alert section and Gmail setup', () => {
    var src = readFile('server.js');
    assert.ok(
      src.includes('emailAlertSection') || src.includes('gmail/alerts'),
      '/m must include email alert section'
    );
    assert.ok(
      src.includes('/auth/gmail') || src.includes('Connect Gmail') || src.includes('gmailSetupBanner'),
      '/m must reference Gmail setup'
    );
  });

  test('Command center includes all five report sections A-E', () => {
    var src = readFile('server.js');
    assert.ok(src.includes('A_VERIFIED_REAL'), 'Must include section A: VERIFIED REAL');
    assert.ok(src.includes('B_EMAIL_ALERTS_FOUND'), 'Must include section B: EMAIL ALERTS FOUND');
    assert.ok(
      src.includes('C_LOGIN_REQUIRED') || src.includes('loginApprovalsNeeded'),
      'Must include section C: LOGIN REQUIRED'
    );
    assert.ok(
      src.includes('D_SETUP_NEEDED') || src.includes('gmailSetupNeeded'),
      'Must include section D: SETUP NEEDED'
    );
    assert.ok(src.includes('E_DO_NOT_ACT'), 'Must include section E: DO NOT ACT ON');
  });

});

// ===========================================================================
// BLOCK 4: Safety Checks
// ===========================================================================
describe('Block 4: Safety Checks', () => {

  test('No bid submission in any Phase 15 module', () => {
    var files = ['modules/gmail-oauth.js', 'modules/email-alert-parser.js'];
    files.forEach(function(f) {
      var src = readFile(f);
      assert.ok(
        !src.includes('submitBid') && !src.includes('submit_bid') && !src.includes('placeBid'),
        f + ' must not contain bid submission code'
      );
    });
  });

  test('No outreach email sending in Phase 15 modules', () => {
    var oauthSrc = readFile('modules/gmail-oauth.js');
    assert.ok(!oauthSrc.includes('gmail.send'), 'gmail-oauth.js must not use gmail.send (readonly only)');
    var parserSrc = readFile('modules/email-alert-parser.js');
    assert.ok(
      !parserSrc.includes('sendOutreach') && !parserSrc.includes('outreach.send'),
      'email-alert-parser.js must not send outreach emails'
    );
  });

  test('No auto-posting in Phase 15 modules', () => {
    var files = ['modules/gmail-oauth.js', 'modules/email-alert-parser.js'];
    files.forEach(function(f) {
      var src = readFile(f);
      assert.ok(
        !src.includes('autoPost') && !src.includes('auto_post') && !src.includes('publishPost'),
        f + ' must not auto-post'
      );
    });
  });

  test('No Stella Bella references in Phase 15 modules or server.js', () => {
    var files = ['modules/gmail-oauth.js', 'modules/email-alert-parser.js', 'server.js'];
    files.forEach(function(f) {
      var src = readFile(f);
      assert.ok(
        !src.toLowerCase().includes('stella bella') && !src.includes('stella-bella'),
        f + ' must not reference Stella Bella'
      );
    });
  });

  test('No raw passwords stored in Phase 15 files', () => {
    var files = ['modules/gmail-oauth.js', 'modules/email-alert-parser.js'];
    files.forEach(function(f) {
      var src = readFile(f);
      assert.ok(!src.includes('GMAIL_PASSWORD'), f + ' must not reference GMAIL_PASSWORD');
    });
  });

  test('No secrets hardcoded in Phase 15 files', () => {
    var files = ['modules/gmail-oauth.js', 'modules/email-alert-parser.js'];
    files.forEach(function(f) {
      var src = readFile(f);
      assert.ok(!src.match(/1\/\/[a-zA-Z0-9_\-]{20,}/), f + ' must not contain hardcoded Google refresh token');
      assert.ok(
        !src.match(/client_secret\s*=\s*['"][a-zA-Z0-9_\-]{15,}/),
        f + ' must not hardcode client secret'
      );
    });
  });

  test('Mobile /m page has iPhone PWA meta tags', () => {
    var src = readFile('server.js');
    assert.ok(src.includes('apple-mobile-web-app-capable'), '/m must have apple-mobile-web-app-capable meta tag');
    assert.ok(src.includes('maximum-scale=1'), '/m must have mobile viewport with maximum-scale');
  });

  test('Phase 15 - server.js version or phase updated', () => {
    var src = readFile('server.js');
    assert.ok(
      src.includes('3.2') || src.includes('Phase 15'),
      'server.js must reference v3.2 or Phase 15'
    );
  });

});

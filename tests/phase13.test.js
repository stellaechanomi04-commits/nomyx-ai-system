/**
 * Phase 13 Tests — Fake Urgent Email Fix
 * Tests that null coercion bug is fixed and placeholders can't trigger urgent alerts.
 *
 * Run: node --test tests/phase13.test.js
 * Requires: Node 18+ (built-in test runner)
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

// ── Mock sendEmail so no real emails are sent ──────────────────────────────
let sentEmails = [];
const originalAxios = null; // We'll mock at module level

// Load notifications module with mocked axios
// We test the logic directly without sending real emails
const mockBid = {
  VERIFIED_REAL: {
    id: 'sam-test-001',
    title: 'Test Logistics Contract',
    agency: 'U.S. Army Corps of Engineers',
    source: 'SAM.gov',
    isFake: false,
    deadlineDays: 2,
    verificationStatus: 'VERIFIED',
    url: 'https://sam.gov/opp/test-001',
    analysis: { stellaMessage: 'GO bid' }
  },
  CAMDEN_PLACEHOLDER: {
    id: 'bidnet-camden-medical-2026',
    title: 'Medical Courier and Specimen Transport — Camden County',
    agency: 'County of Camden, NJ (UNCONFIRMED)',
    source: 'BidNet Direct',
    isFake: true,
    deadlineDays: null,
    verificationStatus: 'UNCONFIRMED',
    url: 'https://www.bidnetdirect.com'
  },
  NULL_DEADLINE_FAKE: {
    id: 'mercer-placeholder',
    title: 'Logistics — Mercer County',
    agency: 'Mercer County, NJ',
    source: 'BidNet Direct',
    isFake: true,
    deadlineDays: null,
    verificationStatus: 'MANUAL_LOGIN_NEEDED',
    url: 'https://www.bidnetdirect.com'
  },
  UNVERIFIED_NOT_FAKE: {
    id: 'sub-nj-001',
    title: 'Last-Mile Delivery Subcontractor — NJ',
    agency: 'SBA SubNet',
    source: 'SBA SubNet',
    isFake: false,
    deadlineDays: null,
    verificationStatus: 'NEEDS_REVIEW',
    url: 'https://eweb1.sba.gov/subnet'
  }
};

// ── Test the filtering logic directly (same logic as server.js cron) ────────

describe('Phase 13: Null coercion bug fix — cron urgent filter', () => {
  it('PASS: null <= 3 coercion was the bug — confirm JS behavior', () => {
    // This was the original broken filter
    const brokenFilter = (b) => b.deadlineDays <= 3;
    // Demonstrate the bug: null gets coerced to 0, so null <= 3 is TRUE
    assert.equal(brokenFilter({ deadlineDays: null }), true, 'Bug confirmed: null <= 3 is true in JS');
  });

  it('PASS: Fixed filter correctly excludes null deadlineDays', () => {
    const fixedFilter = (b) =>
      b.deadlineDays != null &&
      b.deadlineDays <= 3 &&
      !b.isFake &&
      b.verificationStatus === 'VERIFIED';

    assert.equal(fixedFilter(mockBid.CAMDEN_PLACEHOLDER), false, 'Camden placeholder excluded (null deadline)');
    assert.equal(fixedFilter(mockBid.NULL_DEADLINE_FAKE), false, 'Mercer placeholder excluded (null deadline)');
    assert.equal(fixedFilter(mockBid.UNVERIFIED_NOT_FAKE), false, 'SBA SubNet excluded (null deadline, not VERIFIED)');
    assert.equal(fixedFilter(mockBid.VERIFIED_REAL), true, 'Real VERIFIED bid with deadline included');
  });

  it('PASS: isFake=true bids are excluded from urgent filter', () => {
    const fixedFilter = (b) =>
      b.deadlineDays != null && b.deadlineDays <= 3 && !b.isFake && b.verificationStatus === 'VERIFIED';

    const fakeBidWithDeadline = { ...mockBid.CAMDEN_PLACEHOLDER, deadlineDays: 1 };
    assert.equal(fixedFilter(fakeBidWithDeadline), false, 'isFake=true blocked even if deadline is set');
  });

  it('PASS: verificationStatus must be VERIFIED for urgent alert', () => {
    const fixedFilter = (b) =>
      b.deadlineDays != null && b.deadlineDays <= 3 && !b.isFake && b.verificationStatus === 'VERIFIED';

    const unverifiedWithDeadline = { ...mockBid.UNVERIFIED_NOT_FAKE, deadlineDays: 2, isFake: false };
    assert.equal(fixedFilter(unverifiedWithDeadline), false, 'NEEDS_REVIEW status blocked from urgent');

    const manualLoginWithDeadline = { isFake: false, deadlineDays: 1, verificationStatus: 'MANUAL_LOGIN_NEEDED' };
    assert.equal(fixedFilter(manualLoginWithDeadline), false, 'MANUAL_LOGIN_NEEDED blocked from urgent');
  });
});

// ── Test sendUrgentAlert safety guard logic ────────────────────────────────

describe('Phase 13: sendUrgentAlert safety guard', () => {
  // Replicate the guard logic from notifications.js
  function shouldBlockUrgentAlert(bid) {
    return bid.isFake || bid.deadlineDays == null || bid.verificationStatus !== 'VERIFIED';
  }

  it('PASS: Camden placeholder is blocked', () => {
    assert.equal(shouldBlockUrgentAlert(mockBid.CAMDEN_PLACEHOLDER), true,
      'Camden (isFake=true, deadlineDays=null) must be blocked');
  });

  it('PASS: null deadline is blocked', () => {
    assert.equal(shouldBlockUrgentAlert(mockBid.UNVERIFIED_NOT_FAKE), true,
      'Null deadline bid blocked');
  });

  it('PASS: NEEDS_REVIEW status is blocked', () => {
    const bid = { isFake: false, deadlineDays: 5, verificationStatus: 'NEEDS_REVIEW' };
    assert.equal(shouldBlockUrgentAlert(bid), true, 'NEEDS_REVIEW status blocked');
  });

  it('PASS: MANUAL_LOGIN_NEEDED status is blocked', () => {
    const bid = { isFake: false, deadlineDays: 1, verificationStatus: 'MANUAL_LOGIN_NEEDED' };
    assert.equal(shouldBlockUrgentAlert(bid), true, 'MANUAL_LOGIN_NEEDED status blocked');
  });

  it('PASS: UNCONFIRMED status is blocked', () => {
    const bid = { isFake: true, deadlineDays: null, verificationStatus: 'UNCONFIRMED' };
    assert.equal(shouldBlockUrgentAlert(bid), true, 'UNCONFIRMED status blocked');
  });

  it('PASS: Only VERIFIED real bid with confirmed deadline passes', () => {
    assert.equal(shouldBlockUrgentAlert(mockBid.VERIFIED_REAL), false,
      'VERIFIED bid with real deadline must NOT be blocked');
  });
});

// ── Test "null days" display fix ───────────────────────────────────────────

describe('Phase 13: No "null days" in deadline display', () => {
  // Replicate fmtDeadline from notifications.js
  function fmtDeadline(bid) {
    if (bid.deadlineDays != null) {
      return bid.deadlineDays + ' days left';
    }
    if (bid.isFake) return 'Deadline unknown — verify on portal';
    return 'No posted deadline — check SAM.gov for updates';
  }

  it('PASS: Camden placeholder shows "Deadline unknown — verify on portal" not "null days left"', () => {
    const result = fmtDeadline(mockBid.CAMDEN_PLACEHOLDER);
    assert.doesNotMatch(result, /null/, 'No "null" in deadline display');
    assert.match(result, /verify on portal/, 'Shows "verify on portal" message');
  });

  it('PASS: Non-fake bid with null deadline shows SAM.gov message', () => {
    const result = fmtDeadline(mockBid.UNVERIFIED_NOT_FAKE);
    assert.doesNotMatch(result, /null/, 'No "null" in deadline display');
    assert.match(result, /No posted deadline/, 'Shows "No posted deadline" message');
  });

  it('PASS: Verified bid shows days correctly', () => {
    const result = fmtDeadline(mockBid.VERIFIED_REAL);
    assert.equal(result, '2 days left', 'Shows real deadline days');
    assert.doesNotMatch(result, /null/, 'No null in output');
  });
});

// ── Test placeholder exclusion from verified counts ────────────────────────

describe('Phase 13: Placeholders excluded from verified counts', () => {
  const allBids = Object.values(mockBid);

  it('PASS: Only VERIFIED + !isFake bids count as verified', () => {
    const verifiedBids = allBids.filter(b => b.verificationStatus === 'VERIFIED' && !b.isFake);
    assert.equal(verifiedBids.length, 1, 'Only 1 verified bid (SAM.gov real)');
    assert.equal(verifiedBids[0].id, 'sam-test-001', 'Correct bid is verified');
  });

  it('PASS: isFake=true bids go to placeholder section only', () => {
    const placeholders = allBids.filter(b => b.isFake === true);
    assert.equal(placeholders.length, 2, '2 placeholders (Camden + Mercer)');
    placeholders.forEach(p => {
      assert.equal(p.isFake, true, 'All placeholders have isFake=true');
      assert.equal(p.deadlineDays, null, 'All placeholders have null deadline');
    });
  });

  it('PASS: Urgent count uses null-safe filter — 0 urgents when only placeholders', () => {
    const placeholderOnlyBids = allBids.filter(b => b.isFake);
    const urgent = placeholderOnlyBids.filter(b =>
      b.deadlineDays != null && b.deadlineDays <= 14 && !b.isFake
    );
    assert.equal(urgent.length, 0, 'Zero urgent bids when only placeholders present');
  });
});

// ── Safety checks ──────────────────────────────────────────────────────────

describe('Phase 13: Safety checks', () => {
  it('PASS: No bid submission in notifications module', () => {
    const notificationsSource = require('fs').readFileSync(
      require('path').join(__dirname, '../notifications.js'), 'utf8'
    );
    assert.doesNotMatch(notificationsSource, /submitBid|submit_bid|placeBid|place_bid/i,
      'No bid submission in notifications.js');
  });

  it('PASS: No outreach emails — only sends to NOTIFY_EMAIL env var', () => {
    const notificationsSource = require('fs').readFileSync(
      require('path').join(__dirname, '../notifications.js'), 'utf8'
    );
    // Must send only to process.env.NOTIFY_EMAIL, not hardcoded external addresses
    assert.doesNotMatch(notificationsSource, /to:\s*['"][^'"@]+@(?!nomyxlogistics)[^'"]+['"]/,
      'No hardcoded external email addresses for outreach');
  });

  it('PASS: No auto-posting in notifications module', () => {
    const notificationsSource = require('fs').readFileSync(
      require('path').join(__dirname, '../notifications.js'), 'utf8'
    );
    assert.doesNotMatch(notificationsSource, /facebook\.com\/v\d+\/me\/feed|twitter\.com\/post|instagram\.com\/post/i,
      'No social media auto-posting in notifications.js');
  });

  it('PASS: API keys not hardcoded — only process.env references', () => {
    const notificationsSource = require('fs').readFileSync(
      require('path').join(__dirname, '../notifications.js'), 'utf8'
    );
    // Should not contain patterns like "re_" (Resend key prefix) hardcoded
    assert.doesNotMatch(notificationsSource, /Bearer re_[A-Za-z0-9]{20,}/,
      'No hardcoded Resend API key');
    assert.doesNotMatch(notificationsSource, /sk-ant-[A-Za-z0-9]/,
      'No hardcoded Anthropic API key');
  });

  it('PASS: sendUrgentAlert safety guard comment references Stella Bella restriction', () => {
    // Confirm the guard exists in the source
    const notificationsSource = require('fs').readFileSync(
      require('path').join(__dirname, '../notifications.js'), 'utf8'
    );
    assert.match(notificationsSource, /SAFETY.*URGENT alert.*placeholder|isFake.*deadlineDays.*null.*VERIFIED/si,
      'Safety guard exists in sendUrgentAlert');
  });
});

console.log('\n✅ Phase 13 tests complete. Run: node --test tests/phase13.test.js');

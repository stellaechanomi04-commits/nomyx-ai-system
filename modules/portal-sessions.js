/**
 * Portal Session Manager — Phase 14
 * Tracks login/session status for each procurement portal.
 *
 * SECURITY: No raw passwords stored anywhere.
 * Stella types credentials directly into the portal browser.
 * This module only tracks whether a session is active or needs refresh.
 *
 * Session state is in-memory (Railway ephemeral).
 * Stella marks sessions active after logging in via /portal-sessions/:id/mark-active.
 */

const PORTAL_STATUS = {
  ACTIVE: 'Active',
  EXPIRED: 'Expired',
  LOGIN_REQUIRED: 'Login Required',
  MFA_REQUIRED: 'MFA Required',
  CAPTCHA_MANUAL: 'CAPTCHA/Manual Required',
  BLOCKED: 'Blocked',
  NOT_CONFIGURED: 'Not Configured',
  MANUAL_REVIEW: 'Manual Review',
  STALE_REQUEST: 'Stale Request'  // BidNet SSO link expired — use home page to restart
};

const SOURCE_TYPE = {
  API: 'API',
  PUBLIC_PAGE: 'Public Page',
  BROWSER_SESSION: 'Browser Session',
  EMAIL_ALERT: 'Email Alert',
  MANUAL_REVIEW: 'Manual Review'
};

// In-memory portal session state
// Railway is ephemeral — Stella marks sessions active after manual login
let sessions = {
  samgov: {
    id: 'samgov',
    name: 'SAM.gov',
    loginUrl: 'https://sam.gov/sign-in',
    searchUrl: 'https://sam.gov/search/?index=opp&q=logistics+courier+transport&is_active=true',
    sourceType: SOURCE_TYPE.API,
    accountStatus: 'Registered — API active',
    sessionStatus: PORTAL_STATUS.ACTIVE,
    lastSuccessfulLogin: 'N/A — API key handles access',
    lastScanDate: null,
    nextScheduledScan: 'Daily 7am ET',
    savedSearchStatus: 'API-managed — server-side only',
    emailAlertStatus: 'Not needed — API active',
    notes: 'SAM_API_KEY stored in Railway env only. Server-side. Never exposed to frontend. API covers federal opportunities.',
    naicsTracked: ['488510', '492110', '484110', '484121'],
    actions: ['Scan Now'],
    priority: 1
  },
  bidnetDirect: {
    id: 'bidnetDirect',
    name: 'BidNet Direct',
    loginUrl: 'https://www.bidnetdirect.com',  // HOME PAGE ONLY — never use idp.bidnetdirect.com SSO links (they expire and cause Stale Request errors)
    searchUrl: 'https://www.bidnetdirect.com/public/solicitations/search',
    sourceType: SOURCE_TYPE.BROWSER_SESSION,
    accountStatus: 'Registered',
    sessionStatus: PORTAL_STATUS.LOGIN_REQUIRED,
    lastSuccessfulLogin: null,
    lastScanDate: null,
    nextScheduledScan: 'Daily 7am (after session active)',
    savedSearchStatus: 'Setup needed — log in to configure saved searches',
    emailAlertStatus: 'Setup needed — log in to enable email alerts for NJ/PA logistics',
    staleDetectedAt: null,
    notes: 'No raw password stored. Stella logs in directly in browser using HOME PAGE only. If you see Stale Request, click Mark Stale and start fresh from https://www.bidnetdirect.com. After login, click Mark Session Active.',
    keywords: ['logistics', 'courier', 'transport', 'delivery', 'freight', 'medical courier', 'specimen'],
    actions: ['Request Stella Approval', 'Open Portal', 'Mark Session Active'],
    priority: 2
  },
  njstart: {
    id: 'njstart',
    name: 'NJSTART (NJ State Procurement)',
    loginUrl: 'https://www.njstart.gov/bso/external/login/login.sdo',
    searchUrl: 'https://www.njstart.gov/bso/external/bidding/searchBid.sdo',
    sourceType: SOURCE_TYPE.BROWSER_SESSION,
    accountStatus: 'Registered',
    sessionStatus: PORTAL_STATUS.LOGIN_REQUIRED,
    lastSuccessfulLogin: null,
    lastScanDate: null,
    nextScheduledScan: 'Daily 7am (after session active)',
    savedSearchStatus: 'Setup needed — log in to configure NJ-specific saved searches',
    emailAlertStatus: 'Setup needed — log in to enable NJSTART email alerts',
    notes: 'NJ State procurement system. Sessions expire. Stella refreshes login when prompted. No raw password stored.',
    keywords: ['logistics', 'courier', 'transportation', 'delivery', 'freight', 'medical transport'],
    actions: ['Request Stella Approval', 'Open Portal', 'Mark Session Active'],
    priority: 2
  },
  sbaSubnet: {
    id: 'sbaSubnet',
    name: 'SBA SubNet (Subcontracting)',
    loginUrl: 'https://eweb1.sba.gov/subnet/client/dsp_Landing.cfm',
    searchUrl: 'https://eweb1.sba.gov/subnet/client/dsp_Landing.cfm',
    sourceType: SOURCE_TYPE.PUBLIC_PAGE,
    accountStatus: 'Public — no login required for basic search',
    sessionStatus: PORTAL_STATUS.ACTIVE,
    lastSuccessfulLogin: 'N/A — public page',
    lastScanDate: null,
    nextScheduledScan: 'Daily 7am',
    savedSearchStatus: 'N/A — public search',
    emailAlertStatus: 'Voluntary registration for alerts',
    notes: 'SBA SubNet connects small businesses with primes on federal contracts. Logistics/courier subcontracts available.',
    keywords: ['logistics', 'courier', 'delivery', 'freight', 'transportation', 'medical courier', 'specimen transport', 'dispatch'],
    actions: ['Scan Now', 'Open Portal'],
    priority: 3
  },
  njdpp: {
    id: 'njdpp',
    name: 'NJ DPP (Division of Purchase & Property)',
    loginUrl: 'https://www.njstart.gov',
    searchUrl: 'https://www.nj.gov/treasury/purchase/bid/notices/',
    sourceType: SOURCE_TYPE.PUBLIC_PAGE,
    accountStatus: 'Public bid notices — monitoring',
    sessionStatus: PORTAL_STATUS.ACTIVE,
    lastSuccessfulLogin: 'N/A — public',
    lastScanDate: null,
    nextScheduledScan: 'Weekly',
    savedSearchStatus: 'N/A — public notices page',
    emailAlertStatus: 'Setup recommended via NJ Treasury',
    notes: 'NJ Division of Purchase & Property. Public bid notices for state contracts.',
    actions: ['Scan Now', 'Setup Email Alert', 'Open Portal'],
    priority: 3
  },
  gmail: {
    id: 'gmail',
    name: 'Gmail (Bid Alert Ingestion)',
    loginUrl: 'https://accounts.google.com',
    searchUrl: null,
    sourceType: SOURCE_TYPE.EMAIL_ALERT,
    accountStatus: 'OAuth not configured',
    sessionStatus: PORTAL_STATUS.NOT_CONFIGURED,
    lastSuccessfulLogin: null,
    lastScanDate: null,
    nextScheduledScan: 'After OAuth setup',
    savedSearchStatus: 'N/A — email based',
    emailAlertStatus: 'Pending GMAIL_REFRESH_TOKEN in Railway',
    notes: 'OAuth flow at /auth/gmail. Need GMAIL_REFRESH_TOKEN added to Railway env vars. No Gmail password stored.',
    actions: ['Setup OAuth', 'Open Portal'],
    setupUrl: '/auth/gmail',
    priority: 4
  },
  camdenCounty: {
    id: 'camdenCounty',
    name: 'Camden County Procurement',
    loginUrl: 'https://www.camdencounty.com/government/departments/purchasing/',
    searchUrl: 'https://www.camdencounty.com/government/departments/purchasing/',
    sourceType: SOURCE_TYPE.MANUAL_REVIEW,
    accountStatus: 'Manual monitoring',
    sessionStatus: PORTAL_STATUS.MANUAL_REVIEW,
    lastSuccessfulLogin: 'N/A — public',
    lastScanDate: null,
    nextScheduledScan: 'Weekly manual check',
    savedSearchStatus: 'Manual',
    emailAlertStatus: 'Manual subscription recommended',
    notes: 'Camden County NJ. Check for courier, medical transport, logistics bids.',
    actions: ['Open Portal', 'Setup Email Alert'],
    priority: 4
  },
  mercerCounty: {
    id: 'mercerCounty',
    name: 'Mercer County Procurement',
    loginUrl: 'https://www.mercercounty.org/government/purchasing',
    searchUrl: 'https://www.mercercounty.org/government/purchasing',
    sourceType: SOURCE_TYPE.MANUAL_REVIEW,
    accountStatus: 'Manual monitoring',
    sessionStatus: PORTAL_STATUS.MANUAL_REVIEW,
    lastSuccessfulLogin: 'N/A — public',
    lastScanDate: null,
    nextScheduledScan: 'Weekly manual check',
    savedSearchStatus: 'Manual',
    emailAlertStatus: 'Manual',
    notes: 'Mercer County NJ. Check for transport, logistics, medical courier bids.',
    actions: ['Open Portal', 'Setup Email Alert'],
    priority: 4
  },
  schoolDistricts: {
    id: 'schoolDistricts',
    name: 'NJ School District Bids',
    loginUrl: 'https://www.bidnetdirect.com/new-jersey',
    searchUrl: 'https://www.bidnetdirect.com/public/solicitations/search',
    sourceType: SOURCE_TYPE.EMAIL_ALERT,
    accountStatus: 'Via BidNet Direct saved searches',
    sessionStatus: PORTAL_STATUS.NOT_CONFIGURED,
    lastSuccessfulLogin: null,
    lastScanDate: null,
    nextScheduledScan: 'After BidNet login configured',
    savedSearchStatus: 'Requires BidNet login — school/education category',
    emailAlertStatus: 'Configure via BidNet Direct after login',
    notes: 'NJ school districts post on BidNet Direct. Enable school/education category saved search after logging into BidNet.',
    actions: ['Request Stella Approval', 'Open Portal'],
    priority: 4
  },
  hospitalVendor: {
    id: 'hospitalVendor',
    name: 'Hospital/Healthcare Vendor Portals',
    loginUrl: null,
    searchUrl: null,
    sourceType: SOURCE_TYPE.MANUAL_REVIEW,
    accountStatus: 'Not yet registered',
    sessionStatus: PORTAL_STATUS.NOT_CONFIGURED,
    lastSuccessfulLogin: null,
    lastScanDate: null,
    nextScheduledScan: 'Manual — register as vendor',
    savedSearchStatus: 'N/A — registration required',
    emailAlertStatus: 'After vendor registration',
    notes: 'Virtua Health, Cooper University, RWJ Barnabas, Jefferson Health. Register as vendor on each system for medical courier/specimen transport opportunities.',
    portals: [
      { name: 'Virtua Health Vendors', url: 'https://www.virtua.org/about/vendors' },
      { name: 'Cooper University Health', url: 'https://www.cooperhealth.org/vendors' },
      { name: 'RWJBarnabas Health', url: 'https://www.rwjbh.org/vendors' }
    ],
    actions: ['Open Portal'],
    priority: 5
  }
};

// ── Public API ──────────────────────────────────────────────────────────────

function getAllSessions() {
  return Object.values(sessions).sort((a, b) => (a.priority || 9) - (b.priority || 9));
}

function getSession(id) {
  return sessions[id] || null;
}

function updateSessionStatus(id, update) {
  if (!sessions[id]) return { error: 'Portal not found: ' + id };
  const prev = sessions[id].sessionStatus;
  sessions[id] = Object.assign({}, sessions[id], update, { lastUpdated: new Date().toISOString() });
  console.log('[Portal] ' + id + ' status: ' + prev + ' -> ' + (update.sessionStatus || prev));
  return sessions[id];
}

function markSessionActive(id) {
  if (!sessions[id]) return { error: 'Portal not found: ' + id };
  return updateSessionStatus(id, {
    sessionStatus: PORTAL_STATUS.ACTIVE,
    lastSuccessfulLogin: new Date().toISOString(),
    lastScanDate: new Date().toISOString()
  });
}

function markLoginRequired(id, mfaRequired) {
  if (!sessions[id]) return { error: 'Portal not found: ' + id };
  return updateSessionStatus(id, {
    sessionStatus: mfaRequired ? PORTAL_STATUS.MFA_REQUIRED : PORTAL_STATUS.LOGIN_REQUIRED
  });
}

function markScanComplete(id) {
  if (!sessions[id]) return { error: 'Portal not found: ' + id };
  return updateSessionStatus(id, {
    lastScanDate: new Date().toISOString()
  });
}

// Phase 16.1: Stale request detection for BidNet SSO links
function markStaleDetected(id) {
  if (!sessions[id]) return { error: 'Portal not found: ' + id };
  return updateSessionStatus(id, {
    sessionStatus: PORTAL_STATUS.STALE_REQUEST,
    staleDetectedAt: new Date().toISOString()
  });
}

function clearStaleStatus(id) {
  if (!sessions[id]) return { error: 'Portal not found: ' + id };
  return updateSessionStatus(id, {
    sessionStatus: PORTAL_STATUS.LOGIN_REQUIRED,
    staleDetectedAt: null
  });
}

function getPortalsNeedingLogin() {
  return Object.values(sessions).filter(function(s) {
    return s.sessionStatus === PORTAL_STATUS.LOGIN_REQUIRED ||
           s.sessionStatus === PORTAL_STATUS.MFA_REQUIRED ||
           s.sessionStatus === PORTAL_STATUS.EXPIRED;
  });
}

function getActiveSessions() {
  return Object.values(sessions).filter(function(s) {
    return s.sessionStatus === PORTAL_STATUS.ACTIVE;
  });
}

function getSummary() {
  var all = getAllSessions();
  return {
    active: all.filter(function(s) { return s.sessionStatus === PORTAL_STATUS.ACTIVE; }).length,
    needsLogin: all.filter(function(s) {
      return s.sessionStatus === PORTAL_STATUS.LOGIN_REQUIRED ||
             s.sessionStatus === PORTAL_STATUS.MFA_REQUIRED ||
             s.sessionStatus === PORTAL_STATUS.EXPIRED;
    }).length,
    notConfigured: all.filter(function(s) { return s.sessionStatus === PORTAL_STATUS.NOT_CONFIGURED; }).length,
    manualReview: all.filter(function(s) { return s.sessionStatus === PORTAL_STATUS.MANUAL_REVIEW; }).length,
    portalsNeedingLogin: getPortalsNeedingLogin().map(function(s) { return s.name; })
  };
}

module.exports = {
  PORTAL_STATUS,
  SOURCE_TYPE,
  getAllSessions,
  getSession,
  updateSessionStatus,
  markSessionActive,
  markLoginRequired,
  markScanComplete,
  markStaleDetected,
  clearStaleStatus,
  getPortalsNeedingLogin,
  getActiveSessions,
  getSummary
};

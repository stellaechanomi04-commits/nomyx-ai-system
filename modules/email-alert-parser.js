/**
 * Email Alert Parser — Phase 15
 * Parses bid alert emails from Gmail into structured dashboard opportunities.
 *
 * ── SECURITY RULES ────────────────────────────────────────────────────────────
 * - All parsed alerts default to EMAIL_ALERT_FOUND — never auto-VERIFIED_REAL
 * - Duplicate emails are not imported twice (deduplicated by messageId)
 * - Due dates extracted best-effort — shown as "Deadline not verified" if missing
 * - No null deadlineDays (always a number or null — never the string "null")
 * - No bid submission, no outreach email sending, no auto-posting
 * - Phone approval task is created when portal login is needed to verify alert
 */

var gmailOAuth = null;
try { gmailOAuth = require('./gmail-oauth'); } catch(e) {}

// ── ALERT STATUS CONSTANTS ─────────────────────────────────────────────────────

var ALERT_STATUS = {
  EMAIL_ALERT_FOUND: 'EMAIL_ALERT_FOUND',   // Default — needs verification
  VERIFIED_REAL:     'VERIFIED_REAL',        // Confirmed via portal or source link
  LOGIN_REQUIRED:    'LOGIN_REQUIRED',       // Portal login needed to verify
  IGNORED:           'IGNORED',             // Stella chose to ignore
  DUPLICATE:         'DUPLICATE'            // Matched an existing alert
};

// ── SENDER → PORTAL SOURCE MAP ────────────────────────────────────────────────

var SENDER_PATTERNS = [
  { pattern: /bidnetdirect\.com/i,   source: 'BidNet Direct',     portalId: 'bidnetDirect',    category: 'government' },
  { pattern: /njstart|nj\.gov/i,     source: 'NJSTART',           portalId: 'njstart',          category: 'state' },
  { pattern: /sam\.gov|fpds\.gov/i,  source: 'SAM.gov',           portalId: 'samgov',           category: 'federal' },
  { pattern: /sba\.gov/i,            source: 'SBA SubNet',        portalId: 'sbaSubnet',        category: 'federal' },
  { pattern: /njdpp|njbusiness/i,    source: 'NJ DPP',            portalId: 'njdpp',            category: 'state' },
  { pattern: /camden.*county|camdencounty\.com|co\.camden\.nj\.us/i, source: 'Camden County', portalId: 'camdenCounty', category: 'county' },
  { pattern: /mercer.*county|mercercounty\.org|co\.mercer\.nj\.us/i, source: 'Mercer County', portalId: 'mercerCounty', category: 'county' },
  { pattern: /virtua\.org/i,         source: 'Virtua Health',     portalId: 'hospitalVendor',  category: 'healthcare' },
  { pattern: /cooperhealth\.org/i,   source: 'Cooper Health',     portalId: 'hospitalVendor',  category: 'healthcare' },
  { pattern: /rwjbh\.org|rwjbarnabas/i, source: 'RWJBarnabas Health', portalId: 'hospitalVendor', category: 'healthcare' },
  { pattern: /k12\.nj\.us|nps\.k12\.nj\.us/i, source: 'NJ School District', portalId: 'schoolDistricts', category: 'education' },
  { pattern: /procurement|purchasing|bids@/i, source: 'Municipal/County', portalId: 'camdenCounty', category: 'municipal' }
];

// ── KEYWORD MATCH PATTERNS ─────────────────────────────────────────────────────

var KEYWORD_PATTERNS = [
  'logistics', 'courier', 'delivery', 'freight', 'transportation',
  'dispatch', 'shipment', 'specimen transport', 'medical courier',
  'last-mile', 'trucking', 'messenger', 'relocation', 'moving',
  'administrative support', 'staffing', 'administrative services',
  'warehousing', 'distribution', 'supply chain', 'carrier',
  '488510', '492110', '484110', '484121', '561110',
  'WOSB', 'woman-owned', 'small business', 'set-aside',
  'NJ', 'New Jersey', 'Camden', 'Mercer', 'Burlington', 'Gloucester'
];

// ── DUE DATE EXTRACTION ────────────────────────────────────────────────────────

var DATE_PATTERNS = [
  // "Due: January 15, 2026" or "Due Date: Jan 15, 2026"
  /due\s*(?:date)?[:\s]+([A-Za-z]+\s+\d{1,2},?\s+\d{4})/i,
  // "Deadline: 2026-01-15" or "Closes: 2026-01-15"
  /(?:deadline|closes?|close\s+date|submission\s+date)[:\s]+(\d{4}[-\/]\d{1,2}[-\/]\d{1,2})/i,
  // "by January 15, 2026"
  /by\s+([A-Za-z]+\s+\d{1,2},?\s+\d{4})/i,
  // "01/15/2026" or "01-15-2026"
  /(?:deadline|due|close)[:\s]+(\d{1,2}[-\/]\d{1,2}[-\/]\d{4})/i,
  // ISO: "2026-01-15"
  /(\d{4}-\d{2}-\d{2})/
];

function extractDueDate(text) {
  if (!text) return null;
  for (var i = 0; i < DATE_PATTERNS.length; i++) {
    var m = text.match(DATE_PATTERNS[i]);
    if (m && m[1]) {
      var d = new Date(m[1]);
      if (!isNaN(d.getTime()) && d.getFullYear() >= 2026) {
        return d.toISOString().slice(0, 10); // YYYY-MM-DD
      }
    }
  }
  return null;
}

function deadlineDaysFromDate(dueDateStr) {
  if (!dueDateStr) return null;
  var due = new Date(dueDateStr);
  if (isNaN(due.getTime())) return null;
  var now = new Date();
  var diffMs = due.getTime() - now.getTime();
  var days = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  return days;
}

// ── KEYWORD MATCHER ────────────────────────────────────────────────────────────

function matchKeywords(text) {
  if (!text) return [];
  var lower = text.toLowerCase();
  return KEYWORD_PATTERNS.filter(function(kw) { return lower.includes(kw.toLowerCase()); });
}

// ── SOLICITATION TITLE EXTRACTION ────────────────────────────────────────────

function extractTitle(subject, bodyText) {
  // Try subject first — strip common email prefixes
  if (subject) {
    var cleaned = subject
      .replace(/^(Re:|Fwd:|FW:|New Bid Alert|Bid Alert|Alert|Notification|Solicitation)[\s:–-]*/i, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (cleaned.length > 5) return cleaned;
  }
  // Try to extract from body — look for "Title:", "Solicitation:", "Description:"
  if (bodyText) {
    var m = bodyText.match(/(?:title|solicitation|description|opportunity)[:\s]+([^\n\r]{10,120})/i);
    if (m && m[1]) return m[1].trim();
  }
  return subject || 'Untitled Alert';
}

// ── AGENCY EXTRACTION ─────────────────────────────────────────────────────────

function extractAgency(fromHeader, bodyText) {
  // Try body first for "Agency:", "Buyer:", "Department:"
  if (bodyText) {
    var m = bodyText.match(/(?:agency|buyer|department|purchasing\s+entity)[:\s]+([^\n\r]{3,80})/i);
    if (m && m[1]) return m[1].trim();
  }
  // Fall back to sender name
  if (fromHeader) {
    var namePart = fromHeader.replace(/<[^>]+>/, '').trim();
    if (namePart.length > 2) return namePart;
  }
  return 'Unknown Agency';
}

// ── LINK EXTRACTION ───────────────────────────────────────────────────────────

function extractLink(bodyText) {
  if (!bodyText) return null;
  // Look for URLs
  var m = bodyText.match(/https?:\/\/[^\s"<>]{10,200}/);
  return m ? m[0] : null;
}

// ── SOURCE DETECTION ─────────────────────────────────────────────────────────

function detectSource(fromHeader, subject, bodyText) {
  var combined = (fromHeader || '') + ' ' + (subject || '') + ' ' + ((bodyText || '').slice(0, 500));
  for (var i = 0; i < SENDER_PATTERNS.length; i++) {
    var sp = SENDER_PATTERNS[i];
    if (sp.pattern.test(combined)) {
      return { source: sp.source, portalId: sp.portalId, category: sp.category };
    }
  }
  return { source: 'Email Alert', portalId: null, category: 'unknown' };
}

// ── LOCATION EXTRACTION ───────────────────────────────────────────────────────

function extractLocation(bodyText) {
  if (!bodyText) return 'NJ/PA';
  var m = bodyText.match(/(?:location|place\s+of\s+performance|state)[:\s]+([^\n\r]{2,60})/i);
  if (m && m[1]) return m[1].trim();
  // Check for NJ/PA mentions
  if (/new\s+jersey|NJ\b/i.test(bodyText)) return 'New Jersey';
  if (/pennsylvania|PA\b/i.test(bodyText)) return 'Pennsylvania';
  return 'Not specified';
}

// ── IN-MEMORY ALERT STORE ─────────────────────────────────────────────────────

var alertStore = [];
var importedMessageIds = new Set();

function getAlerts() { return alertStore.slice(); }

function clearAlerts() { alertStore = []; importedMessageIds = new Set(); }

function getAlertById(id) { return alertStore.find(function(a) { return a.id === id; }) || null; }

// ALLOWED_STATUS_TRANSITIONS: guards against unverified auto-promotion
var ALLOWED_STATUS_TRANSITIONS = {
  EMAIL_ALERT_FOUND: ['LOGIN_REQUIRED', 'IGNORED', 'DUPLICATE', 'NEEDS_LOGIN_VERIFICATION', 'PUBLIC_SOURCE_FOUND', 'EMAIL_ALERT_FOUND'],
  LOGIN_REQUIRED:    ['VERIFIED_REAL', 'IGNORED', 'DUPLICATE', 'NO_ACTION', 'EXPIRED', 'LOGIN_REQUIRED'],
  PUBLIC_SOURCE_FOUND: ['VERIFIED_REAL', 'IGNORED', 'NO_ACTION', 'EXPIRED', 'PUBLIC_SOURCE_FOUND'],
  NEEDS_LOGIN_VERIFICATION: ['LOGIN_REQUIRED', 'IGNORED', 'NEEDS_LOGIN_VERIFICATION'],
  VERIFIED_REAL:     ['IGNORED', 'VERIFIED_REAL'],  // Cannot go backwards to EMAIL_ALERT_FOUND
  IGNORED:           ['EMAIL_ALERT_FOUND', 'IGNORED'],
  DUPLICATE:         ['IGNORED', 'DUPLICATE'],
  NO_ACTION:         ['EMAIL_ALERT_FOUND', 'IGNORED', 'NO_ACTION'],
  EXPIRED:           ['IGNORED', 'EXPIRED']
};

function updateAlertStatus(id, newStatus, notes) {
  var alert = alertStore.find(function(a) { return a.id === id; });
  if (!alert) return null;

  // Guard: VERIFIED_REAL requires explicit portal confirmation — cannot jump from EMAIL_ALERT_FOUND
  if (newStatus === ALERT_STATUS.VERIFIED_REAL) {
    var currentStatus = alert.verificationStatus;
    var allowed = ALLOWED_STATUS_TRANSITIONS[currentStatus] || [];
    if (!allowed.includes('VERIFIED_REAL')) {
      return {
        error: 'Cannot set VERIFIED_REAL from status: ' + currentStatus + '. Alert must first be verified via portal login (LOGIN_REQUIRED -> VERIFIED_REAL) or public source (PUBLIC_SOURCE_FOUND -> VERIFIED_REAL).',
        currentStatus: currentStatus,
        requiresVerificationVia: 'Portal login or confirmed public source link'
      };
    }
  }

  alert.verificationStatus = newStatus;
  alert.notes = notes || alert.notes;
  alert.updatedAt = new Date().toISOString();
  return alert;
}

function getAlertsByStatus(status) {
  return alertStore.filter(function(a) { return a.verificationStatus === status; });
}

// ── DEDUPLICATION ─────────────────────────────────────────────────────────────

function isDuplicate(messageId) {
  return importedMessageIds.has(messageId);
}

function getAlertSummary() {
  var total = alertStore.length;
  var byStatus = {};
  alertStore.forEach(function(a) {
    byStatus[a.verificationStatus] = (byStatus[a.verificationStatus] || 0) + 1;
  });
  return {
    total: total,
    byStatus: byStatus,
    emailAlertFound:  byStatus['EMAIL_ALERT_FOUND']  || 0,
    verifiedReal:     byStatus['VERIFIED_REAL']       || 0,
    loginRequired:    byStatus['LOGIN_REQUIRED']      || 0,
    ignored:          byStatus['IGNORED']             || 0,
    lastScanDate:     alertStore.length > 0 ? alertStore[alertStore.length - 1].receivedDate : null
  };
}

// ── CORE PARSER ───────────────────────────────────────────────────────────────

function parseEmailMessage(message) {
  if (!message || !message.id) return null;

  // Deduplicate
  if (isDuplicate(message.id)) return { status: 'DUPLICATE', messageId: message.id };

  var getHeader = gmailOAuth ? gmailOAuth.getHeader : function() { return ''; };
  var getBodyText = gmailOAuth ? gmailOAuth.getBodyText : function() { return ''; };

  var from    = getHeader(message, 'from');
  var subject = getHeader(message, 'subject');
  var date    = getHeader(message, 'date');
  var to      = getHeader(message, 'to');
  var bodyText = getBodyText(message);

  var sourceInfo = detectSource(from, subject, bodyText);
  var title      = extractTitle(subject, bodyText);
  var agency     = extractAgency(from, bodyText);
  var dueDate    = extractDueDate(bodyText);
  var deadlineDays = deadlineDaysFromDate(dueDate); // number or null — never string "null"
  var link       = extractLink(bodyText);
  var location   = extractLocation(bodyText);
  var keywords   = matchKeywords(subject + ' ' + (bodyText || '').slice(0, 1000));

  // Build structured alert
  var alert = {
    id: 'email-' + message.id,
    messageId: message.id,
    type: 'email_alert',
    source: sourceInfo.source,
    portalId: sourceInfo.portalId,
    category: sourceInfo.category,
    title: title,
    agency: agency,
    sender: from,
    subject: subject,
    receivedDate: date || new Date().toISOString(),
    dueDate: dueDate,                            // YYYY-MM-DD string or null
    deadlineDays: deadlineDays,                  // integer or null (never "null days")
    deadlineDisplay: deadlineDays !== null
      ? deadlineDays + ' days'
      : 'Deadline not verified',                 // Safe display string
    url: link,
    location: location,
    keywordMatches: keywords,
    keywordCount: keywords.length,
    verificationStatus: ALERT_STATUS.EMAIL_ALERT_FOUND,  // Always default
    isFake: false,
    notes: 'Imported from Gmail — not yet verified against source portal',
    importedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    nextAction: determineNextAction(sourceInfo),
    portalLoginNeeded: needsPortalLogin(sourceInfo)
  };

  importedMessageIds.add(message.id);
  alertStore.push(alert);

  return alert;
}

function determineNextAction(sourceInfo) {
  switch (sourceInfo.portalId) {
    case 'bidnetDirect':
      return 'Log in to BidNet Direct to verify this opportunity, then mark session active in NOMYX.';
    case 'njstart':
      return 'Log in to NJSTART to verify this opportunity, then mark session active in NOMYX.';
    case 'samgov':
      return 'NOMYX AI will verify via SAM.gov API automatically.';
    case 'sbaSubnet':
      return 'Visit SBA SubNet and search for matching subcontracting opportunities.';
    case 'njdpp':
      return 'Visit NJ DPP portal to verify this opportunity.';
    case 'camdenCounty':
    case 'mercerCounty':
      return 'Visit the county procurement portal to verify this listing.';
    case 'hospitalVendor':
      return 'Visit the hospital vendor portal to verify and register as a vendor if needed.';
    case 'schoolDistricts':
      return 'Contact the school district procurement office to verify.';
    default:
      return 'Verify the opportunity by visiting the source link or portal directly.';
  }
}

function needsPortalLogin(sourceInfo) {
  // These portals require login to view full opportunity details
  var loginRequired = ['bidnetDirect', 'njstart', 'hospitalVendor'];
  return loginRequired.includes(sourceInfo.portalId);
}

// ── BATCH IMPORT ──────────────────────────────────────────────────────────────

function importEmailMessages(messages) {
  if (!messages || !messages.length) return { imported: 0, duplicates: 0, failed: 0, alerts: [] };
  var imported = 0, duplicates = 0, failed = 0, alerts = [];
  messages.forEach(function(msg) {
    try {
      var result = parseEmailMessage(msg);
      if (!result) { failed++; return; }
      if (result.status === 'DUPLICATE') { duplicates++; return; }
      imported++;
      alerts.push(result);
    } catch(e) {
      console.warn('[EmailParser] Failed to parse message:', e.message);
      failed++;
    }
  });
  return { imported: imported, duplicates: duplicates, failed: failed, alerts: alerts };
}

// ── REPORT SECTIONS ───────────────────────────────────────────────────────────
// Build categorized sections for daily report and dashboard

function buildReportSections(scanBids, emailAlerts) {
  scanBids = scanBids || [];
  emailAlerts = emailAlerts || getAlerts();

  var verifiedReal   = [];
  var emailFound     = [];
  var loginRequired  = [];
  var setupNeeded    = [];
  var doNotAct       = [];

  // Scan bids
  scanBids.forEach(function(b) {
    var bCopy = Object.assign({}, b);
    if (b.isFake)                                       { bCopy._section = 'DO_NOT_ACT';        doNotAct.push(bCopy); }
    else if (b.verificationStatus === 'VERIFIED')       { bCopy._section = 'VERIFIED_REAL';     verifiedReal.push(bCopy); }
    else if (b.verificationStatus === 'LOGIN_REQUIRED') { bCopy._section = 'LOGIN_REQUIRED';    loginRequired.push(bCopy); }
    else if (b.verificationStatus === 'SETUP_NEEDED')   { bCopy._section = 'SETUP_NEEDED';      setupNeeded.push(bCopy); }
    else                                                { bCopy._section = 'NEEDS_VERIFICATION'; emailFound.push(bCopy); }
  });

  // Email alerts
  emailAlerts.forEach(function(a) {
    var aCopy = Object.assign({}, a);
    if (a.verificationStatus === ALERT_STATUS.VERIFIED_REAL) {
      aCopy._section = 'VERIFIED_REAL'; verifiedReal.push(aCopy);
    } else if (a.verificationStatus === ALERT_STATUS.LOGIN_REQUIRED || a.portalLoginNeeded) {
      aCopy._section = 'LOGIN_REQUIRED'; loginRequired.push(aCopy);
    } else if (a.verificationStatus === ALERT_STATUS.IGNORED) {
      // omit from report
    } else {
      aCopy._section = 'EMAIL_ALERTS_FOUND'; emailFound.push(aCopy);
    }
  });

  // URGENT: Only VERIFIED_REAL with a real numeric deadlineDays <= 3 -- null-safe
  var urgentVerified = verifiedReal.filter(function(b) {
    return b.deadlineDays != null && typeof b.deadlineDays === 'number' && b.deadlineDays <= 3 && !b.isFake;
  });

  return {
    A_VERIFIED_REAL:    verifiedReal,
    B_EMAIL_ALERTS_FOUND: emailFound,
    C_LOGIN_REQUIRED:   loginRequired,
    D_SETUP_NEEDED:     setupNeeded,
    E_DO_NOT_ACT:       doNotAct,
    urgentVerified:     urgentVerified,
    _noUrgentPlaceholders: doNotAct.every(function(b) { return !b.urgent; }),
    _noNullDeadlines:   verifiedReal.every(function(b) { return b.deadlineDays !== 'null'; }),
    timestamp: new Date().toISOString()
  };
}

// -- EXPORTS ------------------------------------------------------------------

module.exports = {
  ALERT_STATUS:               ALERT_STATUS,
  ALLOWED_STATUS_TRANSITIONS: ALLOWED_STATUS_TRANSITIONS,
  SENDER_PATTERNS:            SENDER_PATTERNS,
  KEYWORD_PATTERNS:           KEYWORD_PATTERNS,
  parseEmailMessage:          parseEmailMessage,
  importEmailMessages:        importEmailMessages,
  extractDueDate:             extractDueDate,
  deadlineDaysFromDate:       deadlineDaysFromDate,
  matchKeywords:              matchKeywords,
  extractTitle:               extractTitle,
  extractAgency:              extractAgency,
  extractLink:                extractLink,
  extractLocation:            extractLocation,
  detectSource:               detectSource,
  isDuplicate:                isDuplicate,
  getAlerts:                  getAlerts,
  getAlertById:               getAlertById,
  getAlertsByStatus:          getAlertsByStatus,
  updateAlertStatus:          updateAlertStatus,
  clearAlerts:                clearAlerts,
  getAlertSummary:            getAlertSummary,
  buildReportSections:        buildReportSections,
  needsPortalLogin:           needsPortalLogin
};

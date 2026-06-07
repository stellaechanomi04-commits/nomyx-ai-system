/**
 * Opportunity Pipeline -- Phase 16
 * Go/No-Go scoring, content-based deduplication, and opportunity store.
 *
 * SECURITY RULES:
 * - No bid submission ever
 * - No outreach email sending
 * - No auto-posting
 * - Stella approves all actions
 * - No raw passwords, tokens, or secrets
 * - Only VERIFIED_REAL alerts can be promoted to urgent opportunities
 */

'use strict';

// ── GO/NO-GO SCORING RUBRIC ───────────────────────────────────────────────────
// Max 100 pts. Tier: GO >= 60 | MAYBE 35-59 | NO-GO < 35

var SCORE_TIERS = { GO: 60, MAYBE: 35 };

function scoreOpportunity(alert) {
  if (!alert) return null;
  var score = 0;
  var factors = [];
  var blockers = [];
  var requiredDocs = [];

  // --- Location fit (0-25 pts) -----------------------------------------------
  var loc = ((alert.location || '') + ' ' + (alert.subject || '') + ' ' + (alert.title || '')).toLowerCase();
  if (/camden|mercer|burlington|gloucester|atlantic|salem|cape may/.test(loc)) {
    score += 25; factors.push('Location: South NJ county -- optimal service area');
  } else if (/new jersey|nj\/pa|njpa|\bnj\b/.test(loc)) {
    score += 22; factors.push('Location: NJ/PA -- core service area');
  } else if (/pennsylvania|delaware|maryland|new york|nyc/.test(loc)) {
    score += 12; factors.push('Location: Adjacent market -- feasible with coordination');
    blockers.push('Location outside primary NJ service area -- confirm NOMYX can serve');
  } else {
    factors.push('Location: Not specified or outside service area');
  }

  // --- Category fit (0-30 pts) ------------------------------------------------
  var kw = ((alert.keywordMatches || []).join(' ') + ' ' + (alert.title || '') + ' ' + (alert.subject || '')).toLowerCase();
  if (/medical courier|specimen transport|lab specimen|clinical courier/.test(kw)) {
    score += 30; factors.push('Category: Medical courier -- high-value NOMYX specialty');
    requiredDocs.push('Medical courier insurance rider', 'HIPAA compliance documentation', 'Vehicle temperature-log capability', 'Chain-of-custody forms');
  } else if (/last.mile|final.mile/.test(kw)) {
    score += 28; factors.push('Category: Last-mile delivery -- core NOMYX capability');
    requiredDocs.push('Commercial vehicle registration', 'Commercial auto insurance cert ($1M min)', 'Delivery tracking capability statement');
  } else if (/logistics coordination|logistics services|supply chain/.test(kw)) {
    score += 22; factors.push('Category: Logistics coordination -- NOMYX capable');
    requiredDocs.push('Business license', 'General liability insurance cert', 'Capability statement');
  } else if (/courier|delivery|dispatch|freight|transportation|trucking/.test(kw)) {
    score += 20; factors.push('Category: Courier/delivery -- general NOMYX fit');
    requiredDocs.push('Business license', 'Insurance cert');
  } else if (/administrative|staffing|support services/.test(kw)) {
    score += 10; factors.push('Category: Administrative -- adjacent, lower priority');
  }

  // --- Subcontract vs direct bid (0-10 pts) -----------------------------------
  if (alert.portalId === 'sbaSubnet' || /subcontract|sub-contract|subcont/i.test(kw)) {
    score += 10; factors.push('Type: Subcontract opportunity -- lower barrier to entry, no direct bid required');
  }

  // --- Deadline urgency (0-10 pts) -------------------------------------------
  if (alert.deadlineDays != null && typeof alert.deadlineDays === 'number') {
    if (alert.deadlineDays > 0 && alert.deadlineDays <= 7) {
      score += 5; factors.push('Deadline: ' + alert.deadlineDays + ' days -- urgent');
      blockers.push('Very short deadline (' + alert.deadlineDays + ' days) -- must act immediately');
    } else if (alert.deadlineDays > 7 && alert.deadlineDays <= 30) {
      score += 10; factors.push('Deadline: ' + alert.deadlineDays + ' days -- reasonable window');
    } else if (alert.deadlineDays > 30) {
      score += 8; factors.push('Deadline: ' + alert.deadlineDays + ' days -- ample time to prepare');
    } else {
      factors.push('Deadline: already passed -- verify if still open');
      blockers.push('Deadline appears passed -- confirm opportunity is still active');
    }
  } else {
    score += 6; factors.push('Deadline: Not verified -- check portal for due date');
    blockers.push('Due date unknown -- must verify on source portal');
  }

  // --- Portal login required (-5 pts) ----------------------------------------
  if (alert.portalLoginNeeded) {
    score -= 5; factors.push('Note: Portal login required to view full RFP details');
    blockers.push('Portal login needed (BidNet/NJSTART) -- Stella must log in to verify');
  }

  // --- UNCONFIRMED flag (-10 pts) --------------------------------------------
  if (/unconfirmed/i.test(alert.title || '') || /unconfirmed/i.test(alert.subject || '')) {
    score -= 10; factors.push('Note: Marked UNCONFIRMED in alert email -- must verify against portal');
    blockers.push('Alert marked UNCONFIRMED -- verify before pursuing');
  }

  // --- Common required docs --------------------------------------------------
  requiredDocs.push('NOMYX business license (NJ)');
  requiredDocs.push('W-9 (current year)');
  requiredDocs.push('UEI / SAM.gov registration (must be active)');
  if (alert.category === 'federal' || alert.portalId === 'sbaSubnet') {
    requiredDocs.push('SAM.gov active registration', 'NAICS codes verified (488510, 492110, 484110)');
  }
  if (alert.portalId === 'bidnetDirect') {
    requiredDocs.push('BidNet Direct vendor registration (free)');
  }
  if (alert.portalId === 'njstart') {
    requiredDocs.push('NJSTART vendor profile (NJ state portal)');
  }

  // --- Final score + tier ---------------------------------------------------
  var finalScore = Math.max(0, Math.min(100, score));
  var tier;
  if (finalScore >= SCORE_TIERS.GO)    tier = 'GO';
  else if (finalScore >= SCORE_TIERS.MAYBE) tier = 'MAYBE';
  else                                       tier = 'NO-GO';

  // --- Startup cost estimate ------------------------------------------------
  var startupCost;
  if (/medical courier|specimen/.test(kw)) {
    startupCost = '$500-2,000 (medical courier insurance rider + HIPAA compliance docs)';
  } else if (/last.mile|delivery|courier/.test(kw)) {
    startupCost = '$200-500 (vehicle registration update + commercial insurance cert)';
  } else {
    startupCost = '$0-300 (document preparation and portal registration only)';
  }

  // --- Recommended action ---------------------------------------------------
  var recommendedAction;
  if (tier === 'GO') {
    if (alert.portalId === 'sbaSubnet') {
      recommendedAction = 'Visit SBA SubNet portal, identify the prime contractor, and prepare a capability statement for Stella to approve before sending.';
    } else if (alert.portalId === 'bidnetDirect') {
      recommendedAction = 'Stella logs in to BidNet Direct, views the full RFP, downloads documents, and reviews bid requirements. NOMYX AI assists with document prep.';
    } else if (alert.portalId === 'njstart') {
      recommendedAction = 'Stella logs in to NJSTART, views solicitation, and downloads RFP for Stella review and Go/No-Go decision.';
    } else {
      recommendedAction = 'Verify opportunity on source portal, download RFP, and prepare bid package for Stella review.';
    }
  } else if (tier === 'MAYBE') {
    recommendedAction = 'Verify alert details on portal. If confirmed and requirements are met, Stella decides whether to pursue.';
  } else {
    recommendedAction = 'Low fit score. Mark no action unless Stella has specific interest in this category.';
  }

  return {
    score: finalScore,
    tier: tier,
    factors: factors,
    blockers: blockers,
    startupCost: startupCost,
    requiredDocs: requiredDocs,
    recommendedAction: recommendedAction
  };
}

// ── CONTENT DEDUPLICATION KEY ────────────────────────────────────────────────
// Two alerts with the same normalized title + source + location = same opportunity

function contentDedupKey(alert) {
  if (!alert) return null;
  var src = (alert.source || '').toLowerCase().trim();
  var title = (alert.title || '')
    .toLowerCase()
    .replace(/⚠️\s*urgent[:\s]*/gi, '')   // Remove URGENT prefix
    .replace(/--\s*null\s+days\s+left/gi, '')        // Remove "-- null days left"
    .replace(/--\s*\d+\s+days?\s+left/gi, '')        // Remove "-- N days left"
    .replace(/\(opportunity signal\)/gi, '')
    .replace(/\(unconfirmed\)/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
  var loc = (alert.location || '').toLowerCase().replace(/\s+/g, ' ').trim();
  return src + '|' + title + '|' + loc;
}

// ── IN-MEMORY OPPORTUNITY STORE ───────────────────────────────────────────────
// Separate from emailAlertParser.alertStore
// Only alerts promoted by Stella (or auto-promoted VERIFIED_REAL) live here

var opportunityStore = [];
var opportunityKeys = new Set();

function getOpportunities() { return opportunityStore.slice(); }

function clearOpportunities() { opportunityStore = []; opportunityKeys = new Set(); }

function getOpportunityById(id) {
  return opportunityStore.find(function(o) { return o.id === id; }) || null;
}

function importAlertToOpportunity(alert) {
  if (!alert || !alert.id) return { error: 'Invalid alert' };
  if (alert.verificationStatus === 'DUPLICATE' || alert.verificationStatus === 'IGNORED') {
    return { error: 'Cannot import DUPLICATE or IGNORED alert', status: alert.verificationStatus };
  }

  var key = alert.id;
  if (opportunityKeys.has(key)) {
    return { error: 'Already imported', opportunityId: key };
  }

  var goNoGo = scoreOpportunity(alert);

  var opportunity = {
    id: 'opp-' + alert.messageId,
    alertId: alert.id,
    source: alert.source,
    title: alert.title,
    buyer: alert.agency,
    dueDate: alert.dueDate,
    deadlineDays: alert.deadlineDays,
    deadlineDisplay: alert.deadlineDisplay,
    link: alert.url,
    category: alert.category,
    location: alert.location,
    fitScore: goNoGo.score,
    fitTier: goNoGo.tier,
    factors: goNoGo.factors,
    blockers: goNoGo.blockers,
    startupCost: goNoGo.startupCost,
    requiredDocs: goNoGo.requiredDocs,
    recommendedAction: goNoGo.recommendedAction,
    verificationStatus: alert.verificationStatus,
    reviewStatus: 'PENDING_STELLA_REVIEW',
    importedDate: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    // Safety constraints
    bidSubmitted: false,
    outreachSent: false,
    disclaimer: 'NOMYX AI does not submit bids. Stella reviews and acts directly.'
  };

  opportunityStore.push(opportunity);
  opportunityKeys.add(key);
  return { success: true, opportunity: opportunity };
}

// ── DEDUPLICATION ENGINE ─────────────────────────────────────────────────────
// Accepts the full alertStore array, returns { canonical: [], duplicates: [] }

function deduplicateAlerts(alerts) {
  if (!alerts || !alerts.length) return { canonical: [], duplicates: [], dupCount: 0, uniqueCount: 0, timestamp: new Date().toISOString() };

  var seen = {};
  var canonical = [];
  var duplicates = [];

  // Sort newest-first so we keep the most recent version of each unique alert
  var sorted = alerts.slice().sort(function(a, b) {
    return new Date(b.receivedDate || 0) - new Date(a.receivedDate || 0);
  });

  sorted.forEach(function(alert) {
    if (alert.verificationStatus === 'DUPLICATE' || alert.verificationStatus === 'IGNORED') {
      duplicates.push(alert);
      return;
    }
    var key = contentDedupKey(alert);
    if (key && seen[key]) {
      duplicates.push(alert);
    } else {
      if (key) seen[key] = true;
      canonical.push(alert);
    }
  });

  return {
    canonical: canonical,
    duplicates: duplicates,
    dupCount: duplicates.length,
    uniqueCount: canonical.length,
    timestamp: new Date().toISOString()
  };
}

// ── TOP OPPORTUNITY PICKER ─────────────────────────────────────────────────────
// Returns the single highest-scoring canonical alert from a set

function topOpportunity(alerts) {
  if (!alerts || !alerts.length) return null;
  var scored = alerts.map(function(a) {
    return { alert: a, goNoGo: scoreOpportunity(a) };
  }).filter(function(x) { return x.goNoGo && x.goNoGo.tier !== 'NO-GO'; });
  if (!scored.length) return null;
  scored.sort(function(a, b) { return b.goNoGo.score - a.goNoGo.score; });
  return scored[0];
}

// ── NEXT MONEY ACTION ────────────────────────────────────────────────────────
// Returns the most actionable single next step for Stella

function nextMoneyAction(alerts) {
  var top = topOpportunity(alerts);
  if (!top) return 'No verified opportunities found. Run /gmail/scan and check portals for new alerts.';
  var a = top.alert;
  var g = top.goNoGo;
  if (g.tier === 'GO') {
    if (a.portalId === 'sbaSubnet') {
      return 'GO: Visit SBA SubNet, find prime for "' + (a.title || 'Last-Mile opportunity') + '", prepare capability statement.';
    }
    if (a.portalId === 'bidnetDirect') {
      return 'GO: Log in to BidNet Direct and view the full RFP for "' + (a.title || 'the top opportunity') + '".';
    }
    return 'GO: Verify and pursue "' + (a.title || 'top opportunity') + '" -- score ' + g.score + '/100.';
  }
  return 'MAYBE: Verify "' + (a.title || 'top alert') + '" on ' + (a.source || 'portal') + ' before deciding.';
}

// ── EXPORTS ───────────────────────────────────────────────────────────────────

module.exports = {
  scoreOpportunity,
  contentDedupKey,
  deduplicateAlerts,
  importAlertToOpportunity,
  getOpportunities,
  getOpportunityById,
  clearOpportunities,
  topOpportunity,
  nextMoneyAction,
  SCORE_TIERS
};

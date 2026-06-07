'use strict';
/**
 * modules/opportunity-execution.js
 * Phase 16.2 — Opportunity Execution Workflow Engine
 *
 * SAFETY RULES (enforced in every function):
 *  - No bid submission
 *  - No email sending
 *  - No auto-posting
 *  - No document upload
 *  - No money spending
 *  - No raw password storage
 *  - No token/API key exposure
 *  - No Stella Bella data touched
 *  - No public NOMYX website touched
 *
 * All outreach drafts go to approval_queue.json and require Stella approval before any action.
 */

const NOMYX_CAP = {
  naics: ['492110', '561210', '561990', '541614'],
  services: [
    'Last-mile delivery',
    'Courier and express delivery',
    'Administrative logistics support',
    'Back-office document handling',
    'Medical specimen courier (HIPAA certified)',
    'Government logistics coordination',
    'Route planning and operations support',
  ],
  certs: ['W-9', 'NJ Business Registration', 'HIPAA (completed)', 'SBE (in progress)'],
  insurance_on_hand: false, // COI not yet purchased
  states: ['NJ', 'PA'],
  company: 'NOMYX Logistics Solutions LLC',
};

// ── 1. Document Checklist ──────────────────────────────────────────────────────
function generateChecklist(opp) {
  const base = [
    { item: 'Capability Statement (current version)', status: '✅ Ready', action: 'Download from /capability-statement' },
    { item: 'W-9', status: '✅ Ready', action: 'On file — confirm with Stella before use' },
    { item: 'NJ Business Registration Certificate', status: '✅ Ready', action: 'On file' },
  ];

  const required = opp.required_documents || [];
  const extras = [];

  if (required.some(d => /insurance|coi/i.test(d))) {
    extras.push({ item: 'Certificate of Insurance (COI)', status: '🔴 NOT YET PURCHASED', action: 'Stella must purchase GL + Auto insurance before bidding' });
  }
  if (required.some(d => /sbe/i.test(d))) {
    extras.push({ item: 'SBE Certificate', status: '🟡 In Progress', action: 'Apply via NJ Treasury Small Business Enterprise program' });
  }
  if (required.some(d => /sam\.gov|cage/i.test(d))) {
    extras.push({ item: 'SAM.gov Active Registration + CAGE Code', status: '🟡 Confirm Status', action: 'Log into SAM.gov and verify active registration' });
  }
  if (required.some(d => /wosb/i.test(d))) {
    extras.push({ item: 'WOSB Documentation', status: '🟡 Pending', action: 'Apply via SBA WOSB program after SAM.gov confirmed active' });
  }
  if (required.some(d => /hipaa/i.test(d))) {
    extras.push({ item: 'HIPAA Training Certificate', status: '✅ Ready', action: 'Certificate on file in Certifications folder' });
  }
  if (required.some(d => /references/i.test(d))) {
    extras.push({ item: '2 NJ Government References', status: '🔴 Not Yet Secured', action: 'Identify 2 prior government clients or contacts who can serve as references' });
  }
  if (required.some(d => /sourcewell/i.test(d))) {
    extras.push({ item: 'Sourcewell Master Agreement', status: '🔴 HARD STOP — Do not bid', action: 'NOMYX does not hold a Sourcewell agreement. Cannot bid this opportunity.' });
  }

  return {
    opportunity_id: opp.id,
    opportunity_title: opp.title,
    generated_at: new Date().toISOString(),
    items: [...base, ...extras],
    warning: 'No documents have been submitted. This is a readiness checklist only.',
    next_step: 'Stella reviews checklist and confirms which items are in hand before proceeding.',
  };
}

// ── 2. Buyer Questions ─────────────────────────────────────────────────────────
function generateBuyerQuestions(opp) {
  const base = [
    'Is this opportunity open to woman-owned small businesses (WOSB) or SBE-certified vendors?',
    'What is the primary evaluation criteria — lowest price, best value, or qualifications?',
    'Are subcontracting or teaming arrangements permitted?',
    'Is there a pre-bid conference or site visit required?',
    'What insurance minimums are required for this contract?',
  ];

  const extras = [];
  const scope = (opp.scope || '').toLowerCase();
  const title = (opp.title || '').toLowerCase();

  if (/last.mile|delivery|courier/.test(scope + title)) {
    extras.push('What are the geographic service area boundaries for deliveries?');
    extras.push('What is the expected daily/weekly volume of deliveries?');
    extras.push('Are there vehicle or equipment requirements (branded vehicles, GPS tracking, etc.)?');
  }
  if (/medical|specimen|hipaa|health/.test(scope + title)) {
    extras.push('Is HIPAA certification required for all personnel handling materials?');
    extras.push('What temperature and chain-of-custody requirements apply to specimen transport?');
  }
  if (/subcontract|sub.contract|prime/.test(scope + title)) {
    extras.push('What percentage of work can be subcontracted under your prime agreement?');
    extras.push('Is NOMYX eligible to be added to your existing teaming arrangement?');
  }
  if (/federal|army|dod|corps/.test(scope + title)) {
    extras.push('Is an active SAM.gov registration required at time of submission?');
    extras.push('Are there security clearance requirements for personnel?');
  }
  if (/sba|subnet/.test(scope + title)) {
    extras.push('What is the maximum contract value and are there small business set-aside preferences?');
    extras.push('Is this a firm-fixed-price or indefinite-delivery type contract?');
  }

  return {
    opportunity_id: opp.id,
    opportunity_title: opp.title,
    buyer_contact: opp.buyer_contact || 'See solicitation for buyer contact',
    generated_at: new Date().toISOString(),
    questions: [...base, ...extras].slice(0, 10),
    warning: 'DRAFT — NOT SENT. Stella must approve before any outreach to buyers.',
    next_step: 'Stella reviews, edits, and approves each question. Then submits via portal Q&A system — not email.',
  };
}

// ── 3. Startup Cost Estimate ───────────────────────────────────────────────────
function estimateStartupCost(opp) {
  const level = opp.startup_cost_level || 'medium';
  const required = opp.required_documents || [];
  const insurance = required.some(d => /insurance|coi/i.test(d));
  const sbe = required.some(d => /sbe/i.test(d));
  const wosb = required.some(d => /wosb/i.test(d));
  const sam = required.some(d => /sam\.gov/i.test(d));

  const items = [];
  let low = 0, high = 0;

  // Insurance
  if (insurance) {
    items.push({ item: 'General Liability Insurance (GL $1M/$2M)', est_low: 1200, est_high: 2400, notes: 'Annual premium — check with NJ broker. Required before bidding.' });
    items.push({ item: 'Commercial Auto Insurance ($500K-$1M)', est_low: 800, est_high: 2000, notes: 'Required for delivery vehicles. Cost depends on fleet size.' });
    low += 2000; high += 4400;
  }

  // Certifications
  if (sbe) {
    items.push({ item: 'NJ SBE Certification Application', est_low: 0, est_high: 250, notes: 'Free to apply via NJ Treasury. Allow 60-90 days.' });
    low += 0; high += 250;
  }
  if (wosb) {
    items.push({ item: 'WOSB Certification (SBA)', est_low: 0, est_high: 350, notes: 'Free via SBA WOSB program or ~$350 via NWBOC third-party certifier.' });
    low += 0; high += 350;
  }
  if (sam) {
    items.push({ item: 'SAM.gov Registration (maintenance)', est_low: 0, est_high: 0, notes: 'Free — do NOT pay third-party services. Register directly at sam.gov.' });
  }

  // Operations
  items.push({ item: 'Bid preparation time (Stella)', est_low: 0, est_high: 0, notes: 'Internal time — estimate 8-16 hours for first bid package.' });

  if (level === 'low') {
    items.push({ item: 'Miscellaneous (printing, notary, registration)', est_low: 50, est_high: 150, notes: 'Document preparation costs.' });
    low += 50; high += 150;
  } else if (level === 'medium') {
    items.push({ item: 'Miscellaneous (printing, notary, portal fees)', est_low: 100, est_high: 400, notes: 'Document preparation and registration costs.' });
    low += 100; high += 400;
  } else {
    items.push({ item: 'Miscellaneous (legal review, specialized certs)', est_low: 500, est_high: 2000, notes: 'High-complexity bid — may require legal or consultant support.' });
    low += 500; high += 2000;
  }

  return {
    opportunity_id: opp.id,
    opportunity_title: opp.title,
    generated_at: new Date().toISOString(),
    level,
    items,
    total_low: low,
    total_high: high,
    summary: `Estimated startup cost: $${low.toLocaleString()} – $${high.toLocaleString()}`,
    warning: 'Estimate only. Get actual quotes from NJ insurance brokers before committing.',
    next_step: 'Stella reviews cost estimate and decides whether to proceed before any money is spent.',
  };
}

// ── 4. Fit Reason ──────────────────────────────────────────────────────────────
function buildFitReason(opp) {
  const reasons = [];
  const scope = (opp.scope || '').toLowerCase();
  const title = (opp.title || '').toLowerCase();

  if (/nj|new jersey/.test(scope + (opp.agency || '').toLowerCase())) {
    reasons.push('NJ-based opportunity — matches NOMYX primary service territory.');
  }
  if (/pa|pennsylvania/.test(scope + (opp.agency || '').toLowerCase())) {
    reasons.push('PA coverage — NOMYX serves NJ/PA corridor.');
  }
  if (/courier|delivery|last.mile/.test(scope + title)) {
    reasons.push('Core logistics delivery scope — direct NAICS 492110 match.');
  }
  if (/admin|back.office|document/.test(scope + title)) {
    reasons.push('Administrative logistics support — NOMYX offers back-office coordination.');
  }
  if (/medical|specimen/.test(scope + title)) {
    reasons.push('Medical courier scope — NOMYX holds HIPAA certificate for specimen transport.');
  }
  if (/sba|subnet|small business/.test(scope + title)) {
    reasons.push('SBA program — NOMYX qualifies as a small business and potential WOSB.');
  }
  if (/subcontract|sub.contract|prime/.test(scope + title)) {
    reasons.push('Subcontract opportunity — lower risk approach, no prime bid required.');
  }
  if ((opp.fit_score || 0) >= 7) {
    reasons.push(`High fit score (${opp.fit_score}/10) — competitive positioning for this opportunity.`);
  }

  return {
    opportunity_id: opp.id,
    opportunity_title: opp.title,
    generated_at: new Date().toISOString(),
    fit_score: opp.fit_score,
    go_no_go_verdict: (opp.go_no_go || {}).verdict || 'WATCH',
    reasons: reasons.length ? reasons : ['General logistics fit — review scope details for specifics.'],
    capability_match_areas: NOMYX_CAP.services.filter(s => {
      const sl = s.toLowerCase();
      return scope.includes(sl.split(' ')[0]) || title.includes(sl.split(' ')[0]);
    }),
  };
}

// ── 5. Blockers ────────────────────────────────────────────────────────────────
function analyzeBlockers(opp) {
  const blockers = opp.blockers || [];
  const classified = blockers.map(b => {
    const text = b.toLowerCase();
    let severity = 'warning';
    let action = 'Review and resolve before proceeding';
    if (/hard stop|do not bid|dea|sourcewell|absolute/.test(text)) {
      severity = 'hard-stop';
      action = 'ABSOLUTE HARD STOP — Cannot bid this opportunity';
    } else if (/insurance|coi/.test(text)) {
      severity = 'critical';
      action = 'Purchase GL + Auto COI from NJ broker. Required before bid submission.';
    } else if (/sam\.gov|cage/.test(text)) {
      severity = 'critical';
      action = 'Log into SAM.gov, confirm active registration and CAGE code.';
    } else if (/hipaa/.test(text)) {
      severity = opp.review_status === 'archived' ? 'critical' : 'warning';
      action = 'HIPAA certificate on file. Confirm with Stella before use.';
    } else if (/not yet registered|register/.test(text)) {
      severity = 'warning';
      action = 'Register on portal. Free in most cases.';
    } else if (/stella.*approv|approval/.test(text)) {
      severity = 'process';
      action = 'Add to approval queue on /m. Stella must approve before any action.';
    } else if (/sample|not real/.test(text)) {
      severity = 'info';
      action = 'Sample data — use real scanner to find live opportunities.';
    }
    return { blocker: b, severity, action };
  });

  const canProceed = !classified.some(c => c.severity === 'hard-stop');
  const criticalCount = classified.filter(c => c.severity === 'critical').length;

  return {
    opportunity_id: opp.id,
    opportunity_title: opp.title,
    generated_at: new Date().toISOString(),
    blockers: classified,
    can_proceed: canProceed,
    critical_count: criticalCount,
    summary: canProceed
      ? `${criticalCount} critical blocker(s) to resolve before bidding`
      : 'HARD STOP — Do not pursue this opportunity',
  };
}

// ── 6. Deadline Risk ───────────────────────────────────────────────────────────
function assessDeadlineRisk(opp) {
  const deadline = opp.deadline || '';
  const today = new Date();
  let daysUntil = null;
  let riskLevel = 'unknown';
  let riskLabel = '⬜ Unknown';
  let urgency = '';

  const dateMatch = deadline.match(/(\d{4}-\d{2}-\d{2})/);
  if (dateMatch) {
    const deadlineDate = new Date(dateMatch[1]);
    daysUntil = Math.ceil((deadlineDate - today) / (1000 * 60 * 60 * 24));
    if (daysUntil < 0) { riskLevel = 'expired'; riskLabel = '🔴 Expired'; urgency = 'Deadline has passed.'; }
    else if (daysUntil <= 7) { riskLevel = 'critical'; riskLabel = '🔴 Critical — <7 days'; urgency = `Only ${daysUntil} days to deadline. Immediate Stella decision required.`; }
    else if (daysUntil <= 21) { riskLevel = 'high'; riskLabel = '🟠 High — <21 days'; urgency = `${daysUntil} days. Start preparation immediately.`; }
    else if (daysUntil <= 45) { riskLevel = 'medium'; riskLabel = '🟡 Medium — <45 days'; urgency = `${daysUntil} days. Begin document gathering now.`; }
    else { riskLevel = 'low'; riskLabel = '🟢 Low'; urgency = `${daysUntil} days. Adequate time if preparation starts soon.`; }
  } else if (/ongoing|monitor|watchlist/.test(deadline.toLowerCase())) {
    riskLevel = 'ongoing'; riskLabel = '🔵 Ongoing'; urgency = 'No fixed deadline — review quarterly.';
  } else if (/tbd/i.test(deadline)) {
    riskLevel = 'tbd'; riskLabel = '⬜ TBD'; urgency = 'Deadline not yet set — monitor portal.';
  }

  return {
    opportunity_id: opp.id,
    opportunity_title: opp.title,
    generated_at: new Date().toISOString(),
    deadline_raw: deadline,
    days_until: daysUntil,
    risk_level: riskLevel,
    risk_label: riskLabel,
    urgency_message: urgency,
    recommended_action: daysUntil !== null && daysUntil <= 21
      ? 'Immediate Stella decision required — add to approval queue now'
      : 'Monitor and check portal regularly',
  };
}

// ── 7. Capability Statement Match ─────────────────────────────────────────────
function matchCapabilityStatement(opp) {
  const scope = (opp.scope || '').toLowerCase();
  const title = (opp.title || '').toLowerCase();
  const naics = opp.naics || '';

  const matches = NOMYX_CAP.services.filter(s => {
    const keywords = s.toLowerCase().split(/\s+/);
    return keywords.some(kw => kw.length > 4 && (scope.includes(kw) || title.includes(kw)));
  });

  const naicsMatch = NOMYX_CAP.naics.includes(naics);
  const strengthScore = Math.round((matches.length / NOMYX_CAP.services.length) * 100);

  return {
    opportunity_id: opp.id,
    opportunity_title: opp.title,
    generated_at: new Date().toISOString(),
    naics_match: naicsMatch,
    naics_opp: naics,
    naics_nomyx: NOMYX_CAP.naics,
    matching_services: matches,
    strength_score: strengthScore,
    strength_label: strengthScore >= 60 ? '🟢 Strong' : strengthScore >= 30 ? '🟡 Partial' : '🔴 Weak',
    recommended_sections: matches.length
      ? `Emphasize: ${matches.slice(0, 3).join('; ')} in your capability statement submission.`
      : 'Review solicitation scope and tailor capability statement accordingly.',
    download_url: '/capability-statement/download/pdf',
  };
}

// ── 8. Outreach Draft (APPROVAL REQUIRED — never auto-sent) ───────────────────
function generateOutreachDraft(opp) {
  const target = opp.buyer_contact || (opp.agency || 'Procurement Office');
  const isSubcontract = /subcontract|prime|broadway|jersey mail|school nurse/i.test(
    (opp.scope || '') + (opp.title || '') + target
  );

  let subject, body;

  if (isSubcontract) {
    subject = `Subcontracting Inquiry — NOMYX Logistics Solutions LLC`;
    body = `Dear ${target},

My name is Stella Chanomi, founder of NOMYX Logistics Solutions LLC, a New Jersey-based woman-owned small business specializing in last-mile delivery, courier services, and administrative logistics support.

I am reaching out to inquire about subcontracting opportunities under your existing contract(s) with [agency name]. NOMYX provides:

• Last-mile and express courier delivery (NJ/PA corridor)
• Administrative logistics and back-office support
• Medical specimen courier (HIPAA certified)

We are registered on SAM.gov and hold a current W-9 and capability statement. We would welcome the opportunity to support your operations on a subcontract basis.

Would you be open to a brief call to discuss how NOMYX can add value to your team?

Best regards,
Stella Chanomi
NOMYX Logistics Solutions LLC
info@nomyxlogistics.com
(862) 214-8366`;
  } else {
    subject = `Vendor Introduction — NOMYX Logistics Solutions LLC`;
    body = `Dear ${target},

My name is Stella Chanomi, founder of NOMYX Logistics Solutions LLC. We are a New Jersey-based woman-owned small business (WOSB) specializing in last-mile delivery and logistics coordination for government agencies.

In regard to [solicitation/opportunity name], I would like to learn more about:
• Vendor registration requirements
• Small business or WOSB set-aside preferences
• Subcontracting or teaming opportunities

NOMYX holds: W-9, NJ Business Registration, and HIPAA certification. Our NAICS codes include 492110 (Couriers and Express Delivery), 561210 (Facilities Support Services), and 541614 (Process, Physical Distribution, and Logistics Consulting).

Attached is our capability statement for your review.

Thank you for your time.

Stella Chanomi
NOMYX Logistics Solutions LLC
info@nomyxlogistics.com
(862) 214-8366`;
  }

  return {
    opportunity_id: opp.id,
    opportunity_title: opp.title,
    draft_type: isSubcontract ? 'Subcontract Inquiry' : 'Vendor Introduction',
    to: target,
    subject,
    body,
    generated_at: new Date().toISOString(),
    status: 'DRAFT — NOT SENT',
    approval_required: true,
    warning: '⛔ DO NOT SEND. This draft requires Stella approval before any contact. Add to approval queue for review.',
    next_step: 'Click "Approve & Queue for Sending" on /approval-queue. Stella must approve before any message is sent.',
  };
}

// ── 9. Full Execution Summary ──────────────────────────────────────────────────
function buildExecutionSummary(opp) {
  return {
    opportunity_id: opp.id,
    opportunity_title: opp.title,
    generated_at: new Date().toISOString(),
    checklist: generateChecklist(opp),
    buyer_questions: generateBuyerQuestions(opp),
    startup_cost: estimateStartupCost(opp),
    fit_reason: buildFitReason(opp),
    blockers: analyzeBlockers(opp),
    deadline_risk: assessDeadlineRisk(opp),
    capability_match: matchCapabilityStatement(opp),
    outreach_draft: generateOutreachDraft(opp),
    verification_status: {
      checklist_verified: false,
      buyer_questions_reviewed: false,
      startup_cost_reviewed: false,
      stella_approved: false,
      source_portal_checked: false,
    },
    next_action: opp.next_action || 'Review all sections and add to approval queue for Stella decision.',
  };
}

module.exports = {
  generateChecklist,
  generateBuyerQuestions,
  estimateStartupCost,
  buildFitReason,
  analyzeBlockers,
  assessDeadlineRisk,
  matchCapabilityStatement,
  generateOutreachDraft,
  buildExecutionSummary,
  NOMYX_CAP,
};

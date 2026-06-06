/**
 * Bid Execution Workflow — Phase 14
 * Prepares Go/No-Go scoring, document checklist, startup cost estimate,
 * outreach draft (subcontracts only), and next actions for verified bids.
 *
 * SAFETY: This module NEVER submits bids, sends emails, signs documents,
 * makes payments, or uploads to portals. All actions require Stella approval.
 */

const NAICS_FIT = {
  '488510': { code: '488510', title: 'Freight Transportation Arrangement', fit: 'primary' },
  '492110': { code: '492110', title: 'Couriers & Messengers', fit: 'primary' },
  '484110': { code: '484110', title: 'General Freight Trucking, Local', fit: 'primary' },
  '484121': { code: '484121', title: 'General Freight Trucking, Long-Distance', fit: 'secondary' },
  '561110': { code: '561110', title: 'Office Administrative Services', fit: 'secondary' },
  '562111': { code: '562111', title: 'Solid Waste Collection', fit: 'low' },
  '621610': { code: '621610', title: 'Home Health Care Services', fit: 'secondary' }
};

const SERVICE_AREA = ['NJ', 'PA', 'New Jersey', 'Pennsylvania', 'Camden', 'Mercer', 'Burlington', 'Gloucester', 'Atlantic', 'Philadelphia', 'Delaware'];

const TITLE_KEYWORDS = {
  primary: ['medical courier', 'specimen transport', 'courier', 'logistics', 'freight', 'delivery', 'transportation', 'dispatch', 'messenger', 'trucking'],
  secondary: ['administrative', 'relocation', 'shipment', 'warehousing', 'distribution', 'last-mile']
};

const BASE_DOCUMENT_CHECKLIST = [
  { doc: 'Capability Statement (NOMYX)', status: 'Ready', note: 'Update monthly — tailor to each bid' },
  { doc: 'SAM.gov Registration (active)', status: 'Active', note: 'Renew annually — check expiry date' },
  { doc: 'NJ Business License', status: 'Verify', note: 'Confirm current-year validity' },
  { doc: 'General Liability Insurance Certificate', status: 'Required', note: 'Minimum $1M GL typically required; add buyer as additional insured' },
  { doc: 'Auto/Commercial Vehicle Insurance', status: 'Required', note: 'Required for courier/transport bids' },
  { doc: 'W-9 (current year)', status: 'Ready', note: 'Use most recent W-9' },
  { doc: 'Vendor Registration on Portal', status: 'Required', note: 'Must register on the issuing portal before submission' },
  { doc: 'Bid Bond (if required)', status: 'Check RFP', note: 'Obtain from bonding company — typically 5-10% of bid value' },
  { doc: 'References (3 minimum)', status: 'Prepare', note: 'Similar past contracts preferred' },
  { doc: 'Pricing Worksheet', status: 'Prepare', note: 'All-inclusive hourly/per-mile/flat rate as specified in RFP' }
];

function scoreGoNoGo(bid) {
  var score = 40;
  var reasons = [];
  var blockers = [];

  // NAICS fit
  if (bid.naicsCode) {
    var naics = NAICS_FIT[bid.naicsCode];
    if (naics) {
      if (naics.fit === 'primary') { score += 20; reasons.push('Primary NAICS match: ' + naics.title); }
      else if (naics.fit === 'secondary') { score += 10; reasons.push('Secondary NAICS match: ' + naics.title); }
    }
  }

  // Service area
  var title = (bid.title || '').toLowerCase();
  var agency = (bid.agency || '').toLowerCase();
  var location = (bid.location || '').toLowerCase();
  var inServiceArea = SERVICE_AREA.some(function(s) {
    return title.includes(s.toLowerCase()) || agency.includes(s.toLowerCase()) || location.includes(s.toLowerCase());
  });
  if (inServiceArea) { score += 15; reasons.push('NJ/PA service area match'); }

  // Keyword match
  var primaryKw = TITLE_KEYWORDS.primary.filter(function(k) { return title.includes(k); });
  var secondaryKw = TITLE_KEYWORDS.secondary.filter(function(k) { return title.includes(k); });
  if (primaryKw.length > 0) { score += Math.min(primaryKw.length * 5, 15); reasons.push('Primary keyword match: ' + primaryKw.join(', ')); }
  if (secondaryKw.length > 0) { score += Math.min(secondaryKw.length * 3, 6); reasons.push('Secondary keyword: ' + secondaryKw.join(', ')); }

  // Set-aside advantage
  if (bid.setAside) {
    var sa = bid.setAside.toLowerCase();
    if (sa.includes('woman') || sa.includes('wosb') || sa.includes('edwosb')) { score += 15; reasons.push('WOSB set-aside — Stella qualifies'); }
    else if (sa.includes('small')) { score += 10; reasons.push('Small business set-aside — NOMYX qualifies'); }
    else if (sa.includes('minority') || sa.includes('8(a)') || sa.includes('hubzone')) { score += 5; reasons.push('Socioeconomic set-aside: ' + bid.setAside); }
  }

  // Deadline viability
  if (bid.deadlineDays == null) {
    blockers.push('Deadline not verified — confirm before bidding');
  } else if (bid.deadlineDays < 5) {
    score -= 25; blockers.push('Deadline too close — ' + bid.deadlineDays + ' days, high risk');
  } else if (bid.deadlineDays < 10) {
    score -= 10; blockers.push('Tight deadline — ' + bid.deadlineDays + ' days, expedited effort required');
  } else {
    score += 5; reasons.push('Adequate deadline: ' + bid.deadlineDays + ' days');
  }

  // Bond requirement
  if (bid.bondRequired) {
    score -= 10; blockers.push('Performance bond required — verify bonding capacity with surety');
  }

  // Value range
  if (bid.estimatedValue) {
    if (bid.estimatedValue > 5000000) {
      score -= 10; blockers.push('Large contract ($' + (bid.estimatedValue / 1000000).toFixed(1) + 'M) — past performance documentation critical');
    } else if (bid.estimatedValue >= 50000) {
      score += 5; reasons.push('Contract value in range: $' + bid.estimatedValue.toLocaleString());
    }
  }

  var finalScore = Math.max(0, Math.min(100, score));
  var goNoGo = finalScore >= 65 ? 'GO' : finalScore >= 45 ? 'MAYBE' : 'NO-GO';

  return { score: finalScore, goNoGo: goNoGo, reasons: reasons, blockers: blockers };
}

function buildDocumentChecklist(bid) {
  var docs = BASE_DOCUMENT_CHECKLIST.map(function(d) { return Object.assign({}, d); });

  // Remove bond if not required
  if (!bid.bondRequired) {
    docs = docs.filter(function(d) { return d.doc !== 'Bid Bond (if required)'; });
  }

  // Add medical-specific docs
  var title = (bid.title || '').toLowerCase();
  if (title.includes('medical') || title.includes('specimen') || title.includes('healthcare')) {
    docs.push({ doc: 'HIPAA Compliance Statement', status: 'Required', note: 'Medical courier bids require HIPAA compliance documentation' });
    docs.push({ doc: 'Chain of Custody Procedures', status: 'Required', note: 'Specimen transport requires documented chain of custody protocol' });
    docs.push({ doc: 'Temperature Control Capability Statement', status: 'If applicable', note: 'Some specimen transport requires temperature monitoring' });
  }

  // Add subcontract-specific docs
  if (bid.type === 'subcontract') {
    docs.push({ doc: 'Teaming Agreement Template', status: 'Prepare', note: 'Used when formalizing subcontract arrangement with prime' });
  }

  return docs;
}

function estimateStartupCost(bid) {
  var items = [];
  var low = 0;
  var high = 0;

  items.push({ item: 'Insurance certificate update / additional insured', low: 200, high: 500, note: 'Cost to add buyer as additional insured' });
  low += 200; high += 500;

  if (bid.bondRequired) {
    var bondBase = bid.estimatedValue ? Math.max(bid.estimatedValue * 0.01, 500) : 1000;
    items.push({ item: 'Bid/Performance Bond', low: Math.round(bondBase), high: Math.round(bondBase * 2.5), note: '1-3% of contract value via surety' });
    low += Math.round(bondBase); high += Math.round(bondBase * 2.5);
  }

  items.push({ item: 'Document printing & mailing (if required)', low: 50, high: 200, note: 'Some portals still require hard copies' });
  low += 50; high += 200;

  items.push({ item: 'Misc (portal registration, certified mail, etc.)', low: 100, high: 300 });
  low += 100; high += 300;

  return {
    items: items,
    totalLow: low,
    totalHigh: high,
    summary: 'Estimated $' + low.toLocaleString() + ' – $' + high.toLocaleString() + ' to pursue this bid'
  };
}

function buildNextActions(bid, scoring) {
  var actions = [];
  var step = 1;

  if (scoring.goNoGo === 'NO-GO') {
    actions.push({ step: step++, action: 'Review blockers listed above — reassess if situation changes', requiresApproval: false, note: scoring.blockers.join('; ') });
    return actions;
  }

  actions.push({ step: step++, action: 'Download bid documents / RFP from ' + (bid.source || 'portal'), requiresApproval: false });
  actions.push({ step: step++, action: 'Review scope of work and technical specifications in full', requiresApproval: false });
  actions.push({ step: step++, action: 'Verify NOMYX is registered as a vendor on ' + (bid.source || 'portal'), requiresApproval: false });
  actions.push({ step: step++, action: 'Confirm insurance certificates cover this bid\'s requirements', requiresApproval: false });
  actions.push({ step: step++, action: 'Build pricing estimate based on scope', requiresApproval: false });
  actions.push({ step: step++, action: 'Tailor capability statement section for this bid', requiresApproval: true, note: 'Stella reviews before finalizing' });

  if (bid.questionDeadline || bid.deadlineDays > 10) {
    actions.push({ step: step++, action: 'Submit pre-bid questions via portal by question deadline', requiresApproval: true, note: 'Stella approves questions before submitting' });
  }

  if (bid.type === 'subcontract') {
    actions.push({ step: step++, action: 'Contact prime contractor to express interest in subcontract', requiresApproval: true, note: 'Stella reviews and sends outreach — see outreachDraft below' });
  }

  actions.push({ step: step++, action: 'Finalize complete bid package', requiresApproval: true, critical: true, note: 'Stella reviews every line before submission' });
  actions.push({ step: step++, action: 'Stella submits via portal — NOMYX AI does not submit', requiresApproval: true, critical: true, note: 'Only Stella can press Submit. NOMYX AI will never submit on her behalf.' });

  return actions;
}

function buildOutreachDraft(bid) {
  if (bid.type !== 'subcontract' && !(bid.title || '').toLowerCase().includes('subcontract')) return null;

  return {
    to: bid.primeContractor || '[Prime Contractor Name — find in RFP]',
    subject: 'NOMYX Logistics Solutions — Subcontract Interest — ' + (bid.title || 'Opportunity'),
    body: [
      'Dear ' + (bid.primeContractorContact || '[Contracting Officer / Business Development Manager]') + ',',
      '',
      'My name is Stella Nomyx, founder of NOMYX Logistics Solutions LLC. We are a registered small business specializing in courier, freight transportation arrangement, and medical specimen transport in the NJ/PA region (NAICS 488510, 492110).',
      '',
      'We are interested in subcontracting opportunities under [' + (bid.title || 'this contract') + ']. Our capabilities include [describe relevant services].',
      '',
      'Please find our capability statement attached. We welcome the opportunity to discuss how NOMYX can support your team.',
      '',
      'Best regards,',
      'Stella Nomyx',
      'NOMYX Logistics Solutions LLC',
      'info@nomyxlogistics.com',
      '[Phone Number]'
    ].join('\n'),
    requiresStellaSendApproval: true,
    warning: 'DO NOT SEND without Stella reviewing and approving this draft. NOMYX AI never sends outreach emails automatically.'
  };
}

function buildExecutionPlan(bid) {
  var scoring = scoreGoNoGo(bid);
  var docs = buildDocumentChecklist(bid);
  var cost = estimateStartupCost(bid);
  var actions = buildNextActions(bid, scoring);
  var outreach = buildOutreachDraft(bid);

  var deadlineDisplay = bid.deadlineDays != null ? bid.deadlineDays + ' days left' : 'Deadline not verified — check portal';

  return {
    bid: {
      id: bid.id,
      title: bid.title,
      agency: bid.agency,
      source: bid.source,
      naicsCode: bid.naicsCode || 'Not listed',
      setAside: bid.setAside || 'None listed',
      estimatedValue: bid.estimatedValue ? '$' + bid.estimatedValue.toLocaleString() : 'Not listed',
      deadline: deadlineDisplay,
      location: bid.location || 'Verify',
      url: bid.url,
      verificationStatus: bid.verificationStatus
    },
    scoring: scoring,
    documentChecklist: docs,
    startupCostEstimate: cost,
    nextActions: actions,
    outreachDraft: outreach,
    disclaimer: 'NOMYX AI does not submit bids, send emails, sign documents, spend money, or post publicly. Every action above requires Stella\'s explicit approval.',
    generatedAt: new Date().toISOString()
  };
}

module.exports = {
  scoreGoNoGo,
  buildExecutionPlan,
  buildDocumentChecklist,
  estimateStartupCost,
  BASE_DOCUMENT_CHECKLIST,
  NAICS_FIT
};

// NOMYX Bid Verification Module
// RULE: Never show unconfirmed data as fact.
// Every data point must be tagged: CONFIRMED | ESTIMATED | NOT_FOUND | MANUAL_REQUIRED

// Verification statuses
const STATUS = {
  VERIFIED:           'VERIFIED',           // Confirmed from official portal/document
  UNCONFIRMED:        'UNCONFIRMED',         // AI-generated or not confirmed
  MANUAL_LOGIN:       'MANUAL_LOGIN_NEEDED', // Portal requires manual login
  DOCS_DOWNLOADED:    'DOCUMENTS_DOWNLOADED',// Files actually downloaded
  DOCS_UNAVAILABLE:   'DOCUMENTS_UNAVAILABLE',
  NEEDS_REVIEW:       'NEEDS_REVIEW',
  PLACEHOLDER:        'PLACEHOLDER',         // Fake/demo/test data
  ERROR:              'ERROR'
};

// Data source tags
const SOURCE_TAG = {
  CONFIRMED:        '✅ Confirmed from portal/document',
  ESTIMATED:        '⚠️ Estimated by AI — not confirmed',
  NOT_FOUND:        '❌ Not found in documents',
  MANUAL_REQUIRED:  '🔐 Manual login required',
  PORTAL_LIVE:      '🌐 Live from portal API',
  PLACEHOLDER:      '🚫 Placeholder — do not bid'
};

// Assign verification to a bid
function verifyBid(bid) {
  const v = { ...bid };

  // SAM.gov bids with real noticeId = VERIFIED from portal
  if (bid.source === 'SAM.gov' && bid.id && bid.id.length > 10 && !bid.id.startsWith('mock') && !bid.id.startsWith('fake')) {
    v.verificationStatus = STATUS.VERIFIED;
    v.verificationNote = `Confirmed from SAM.gov API. Notice ID: ${bid.id}`;
    v.dataSource = {
      title: SOURCE_TAG.PORTAL_LIVE,
      agency: SOURCE_TAG.PORTAL_LIVE,
      deadline: SOURCE_TAG.PORTAL_LIVE,
      naics: SOURCE_TAG.PORTAL_LIVE,
      url: SOURCE_TAG.PORTAL_LIVE,
      estimatedValue: bid.estimatedValue > 0 ? SOURCE_TAG.PORTAL_LIVE : SOURCE_TAG.NOT_FOUND,
      solicitationNumber: bid.solicitationNumber ? SOURCE_TAG.PORTAL_LIVE : SOURCE_TAG.NOT_FOUND,
      setAside: bid.setAside ? SOURCE_TAG.PORTAL_LIVE : SOURCE_TAG.NOT_FOUND
    };
    return v;
  }

  // BidNet Direct bids — MANUAL LOGIN REQUIRED (can't auto-verify without login)
  if (bid.source === 'BidNet Direct' || bid.platform === 'bidnetdirect') {
    v.verificationStatus = STATUS.MANUAL_LOGIN;
    v.verificationNote = 'BidNet Direct requires manual login to confirm this bid. Log in at bidnetdirect.com to verify.';
    v.dataSource = {
      title: SOURCE_TAG.MANUAL_REQUIRED,
      agency: SOURCE_TAG.MANUAL_REQUIRED,
      deadline: SOURCE_TAG.ESTIMATED + ' — verify on BidNet Direct',
      estimatedValue: SOURCE_TAG.ESTIMATED,
      solicitationNumber: bid.solicitationNumber ? SOURCE_TAG.MANUAL_REQUIRED : SOURCE_TAG.NOT_FOUND,
    };
    // Override analysis to not show GO without verification
    if (v.analysis) {
      v.analysis.goNoGo = 'NEEDS VERIFICATION';
      v.analysis.goNoGoReason = 'Cannot recommend GO until bid is confirmed on BidNet Direct portal. Please log in and verify this bid exists with the stated deadline and requirements.';
      v.analysis.stellaMessage = `⚠️ Stella — this bid needs manual verification. Log into BidNet Direct, search for "${bid.title}" from ${bid.agency}, and confirm it is open before taking any action.`;
    }
    return v;
  }

  // Subcontracting placeholder bids
  if (bid.platform === 'subcontracting') {
    v.verificationStatus = STATUS.NEEDS_REVIEW;
    v.verificationNote = 'Subcontracting opportunity from SBA SubNet. Visit eweb1.sba.gov/subnet to verify current status.';
    v.dataSource = {
      title: SOURCE_TAG.MANUAL_REQUIRED,
      deadline: SOURCE_TAG.ESTIMATED,
      estimatedValue: SOURCE_TAG.ESTIMATED
    };
    return v;
  }

  // Anything else = UNCONFIRMED
  v.verificationStatus = STATUS.UNCONFIRMED;
  v.verificationNote = 'Source not verified. Manual confirmation required before taking action.';
  return v;
}

// Build a verified, transparent bid summary
function buildTransparentSummary(bid) {
  const a = bid.analysis || {};
  const confirmed = [];
  const estimated = [];
  const notFound = [];
  const manualRequired = [];

  // Categorize each data point
  const ds = bid.dataSource || {};

  if (bid.source === 'SAM.gov') {
    confirmed.push(`Source: ${bid.source}`);
    confirmed.push(`Title: ${bid.title}`);
    if (bid.id) confirmed.push(`Notice ID: ${bid.id}`);
    if (bid.agency) confirmed.push(`Agency: ${bid.agency}`);
    if (bid.deadline) confirmed.push(`Deadline: ${bid.deadline.split('T')[0]}`);
    if (bid.naics) confirmed.push(`NAICS: ${bid.naics}`);
    if (bid.solicitationNumber) confirmed.push(`Solicitation #: ${bid.solicitationNumber}`);
    if (bid.setAside) confirmed.push(`Set-Aside: ${bid.setAside}`);
    if (bid.estimatedValue > 0) confirmed.push(`Listed Value: $${bid.estimatedValue.toLocaleString()}`);
    else notFound.push('Contract value not listed in SAM.gov posting');
    if (a.insuranceNeeded?.length) estimated.push(`Insurance requirements: estimated based on contract type`);
    if (a.certificationsNeeded?.length) estimated.push(`Certification needs: estimated based on NAICS`);
    estimated.push('Startup cost: AI estimate — verify with actual solicitation documents');
    estimated.push('Profit potential: AI estimate — based on contract type and NAICS');
    manualRequired.push('Download full solicitation documents from sam.gov link');
    manualRequired.push('Verify all insurance and certification requirements from official documents');
  } else if (bid.source === 'BidNet Direct') {
    manualRequired.push(`Verify "${bid.title}" exists on BidNet Direct`);
    manualRequired.push('Confirm deadline is still open');
    manualRequired.push('Download all official bid documents');
    estimated.push(`Deadline ${bid.deadline?.split('T')[0] || 'unknown'}: ESTIMATED — not confirmed`);
    estimated.push(`Value $${bid.estimatedValue?.toLocaleString() || 'unknown'}: ESTIMATED — not confirmed`);
    estimated.push(`Solicitation number ${bid.solicitationNumber || 'unknown'}: ESTIMATED — not confirmed`);
  }

  return { confirmed, estimated, notFound, manualRequired };
}

// Camden bid - explicitly marked as UNCONFIRMED PLACEHOLDER
function getCamdenPlaceholderBid() {
  return {
    id: 'bidnet-camden-medical-2026',
    title: 'Medical Courier and Specimen Transport — Camden County',
    agency: 'County of Camden, NJ (UNCONFIRMED)',
    source: 'BidNet Direct',
    location: 'Camden, NJ',
    naics: '492110',
    platform: 'bidnetdirect',
    verificationStatus: STATUS.UNCONFIRMED,
    verificationNote: '🚫 PLACEHOLDER — This bid was generated by AI as a probable opportunity signal. It was NOT confirmed as an open solicitation on BidNet Direct. Do NOT bid on this without manually verifying it exists.',
    isFake: true,
    dataSource: {
      title: SOURCE_TAG.PLACEHOLDER,
      deadline: SOURCE_TAG.PLACEHOLDER,
      estimatedValue: SOURCE_TAG.PLACEHOLDER,
      solicitationNumber: SOURCE_TAG.PLACEHOLDER
    },
    // No fake deadline, value, or solicitation number
    deadline: null,
    deadlineDays: null,
    estimatedValue: null,
    solicitationNumber: null,
    analysis: {
      goNoGo: 'DO NOT BID — UNCONFIRMED',
      goNoGoReason: 'This bid was not verified on BidNet Direct. It is an AI-generated placeholder based on a known opportunity type in Camden County NJ. Log into BidNet Direct and search for medical courier bids to find the real solicitation.',
      stellaMessage: '⚠️ Stella — this is NOT a verified bid. The AI flagged Camden County as a likely source of medical courier contracts, but this specific bid was not confirmed on BidNet Direct. Do not take any action until you find and verify the actual solicitation.',
      fitScore: null,
      urgencyLevel: 'VERIFY_FIRST'
    },
    url: 'https://www.bidnetdirect.com',
    manualAction: 'Log into bidnetdirect.com → search "medical courier" or "specimen transport" → Camden County NJ → verify if open solicitation exists'
  };
}

module.exports = { verifyBid, buildTransparentSummary, getCamdenPlaceholderBid, STATUS, SOURCE_TAG };

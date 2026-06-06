/**
 * SBA SubNet Scanner — Phase 14
 * Scans SBA Subcontracting Network for logistics/courier subcontract opportunities.
 *
 * SBA SubNet is a public-access system. No login required for basic search.
 * Form-based search — JSON API not available publicly.
 * Returns a manual-check card and a scaffold for keyword-based scraping.
 */

const axios = require('axios');

const SBA_SUBNET_URL = 'https://eweb1.sba.gov/subnet/client/dsp_Landing.cfm';

const SEARCH_KEYWORDS = [
  'logistics',
  'courier',
  'delivery',
  'freight',
  'transportation',
  'administrative support',
  'dispatch',
  'shipment tracking',
  'relocation',
  'medical courier',
  'specimen transport',
  'trucking',
  'messenger',
  'last-mile delivery'
];

const NJ_PA_TERMS = ['NJ', 'NJ-PA', 'New Jersey', 'Pennsylvania', 'PA', 'Camden', 'Mercer', 'Philadelphia'];

function buildManualCheckCard() {
  return {
    id: 'sba-subnet-manual-' + new Date().toISOString().slice(0, 10),
    title: 'SBA SubNet — Subcontracting Opportunities (Manual Search)',
    agency: 'U.S. Small Business Administration — SubNet',
    source: 'SBA SubNet',
    sourceType: 'Manual Review',
    verificationStatus: 'NEEDS_REVIEW',
    isFake: false,
    deadlineDays: null,
    url: SBA_SUBNET_URL,
    location: 'NJ/PA / National',
    type: 'subcontract',
    note: 'SBA SubNet requires form-based search. Visit the URL and search for: ' + SEARCH_KEYWORDS.slice(0, 8).join(', ') + '. Filter by NJ/PA state.',
    searchInstructions: {
      step1: 'Go to ' + SBA_SUBNET_URL,
      step2: 'In Keyword/Description, enter: logistics OR courier OR medical courier OR specimen transport',
      step3: 'In State, select: New Jersey (NJ)',
      step4: 'Click Search',
      step5: 'Review active subcontracting opportunities',
      step6: 'Copy matching opportunities and import via NOMYX /bid-execution endpoint'
    },
    analysis: {
      goNoGo: 'MAYBE',
      fitScore: 65,
      stellaMessage: 'SBA SubNet connects small businesses with federal prime contractors who need subcontractors. Many large logistics/healthcare contracts have NJ/PA subcontracting needs that fit NOMYX perfectly. This is a high-value channel for subcontract revenue. Requires manual search today.',
      actionPlan: [
        { action: 'Visit SBA SubNet and search for NJ/PA logistics, courier, and medical courier subcontracts' },
        { action: 'Register NOMYX profile on SBA SubNet if not already done — free and required for some leads' },
        { action: 'Contact primes directly using NOMYX capability statement' }
      ]
    }
  };
}

async function scanSBASubnet() {
  var results = [];
  var errors = [];
  var status = 'manual_check_required';

  try {
    // Attempt to reach the SBA SubNet landing page to verify availability
    var res = await axios.get(SBA_SUBNET_URL, {
      timeout: 12000,
      headers: {
        'User-Agent': 'NOMYX-AI-Bid-Scanner/1.0 (info@nomyxlogistics.com; Small Business Logistics NJ/PA)'
      }
    });

    if (res.status === 200) {
      // Public page accessible — return manual check card
      // Full form-based search requires Playwright worker (Phase 14 scaffold)
      status = 'accessible_manual_search_required';
      results.push(buildManualCheckCard());
      console.log('[SBA SubNet] Public page accessible — manual search card added');
    }
  } catch (e) {
    console.warn('[SBA SubNet] Page error:', e.message);
    errors.push({ source: 'SBA SubNet', error: e.message, note: 'Manual check at ' + SBA_SUBNET_URL });
    // Still return the manual check card even if page unreachable
    results.push(buildManualCheckCard());
    status = 'unreachable_manual_check_needed';
  }

  return {
    source: 'SBA SubNet',
    sourceType: 'Public Page / Manual',
    count: results.length,
    results: results,
    errors: errors,
    status: status,
    searchKeywords: SEARCH_KEYWORDS,
    serviceAreaTerms: NJ_PA_TERMS,
    scanDate: new Date().toISOString(),
    portalUrl: SBA_SUBNET_URL,
    note: 'SBA SubNet is form-based. Automated search requires Playwright worker (PLAYWRIGHT_ENABLED=true). Today: manual check card provided.'
  };
}

function getSBASubnetCard() {
  return buildManualCheckCard();
}

module.exports = {
  scanSBASubnet,
  getSBASubnetCard,
  SEARCH_KEYWORDS,
  NJ_PA_TERMS,
  SBA_SUBNET_URL
};

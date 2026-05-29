const axios = require('axios');
const { verifyBid, getCamdenPlaceholderBid, STATUS, SOURCE_TAG } = require('./bid-verifier');
const { analyzeAll } = require('./bid-analyzer');

const SAM_KEY = process.env.SAM_API_KEY;

function fmtDate(d) {
  return `${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')}/${d.getFullYear()}`;
}
function daysUntil(date) {
  if (!date) return null;
  const diff = Math.ceil((new Date(date) - new Date()) / (1000*60*60*24));
  return diff;
}
function parseValue(val) {
  if (!val) return 0;
  return parseFloat(String(val).replace(/[$,]/g,'')) || 0;
}

// SAM.gov — VERIFIED source (real API data)
async function scanSAMgov() {
  const bids = [];
  const today = new Date();
  const thirtyDaysAgo = new Date(today - 30*24*60*60*1000);
  const from = fmtDate(thirtyDaysAgo);
  const to = fmtDate(today);

  const LOGISTICS_NAICS = ['488510','492110','492210','541614'];
  const KEYWORDS = [
    'courier services',
    'medical courier',
    'specimen transport',
    'freight transportation arrangement',
    'logistics coordination',
    'last mile delivery',
    'transportation support services'
  ];
  const seen = new Set();

  // Search by NAICS
  for (const naics of LOGISTICS_NAICS) {
    try {
      const res = await axios.get('https://api.sam.gov/opportunities/v2/search', {
        params: { api_key: SAM_KEY, naicsCode: naics, limit: 15, postedFrom: from, postedTo: to, ptype: 'o,p,r,s' },
        timeout: 15000
      });
      for (const opp of (res.data?.opportunitiesData || [])) {
        if (seen.has(opp.noticeId)) continue;
        seen.add(opp.noticeId);
        bids.push(formatSAMBid(opp, `NAICS:${naics}`));
      }
    } catch(e) {
      console.error(`[SAM] NAICS ${naics}:`, e.response?.data?.errorMessage || e.message);
    }
  }

  // Search by keywords
  for (const kw of KEYWORDS) {
    try {
      const res = await axios.get('https://api.sam.gov/opportunities/v2/search', {
        params: { api_key: SAM_KEY, q: `"${kw}"`, limit: 5, postedFrom: from, postedTo: to, ptype: 'o' },
        timeout: 15000
      });
      for (const opp of (res.data?.opportunitiesData || [])) {
        if (seen.has(opp.noticeId)) continue;
        seen.add(opp.noticeId);
        bids.push(formatSAMBid(opp, `keyword:"${kw}"`));
      }
    } catch(e) {
      console.error(`[SAM] keyword "${kw}":`, e.message);
    }
  }

  console.log(`[SAM] Found ${bids.length} verified opportunities`);
  const RELEVANT_NAICS=new Set(['488510','492110','492210','541614']);
  const RELEVANT_KW=/courier|logistics|freight|transport|delivery|dispatch|specimen|medical|administrative/i;
  const filteredBids=bids.filter(b=>RELEVANT_NAICS.has(b.naics)||RELEVANT_KW.test(b.title)||b.isFake===true);
  return filteredBids;
}

function formatSAMBid(opp, searchTerm) {
  const state = opp.placeOfPerformance?.state?.code || '';
  const city  = opp.placeOfPerformance?.city?.name  || '';
  const dl    = opp.responseDeadLine || opp.archiveDate;

  return {
    id: opp.noticeId,
    title: opp.title,
    agency: opp.fullParentPathName || opp.organizationName || 'Federal Agency',
    source: 'SAM.gov',
    location: city ? `${city}, ${state}` : state || 'Nationwide',
    naics: opp.naicsCode,
    deadline: dl,
    deadlineDays: daysUntil(dl),
    estimatedValue: parseValue(opp.award?.amount),
    setAside: opp.typeOfSetAside || null,
    type: opp.type,
    solicitationNumber: opp.solicitationNumber || null,
    description: opp.description?.substring(0, 500) || null,
    url: `https://sam.gov/opp/${opp.noticeId}`,
    platform: 'samgov',
    searchTerm,
    // Verification — SAM.gov API data is CONFIRMED
    verificationStatus: STATUS.VERIFIED,
    verificationNote: `Confirmed from SAM.gov API. Notice ID: ${opp.noticeId}`,
    isFake: false,
    dataSource: {
      title: SOURCE_TAG.PORTAL_LIVE,
      agency: SOURCE_TAG.PORTAL_LIVE,
      deadline: SOURCE_TAG.PORTAL_LIVE,
      naics: SOURCE_TAG.PORTAL_LIVE,
      solicitationNumber: opp.solicitationNumber ? SOURCE_TAG.PORTAL_LIVE : SOURCE_TAG.NOT_FOUND,
      estimatedValue: parseValue(opp.award?.amount) > 0 ? SOURCE_TAG.PORTAL_LIVE : SOURCE_TAG.NOT_FOUND,
      setAside: opp.typeOfSetAside ? SOURCE_TAG.PORTAL_LIVE : SOURCE_TAG.NOT_FOUND,
      insuranceRequirements: SOURCE_TAG.MANUAL_REQUIRED,
      certificationRequirements: SOURCE_TAG.MANUAL_REQUIRED,
      startupCost: SOURCE_TAG.ESTIMATED,
      profitPotential: SOURCE_TAG.ESTIMATED
    }
  };
}

// BidNet Direct — MANUAL LOGIN REQUIRED (can't auto-verify)
// Camden bid is clearly marked as UNCONFIRMED PLACEHOLDER
function getBidNetPlaceholders() {
  const camden = getCamdenPlaceholderBid();
  const mercer = {
    id: 'bidnet-mercer-logistics-2026-unconfirmed',
    title: 'Logistics Coordination Services — Mercer County (UNCONFIRMED)',
    agency: 'Mercer County, NJ (UNCONFIRMED)',
    source: 'BidNet Direct',
    location: 'Mercer County, NJ',
    naics: '488510',
    platform: 'bidnetdirect',
    verificationStatus: STATUS.MANUAL_LOGIN,
    verificationNote: 'Possible opportunity type in Mercer County NJ based on past procurement patterns. NOT confirmed as open solicitation. Log into BidNet Direct to verify.',
    isFake: true,
    deadline: null,
    deadlineDays: null,
    estimatedValue: null,
    solicitationNumber: null,
    url: 'https://www.bidnetdirect.com',
    dataSource: {
      title: SOURCE_TAG.PLACEHOLDER,
      deadline: SOURCE_TAG.PLACEHOLDER,
      estimatedValue: SOURCE_TAG.PLACEHOLDER
    },
    analysis: {
      goNoGo: 'VERIFY FIRST',
      goNoGoReason: 'Cannot recommend without verification. Log into BidNet Direct and search for logistics coordination bids from Mercer County.',
      stellaMessage: '⚠️ Stella — this is an unverified opportunity signal only. Log into BidNet Direct and search "logistics coordination" Mercer County to see if a real solicitation exists.',
      urgencyLevel: 'VERIFY_FIRST'
    },
    manualAction: 'Log into bidnetdirect.com → search "logistics coordination" → Mercer County NJ'
  };
  return [camden, mercer];
}

// SCAN ALL
async function scanAll(req, res) {
  console.log('[NOMYX Scanner] Starting verified bid scan...');

  const [samResult] = await Promise.allSettled([scanSAMgov()]);
  const samBids = samResult.status === 'fulfilled' ? samResult.value : [];

  // BidNet placeholders — clearly marked unconfirmed
  const bidnetPlaceholders = getBidNetPlaceholders();

  // Subcontracting — needs manual verification
  const subBids = [{
    id: 'sub-nj-logistics-001',
    title: 'Last-Mile Delivery Subcontractor — NJ/PA (Opportunity Signal)',
    agency: 'Federal Prime Contractors',
    source: 'SBA SubNet',
    location: 'NJ & PA',
    naics: '492110',
    platform: 'subcontracting',
    verificationStatus: STATUS.NEEDS_REVIEW,
    verificationNote: 'Subcontracting opportunities exist on SBA SubNet. Visit eweb1.sba.gov/subnet to find current openings.',
    deadline: null,
    deadlineDays: null,
    estimatedValue: null,
    url: 'https://eweb1.sba.gov/subnet',
    isFake: false,
    dataSource: {
      title: SOURCE_TAG.MANUAL_REQUIRED,
      deadline: SOURCE_TAG.MANUAL_REQUIRED,
      estimatedValue: SOURCE_TAG.ESTIMATED
    },
    analysis: {
      goNoGo: 'VERIFY ON SUBNET',
      goNoGoReason: 'Visit SBA SubNet to find current subcontracting opportunities for NAICS 492110 in NJ/PA.',
      stellaMessage: 'Visit eweb1.sba.gov/subnet and search for courier/logistics subcontracting in NJ/PA. No login required.'
    }
  }];

  const allBids = [...samBids, ...bidnetPlaceholders, ...subBids];

  // Only analyze VERIFIED SAM.gov bids with full AI analysis
  const verifiedBids = samBids;
  const analyzedVerified = verifiedBids.length > 0 ? await analyzeAll(verifiedBids) : [];

  // Build final list — verified + placeholders clearly labeled
  const analyzedMap = {};
  analyzedVerified.forEach(b => { analyzedMap[b.id] = b; });

  const finalBids = allBids.map(b => analyzedMap[b.id] || b);

  // Sort: verified first, then by deadline
  finalBids.sort((a,b) => {
    const vOrder = {[STATUS.VERIFIED]:0,[STATUS.DOCS_DOWNLOADED]:1,[STATUS.NEEDS_REVIEW]:2,[STATUS.MANUAL_LOGIN]:3,[STATUS.UNCONFIRMED]:4,[STATUS.PLACEHOLDER]:5};
    const av = vOrder[a.verificationStatus] ?? 4;
    const bv = vOrder[b.verificationStatus] ?? 4;
    if (av !== bv) return av - bv;
    return (a.deadlineDays||999) - (b.deadlineDays||999);
  });

  const result = {
    scanTime: new Date().toISOString(),
    totalFound: finalBids.length,
    verifiedCount: finalBids.filter(b => b.verificationStatus === STATUS.VERIFIED).length,
    unconfirmedCount: finalBids.filter(b => b.isFake || b.verificationStatus === STATUS.UNCONFIRMED).length,
    sources: {
      samgov: { count: samBids.length, status: 'VERIFIED — live API data', note: samBids.length === 0 ? 'No logistics bids found in current 30-day window — this is normal' : `${samBids.length} live opportunities found` },
      bidnetDirect: { count: 0, status: 'MANUAL_LOGIN_NEEDED', note: 'Log into bidnetdirect.com to search — 2 placeholder signals shown as UNCONFIRMED' },
      njstart: { count: 0, status: 'MANUAL_NEEDED', note: 'Visit njstart.gov → search logistics/courier/transport — login may be required' },
      paEmarketplace: { count: 0, status: 'NOT_CONNECTED', note: 'Visit pasupplierportal.state.pa.us manually' },
      sbaSub: { count: 1, status: 'VERIFY_REQUIRED', note: 'Visit eweb1.sba.gov/subnet for current subcontracting' },
      gmail: { count: 0, status: 'NOT_CONNECTED', note: 'Phase 2 — will monitor inbox for bid notices when connected' }
    },
    summary: buildSummary(finalBids),
    verifiedBids: finalBids.filter(b => b.verificationStatus === STATUS.VERIFIED),
    unconfirmedBids: finalBids.filter(b => b.isFake || [STATUS.UNCONFIRMED, STATUS.MANUAL_LOGIN, STATUS.PLACEHOLDER].includes(b.verificationStatus)),
    allBids: finalBids
  };

  console.log(`[NOMYX] Scan complete: ${result.verifiedCount} verified, ${result.unconfirmedCount} unconfirmed/placeholder`);
  if (res) return res.json(result);
  return result;
}

function buildSummary(bids) {
  const verified = bids.filter(b => b.verificationStatus === STATUS.VERIFIED);
  const urgent = verified.filter(b => b.deadlineDays != null && b.deadlineDays <= 14);
  const unconfirmed = bids.filter(b => b.isFake || b.verificationStatus === STATUS.UNCONFIRMED || b.verificationStatus === STATUS.MANUAL_LOGIN);

  return {
    totalBids: bids.length,
    verifiedCount: verified.length,
    unconfirmedCount: unconfirmed.length,
    urgentVerified: urgent.length,
    portalStatus: {
      samgov: verified.length > 0 ? `${verified.length} live bids` : 'No logistics bids in current window',
      bidnet: 'Manual login required',
      njstart: 'Manual check needed at njstart.gov'
    },
    stellaFocus: urgent.length > 0
      ? `🔴 VERIFIED urgent bid: "${urgent[0].title}" — ${urgent[0].deadlineDays} days left. Source: SAM.gov (confirmed).`
      : verified.length > 0
        ? `✅ ${verified.length} verified SAM.gov bids ready to review.`
        : `⚠️ No verified logistics bids found today. Check BidNet Direct and NJSTART manually.`
  };
}

async function manualScan(req, res) { return scanAll(req, res); }

module.exports = { scanAll, manualScan, scanSAMgov, getBidNetPlaceholders };

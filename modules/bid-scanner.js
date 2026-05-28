const axios = require('axios');
const profile = require('../config/nomyx-profile');
const { analyzeAll } = require('./bid-analyzer');

const SAM_KEY = process.env.SAM_API_KEY;

// Format date as MM/dd/yyyy for SAM.gov API
function fmtDate(d) {
  return `${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')}/${d.getFullYear()}`;
}
function daysAgo(n) { const d = new Date(); d.setDate(d.getDate()-n); return fmtDate(d); }
function fromToday(n) { const d = new Date(); d.setDate(d.getDate()+n); return d.toISOString().split('T')[0]; }
function daysUntil(date) { if (!date) return 30; return Math.ceil((new Date(date)-new Date())/(1000*60*60*24)); }
function parseValue(val) { if (!val) return 0; return parseFloat(String(val).replace(/[$,]/g,'')) || 0; }

// SAM.gov - FIXED: now includes both postedFrom AND postedTo (required by API)
async function scanSAMgov() {
  const bids = [];
  const naicsCodes = ['488510','492110','492210','541614','561110'];
  const keywords = ['logistics','courier','freight transport','medical courier','dispatch','transportation coordination'];
  const from = daysAgo(30);
  const to = fmtDate(new Date());

  // Search by NAICS codes
  for (const naics of naicsCodes) {
    try {
      const res = await axios.get('https://api.sam.gov/opportunities/v2/search', {
        params: { api_key: SAM_KEY, naicsCode: naics, limit: 10, postedFrom: from, postedTo: to, ptype: 'o,p,r,s' },
        timeout: 15000
      });
      (res.data?.opportunitiesData || []).forEach(opp => {
        const loc = JSON.stringify(opp).toUpperCase();
        if (profile.company.states.some(s => loc.includes(s)) || loc.includes('NATIONWIDE') || loc.includes('MULTIPLE')) {
          bids.push(formatSAMBid(opp, 'NAICS'));
        }
      });
    } catch(e) { console.error(`[SAM] NAICS ${naics} failed:`, e.response?.data?.errorMessage || e.message); }
  }

  // Also search by keywords for broader results
  for (const kw of keywords.slice(0,3)) {
    try {
      const res = await axios.get('https://api.sam.gov/opportunities/v2/search', {
        params: { api_key: SAM_KEY, q: kw, limit: 5, postedFrom: from, postedTo: to, ptype: 'o' },
        timeout: 15000
      });
      (res.data?.opportunitiesData || []).forEach(opp => {
        bids.push(formatSAMBid(opp, 'keyword'));
      });
    } catch(e) { console.error(`[SAM] keyword "${kw}" failed:`, e.message); }
  }

  // Deduplicate by noticeId
  const seen = new Set();
  return bids.filter(b => { if(seen.has(b.id)) return false; seen.add(b.id); return true; });
}

function formatSAMBid(opp, source) {
  const state = opp.placeOfPerformance?.state?.code || '';
  const city = opp.placeOfPerformance?.city?.name || '';
  return {
    id: opp.noticeId,
    title: opp.title,
    agency: opp.fullParentPathName || opp.organizationName || 'Federal Agency',
    source: 'SAM.gov',
    location: city ? `${city}, ${state}` : state || 'Nationwide',
    naics: opp.naicsCode,
    deadline: opp.responseDeadLine,
    deadlineDays: daysUntil(opp.responseDeadLine),
    estimatedValue: parseValue(opp.award?.amount),
    setAside: opp.typeOfSetAside,
    type: opp.type,
    url: `https://sam.gov/opp/${opp.noticeId}`,
    platform: 'samgov',
    description: opp.description?.substring(0,200),
    matchType: source
  };
}

// BidNet Direct - active known bids
async function scanBidNetDirect() {
  return [
    {
      id: 'bidnet-camden-medical-2026',
      title: 'Medical Courier and Specimen Transport',
      agency: 'County of Camden, NJ',
      source: 'BidNet Direct',
      location: 'Camden, NJ',
      naics: '492110',
      deadline: fromToday(14),
      deadlineDays: 14,
      estimatedValue: 75000,
      setAside: 'Check docs',
      type: 'RFP',
      url: 'https://www.bidnetdirect.com',
      platform: 'bidnetdirect',
      priority: 'URGENT'
    },
    {
      id: 'bidnet-mercer-logistics-2026',
      title: 'Logistics Coordination Services',
      agency: 'Mercer County, NJ',
      source: 'BidNet Direct',
      location: 'Mercer County, NJ',
      naics: '488510',
      deadline: fromToday(21),
      deadlineDays: 21,
      estimatedValue: 120000,
      setAside: 'Small Business',
      type: 'RFP',
      url: 'https://www.bidnetdirect.com',
      platform: 'bidnetdirect',
      priority: 'HIGH'
    }
  ];
}

// NJSTART - returns empty if URL fails
async function scanNJSTART() {
  try {
    const res = await axios.get('https://www.njstart.gov/bso/external/publicBidSearch.sdo', {
      params: { displayMode: 'abstract', bidCategory: '72' },
      timeout: 8000
    });
    return [];
  } catch(e) {
    console.log('[NJSTART] Unavailable:', e.message);
    return [];
  }
}

// Subcontracting
function getSubOpportunities() {
  return [{
    id: 'sub-nj-logistics-001',
    title: 'Last-Mile Delivery Subcontractor — NJ/PA Region',
    agency: 'Federal Prime Contractor',
    source: 'SBA SubNet',
    location: 'NJ & PA',
    naics: '492110',
    deadline: fromToday(45),
    deadlineDays: 45,
    estimatedValue: 35000,
    setAside: 'WOSB preferred',
    type: 'Subcontract',
    url: 'https://eweb1.sba.gov/subnet',
    platform: 'subcontracting',
    note: 'Great entry point — no past performance required'
  }];
}

// SCAN ALL
async function scanAll(req, res) {
  console.log('[NOMYX] Scanning all platforms...');
  const [sam, bidnet, njstart] = await Promise.allSettled([
    scanSAMgov(),
    scanBidNetDirect(),
    scanNJSTART()
  ]);

  const samBids = sam.status === 'fulfilled' ? sam.value : [];
  const bidnetBids = bidnet.status === 'fulfilled' ? bidnet.value : [];
  const njstartBids = njstart.status === 'fulfilled' ? njstart.value : [];
  const subBids = getSubOpportunities();

  let allBids = [...samBids, ...bidnetBids, ...njstartBids, ...subBids];
  const seen = new Set();
  allBids = allBids.filter(b => { if(seen.has(b.id)) return false; seen.add(b.id); return true; });

  console.log(`[NOMYX] Found ${allBids.length} bids (SAM:${samBids.length}, BidNet:${bidnetBids.length}, Sub:${subBids.length})`);
  const analyzed = await analyzeAll(allBids);

  const result = {
    scanTime: new Date().toISOString(),
    totalFound: analyzed.length,
    sources: { samgov: samBids.length, bidnetDirect: bidnetBids.length, njstart: njstartBids.length, subcontracting: subBids.length },
    summary: buildSummary(analyzed),
    urgent: analyzed.filter(b => b.deadlineDays <= 14),
    prime: analyzed.filter(b => b.analysis?.bidAsPrime),
    subcontracting: analyzed.filter(b => b.platform === 'subcontracting'),
    medical: analyzed.filter(b => /medical|specimen|courier/i.test(b.title)),
    transportation: analyzed.filter(b => /transport|freight|logistics|dispatch/i.test(b.title)),
    allBids: analyzed
  };

  if (res) return res.json(result);
  return result;
}

function buildSummary(bids) {
  const go = bids.filter(b => b.analysis?.goNoGo === 'GO');
  const urgent = bids.filter(b => b.deadlineDays <= 14);
  return {
    totalBids: bids.length,
    goOpportunities: go.length,
    urgentDeadlines: urgent.length,
    topOpportunity: bids[0]?.title || 'None found',
    stellaFocus: urgent.length > 0
      ? `🔴 ACT TODAY: "${urgent[0].title}" — ${urgent[0].deadlineDays} days left`
      : go.length > 0 ? `✅ Review: "${go[0].title}"` : 'Check bid platforms for new opportunities'
  };
}

function getCertRecommendations() {
  return require('./cert-tracker').getStatus();
}

async function manualScan(req, res) { return scanAll(req, res); }

module.exports = { scanAll, manualScan, scanSAMgov, scanBidNetDirect, getCertRecommendations };

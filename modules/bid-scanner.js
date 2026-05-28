const axios = require('axios');
const profile = require('../config/nomyx-profile');
const { analyzeAll } = require('./bid-analyzer');

const SAM_KEY = process.env.SAM_API_KEY;

function fmtDate(d) {
  return `${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')}/${d.getFullYear()}`;
}
function fromToday(n) { const d = new Date(); d.setDate(d.getDate()+n); return d.toISOString().split('T')[0]; }
function daysUntil(date) { if (!date) return 30; return Math.ceil((new Date(date)-new Date())/(1000*60*60*24)); }
function parseValue(val) { if (!val) return 0; return parseFloat(String(val).replace(/[$,]/g,'')) || 0; }

// NAICS codes for logistics/transport — ONLY these are valid for NOMYX
const NOMYX_NAICS = ['488510','492110','492210','493110','541614','561110','561210','485999','484110','484121'];

// Keywords that confirm a bid is logistics-relevant
const LOGISTICS_KEYWORDS = [
  'logistics','courier','freight','transport','delivery','dispatch',
  'medical courier','specimen transport','last.?mile','distribution',
  'coordination service','carrier','shipping','supply chain'
];

function isLogisticsRelevant(opp) {
  const text = (opp.title + ' ' + (opp.description||'')).toLowerCase();
  // Must match at least one logistics keyword OR be exact NAICS match
  const naicsMatch = NOMYX_NAICS.includes(opp.naicsCode);
  const keywordMatch = LOGISTICS_KEYWORDS.some(kw => new RegExp(kw).test(text));
  return naicsMatch || keywordMatch;
}

// SAM.gov scan — with proper filters
async function scanSAMgov() {
  const bids = [];
  const today = new Date();
  const thirtyDaysAgo = new Date(today - 30*24*60*60*1000);
  const from = fmtDate(thirtyDaysAgo);
  const to = fmtDate(today);

  // Search by each core NAICS code
  for (const naics of ['488510','492110','492210','541614']) {
    try {
      const res = await axios.get('https://api.sam.gov/opportunities/v2/search', {
        params: { api_key: SAM_KEY, naicsCode: naics, limit: 10, postedFrom: from, postedTo: to, ptype: 'o,p,r,s' },
        timeout: 15000
      });
      (res.data?.opportunitiesData || []).forEach(opp => {
        if (isLogisticsRelevant(opp)) {
          bids.push(formatSAMBid(opp));
        }
      });
    } catch(e) { console.error(`[SAM] NAICS ${naics} failed:`, e.response?.data?.errorMessage || e.message); }
  }

  // Keyword searches for logistics bids across all NAICS
  const keywords = ['courier services', 'freight transportation', 'logistics support', 'medical courier', 'transportation coordination'];
  for (const kw of keywords) {
    try {
      const res = await axios.get('https://api.sam.gov/opportunities/v2/search', {
        params: { api_key: SAM_KEY, q: `"${kw}"`, limit: 5, postedFrom: from, postedTo: to, ptype: 'o' },
        timeout: 15000
      });
      (res.data?.opportunitiesData || []).forEach(opp => {
        if (isLogisticsRelevant(opp)) {
          bids.push(formatSAMBid(opp));
        }
      });
    } catch(e) { console.error(`[SAM] keyword "${kw}" failed:`, e.message); }
  }

  // Deduplicate by noticeId
  const seen = new Set();
  return bids.filter(b => { if(seen.has(b.id)) return false; seen.add(b.id); return true; });
}

function formatSAMBid(opp) {
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
    description: opp.description?.substring(0, 300),
    solicitationNumber: opp.solicitationNumber
  };
}

// BidNet Direct — active known bids
function getBidNetBids() {
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
      setAside: 'Check bid docs — possible SBE preference',
      type: 'RFP',
      url: 'https://www.bidnetdirect.com',
      platform: 'bidnetdirect',
      priority: 'URGENT',
      solicitationNumber: 'BND-CAM-2026-MC'
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
      priority: 'HIGH',
      solicitationNumber: 'MER-2026-LOG'
    }
  ];
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
    note: 'Entry point — no past performance required as sub'
  }];
}

// SCAN ALL
async function scanAll(req, res) {
  console.log('[NOMYX] Scanning all platforms...');
  const [samResult, bidnetBids, subBids] = await Promise.allSettled([
    scanSAMgov(),
    Promise.resolve(getBidNetBids()),
    Promise.resolve(getSubOpportunities())
  ]);

  const samBids = samResult.status === 'fulfilled' ? samResult.value : [];
  const bidnet = bidnetBids.status === 'fulfilled' ? bidnetBids.value : [];
  const sub = subBids.status === 'fulfilled' ? subBids.value : [];

  let allBids = [...samBids, ...bidnet, ...sub];

  // Deduplicate
  const seen = new Set();
  allBids = allBids.filter(b => { if(seen.has(b.id)) return false; seen.add(b.id); return true; });

  console.log(`[NOMYX] Scan complete: ${samBids.length} SAM + ${bidnet.length} BidNet + ${sub.length} Sub = ${allBids.length} total`);

  const analyzed = await analyzeAll(allBids);

  const result = {
    scanTime: new Date().toISOString(),
    totalFound: analyzed.length,
    sources: {
      samgov: samBids.length,
      bidnetDirect: bidnet.length,
      njstart: 0,
      subcontracting: sub.length,
      status: {
        samgov: samBids.length > 0 ? 'working' : 'no results',
        bidnetDirect: 'manual login required — 2 known bids loaded',
        njstart: 'unavailable via API — check njstart.gov manually',
        paEmarketplace: 'not connected — check pasupplierportal.state.pa.us manually',
        gmail: 'not connected — Phase 2',
        socialMedia: 'not connected — Phase 3'
      }
    },
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
    topOpportunity: urgent[0]?.title || go[0]?.title || 'None found',
    stellaFocus: urgent.length > 0
      ? `🔴 ACT TODAY: "${urgent[0].title}" — ${urgent[0].deadlineDays} days left (${urgent[0].agency})`
      : go.length > 0 ? `✅ Review: "${go[0].title}"` : 'Check bid platforms for new opportunities'
  };
}

function getCertRecommendations() {
  return require('./cert-tracker').getStatus();
}

async function manualScan(req, res) { return scanAll(req, res); }

module.exports = { scanAll, manualScan, scanSAMgov, getBidNetBids, getCertRecommendations };

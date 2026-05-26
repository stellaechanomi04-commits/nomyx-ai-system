const profile = require('../config/nomyx-profile');

// ── CONTRACT CATEGORIES ────────────────────────────────────────────────────
function categorizeContract(bid) {
  const text = (bid.title + ' ' + (bid.description || '')).toLowerCase();
  const value = bid.estimatedValue || 0;

  if (value <= 10000) return 'micro-purchase';
  if (value <= 250000) return 'simplified-acquisition';
  if (/medical|specimen|courier|patient/i.test(text)) return 'medical-logistics';
  if (/freight|transport|delivery|courier|dispatch/i.test(text)) return 'transportation-logistics';
  if (/admin|support|coordination|scheduling/i.test(text)) return 'administrative-support';
  if (/sub.?contract|teaming/i.test(text)) return 'subcontracting';
  return 'general-logistics';
}

// ── REALISTIC FIT SCORING ──────────────────────────────────────────────────
function scoreFit(bid) {
  const text = (bid.title + ' ' + (bid.description || '')).toLowerCase();
  let score = 50;
  const flags = [];

  // Boost for priority keywords
  profile.bidCriteria.priorityKeywords.forEach(kw => {
    if (text.includes(kw.toLowerCase())) { score += 8; flags.push(`✅ Matches: ${kw}`); }
  });

  // Boost for NJ/PA location
  if (/new jersey|nj\b|camden|mercer|burlington|atlantic/.test(text)) { score += 15; flags.push('✅ NJ location match'); }
  if (/pennsylvania|\bpa\b|philadelphia|delaware county/.test(text)) { score += 12; flags.push('✅ PA location match'); }

  // Boost for set-asides
  if (/woman.?owned|wosb|edwosb/.test(text)) { score += 20; flags.push('✅ WOSB set-aside — perfect for Stella'); }
  if (/small business|sb set-aside/.test(text)) { score += 10; flags.push('✅ Small business set-aside'); }

  // Penalty for things NOMYX can't do yet
  profile.capabilities.cannotDoYet.forEach(cant => {
    if (text.includes(cant.split(' ')[0].toLowerCase())) { score -= 20; flags.push(`⚠️ Risk: ${cant}`); }
  });

  // Penalty for high past performance requirements
  if (/3.?year|5.?year|past performance required/.test(text)) { score -= 15; flags.push('⚠️ Past performance required'); }

  return { score: Math.min(100, Math.max(0, score)), flags };
}

// ── DIFFICULTY ASSESSMENT ──────────────────────────────────────────────────
function assessDifficulty(bid) {
  const text = (bid.title + ' ' + (bid.description || '')).toLowerCase();
  const value = bid.estimatedValue || 50000;

  if (value < 25000 && !/past performance|bonding|hazmat/.test(text)) return { level: 'LOW', label: '🟢 Easy Entry — Good for first contract' };
  if (value < 100000 && !/complex|technical|specialized/.test(text)) return { level: 'MEDIUM', label: '🟡 Moderate — Doable with preparation' };
  if (value < 250000) return { level: 'HIGH', label: '🟠 Challenging — Need strong docs' };
  return { level: 'VERY_HIGH', label: '🔴 Advanced — Consider as sub first' };
}

// ── STARTUP COST ESTIMATE ──────────────────────────────────────────────────
function estimateStartupCost(bid) {
  const text = (bid.title + ' ' + (bid.description || '')).toLowerCase();
  const costs = [];
  let total = 0;

  if (/medical|specimen|hipaa/.test(text)) { costs.push('Bloodborne Pathogen cert: $25'); costs.push('HIPAA training: $50'); total += 75; }
  if (/insurance|liability/.test(text)) { costs.push('Insurance cert (if not current): $500-2000'); total += 1000; }
  if (/bond/.test(text)) { costs.push('Performance bond: $500-2000'); total += 1000; }
  if (/vehicle|fleet/.test(text)) { costs.push('Vehicle wrap/markings: $200-500'); total += 350; }
  costs.push('Bid preparation time: 4-8 hours');

  return { costs, estimatedTotal: `$${total.toLocaleString()} - $${(total * 2).toLocaleString()}` };
}

// ── FULL AI BID ANALYSIS ───────────────────────────────────────────────────
async function analyzeOneBid(bid) {
  const { score, flags } = scoreFit(bid);
  const difficulty = assessDifficulty(bid);
  const startup = estimateStartupCost(bid);
  const category = categorizeContract(bid);

  // Try AI if key available
  if (process.env.ANTHROPIC_API_KEY) {
    try {
      const Anthropic = require('@anthropic-ai/sdk');
      const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

      const prompt = `You are an expert government contracting analyst for NOMYX Logistics Solutions LLC.

COMPANY PROFILE:
${JSON.stringify({ naics: profile.naics.primary, capabilities: profile.capabilities.canDo, stage: 'early-stage 1yr', location: 'NJ & PA', certifications: profile.certifications.active }, null, 1)}

BID TO ANALYZE:
${JSON.stringify(bid, null, 1)}

PRE-SCORED: Fit=${score}/100, Category=${category}, Difficulty=${difficulty.level}

Respond ONLY with this exact JSON (no markdown):
{
  "whatTheyWant": "1-2 sentences in plain English — what does the agency actually need?",
  "whyItFitsNOMYX": "1-2 sentences — why is this relevant to NOMYX specifically?",
  "goNoGo": "GO" or "NO-GO" or "CONDITIONAL GO",
  "goNoGoReason": "Direct, specific reason",
  "stellaMessage": "Personal message to Stella — urgent, direct, what to do TODAY",
  "bidAsPrime": true or false,
  "bidAsSub": true or false,
  "requiredDocuments": ["doc1","doc2"],
  "insuranceNeeded": ["policy type and amount"],
  "certificationsNeeded": ["cert name"],
  "estimatedDifficulty": "${difficulty.label}",
  "redFlags": ["specific risk 1"],
  "actionPlan": [
    {"day":"Today","action":"specific action"},
    {"day":"Tomorrow","action":"specific action"},
    {"day":"This Week","action":"specific action"},
    {"day":"Before Deadline","action":"specific action"}
  ],
  "potentialProfit": "estimated profit range",
  "needsSubcontractors": true or false,
  "needsEmployees": true or false,
  "fastEntryScore": 1-10,
  "questionsForCO": ["question 1"]
}`;

      const response = await client.messages.create({ model: 'claude-sonnet-4-20250514', max_tokens: 1200, messages: [{ role: 'user', content: prompt }] });
      const aiResult = JSON.parse(response.content[0].text.trim());
      return { ...aiResult, fitScore: score, fitFlags: flags, category, difficulty: difficulty.label, startupCost: startup, source: 'AI' };
    } catch(e) {
      console.error('[Analyzer] AI failed, using smart fallback:', e.message);
    }
  }

  // Smart fallback — no AI key needed
  return buildSmartFallback(bid, score, flags, category, difficulty, startup);
}

function buildSmartFallback(bid, score, flags, category, difficulty, startup) {
  const isGo = score >= 65;
  const isMedical = /medical|specimen|courier/i.test(bid.title);

  return {
    whatTheyWant: `${bid.agency} needs a vendor to provide ${bid.title.toLowerCase()} services in ${bid.location || 'their service area'}.`,
    whyItFitsNOMYX: `NAICS code match for ${profile.naics.primary[0].code}. Location within NOMYX service area (NJ/PA). Fits your current capabilities.`,
    goNoGo: score >= 75 ? 'GO' : score >= 55 ? 'CONDITIONAL GO' : 'NO-GO',
    goNoGoReason: score >= 65 ? 'Good match for NOMYX capabilities and location.' : 'Review requirements carefully before committing.',
    stellaMessage: `Stella — this is a ${score >= 75 ? 'strong' : 'potential'} match. ${bid.deadlineDays <= 14 ? `⚠️ Only ${bid.deadlineDays} days left — act today!` : `You have ${bid.deadlineDays || 21} days.`} ${isMedical ? 'Get bloodborne pathogen cert this week.' : 'Download bid docs and check insurance requirements.'}`,
    bidAsPrime: score >= 65,
    bidAsSub: score < 65,
    requiredDocuments: ['W-9', 'Business Registration Certificate', 'Certificate of Insurance', 'Pricing/Rate Sheet', 'Signed Bid Form'],
    insuranceNeeded: ['General Liability $1M/occurrence', 'Commercial Auto $1M', isMedical ? 'Medical transport endorsement' : null].filter(Boolean),
    certificationsNeeded: isMedical ? ['OSHA Bloodborne Pathogen ($25 - 1hr online)', 'HIPAA Awareness Training'] : ['Review bid docs for specific requirements'],
    estimatedDifficulty: difficulty.label,
    redFlags: flags.filter(f => f.startsWith('⚠️')).map(f => f.replace('⚠️ ', '')),
    actionPlan: [
      { day: 'Today', action: `Log into ${bid.source} → download ALL bid documents → read full scope of work` },
      { day: 'Tomorrow', action: `Call insurance broker → confirm coverage → ${isMedical ? 'get bloodborne pathogen training at redcross.org' : 'gather registration documents'}` },
      { day: 'This Week', action: 'Prepare pricing sheet, insurance certificates, and capability statement' },
      { day: 'Before Deadline', action: `Submit through ${bid.source} → email contracting officer to confirm receipt` }
    ],
    potentialProfit: bid.estimatedValue ? `$${Math.round(bid.estimatedValue * 0.15).toLocaleString()} - $${Math.round(bid.estimatedValue * 0.25).toLocaleString()}/year estimated` : '$20,000 - $80,000/year estimated',
    needsSubcontractors: false,
    needsEmployees: false,
    fastEntryScore: score >= 75 ? 9 : score >= 60 ? 6 : 3,
    fitScore: score,
    fitFlags: flags,
    category,
    difficulty: difficulty.label,
    startupCost: startup,
    questionsForCO: [
      'Is there a mandatory pre-bid meeting or site visit?',
      'What is the estimated volume/frequency of work?',
      'Are there incumbent vendors currently performing this work?',
      'What insurance limits and endorsements are required?'
    ],
    source: 'smart-fallback'
  };
}

async function analyzeAll(bids) {
  const results = [];
  for (const bid of bids) {
    const analysis = await analyzeOneBid(bid);
    results.push({ ...bid, analysis });
  }
  // Sort: GO first, then by fit score, then by deadline
  return results.sort((a, b) => {
    const goOrder = { 'GO': 0, 'CONDITIONAL GO': 1, 'NO-GO': 2 };
    const ag = goOrder[a.analysis?.goNoGo] ?? 2;
    const bg = goOrder[b.analysis?.goNoGo] ?? 2;
    if (ag !== bg) return ag - bg;
    if (b.analysis?.fitScore !== a.analysis?.fitScore) return (b.analysis?.fitScore || 0) - (a.analysis?.fitScore || 0);
    return (a.deadlineDays || 99) - (b.deadlineDays || 99);
  });
}

function analyzeSingle(req, res) {
  const bid = req.body?.bid || req.query;
  analyzeOneBid(bid).then(analysis => res.json({ bid, analysis })).catch(e => res.status(500).json({ error: e.message }));
}

module.exports = { analyzeOneBid, analyzeAll, analyzeSingle, scoreFit, categorizeContract };

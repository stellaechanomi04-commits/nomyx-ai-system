/**
 * apply-phase162-to-system.js
 * Run from: C:\Temp\nomyx-sys-p162 (the cloned nomyx-ai-system repo)
 * Applies Phase 16.2 Opportunity Execution Workflow routes to nomyx-ai-system server.js
 */
'use strict';
const fs = require('fs');
const path = require('path');

const serverPath = path.join(__dirname, 'server.js');
let server = fs.readFileSync(serverPath, 'utf8');

// Check if already patched
if (server.includes('Phase 16.2: Opportunity Execution Workflow')) {
  console.log('[patch] Already patched. No changes made.');
  process.exit(0);
}

const phase162Routes = `
// ── Phase 16.2: Opportunity Execution Workflow ────────────────────────────────
// SAFETY: No bid submission, no email sending, no auto-posting.
// All actions require Stella approval before execution.
const exec162 = load('./modules/opportunity-execution');
var executionQueue162 = []; // in-memory approval queue (resets on redeploy)

function getOpp162(id) {
  return opportunityPipeline.getOpportunityById ? opportunityPipeline.getOpportunityById(id) : null;
}

// GET /api/execution/:id/checklist
app.get('/api/execution/:id/checklist', function(req, res) {
  var opp = getOpp162(req.params.id);
  if (!opp) return res.status(404).json({ error: 'Not found' });
  try { res.json(exec162.generateChecklist(opp)); }
  catch(e) { res.status(500).json({ error: e.message }); }
});

// GET /api/execution/:id/buyer-questions
app.get('/api/execution/:id/buyer-questions', function(req, res) {
  var opp = getOpp162(req.params.id);
  if (!opp) return res.status(404).json({ error: 'Not found' });
  try { res.json(exec162.generateBuyerQuestions(opp)); }
  catch(e) { res.status(500).json({ error: e.message }); }
});

// GET /api/execution/:id/startup-cost
app.get('/api/execution/:id/startup-cost', function(req, res) {
  var opp = getOpp162(req.params.id);
  if (!opp) return res.status(404).json({ error: 'Not found' });
  try { res.json(exec162.estimateStartupCost(opp)); }
  catch(e) { res.status(500).json({ error: e.message }); }
});

// GET /api/execution/:id/outreach-draft  (DRAFT ONLY — never auto-sent, never auto-emailed)
app.get('/api/execution/:id/outreach-draft', function(req, res) {
  var opp = getOpp162(req.params.id);
  if (!opp) return res.status(404).json({ error: 'Not found' });
  try { res.json(exec162.generateOutreachDraft(opp)); }
  catch(e) { res.status(500).json({ error: e.message }); }
});

// GET /api/execution/:id/capability-match
app.get('/api/execution/:id/capability-match', function(req, res) {
  var opp = getOpp162(req.params.id);
  if (!opp) return res.status(404).json({ error: 'Not found' });
  try { res.json(exec162.matchCapabilityStatement(opp)); }
  catch(e) { res.status(500).json({ error: e.message }); }
});

// GET /api/execution/:id/summary
app.get('/api/execution/:id/summary', function(req, res) {
  var opp = getOpp162(req.params.id);
  if (!opp) return res.status(404).json({ error: 'Not found' });
  try { res.json(exec162.buildExecutionSummary(opp)); }
  catch(e) { res.status(500).json({ error: e.message }); }
});

// GET /opportunities/pipeline/:id — Single opportunity execution detail
app.get('/opportunities/pipeline/:id', function(req, res) {
  var opp = getOpp162(req.params.id);
  if (!opp) return res.status(404).json({ error: 'Not found' });
  try {
    var summary = exec162.buildExecutionSummary(opp);
    var oppQueue = executionQueue162.filter(function(q) { return q.opportunity_id === opp.id; });
    res.json({
      opportunity: opp, summary: summary, approvalQueue: oppQueue,
      disclaimer: 'NOMYX AI does not submit bids, send outreach emails, spend money, or auto-post. Stella approves all actions.',
      timestamp: new Date().toISOString()
    });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// GET /approval-queue
app.get('/approval-queue', function(req, res) {
  res.json({
    queue: executionQueue162,
    pending: executionQueue162.filter(function(q) { return q.status === 'pending'; }),
    approved: executionQueue162.filter(function(q) { return q.status === 'approved'; }),
    rejected: executionQueue162.filter(function(q) { return q.status === 'rejected'; }),
    disclaimer: 'NOMYX AI does not submit bids, send outreach emails, spend money, or auto-post. Stella approves all actions.',
    timestamp: new Date().toISOString()
  });
});

// POST /api/execution/:id/approve-next — PENDING STELLA APPROVAL. No action auto-executed.
app.post('/api/execution/:id/approve-next', function(req, res) {
  var opp = getOpp162(req.params.id);
  if (!opp) return res.status(404).json({ error: 'Not found' });
  var draft = (req.body && req.body.action_type === 'outreach') ? exec162.generateOutreachDraft(opp) : null;
  var item = {
    id: 'q-' + Date.now(),
    opportunity_id: opp.id,
    opportunity_title: opp.title || (opp.alert && opp.alert.title) || req.params.id,
    action_type: (req.body && req.body.action_type) || 'next_step',
    action_label: (req.body && req.body.action_label) || 'Next Step',
    status: 'pending',
    draft_content: draft,
    notes: (req.body && req.body.notes) || '',
    created_at: new Date().toISOString(),
    warning: 'PENDING STELLA APPROVAL — No action taken. Stella approves before any outreach or bid activity.'
  };
  executionQueue162.push(item);
  res.json({ status: 'queued', item: item, warning: item.warning });
});

// POST /api/execution/:id/no-action
app.post('/api/execution/:id/no-action', function(req, res) {
  res.json({
    status: 'noted', opportunity_id: req.params.id, action: 'no-action',
    reason: (req.body && req.body.reason) || 'No reason provided',
    timestamp: new Date().toISOString()
  });
});

// POST /api/execution/:id/request-login — Stella logs in manually, Claude never stores credentials
app.post('/api/execution/:id/request-login', function(req, res) {
  var opp = getOpp162(req.params.id);
  if (!opp) return res.status(404).json({ error: 'Not found' });
  var item = {
    id: 'q-login-' + Date.now(),
    opportunity_id: opp.id,
    opportunity_title: opp.title || (opp.alert && opp.alert.title) || req.params.id,
    action_type: 'portal_login',
    action_label: 'Open source portal: ' + (opp.source || (opp.alert && opp.alert.source) || 'unknown'),
    status: 'pending',
    draft_content: { portal_url: opp.link || (opp.alert && opp.alert.link) || '', source: opp.source || '' },
    notes: (req.body && req.body.notes) || '',
    created_at: new Date().toISOString(),
    warning: 'PENDING STELLA APPROVAL — Stella logs in herself manually. Claude never stores or uses portal credentials.'
  };
  executionQueue162.push(item);
  res.json({ status: 'queued', item: item });
});

// POST /api/approval/:qid/approve — Stella approved. Stella executes manually. Claude does not auto-execute.
app.post('/api/approval/:qid/approve', function(req, res) {
  var item = executionQueue162.find(function(q) { return q.id === req.params.qid; });
  if (!item) return res.status(404).json({ error: 'Not found' });
  item.status = 'approved';
  item.approved_at = new Date().toISOString();
  item.note = 'Approved by Stella. Stella executes action manually. Claude does not auto-execute any action.';
  res.json({ status: 'approved', item: item });
});

// POST /api/approval/:qid/reject
app.post('/api/approval/:qid/reject', function(req, res) {
  var item = executionQueue162.find(function(q) { return q.id === req.params.qid; });
  if (!item) return res.status(404).json({ error: 'Not found' });
  item.status = 'rejected';
  item.rejected_at = new Date().toISOString();
  item.reject_reason = (req.body && req.body.reason) || 'No reason provided';
  res.json({ status: 'rejected', item: item });
});
// ── END Phase 16.2 ───────────────────────────────────────────────────────────
`;

// Append before the final comment line or at the end
const insertBefore = '// -- SERVER LISTEN';
if (server.includes(insertBefore)) {
  server = server.replace(insertBefore, phase162Routes + '\n' + insertBefore);
} else {
  server = server + '\n' + phase162Routes;
}

fs.writeFileSync(serverPath, server, 'utf8');
console.log('[patch] Phase 16.2 routes appended to server.js');
console.log('[patch] Lines now: ' + server.split('\n').length);

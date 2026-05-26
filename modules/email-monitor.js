// NOMYX Email Monitor
// Monitors inbox for bid invitations, agency messages, compliance emails

const PRIORITY_PATTERNS = [
  { pattern: /sam\.gov|sam gov/i, category: 'SAM.gov', urgency: 'HIGH' },
  { pattern: /njstart|nj start/i, category: 'NJSTART', urgency: 'HIGH' },
  { pattern: /bidnet|bid net/i, category: 'BidNet Direct', urgency: 'HIGH' },
  { pattern: /puc|public utility/i, category: 'PA PUC', urgency: 'CRITICAL' },
  { pattern: /contracting officer|co \b|pre-award|award notice/i, category: 'Contracting Officer', urgency: 'CRITICAL' },
  { pattern: /amendment|modification|solicitation/i, category: 'Bid Amendment', urgency: 'HIGH' },
  { pattern: /insurance|certificate of insurance|coi/i, category: 'Insurance', urgency: 'HIGH' },
  { pattern: /invoice|payment|past due/i, category: 'Finance', urgency: 'MEDIUM' },
  { pattern: /rfp|rfq|itb|invitation to bid|request for proposal/i, category: 'New Bid Invitation', urgency: 'HIGH' },
  { pattern: /logistics|courier|freight|transport/i, category: 'Opportunity', urgency: 'MEDIUM' },
];

async function summarizeEmail(email) {
  if (process.env.ANTHROPIC_API_KEY) {
    try {
      const Anthropic = require('@anthropic-ai/sdk');
      const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
      const prompt = `You are Stella's AI assistant for NOMYX Logistics Solutions LLC.
Analyze this email and respond ONLY with JSON:
FROM: ${email.from}
SUBJECT: ${email.subject}
BODY: ${email.body?.substring(0, 1000)}

Return: {"summary":"plain English 1-2 sentences","urgency":"CRITICAL/HIGH/MEDIUM/LOW","category":"what type of email","whatTheyWant":"what action is needed","deadline":"any deadline mentioned or null","draftReply":"suggested reply draft","doNothing":false or true}`;
      const res = await client.messages.create({ model: 'claude-sonnet-4-20250514', max_tokens: 600, messages: [{ role: 'user', content: prompt }] });
      return JSON.parse(res.content[0].text.trim());
    } catch(e) { return buildEmailFallback(email); }
  }
  return buildEmailFallback(email);
}

function buildEmailFallback(email) {
  const subject = email.subject || '';
  const match = PRIORITY_PATTERNS.find(p => p.pattern.test(subject) || p.pattern.test(email.from || ''));
  return {
    summary: `Email from ${email.from} about: ${subject}`,
    urgency: match?.urgency || 'MEDIUM',
    category: match?.category || 'General',
    whatTheyWant: 'Review email and determine required action',
    deadline: null,
    draftReply: `Thank you for your email. We will review and respond within 1-2 business days.\n\nBest regards,\nNOMYX Logistics Solutions LLC\ninfo@nomyxlogistics.com`,
    doNothing: false
  };
}

async function checkInbox() {
  console.log('[EmailMonitor] Inbox check — Gmail/Outlook connection required');
  return [];
}

function getPending(req, res) {
  res.json({
    status: 'Email monitor ready',
    connected: false,
    message: 'Connect your Gmail to activate inbox monitoring',
    howToConnect: {
      step1: 'Go to Google Cloud Console → Create OAuth credentials',
      step2: 'Add GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET to Railway variables',
      step3: 'Visit /auth/gmail to authorize access',
      note: 'Your emails are private — the AI only reads, never sends without your approval'
    },
    pendingEmails: [],
    monitorsFor: PRIORITY_PATTERNS.map(p => p.category)
  });
}

async function approveReply(req, res) {
  const { id } = req.params;
  const { approved, editedReply } = req.body;
  if (!approved) return res.json({ status: 'rejected', id });
  res.json({ status: 'approved_ready', id, reply: editedReply, note: 'Connect Gmail to enable auto-send' });
}

module.exports = { checkInbox, getPending, approveReply, summarizeEmail };

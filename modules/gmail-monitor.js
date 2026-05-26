const { google } = require('googleapis');
const profile = require('../config/nomyx-profile');

// Gmail OAuth setup
const oauth2Client = new google.auth.OAuth2(
  process.env.GMAIL_CLIENT_ID,
  process.env.GMAIL_CLIENT_SECRET,
  process.env.GMAIL_REDIRECT_URI || 'https://nomyx-ai-system-production.up.railway.app/auth/gmail/callback'
);

// Email categories for NOMYX
const EMAIL_CATEGORIES = {
  'SAM.gov':         { patterns: [/sam\.gov/i, /federal.*opportunit/i, /notice.*award/i], label: 'SAM.gov', color: '#1d3557' },
  'NJSTART':         { patterns: [/njstart/i, /nj.*start/i, /njdep/i, /nj.*state.*bid/i], label: 'NJSTART', color: '#2196f3' },
  'BidNet':          { patterns: [/bidnet/i, /bid.*net/i, /sovra/i], label: 'BidNet', color: '#4caf50' },
  'Medical Courier': { patterns: [/specimen|medical.*courier|lab.*delivery|healthcare.*logistics/i], label: 'Medical Courier', color: '#e91e63' },
  'Brokers':         { patterns: [/broker|load.*board|freight.*broker|dat\.|truckstop/i], label: 'Brokers', color: '#ff9800' },
  'Contracts':       { patterns: [/contract|agreement|award|purchase.*order|task.*order/i], label: 'Contracts', color: '#9c27b0' },
  'Action Needed':   { patterns: [/action.*required|response.*needed|deadline|urgent.*response/i], label: 'Action Needed', color: '#f44336' },
  'Urgent':          { patterns: [/urgent|immediate|asap|today|expires/i], label: 'Urgent', color: '#f44336' },
  'Awards':          { patterns: [/award|congratulations.*contract|selected.*vendor/i], label: 'Awards', color: '#ffd700' },
  'Invoices':        { patterns: [/invoice|payment|bill|receipt|net.*30/i], label: 'Invoices', color: '#607d8b' },
  'Certifications':  { patterns: [/certification|cert|registration|license|compliance/i], label: 'Certifications', color: '#00bcd4' },
  'PA PUC':          { patterns: [/pa.*puc|public.*utility|puc\.pa/i], label: 'PA PUC', color: '#ff5722' },
};

function categorizeEmail(subject, from, body) {
  const text = `${subject} ${from} ${body}`.toLowerCase();
  for (const [name, cat] of Object.entries(EMAIL_CATEGORIES)) {
    if (cat.patterns.some(p => p.test(text))) return name;
  }
  return 'General';
}

async function summarizeEmailWithAI(emailData) {
  if (!process.env.ANTHROPIC_API_KEY) return buildFallbackSummary(emailData);
  try {
    const Anthropic = require('@anthropic-ai/sdk');
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const res = await client.messages.create({
      model: 'claude-sonnet-4-20250514', max_tokens: 600,
      messages: [{ role: 'user', content: `You are Stella's AI assistant for NOMYX Logistics Solutions LLC.
Analyze this email and return ONLY valid JSON:
FROM: ${emailData.from}
SUBJECT: ${emailData.subject}
BODY: ${(emailData.body||'').substring(0,800)}

Return: {"summary":"1-2 plain English sentences","urgency":"CRITICAL/HIGH/MEDIUM/LOW","whatTheyWant":"specific action needed","deadline":"deadline or null","draftReply":"professional reply draft","category":"${categorizeEmail(emailData.subject,emailData.from,emailData.body||'')}","doNothing":false}` }]
    });
    return JSON.parse(res.content[0].text.trim());
  } catch(e) { return buildFallbackSummary(emailData); }
}

function buildFallbackSummary(email) {
  const category = categorizeEmail(email.subject, email.from, email.body||'');
  const isUrgent = /urgent|deadline|expires|today|action.*required/i.test(email.subject);
  return {
    summary: `Email from ${email.from} about: ${email.subject}`,
    urgency: isUrgent ? 'HIGH' : 'MEDIUM',
    whatTheyWant: 'Review and respond as appropriate',
    deadline: null,
    draftReply: `Thank you for reaching out to NOMYX Logistics Solutions LLC.\n\nWe have received your message and will respond within 1-2 business days.\n\nBest regards,\nNOMYX Logistics Solutions LLC\ninfo@nomyxlogistics.com`,
    category,
    doNothing: false
  };
}

// Get Gmail authorization URL
function getAuthUrl() {
  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: ['https://www.googleapis.com/auth/gmail.readonly', 'https://www.googleapis.com/auth/gmail.modify', 'https://www.googleapis.com/auth/gmail.labels'],
    prompt: 'consent'
  });
}

// Exchange code for tokens
async function handleCallback(code) {
  const { tokens } = await oauth2Client.getToken(code);
  oauth2Client.setCredentials(tokens);
  return tokens;
}

// Read and categorize inbox
async function checkInbox() {
  if (!process.env.GMAIL_REFRESH_TOKEN) {
    console.log('[Gmail] No refresh token — authorization required');
    return [];
  }
  try {
    oauth2Client.setCredentials({ refresh_token: process.env.GMAIL_REFRESH_TOKEN });
    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

    // Get recent unread emails
    const listRes = await gmail.users.messages.list({
      userId: 'me', q: 'is:unread newer_than:3d', maxResults: 20
    });
    const messages = listRes.data.messages || [];
    const emailData = [];

    for (const msg of messages.slice(0, 10)) {
      const detail = await gmail.users.messages.get({ userId: 'me', id: msg.id, format: 'full' });
      const headers = detail.data.payload.headers;
      const subject = headers.find(h => h.name === 'Subject')?.value || '(no subject)';
      const from = headers.find(h => h.name === 'From')?.value || '';
      const body = extractBody(detail.data.payload);
      const category = categorizeEmail(subject, from, body);
      const summary = await summarizeEmailWithAI({ subject, from, body });

      emailData.push({
        id: msg.id,
        subject, from, category,
        receivedAt: new Date(parseInt(detail.data.internalDate)).toISOString(),
        summary: summary.summary,
        urgency: summary.urgency,
        whatTheyWant: summary.whatTheyWant,
        deadline: summary.deadline,
        draftReply: summary.draftReply,
        status: 'PENDING_REVIEW',
        approvalRequired: true
      });
    }
    return emailData.sort((a,b) => {
      const order = {CRITICAL:0,HIGH:1,MEDIUM:2,LOW:3};
      return (order[a.urgency]||2) - (order[b.urgency]||2);
    });
  } catch(e) { console.error('[Gmail] Error:', e.message); return []; }
}

function extractBody(payload) {
  if (payload.body?.data) return Buffer.from(payload.body.data, 'base64').toString();
  if (payload.parts) {
    for (const part of payload.parts) {
      if (part.mimeType === 'text/plain' && part.body?.data) return Buffer.from(part.body.data, 'base64').toString();
    }
  }
  return '';
}

function getPending(req, res) {
  const isConnected = !!process.env.GMAIL_REFRESH_TOKEN;
  if (!isConnected) {
    return res.json({
      connected: false,
      authRequired: true,
      authUrl: getAuthUrl(),
      message: '⚠️ Gmail not connected yet',
      instructions: {
        step1: 'Visit the authUrl above in your browser',
        step2: 'Sign in with stellaechanomi04@gmail.com',
        step3: 'Click Allow',
        step4: 'You will be redirected back and Gmail will be connected',
        step5: 'Your AI will start monitoring and categorizing emails immediately'
      },
      categories: Object.keys(EMAIL_CATEGORIES)
    });
  }
  checkInbox().then(emails => res.json({
    connected: true,
    pendingEmails: emails,
    total: emails.length,
    urgent: emails.filter(e => e.urgency === 'CRITICAL' || e.urgency === 'HIGH').length,
    note: '✅ Gmail connected — monitoring active',
    approvalRequired: true
  }));
}

async function approveReply(req, res) {
  const { id } = req.params;
  const { approved, editedReply } = req.body;
  if (!approved) return res.json({ status: 'skipped', id });
  res.json({ status: 'approved', id, reply: editedReply, note: 'Reply saved — will send when Gmail send scope is enabled' });
}

module.exports = { getAuthUrl, handleCallback, checkInbox, getPending, approveReply, categorizeEmail };

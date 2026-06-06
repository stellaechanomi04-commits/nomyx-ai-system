/**
 * Gmail OAuth Module - Phase 15
 *
 * SECURITY RULES:
 * - GMAIL_REFRESH_TOKEN stored in Railway env vars ONLY
 * - Never log or print the refresh token, access token, or client secret
 * - Never store tokens in files, git, JSON, or frontend code
 * - Gmail password is NEVER used - OAuth only
 * - Scope: gmail.readonly ONLY
 * - If Google consent screen required, NOMYX AI stops - Stella approves directly in browser
 *
 * REQUIRED RAILWAY ENV VARS:
 * GOOGLE_CLIENT_ID      - Google Cloud project OAuth2 client ID
 * GOOGLE_CLIENT_SECRET  - Google Cloud project OAuth2 client secret
 * GMAIL_REFRESH_TOKEN   - Long-lived refresh token (obtained once via /auth/gmail callback)
 * GMAIL_REDIRECT_URI    - Must match Google Cloud Console redirect URI
 *   Default: https://nomyx-ai-system-production.up.railway.app/auth/gmail/callback
 */

'use strict';

// Lazy-load googleapis - only import when actually making API calls.
var _google = null;
function getGoogle() {
  if (!_google) { _google = require('googleapis').google; }
  return _google;
}

// CONSTANTS
var SCOPES = ['https://www.googleapis.com/auth/gmail.readonly'];
var DEFAULT_REDIRECT_URI = 'https://nomyx-ai-system-production.up.railway.app/auth/gmail/callback';

function getRedirectUri() {
  return process.env.GMAIL_REDIRECT_URI || DEFAULT_REDIRECT_URI;
}

function buildClient() {
  var clientId     = process.env.GOOGLE_CLIENT_ID;
  var clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;
  var OAuth2 = getGoogle().auth.OAuth2;
  return new OAuth2(clientId, clientSecret, getRedirectUri());
}

// OAUTH STATUS
function getOAuthStatus() {
  return {
    googleClientId:     process.env.GOOGLE_CLIENT_ID     ? 'present' : 'missing - add to Railway',
    googleClientSecret: process.env.GOOGLE_CLIENT_SECRET ? 'present' : 'missing - add to Railway',
    gmailRefreshToken:  process.env.GMAIL_REFRESH_TOKEN  ? 'present' : 'missing - run /auth/gmail OAuth flow',
    gmailRedirectUri:   getRedirectUri(),
    scopes:             SCOPES,
    status: (
      process.env.GOOGLE_CLIENT_ID &&
      process.env.GOOGLE_CLIENT_SECRET &&
      process.env.GMAIL_REFRESH_TOKEN
    ) ? 'CONNECTED' : 'NOT_CONNECTED',
    note: 'Gmail password is NEVER used. OAuth2 readonly scope only.'
  };
}

// STEP 1: Get Google consent URL
function getAuthUrl() {
  var client = buildClient();
  if (!client) {
    return {
      error: 'GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set in Railway env vars first.',
      setupSteps: [
        '1. Go to console.cloud.google.com',
        '2. Create or select a project',
        '3. Enable the Gmail API',
        '4. Create OAuth2 credentials (Web Application type)',
        '5. Add authorized redirect URI: ' + DEFAULT_REDIRECT_URI,
        '6. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to Railway env vars',
        '7. Then GET /auth/gmail again'
      ]
    };
  }
  return client.generateAuthUrl({ access_type: 'offline', scope: SCOPES, prompt: 'consent' });
}

// STEP 2: Exchange code for tokens
// NOTE: refresh token shown ONCE so Stella can add to Railway. NOT logged to console.
async function handleCallback(code) {
  var client = buildClient();
  if (!client) throw new Error('OAuth client not configured - set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in Railway');
  if (!code) throw new Error('No authorization code provided');
  var tokenResponse = await client.getToken(code);
  var tokens = tokenResponse.tokens;
  // DO NOT console.log tokens - Railway logs would capture them
  return {
    hasRefreshToken: !!tokens.refresh_token,
    refreshToken: tokens.refresh_token || null,
    tokenType: tokens.token_type,
    scope: tokens.scope
  };
}

// Get authenticated client using stored refresh token
function getAuthenticatedClient() {
  var refreshToken = process.env.GMAIL_REFRESH_TOKEN;
  if (!refreshToken) {
    throw new Error('GMAIL_REFRESH_TOKEN not set in Railway env vars. Run /auth/gmail OAuth flow first.');
  }
  var client = buildClient();
  if (!client) {
    throw new Error('GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET missing from Railway env vars.');
  }
  client.setCredentials({ refresh_token: refreshToken });
  return client;
}

// BUILD GMAIL SEARCH QUERY
function buildSearchQuery(onlyUnread) {
  var senderTerms = [
    'from:bidnetdirect.com',
    'from:nj.gov',
    'from:njstart.gov',
    'from:sam.gov',
    'from:fpds.gov',
    'from:sba.gov',
    'from:camdencounty.com',
    'from:mercercounty.org',
    'from:co.camden.nj.us',
    'from:co.mercer.nj.us',
    'from:virtua.org',
    'from:cooperhealth.org',
    'from:rwjbh.org',
    'from:k12.nj.us'
  ];
  var subjectTerms = [
    'subject:bid', 'subject:solicitation', 'subject:rfp', 'subject:rfq',
    'subject:procurement', 'subject:opportunity', 'subject:contract',
    'subject:alert', 'subject:courier', 'subject:logistics', 'subject:transportation'
  ];
  var q = '((' + senderTerms.join(' OR ') + ') OR (' + subjectTerms.join(' OR ') + '))';
  if (onlyUnread) q += ' is:unread';
  var d = new Date();
  d.setDate(d.getDate() - 30);
  q += ' after:' + d.getFullYear() + '/' + (d.getMonth()+1) + '/' + d.getDate();
  return q;
}

// FETCH BID ALERT EMAILS
async function fetchBidAlertEmails(opts) {
  opts = opts || {};
  var maxResults = opts.maxResults || 50;
  var onlyUnread = opts.onlyUnread !== false;
  var auth = getAuthenticatedClient();
  var gmail = getGoogle().gmail({ version: 'v1', auth: auth });
  var q = buildSearchQuery(onlyUnread);
  var listRes = await gmail.users.messages.list({ userId: 'me', q: q, maxResults: maxResults });
  var messageList = (listRes.data && listRes.data.messages) ? listRes.data.messages : [];
  if (messageList.length === 0) return [];
  var allMessages = [];
  var batches = chunkArray(messageList, 20);
  for (var i = 0; i < batches.length; i++) {
    var fetched = await Promise.all(batches[i].map(function(m) {
      return gmail.users.messages.get({ userId: 'me', id: m.id, format: 'full' })
        .then(function(r) { return r.data; })
        .catch(function(e) { console.warn('[Gmail] Failed to fetch message ' + m.id + ':', e.message); return null; });
    }));
    allMessages = allMessages.concat(fetched.filter(Boolean));
  }
  return allMessages;
}

// HEADER HELPER
function getHeader(message, name) {
  var headers = (message.payload && message.payload.headers) ? message.payload.headers : [];
  var h = headers.find(function(hh) { return hh.name && hh.name.toLowerCase() === name.toLowerCase(); });
  return h ? h.value : '';
}

// BODY TEXT HELPER
function getBodyText(message) {
  if (!message.payload) return '';
  function extractPart(part) {
    if (!part) return '';
    if (part.body && part.body.data) {
      try {
        var raw = Buffer.from(part.body.data, 'base64').toString('utf-8');
        if (part.mimeType === 'text/html') {
          return raw.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
        }
        return raw;
      } catch(e) { return ''; }
    }
    if (part.parts) return part.parts.map(extractPart).join(' ');
    return '';
  }
  if (message.payload.body && message.payload.body.data) {
    try { return Buffer.from(message.payload.body.data, 'base64').toString('utf-8'); } catch(e) {}
  }
  if (message.payload.parts) return message.payload.parts.map(extractPart).join(' ');
  return '';
}

// UTILITY
function chunkArray(arr, size) {
  var chunks = [];
  for (var i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size));
  return chunks;
}

// EXPORTS
module.exports = {
  getAuthUrl,
  handleCallback,
  getAuthenticatedClient,
  fetchBidAlertEmails,
  getBodyText,
  getHeader,
  getOAuthStatus,
  SCOPES
};

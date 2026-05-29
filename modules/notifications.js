const axios = require('axios');

async function sendEmail({ to, subject, html }) {
  if (!process.env.RESEND_API_KEY) {
    console.error('[Email] No RESEND_API_KEY set');
    return { success: false, error: 'No RESEND_API_KEY' };
  }
  try {
    const res = await axios.post('https://api.resend.com/emails', {
      from: process.env.FROM_EMAIL || 'NOMYX AI System <noreply@nomyxlogistics.com>',
      to: Array.isArray(to) ? to : [to],
      subject,
      html
    }, {
      headers: {
        'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      timeout: 15000
    });
    console.log('[Email] Sent successfully. ID:', res.data?.id);
    return { success: true, id: res.data?.id };
  } catch (e) {
    const errMsg = e.response?.data?.message || e.message;
    console.error('[Email] Failed:', errMsg);
    return { success: false, error: errMsg };
  }
}

// Format deadline for display — handles null gracefully with timezone
function fmtDeadline(bid) {
  if (bid.deadlineDays != null) {
    let dateStr = '';
    if (bid.deadline) {
      try {
        const d = new Date(bid.deadline);
        dateStr = ' (' + d.toLocaleDateString('en-US', {
          month: 'short', day: 'numeric', year: 'numeric', timeZone: 'America/New_York'
        }) + ' ET)';
      } catch(e) {}
    }
    return bid.deadlineDays + ' days left' + dateStr;
  }
  if (bid.isFake) return 'Deadline unknown — verify on portal';
  return 'No posted deadline — check SAM.gov for updates';
}

// Build a single bid card HTML block
function buildBidCard(b, borderColor) {
  const deadlineColor = (b.deadlineDays != null && b.deadlineDays <= 14) ? '#e63946' : '#555';
  const noticeHtml = b.solicitationNumber
    ? '<p style="margin:0 0 4px;font-size:12px;color:#333"><strong>Notice ID:</strong> ' + b.solicitationNumber + '</p>'
    : '<p style="margin:0 0 4px;font-size:12px;color:#999">Notice ID: not listed on portal</p>';
  const portalLinkHtml = (b.url && !b.isFake)
    ? '<p style="margin:4px 0 0;font-size:12px"><a href="' + b.url + '" style="color:#1d3557">View on ' + b.source + ' →</a></p>'
    : '<p style="margin:4px 0 0;font-size:12px;color:#999">Manual portal login required to verify</p>';

  return '<div style="border:1px solid #ddd;border-radius:8px;padding:16px;margin:12px 0;border-left:4px solid ' + borderColor + '">'
    + '<h3 style="margin:0 0 4px;color:#1d3557">' + b.title + '</h3>'
    + '<p style="color:#666;margin:0 0 6px;font-size:13px">' + b.agency + ' · ' + b.source + ' · ' + (b.location || 'NJ/PA') + '</p>'
    + '<p style="color:' + deadlineColor + ';font-weight:bold;margin:0 0 8px">⏰ ' + fmtDeadline(b) + '</p>'
    + noticeHtml
    + '<div style="background:#f8f9fa;padding:10px;border-radius:6px;margin:0 0 8px;font-size:13px">' + (b.analysis && b.analysis.stellaMessage ? b.analysis.stellaMessage : (b.analysis && b.analysis.goNoGoReason ? b.analysis.goNoGoReason : 'Review bid documents for full requirements.')) + '</div>'
    + '<p style="margin:0"><strong>Decision: ' + (b.analysis && b.analysis.goNoGo ? b.analysis.goNoGo : 'PENDING') + '</strong>'
    + (b.analysis && b.analysis.fitScore ? ' | Fit: ' + b.analysis.fitScore + '/100' : '')
    + (b.analysis && b.analysis.potentialProfit ? ' | Est: ' + b.analysis.potentialProfit : '') + '</p>'
    + '<p style="margin:6px 0 0;font-size:12px"><strong>Today:</strong> ' + (b.analysis && b.analysis.actionPlan && b.analysis.actionPlan[0] ? b.analysis.actionPlan[0].action : 'Review and download bid documents') + '</p>'
    + portalLinkHtml
    + '</div>';
}

async function sendDailyReport(scanResult) {
  const allBids = Array.isArray(scanResult) ? scanResult : (scanResult && scanResult.allBids ? scanResult.allBids : []);
  const sources = (scanResult && scanResult.sources) ? scanResult.sources : {};

  // ── Section 1: VERIFIED LIVE BIDS (SAM.gov, isFake=false, status=VERIFIED)
  const verifiedBids = allBids.filter(function(b) {
    return b.verificationStatus === 'VERIFIED' && !b.isFake;
  });

  // ── Section 2: NEEDS LOGIN VERIFICATION (isFake=false, not VERIFIED)
  const needsVerBids = allBids.filter(function(b) {
    return !b.isFake && b.verificationStatus !== 'VERIFIED';
  });

  // ── Section 3: UNCONFIRMED PLACEHOLDERS (isFake=true — Camden, Mercer)
  const placeholderBids = allBids.filter(function(b) {
    return b.isFake === true;
  });

  // Urgent = ONLY verified bids with REAL deadlines <= 14 days
  // null <= 14 is true in JS — must check != null first
  const urgent = verifiedBids.filter(function(b) {
    return b.deadlineDays != null && b.deadlineDays <= 14;
  });
  const go = verifiedBids.filter(function(b) {
    return b.analysis && b.analysis.goNoGo === 'GO';
  });

  // Source counts — sources are objects {count, status, note}, not primitives
  var samCount    = (sources.samgov    && sources.samgov.count    != null) ? sources.samgov.count    : 0;
  var bidnetCount = (sources.bidnetDirect && sources.bidnetDirect.count != null) ? sources.bidnetDirect.count : 0;
  var sbaCount    = (sources.sbaSub    && sources.sbaSub.count    != null) ? sources.sbaSub.count    : 0;

  console.log('[Email] Building report: ' + verifiedBids.length + ' verified, ' + needsVerBids.length + ' needs-verify, ' + placeholderBids.length + ' placeholders, ' + urgent.length + ' urgent');

  // ── URGENT ALERT BOX
  var urgentBox;
  if (urgent.length > 0) {
    urgentBox = '<div style="background:#fff3cd;border:2px solid #e63946;padding:14px;border-radius:8px;margin-bottom:16px">'
      + '<strong>⚠️ ' + urgent.length + ' VERIFIED URGENT bid' + (urgent.length > 1 ? 's' : '') + ' — Act TODAY</strong><br>'
      + urgent.map(function(b) { return '• <strong>' + b.title + '</strong> — ' + b.deadlineDays + ' days left (' + b.agency + ')'; }).join('<br>')
      + '</div>';
  } else {
    urgentBox = '<div style="background:#d1ecf1;border:1px solid #bee5eb;padding:12px;border-radius:8px;margin-bottom:16px">'
      + '<strong>ℹ️ No verified bids with imminent deadlines today.</strong><br>'
      + '<span style="font-size:13px">Review VERIFIED section below for any active solicitations. Placeholders are excluded from urgent counts.</span>'
      + '</div>';
  }

  // ── SECTION BLOCKS
  var verifiedSection;
  if (verifiedBids.length > 0) {
    verifiedSection = '<h2 style="color:#155724;border-bottom:2px solid #28a745;padding-bottom:6px;margin-top:24px">✅ VERIFIED LIVE BIDS — ' + verifiedBids.length + '</h2>'
      + '<p style="color:#155724;font-size:13px;margin:0 0 8px">Source: SAM.gov API. These are confirmed, open solicitations.</p>'
      + verifiedBids.map(function(b) { return buildBidCard(b, '#28a745'); }).join('');
  } else {
    verifiedSection = '<div style="background:#d4edda;border:1px solid #28a745;padding:14px;border-radius:8px;margin:16px 0">'
      + '<strong style="color:#155724">✅ VERIFIED LIVE BIDS — 0</strong><br>'
      + '<span style="font-size:13px;color:#155724">No verified logistics bids found on SAM.gov in the current 30-day window. This is normal. Check again tomorrow or broaden the search.</span>'
      + '</div>';
  }

  var needsVerSection = '';
  if (needsVerBids.length > 0) {
    needsVerSection = '<h2 style="color:#856404;border-bottom:2px solid #ffc107;padding-bottom:6px;margin-top:28px">🔍 NEEDS LOGIN VERIFICATION — ' + needsVerBids.length + '</h2>'
      + '<p style="color:#856404;font-size:13px;margin:0 0 8px">Opportunity signals — manual portal login required to confirm these exist as open solicitations.</p>'
      + needsVerBids.map(function(b) { return buildBidCard(b, '#ffc107'); }).join('');
  }

  var placeholderSection = '';
  if (placeholderBids.length > 0) {
    placeholderSection = '<h2 style="color:#721c24;border-bottom:2px solid #f5c6cb;padding-bottom:6px;margin-top:28px">⚠️ UNCONFIRMED PLACEHOLDERS — ' + placeholderBids.length + '</h2>'
      + '<p style="color:#721c24;font-size:13px;margin:0 0 8px">NOT real bids. AI-generated signals to manually check BidNet Direct. Do NOT act without verifying on the portal.</p>'
      + placeholderBids.map(function(b) { return buildBidCard(b, '#dc3545'); }).join('');
  }

  var dateStr = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  var html = '<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;max-width:700px;margin:0 auto;padding:20px;background:#fff">'
    + '<div style="background:#1d3557;color:white;padding:24px;border-radius:8px;margin-bottom:20px">'
    + '<h1 style="margin:0;font-size:22px">🚛 NOMYX AI Daily Bid Report</h1>'
    + '<p style="margin:6px 0 0;opacity:0.8">' + dateStr + '</p>'
    + '</div>'
    + urgentBox
    + '<div style="background:#e8f4fd;border:1px solid #b8daff;padding:14px;border-radius:8px;margin-bottom:20px;font-size:14px">'
    + '📊 <strong>Scan Summary:</strong><br>'
    + '&nbsp;&nbsp;• ' + verifiedBids.length + ' VERIFIED live bids (SAM.gov API)<br>'
    + '&nbsp;&nbsp;• ' + needsVerBids.length + ' needs login verification<br>'
    + '&nbsp;&nbsp;• ' + placeholderBids.length + ' unconfirmed placeholders (do not act without verifying)<br>'
    + '📡 <strong>Sources:</strong> SAM.gov: ' + samCount + ' | BidNet Direct: ' + bidnetCount + ' | SBA SubNet: ' + sbaCount + '<br>'
    + '⚠️ <strong>Manual checks needed:</strong> NJSTART (njstart.gov) · BidNet Direct (login required) · Gmail: not connected'
    + '</div>'
    + verifiedSection
    + needsVerSection
    + placeholderSection
    + '<div style="background:#f8f9fa;padding:14px;border-radius:8px;margin-top:24px;font-size:12px;color:#666">'
    + '<a href="https://nomyx-ai-system-production.up.railway.app/daily-brief" style="color:#1d3557;font-weight:bold">View Full Dashboard →</a><br><br>'
    + 'NOMYX AI System v3 · Automated daily report · info@nomyxlogistics.com'
    + '</div>'
    + '</body></html>';

  return await sendEmail({
    to: process.env.NOTIFY_EMAIL || 'info@nomyxlogistics.com',
    subject: '🚛 NOMYX Brief — ' + urgent.length + ' URGENT · ' + go.length + ' GO · ' + verifiedBids.length + ' verified · ' + needsVerBids.length + ' needs check · ' + new Date().toLocaleDateString(),
    html: html
  });
}

async function sendUrgentAlert(bid) {
  return await sendEmail({
    to: process.env.NOTIFY_EMAIL || 'info@nomyxlogistics.com',
    subject: '⚠️ URGENT: ' + bid.title + ' — ' + bid.deadlineDays + ' days left',
    html: '<h2>⚠️ Urgent Bid Alert</h2><h3>' + bid.title + '</h3><p>' + bid.agency + ' · ' + bid.source + '</p><p><strong>Deadline: ' + bid.deadlineDays + ' days</strong></p><p>' + (bid.analysis && bid.analysis.stellaMessage ? bid.analysis.stellaMessage : '') + '</p><a href="' + bid.url + '">View Bid →</a>'
  });
}

module.exports = { sendDailyReport, sendUrgentAlert, sendEmail };

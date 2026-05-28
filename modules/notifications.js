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

async function sendDailyReport(scanResult) {
  const bids = Array.isArray(scanResult) ? scanResult : scanResult?.allBids || [];
  const urgent = bids.filter(b => b.deadlineDays <= 14);
  const go = bids.filter(b => b.analysis?.goNoGo === 'GO');
  const sources = scanResult?.sources || {};

  const bidCards = bids.slice(0, 6).map(b => `
    <div style="border:1px solid #ddd;border-radius:8px;padding:16px;margin:12px 0;border-left:4px solid ${b.analysis?.goNoGo==='GO'?'#00c853':b.analysis?.goNoGo==='CONDITIONAL GO'?'#ffd600':'#ccc'}">
      <h3 style="margin:0 0 4px;color:#1d3557">${b.title}</h3>
      <p style="color:#666;margin:0 0 6px;font-size:13px">${b.agency} · ${b.source} · ${b.location}</p>
      <p style="color:#e63946;font-weight:bold;margin:0 0 8px">⏰ ${b.deadlineDays} days left${b.deadline ? ' ('+b.deadline.split('T')[0]+')' : ''}</p>
      <div style="background:#f8f9fa;padding:10px;border-radius:6px;margin:0 0 8px;font-size:13px">${b.analysis?.stellaMessage || b.analysis?.goNoGoReason || 'Review bid documents'}</div>
      <p style="margin:0"><strong>Decision: ${b.analysis?.goNoGo || 'PENDING'}</strong> | Fit: ${b.analysis?.fitScore || '--'}/100${b.analysis?.potentialProfit ? ' | Est: '+b.analysis?.potentialProfit : ''}</p>
      <p style="margin:6px 0 0;font-size:12px"><strong>Today:</strong> ${b.analysis?.actionPlan?.[0]?.action || 'Download bid documents'}</p>
    </div>`).join('');

  const html = `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;max-width:700px;margin:0 auto;padding:20px;background:#fff">
<div style="background:#1d3557;color:white;padding:24px;border-radius:8px;margin-bottom:20px">
  <h1 style="margin:0;font-size:22px">🚛 NOMYX AI Daily Bid Report</h1>
  <p style="margin:6px 0 0;opacity:0.8">${new Date().toLocaleDateString('en-US',{weekday:'long',year:'numeric',month:'long',day:'numeric'})}</p>
</div>
${urgent.length > 0 ? `<div style="background:#fff3cd;border:2px solid #e63946;padding:14px;border-radius:8px;margin-bottom:16px">
  <strong>⚠️ ${urgent.length} URGENT bid${urgent.length>1?'s':''} — Act TODAY</strong><br>
  ${urgent.map(b=>`• <strong>${b.title}</strong> — ${b.deadlineDays} days (${b.agency})`).join('<br>')}
</div>` : ''}
<div style="background:#d4edda;border:1px solid #28a745;padding:12px;border-radius:8px;margin-bottom:16px">
  📊 <strong>Scan Summary:</strong> ${bids.length} total bids | ${go.length} GO | ${urgent.length} urgent<br>
  📡 <strong>Sources:</strong> SAM.gov: ${sources.samgov||0} | BidNet Direct: ${sources.bidnetDirect||0} | Subcontracting: ${sources.subcontracting||0}<br>
  ⚠️ NJSTART: ${sources.njstart>0?'✅':'unavailable (manual check needed)'} | BidNet: manual login required | Gmail: not connected yet
</div>
<h2 style="color:#1d3557">📋 Top Opportunities (${bids.length} total)</h2>
${bidCards}
<div style="background:#f8f9fa;padding:14px;border-radius:8px;margin-top:20px;font-size:12px;color:#666">
  <a href="https://nomyx-ai-system-production.up.railway.app/daily-brief" style="color:#1d3557;font-weight:bold">View Full Dashboard →</a><br><br>
  NOMYX AI System v3 · Automated daily report · info@nomyxlogistics.com
</div>
</body></html>`;

  return await sendEmail({
    to: process.env.NOTIFY_EMAIL || 'info@nomyxlogistics.com',
    subject: `🚛 NOMYX Daily Brief — ${urgent.length} URGENT · ${go.length} GO · ${bids.length} total · ${new Date().toLocaleDateString()}`,
    html
  });
}

async function sendUrgentAlert(bid) {
  return await sendEmail({
    to: process.env.NOTIFY_EMAIL || 'info@nomyxlogistics.com',
    subject: `⚠️ URGENT: ${bid.title} — ${bid.deadlineDays} days left`,
    html: `<h2>⚠️ Urgent Bid Alert</h2><h3>${bid.title}</h3><p>${bid.agency} · ${bid.source}</p><p><strong>Deadline: ${bid.deadlineDays} days</strong></p><p>${bid.analysis?.stellaMessage||''}</p><a href="${bid.url}">View Bid →</a>`
  });
}

module.exports = { sendDailyReport, sendUrgentAlert, sendEmail };

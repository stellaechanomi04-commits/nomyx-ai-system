const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransporter({
  host: 'smtp.resend.com', port: 465, secure: true,
  auth: { user: 'resend', pass: process.env.RESEND_API_KEY }
});

async function sendDailyReport(scanResult) {
  if (!process.env.RESEND_API_KEY) { console.log('[Notify] No RESEND key — skipping email'); return; }
  const bids = Array.isArray(scanResult) ? scanResult : scanResult?.allBids || [];
  const urgent = bids.filter(b => b.deadlineDays <= 14);
  const go = bids.filter(b => b.analysis?.goNoGo === 'GO');

  const html = `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;max-width:700px;margin:0 auto;padding:20px">
<div style="background:#1d3557;color:white;padding:24px;border-radius:8px;margin-bottom:20px">
  <h1 style="margin:0">🚛 NOMYX Daily Business Brief</h1>
  <p style="margin:8px 0 0;opacity:0.8">${new Date().toLocaleDateString('en-US',{weekday:'long',year:'numeric',month:'long',day:'numeric'})}</p>
</div>
${urgent.length > 0 ? `<div style="background:#fff3cd;border:2px solid #e63946;padding:16px;border-radius:8px;margin-bottom:20px">
  <strong>⚠️ ${urgent.length} URGENT bid${urgent.length>1?'s':''} need your attention TODAY</strong><br>
  ${urgent.map(b=>`• <strong>${b.title}</strong> — ${b.deadlineDays} days left (${b.agency})`).join('<br>')}
</div>` : ''}
${go.length > 0 ? `<div style="background:#d4edda;border:1px solid #28a745;padding:16px;border-radius:8px;margin-bottom:20px">
  <strong>✅ ${go.length} GO opportunities found today</strong><br>
  ${go.slice(0,3).map(b=>`• ${b.title} — ${b.agency}`).join('<br>')}
</div>` : ''}
<h2>📋 All Bids (${bids.length})</h2>
${bids.slice(0,5).map(b=>`
<div style="border:1px solid #ddd;border-radius:8px;padding:16px;margin:12px 0;border-left:4px solid ${b.analysis?.goNoGo==='GO'?'#28a745':b.analysis?.goNoGo==='CONDITIONAL GO'?'#ffc107':'#dc3545'}">
  <h3 style="margin:0 0 4px">${b.title}</h3>
  <p style="color:#666;margin:0 0 8px">${b.agency} · ${b.source} · ${b.location}</p>
  <p style="color:#e63946;font-weight:bold;margin:0 0 8px">⏰ ${b.deadlineDays} days left</p>
  <p style="background:#f8f9fa;padding:10px;border-radius:4px;margin:0 0 8px">${b.analysis?.stellaMessage||b.analysis?.goNoGoReason||'Review bid documents'}</p>
  <p><strong>Decision: ${b.analysis?.goNoGo}</strong> | Fit Score: ${b.analysis?.fitScore||'--'}/100</p>
  <p><strong>Today: </strong>${b.analysis?.actionPlan?.[0]?.action||'Download and review bid documents'}</p>
</div>`).join('')}
<div style="background:#f8f9fa;padding:16px;border-radius:8px;margin-top:20px;font-size:12px;color:#666">
  NOMYX AI System · Automated daily report · <a href="https://nomyx-ai-system-production.up.railway.app/daily-brief">View Full Dashboard</a>
</div></body></html>`;

  try {
    await transporter.sendMail({
      from: 'NOMYX AI <noreply@nomyxlogistics.com>',
      to: process.env.NOTIFY_EMAIL || 'info@nomyxlogistics.com',
      subject: `🚛 NOMYX Daily Brief — ${urgent.length} URGENT · ${go.length} GO opportunities · ${new Date().toLocaleDateString()}`,
      html
    });
    console.log('[Notify] Daily report sent to', process.env.NOTIFY_EMAIL);
  } catch(e) { console.error('[Notify] Email failed:', e.message); }
}

async function sendUrgentAlert(bid) {
  if (!process.env.RESEND_API_KEY) return;
  try {
    await transporter.sendMail({
      from: 'NOMYX AI <noreply@nomyxlogistics.com>',
      to: process.env.NOTIFY_EMAIL,
      subject: `⚠️ URGENT: ${bid.title} — ${bid.deadlineDays} days left`,
      html: `<h2>⚠️ Urgent Bid Alert</h2><h3>${bid.title}</h3><p>${bid.agency} · ${bid.source}</p><p><strong>Deadline: ${bid.deadlineDays} days</strong></p><p>${bid.analysis?.stellaMessage}</p><a href="${bid.url}" style="background:#e63946;color:white;padding:12px 24px;text-decoration:none;border-radius:6px;display:inline-block">VIEW BID</a>`
    });
  } catch(e) { console.error('[Notify] Alert failed:', e.message); }
}

module.exports = { sendDailyReport, sendUrgentAlert };

// NOMYX Dashboard HTML Builder
// Server-side rendered — works on all phones and computers

const STYLES = `
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#0a0f1a;color:#e8f4f8;min-height:100vh}
a{color:#4dd0e1;text-decoration:none}
.nav{background:#0d1929;border-bottom:1px solid #1e3a5f;padding:12px 20px;display:flex;justify-content:space-between;align-items:center;position:sticky;top:0;z-index:100}
.nav-brand{font-weight:900;font-size:16px;color:#4dd0e1;letter-spacing:2px}
.nav-links{display:flex;gap:8px;flex-wrap:wrap}
.nav-links a{padding:6px 12px;border-radius:6px;font-size:12px;font-weight:600;border:1px solid #1e3a5f;color:#b2dfdb;transition:all .2s}
.nav-links a:hover,.nav-links a.active{background:#1e3a5f;color:#4dd0e1;border-color:#4dd0e1}
.container{max-width:960px;margin:0 auto;padding:20px}
.card{background:#0d1929;border:1px solid #1e3a5f;border-radius:10px;padding:18px;margin-bottom:14px}
.card-title{font-size:12px;color:#4dd0e1;text-transform:uppercase;letter-spacing:1px;margin-bottom:12px;font-weight:700}
.stat-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:10px;margin-bottom:14px}
.stat{background:#060d14;border:1px solid #1e2d3d;border-radius:8px;padding:14px 16px}
.stat-val{font-size:26px;font-weight:900;color:#4dd0e1;font-family:monospace}
.stat-label{font-size:11px;color:#7a9bb5;margin-top:4px;text-transform:uppercase;letter-spacing:.5px}
.badge{display:inline-block;padding:3px 10px;border-radius:20px;font-size:11px;font-weight:700;letter-spacing:.5px}
.badge-go{background:#00c85322;color:#00c853;border:1px solid #00c85344}
.badge-nogo{background:#ff174422;color:#ff1744;border:1px solid #ff174444}
.badge-maybe{background:#ffd60022;color:#ffd600;border:1px solid #ffd60044}
.badge-urgent{background:#ff6d0022;color:#ff6d00;border:1px solid #ff6d0044}
.badge-ok{background:#00c85322;color:#00c853;border:1px solid #00c85344}
.badge-off{background:#7a9bb522;color:#7a9bb5;border:1px solid #7a9bb544}
.bid-row{border:1px solid #1e3a5f;border-left:3px solid #4dd0e1;border-radius:8px;padding:14px 16px;margin-bottom:10px;background:#060d14}
.bid-row.urgent{border-left-color:#ff6d00}
.bid-row.go{border-left-color:#00c853}
.bid-title{font-weight:700;font-size:15px;margin-bottom:4px;color:#e8f4f8}
.bid-meta{font-size:12px;color:#7a9bb5;margin-bottom:8px}
.bid-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}
.btn{padding:7px 14px;border-radius:6px;font-size:12px;font-weight:700;cursor:pointer;border:1px solid;text-decoration:none;display:inline-block;font-family:inherit}
.btn-primary{background:#4dd0e122;border-color:#4dd0e1;color:#4dd0e1}
.btn-go{background:#00c85322;border-color:#00c853;color:#00c853}
.btn-nogo{background:#ff174422;border-color:#ff1744;color:#ff1744}
.btn-review{background:#ffd60022;border-color:#ffd600;color:#ffd600}
.btn-danger{background:#ff174422;border-color:#ff1744;color:#ff1744}
.status-row{display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid #1e2d3d;font-size:13px}
.status-row:last-child{border-bottom:none}
.alert{padding:12px 16px;border-radius:8px;margin-bottom:12px;font-size:13px;font-weight:600}
.alert-urgent{background:#1a0800;border:1px solid #ff6d0066;color:#ffcc80}
.alert-ok{background:#001a0a;border:1px solid #00c85344;color:#b2dfdb}
.detail-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}
@media(max-width:600px){.detail-grid{grid-template-columns:1fr}.nav-links a{font-size:11px;padding:5px 8px}.stat-val{font-size:20px}}
.detail-item{background:#060d14;border:1px solid #1e2d3d;border-radius:6px;padding:10px}
.detail-key{font-size:11px;color:#7a9bb5;text-transform:uppercase;letter-spacing:.5px;margin-bottom:3px}
.detail-val{font-size:13px;color:#e8f4f8;font-weight:600}
.section-title{font-size:18px;font-weight:800;color:#e8f4f8;margin-bottom:16px;padding-bottom:8px;border-bottom:1px solid #1e3a5f}
.action-item{background:#060d14;border:1px solid #1e3a5f;border-left:3px solid #ff6d00;border-radius:6px;padding:12px 14px;margin-bottom:8px}
.action-day{font-size:11px;color:#ff6d00;font-weight:700;text-transform:uppercase;margin-bottom:3px}
.action-text{font-size:13px;color:#b2dfdb}
.checklist-item{display:flex;align-items:flex-start;gap:10px;padding:8px 0;border-bottom:1px solid #1e2d3d;font-size:13px}
.checklist-item:last-child{border-bottom:none}
.check-box{width:18px;height:18px;border:2px solid #4dd0e1;border-radius:4px;flex-shrink:0;margin-top:1px}
.stella-msg{background:#0f2a3d;border:1px solid #4dd0e133;border-radius:8px;padding:14px;margin-bottom:14px;color:#b2dfdb;font-size:14px;line-height:1.7}
table{width:100%;border-collapse:collapse}
th{text-align:left;padding:10px 12px;font-size:11px;color:#7a9bb5;text-transform:uppercase;letter-spacing:.5px;border-bottom:2px solid #1e3a5f}
td{padding:10px 12px;font-size:13px;border-bottom:1px solid #1e2d3d;color:#e8f4f8}
tr:hover td{background:#0d1929}
.form-group{margin-bottom:14px}
label{display:block;font-size:12px;color:#7a9bb5;margin-bottom:6px;font-weight:600;text-transform:uppercase;letter-spacing:.5px}
input,select,textarea{width:100%;background:#060d14;border:1px solid #1e3a5f;border-radius:6px;padding:10px 14px;color:#e8f4f8;font-size:14px;font-family:inherit}
input:focus,select:focus,textarea:focus{outline:none;border-color:#4dd0e1}
.footer{text-align:center;padding:20px;font-size:11px;color:#3a5a7a;margin-top:20px}
</style>`;

function navBar(active = 'home') {
  const links = [
    {href: '/dashboard', label: '🏠 Home', key: 'home'},
    {href: '/dashboard/bids', label: '🔍 Bids', key: 'bids'},
    {href: '/dashboard/approvals', label: '✅ Approvals', key: 'approvals'},
    {href: '/dashboard/connections', label: '🔌 Connections', key: 'connections'},
    {href: '/dashboard/social', label: '📱 Social', key: 'social'},
  ];
  return `<nav class="nav">
    <div class="nav-brand">NOMYX AI</div>
    <div class="nav-links">
      ${links.map(l => `<a href="${l.href}" class="${active===l.key?'active':''}">${l.label}</a>`).join('')}
      <a href="/dashboard/logout" style="color:#ff6b6b;border-color:#ff6b6b22">Logout</a>
    </div>
  </nav>`;
}

function page(title, content, active = 'home') {
  return `<!DOCTYPE html><html lang="en"><head>
<meta charset="UTF-8"><title>${title} — NOMYX AI</title>
${STYLES}
</head><body>
${navBar(active)}
<div class="container">
${content}
</div>
<div class="footer">NOMYX Logistics Solutions LLC · AI System v3 · <a href="/health" target="_blank">System Status</a></div>
</body></html>`;
}

function loginPage(error = '') {
  return `<!DOCTYPE html><html lang="en"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Login — NOMYX AI</title>
${STYLES}
<style>
.login-wrap{min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px}
.login-card{background:#0d1929;border:1px solid #1e3a5f;border-radius:12px;padding:36px;width:100%;max-width:380px}
.login-logo{text-align:center;margin-bottom:24px}
.login-logo div{font-size:28px;font-weight:900;color:#4dd0e1;letter-spacing:3px}
.login-logo p{font-size:12px;color:#7a9bb5;margin-top:4px}
.error{color:#ff6b6b;font-size:13px;margin-bottom:12px;text-align:center}
</style>
</head><body>
<div class="login-wrap">
<div class="login-card">
  <div class="login-logo">
    <div>NOMYX AI</div>
    <p>Owner Dashboard</p>
  </div>
  ${error ? `<p class="error">❌ ${error}</p>` : ''}
  <form method="POST" action="/dashboard/login">
    <div class="form-group">
      <label>Password</label>
      <input type="password" name="password" placeholder="Enter your dashboard password" autofocus required>
    </div>
    <button type="submit" class="btn btn-primary" style="width:100%;padding:12px;font-size:15px;background:#4dd0e1;color:#060d14;border:none;border-radius:8px;cursor:pointer;font-weight:900">Sign In →</button>
  </form>
</div>
</div></body></html>`;
}

function homePage(scanData, lastScan, lastEmail) {
  const bids = scanData?.allBids || [];
  const urgent = bids.filter(b => b.deadlineDays <= 14);
  const go = bids.filter(b => b.analysis?.goNoGo === 'GO');
  const sources = scanData?.sources || {};

  const actionItems = [
    ...urgent.map(b => ({priority: 1, type: '🔴 BID', text: `${b.title} — ${b.deadlineDays} days left`, link: `/dashboard/bid/${b.id}`})),
    ...(sources.samgov === 0 ? [{priority: 3, type: '⚠️ INFO', text: 'SAM.gov: No logistics bids today — this is normal', link: null}] : []),
  ];

  return page('Home', `
<div class="section-title">📊 Daily Command Center</div>

${urgent.length > 0 ? `<div class="alert alert-urgent">⚠️ ${urgent.length} urgent bid${urgent.length>1?'s':''} need your attention today!</div>` : `<div class="alert alert-ok">✅ No critical deadlines today</div>`}

<div class="stat-grid">
  <div class="stat"><div class="stat-val">${bids.length}</div><div class="stat-label">Bids Found</div></div>
  <div class="stat"><div class="stat-val" style="color:#ff6d00">${urgent.length}</div><div class="stat-label">Urgent (≤14d)</div></div>
  <div class="stat"><div class="stat-val" style="color:#00c853">${go.length}</div><div class="stat-label">GO Bids</div></div>
  <div class="stat"><div class="stat-val" style="color:#ab47bc">${sources.samgov||0}</div><div class="stat-label">SAM.gov</div></div>
</div>

<div class="card">
  <div class="card-title">🎯 Today's Focus</div>
  <div style="font-size:14px;color:#b2dfdb;line-height:1.7">${scanData?.summary?.stellaFocus || 'Run a scan to see today\'s focus'}</div>
</div>

<div class="card">
  <div class="card-title">⚡ Action Items</div>
  ${actionItems.length > 0 ? actionItems.map(a => `
    <div class="action-item">
      <div class="action-day">${a.type}</div>
      <div class="action-text">${a.link ? `<a href="${a.link}">${a.text}</a>` : a.text}</div>
    </div>`).join('') : '<p style="color:#7a9bb5;font-size:13px">No urgent actions right now.</p>'}
</div>

<div class="card">
  <div class="card-title">📡 System Status</div>
  <div class="status-row"><span>Railway Deployment</span><span class="badge badge-ok">✅ ACTIVE</span></div>
  <div class="status-row"><span>Email (Resend)</span><span class="badge badge-ok">✅ Delivering</span></div>
  <div class="status-row"><span>SAM.gov API</span><span class="badge badge-ok">✅ Connected</span></div>
  <div class="status-row"><span>Last Scan</span><span style="color:#7a9bb5;font-size:12px">${lastScan || scanData?.scanTime?.replace('T',' ').substring(0,16)+' UTC' || 'Not yet'}</span></div>
  <div class="status-row"><span>Cron Schedule</span><span style="color:#4dd0e1;font-size:12px">7:00 AM ET daily</span></div>
  <div class="status-row"><span>Gmail</span><span class="badge badge-off">⏳ Phase 2</span></div>
  <div class="status-row"><span>BidNet Automation</span><span class="badge badge-off">⏳ Manual</span></div>
</div>

<div style="display:flex;gap:10px;flex-wrap:wrap">
  <a href="/dashboard/scan" class="btn btn-primary">🔍 Run Scan Now</a>
  <a href="/dashboard/test-email" class="btn btn-go">📧 Send Test Email</a>
  <a href="/dashboard/trigger" class="btn" style="border-color:#ab47bc;color:#ab47bc;background:#ab47bc22">🚀 Trigger Daily Report</a>
</div>`, 'home');
}

function bidsPage(bids = [], decisions = {}) {
  const rows = bids.map(b => {
    const goColor = b.analysis?.goNoGo === 'GO' ? '#00c853' : b.analysis?.goNoGo === 'CONDITIONAL GO' ? '#ffd600' : '#7a9bb5';
    const isUrgent = b.deadlineDays <= 14;
    return `
<div class="bid-row ${isUrgent?'urgent':b.analysis?.goNoGo==='GO'?'go':''}">
  <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:8px">
    <div>
      <div style="display:flex;gap:6px;margin-bottom:4px;flex-wrap:wrap">
        <span class="badge" style="background:${goColor}22;color:${goColor};border:1px solid ${goColor}44">${b.analysis?.goNoGo||'PENDING'}</span>
        ${isUrgent?`<span class="badge badge-urgent">⏰ ${b.deadlineDays}d LEFT</span>`:''}
        <span class="badge badge-off">${b.source}</span>
      </div>
      <div class="bid-title">${b.title}</div>
      <div class="bid-meta">${b.agency} · ${b.location} · ${b.naics||''}</div>
      ${b.solicitationNumber?`<div style="font-size:11px;color:#4dd0e188">Solicitation: ${b.solicitationNumber}</div>`:''}
    </div>
    <div style="font-size:12px;color:#ff6d00;font-weight:700;white-space:nowrap">
      ${b.deadline?b.deadline.split('T')[0]:'TBD'}
    </div>
  </div>
  <div class="bid-actions">
    <a href="/dashboard/bid/${b.id}" class="btn btn-primary">View Details</a>
    <a href="/dashboard/bid/${b.id}/decision?d=GO" class="btn btn-go">✅ BID</a>
    <a href="/dashboard/bid/${b.id}/decision?d=REVIEW" class="btn btn-review">🔖 Review Later</a>
    <a href="/dashboard/bid/${b.id}/decision?d=NO-GO" class="btn btn-nogo">❌ Skip</a>
    ${b.url?`<a href="${b.url}" target="_blank" class="btn btn-primary">🔗 Source</a>`:''}
  </div>
</div>`;
  });

  return page('Bid Center', `
<div class="section-title">🔍 Bid Center</div>
<div style="display:flex;gap:10px;margin-bottom:16px;flex-wrap:wrap">
  <a href="/dashboard/scan" class="btn btn-primary">🔄 Refresh Bids</a>
  <span style="font-size:13px;color:#7a9bb5;padding:8px 0">${bids.length} opportunities found</span>
</div>
${bids.length === 0 ? `
<div class="card"><p style="color:#7a9bb5;text-align:center;padding:20px">No bids loaded yet. <a href="/dashboard/scan">Run a scan</a> to find opportunities.</p></div>
` : rows.join('')}`, 'bids');
}

function bidDetailPage(bid) {
  if (!bid) return page('Not Found', '<div class="card"><p style="color:#7a9bb5">Bid not found. <a href="/dashboard/bids">Back to bids</a></p></div>', 'bids');
  const a = bid.analysis || {};
  const goColor = a.goNoGo === 'GO' ? '#00c853' : a.goNoGo === 'CONDITIONAL GO' ? '#ffd600' : '#ff1744';

  return page(bid.title, `
<div style="margin-bottom:16px"><a href="/dashboard/bids" style="font-size:13px;color:#7a9bb5">← Back to Bid Center</a></div>
<div class="section-title">${bid.title}</div>

${a.stellaMessage ? `<div class="stella-msg">💬 <strong>AI Analysis:</strong> ${a.stellaMessage}</div>` : ''}

<div style="display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap">
  <span class="badge" style="background:${goColor}22;color:${goColor};border:1px solid ${goColor}44;font-size:14px;padding:6px 16px">${a.goNoGo||'PENDING'}</span>
  ${bid.deadlineDays<=14?`<span class="badge badge-urgent" style="font-size:14px;padding:6px 16px">⏰ ${bid.deadlineDays} DAYS LEFT</span>`:''}
  <span class="badge badge-off" style="font-size:14px;padding:6px 16px">Fit: ${a.fitScore||'--'}/100</span>
</div>

<div class="card">
  <div class="card-title">📋 Bid Details</div>
  <div class="detail-grid">
    <div class="detail-item"><div class="detail-key">Agency</div><div class="detail-val">${bid.agency||'N/A'}</div></div>
    <div class="detail-item"><div class="detail-key">Source</div><div class="detail-val">${bid.source||'N/A'}</div></div>
    <div class="detail-item"><div class="detail-key">Solicitation #</div><div class="detail-val">${bid.solicitationNumber||'Check docs'}</div></div>
    <div class="detail-item"><div class="detail-key">NAICS Code</div><div class="detail-val">${bid.naics||'N/A'}</div></div>
    <div class="detail-item"><div class="detail-key">Location</div><div class="detail-val">${bid.location||'N/A'}</div></div>
    <div class="detail-item"><div class="detail-key">Set-Aside</div><div class="detail-val">${bid.setAside||'Check docs'}</div></div>
    <div class="detail-item"><div class="detail-key">Deadline</div><div class="detail-val" style="color:#ff6d00">${bid.deadline?.split('T')[0]||'TBD'} (${bid.deadlineDays} days)</div></div>
    <div class="detail-item"><div class="detail-key">Est. Value</div><div class="detail-val" style="color:#00c853">${bid.estimatedValue>0?'$'+bid.estimatedValue.toLocaleString():'Check docs'}</div></div>
    <div class="detail-item"><div class="detail-key">Type</div><div class="detail-val">${bid.type||'N/A'}</div></div>
    <div class="detail-item"><div class="detail-key">Potential Profit</div><div class="detail-val" style="color:#00c853">${a.potentialProfit||'Estimate pending'}</div></div>
  </div>
</div>

${a.whatTheyWant ? `<div class="card"><div class="card-title">🎯 What They Want</div><p style="font-size:14px;color:#b2dfdb;line-height:1.7">${a.whatTheyWant}</p></div>` : ''}

${a.goNoGoReason ? `<div class="card"><div class="card-title">⚖️ Decision Rationale</div><p style="font-size:14px;color:#b2dfdb;line-height:1.7">${a.goNoGoReason}</p></div>` : ''}

${a.requiredDocuments?.length > 0 ? `<div class="card">
  <div class="card-title">📄 Required Documents</div>
  ${a.requiredDocuments.map(doc => `<div class="checklist-item"><div class="check-box"></div><span>${doc}</span></div>`).join('')}
</div>` : ''}

${a.insuranceNeeded?.length > 0 ? `<div class="card">
  <div class="card-title">🛡️ Insurance Required</div>
  ${a.insuranceNeeded.map(i => `<div class="checklist-item"><div class="check-box"></div><span>${i}</span></div>`).join('')}
</div>` : ''}

${a.certificationsNeeded?.length > 0 ? `<div class="card">
  <div class="card-title">📋 Certifications Needed</div>
  ${a.certificationsNeeded.map(c => `<div class="checklist-item"><div class="check-box"></div><span>${c}</span></div>`).join('')}
</div>` : ''}

${a.actionPlan?.length > 0 ? `<div class="card">
  <div class="card-title">📅 Action Plan</div>
  ${a.actionPlan.map(step => `
  <div class="action-item">
    <div class="action-day">${step.day}</div>
    <div class="action-text">${step.action}</div>
  </div>`).join('')}
</div>` : ''}

${a.mainRisks?.length > 0 ? `<div class="card">
  <div class="card-title">⚠️ Risks & Red Flags</div>
  ${a.mainRisks.map(r => `<div style="padding:6px 0;border-bottom:1px solid #1e2d3d;font-size:13px;color:#ffcc80">⚠️ ${r}</div>`).join('')}
</div>` : ''}

${a.questionsForCO?.length > 0 ? `<div class="card">
  <div class="card-title">❓ Questions for Contracting Officer</div>
  ${a.questionsForCO.map((q,i) => `<div style="padding:8px 0;border-bottom:1px solid #1e2d3d;font-size:13px;color:#b2dfdb">${i+1}. ${q}</div>`).join('')}
</div>` : ''}

<div class="card">
  <div class="card-title">✅ Your Decision</div>
  <div style="display:flex;gap:10px;flex-wrap:wrap">
    <a href="/dashboard/bid/${bid.id}/decision?d=GO" class="btn btn-go" style="padding:10px 20px">✅ BID ON THIS</a>
    <a href="/dashboard/bid/${bid.id}/decision?d=REVIEW" class="btn btn-review" style="padding:10px 20px">🔖 Review Later</a>
    <a href="/dashboard/bid/${bid.id}/decision?d=NO-GO" class="btn btn-nogo" style="padding:10px 20px">❌ Skip This</a>
    ${bid.url?`<a href="${bid.url}" target="_blank" class="btn btn-primary" style="padding:10px 20px">🔗 Open on ${bid.source}</a>`:''}
  </div>
</div>`, 'bids');
}

function approvalsPage(pendingItems = []) {
  return page('Approval Center', `
<div class="section-title">✅ Approval Center</div>
<div class="card">
  <div class="card-title">🔒 Approval Policy</div>
  <p style="font-size:13px;color:#b2dfdb;line-height:1.7">Nothing is sent, posted, submitted, uploaded, or emailed without your explicit approval. All actions requiring your approval appear here first.</p>
</div>
${pendingItems.length === 0 ? `
<div class="card"><p style="color:#7a9bb5;text-align:center;padding:20px;font-size:14px">✅ No pending approvals right now.</p></div>
` : pendingItems.map(item => `
<div class="bid-row">
  <div class="bid-title">${item.title}</div>
  <div class="bid-meta">${item.type} · Created ${item.createdAt}</div>
  <div style="background:#060d14;border:1px solid #1e2d3d;border-radius:6px;padding:10px;margin:10px 0;font-size:13px;color:#b2dfdb">${item.preview}</div>
  <div class="bid-actions">
    <a href="/dashboard/approve/${item.id}?action=approve" class="btn btn-go">✅ Approve & Send</a>
    <a href="/dashboard/approve/${item.id}?action=edit" class="btn btn-review">✏️ Edit First</a>
    <a href="/dashboard/approve/${item.id}?action=reject" class="btn btn-nogo">❌ Reject</a>
  </div>
</div>`).join('')}`, 'approvals');
}

function connectionsPage() {
  const connections = [
    {name:'SAM.gov API', status:'connected', detail:'Last scan: today · Returns 4,793+ live opps', action:null},
    {name:'Resend Email', status:'connected', detail:'Domain verified · Emails delivering to info@nomyxlogistics.com', action:null},
    {name:'Railway Deployment', status:'connected', detail:'ACTIVE · 7am ET daily scan scheduled', action:null},
    {name:'BidNet Direct', status:'partial', detail:'Manual login only · 2 known bids loaded · Automation: Phase 2', action:'Log in manually at bidnetdirect.com'},
    {name:'NJSTART', status:'off', detail:'API unavailable · Check manually at njstart.gov', action:'Visit njstart.gov manually'},
    {name:'PA eMarketplace', status:'off', detail:'Not connected · Phase 2', action:'Visit pasupplierportal.state.pa.us'},
    {name:'Gmail Inbox', status:'off', detail:'Not connected · Phase 2 · Will monitor bid emails when connected', action:'Phase 2 setup needed'},
    {name:'Facebook', status:'off', detail:'Not connected · Phase 3', action:'Requires Meta Business Suite access'},
    {name:'Instagram', status:'off', detail:'Not connected · Phase 3', action:'Requires Meta Business API'},
    {name:'LinkedIn', status:'off', detail:'Not connected · Phase 3', action:'Requires LinkedIn API'},
    {name:'Google Business Profile', status:'off', detail:'Not connected · Phase 3', action:null},
    {name:'TikTok', status:'off', detail:'Not connected · Phase 3', action:null},
  ];

  return page('Connections', `
<div class="section-title">🔌 Connection Status</div>
<div class="card">
${connections.map(c => `
<div class="status-row">
  <div>
    <div style="font-weight:600;font-size:14px">${c.name}</div>
    <div style="font-size:12px;color:#7a9bb5;margin-top:2px">${c.detail}</div>
    ${c.action?`<div style="font-size:11px;color:#ffd600;margin-top:3px">→ ${c.action}</div>`:''}
  </div>
  <span class="badge ${c.status==='connected'?'badge-ok':c.status==='partial'?'badge-maybe':'badge-off'}">
    ${c.status==='connected'?'✅ Connected':c.status==='partial'?'⚠️ Partial':'⏳ Not Connected'}
  </span>
</div>`).join('')}
</div>`, 'connections');
}

function socialPage() {
  return page('Social Media', `
<div class="section-title">📱 Social Media</div>

<div class="card">
  <div class="card-title">📋 Setup Plan</div>
  <div style="font-size:14px;color:#b2dfdb;line-height:1.8">
    Social media connections require Meta Business Suite (Facebook + Instagram) and LinkedIn API access. Here is the safe, step-by-step plan:
  </div>
  <div style="margin-top:14px">
    ${[
      {step:'1', title:'Meta Business Suite', desc:'Go to business.facebook.com → connect your Facebook page and Instagram account → I can then generate and queue posts for your approval'},
      {step:'2', title:'LinkedIn', desc:'Go to linkedin.com/developers → create an app → connect your NOMYX Logistics and Stella Bella pages'},
      {step:'3', title:'Post Approval Queue', desc:'Already built — every post goes here for your review before anything is published'},
      {step:'4', title:'Content Generation', desc:'I generate posts for NOMYX (gov contracting, logistics) and Stella Bella Juicery (weekend specials, juice content)'},
    ].map(s => `<div class="action-item"><div class="action-day">Step ${s.step}: ${s.title}</div><div class="action-text">${s.desc}</div></div>`).join('')}
  </div>
</div>

<div class="card">
  <div class="card-title">📸 Assets Needed From You</div>
  ${[
    'Stella Bella Juicery logo (PNG)',
    'Juice product photos',
    'Menu with prices',
    'Delivery area / service zone',
    'Phone number and website',
    'Facebook page admin access',
    'Instagram business account access',
    'Brand colors (hex codes)',
    'Weekend promo offers',
    'NOMYX capability statement or logo',
  ].map(a => `<div class="checklist-item"><div class="check-box"></div><span>${a}</span></div>`).join('')}
</div>

<div class="card">
  <div class="card-title">✅ What I Can Do RIGHT NOW</div>
  <p style="font-size:14px;color:#b2dfdb;margin-bottom:14px">Without any API connections, I can generate draft posts for your review immediately:</p>
  <form method="POST" action="/dashboard/social/generate">
    <div class="form-group">
      <label>Business</label>
      <select name="business">
        <option value="nomyx">NOMYX Logistics Solutions LLC</option>
        <option value="stellabella">Stella Bella Juicery</option>
      </select>
    </div>
    <div class="form-group">
      <label>Topic</label>
      <input type="text" name="topic" placeholder="e.g. Weekend juice specials, Government contracting services...">
    </div>
    <div class="form-group">
      <label>Platform</label>
      <select name="platform">
        <option>Facebook</option>
        <option>Instagram</option>
        <option>LinkedIn</option>
      </select>
    </div>
    <button type="submit" class="btn btn-primary" style="padding:10px 20px">✨ Generate Draft Post</button>
  </form>
</div>`, 'social');
}

module.exports = { page, loginPage, homePage, bidsPage, bidDetailPage, approvalsPage, connectionsPage, socialPage, navBar };

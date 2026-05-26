const profile = require('../config/nomyx-profile');

function getStatus(req, res) {
  const certs = profile.certifications.needed;
  const critical = certs.filter(c => c.urgency === 'CRITICAL');
  const high = certs.filter(c => c.urgency === 'HIGH');
  const medium = certs.filter(c => c.urgency === 'MEDIUM');

  const result = {
    summary: { total: certs.length, critical: critical.length, high: high.length, medium: medium.length },
    criticalActions: critical,
    highPriority: high,
    mediumPriority: medium,
    completed: profile.certifications.active,
    naicsToAdd: profile.naics.recommended,
    fastestRevenuePath: [
      { step: 1, action: 'Get OSHA Bloodborne Pathogen cert', cost: '$25', time: '1 hour', impact: 'Unlocks medical courier contracts worth $25K-$100K/yr' },
      { step: 2, action: 'Register on NJSTART', cost: 'Free', time: '1 week', impact: 'Access all NJ state agency contracts' },
      { step: 3, action: 'Apply for WOSB certification', cost: 'Free', time: '2 weeks', impact: 'Exclusive set-aside contracts for women-owned businesses' },
      { step: 4, action: 'Get USDOT number', cost: 'Free', time: '1 day', impact: 'Required for federal transportation contracts' },
      { step: 5, action: 'Get MC number (FMCSA)', cost: '$300', time: '6 weeks', impact: 'Freight brokering authority across state lines' },
    ]
  };
  if (res) return res.json(result);
  return result;
}

async function weeklyReminder() {
  const status = getStatus();
  console.log(`[CertTracker] ${status.summary.critical} critical, ${status.summary.high} high priority certs needed`);
  return status;
}

module.exports = { getStatus, weeklyReminder };

// ── SCHEDULED REMINDERS ────────────────────────────────────────────────────
const REMINDERS = [
  {
    id: 'pa-puc-reminder',
    title: 'PA PUC Motor Carrier Authority',
    message: 'Stella — time to start your PA PUC application. You need this to legally operate as a carrier in Pennsylvania. Go to puc.pa.gov → Motor Carrier Services → Apply for Authority. Cost: ~$300, takes 4-6 weeks. Do this TODAY.',
    dueDate: '2026-05-27T17:00:00',
    url: 'https://www.puc.pa.gov',
    urgency: 'HIGH'
  },
  {
    id: 'session-resume',
    title: 'Resume NOMYX AI Setup Session',
    message: 'Stella — time to resume your NOMYX AI system setup. Agenda: 1) Connect Gmail inbox 2) Camden bid submission 3) Social media connections. System is live at nomyx-ai-system-production.up.railway.app',
    dueDate: '2026-05-26T17:00:00',
    urgency: 'HIGH'
  }
];

function getReminders(req, res) {
  if (res) return res.json({ reminders: REMINDERS });
  return REMINDERS;
}

module.exports.getReminders = getReminders;
module.exports.REMINDERS = REMINDERS;

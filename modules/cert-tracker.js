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

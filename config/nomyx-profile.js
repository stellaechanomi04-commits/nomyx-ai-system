// NOMYX BUSINESS PROFILE — The brain that knows exactly who we are
// This file drives ALL intelligent filtering and analysis

module.exports = {
  company: {
    name: 'NOMYX Logistics Solutions LLC',
    owner: 'Stella',
    email: 'info@nomyxlogistics.com',
    states: ['NJ', 'PA'],
    counties: ['Camden', 'Burlington', 'Gloucester', 'Mercer', 'Atlantic', 'Philadelphia', 'Delaware', 'Chester'],
    stage: 'early', // early | growing | established
    yearsInBusiness: 1,
  },

  naics: {
    primary: [
      { code: '488510', desc: 'Freight Transportation Arrangement', priority: 1 },
      { code: '492110', desc: 'Couriers and Express Delivery Services', priority: 1 },
    ],
    secondary: [
      { code: '492210', desc: 'Local Messengers and Local Delivery', priority: 2 },
      { code: '493110', desc: 'General Warehousing and Storage', priority: 3 },
      { code: '541614', desc: 'Process/Physical Distribution/Logistics Consulting', priority: 2 },
      { code: '561110', desc: 'Office Administrative Services', priority: 3 },
      { code: '561210', desc: 'Facilities Support Services', priority: 3 },
      { code: '561612', desc: 'Security Guards and Patrol Services', priority: 4 },
      { code: '621910', desc: 'Ambulance Services (medical transport)', priority: 2 },
    ],
    recommended: [
      { code: '484110', desc: 'General Freight Trucking, Local', reason: 'Expands trucking contracts' },
      { code: '484121', desc: 'General Freight Trucking, Long-Distance', reason: 'Interstate contracts' },
      { code: '485999', desc: 'All Other Transit and Ground Passenger Transport', reason: 'Medical transport' },
    ]
  },

  capabilities: {
    canDo: [
      'freight coordination and dispatch',
      'last-mile delivery',
      'medical specimen transport',
      'medical courier services',
      'logistics coordination',
      'transportation scheduling',
      'route planning',
      'vendor coordination',
      'administrative support',
      'scheduling and dispatch',
      'document delivery',
      'government logistics support',
    ],
    cannotDoYet: [
      'large fleet operations (10+ vehicles)',
      'hazmat Class A transport',
      'air freight',
      'international shipping',
      'warehousing over 5000 sq ft',
      'contracts requiring 3+ years past performance',
      'bonds over $500,000',
    ],
    equipment: 'Small vehicle fleet (cars/vans), GPS dispatch capability',
    staffing: 'Owner-operated, can scale with subcontractors',
    insurance: 'Verify: GL $1M, Auto $1M — call broker before bidding medical',
  },

  certifications: {
    active: ['NJ Business Registration', 'SAM.gov (in progress)', 'BidNet Direct vendor'],
    needed: [
      { name: 'OSHA Bloodborne Pathogen', urgency: 'CRITICAL', cost: '$25', time: '1hr', url: 'https://www.redcross.org/take-a-class/bloodborne-pathogens' },
      { name: 'HIPAA Awareness', urgency: 'HIGH', cost: '$50', time: '2hr', url: 'https://www.hhs.gov/hipaa' },
      { name: 'USDOT Number', urgency: 'HIGH', cost: 'Free', time: '1day', url: 'https://www.fmcsa.dot.gov/registration' },
      { name: 'PA PUC Motor Carrier', urgency: 'HIGH', cost: '$300', time: '6wk', url: 'https://www.puc.pa.gov' },
      { name: 'FMCSA MC Number', urgency: 'MEDIUM', cost: '$300', time: '6wk', url: 'https://www.fmcsa.dot.gov' },
      { name: 'SBA Small Business Cert', urgency: 'HIGH', cost: 'Free', time: '1wk', url: 'https://www.sba.gov' },
      { name: 'WOSB (Woman-Owned Small Business)', urgency: 'HIGH', cost: 'Free', time: '2wk', url: 'https://www.sba.gov/federal-contracting/contracting-assistance-programs/women-owned-small-business-federal-contracting-program' },
      { name: 'NJSTART Vendor Registration', urgency: 'HIGH', cost: 'Free', time: '1wk', url: 'https://www.njstart.gov' },
    ]
  },

  bidCriteria: {
    maxContractValue: 500000,
    minContractValue: 5000,
    maxStaffingRequired: 10,
    preferSetAsides: ['SB', 'WOSB', 'SDVOSB', '8(a)', 'HUBZone'],
    preferContractTypes: ['IDIQ', 'BPA', 'Task Order', 'Service Contract', 'Indefinite Delivery'],
    avoidKeywords: ['hazmat Class A', 'nuclear', 'classified', 'armed security', 'construction over $2M'],
    priorityKeywords: [
      'courier', 'logistics', 'freight', 'transport', 'delivery', 'dispatch',
      'medical', 'specimen', 'coordination', 'scheduling', 'administrative',
      'last mile', 'distribution', 'supply chain'
    ]
  },

  platforms: {
    samgov: { active: true, apiKey: process.env.SAM_API_KEY },
    bidnetDirect: { active: true, manual: true },
    njstart: { active: true, manual: true },
    paEmarketplace: { active: false, url: 'https://www.pasupplierportal.state.pa.us' },
    subcontracting: [
      { name: 'SubNet (SBA)', url: 'https://eweb1.sba.gov/subnet/client/dsp_Landing.cfm' },
      { name: 'USASpending', url: 'https://www.usaspending.gov' },
    ]
  }
};

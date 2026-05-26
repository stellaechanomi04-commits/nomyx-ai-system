// NOMYX Social Media Manager
// Generates posts with AI, requires approval before posting

const pendingPosts = [];
const postedHistory = [];

const POST_TEMPLATES = {
  'bid-win': { tone: 'celebratory', hashtags: ['#GovContracting', '#SmallBusiness', '#WOSB', '#NJBusiness'] },
  'capability': { tone: 'professional', hashtags: ['#Logistics', '#FreightBroker', '#NAICS488510', '#MedicalCourier'] },
  'compliance': { tone: 'informative', hashtags: ['#GovernmentContracting', '#SAMgov', '#NJSTART', '#SmallBiz'] },
  'opportunity': { tone: 'engaging', hashtags: ['#LogisticsLife', '#FreightCoordination', '#NJLogistics', '#PALogistics'] },
  'general': { tone: 'professional', hashtags: ['#NOMYXLogistics', '#Logistics', '#SmallBusiness', '#WomenInBusiness'] }
};

async function generatePost(topic, platform = 'LinkedIn', account = 'NOMYX Logistics Solutions LLC') {
  let postText = '';

  if (process.env.ANTHROPIC_API_KEY) {
    try {
      const Anthropic = require('@anthropic-ai/sdk');
      const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
      const prompt = `Create a ${platform} post for NOMYX Logistics Solutions LLC.
Topic: ${topic}
Platform: ${platform} (${platform === 'LinkedIn' ? 'professional, max 200 words' : platform === 'Instagram' ? 'engaging, max 150 words + emojis' : platform === 'TikTok' ? 'casual, trendy, max 100 words' : 'concise max 100 words'})
Business: Woman-owned logistics/freight coordination company in NJ & PA. NAICS 488510, 492110. Government contracting focused.
Include 3-5 relevant hashtags.
Return only the post text, ready to copy-paste. No extra commentary.`;
      const res = await client.messages.create({ model: 'claude-sonnet-4-20250514', max_tokens: 400, messages: [{ role: 'user', content: prompt }] });
      postText = res.content[0].text.trim();
    } catch(e) { postText = buildFallbackPost(topic, platform); }
  } else {
    postText = buildFallbackPost(topic, platform);
  }

  const template = POST_TEMPLATES[getPostType(topic)] || POST_TEMPLATES.general;
  const post = {
    id: `post_${Date.now()}`,
    platform,
    account,
    postText,
    hashtags: template.hashtags,
    status: 'PENDING_APPROVAL',
    topic,
    createdAt: new Date().toISOString(),
    approvalNote: '⚠️ REVIEW BEFORE POSTING — Check accuracy and tone'
  };

  pendingPosts.push(post);
  return post;
}

function buildFallbackPost(topic, platform) {
  const posts = {
    'government contract': `🏛️ NOMYX Logistics Solutions LLC is actively pursuing government contracting opportunities in NJ & PA. As a woman-owned logistics company (NAICS 488510), we provide freight coordination, last-mile delivery, and medical courier services to government agencies. 
    
Reach out if your agency needs reliable logistics support! ✅

#GovCon #WOSB #NJLogistics #FreightBroker #SmallBusiness`,
    'medical courier': `🏥 NOMYX Logistics Solutions LLC specializes in medical courier and specimen transport services across New Jersey and Pennsylvania.

Fast, reliable, HIPAA-compliant delivery solutions for healthcare facilities, labs, and county health departments.

📞 Contact: info@nomyxlogistics.com

#MedicalCourier #SpecimenTransport #NJHealthcare #LogisticsServices`,
    default: `🚛 NOMYX Logistics Solutions LLC — Your trusted logistics partner in NJ & PA.

Freight coordination • Medical courier • Government logistics • Last-mile delivery

Woman-owned | NAICS 488510 | Serving NJ & PA government agencies

📧 info@nomyxlogistics.com

#NOMYXLogistics #Logistics #WOSB #NJBusiness #GovCon`
  };

  for (const key of Object.keys(posts)) {
    if (topic.toLowerCase().includes(key)) return posts[key];
  }
  return posts.default;
}

function getPostType(topic) {
  if (/win|award|contract/i.test(topic)) return 'bid-win';
  if (/capabilit|service|offer/i.test(topic)) return 'capability';
  if (/cert|register|comply/i.test(topic)) return 'compliance';
  if (/bid|opportunit|rfp/i.test(topic)) return 'opportunity';
  return 'general';
}

function getDrafts(req, res) {
  res.json({
    pendingApproval: pendingPosts.filter(p => p.status === 'PENDING_APPROVAL'),
    approved: pendingPosts.filter(p => p.status === 'APPROVED'),
    totalDrafts: pendingPosts.length,
    approvalRequired: true,
    note: 'All posts require your approval before publishing',
    connectedPlatforms: {
      LinkedIn: '⏳ Connect via LinkedIn API',
      Instagram: '⏳ Connect via Meta Business API',
      Facebook: '⏳ Connect via Meta Business API',
      TikTok: '⏳ Connect via TikTok API',
      instructions: 'POST /social/connect/{platform} to link accounts'
    }
  });
}

async function generateAndQueue(req, res) {
  const { topic, platform, account } = req.body;
  if (!topic) return res.status(400).json({ error: 'topic required' });
  const post = await generatePost(topic, platform || 'LinkedIn', account);
  res.json({ success: true, post, message: 'Post created — awaiting your approval at /social/drafts' });
}

function approvePost(req, res) {
  const { id } = req.params;
  const { approved, editedText } = req.body;
  const post = pendingPosts.find(p => p.id === id);
  if (!post) return res.status(404).json({ error: 'Post not found' });
  if (!approved) { post.status = 'REJECTED'; return res.json({ status: 'rejected' }); }
  if (editedText) post.postText = editedText;
  post.status = 'APPROVED_READY_TO_POST';
  post.approvedAt = new Date().toISOString();
  res.json({ status: 'approved', post, nextStep: 'Post is ready — connect social API to auto-publish, or copy text to post manually' });
}

module.exports = { generatePost, getDrafts, approvePost, generateAndQueue };

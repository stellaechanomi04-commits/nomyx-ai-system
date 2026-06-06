/**
 * Phone Approval Workflow — Phase 14
 * Creates approval tasks when portal login/MFA/action is needed.
 * Sends mobile-friendly Resend email notification to Stella's phone.
 *
 * SECURITY:
 * - No passwords in notifications
 * - No API keys in notifications
 * - No private tokens in notifications
 * - Link goes to NOMYX dashboard only — not to raw credentials
 * - Stella types password/MFA directly into portal browser, not into chat
 */

const axios = require('axios');

const TASK_TYPE = {
  LOGIN_REQUIRED: 'Login Required',
  MFA_REQUIRED: 'MFA Required',
  CAPTCHA_MANUAL: 'CAPTCHA/Manual Required',
  SESSION_EXPIRED: 'Session Expired',
  BID_REVIEW: 'Bid Review Needed',
  BID_EXECUTION: 'Bid Execution — Stella Approval Required',
  SETUP_REQUIRED: 'Portal Setup Required'
};

const TASK_STATUS = {
  PENDING: 'Pending',
  APPROVED: 'Approved',
  DISMISSED: 'Dismissed',
  COMPLETED: 'Completed'
};

const TASK_PRIORITY = {
  HIGH: 'high',
  NORMAL: 'normal',
  LOW: 'low'
};

// In-memory task queue (Railway ephemeral — tasks reset on redeploy)
var approvalTasks = [];
var taskIdCounter = 1;

function createApprovalTask(opts) {
  var task = {
    id: 'task-' + (taskIdCounter++),
    type: opts.type || TASK_TYPE.LOGIN_REQUIRED,
    portalId: opts.portalId || null,
    portalName: opts.portalName || 'Unknown Portal',
    message: opts.message || 'Action required',
    loginUrl: opts.loginUrl || null,
    dashboardUrl: process.env.DASHBOARD_URL || 'https://nomyx-ai-system-production.up.railway.app',
    priority: opts.priority || TASK_PRIORITY.NORMAL,
    status: TASK_STATUS.PENDING,
    relatedBidId: opts.relatedBidId || null,
    relatedBidTitle: opts.relatedBidTitle || null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  approvalTasks.push(task);
  console.log('[Approval] Task created:', task.id, '|', task.portalName, '|', task.type);
  return task;
}

function getPendingTasks() {
  return approvalTasks.filter(function(t) { return t.status === TASK_STATUS.PENDING; });
}

function getAllTasks() {
  return approvalTasks.slice().reverse(); // newest first
}

function getTask(id) {
  return approvalTasks.find(function(t) { return t.id === id; }) || null;
}

function updateTask(id, update) {
  var task = approvalTasks.find(function(t) { return t.id === id; });
  if (!task) return { error: 'Task not found: ' + id };
  Object.assign(task, update, { updatedAt: new Date().toISOString() });
  console.log('[Approval] Task updated:', id, '->', update.status || 'details changed');
  return task;
}

function approveTask(id) {
  return updateTask(id, { status: TASK_STATUS.APPROVED });
}

function dismissTask(id) {
  return updateTask(id, { status: TASK_STATUS.DISMISSED });
}

function completeTask(id) {
  return updateTask(id, { status: TASK_STATUS.COMPLETED });
}

function getSummary() {
  var pending = getPendingTasks();
  return {
    total: approvalTasks.length,
    pending: pending.length,
    high: pending.filter(function(t) { return t.priority === TASK_PRIORITY.HIGH; }).length,
    loginApprovals: pending.filter(function(t) {
      return t.type === TASK_TYPE.LOGIN_REQUIRED || t.type === TASK_TYPE.MFA_REQUIRED || t.type === TASK_TYPE.SESSION_EXPIRED;
    }).length,
    bidApprovals: pending.filter(function(t) {
      return t.type === TASK_TYPE.BID_REVIEW || t.type === TASK_TYPE.BID_EXECUTION;
    }).length
  };
}

// ── Notification ────────────────────────────────────────────────────────────

async function sendPhoneNotification(task) {
  if (!process.env.RESEND_API_KEY) {
    console.warn('[Approval] No RESEND_API_KEY — phone notification skipped');
    return { success: false, error: 'No RESEND_API_KEY' };
  }

  var dashboardUrl = task.dashboardUrl + '/daily-command-center';
  var portalUrl = task.loginUrl || task.dashboardUrl + '/portal-sessions';
  var mobileUrl = task.dashboardUrl + '/m';
  var subject = '[NOMYX] ' + task.type + ' — ' + task.portalName;

  // Priority header color
  var headerBg = task.priority === TASK_PRIORITY.HIGH ? '#dc3545' : '#1d3557';
  var priorityLabel = task.priority === TASK_PRIORITY.HIGH ? '🔴 HIGH PRIORITY' : '🔔 Action Needed';

  var html = '<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:12px;background:#fff">'
    + '<div style="background:' + headerBg + ';color:white;padding:16px;border-radius:8px;margin-bottom:14px">'
    + '<p style="margin:0;font-size:12px;opacity:0.8">' + priorityLabel + '</p>'
    + '<h2 style="margin:4px 0 0;font-size:18px">🤖 NOMYX AI</h2>'
    + '</div>'
    + '<div style="background:#fff3cd;border:2px solid #ffc107;padding:14px;border-radius:8px;margin-bottom:14px">'
    + '<strong style="font-size:15px">' + task.type + '</strong><br>'
    + '<span style="font-size:16px;color:#333">' + task.portalName + '</span>'
    + '</div>'
    + '<p style="font-size:14px;color:#333;line-height:1.5">' + task.message + '</p>'
    + '<p style="font-size:13px;color:#666;background:#f8f9fa;padding:10px;border-radius:6px">'
    + '⚠️ NOMYX AI does not store your password. Log in directly in your browser, then return here and tap <strong>Mark Session Active</strong>.'
    + '</p>'
    + '<div style="margin:18px 0">'
    + '<a href="' + mobileUrl + '" style="display:block;background:#1d3557;color:white;padding:14px;border-radius:8px;text-decoration:none;font-size:15px;text-align:center;margin-bottom:10px">📱 Open NOMYX on Phone</a>'
    + (task.loginUrl ? '<a href="' + portalUrl + '" style="display:block;background:#28a745;color:white;padding:14px;border-radius:8px;text-decoration:none;font-size:15px;text-align:center">🔑 Open ' + task.portalName + '</a>' : '')
    + '</div>'
    + '<p style="font-size:11px;color:#aaa;margin-top:16px;border-top:1px solid #eee;padding-top:10px">'
    + 'Task ' + task.id + ' · ' + new Date(task.createdAt).toLocaleString('en-US', { timeZone: 'America/New_York' }) + ' ET<br>'
    + 'NOMYX AI System · info@nomyxlogistics.com<br>'
    + 'Do not reply — this is an automated system notification.'
    + '</p>'
    + '</body></html>';

  try {
    var res = await axios.post('https://api.resend.com/emails', {
      from: process.env.FROM_EMAIL || 'NOMYX AI System <noreply@nomyxlogistics.com>',
      to: [process.env.NOTIFY_EMAIL || 'info@nomyxlogistics.com'],
      subject: subject,
      html: html
    }, {
      headers: {
        'Authorization': 'Bearer ' + process.env.RESEND_API_KEY,
        'Content-Type': 'application/json'
      },
      timeout: 15000
    });
    console.log('[Approval] Phone notification sent:', res.data && res.data.id);
    return { success: true, id: res.data && res.data.id };
  } catch (e) {
    var errMsg = (e.response && e.response.data && e.response.data.message) || e.message;
    console.error('[Approval] Notification failed:', errMsg);
    return { success: false, error: errMsg };
  }
}

// ── Convenience functions ───────────────────────────────────────────────────

async function requestPortalLogin(portalId, portalName, loginUrl, mfaRequired) {
  var type = mfaRequired ? TASK_TYPE.MFA_REQUIRED : TASK_TYPE.LOGIN_REQUIRED;
  var message = mfaRequired
    ? 'MFA authentication is required to access ' + portalName + '. Open the portal in your browser, complete MFA, then tap Mark Session Active in NOMYX.'
    : 'Login is required to access ' + portalName + '. Open the portal in your browser, sign in with your credentials, then tap Mark Session Active in NOMYX. Your password is never stored by NOMYX AI.';
  var task = createApprovalTask({ type: type, portalId: portalId, portalName: portalName, loginUrl: loginUrl, message: message, priority: TASK_PRIORITY.HIGH });
  await sendPhoneNotification(task);
  return task;
}

async function requestBidReview(bid) {
  var message = 'A new bid opportunity may be a good fit for NOMYX: ' + (bid.title || 'Unknown bid') + '. Review the Go/No-Go analysis and decide whether to pursue.';
  var task = createApprovalTask({
    type: TASK_TYPE.BID_REVIEW,
    portalId: bid.source || 'unknown',
    portalName: bid.source || 'Procurement Portal',
    loginUrl: bid.url || null,
    message: message,
    priority: bid.deadlineDays != null && bid.deadlineDays <= 7 ? TASK_PRIORITY.HIGH : TASK_PRIORITY.NORMAL,
    relatedBidId: bid.id,
    relatedBidTitle: bid.title
  });
  await sendPhoneNotification(task);
  return task;
}

module.exports = {
  TASK_TYPE,
  TASK_STATUS,
  TASK_PRIORITY,
  createApprovalTask,
  getPendingTasks,
  getAllTasks,
  getTask,
  updateTask,
  approveTask,
  dismissTask,
  completeTask,
  getSummary,
  sendPhoneNotification,
  requestPortalLogin,
  requestBidReview
};

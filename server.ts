import express from 'express';
import path from 'path';
import crypto from 'crypto';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

// Load environment variables
dotenv.config();

const app = express();
const PORT = Number(process.env.PORT || 3000);

// Body parsing middleware
app.use(express.json());
app.use((err: any, req: any, res: any, next: any) => {
  if (err instanceof SyntaxError && 'body' in err) {
    return res.status(400).json({
      success: false,
      message: 'Invalid JSON request body',
      error: 'Invalid JSON request body'
    });
  }
  return next(err);
});

// Initialize Supabase Admin client with Service Role Key
const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const hasSupabaseUrl = supabaseUrl && supabaseUrl !== 'YOUR_SUPABASE_URL';
const hasServiceKey = supabaseServiceRoleKey && supabaseServiceRoleKey !== '';

const supabaseAdmin = (hasSupabaseUrl && hasServiceKey)
  ? createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false
      }
    })
  : null;

async function requireApiRole(req: any, res: any, allowedRoles: string[]): Promise<boolean> {
  if (!supabaseAdmin) {
    // Local/demo mode has no server-side auth provider. Production must configure SUPABASE_SERVICE_ROLE_KEY.
    return true;
  }

  const authHeader = req.headers.authorization || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!token) {
    const headerUserId = String(req.headers['x-nmc-user-id'] || '').trim();
    const headerUsername = String(req.headers['x-nmc-username'] || '').trim().toLowerCase();
    const headerRole = String(req.headers['x-nmc-user-role'] || '').trim();

    if (headerUserId && headerUsername && headerRole) {
      const { data: publicUser, error: publicUserError } = await supabaseAdmin
        .from('users')
        .select('id,username,role,is_active')
        .eq('id', headerUserId)
        .maybeSingle();

      const publicUserValid =
        !publicUserError &&
        publicUser &&
        String(publicUser.username || '').toLowerCase() === headerUsername &&
        String(publicUser.role || '') === headerRole &&
        publicUser.is_active !== false &&
        allowedRoles.includes(String(publicUser.role || ''));

      if (publicUserValid) {
        return true;
      }
    }

    res.status(401).json({ error: 'Authentication required.' });
    return false;
  }

  const { data: authData, error: authError } = await supabaseAdmin.auth.getUser(token);
  if (authError || !authData.user) {
    res.status(401).json({ error: 'Invalid authentication token.' });
    return false;
  }

  const userId = authData.user.id;
  let role: string | null = null;
  let isActive = true;

  const { data: userProfile } = await supabaseAdmin
    .from('users')
    .select('role,is_active')
    .eq('id', userId)
    .maybeSingle();

  if (userProfile) {
    role = userProfile.role;
    isActive = userProfile.is_active !== false;
  } else {
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('role,is_active')
      .eq('id', userId)
      .maybeSingle();
    role = profile?.role || null;
    isActive = profile?.is_active !== false;
  }

  if (!isActive || !role || !allowedRoles.includes(role)) {
    res.status(403).json({ error: 'Insufficient permission for this Telegram action.' });
    return false;
  }

  return true;
}

/**
 * Send Message to Telegram API
 */
async function sendTelegramMessage(botToken: string, chatId: string, text: string) {
  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text: text,
      parse_mode: 'HTML'
    })
  });
  const body = await readResponseBodySafely(response);
  if (!response.ok || body?.ok === false) {
    const description = body?.description || body?.raw || `HTTP ${response.status}`;
    throw new Error(`Telegram sendMessage API error: ${sanitizeTelegramError(description, botToken)}`);
  }
  return body;
}

async function testTelegramBotIdentity(botToken: string) {
  const response = await fetch(`https://api.telegram.org/bot${botToken}/getMe`);
  const body = await readResponseBodySafely(response);
  if (!response.ok || !body.ok) {
    throw new Error(sanitizeTelegramError(body.description || body.raw || 'Telegram getMe API connection failed.', botToken));
  }
  return body.result;
}

/**
 * Retrieve Active Bot State
 */
type TelegramBotPurpose = 'report_notification' | 'report_group' | 'license_reminder' | 'both';

function normalizeBotPurpose(purpose?: string | null): 'report_group' | 'license_reminder' | 'both' {
  if (purpose === 'report_notification' || purpose === 'report_group') return 'report_group';
  if (purpose === 'both') return 'both';
  return 'license_reminder';
}

function getPurposeCandidates(purpose: TelegramBotPurpose) {
  if (normalizeBotPurpose(purpose) === 'both') return ['license_reminder', 'report_group', 'report_notification', 'both'];
  return normalizeBotPurpose(purpose) === 'report_group'
    ? ['report_group', 'report_notification', 'both']
    : ['license_reminder', 'both'];
}

function getPurposeMissingMessage(purpose: TelegramBotPurpose) {
  return normalizeBotPurpose(purpose) === 'report_group'
    ? 'Report Group Notification Bot is inactive or missing configuration.'
    : 'Please configure an active License Reminder Bot or a bot with purpose Both.';
}

function getBotGroupChatId(bot: any) {
  return String(bot?.default_group_chat_id || bot?.default_chat_id || '').trim();
}

const TELEGRAM_INVALID_BOT_ID_MESSAGE = 'Invalid Telegram bot ID. Please refresh bot settings from Supabase.';

function isUuid(value?: string | null) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || '').trim());
}

function requireValidTelegramBotId(res: any, botId?: string | null) {
  if (!botId || !isUuid(botId)) {
    apiError(res, 400, TELEGRAM_INVALID_BOT_ID_MESSAGE);
    return false;
  }
  return true;
}

function apiError(res: any, status: number, message: string, extra: Record<string, any> = {}) {
  return res.status(status).json({ success: false, message, error: message, ...extra });
}

function apiSuccess(res: any, body: Record<string, any> = {}) {
  return res.json({ success: true, ...body });
}

async function readResponseBodySafely(response: Response): Promise<any> {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

function sanitizeTelegramError(message: string, botToken?: string | null) {
  let safe = String(message || 'Telegram API request failed.');
  if (botToken) safe = safe.split(botToken).join('[REDACTED]');
  return safe.replace(/bot\d+:[A-Za-z0-9_-]+/g, 'bot[REDACTED]');
}

function isProtectedSecretValue(value?: string | null) {
  const raw = String(value || '').trim();
  if (!raw) return true;
  if (['PROTECTED_UNCHANGED', 'PROTECTED_SERVER_SIDE'].includes(raw)) return true;
  return /^[*•●]+$/.test(raw);
}

function sanitizeBotForClient(bot: any) {
  const hasToken = !!String(bot?.bot_token_encrypted || '').trim();
  return {
    ...bot,
    bot_token_encrypted: hasToken ? 'PROTECTED_SERVER_SIDE' : '',
    webhook_secret_encrypted: bot?.webhook_secret_encrypted ? 'PROTECTED_SERVER_SIDE' : null
  };
}

function sanitizeBotPayload(input: any, existingBot?: any) {
  const now = new Date().toISOString();
  const protectedToken = isProtectedSecretValue(input.bot_token_encrypted || input.bot_token);
  const inputId = String(input.id || existingBot?.id || '').trim();
  const payload: any = {
    bot_name: input.bot_name || null,
    bot_username: String(input.bot_username || '').replace(/^@/, '').trim(),
    bot_purpose: normalizeBotPurpose(input.bot_purpose),
    default_chat_id: input.default_chat_id || null,
    default_group_chat_id: input.default_group_chat_id || input.default_chat_id || null,
    is_active: input.is_active === true,
    description: input.description || null,
    connection_status: input.connection_status || 'not_verified',
    last_test_status: input.last_test_status || null,
    last_test_message: input.last_test_message || null,
    last_error: input.last_error || null,
    last_tested_at: input.last_tested_at || null,
    webhook_status: input.webhook_status || 'not_configured',
    webhook_url: input.webhook_url || null,
    bot_display_name: input.bot_display_name || null,
    created_at: existingBot?.created_at || input.created_at || now,
    updated_at: now
  };

  if (isUuid(inputId)) {
    payload.id = inputId;
  }

  if (!protectedToken) {
    payload.bot_token_encrypted = String(input.bot_token_encrypted || input.bot_token).trim();
  } else if (existingBot?.bot_token_encrypted) {
    payload.bot_token_encrypted = existingBot.bot_token_encrypted;
  }

  if (input.webhook_secret_encrypted && input.webhook_secret_encrypted !== 'PROTECTED_SERVER_SIDE') {
    payload.webhook_secret_encrypted = input.webhook_secret_encrypted;
  } else if (existingBot?.webhook_secret_encrypted) {
    payload.webhook_secret_encrypted = existingBot.webhook_secret_encrypted;
  }

  return payload;
}

async function getActiveBot(purpose: TelegramBotPurpose = 'license_reminder') {
  if (!supabaseAdmin) {
    // Fallback to environment variables
    const isReportBot = normalizeBotPurpose(purpose) === 'report_group';
    const token = isReportBot
      ? (process.env.TELEGRAM_REPORT_BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN)
      : (process.env.TELEGRAM_REMINDER_BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN);
    const username = isReportBot
      ? (process.env.TELEGRAM_REPORT_BOT_USERNAME || process.env.TELEGRAM_BOT_USERNAME || 'NMC_Report_Bot')
      : (process.env.TELEGRAM_REMINDER_BOT_USERNAME || process.env.TELEGRAM_BOT_USERNAME || 'NMC_Reminder_Bot');
    const defaultChatId = isReportBot ? process.env.TELEGRAM_REPORT_CHAT_ID : undefined;
    if (token) {
      return { id: 'env-fallback', bot_token_encrypted: token, bot_username: username, default_chat_id: defaultChatId, default_group_chat_id: defaultChatId, bot_purpose: purpose };
    }
    return null;
  }

  try {
    const { data, error } = await supabaseAdmin
      .from('telegram_bot_settings')
      .select('*')
      .eq('is_active', true)
      .in('bot_purpose', getPurposeCandidates(purpose))
      .not('bot_token_encrypted', 'is', null)
      .not('bot_username', 'is', null)
      .limit(10);

    if (!error && data && data.length > 0) {
      const usableCandidates = data.filter((bot: any) =>
        String(bot.bot_token_encrypted || '').trim() &&
        !isProtectedSecretValue(bot.bot_token_encrypted) &&
        String(bot.bot_username || '').trim()
      );
      const usable = normalizeBotPurpose(purpose) === 'report_group'
        ? usableCandidates.find((bot: any) => getBotGroupChatId(bot))
        : usableCandidates[0];
      if (usable) return usable;
    }
    if (error && normalizeBotPurpose(purpose) === 'license_reminder') {
      const legacy = await supabaseAdmin
        .from('telegram_bot_settings')
        .select('*')
        .eq('is_active', true)
        .not('bot_token_encrypted', 'is', null)
        .not('bot_username', 'is', null)
        .limit(1);
      if (!legacy.error && legacy.data && legacy.data.length > 0) {
        const usableLegacy = legacy.data.find((bot: any) => String(bot.bot_token_encrypted || '').trim() && String(bot.bot_username || '').trim());
        if (usableLegacy) return usableLegacy;
      }
    }
  } catch (err) {
    console.warn('Failed to fetch active bot settings from Supabase:', err);
  }

  // Fallback to env
  const isReportBot = normalizeBotPurpose(purpose) === 'report_group';
  const token = isReportBot
    ? (process.env.TELEGRAM_REPORT_BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN)
    : (process.env.TELEGRAM_REMINDER_BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN);
  const username = isReportBot
    ? (process.env.TELEGRAM_REPORT_BOT_USERNAME || process.env.TELEGRAM_BOT_USERNAME || 'NMC_Report_Bot')
    : (process.env.TELEGRAM_REMINDER_BOT_USERNAME || process.env.TELEGRAM_BOT_USERNAME || 'NMC_Reminder_Bot');
  const defaultChatId = isReportBot ? process.env.TELEGRAM_REPORT_CHAT_ID : undefined;
  if (token) {
    return { id: 'env-fallback', bot_token_encrypted: token, bot_username: username, default_chat_id: defaultChatId, default_group_chat_id: defaultChatId, bot_purpose: purpose };
  }
  return null;
}

// ==========================================
// API ROUTES
// ==========================================

app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    supabase: supabaseAdmin ? 'connected' : 'unconfigured_fallback',
    time: new Date().toISOString()
  });
});

app.get('/api/telegram-bot-settings', async (req, res) => {
  try {
    if (!(await requireApiRole(req, res, ['superadmin', 'admin']))) return;
    if (!supabaseAdmin) {
      return apiError(res, 400, 'Missing Supabase server environment variables');
    }

    const { data, error } = await supabaseAdmin
      .from('telegram_bot_settings')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;
    return apiSuccess(res, { bots: (data || []).map(sanitizeBotForClient) });
  } catch (err: any) {
    console.error('Failed to fetch Telegram Bot settings:', err);
    return apiError(res, 500, err?.message || 'Failed to fetch Telegram Bot settings.');
  }
});

app.post('/api/telegram-bot-settings', async (req, res) => {
  try {
    if (!(await requireApiRole(req, res, ['superadmin']))) return;
    if (!supabaseAdmin) {
      return apiError(res, 400, 'Missing Supabase server environment variables');
    }

    const input = req.body || {};
    if (!input.bot_name || !input.bot_username) {
      return apiError(res, 400, 'Bot name and Bot username are required.');
    }

    const id = String(input.id || '');
    let existingBot: any = null;
    if (id) {
      if (!requireValidTelegramBotId(res, id)) return;
      const { data } = await supabaseAdmin
        .from('telegram_bot_settings')
        .select('*')
        .eq('id', id)
        .limit(1)
        .maybeSingle();
      existingBot = data || null;
    }

    const payload = sanitizeBotPayload(input, existingBot);
    if (!payload.bot_token_encrypted) {
      return apiError(res, 400, 'Bot Token is required.');
    }
    if ((payload.bot_purpose === 'report_group' || payload.bot_purpose === 'both') && !getBotGroupChatId(payload)) {
      return apiError(res, 400, 'Default Group Chat ID is required for Report Group notifications.');
    }

    if (payload.is_active) {
      const capabilities = getPurposeCandidates(payload.bot_purpose);
      let deactivateQuery = supabaseAdmin
        .from('telegram_bot_settings')
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .in('bot_purpose', capabilities);
      if (payload.id) {
        deactivateQuery = deactivateQuery.not('id', 'eq', payload.id);
      }
      await deactivateQuery;
    }

    const saveQuery = payload.id
      ? supabaseAdmin.from('telegram_bot_settings').upsert(payload, { onConflict: 'id' })
      : supabaseAdmin.from('telegram_bot_settings').insert(payload);
    const { data, error } = await saveQuery.select('*').maybeSingle();

    if (error) throw error;
    return apiSuccess(res, { bot: sanitizeBotForClient(data || payload) });
  } catch (err: any) {
    console.error('Failed to save Telegram Bot setting:', err);
    return apiError(res, 500, err?.message || 'Failed to save Telegram Bot setting.');
  }
});

app.delete('/api/telegram-bot-settings/:id', async (req, res) => {
  try {
    if (!(await requireApiRole(req, res, ['superadmin']))) return;
    if (!supabaseAdmin) {
      return apiError(res, 400, 'Missing Supabase server environment variables');
    }
    if (!requireValidTelegramBotId(res, req.params.id)) return;

    const { error } = await supabaseAdmin
      .from('telegram_bot_settings')
      .delete()
      .eq('id', req.params.id);

    if (error) throw error;
    return apiSuccess(res, { status: 'success' });
  } catch (err: any) {
    console.error('Failed to delete Telegram Bot setting:', err);
    return apiError(res, 500, err?.message || 'Failed to delete Telegram Bot setting.');
  }
});

/**
 * 4. Telegram webhook handler
 * Receives /start {token} commands from connected companies
 */
app.post('/api/telegram-webhook', async (req, res) => {
  try {
    const update = req.body;
    console.log('Received Telegram update:', JSON.stringify(update));

    const message = update.message;
    if (!message || !message.text || !message.chat) {
      return res.json({ status: 'ignored_no_message' });
    }

    const text = message.text.trim();
    const chatId = message.chat.id;

    // Check if message is /start {token}
    if (!text.startsWith('/start ')) {
      return res.json({ status: 'ignored_not_start' });
    }

    const regToken = text.substring(7).trim();
    if (!regToken) {
      return res.json({ status: 'ignored_empty_token' });
    }

    // Hash the received token to compare with DB
    const hashedToken = crypto.createHash('sha256').update(regToken).digest('hex');

    // Load active bot setting to send confirmation
    const activeBot = await getActiveBot();
    if (!activeBot) {
      console.error('No active Telegram bot configured. Cannot respond to connection.');
      return res.status(500).json({ error: 'Telegram bot unconfigured' });
    }

    const botToken = activeBot.bot_token_encrypted;

    if (!supabaseAdmin) {
      // Offline fallback: simulated success since Supabase is not connected
      console.log('No Supabase Admin client connected. Simulating fallback webhook reply.');
      const testMsg = `<b>សូមអរគុណ!</b> គណនី Telegram របស់លោកអ្នកបានភ្ជាប់ជាមួយប្រព័ន្ធរំលឹកអាជ្ញាប័ណ្ណរបស់មជ្ឈមណ្ឌលមាត្រាសាស្ត្រជាតិដោយជោគជ័យ។ (Offline Mode)\n\nThank you! Your Telegram account has been successfully connected to the National Metrology Center license reminder system. (Offline Mode)`;
      await sendTelegramMessage(botToken, String(chatId), testMsg);
      return res.json({ status: 'offline_mode_sim_connected' });
    }

    // Query license with matching token hash
    const { data: license, error: queryErr } = await supabaseAdmin
      .from('enterprise_licenses')
      .select('*')
      .eq('telegram_registration_token_hash', hashedToken)
      .limit(1)
      .maybeSingle();

    if (queryErr || !license) {
      const invalidKh = 'តំណភ្ជាប់នេះមិនត្រឹមត្រូវ ឬផុតកំណត់ហើយ។ សូមចូលទៅក្នុងប្រព័ន្ធ NMC ដើម្បីបង្កើតតំណភ្ជាប់ថ្មី។';
      const invalidEn = 'This connection link is invalid or expired. Please log in to the NMC system to generate a new Telegram connection link.';
      await sendTelegramMessage(botToken, String(chatId), `${invalidKh}\n\n${invalidEn}`);
      return res.json({ status: 'invalid_or_expired_token' });
    }

    // Check token expiry
    if (license.telegram_registration_token_expires_at) {
      const expiresAt = new Date(license.telegram_registration_token_expires_at);
      if (expiresAt < new Date()) {
        const expiredKh = 'តំណភ្ជាប់នេះមិនត្រឹមត្រូវ ឬផុតកំណត់ហើយ។ សូមចូលទៅក្នុងប្រព័ន្ធ NMC ដើម្បីបង្កើតតំណភ្ជាប់ថ្មី។';
        const expiredEn = 'This connection link is invalid or expired. Please log in to the NMC system to generate a new Telegram connection link.';
        await sendTelegramMessage(botToken, String(chatId), `${expiredKh}\n\n${expiredEn}`);
        return res.json({ status: 'token_expired_recreation_needed' });
      }
    }

    // Save Telegram recipient profile
    const { error: updateErr } = await supabaseAdmin
      .from('enterprise_licenses')
      .update({
        telegram_chat_id: String(chatId),
        telegram_username: message.from?.username || null,
        telegram_first_name: message.from?.first_name || null,
        telegram_last_name: message.from?.last_name || null,
        telegram_connected_at: new Date().toISOString(),
        telegram_connection_status: 'Connected',
        telegram_registration_token_hash: null,
        telegram_registration_token_expires_at: null,
        telegram_bot_setting_id: activeBot.id !== 'env-fallback' ? activeBot.id : null
      })
      .eq('id', license.id);

    if (updateErr) {
      throw updateErr;
    }

    // Send bilingual confirmation message
    const khmerMsg = 'សូមអរគុណ! គណនី Telegram របស់លោកអ្នកបានភ្ជាប់ជាមួយប្រព័ន្ធរំលឹកអាជ្ញាប័ណ្ណរបស់មជ្ឈមណ្ឌលមាត្រាសាស្ត្រជាតិដោយជោគជ័យ។';
    const englishMsg = 'Thank you! Your Telegram account has been successfully connected to the National Metrology Center license reminder system.';
    const confirmText = `${khmerMsg}\n\n${englishMsg}`;
    
    await sendTelegramMessage(botToken, String(chatId), confirmText);

    // Save to reminder log
    await supabaseAdmin
      .from('license_reminder_logs')
      .insert({
        license_id: license.id,
        telegram_bot_setting_id: activeBot.id !== 'env-fallback' ? activeBot.id : null,
        reminder_type: 'TEST',
        reminder_days: 0,
        telegram_chat_id: String(chatId),
        telegram_username: message.from.username || null,
        message_text: 'Telegram Account Connected Successfully.',
        send_status: 'Sent',
        sent_at: new Date().toISOString(),
        created_at: new Date().toISOString()
      });

    // Write Audit Log
    try {
      await supabaseAdmin.from('audit_logs').insert({
        actor_email: 'telegram_bot',
        actor_role: 'system',
        action_type: 'TELEGRAM_CONNECTED',
        details: `Successfully connected Telegram Chat ID ${chatId} to enterprise ${license.company_name} (License NO: ${license.license_number})`,
        created_at: new Date().toISOString()
      });
    } catch (auditErr) {
      console.warn('Could not write audit log:', auditErr);
    }

    return res.json({ status: 'connected_successfully' });
  } catch (err: any) {
    console.error('Error in/api/telegram-webhook handler:', err);
    return res.status(500).json({ error: err?.message || 'Webhook processing failed' });
  }
});

/**
 * 6. Scheduled reminders API
 * Compiles list of licenses expiring in 60, 30, 7 days, or expired, and dispatches notices.
 */
app.post('/api/license-reminders', async (req, res) => {
  try {
    // Check Cron secret
    const cronSecret = process.env.CRON_SECRET;
    const authHeader = req.headers.authorization;
    const querySecret = req.query.secret;

    if (supabaseAdmin && !cronSecret) {
      return res.status(500).json({ error: 'CRON_SECRET is required before scheduled reminders can run in production.' });
    }

    const reqSecret = authHeader ? authHeader.replace(/^Bearer\s+/i, '') : querySecret;
    if (cronSecret && reqSecret !== cronSecret) {
      return res.status(401).json({ error: 'Unauthorized CRON secret verification failed.' });
    }

    // Load active bot
    const activeBot = await getActiveBot('license_reminder');
    if (!activeBot) {
      return res.status(400).json({ status: 'Skipped', message: getPurposeMissingMessage('license_reminder') });
    }

    const botToken = activeBot.bot_token_encrypted;

    if (!supabaseAdmin) {
      return res.status(400).json({ status: 'Skipped', message: 'Offline mode: No database connection established to query licenses.' });
    }

    // Fetch active licenses
    const { data: licenses, error: fetchErr } = await supabaseAdmin
      .from('enterprise_licenses')
      .select('*')
      .in('license_status', ['Active', 'Expiring Soon']);

    if (fetchErr) {
      throw fetchErr;
    }

    if (!licenses || licenses.length === 0) {
      return res.json({ status: 'Success', message: 'Zero licenses requiring examination.', sent_count: 0 });
    }

    let sentCount = 0;
    let skippedCount = 0;

    // Standard Cambodia timezone offset calculation (today YYYY-MM-DD)
    const cambodiaTime = new Date(Date.now() + 7 * 60 * 60 * 1000);
    const todayStr = cambodiaTime.toISOString().split('T')[0];
    const today = new Date(todayStr);

    for (const license of licenses) {
      if (!license.license_expiry_date) continue;

      const expiry = new Date(license.license_expiry_date);
      const diffMs = expiry.getTime() - today.getTime();
      const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

      let reminderType: '60_DAYS_BEFORE_EXPIRY' | '30_DAYS_BEFORE_EXPIRY' | '7_DAYS_BEFORE_EXPIRY' | 'EXPIRED' | null = null;
      let timestampField: 'last_60_day_reminder_sent_at' | 'last_30_day_reminder_sent_at' | 'last_7_day_reminder_sent_at' | 'expired_reminder_sent_at' | null = null;

      if (diffDays === 60) {
        reminderType = '60_DAYS_BEFORE_EXPIRY';
        timestampField = 'last_60_day_reminder_sent_at';
      } else if (diffDays === 30) {
        reminderType = '30_DAYS_BEFORE_EXPIRY';
        timestampField = 'last_30_day_reminder_sent_at';
      } else if (diffDays === 7) {
        reminderType = '7_DAYS_BEFORE_EXPIRY';
        timestampField = 'last_7_day_reminder_sent_at';
      } else if (diffDays <= 0) {
        reminderType = 'EXPIRED';
        timestampField = 'expired_reminder_sent_at';
      }

      if (!reminderType || !timestampField) {
        continue; // Doesn't match timelines
      }

      // Check duplicate
      if (license[timestampField]) {
        continue; // Already dispatched
      }

      const companyName = license.company_name;
      const licenseNumber = license.license_number;
      const expiryDateStr = license.license_expiry_date;

      // Skip if not connected
      if (!license.telegram_chat_id || license.telegram_connection_status !== 'Connected') {
        // Log skip operation in license_reminder_logs
        await supabaseAdmin.from('license_reminder_logs').insert({
          license_id: license.id,
          telegram_bot_setting_id: activeBot.id !== 'env-fallback' ? activeBot.id : null,
          reminder_type: reminderType,
          reminder_days: diffDays,
          telegram_chat_id: 'N/A',
          message_text: `Skipped: recipient Telegram not connected (Company: ${companyName})`,
          send_status: 'Skipped',
          sent_at: new Date().toISOString(),
          created_at: new Date().toISOString()
        });
        skippedCount++;
        continue;
      }

      // Draft messages
      let messageText = '';
      if (reminderType !== 'EXPIRED') {
        const kh = `សេចក្តីជូនដំណឹងពីមជ្ឈមណ្ឌលមាត្រាសាស្ត្រជាតិ៖ អាជ្ញាប័ណ្ណរបស់សហគ្រាស ${companyName} លេខ ${licenseNumber} នឹងផុតកំណត់នៅថ្ងៃទី ${expiryDateStr}។ នៅសល់ ${diffDays} ថ្ងៃ។ សូមអញ្ជើញទំនាក់ទំនងមកមជ្ឈមណ្ឌលមាត្រាសាស្ត្រជាតិ ដើម្បីបន្តសុពលភាពអាជ្ញាប័ណ្ណរបស់លោកអ្នក។`;
        const en = `Notification from the National Metrology Center: The license of ${companyName}, License No. ${licenseNumber}, will expire on ${expiryDateStr}. There are ${diffDays} days remaining. Please contact the National Metrology Center to renew your license.`;
        messageText = `⚠️ <b>${kh}</b>\n\n${en}`;
      } else {
        const kh = `សេចក្តីជូនដំណឹងពីមជ្ឈមណ្ឌលមាត្រាសាស្ត្រជាតិ៖ អាជ្ញាប័ណ្ណរបស់សហគ្រាស ${companyName} លេខ ${licenseNumber} បានផុតសុពលភាពនៅថ្ងៃទី ${expiryDateStr}។ សូមទំនាក់ទំនងមកមជ្ឈមណ្ឌលមាត្រាសាស្ត្រជាតិ ដើម្បីបន្តសុពលភាពអាជ្ញាប័ណ្ណ។`;
        const en = `Notification from the National Metrology Center: The license of ${companyName}, License No. ${licenseNumber}, expired on ${expiryDateStr}. Please contact the National Metrology Center to renew the license.`;
        messageText = `🚫 <b>${kh}</b>\n\n${en}`;
      }

      try {
        await sendTelegramMessage(botToken, license.telegram_chat_id, messageText);

        // Update database timestamps
        const updateParams: any = {
          [timestampField]: new Date().toISOString()
        };

        if (reminderType === 'EXPIRED') {
          updateParams.license_status = 'Expired';
        }

        await supabaseAdmin
          .from('enterprise_licenses')
          .update(updateParams)
          .eq('id', license.id);

        // Save reminders log
        await supabaseAdmin.from('license_reminder_logs').insert({
          license_id: license.id,
          telegram_bot_setting_id: activeBot.id !== 'env-fallback' ? activeBot.id : null,
          reminder_type: reminderType,
          reminder_days: diffDays,
          telegram_chat_id: license.telegram_chat_id,
          telegram_username: license.telegram_username,
          message_text: messageText,
          send_status: 'Sent',
          sent_at: new Date().toISOString(),
          created_at: new Date().toISOString()
        });

        sentCount++;
      } catch (err: any) {
        console.error(`Failed to dispatch reminder to chatId ${license.telegram_chat_id}:`, err);

        // Log Failure in reminders log
        await supabaseAdmin.from('license_reminder_logs').insert({
          license_id: license.id,
          telegram_bot_setting_id: activeBot.id !== 'env-fallback' ? activeBot.id : null,
          reminder_type: reminderType,
          reminder_days: diffDays,
          telegram_chat_id: license.telegram_chat_id || 'N/A',
          telegram_username: license.telegram_username,
          message_text: messageText,
          send_status: 'Failed',
          error_message: err?.message || String(err),
          sent_at: new Date().toISOString(),
          created_at: new Date().toISOString()
        });
      }
    }

    return res.json({
      status: 'Success',
      message: `Completed daily reminders cron check on ${todayStr}`,
      sent_count: sentCount,
      skipped_count: skippedCount
    });
  } catch (err: any) {
    console.error('Error during scheduled reminders compile:', err);
    return res.status(500).json({ error: err?.message || 'Scheduled Reminders compilation failed' });
  }
});

/**
 * Webhook Setup and Status proxy endpoints for Superadmins
 */
app.post('/api/test-telegram-bot-connection', async (req, res) => {
  try {
    if (!(await requireApiRole(req, res, ['superadmin']))) return;

    const botId = req.body?.bot_id || req.body?.botId || null;
    const bodyBotToken = req.body?.bot_token || req.body?.botToken || null;
    if (!botId && !bodyBotToken) {
      return apiError(res, 400, TELEGRAM_INVALID_BOT_ID_MESSAGE);
    }
    if (botId && !supabaseAdmin) {
      return apiError(res, 400, 'Missing Supabase server environment variables');
    }

    let bot: any = null;
    if (botId && supabaseAdmin) {
      if (!requireValidTelegramBotId(res, botId)) return;
      const { data, error } = await supabaseAdmin
        .from('telegram_bot_settings')
        .select('*')
        .eq('id', botId)
        .limit(1)
        .maybeSingle();

      if (error || !data) {
        return apiError(res, 404, 'Telegram Bot setting not found.');
      }
      bot = data;
    } else {
      bot = {
        id: 'direct-token-test',
        bot_token_encrypted: bodyBotToken,
        bot_username: req.body?.bot_username || req.body?.botUsername || ''
      };
    }

    const botToken = String(bot.bot_token_encrypted || '').trim();
    const configuredUsername = String(bot.bot_username || '').replace(/^@/, '').trim();
    if (!botToken || isProtectedSecretValue(botToken)) {
      return apiError(res, 400, 'Bot token missing');
    }

    const now = new Date().toISOString();
    try {
      const me = await testTelegramBotIdentity(botToken);
      const returnedUsername = String(me.username || '').replace(/^@/, '').trim();
      if (configuredUsername && returnedUsername && configuredUsername.toLowerCase() !== returnedUsername.toLowerCase()) {
        throw new Error(`Bot username mismatch. Telegram returned @${returnedUsername}.`);
      }

      const successUpdate = {
        connection_status: 'connected',
        last_test_status: 'Success',
        last_test_message: 'Telegram getMe verified successfully.',
        last_error: null,
        last_tested_at: now,
        bot_display_name: me.first_name || me.username || bot.bot_display_name || bot.bot_name || null,
        updated_at: now
      };
      let updateError: any = null;
      if (supabaseAdmin && isUuid(bot.id)) {
        const result = await supabaseAdmin
          .from('telegram_bot_settings')
          .update(successUpdate)
          .eq('id', bot.id);
        updateError = result.error;
      }
      if (updateError && supabaseAdmin && isUuid(bot.id)) {
        await supabaseAdmin
          .from('telegram_bot_settings')
          .update({
            last_test_status: 'Success',
            last_test_message: 'Telegram getMe verified successfully.',
            last_tested_at: now,
            updated_at: now
          })
          .eq('id', bot.id);
      }

      return apiSuccess(res, {
        status: 'connected',
        bot: {
          ...bot,
          ...successUpdate,
          bot_token_encrypted: bot.bot_token_encrypted ? 'PROTECTED_SERVER_SIDE' : ''
        },
        telegram_user: {
          id: me.id,
          username: me.username,
          first_name: me.first_name,
          is_bot: me.is_bot
        }
      });
    } catch (testError: any) {
      const safeMessage = String(testError?.message || 'Telegram API connection failed.').replace(botToken, '[REDACTED]');
      const errorUpdate = {
        connection_status: 'error',
        last_test_status: 'Failed',
        last_test_message: 'Telegram getMe failed.',
        last_error: safeMessage,
        last_tested_at: now,
        updated_at: now
      };
      let updateError: any = null;
      if (supabaseAdmin && isUuid(bot.id)) {
        const result = await supabaseAdmin
          .from('telegram_bot_settings')
          .update(errorUpdate)
          .eq('id', bot.id);
        updateError = result.error;
      }
      if (updateError && supabaseAdmin && isUuid(bot.id)) {
        await supabaseAdmin
          .from('telegram_bot_settings')
          .update({
            last_test_status: 'Failed',
            last_test_message: safeMessage,
            last_tested_at: now,
            updated_at: now
          })
          .eq('id', bot.id);
      }

      return res.status(400).json({
        success: false,
        message: safeMessage,
        status: 'error',
        error: safeMessage,
        bot: {
          ...bot,
          ...errorUpdate,
          bot_token_encrypted: bot.bot_token_encrypted ? 'PROTECTED_SERVER_SIDE' : ''
        }
      });
    }
  } catch (err: any) {
    const safeMessage = String(err?.message || 'Failed to test Telegram Bot connection.');
    console.error('test Telegram Bot connection failed:', safeMessage);
    return apiError(res, 500, safeMessage);
  }
});

app.post('/api/set-telegram-webhook', async (req, res) => {
  try {
    if (!(await requireApiRole(req, res, ['superadmin']))) return;

    const botId = req.body?.bot_id || req.body?.botId || null;
    const webhookUrl = String(req.body?.webhook_url || req.body?.webhookUrl || '').trim();
    const bodyBotToken = req.body?.bot_token || req.body?.botToken || null;
    if (!webhookUrl) {
      return apiError(res, 400, 'Missing webhook URL. Webhook requires deployed HTTPS URL.');
    }
    if (!/^https:\/\//i.test(webhookUrl) || /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])/i.test(webhookUrl)) {
      return apiError(res, 400, 'Webhook requires public HTTPS deployment. Localhost cannot be used for Telegram webhook.');
    }
    if (!botId && !bodyBotToken) {
      return apiError(res, 400, TELEGRAM_INVALID_BOT_ID_MESSAGE);
    }

    let botToken = bodyBotToken || '';
    let targetBot = null;

    if (supabaseAdmin && botId) {
      if (!requireValidTelegramBotId(res, botId)) return;
      const { data, error } = await supabaseAdmin
        .from('telegram_bot_settings')
        .select('*')
        .eq('id', botId)
        .limit(1)
        .maybeSingle();
      if (data && !error) {
        targetBot = data;
        botToken = data.bot_token_encrypted;
      } else {
        return apiError(res, 404, 'Telegram Bot setting not found.');
      }
    }

    if (!botToken && !botId) {
      const activeBot = await getActiveBot();
      if (!activeBot) {
        return apiError(res, 400, 'Active Telegram Bot not found.');
      }
      targetBot = activeBot;
      botToken = activeBot.bot_token_encrypted;
    }

    if (botId && !botToken && !supabaseAdmin) {
      return apiError(res, 400, 'Missing Supabase server environment variables');
    }

    if (!botToken || isProtectedSecretValue(botToken) || botToken === 'env-fallback') {
      return apiError(res, 400, 'Cannot set webhook without a valid, real Telegram Bot Token.');
    }

    // Call Telegram API setWebhook
    const tgUrl = `https://api.telegram.org/bot${botToken}/setWebhook`;
    const response = await fetch(tgUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: webhookUrl })
    });

    const body = await readResponseBodySafely(response);
    if (!response.ok || !body.ok) {
      throw new Error(sanitizeTelegramError(body.description || body.raw || 'Telegram setWebhook failed', botToken));
    }

    // Update database
    if (supabaseAdmin && targetBot) {
      const { error: updateErr } = await supabaseAdmin
        .from('telegram_bot_settings')
        .update({
          webhook_url: webhookUrl,
          webhook_status: 'configured',
          updated_at: new Date().toISOString()
        })
        .eq('id', targetBot.id);
      if (updateErr) console.warn('Could not update webhook url in DB:', updateErr);
    }

    return apiSuccess(res, { 
      status: 'success', 
      message: 'Telegram Webhook configured successfully!', 
      telegram_response: body 
    });
  } catch (err: any) {
    console.error('setWebhook error:', err);
    return apiError(res, 500, err?.message || 'Failed to configure Telegram Webhook');
  }
});

app.get('/api/get-telegram-webhook-status', async (req, res) => {
  try {
    if (!(await requireApiRole(req, res, ['superadmin', 'admin']))) return;

    const { botId } = req.query;
    let botToken = '';
    let targetBot = null;
    if (!botId) {
      return apiError(res, 400, TELEGRAM_INVALID_BOT_ID_MESSAGE);
    }

    if (supabaseAdmin && botId) {
      const safeBotId = String(botId || '');
      if (!requireValidTelegramBotId(res, safeBotId)) return;
      const { data, error } = await supabaseAdmin
        .from('telegram_bot_settings')
        .select('*')
        .eq('id', safeBotId)
        .limit(1)
        .maybeSingle();
      if (data && !error) {
        targetBot = data;
        botToken = data.bot_token_encrypted;
      }
    }

    if (!botToken) {
      const activeBot = await getActiveBot();
      if (!activeBot) {
        return res.json({ status: 'Not Configured', reason: 'No active bot' });
      }
      targetBot = activeBot;
      botToken = activeBot.bot_token_encrypted;
    }

    if (!botToken || botToken === 'env-fallback') {
      return res.json({ status: 'Not Configured', reason: 'Using simulated fallback', url: targetBot?.webhook_url || '' });
    }

    const response = await fetch(`https://api.telegram.org/bot${botToken}/getWebhookInfo`);
    const body = await readResponseBodySafely(response);

    if (response.ok && body.ok) {
      const info = body.result;
      if (!info.url) {
        return res.json({ 
          status: 'Not Configured', 
          url: '',
          last_configured_date: targetBot?.updated_at || null,
          info 
        });
      }
      
      const isFailed = info.last_error_date ? true : false;
      return res.json({
        status: isFailed ? 'Failed' : 'Active',
        url: info.url,
        last_error_date: info.last_error_date ? new Date(info.last_error_date * 1000).toISOString() : null,
        last_error_message: info.last_error_message,
        last_configured_date: targetBot?.updated_at || null,
        has_error: isFailed,
        info
      });
    }

    return res.json({ status: 'Failed', reason: 'Telegram API returned failure status' });
  } catch (err: any) {
    console.error('getWebhookInfo error:', err);
    return apiError(res, 500, err?.message || 'Failed to query Telegram webhook info');
  }
});

/**
 * 8. Manual test dispatcher
 * Allows Superadmins and authorized Admins to test send reminders instantly
 */
app.post('/api/test-telegram-reminder', async (req, res) => {
  try {
    const { licenseId, chatId, customMessage, botToken: bodyBotToken, botUsername: bodyBotUsername, botId, botPurpose } = req.body;
    const requestedPurpose: TelegramBotPurpose = (botPurpose === 'report_group' || botPurpose === 'report_notification') ? 'report_group' : 'license_reminder';

    if (requestedPurpose !== 'report_group' && !(await requireApiRole(req, res, ['superadmin', 'admin']))) return;
    
    let botToken = bodyBotToken;
    let botUsername = bodyBotUsername || 'Custom Bot';
    let activeBotId: string | null = null;
    let targetChatId = chatId;

    if (!botToken && botId && supabaseAdmin) {
      if (!requireValidTelegramBotId(res, botId)) return;
      const { data, error } = await supabaseAdmin
        .from('telegram_bot_settings')
        .select('*')
        .eq('id', botId)
        .limit(1)
        .maybeSingle();
      if (data && !error) {
        botToken = data.bot_token_encrypted;
        botUsername = data.bot_username;
        activeBotId = data.id;
        targetChatId = targetChatId || (normalizeBotPurpose(data.bot_purpose) === 'report_group' || data.bot_purpose === 'both' ? getBotGroupChatId(data) : data.default_chat_id);
        if (requestedPurpose === 'report_group') {
          const botReady = data.is_active === true &&
            getPurposeCandidates('report_group').includes(data.bot_purpose) &&
            !isProtectedSecretValue(data.bot_token_encrypted) &&
            !!getBotGroupChatId(data);
          if (!botReady) {
            return apiError(res, 400, getPurposeMissingMessage(requestedPurpose));
          }
        }
      }
    }

    if (!botToken) {
      const activeBot = await getActiveBot(requestedPurpose);
      if (!activeBot) {
        return apiError(res, 400, getPurposeMissingMessage(requestedPurpose));
      }
      botToken = activeBot.bot_token_encrypted;
      botUsername = activeBot.bot_username;
      activeBotId = activeBot.id;
      targetChatId = targetChatId || (normalizeBotPurpose(requestedPurpose) === 'report_group' ? getBotGroupChatId(activeBot) : activeBot.default_chat_id);
    }

    if (!targetChatId) {
      return apiError(
        res,
        400,
        normalizeBotPurpose(requestedPurpose) === 'report_group'
          ? 'Default Group Chat ID is required for Report Group notifications.'
          : 'Missing required target Telegram Chat ID'
      );
    }

    if (!botToken || isProtectedSecretValue(botToken)) {
      return apiError(res, 400, getPurposeMissingMessage(requestedPurpose));
    }

    // bilingual test message
    const msg = customMessage || `🧪 <b>សាកល្បងតេឡេក្រាមរំលឹក / Telegram Reminder Connection Test</b>\n\nសហគ្រាសរបស់អ្នកបានបំពេញការភ្ជាប់ប្រព័ន្ធជូនដំណឹងជាស្វ័យប្រវត្តិនៃមជ្ឈមណ្ឌលមាត្រាសាស្ត្រជាតិដោយជោគជ័យ។\nYour enterprise has successfully verified reminders connection to the National Metrology Center system.`;

    await sendTelegramMessage(botToken, String(targetChatId), msg);

    let updatedBotForClient: any = null;
    if (supabaseAdmin && activeBotId && activeBotId !== 'env-fallback') {
      const statusUpdate = {
        connection_status: 'connected',
        last_test_status: 'Success',
        last_test_message: normalizeBotPurpose(requestedPurpose) === 'report_group'
          ? 'Telegram group sendMessage verified successfully.'
          : 'Telegram test message sent successfully.',
        last_error: null,
        last_tested_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      await supabaseAdmin
        .from('telegram_bot_settings')
        .update(statusUpdate)
        .eq('id', activeBotId);
      updatedBotForClient = sanitizeBotForClient({ id: activeBotId, bot_username: botUsername, ...statusUpdate });
    }

    if (supabaseAdmin && licenseId) {
      // Save reminder log to DB
      await supabaseAdmin.from('license_reminder_logs').insert({
        license_id: licenseId,
        telegram_bot_setting_id: activeBotId !== 'env-fallback' ? activeBotId : null,
        reminder_type: 'TEST',
        reminder_days: 0,
        telegram_chat_id: String(targetChatId),
        message_text: msg,
        send_status: 'Sent',
        sent_at: new Date().toISOString(),
        created_at: new Date().toISOString()
      });

      // Write Audit Log
      try {
        await supabaseAdmin.from('audit_logs').insert({
          actor_email: 'manual_test',
          actor_role: 'system',
          action_type: 'TEST_REMINDER_SENT',
          details: `Sent test reminder to Telegram Chat ID ${targetChatId} using bot ${botUsername}`,
          created_at: new Date().toISOString()
        });
      } catch {}
    }

    return apiSuccess(res, { status: 'success', message: 'Test message sent successfully!', bot: updatedBotForClient });
  } catch (err: any) {
    const safeMessage = sanitizeTelegramError(err?.message || 'Test reminder dispatch failed');
    console.error('Failed to send test reminder:', safeMessage);
    const botId = req.body?.botId || req.body?.bot_id || null;
    if (supabaseAdmin && botId && isUuid(botId)) {
      await supabaseAdmin
        .from('telegram_bot_settings')
        .update({
          connection_status: 'error',
          last_test_status: 'Failed',
          last_test_message: 'Telegram sendMessage failed.',
          last_error: safeMessage,
          last_tested_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', botId);
    }
    return apiError(res, 500, safeMessage);
  }
});

app.use('/api', (req, res) => {
  return apiError(res, 404, `API route not found: ${req.method} ${req.originalUrl}`);
});

app.use((err: any, req: any, res: any, next: any) => {
  if (req.path?.startsWith('/api')) {
    return apiError(res, 500, err?.message || 'Internal API error');
  }
  return next(err);
});

// ==========================================
// VITE OR STATIC SERVING MIDDLEWARE
// ==========================================

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req: any, res: any) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[SYS-SERVER] National Metrology Center backend is active on host 0.0.0.0:${PORT}`);
  });
}

if (!process.env.VERCEL) {
  startServer();
}

export default app;

import express from 'express';
import path from 'path';
import crypto from 'crypto';
import dotenv from 'dotenv';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { createMysqlClient } from './src/db/mysqlClient';
import { createPasswordLoginHandler } from './src/auth/passwordLogin';
import { legacyCompanyEmail, migrateMissingCompanyAuth } from './src/auth/legacyCompanyLogin';
import { createIssuedExport, IssuedExportError } from './src/reports/issuedExports';
import { issueReportArtifact, lookupIssuance, verificationPage } from './src/reports/issuance';
import { sealDocx, sealPdf, sealXlsx } from './src/reports/sealArtifacts';
import { normalizeSubmissionLocation } from './src/annex8/submissionLocation';
import { notifyAnnex8Submission } from './src/annex8/submissionNotification';
import { LifecycleStore } from './src/ml/lifecycle';
import { collectDataset, trainingReadiness } from './src/ml/dataset';
import { AuditExportError, collectAuditData, createMlAuditExport, auditFiltersFromUrl } from './src/ml/auditService';
// Annex 8 rules live in one isomorphic module so the server validates with the
// same code the form uses, rather than a second copy that drifts out of step.
import { validateAnnex8, blockingIssues, warningIssues, hostPart } from './src/annex8/validation';
import { computeSummary, deadlineFor, isOnTime } from './src/annex8/summary';
import { reportingPeriod, toKhmerDigits } from './src/lib/consolidated/periods';
import type { PeriodType } from './src/lib/consolidated/periods';
import { formatConsolidatedAggregate } from './src/lib/consolidated/aggregateResult';
import { actionWindow, draftRecordedActions, draftReviewOutcomes, draftSentReminders, groupActionEvents } from './src/lib/consolidated/officerDrafts';
import { analyzeConsolidatedData } from './src/lib/consolidated/automaticReport';
import { draftActionsWithAi, draftConsolidatedWithAi } from './src/consolidated/aiDrafter';
// NMC's own summary over the submissions. Deliberately separate from the
// official annex: this one has a layout built in code, that one never does.
import {
  buildStaffReportDocx, buildStaffReportXlsx, collectOverview, staffReportFileName,
} from './src/annex8/staffReport';
// The Smart Analytics report. Decision support only: nothing here triggers a
// sanction, a warning or a licence action.
import { collectAnalyticsSource, anomalyKey } from './src/analytics/aggregate';
import { aiAnalystEnabled, narrativeStillGrounded } from './src/analytics/aiAnalyst';
import { latestJob, latestNarrative, liveJob, requestNarrative } from './src/analytics/narrativeQueue';
import { runOneNarrativeJob } from './src/analytics/narrativeWorker';
import { forClient, readAiSettings, recordAiTest, resolveAiConfig, saveAiSettings } from './src/analytics/aiSettings';
import { buildAnalyticsData } from './src/lib/analytics/buildAnalyticsData';
import type { AnalyticsSource } from './src/lib/analytics/buildAnalyticsData';
import {
  REVIEW_STATUSES as ANALYTICS_REVIEW_STATUSES,
  dataProblems as analyticsDataProblems,
} from './src/lib/analytics/contract';
import { DEADLINE_DAY, FORMAT_VERSION } from './src/annex8/constants';
import {
  ENTRY_CONFIG, ENTRY_PARTS, EntryPart, auditEntityFor, duplicateValues,
  isEditableStatus, isEntryPart, monthClosedError, periodForEntry, pickEntryColumns,
  stateFromMonth,
} from './src/annex8/entries';
import {
  buildMonthlyDigest, digestFileName, normalizeLegacyPeriod, previousPeriod,
  renderDigestCaption, renderDigestHtml, renderDigestMessages,
} from './src/annex8/monthlyDigest';
import type { Annex8State } from './src/annex8/types';
import {
  Annex8TemplateMissingError, DEFAULT_TEMPLATE_VERSION, OFFICIAL_BUCKET, STORAGE_DRIVER,
  convertDocxToPdf, convertHtmlToPdf,
  getOfficialDocument, loadAnnex8RenderInput, officialAssetsStatus, officialFileName,
  putOfficialDocument, renderAndStoreOfficialDocuments, renderOfficialDocx,
} from './src/annex8/officialDocument';

// Load environment variables
dotenv.config();

const app = express();
const PORT = Number(process.env.PORT || 3000);

// Body parsing middleware
app.use('/api/report-issuance/export', express.json({ limit: '2mb' }));
app.use(express.json());
app.use((err: any, req: any, res: any, next: any) => {
  if (err?.type === 'entity.too.large') return res.status(413).json({ error: 'Report request is too large. Export a smaller selection.' });
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
const isProduction = process.env.NODE_ENV === 'production' || process.env.VERCEL === '1';
const allowLegacyHeaderAuth =
  !isProduction && process.env.ALLOW_LEGACY_API_HEADER_AUTH === 'true';

/**
 * Which database this server talks to.
 *
 *   DB_DRIVER=supabase   (default) hosted PostgreSQL through supabase-js
 *   DB_DRIVER=mysql      MySQL via MYSQL_URL, through src/db/mysqlClient
 *
 * Both speak the same query-builder dialect, so nothing below this line
 * knows or cares which one is in use. See src/db/mysqlClient.ts for what
 * differs underneath, and docs/database-portability.md for the move.
 */
const DB_DRIVER = (process.env.DB_DRIVER || 'supabase').toLowerCase();
const mysqlUrl = process.env.MYSQL_URL || '';

// The MySQL client is cast to the Supabase client's type because it is a
// deliberate stand-in for it: it answers the same calls with the same shapes,
// so every call site below keeps the typing it already had.
const supabaseAdmin = DB_DRIVER === 'mysql'
  ? (mysqlUrl ? (createMysqlClient(mysqlUrl) as unknown as SupabaseClient) : null)
  : (hasSupabaseUrl && hasServiceKey)
    ? createClient(supabaseUrl, supabaseServiceRoleKey, {
        auth: {
          persistSession: false,
          autoRefreshToken: false
        }
      })
    : null;

if (DB_DRIVER === 'mysql' && !mysqlUrl) {
  console.warn('[db] DB_DRIVER=mysql but MYSQL_URL is not set — the API will answer 503.');
}

async function resolveApiUser(req: any): Promise<{ role: string; userRow: any | null } | null> {
  if (!supabaseAdmin) {
    /**
     * Local/demo mode has no server-side auth provider, so it runs open.
     *
     * Production must never take that path. The condition is only "no admin
     * client", which a missing SUPABASE_SERVICE_ROLE_KEY also satisfies — so
     * a deployment with one environment variable unset would have treated
     * every caller as a superadmin. Refusing is the only safe answer when
     * the server cannot tell who is asking.
     */
    if (isProduction) return null;
    return { role: 'superadmin', userRow: null };
  }

  const authHeader = req.headers.authorization || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!token) {
    if (allowLegacyHeaderAuth) {
      const headerUserId = String(req.headers['x-nmc-user-id'] || '').trim();
      const headerUsername = String(req.headers['x-nmc-username'] || '').trim().toLowerCase();
      const headerRole = String(req.headers['x-nmc-user-role'] || '').trim();

      if (headerUserId && headerUsername && headerRole) {
        const { data: publicUser, error: publicUserError } = await supabaseAdmin
          .from('users')
          .select('*')
          .eq('id', headerUserId)
          .maybeSingle();

        const publicUserValid =
          !publicUserError &&
          publicUser &&
          String(publicUser.username || '').toLowerCase() === headerUsername &&
          String(publicUser.role || '') === headerRole &&
          publicUser.is_active !== false;

        if (publicUserValid) {
          return { role: String(publicUser.role || ''), userRow: publicUser };
        }
      }
    }

    return null;
  }

  const { data: authData, error: authError } = await supabaseAdmin.auth.getUser(token);
  if (authError || !authData.user) {
    return null;
  }

  const userId = authData.user.id;
  let role: string | null = null;
  let isActive = true;
  let userRow: any | null = null;

  const registryId = String(authData.user.app_metadata?.mlrs_user_id || userId);
  const { data: userProfile } = await supabaseAdmin
    .from('users')
    .select('*')
    .eq('id', registryId)
    .maybeSingle();
  if (authData.user.app_metadata?.mlrs_user_id && !userProfile) return null;

  if (userProfile) {
    role = userProfile.role;
    isActive = userProfile.is_active !== false;
    userRow = userProfile;
  } else {
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('role,is_active')
      .eq('id', userId)
      .maybeSingle();
    role = profile?.role || null;
    isActive = profile?.is_active !== false;
  }

  if (!role) {
    // The Supabase Auth account id may differ from the users-table row id when the
    // auth account was auto-provisioned later. Fall back to matching by email.
    const authEmail = String(authData.user.email || '').trim();
    if (authEmail) {
      const { data: emailMatches } = await supabaseAdmin
        .from('users')
        .select('*')
        .ilike('email', authEmail);
      const matched = (emailMatches || []).find((u: any) => u.is_active !== false);
      if (matched) {
        role = matched.role;
        isActive = matched.is_active !== false;
        userRow = matched;
      }
    }
  }

  if (!role) {
    // Accounts provisioned from legacy users-table credentials may use a normalized
    // Auth email while the source user row has an empty or invalid email. In that
    // case, resolve through the trusted username stored in Auth metadata.
    const authUsername = String(
      authData.user.user_metadata?.username ||
      authData.user.app_metadata?.username ||
      ''
    ).trim().toLowerCase();
    if (authUsername) {
      const { data: usernameMatches } = await supabaseAdmin
        .from('users')
        .select('*')
        .ilike('username', authUsername);
      const matched = (usernameMatches || []).find(
        (u: any) => String(u.username || '').toLowerCase() === authUsername && u.is_active !== false
      );
      if (matched) {
        role = matched.role;
        isActive = matched.is_active !== false;
        userRow = matched;
      }
    }
  }

  if (!isActive || !role) return null;
  return { role: String(role), userRow };
}

async function resolveApiRole(req: any): Promise<string | null> {
  const resolved = await resolveApiUser(req);
  return resolved ? resolved.role : null;
}

async function requireApiRole(req: any, res: any, allowedRoles: string[]): Promise<boolean> {
  const role = await resolveApiRole(req);
  if (!role) {
    res.status(401).json({ error: 'Authentication required.' });
    return false;
  }
  if (!allowedRoles.includes(role)) {
    res.status(403).json({ error: 'Insufficient permission for this Telegram action.' });
    return false;
  }
  return true;
}

function verifyUserPasswordServer(password: string, userRow: any): boolean {
  const storedHash = userRow?.password_hash;
  if (typeof storedHash === 'string' && storedHash.startsWith('pbkdf2_sha256$')) {
    const parts = storedHash.split('$');
    if (parts.length !== 4) return false;
    const iterations = Number(parts[1]);
    if (!Number.isFinite(iterations) || iterations < 1) return false;
    try {
      const salt = Buffer.from(parts[2], 'base64');
      const expected = Buffer.from(parts[3], 'base64');
      const actual = crypto.pbkdf2Sync(password, salt, iterations, expected.length, 'sha256');
      return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
    } catch {
      return false;
    }
  }

  // Transition compatibility: legacy records may still have plaintext passwords.
  return typeof userRow?.password === 'string' && userRow.password.length > 0 && userRow.password === password;
}

/**
 * Send Message to Telegram API
 */
async function sendTelegramMessage(botToken: string, chatId: string, text: string, timeoutMs?: number) {
  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
  const response = await fetch(url, {
    method: 'POST',
    ...(timeoutMs ? { signal: AbortSignal.timeout(timeoutMs) } : {}),
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

/**
 * Send a file to Telegram (sendDocument, multipart).
 *
 * The caption is limited to 1024 characters, not the 4096 a message allows, so
 * callers must shorten it themselves rather than have Telegram reject the whole
 * upload.
 */
async function sendTelegramDocument(
  botToken: string,
  chatId: string,
  file: { name: string; type: string; body: Buffer },
  caption?: string,
) {
  const form = new FormData();
  form.append('chat_id', chatId);
  form.append('document', new Blob([new Uint8Array(file.body)], { type: file.type }), file.name);
  if (caption) {
    form.append('caption', caption);
    form.append('parse_mode', 'HTML');
  }

  const response = await fetch(`https://api.telegram.org/bot${botToken}/sendDocument`, {
    method: 'POST',
    body: form as any,
  });
  const body = await readResponseBodySafely(response);
  if (!response.ok || body?.ok === false) {
    const description = body?.description || body?.raw || `HTTP ${response.status}`;
    throw new Error(`Telegram sendDocument API error: ${sanitizeTelegramError(description, botToken)}`);
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

function isTelegramBotSchemaError(err: any) {
  const text = `${err?.code || ''} ${err?.message || ''} ${err?.details || ''} ${err?.hint || ''}`.toLowerCase();
  return text.includes('pgrst204') ||
    (text.includes('telegram_bot_settings') && (
      text.includes('schema cache') ||
      text.includes('default_group_chat_id') ||
      text.includes('bot_display_name') ||
      text.includes('connection_status') ||
      text.includes('last_test_message') ||
      text.includes('last_tested_at') ||
      text.includes('webhook_status') ||
      text.includes('webhook_url') ||
      text.includes('last_webhook_setup_at') ||
      text.includes('is_active') ||
      text.includes('bot_purpose') ||
      text.includes('bot_description')
    ));
}

function isTelegramBotPurposeConstraintError(err: any) {
  const text = `${err?.code || ''} ${err?.message || ''} ${err?.details || ''} ${err?.hint || ''}`.toLowerCase();
  return text.includes('23514') && text.includes('bot_purpose');
}

function telegramBotSchemaError(res: any) {
  return apiError(
    res,
    400,
    'Telegram bot settings schema is missing required columns. Please run supabase_telegram_bot_settings_schema_compatibility.sql in Supabase SQL Editor and refresh the schema cache.'
  );
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
    bot_description: input.bot_description || input.description || null,
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

function getLegacyTelegramBotPayload(payload: any) {
  const legacy = { ...payload };
  [
    'default_group_chat_id',
    'webhook_url',
    'last_webhook_setup_at',
    'webhook_secret_encrypted',
    'webhook_status',
    'bot_display_name',
    'bot_description',
    'connection_status',
    'last_test_status',
    'last_test_message',
    'last_error',
    'last_tested_at'
  ].forEach(field => delete legacy[field]);
  return legacy;
}

async function saveTelegramBotPayload(payload: any) {
  const runSave = async (body: any) => {
    const query = body.id
      ? supabaseAdmin.from('telegram_bot_settings').upsert(body, { onConflict: 'id' })
      : supabaseAdmin.from('telegram_bot_settings').insert(body);
    return query.select('*').maybeSingle();
  };

  const result = await runSave(payload);
  if (!result.error) return result;
  if (isTelegramBotPurposeConstraintError(result.error) && payload.bot_purpose === 'both') {
    console.warn('Retrying Telegram Bot save with legacy bot_purpose value:', result.error?.message || result.error);
    return runSave({ ...getLegacyTelegramBotPayload(payload), bot_purpose: 'report_group' });
  }
  if (!isTelegramBotSchemaError(result.error)) return result;

  console.warn('Retrying Telegram Bot save with legacy-compatible columns:', result.error?.message || result.error);
  const legacyResult = await runSave(getLegacyTelegramBotPayload(payload));
  if (isTelegramBotPurposeConstraintError(legacyResult.error) && payload.bot_purpose === 'both') {
    console.warn('Retrying legacy Telegram Bot save with report_group purpose:', legacyResult.error?.message || legacyResult.error);
    return runSave({ ...getLegacyTelegramBotPayload(payload), bot_purpose: 'report_group' });
  }
  return legacyResult;
}

function getDefaultWebhookUrl(req: any) {
  const forwardedProto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim();
  const protocol = forwardedProto || (req.secure ? 'https' : 'https');
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim();
  if (!host) return 'https://metrologyreport.vercel.app/api/telegram-webhook';
  return `${protocol}://${host}/api/telegram-webhook`;
}

function isSafeTelegramWebhookUrl(value: string, req: any) {
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== 'https:') return false;
    if (/^(localhost|127\.0\.0\.1|\[::1\])$/i.test(parsed.hostname)) return false;
    const expected = new URL(getDefaultWebhookUrl(req));
    return parsed.hostname === expected.hostname && parsed.pathname === '/api/telegram-webhook';
  } catch {
    return false;
  }
}

function isValidTelegramChatId(value: unknown) {
  return /^-?\d{5,20}$/.test(String(value || '').trim());
}

async function configureTelegramWebhook(bot: any, webhookUrl: string) {
  const botToken = bot?.bot_token_encrypted;
  if (!botToken || isProtectedSecretValue(botToken) || botToken === 'env-fallback') {
    throw new Error('Cannot set webhook without a valid, real Telegram Bot Token.');
  }

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

  if (supabaseAdmin && bot?.id && bot.id !== 'env-fallback') {
    const metadataUpdate = {
      webhook_url: webhookUrl,
      webhook_status: 'configured',
      last_webhook_setup_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    const { error: updateErr } = await supabaseAdmin
      .from('telegram_bot_settings')
      .update(metadataUpdate)
      .eq('id', bot.id);

    if (updateErr && !isTelegramBotSchemaError(updateErr)) {
      throw updateErr;
    }
    if (updateErr) {
      console.warn('Telegram webhook configured, but metadata update skipped for legacy schema:', updateErr?.message || updateErr);
    }
  }

  return body;
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
    if (!error && normalizeBotPurpose(purpose) === 'license_reminder') {
      const fallback = await supabaseAdmin
        .from('telegram_bot_settings')
        .select('*')
        .eq('is_active', true)
        .not('bot_token_encrypted', 'is', null)
        .not('bot_username', 'is', null)
        .limit(10);
      if (!fallback.error && fallback.data && fallback.data.length > 0) {
        const usableFallback = fallback.data.find((bot: any) =>
          String(bot.bot_token_encrypted || '').trim() &&
          !isProtectedSecretValue(bot.bot_token_encrypted) &&
          String(bot.bot_username || '').trim()
        );
        if (usableFallback) return usableFallback;
      }
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

async function sealServerReport(bytes: Buffer, details: import('./src/reports/issuance').IssuanceDetails) {
  if (process.env.REPORT_QR_ENABLED !== 'true') return bytes;
  const result = await issueReportArtifact(supabaseAdmin, details, seal => {
    if (details.format === 'docx') return sealDocx(bytes, seal);
    if (details.format === 'pdf') return sealPdf(bytes, seal);
    if (details.format === 'xlsx') return sealXlsx(bytes, seal);
    throw new Error('Unsupported issued report format.');
  });
  return result.bytes;
}

app.get('/api/report-issuance/check/:token', (req, res) => {
  const nonce = crypto.randomBytes(18).toString('base64');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Security-Policy', `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'`);
  res.type('html').send(verificationPage(req.params.token, nonce));
});

app.get('/api/report-issuance/verify/:token', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Referrer-Policy', 'no-referrer');
  if (!supabaseAdmin) return res.status(503).json({ error: 'Verification unavailable.' });
  try {
    const digest = req.query.sha256 === undefined ? undefined : String(req.query.sha256);
    const result = await lookupIssuance(supabaseAdmin, req.params.token, digest);
    return res.status(result.status).json(result.body);
  } catch { return res.status(503).json({ error: 'Verification unavailable.' }); }
});

app.post('/api/report-issuance/export', async (req, res) => {
  const access = await requireRegistryAccess(req, res);
  if (!access) return;
  res.setHeader('Cache-Control', 'no-store');
  if (process.env.REPORT_QR_ENABLED !== 'true') return res.status(503).json({ error: 'Report QR issuance is not enabled. Complete the approved database setup first.' });
  try {
    const result = await createIssuedExport(supabaseAdmin, String(access.userRow?.id || ''), ownLicenceNumbers(access), req.body);
    const mime: Record<string, string> = { docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', pdf: 'application/pdf', html: 'text/html; charset=utf-8',
      pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' };
    res.setHeader('Content-Type', mime[req.body.format]);
    res.setHeader('X-NMC-Issuance-ID', result.seal.id);
    res.setHeader('Content-Disposition', `attachment; filename="NMC-${result.seal.id}.${req.body.format}"`);
    return res.end(result.bytes);
  } catch (error: any) {
    return res.status(error instanceof IssuedExportError ? error.status : 503).json({ error: error?.message || 'Report issuance failed.' });
  }
});

app.post('/api/login', createPasswordLoginHandler({
  db: DB_DRIVER === 'supabase' ? supabaseAdmin : null,
  // A separate client per attempt: never put a user's session on the shared
  // service-role client used by every API request.
  signIn: (email, password) => createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  }).auth.signInWithPassword({ email, password }),
  publicUser: publicUserRow,
  verifyLegacyPassword: verifyUserPasswordServer,
  companyAlias: legacyCompanyEmail,
  migrateCompany: (user, password) => migrateMissingCompanyAuth(user, password, {
    listUsers: page => supabaseAdmin.auth.admin.listUsers({ page, perPage: 1000 }),
    createUser: attributes => supabaseAdmin.auth.admin.createUser(attributes),
    signIn: (email, suppliedPassword) => createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    }).auth.signInWithPassword({ email, password: suppliedPassword }),
  }),
}));

app.post('/api/provision-auth-session', async (req, res) => {
  // Older clients must not use legacy hashes to overwrite an existing Auth password.
  res.setHeader('Cache-Control', 'no-store');
  return res.status(410).json({ success: false, code: 'USE_PASSWORD_LOGIN' });
});

const REPORT_UPSERT_COLUMNS = [
  'id', 'user_id', 'license_number', 'company_name_kh', 'customer_name', 'customer_address',
  'measuring_instrument', 'instrument_serial_number', 'scope_of_weight_measure',
  'spare_parts', 'spare_part_serial_number', 'service_type', 'service_start_date',
  'service_end_date', 'report_month', 'report_year', 'report_status', 'rejection_reason',
  'approved_by', 'approved_at', 'verification_token_hash', 'created_at', 'updated_at'
];

async function signalMlChange() {
  if (process.env.ML_LIFECYCLE_ENABLED !== 'true' || !supabaseAdmin) return;
  try { await new LifecycleStore(supabaseAdmin).signal(); }
  catch { console.warn('ML change signal unavailable; background reconciliation will retry.'); }
}

app.get('/api/analytics/ml-insights', async (req, res) => {
  const resolved = await requireNmcStaff(req, res);
  if (!resolved) return;
  res.setHeader('Cache-Control', 'no-store');
  try {
    const filters = auditFiltersFromUrl(req.originalUrl || req.url);
    const data = await collectAuditData(supabaseAdmin, filters);
    return res.json({ executive_briefing: data.executive_briefing, filters, generated_at: data.generatedAt,
      model_version: data.modelVersion, source_fingerprint: data.sourceFingerprint });
  } catch (error) {
    if (error instanceof AuditExportError) return apiError(res, error.status, error.message);
    return apiError(res, 503, 'ML briefing evidence is unavailable. Check the database and model configuration.');
  }
});

for (const format of ['pdf', 'excel'] as const) {
  app.get(`/api/analytics/export/${format}`, async (req, res) => {
    const resolved = await requireNmcStaff(req, res);
    if (!resolved) return;
    try {
      const filters = auditFiltersFromUrl(req.originalUrl || req.url);
      const file = await createMlAuditExport(supabaseAdmin, filters, format === 'pdf' ? 'pdf' : 'xlsx',
        String(resolved.userRow?.id || 'nmc-staff'));
      const extension = format === 'pdf' ? 'pdf' : 'xlsx';
      const filename = `Metrology_ML_Audit_${format === 'pdf' ? 'Report' : 'Data'}_${new Date().toISOString().slice(0, 10)}.${extension}`;
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('Content-Type', format === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('X-NMC-Issuance-ID', file.seal.id);
      return res.send(file.bytes);
    } catch (error) {
      if (error instanceof AuditExportError) return apiError(res, error.status, error.message);
      console.error('ML audit export failed:', error instanceof Error ? error.message : 'Unknown error');
      return apiError(res, 503, 'Unable to generate the registered audit report. Check database, model and issuance configuration.');
    }
  });
}

app.get('/api/analytics/model-health', async (req, res) => {
  if (!(await requireApiRole(req, res, ['superadmin', 'admin']))) return;
  res.setHeader('Cache-Control', 'no-store');
  const threshold = Number(process.env.ML_RETRAIN_REPORT_THRESHOLD || 25);
  const empty = { lastTrainedAt: null, trainedReportCount: 0, pendingReports: 0, threshold,
    lastError: null, metrics: { f1: null, accuracy: null, silhouette: null, anomalyStability: null, labelSource: null } };
  if (process.env.ML_LIFECYCLE_ENABLED !== 'true') return res.json({ ...empty, enabled: false, status: 'cold_start' });
  try {
    const { state } = await new LifecycleStore(supabaseAdmin).read();
    const dataset = await collectDataset(supabaseAdmin);
    const readiness = trainingReadiness(dataset.samples);
    const known = new Set(state.active?.reportIds || []);
    const activeModel = state.active ? { id: state.active.id, model: state.active.model,
      trainedAt: state.active.trainedAt, trainedReportCount: state.active.trainedReportCount,
      metrics: state.active.metrics, inferenceFeatures: dataset.inferenceFeatures } : undefined;
    return res.json({ ...empty, enabled: true,
      trainingReady: readiness.ready, readinessMessage: readiness.message,
      verifiedEnterprises: readiness.enterprises, minimumEnterprises: readiness.minimumEnterprises,
      status: !readiness.ready ? (state.active ? 'active' : 'cold_start')
        : state.lock && state.lock.until > Date.now() ? 'training' : state.manual ? 'queued'
        : state.lastError ? 'failed' : state.active ? 'active' : 'cold_start',
      lastTrainedAt: state.active?.trainedAt || null, trainedReportCount: state.active?.trainedReportCount || 0,
      pendingReports: dataset.reportIds.filter(id => !known.has(id)).length,
      metrics: state.active?.metrics || empty.metrics, lastError: state.lastError || null, activeModel,
      workerOnline: !!state.workerSeenAt && Date.now() - state.workerSeenAt < 180000,
      workerLastSeenAt: state.workerSeenAt ? new Date(state.workerSeenAt).toISOString() : null,
      lastOutcome: state.lastOutcome || null });
  } catch { return apiError(res, 503, 'ML storage unavailable. Apply migration and check the background worker.'); }
});
app.post('/api/analytics/retrain', async (req, res) => {
  if (!(await requireApiRole(req, res, ['superadmin', 'admin']))) return;
  if (process.env.ML_LIFECYCLE_ENABLED !== 'true') return apiError(res, 503, 'ML lifecycle is disabled.');
  try {
    await new LifecycleStore(supabaseAdmin).signal(true);
    return res.status(202).json({ status: 'queued' });
  } catch { return apiError(res, 503, 'Unable to queue training. Check ML storage.'); }
});
app.post('/api/analytics/rollback', async (req, res) => {
  if (!(await requireApiRole(req, res, ['superadmin', 'admin']))) return;
  if (process.env.ML_LIFECYCLE_ENABLED !== 'true') return apiError(res, 503, 'ML lifecycle is disabled.');
  try {
    const swapped = await new LifecycleStore(supabaseAdmin).mutate(s =>
      !s.previous || (s.lock && s.lock.until > Date.now()) ? null : {
        ...s, active: s.previous, previous: s.active, lastOutcome: 'rolled_back', lastError: undefined,
      });
    return swapped ? res.json({ status: 'rolled_back' }) : apiError(res, 409, 'No previous model, or training is in progress.');
  } catch { return apiError(res, 503, 'Unable to roll back the model.'); }
});

app.post('/api/reports', async (req, res) => {
  try {
    if (!supabaseAdmin) {
      return apiError(res, 503, 'Server database provider is not configured.');
    }
    if (!(await requireApiRole(req, res, ['superadmin', 'admin', 'company']))) return;

    const report = req.body?.report;
    if (!report || typeof report !== 'object' || !String(report.id || '').trim()) {
      return apiError(res, 400, 'A report payload with an id is required.');
    }

    const payload: Record<string, any> = {};
    for (const column of REPORT_UPSERT_COLUMNS) {
      if (column in report) payload[column] = report[column];
    }

    // The live reports table may predate newer schema columns (e.g. report_status,
    // verification_token_hash). Strip any column PostgREST reports as unknown and
    // retry so saves keep working until the schema migration is applied.
    let lastError: any = null;
    for (let attempt = 0; attempt <= REPORT_UPSERT_COLUMNS.length; attempt++) {
      const { error } = await supabaseAdmin
        .from('reports')
        .upsert(payload, { onConflict: 'id' });
      if (!error) {
        await signalMlChange();
        return apiSuccess(res, { id: payload.id });
      }
      lastError = error;
      const missingColumn = /Could not find the '([^']+)' column/.exec(String(error.message || ''));
      if (missingColumn && missingColumn[1] !== 'id' && missingColumn[1] in payload) {
        console.warn(`Live reports table is missing column '${missingColumn[1]}'; retrying without it. Run supabase_reports_schema_compatibility.sql to fix permanently.`);
        delete payload[missingColumn[1]];
        continue;
      }
      break;
    }

    console.error('Server report upsert failed:', lastError?.message || lastError);
    return apiError(res, 500, 'Failed to save the report to the database.');
  } catch (err: any) {
    console.error('Server report save exception:', err?.message || err);
    return apiError(res, 500, 'Failed to save the report to the database.');
  }
});

app.get('/api/reports', async (req, res) => {
  try {
    if (!supabaseAdmin) {
      return apiError(res, 503, 'Server database provider is not configured.');
    }

    const resolved = await resolveApiUser(req);
    if (!resolved) {
      return res.status(401).json({ error: 'Authentication required.' });
    }
    const { role, userRow } = resolved;
    if (!['superadmin', 'admin', 'company'].includes(role)) {
      return res.status(403).json({ error: 'Insufficient permission.' });
    }

    if (role === 'company') {
      // Company users only receive their own reports. Run separate equality queries
      // (values like company names can contain characters that break or() filters).
      if (!userRow) {
        return apiSuccess(res, { reports: [] });
      }
      const byId = new Map<string, any>();
      const filters: Array<[string, string]> = [];
      if (userRow.id) filters.push(['user_id', String(userRow.id)]);
      if (userRow.license_number) filters.push(['license_number', String(userRow.license_number)]);
      if (userRow.company_name_kh) filters.push(['company_name_kh', String(userRow.company_name_kh)]);
      for (const [column, value] of filters) {
        const { data, error } = await supabaseAdmin
          .from('reports')
          .select('*')
          .eq(column, value)
          .order('created_at', { ascending: false })
          .limit(2000);
        if (error) {
          console.error(`Server company reports fetch failed on ${column}:`, error.message || error);
          continue;
        }
        (data || []).forEach((row: any) => byId.set(String(row.id), row));
      }
      return apiSuccess(res, { reports: Array.from(byId.values()) });
    }

    const allReports: any[] = [];
    const pageSize = 1000;
    for (let page = 0; page < 50; page++) {
      const from = page * pageSize;
      const { data, error } = await supabaseAdmin
        .from('reports')
        .select('*')
        .order('created_at', { ascending: false })
        .range(from, from + pageSize - 1);
      if (error) {
        console.error('Server reports fetch failed:', error.message || error);
        return apiError(res, 500, 'Failed to load reports from the database.');
      }
      allReports.push(...(data || []));
      if (!data || data.length < pageSize) break;
    }
    return apiSuccess(res, { reports: allReports });
  } catch (err: any) {
    console.error('Server reports fetch exception:', err?.message || err);
    return apiError(res, 500, 'Failed to load reports from the database.');
  }
});

app.delete('/api/reports', async (req, res) => {
  try {
    if (!supabaseAdmin) {
      return apiError(res, 503, 'Server database provider is not configured.');
    }

    const resolved = await resolveApiUser(req);
    if (!resolved) {
      return res.status(401).json({ error: 'Authentication required.' });
    }
    const { role, userRow } = resolved;
    if (!['superadmin', 'admin', 'company'].includes(role)) {
      return res.status(403).json({ error: 'Insufficient permission.' });
    }

    const reportId = String(req.query?.id || '').trim();
    if (!reportId) {
      return apiError(res, 400, 'Report id is required.');
    }

    if (role === 'company') {
      if (!userRow) {
        return res.status(403).json({ error: 'Report ownership could not be verified.' });
      }
      const { data: report, error: lookupError } = await supabaseAdmin
        .from('reports')
        .select('id,user_id,license_number,company_name_kh')
        .eq('id', reportId)
        .maybeSingle();
      if (lookupError) {
        console.error('Server report ownership lookup failed:', lookupError.message || lookupError);
        return apiError(res, 500, 'Failed to verify report ownership.');
      }
      if (!report) {
        return apiSuccess(res, { id: reportId });
      }
      const ownsReport =
        (!!userRow.id && String(report.user_id || '') === String(userRow.id)) ||
        (!!userRow.license_number && String(report.license_number || '') === String(userRow.license_number)) ||
        (!!userRow.company_name_kh && String(report.company_name_kh || '') === String(userRow.company_name_kh));
      if (!ownsReport) {
        return res.status(403).json({ error: 'You can only delete reports belonging to your company.' });
      }
    }

    const { error } = await supabaseAdmin
      .from('reports')
      .delete()
      .eq('id', reportId);
    if (error) {
      console.error('Server report delete failed:', error.message || error);
      return apiError(res, 500, 'Failed to delete the report from the database.');
    }

    return apiSuccess(res, { id: reportId });
  } catch (err: any) {
    console.error('Server report delete exception:', err?.message || err);
    return apiError(res, 500, 'Failed to delete the report from the database.');
  }
});

// Public endpoint backing the QR / Telegram verification links. Anonymous visitors
// (e.g. on a phone) have no Supabase session, so the lookup runs with the service
// role here instead of relying on client-side RLS access.
app.get('/api/verify-report', async (req, res) => {
  try {
    if (!supabaseAdmin) {
      return apiError(res, 503, 'Server database provider is not configured.');
    }

    const token = String(req.query?.token || '').trim();
    if (!token) {
      return apiError(res, 400, 'Verification token is required.');
    }

    const tokenHash = crypto.createHash('sha256').update(token, 'utf8').digest('hex');
    const { data: byHash } = await supabaseAdmin
      .from('reports')
      .select('*')
      .eq('verification_token_hash', tokenHash)
      .limit(1);
    let report = byHash && byHash.length > 0 ? byHash[0] : null;

    if (!report) {
      const { data: byId } = await supabaseAdmin
        .from('reports')
        .select('*')
        .eq('id', token)
        .limit(1);
      report = byId && byId.length > 0 ? byId[0] : null;
    }

    if (!report) {
      return apiError(res, 404, 'Report not found.');
    }

    return apiSuccess(res, { report });
  } catch (err: any) {
    console.error('Public report verification failed:', err?.message || err);
    return apiError(res, 500, 'Report verification failed.');
  }
});

// Public endpoint for license-certificate QR scans. Read with the service role so
// anonymous phones are not blocked by RLS, then return only certificate-safe data.
/* ====================================================================
 *  LICENSING REGISTRY API
 *
 *  These endpoints exist so the browser never talks to the database
 *  directly. Before this, the frontend reached enterprise_licenses,
 *  enterprise_license_attachments, license_reminder_logs,
 *  license_renewal_history and login_history through supabase-js with
 *  the anon key, under RLS policies of `FOR ALL USING (true)` — which
 *  put no real limit on who could read or write what.
 *
 *  Routing them here does two things: permissions become real and
 *  server-enforced (a company account can only touch its own licence),
 *  and the application stops depending on PostgREST, which is what
 *  makes the planned move to MISTI's own PostgreSQL server possible.
 *  See docs/database-portability.md.
 * ==================================================================== */

/** The caller, plus what their role lets them see. */
async function requireRegistryAccess(req: any, res: any) {
  if (!supabaseAdmin) {
    apiError(res, 503, 'Server database provider is not configured.');
    return null;
  }
  const resolved = await resolveApiUser(req);
  if (!resolved) {
    res.status(401).json({ error: 'Authentication required.' });
    return null;
  }
  if (!['superadmin', 'admin', 'company'].includes(resolved.role)) {
    res.status(403).json({ error: 'Insufficient permission.' });
    return null;
  }
  return { ...resolved, isStaff: resolved.role !== 'company' };
}

/** Licence numbers a company account owns. Staff get null, meaning "everything". */
function ownLicenceNumbers(access: { isStaff: boolean; userRow: any }): string[] | null {
  if (access.isStaff) return null;
  const n = String(access.userRow?.license_number || '').trim();
  return n ? [n] : [];
}

/**
 * Upserts a row, dropping columns this database does not have.
 *
 * The licence table has grown over time and deployments are not always on the
 * same migration, so a payload from a newer frontend can name a column the
 * database has not got yet. This used to be handled in the browser; it belongs
 * here now, next to the database.
 */
async function upsertWithSchemaFallback(
  table: string,
  payload: Record<string, any>,
  onConflict = 'id',
): Promise<{ skipped: string[] }> {
  let candidate = { ...payload };
  const skipped: string[] = [];

  for (let attempt = 0; attempt < 20; attempt++) {
    const { error } = await supabaseAdmin.from(table).upsert(candidate, { onConflict });
    if (!error) return { skipped };

    const text = `${error.message || ''} ${error.details || ''} ${error.hint || ''}`;
    const missing = text.match(/'([a-zA-Z0-9_]+)' column/)?.[1]
      || text.match(/column ["']?([a-zA-Z0-9_]+)["']? does not exist/)?.[1]
      || null;
    if (!missing || !(missing in candidate)) throw error;

    skipped.push(missing);
    const { [missing]: _drop, ...rest } = candidate;
    candidate = rest;
  }
  throw new Error(`Could not save to ${table} after pruning schema-mismatched columns.`);
}

/** Reads a table in pages, so a result over 1000 rows is not silently cut off. */
async function selectAllRows(table: string, apply: (q: any) => any): Promise<any[]> {
  const out: any[] = [];
  const pageSize = 1000;
  for (let page = 0; page < 50; page++) {
    const from = page * pageSize;
    const { data, error } = await apply(supabaseAdmin.from(table).select('*'))
      .range(from, from + pageSize - 1);
    if (error) throw error;
    out.push(...(data || []));
    if (!data || data.length < pageSize) break;
  }
  return out;
}

/* ----------------------------- licences ---------------------------- */

/* ====================================================================
 *  USER REGISTRY API
 *
 *  The browser used to read the whole users table with the anon key,
 *  under an RLS policy of `FOR SELECT USING (true)` — which meant every
 *  visitor could read every account row, PASSWORD HASHES INCLUDED, and
 *  a company account could read every other enterprise's details.
 *
 *  Now: secrets never leave the server, and a company account sees only
 *  its own row.
 * ==================================================================== */

/** Columns that must never reach the browser. */
const USER_SECRET_COLUMNS = ['password', 'password_hash'];

function publicUserRow(row: any) {
  const safe = { ...row };
  for (const column of USER_SECRET_COLUMNS) delete safe[column];
  // Tells the UI an account has a password set, without revealing anything.
  safe.has_password = !!(row?.password_hash || row?.password);
  return safe;
}

/**
 * GET /api/users
 *
 * Staff get the full registry; a company account gets exactly one row — its
 * own. Password material is stripped either way.
 */
app.get('/api/users', async (req, res) => {
  try {
    if (!supabaseAdmin) return apiError(res, 503, 'Server database provider is not configured.');

    const resolved = await resolveApiUser(req);
    if (!resolved) return res.status(401).json({ error: 'Authentication required.' });
    const { role, userRow } = resolved;
    if (!['superadmin', 'admin', 'company'].includes(role)) {
      return res.status(403).json({ error: 'Insufficient permission.' });
    }

    if (role === 'company') {
      // Its own account and nothing else. Without a resolvable row there is
      // nothing safe to return, so return nothing.
      if (!userRow?.id) return apiSuccess(res, { users: [] });
      const { data, error } = await supabaseAdmin
        .from('users').select('*').eq('id', String(userRow.id)).limit(1);
      if (error) throw error;
      return apiSuccess(res, { users: (data || []).map(publicUserRow) });
    }

    const users: any[] = [];
    const pageSize = 1000;
    for (let page = 0; page < 50; page++) {
      const from = page * pageSize;
      const { data, error } = await supabaseAdmin
        .from('users').select('*')
        .order('created_at', { ascending: true })
        .range(from, from + pageSize - 1);
      if (error) throw error;
      users.push(...(data || []));
      if (!data || data.length < pageSize) break;
    }
    return apiSuccess(res, { users: users.map(publicUserRow) });
  } catch (err: any) {
    console.error('Users fetch failed:', err?.message || err);
    return apiError(res, 500, 'Failed to load the user registry.');
  }
});

/**
 * GET /api/users/me
 *
 * The signed-in account's own row, with password material stripped. Used right
 * after sign-in, so the browser never has to read the users table to find out
 * who it is.
 */
app.get('/api/users/me', async (req, res) => {
  try {
    if (!supabaseAdmin) return apiError(res, 503, 'Server database provider is not configured.');

    const resolved = await resolveApiUser(req);
    if (!resolved) return res.status(401).json({ error: 'Authentication required.' });
    if (!resolved.userRow?.id) return apiError(res, 404, 'No account row for this session.');

    const { data, error } = await supabaseAdmin
      .from('users').select('*').eq('id', String(resolved.userRow.id)).maybeSingle();
    if (error) throw error;
    if (!data) return apiError(res, 404, 'Account not found.');

    return apiSuccess(res, { user: publicUserRow(data) });
  } catch (err: any) {
    console.error('Own account fetch failed:', err?.message || err);
    return apiError(res, 500, 'Failed to load the account.');
  }
});

/**
 * POST /api/users
 *
 * Creates or updates an account. Staff may write any account; a company
 * account may update only its own, and may not change its role, its licence
 * or any permission flag — otherwise an enterprise could promote itself.
 */
app.post('/api/users', async (req, res) => {
  try {
    if (!supabaseAdmin) return apiError(res, 503, 'Server database provider is not configured.');

    const resolved = await resolveApiUser(req);
    if (!resolved) return res.status(401).json({ error: 'Authentication required.' });
    const { role, userRow } = resolved;

    const user = req.body?.user;
    if (!user || typeof user !== 'object' || !user.id) {
      return apiError(res, 400, 'A user object with an id is required.');
    }

    const isStaff = role === 'superadmin' || role === 'admin';
    let payload: Record<string, any> = { ...user };

    if (!isStaff) {
      if (role !== 'company' || String(userRow?.id || '') !== String(user.id)) {
        return res.status(403).json({ error: 'You may only update your own account.' });
      }
      // Contact details only. Everything that grants access is dropped rather
      // than rejected, so an older client cannot fail in a confusing way.
      const SELF_EDITABLE = [
        'company_name_kh', 'company_name_en', 'address', 'phone', 'email',
        'legal_representative', 'representative_position',
      ];
      payload = { id: String(user.id) };
      for (const field of SELF_EDITABLE) {
        if (field in user) payload[field] = user[field];
      }
    }

    const { skipped } = await upsertWithSchemaFallback('users', payload);
    return apiSuccess(res, { id: user.id, skipped_columns: skipped });
  } catch (err: any) {
    console.error('User save failed:', err?.message || err);
    return apiError(res, 500, err?.message || 'Failed to save the user.');
  }
});

/** Deleting an account is staff-only, and nobody may delete themselves. */
app.delete('/api/users/:id', async (req, res) => {
  try {
    if (!supabaseAdmin) return apiError(res, 503, 'Server database provider is not configured.');

    const resolved = await resolveApiUser(req);
    if (!resolved) return res.status(401).json({ error: 'Authentication required.' });
    if (!['superadmin', 'admin'].includes(resolved.role)) {
      return res.status(403).json({ error: 'Insufficient permission.' });
    }

    const id = String(req.params.id);
    if (String(resolved.userRow?.id || '') === id) {
      return apiError(res, 400, 'You cannot delete the account you are signed in with.');
    }

    const { error } = await supabaseAdmin.from('users').delete().eq('id', id);
    if (error) throw error;
    return apiSuccess(res, { id });
  } catch (err: any) {
    console.error('User delete failed:', err?.message || err);
    return apiError(res, 500, 'Failed to delete the user.');
  }
});

/**
 * POST /api/users/change-password
 *
 * Only ever the caller's own password. The hash is computed in the browser
 * with the existing PBKDF2 helper, so the format is unchanged; what this adds
 * is that the row being written is the caller's, checked on the server.
 */
app.post('/api/users/change-password', async (req, res) => {
  try {
    if (!supabaseAdmin) return apiError(res, 503, 'Server database provider is not configured.');

    const resolved = await resolveApiUser(req);
    if (!resolved) return res.status(401).json({ error: 'Authentication required.' });

    const userId = String(req.body?.user_id || '').trim();
    const passwordHash = String(req.body?.password_hash || '').trim();
    if (!userId || !passwordHash) {
      return apiError(res, 400, 'user_id and password_hash are required.');
    }
    if (!passwordHash.startsWith('pbkdf2_sha256$')) {
      return apiError(res, 400, 'password_hash is not in the expected format.');
    }
    if (String(resolved.userRow?.id || '') !== userId) {
      return res.status(403).json({ error: 'You may only change your own password.' });
    }

    const changedAt = new Date().toISOString();
    const { error } = await supabaseAdmin.from('users').update({
      password_hash: passwordHash,
      password_updated_at: changedAt,
      must_change_password: false,
      last_password_change_by: userId,
    }).eq('id', userId);

    if (error) {
      const text = `${error.message || ''} ${error.details || ''}`.toLowerCase();
      if (text.includes('password_hash') || text.includes('password_updated_at')) {
        return apiError(res, 500,
          'Password hash columns are missing. Please run supabase_change_password_migration.sql first.');
      }
      throw error;
    }

    return apiSuccess(res, { user_id: userId, password_updated_at: changedAt });
  } catch (err: any) {
    console.error('Change password failed:', err?.message || err);
    return apiError(res, 500, 'Failed to change the password.');
  }
});

app.get('/api/licenses', async (req, res) => {
  try {
    const access = await requireRegistryAccess(req, res);
    if (!access) return;

    const own = ownLicenceNumbers(access);
    if (own && own.length === 0) return apiSuccess(res, { licenses: [] });

    const licenses = await selectAllRows('enterprise_licenses', (q) => {
      const scoped = own ? q.in('license_number', own) : q;
      return scoped.order('created_at', { ascending: false });
    });
    return apiSuccess(res, { licenses });
  } catch (err: any) {
    console.error('Licenses fetch failed:', err?.message || err);
    return apiError(res, 500, 'Failed to load licenses from the database.');
  }
});

app.post('/api/licenses', async (req, res) => {
  try {
    const access = await requireRegistryAccess(req, res);
    if (!access) return;

    const license = req.body?.license;
    if (!license || typeof license !== 'object' || !license.id) {
      return apiError(res, 400, 'A license object with an id is required.');
    }

    // A company account may only write its own licence, and may not move it
    // to a different licence number.
    const own = ownLicenceNumbers(access);
    if (own) {
      const { data: existing } = await supabaseAdmin
        .from('enterprise_licenses').select('license_number').eq('id', license.id).maybeSingle();
      const target = String(license.license_number || existing?.license_number || '');
      if (!own.includes(target) || (existing && !own.includes(String(existing.license_number)))) {
        return res.status(403).json({ error: 'This license belongs to another enterprise.' });
      }
    }

    const { skipped } = await upsertWithSchemaFallback('enterprise_licenses', license);
    return apiSuccess(res, { id: license.id, skipped_columns: skipped });
  } catch (err: any) {
    console.error('License save failed:', err?.message || err);
    return apiError(res, 500, err?.message || 'Failed to save the license.');
  }
});

app.delete('/api/licenses/:id', async (req, res) => {
  try {
    if (!supabaseAdmin) return apiError(res, 503, 'Server database provider is not configured.');
    if (!(await requireApiRole(req, res, ['superadmin', 'admin']))) return;
    const { error } = await supabaseAdmin
      .from('enterprise_licenses').delete().eq('id', String(req.params.id));
    if (error) throw error;
    return apiSuccess(res, { id: req.params.id });
  } catch (err: any) {
    console.error('License delete failed:', err?.message || err);
    return apiError(res, 500, 'Failed to delete the license.');
  }
});

/* ---------------------------- attachments -------------------------- */

/** True when the licence row belongs to a company account. */
async function licenceIdIsOwn(access: any, licenseId: string): Promise<boolean> {
  const own = ownLicenceNumbers(access);
  if (!own) return true;
  if (!own.length) return false;
  const { data } = await supabaseAdmin
    .from('enterprise_licenses').select('license_number').eq('id', licenseId).maybeSingle();
  return !!data && own.includes(String(data.license_number));
}

app.get('/api/license-attachments', async (req, res) => {
  try {
    const access = await requireRegistryAccess(req, res);
    if (!access) return;

    const licenseId = String(req.query.license_id || '').trim();
    if (!licenseId) return apiError(res, 400, 'license_id is required.');
    if (!(await licenceIdIsOwn(access, licenseId))) {
      return res.status(403).json({ error: 'This license belongs to another enterprise.' });
    }

    const attachments = await selectAllRows('enterprise_license_attachments', (q) =>
      q.eq('license_id', licenseId).order('uploaded_at', { ascending: false }));
    return apiSuccess(res, { attachments });
  } catch (err: any) {
    console.error('Attachments fetch failed:', err?.message || err);
    return apiError(res, 500, 'Failed to load attachments.');
  }
});

app.post('/api/license-attachments', async (req, res) => {
  try {
    const access = await requireRegistryAccess(req, res);
    if (!access) return;

    const attachment = req.body?.attachment;
    if (!attachment?.id || !attachment?.license_id) {
      return apiError(res, 400, 'An attachment with id and license_id is required.');
    }
    if (!(await licenceIdIsOwn(access, String(attachment.license_id)))) {
      return res.status(403).json({ error: 'This license belongs to another enterprise.' });
    }

    const { skipped } = await upsertWithSchemaFallback('enterprise_license_attachments', attachment);
    return apiSuccess(res, { id: attachment.id, skipped_columns: skipped });
  } catch (err: any) {
    console.error('Attachment save failed:', err?.message || err);
    return apiError(res, 500, 'Failed to save the attachment.');
  }
});

app.delete('/api/license-attachments/:id', async (req, res) => {
  try {
    const access = await requireRegistryAccess(req, res);
    if (!access) return;

    const id = String(req.params.id);
    const { data: row } = await supabaseAdmin
      .from('enterprise_license_attachments').select('license_id').eq('id', id).maybeSingle();
    if (row && !(await licenceIdIsOwn(access, String(row.license_id)))) {
      return res.status(403).json({ error: 'This license belongs to another enterprise.' });
    }

    const { error } = await supabaseAdmin.from('enterprise_license_attachments').delete().eq('id', id);
    if (error) throw error;
    return apiSuccess(res, { id });
  } catch (err: any) {
    console.error('Attachment delete failed:', err?.message || err);
    return apiError(res, 500, 'Failed to delete the attachment.');
  }
});

/* -------------------- reminder logs / renewal history -------------- */

/** Licence row ids a company account owns, for scoping child tables. */
async function ownLicenceIds(access: any): Promise<string[] | null> {
  const own = ownLicenceNumbers(access);
  if (!own) return null;
  if (!own.length) return [];
  const { data } = await supabaseAdmin
    .from('enterprise_licenses').select('id').in('license_number', own);
  return (data || []).map((r: any) => String(r.id));
}

app.get('/api/reminder-logs', async (req, res) => {
  try {
    const access = await requireRegistryAccess(req, res);
    if (!access) return;

    const licenseId = String(req.query.license_id || '').trim();
    if (licenseId && !(await licenceIdIsOwn(access, licenseId))) {
      return res.status(403).json({ error: 'This license belongs to another enterprise.' });
    }
    // Without a licence id a company account would otherwise see every
    // enterprise's reminder history, so it is scoped to its own licences.
    let ids: string[] | null = null;
    if (!licenseId) {
      ids = await ownLicenceIds(access);
      if (ids && !ids.length) return apiSuccess(res, { logs: [] });
    }

    const logs = await selectAllRows('license_reminder_logs', (q) => {
      let scoped = q;
      if (licenseId) scoped = scoped.eq('license_id', licenseId);
      else if (ids) scoped = scoped.in('license_id', ids);
      return scoped.order('created_at', { ascending: false });
    });
    return apiSuccess(res, { logs });
  } catch (err: any) {
    console.error('Reminder logs fetch failed:', err?.message || err);
    return apiError(res, 500, 'Failed to load reminder logs.');
  }
});

app.post('/api/reminder-logs', async (req, res) => {
  try {
    if (!supabaseAdmin) return apiError(res, 503, 'Server database provider is not configured.');
    if (!(await requireApiRole(req, res, ['superadmin', 'admin']))) return;
    const log = req.body?.log;
    if (!log?.id) return apiError(res, 400, 'A log with an id is required.');
    const { skipped } = await upsertWithSchemaFallback('license_reminder_logs', log);
    return apiSuccess(res, { id: log.id, skipped_columns: skipped });
  } catch (err: any) {
    console.error('Reminder log save failed:', err?.message || err);
    return apiError(res, 500, 'Failed to save the reminder log.');
  }
});

app.get('/api/renewal-history', async (req, res) => {
  try {
    const access = await requireRegistryAccess(req, res);
    if (!access) return;

    const licenseId = String(req.query.license_id || '').trim();
    if (licenseId && !(await licenceIdIsOwn(access, licenseId))) {
      return res.status(403).json({ error: 'This license belongs to another enterprise.' });
    }
    let ids: string[] | null = null;
    if (!licenseId) {
      ids = await ownLicenceIds(access);
      if (ids && !ids.length) return apiSuccess(res, { history: [] });
    }

    const history = await selectAllRows('license_renewal_history', (q) => {
      let scoped = q;
      if (licenseId) scoped = scoped.eq('license_id', licenseId);
      else if (ids) scoped = scoped.in('license_id', ids);
      return scoped.order('renewed_at', { ascending: false });
    });
    return apiSuccess(res, { history });
  } catch (err: any) {
    console.error('Renewal history fetch failed:', err?.message || err);
    return apiError(res, 500, 'Failed to load renewal history.');
  }
});

app.post('/api/renewal-history', async (req, res) => {
  try {
    if (!supabaseAdmin) return apiError(res, 503, 'Server database provider is not configured.');
    if (!(await requireApiRole(req, res, ['superadmin', 'admin']))) return;
    const history = req.body?.history;
    if (!history?.id) return apiError(res, 400, 'A history record with an id is required.');
    const { skipped } = await upsertWithSchemaFallback('license_renewal_history', history);
    return apiSuccess(res, { id: history.id, skipped_columns: skipped });
  } catch (err: any) {
    console.error('Renewal history save failed:', err?.message || err);
    return apiError(res, 500, 'Failed to save the renewal history record.');
  }
});

/* ---------------------------- login history ------------------------ */

app.get('/api/login-history', async (req, res) => {
  try {
    if (!supabaseAdmin) return apiError(res, 503, 'Server database provider is not configured.');
    if (!(await requireApiRole(req, res, ['superadmin', 'admin']))) return;
    const limit = Math.min(Number(req.query.limit) || 1000, 5000);
    const { data, error } = await supabaseAdmin
      .from('login_history').select('*').order('login_at', { ascending: false }).limit(limit);
    if (error) throw error;
    return apiSuccess(res, { history: data || [] });
  } catch (err: any) {
    console.error('Login history fetch failed:', err?.message || err);
    return apiError(res, 500, 'Failed to load login history.');
  }
});

/**
 * Recording a sign-in attempt happens before anyone is signed in, so this one
 * cannot require a session. It only ever inserts, never reads, and the stored
 * fields are fixed here rather than taken wholesale from the caller.
 */
app.post('/api/login-history', async (req, res) => {
  try {
    if (!supabaseAdmin) return apiError(res, 503, 'Server database provider is not configured.');
    const entry = req.body?.entry;
    if (!entry || typeof entry !== 'object') return apiError(res, 400, 'An entry is required.');

    const row = {
      id: String(entry.id || crypto.randomUUID()),
      user_id: String(entry.user_id || ''),
      user_email: String(entry.user_email || ''),
      user_role: String(entry.user_role || ''),
      company_id: String(entry.company_id || ''),
      company_name: String(entry.company_name || ''),
      login_status: String(entry.login_status || ''),
      // Read from the connection, not from the caller, so it cannot be spoofed.
      ip_address: String(
        (req.headers['x-forwarded-for'] || '').toString().split(',')[0].trim()
        || req.socket?.remoteAddress || '',
      ).slice(0, 64),
      user_agent: String(req.headers['user-agent'] || '').slice(0, 512),
      device_info: String(entry.device_info || '').slice(0, 512),
      login_at: entry.login_at || new Date().toISOString(),
    };

    const { skipped } = await upsertWithSchemaFallback('login_history', row);

    // audit_logs is optional in the active schema, so a failure here must not
    // fail the sign-in record it accompanies.
    const audit = req.body?.audit;
    if (audit && typeof audit === 'object') {
      try {
        await supabaseAdmin.from('audit_logs').insert([{
          actor_email: String(audit.actor_email || ''),
          actor_role: String(audit.actor_role || ''),
          action_type: String(audit.action_type || ''),
          details: String(audit.details || ''),
          ip_address: row.ip_address,
          target_user_id: audit.target_user_id ? String(audit.target_user_id) : null,
          created_at: new Date().toISOString(),
        }]);
      } catch {
        // No audit_logs table on this deployment.
      }
    }

    return apiSuccess(res, { id: row.id, skipped_columns: skipped });
  } catch (err: any) {
    console.error('Login history save failed:', err?.message || err);
    return apiError(res, 500, 'Failed to record the login.');
  }
});


/**
 * GET /api/annex8/search
 *
 * Searching the monthly reports by month, year, service type and verification
 * result. It reads annex8_activity_union, so one search covers both the Annex 8
 * reports and the frozen legacy ones — a 2025 instrument is found the same way
 * as a 2026 one.
 *
 * Filters (all optional, combined with AND):
 *   year            2026
 *   month           09  (also matches a legacy "9" or "September")
 *   op_code         M manufacture · I installation · R repair
 *   verification    PASSED · FAILED · PENDING
 *   q               free text over serial, instrument, customer, enterprise
 *   licence         exact licence number
 *
 * A company account only ever sees its own licence, enforced here.
 */
app.get('/api/annex8/search', async (req, res) => {
  try {
    const access = await requireRegistryAccess(req, res);
    if (!access) return;

    const year = String(req.query.year || '').trim();
    const month = String(req.query.month || '').trim();
    const opCode = String(req.query.op_code || '').trim().toUpperCase();
    const verification = String(req.query.verification || '').trim().toUpperCase();
    const q = String(req.query.q || '').trim();
    const licence = String(req.query.licence || '').trim();
    const limit = Math.min(Number(req.query.limit) || 500, 5000);

    if (opCode && !['M', 'I', 'R'].includes(opCode)) {
      return apiError(res, 400, 'op_code must be M, I or R.');
    }
    if (verification && !['PASSED', 'FAILED', 'PENDING'].includes(verification)) {
      return apiError(res, 400, 'verification must be PASSED, FAILED or PENDING.');
    }

    const own = ownLicenceNumbers(access);
    if (own && own.length === 0) return apiSuccess(res, { rows: [], counts: emptySearchCounts(), truncated: false });

    let query = supabaseAdmin.from('annex8_activity_union').select('*');

    if (own) query = query.in('licence_no', own);
    else if (licence) query = query.eq('licence_no', licence);

    if (year) query = query.eq('report_year', year);
    if (opCode) query = query.eq('op_code', opCode);
    if (verification) query = query.eq('verification_status', verification);

    if (q) {
      // Escape the PostgREST wildcards so a search for "%" is a literal "%".
      const safe = q.replace(/[%_,()]/g, (c) => `\\${c}`);
      query = query.or(
        ['serial_no', 'instrument_name', 'customer_name', 'company_name_kh']
          .map((col) => `${col}.ilike.%${safe}%`).join(','),
      );
    }

    // Over-fetch a little so the month filter below still fills the page.
    const { data, error } = await query.limit(month ? Math.min(limit * 4, 20000) : limit);
    if (error) throw error;

    let rows = data || [];

    // The legacy rows store the month as a loose string ("9", "September"),
    // so it is normalised here rather than matched in SQL.
    if (month) {
      const want = String(Number(month));
      rows = rows.filter((r: any) => {
        const normalised = normalizeLegacyPeriod(r.report_month, r.report_year);
        return normalised ? String(Number(normalised.slice(5))) === want : false;
      });
    }

    const truncated = rows.length > limit;
    if (truncated) rows = rows.slice(0, limit);

    return apiSuccess(res, { rows, counts: countSearchRows(rows), truncated });
  } catch (err: any) {
    console.error('Annex 8 search failed:', err?.message || err);
    return apiError(res, 500, 'Failed to search the reports.');
  }
});

function emptySearchCounts() {
  return {
    total: 0,
    manufactured: 0, installed: 0, repaired: 0,
    passed: 0, failed: 0, pending: 0,
    enterprises: 0,
  };
}

/** Totals for the result set, so the screen can show them above the table. */
function countSearchRows(rows: any[]) {
  const counts = emptySearchCounts();
  const enterprises = new Set<string>();
  for (const r of rows) {
    counts.total++;
    if (r.op_code === 'M') counts.manufactured++;
    else if (r.op_code === 'I') counts.installed++;
    else counts.repaired++;
    if (r.verification_status === 'PASSED') counts.passed++;
    else if (r.verification_status === 'FAILED') counts.failed++;
    else counts.pending++;
    if (r.licence_no) enterprises.add(String(r.licence_no));
  }
  counts.enterprises = enterprises.size;
  return counts;
}

/** The years that actually have data, for the year dropdown. */
app.get('/api/annex8/search-facets', async (req, res) => {
  try {
    const access = await requireRegistryAccess(req, res);
    if (!access) return;

    const own = ownLicenceNumbers(access);
    if (own && own.length === 0) return apiSuccess(res, { years: [], licences: [] });

    let query = supabaseAdmin.from('annex8_activity_union').select('report_year, licence_no, company_name_kh');
    if (own) query = query.in('licence_no', own);
    const { data, error } = await query.limit(20000);
    if (error) throw error;

    const years = [...new Set((data || []).map((r: any) => String(r.report_year || '')).filter(Boolean))]
      .sort((a, b) => b.localeCompare(a));
    const seen = new Map<string, string>();
    for (const r of data || []) {
      const no = String(r.licence_no || '');
      if (no && !seen.has(no)) seen.set(no, String(r.company_name_kh || no));
    }
    const licences = [...seen.entries()].map(([licence_no, name]) => ({ licence_no, name }))
      .sort((a, b) => a.name.localeCompare(b.name, 'km'));

    return apiSuccess(res, { years, licences });
  } catch (err: any) {
    console.error('Annex 8 search facets failed:', err?.message || err);
    return apiError(res, 500, 'Failed to load the search options.');
  }
});


app.get('/api/verify-license', async (req, res) => {
  try {
    if (!supabaseAdmin) {
      return apiError(res, 503, 'Server database provider is not configured.');
    }

    const reference = String(req.query?.reference || '').trim();
    if (!reference || reference.length > 160) {
      return apiError(res, 400, 'A valid license reference is required.');
    }

    const findLicense = async (column: 'license_number' | 'id') => {
      const { data, error } = await supabaseAdmin
        .from('enterprise_licenses')
        .select('*')
        .eq(column, reference)
        .limit(1);
      if (error) throw error;
      return data && data.length > 0 ? data[0] : null;
    };

    const license = await findLicense('license_number') || await findLicense('id');
    if (!license) {
      return apiError(res, 404, 'License not found.');
    }

    const publicLicense = {
      id: license.id,
      company_name: license.company_name,
      company_name_kh: license.company_name_kh,
      license_number: license.license_number,
      company_address: license.company_address,
      province_city: license.province_city,
      district_khan: license.district_khan,
      commune_sangkat: license.commune_sangkat,
      village: license.village,
      business_type: license.business_type,
      service_scope: license.service_scope,
      measuring_instrument_type: license.measuring_instrument_type,
      license_issue_date: license.license_issue_date,
      license_expiry_date: license.license_expiry_date,
      license_validity_years: license.license_validity_years,
      license_status: license.license_status,
      business_latitude: license.business_latitude,
      business_longitude: license.business_longitude,
      business_location_source: license.business_location_source
    };

    return apiSuccess(res, { license: publicLicense });
  } catch (err: any) {
    console.error('Public license verification failed:', err?.message || err);
    return apiError(res, 500, 'License verification failed.');
  }
});

// Public endpoint backing the printed-PDF QR codes that verify a FILTERED report
// list (?verifyReport=filtered&month=...&companyId=...). Anonymous scanners have
// no local data, so the lookup runs with the service role here.
app.get('/api/verify-report-list', async (req, res) => {
  try {
    if (!supabaseAdmin) {
      return apiError(res, 503, 'Server database provider is not configured.');
    }

    const month = String(req.query?.month || 'all');
    const year = String(req.query?.year || 'all');
    const companyId = String(req.query?.companyId || 'all');
    const serviceType = String(req.query?.serviceType || 'all');
    const searchQuery = String(req.query?.searchQuery || '').toLowerCase().trim();

    let query = supabaseAdmin
      .from('reports')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(2000);
    if (companyId && companyId !== 'all') query = query.eq('user_id', companyId);
    if (month && month !== 'all') query = query.eq('report_month', month);
    if (year && year !== 'all') query = query.eq('report_year', year);
    if (serviceType && serviceType !== 'all') query = query.eq('service_type', serviceType);

    const { data, error } = await query;
    if (error) {
      console.error('Filtered report verification query failed:', error.message || error);
      return apiError(res, 500, 'Report list verification failed.');
    }

    let reportList = data || [];
    if (searchQuery) {
      reportList = reportList.filter((r: any) =>
        [r.customer_name, r.customer_address, r.measuring_instrument, r.instrument_serial_number, r.company_name_kh]
          .some((value) => String(value || '').toLowerCase().includes(searchQuery))
      );
    }

    return apiSuccess(res, { reports: reportList });
  } catch (err: any) {
    console.error('Filtered report verification failed:', err?.message || err);
    return apiError(res, 500, 'Report list verification failed.');
  }
});

app.get('/api/active-telegram-bot', async (req, res) => {
  try {
    const purpose = String(req.query.purpose || 'license_reminder');
    const requestedPurpose: TelegramBotPurpose =
      purpose === 'report_group' || purpose === 'report_notification'
        ? 'report_group'
        : 'license_reminder';
    const activeBot = await getActiveBot(requestedPurpose);
    return apiSuccess(res, { bot: activeBot ? sanitizeBotForClient(activeBot) : null });
  } catch (err: any) {
    console.error('Failed to fetch active public Telegram Bot:', err?.message || err);
    return apiError(res, 500, 'Failed to fetch active Telegram Bot metadata.');
  }
});

app.post('/api/ensure-telegram-webhook', async (req, res) => {
  try {
    if (!(await requireApiRole(req, res, ['superadmin', 'admin', 'company']))) return;

    const purpose = String(req.body?.purpose || req.query.purpose || 'license_reminder');
    const requestedPurpose: TelegramBotPurpose =
      purpose === 'report_group' || purpose === 'report_notification'
        ? 'report_group'
        : 'license_reminder';
    const webhookUrl = getDefaultWebhookUrl(req);
    if (!isSafeTelegramWebhookUrl(webhookUrl, req)) {
      return apiError(res, 400, 'Webhook requires the configured public HTTPS NMC deployment URL.');
    }

    const activeBot = await getActiveBot(requestedPurpose);
    if (!activeBot) {
      return apiError(res, 400, getPurposeMissingMessage(requestedPurpose));
    }

    const telegramResponse = await configureTelegramWebhook(activeBot, webhookUrl);
    return apiSuccess(res, {
      status: 'success',
      webhook_url: webhookUrl,
      bot: sanitizeBotForClient({
        ...activeBot,
        webhook_url: webhookUrl,
        webhook_status: 'configured'
      }),
      telegram_response: telegramResponse
    });
  } catch (err: any) {
    console.error('ensureWebhook error:', sanitizeTelegramError(err?.message || 'Failed to ensure Telegram Webhook'));
    return apiError(res, 500, 'Unable to configure Telegram webhook at this time.');
  }
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
    if (isTelegramBotSchemaError(err)) return telegramBotSchemaError(res);
    console.error('Failed to fetch Telegram Bot settings:', err?.message || err);
    return apiError(res, 500, 'Failed to fetch Telegram Bot settings.');
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
    } else {
      const username = String(input.bot_username || '').replace(/^@/, '').trim();
      if (username) {
        const { data } = await supabaseAdmin
          .from('telegram_bot_settings')
          .select('*')
          .eq('bot_username', username)
          .limit(1)
          .maybeSingle();
        existingBot = data || null;
      }
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
        .update({ is_active: false })
        .in('bot_purpose', capabilities);
      if (payload.id) {
        deactivateQuery = deactivateQuery.not('id', 'eq', payload.id);
      }
      const { error: deactivateError } = await deactivateQuery;
      if (deactivateError) throw deactivateError;
    }

    const { data, error } = await saveTelegramBotPayload(payload);

    if (error) throw error;
    return apiSuccess(res, { bot: sanitizeBotForClient(data || payload) });
  } catch (err: any) {
    if (isTelegramBotSchemaError(err)) return telegramBotSchemaError(res);
    console.error('Failed to save Telegram Bot setting:', err?.message || err);
    return apiError(res, 500, 'Failed to save Telegram Bot setting.');
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
    return apiError(res, 500, 'Failed to delete Telegram Bot setting.');
  }
});

/**
 * 4. Telegram webhook handler
 * Receives /start {token} commands from connected companies
 */
app.post('/api/telegram-webhook', async (req, res) => {
  try {
    const update = req.body;
    console.log('Received Telegram webhook update.');

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
 * POST /api/monthly-report-digest
 *
 * Monthly compliance digest to the NMC Telegram group: which licensed
 * enterprises filed their Annex 8 report for the month that just ended, which
 * were late, and which are still missing.
 *
 * Runs from the Vercel cron on day 8, i.e. the morning after the ប្រការ២១
 * deadline on day 7, so the first number NMC sees is the final one. Superadmins
 * and admins may also call it by hand; `?period=YYYY-MM` re-runs an older month
 * and `?dry_run=1` returns the message without sending anything.
 *
 * Sending is recorded in monthly_report_digest_logs, and a period already sent
 * is not sent again unless `?force=1` — a cron that fires twice must not post
 * the roll call twice.
 */
const runMonthlyReportDigest: express.RequestHandler = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  try {
    // Either the cron secret, or a signed-in superadmin/admin.
    const cronSecret = process.env.CRON_SECRET;
    const authHeader = req.headers.authorization || '';
    const reqSecret = authHeader.replace(/^Bearer\s+/i, '');
    const secretOk = !!cronSecret && reqSecret === cronSecret;

    if (!secretOk) {
      const role = await resolveApiRole(req);
      if (!role || !['superadmin', 'admin'].includes(role)) {
        return res.status(401).json({ error: 'Unauthorized: cron secret or NMC staff sign-in required.' });
      }
    }

    if (!supabaseAdmin) {
      return res.status(400).json({ status: 'Skipped', message: 'Offline mode: no database connection.' });
    }

    const dryRun = String(req.query.dry_run || '') === '1';
    const force = String(req.query.force || '') === '1';
    const requested = String(req.query.period || '').trim();
    if (requested && !/^\d{4}-(0[1-9]|1[0-2])$/.test(requested)) {
      return apiError(res, 400, 'period must be YYYY-MM.');
    }
    const period = requested || previousPeriod();

    // Already sent? A cron retry must not repost the roll call.
    if (!dryRun) {
      const { data: already, error: logError } = await supabaseAdmin
        .from('monthly_report_digest_logs')
        .select('id, sent_at, send_status')
        .eq('period_month', period)
        .eq('send_status', 'Sent')
        .limit(1);
      if (logError) return apiError(res, 503, 'Monthly digest delivery log is unavailable. No Telegram message was sent.');
      if (!force && already && already.length) {
        return res.json({
          status: 'Skipped',
          message: `The digest for ${period} was already sent on ${already[0].sent_at}. Use force=1 to send it again.`,
          period,
        });
      }
    }

    const licences = await selectAllRows('enterprise_licenses', q =>
      q.in('license_status', ['Active', 'Expiring Soon']).order('id', { ascending: true }));
    const annex8Reports = await selectAllRows('annex8_reports', q =>
      q.eq('period_month', period).order('id', { ascending: true }));
    // The legacy form still counts; its loose month strings are normalized below.
    let legacyReports: any[] = [];
    try {
      legacyReports = await selectAllRows('reports', q =>
        q.eq('report_year', period.slice(0, 4)).order('id', { ascending: true }));
    } catch { /* The legacy table is optional for Annex 8 installations. */ }

    const digest = buildMonthlyDigest({
      period,
      licences,
      annex8Reports,
      // A missing legacy table is not fatal: the digest is about Annex 8.
      legacyReports,
    });

    const messages = renderDigestMessages(digest);

    // A preview is read-only: no Telegram request, PDF service call or log write.
    if (dryRun) {
      return res.json({ status: 'DryRun', period, ...digestCounts(digest), messages });
    }

    // The group gets the digest as a PDF. If Gotenberg is unreachable the
    // numbers still have to arrive, so the text messages are the fallback
    // rather than the whole run failing.
    let pdf: Buffer | null = null;
    let pdfError: string | null = null;
    try {
      pdf = await convertHtmlToPdf(renderDigestHtml(digest), digestFileName(period));
    } catch (err: any) {
      pdfError = err?.message || String(err);
      console.warn('Monthly digest PDF not produced, sending text only:', pdfError);
    }
    if (pdf) pdf = await sealServerReport(pdf, { kind: 'monthly-digest', format: 'pdf',
      title: 'NMC Monthly Telegram Digest', period, issuer: 'monthly-digest-service', basis: 'database', snapshot: digest });

    const activeBot = await getActiveBot('report_group');
    if (!activeBot) {
      return res.status(400).json({ status: 'Skipped', message: getPurposeMissingMessage('report_group'), period });
    }
    const chatId = getBotGroupChatId(activeBot);
    if (!chatId) {
      return res.status(400).json({
        status: 'Skipped',
        message: 'No Telegram group chat id is configured for the report group bot.',
        period,
      });
    }

    if ((req.body?.expected_bot_id && req.body.expected_bot_id !== activeBot.id)
      || (req.body?.expected_group_chat_id && req.body.expected_group_chat_id !== chatId)) {
      return apiError(res, 409, 'Telegram destination changed. Refresh the settings before sending.');
    }

    let sent = 0;
    let failure: string | null = null;

    if (pdf) {
      // One document carrying the whole roll call, captioned with the
      // headline numbers so the group sees them without opening the file.
      try {
        await sendTelegramDocument(
          activeBot.bot_token_encrypted,
          chatId,
          { name: digestFileName(period), type: 'application/pdf', body: pdf },
          renderDigestCaption(digest),
        );
        sent++;
      } catch (err: any) {
        failure = err?.message || String(err);
        console.error('Monthly digest document send failed:', failure);
      }
    } else {
      // No PDF: fall back to the text messages so the numbers still arrive.
      for (const text of messages) {
        try {
          await sendTelegramMessage(activeBot.bot_token_encrypted, chatId, text);
          sent++;
        } catch (err: any) {
          failure = err?.message || String(err);
          console.error('Monthly digest send failed:', failure);
          break;    // stop at the first failure rather than spraying partial output
        }
      }
    }

    const { error: deliveryLogError } = await supabaseAdmin.from('monthly_report_digest_logs').insert({
      period_month: period,
      telegram_bot_setting_id: activeBot.id !== 'env-fallback' ? activeBot.id : null,
      telegram_chat_id: chatId,
      licensee_count: digest.licensees,
      submitted_count: digest.submitted.length,
      on_time_count: digest.onTime.length,
      late_count: digest.late.length,
      missing_count: digest.missing.length,
      compliance_rate: digest.complianceRate,
      message_count: messages.length,
      message_text: messages.join('\n\n———\n\n').slice(0, 20000),
      send_status: failure ? 'Failed' : 'Sent',
      error_message: failure,
      sent_at: new Date().toISOString(),
    });

    if (deliveryLogError) {
      return res.status(202).json({ status: 'Unlogged', period, sent_messages: sent,
        message: 'Delivery was attempted but its log could not be saved. Check the Telegram group before resending.' });
    }

    if (failure) {
      return res.status(502).json({
        status: 'Failed', period, sent_messages: sent, total_messages: messages.length, error: failure,
      });
    }

    return res.json({
      status: 'Success',
      period,
      sent_messages: sent,
      delivered_as: pdf ? 'pdf' : 'text',
      pdf_bytes: pdf?.length ?? 0,
      pdf_error: pdfError,
      ...digestCounts(digest),
    });
  } catch (err: any) {
    console.error('Monthly digest failed:', err);
    return res.status(500).json({ error: err?.message || 'Monthly digest failed.' });
  }
};

app.post('/api/monthly-report-digest', runMonthlyReportDigest);
// Vercel invokes cron jobs with GET. A browser GET without the cron secret
// must never send a digest; staff use the explicit POST action instead.
app.get('/api/monthly-report-digest', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.authorization !== `Bearer ${secret}`) {
    return res.status(401).json({ error: 'A valid cron authorization header is required.' });
  }
  if (req.query.force || req.query.period || req.query.dry_run) {
    return apiError(res, 400, 'Scheduled runs always report the previous month without forcing a resend.');
  }
  return runMonthlyReportDigest(req, res, () => {});
});

app.get('/api/monthly-report-digest/settings', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const resolved = await resolveApiUser(req);
  if (!resolved || !['superadmin', 'admin'].includes(resolved.role)) {
    return apiError(res, resolved ? 403 : 401, 'NMC staff authentication required.');
  }
  if (!supabaseAdmin) return apiError(res, 503, 'Database is not configured.');
  try {
    const bot = await getActiveBot('report_group');
    const { data: logs, error } = await supabaseAdmin.from('monthly_report_digest_logs')
      .select('id,period_month,send_status,sent_at,submitted_count,missing_count,compliance_rate')
      .order('sent_at', { ascending: false }).limit(10);
    return apiSuccess(res, {
      schedule: { day: 8, hour: 8, minute: 0, timezone: 'Asia/Phnom_Penh', cron: '0 1 8 * *' },
      default_period: previousPeriod(),
      cron_secret_configured: !!process.env.CRON_SECRET,
      hosted_scheduler: process.env.VERCEL === '1',
      pdf_configured: !!process.env.GOTENBERG_URL,
      delivery_log_ready: !error,
      bot: bot ? { id: bot.id, name: bot.bot_name || bot.bot_display_name || bot.bot_username || 'Telegram bot',
        username: bot.bot_username || '', group_chat_id: getBotGroupChatId(bot),
        token_configured: !!String(bot.bot_token_encrypted || '').trim() && !isProtectedSecretValue(bot.bot_token_encrypted) } : null,
      logs: error ? [] : (logs || []),
    });
  } catch { return apiError(res, 500, 'Unable to load monthly digest settings.'); }
});

/** The headline numbers, for the API response and the logs. */
function digestCounts(d: ReturnType<typeof buildMonthlyDigest>) {
  return {
    licensees: d.licensees,
    submitted: d.submitted.length,
    on_time: d.onTime.length,
    late: d.late.length,
    missing: d.missing.length,
    compliance_rate: d.complianceRate,
    totals: d.totals,
  };
}

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
    if (isTelegramBotSchemaError(err)) return telegramBotSchemaError(res);
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

    const body = await configureTelegramWebhook(
      targetBot || { id: botId || 'custom-token', bot_token_encrypted: botToken },
      webhookUrl
    );

    return apiSuccess(res, { 
      status: 'success', 
      message: 'Telegram Webhook configured successfully!', 
      telegram_response: body 
    });
  } catch (err: any) {
    if (isTelegramBotSchemaError(err)) return telegramBotSchemaError(res);
    console.error('setWebhook error:', sanitizeTelegramError(err?.message || 'Failed to configure Telegram Webhook'));
    return apiError(res, 500, 'Unable to configure Telegram webhook at this time.');
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
    if (isTelegramBotSchemaError(err)) return telegramBotSchemaError(res);
    console.error('getWebhookInfo error:', err);
    return apiError(res, 500, 'Failed to query Telegram webhook info');
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

    const requesterRole = await resolveApiRole(req);
    if (!requesterRole) {
      return res.status(401).json({ error: 'Authentication required.' });
    }
    const isAdminRequester = ['superadmin', 'admin'].includes(requesterRole);
    // Company users may only dispatch report-group notifications through the stored
    // active bot; they cannot supply their own token, chat target, or reminder log.
    const isCompanyGroupDispatch = requesterRole === 'company' && requestedPurpose === 'report_group';
    if (!isAdminRequester && !isCompanyGroupDispatch) {
      return res.status(403).json({ error: 'Insufficient permission for this Telegram action.' });
    }

    let botToken = isAdminRequester ? bodyBotToken : undefined;
    let botUsername = bodyBotUsername || 'Custom Bot';
    let activeBotId: string | null = null;
    let targetChatId = isAdminRequester ? chatId : undefined;

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
    if (!isValidTelegramChatId(targetChatId)) {
      return apiError(res, 400, 'Invalid Telegram Chat ID.');
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

    if (supabaseAdmin && licenseId && isAdminRequester) {
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
    if (isTelegramBotSchemaError(err)) return telegramBotSchemaError(res);
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

/* =====================================================================
   ANNEX 8 (A8-2026.2) MONTHLY REPORT
   ===================================================================== */

/** Licence pre-fill for Part 1, plus the lists that drive V06 and Parts 4–5. */
app.get('/api/annex8/licence', async (req, res) => {
  try {
    if (!supabaseAdmin) return apiError(res, 503, 'Server database provider is not configured.');
    if (!(await requireApiRole(req, res, ['superadmin', 'admin', 'company']))) return;

    const licenceNo = String(req.query?.licence_no || '').trim();
    if (!licenceNo) return apiError(res, 400, 'licence_no is required.');

    const [profile, scope, technicians, standards, licence] = await Promise.all([
      supabaseAdmin.from('annex8_licence_profiles').select('*').eq('license_number', licenceNo).maybeSingle(),
      supabaseAdmin.from('annex8_licence_scope').select('category_code').eq('license_number', licenceNo),
      supabaseAdmin.from('annex8_licence_technicians').select('full_name,position').eq('license_number', licenceNo).eq('is_active', true),
      supabaseAdmin.from('annex8_licence_standards').select('*').eq('license_number', licenceNo).eq('is_active', true),
      supabaseAdmin.from('enterprise_licenses').select('*').eq('license_number', licenceNo).maybeSingle(),
    ]);

    return apiSuccess(res, {
      licence: {
        licence_no: licenceNo,
        licence_type: profile.data?.licence_type || 'MANUF_INSTALL',
        licence_valid_to: licence.data?.license_expiry_date || '',
        decision_no: profile.data?.decision_no || '',
        decision_date: profile.data?.decision_date || '',
        enterprise_name_kh: licence.data?.company_name_kh || '',
        enterprise_name_en: licence.data?.company_name || '',
        registration_no: profile.data?.registration_no || '',
        operating_address: profile.data?.operating_address || licence.data?.company_address || '',
        scope: (scope.data || []).map((r: any) => r.category_code),
        staff: (technicians.data || []).map((r: any) => r.full_name),
        standards: (standards.data || []).map((r: any) => ({
          equipment: r.equipment, serial_no: r.serial_no, class_range: r.class_range,
        })),
        contact: {
          name: profile.data?.contact_name || '',
          position: profile.data?.contact_position || '',
          phone: profile.data?.contact_phone || '',
          email: profile.data?.contact_email || '',
        },
      },
    });
  } catch (err: any) {
    console.error('Annex 8 licence lookup failed:', err?.message || err);
    return apiError(res, 500, 'Unable to load licence information.');
  }
});

/** Items still PENDING from earlier months (Art. 17) — the carry-over list. */
app.get('/api/annex8/pending', async (req, res) => {
  try {
    if (!supabaseAdmin) return apiError(res, 503, 'Server database provider is not configured.');

    const licenceNo = String(req.query?.licence_no || '').trim();
    const beforeMonth = String(req.query?.before || '').trim();
    // requireApiRole only checked the ROLE, so any company account could ask
    // for another enterprise's licence and be told which of its instruments
    // are still awaiting verification. This is the same ownership check every
    // other Annex 8 endpoint uses.
    if (!(await requireAnnex8Licence(req, res, licenceNo))) return;

    const { data: reports } = await supabaseAdmin
      .from('annex8_reports')
      .select('id, report_id, period_month')
      .eq('licence_no', licenceNo)
      .neq('status', 'DRAFT');

    const relevant = (reports || []).filter((r: any) => !beforeMonth || r.period_month < beforeMonth);
    if (relevant.length === 0) return apiSuccess(res, { items: [] });

    const ids = relevant.map((r: any) => r.id);
    const byId = new Map(relevant.map((r: any) => [r.id, r]));

    // A deleted entry must not resurface here asking to be verified.
    const [instruments, repairs] = await Promise.all([
      supabaseAdmin.from('annex8_report_instruments').select('*')
        .in('report_uuid', ids).eq('verification_status', 'PENDING').is('deleted_at', null),
      supabaseAdmin.from('annex8_report_repairs').select('*')
        .in('report_uuid', ids).eq('verification_status', 'PENDING').is('deleted_at', null),
    ]);

    const items = [
      ...(instruments.data || []).map((r: any) => ({
        ref: 'P3', source_row_id: r.id, source_report_id: byId.get(r.report_uuid)?.report_id,
        serial_no: r.serial_no, instrument_name: r.instrument_name, category: r.category,
        since: byId.get(r.report_uuid)?.period_month || '', status: 'PENDING', cert_no: '', date: '',
      })),
      ...(repairs.data || []).map((r: any) => ({
        ref: 'P4', source_row_id: r.id, source_report_id: byId.get(r.report_uuid)?.report_id,
        serial_no: r.serial_no, instrument_name: r.instrument_name, category: r.category,
        since: byId.get(r.report_uuid)?.period_month || '', status: 'PENDING', cert_no: '', date: '',
      })),
    ];

    return apiSuccess(res, { items });
  } catch (err: any) {
    console.error('Annex 8 pending lookup failed:', err?.message || err);
    return apiError(res, 500, 'Unable to load pending items.');
  }
});

/** Server-side draft, so a report can be continued on another device. */
/**
 * GET /api/annex8/my-reports?licence_no=&months=13
 *
 * The licence's reporting calendar: one entry per recent month, saying whether
 * that month has been submitted, is still a draft, or has not been started.
 *
 * This is what the form uses to let an enterprise open a NEW monthly report
 * when a new month comes round, instead of only ever seeing one period. A
 * licence may have exactly one report per month (uniq_a8_report_period), so
 * the calendar is the natural way to present it.
 */
/* ====================================================================
 *  ANNEX 8 — INCREMENTAL ENTRY API
 *
 *  A licensee records work as it happens. Each entry is a row from the
 *  moment it is typed, inside that month's OPEN report, which is created
 *  on demand. Nothing here trusts a client for which month an entry
 *  belongs to, for Part 2 totals, or for whether a month may still be
 *  edited.
 * ==================================================================== */

/** Resolves the caller and the licence they are allowed to work on. */
async function requireAnnex8Licence(req: any, res: any, licenceNo: string) {
  if (!supabaseAdmin) {
    apiError(res, 503, 'Server database provider is not configured.');
    return null;
  }
  const resolved = await resolveApiUser(req);
  if (!resolved) {
    res.status(401).json({ error: 'Authentication required.' });
    return null;
  }
  if (!['superadmin', 'admin', 'company'].includes(resolved.role)) {
    res.status(403).json({ error: 'Insufficient permission.' });
    return null;
  }
  if (!licenceNo) {
    apiError(res, 400, 'licence_no is required.');
    return null;
  }
  if (resolved.role === 'company') {
    const own = String(resolved.userRow?.license_number || '').trim();
    if (!own || own !== licenceNo) {
      res.status(403).json({ error: 'This licence belongs to another enterprise.' });
      return null;
    }
  }
  return resolved;
}

/** Append-only; a failure to log must never lose the change it describes. */
async function writeAnnex8Audit(entry: {
  report_uuid?: string | null;
  licence_no?: string | null;
  period_month?: string | null;
  entity: string;
  entity_id?: string | null;
  action: string;
  actor?: string | null;
  actor_role?: string | null;
  old_value?: any;
  new_value?: any;
}) {
  try {
    // The client REPORTS failures, it does not throw them. Only catching a
    // throw meant a rejected insert looked like a successful write, and the
    // audit log recorded nothing at all while every request returned 200.
    const { error } = await supabaseAdmin.from('annex8_report_audit_log').insert({
      report_uuid: entry.report_uuid || null,
      licence_no: entry.licence_no || null,
      period_month: entry.period_month || null,
      entity: entry.entity,
      entity_id: entry.entity_id ? String(entry.entity_id) : null,
      action: entry.action,
      actor: entry.actor || null,
      actor_role: entry.actor_role || null,
      old_value: entry.old_value ?? null,
      new_value: entry.new_value ?? null,
    });
    if (error) {
      console.error(
        `Annex 8 AUDIT WRITE FAILED (${entry.entity}/${entry.action}): ${error.message}`,
      );
    }
  } catch (err: any) {
    console.error('Annex 8 AUDIT WRITE FAILED:', err?.message || err);
  }
}

/**
 * The OPEN report for a licence and month, created if it does not exist.
 *
 * Part 1 is snapshotted from the licence record when the month is opened, so
 * the report still reads correctly if the licence details change later.
 * Returns null and sends the response when the month is closed.
 */
/**
 * Article 21: a month's report is due by the 7th of the FOLLOWING month.
 *
 * This was `${period}-07` — the 7th of the month being reported on, which for
 * an open month is a date that has usually not arrived yet and is always
 * wrong. deadlineFor() is the same function the form and the validator use.
 */
function deadlineDate(period: string): string {
  const due = deadlineFor(period);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${due.getFullYear()}-${pad(due.getMonth() + 1)}-${pad(due.getDate())}`;
}

async function openMonthFor(
  req: any,
  res: any,
  licenceNo: string,
  period: string,
  actor: { id: string; role: string },
  options: { createIfMissing?: boolean } = {},
): Promise<any | null> {
  const { data: existing, error } = await supabaseAdmin
    .from('annex8_reports')
    .select('*')
    .eq('licence_no', licenceNo)
    .eq('period_month', period)
    .neq('report_type', 'AMENDMENT')
    .order('created_at', { ascending: false });
  if (error) throw error;

  const rows = existing || [];
  const editable = rows.find((r: any) => isEditableStatus(r.status));
  if (editable) return editable;

  const closed = rows.find((r: any) => !isEditableStatus(r.status));
  if (closed) {
    res.status(409).json({
      success: false,
      ...monthClosedError(period, String(closed.status), closed.report_id || null),
    });
    return null;
  }

  if (options.createIfMissing === false) return null;

  // Part 1 snapshot from the licence record.
  const [profile, licence] = await Promise.all([
    supabaseAdmin.from('annex8_licence_profiles').select('*').eq('license_number', licenceNo).maybeSingle(),
    supabaseAdmin.from('enterprise_licenses').select('*').eq('license_number', licenceNo).maybeSingle(),
  ]);

  const now = new Date().toISOString();
  const { data: created, error: createError } = await supabaseAdmin
    .from('annex8_reports')
    .insert({
      format_version: FORMAT_VERSION,
      licence_no: licenceNo,
      user_id: actor.id,
      licence_type: profile.data?.licence_type || 'MANUF_INSTALL',
      enterprise_name_kh: licence.data?.company_name_kh || '',
      enterprise_name_en: licence.data?.company_name || '',
      registration_no: profile.data?.registration_no || '',
      licence_valid_to: licence.data?.license_expiry_date || null,
      operating_address: profile.data?.operating_address || licence.data?.company_address || '',
      period_month: period,
      report_type: 'REGULAR',
      contact_name: profile.data?.contact_name || '',
      contact_position: profile.data?.contact_position || '',
      contact_phone: profile.data?.contact_phone || '',
      contact_email: profile.data?.contact_email || '',
      status: 'OPEN',
      declaration_accepted: false,
      opened_at: now,
      opened_by: actor.id,
    })
    .select('*')
    .single();

  if (createError || !created) {
    // Another device opened the same month a moment earlier; the unique index
    // did its job, so use theirs.
    const { data: raced } = await supabaseAdmin
      .from('annex8_reports').select('*')
      .eq('licence_no', licenceNo).eq('period_month', period)
      .neq('report_type', 'AMENDMENT').in('status', ['OPEN', 'DRAFT', 'RETURNED'])
      .maybeSingle();
    if (raced) return raced;
    throw createError || new Error('Could not open the month.');
  }

  await writeAnnex8Audit({
    report_uuid: created.id, licence_no: licenceNo, period_month: period,
    entity: 'report', entity_id: created.id, action: 'open',
    actor: actor.id, actor_role: actor.role,
  });
  return created;
}

/** The live entries of one report, newest row_no last, soft-deleted excluded. */
async function loadMonthEntries(reportUuid: string) {
  const [instruments, modules, repairs, standards] = await Promise.all(
    ENTRY_PARTS.map((part) =>
      supabaseAdmin
        .from(ENTRY_CONFIG[part].table)
        .select('*')
        .eq('report_uuid', reportUuid)
        .is('deleted_at', null)
        .order('row_no', { ascending: true }),
    ),
  );
  return {
    instruments: instruments.data || [],
    modules: modules.data || [],
    repairs: repairs.data || [],
    standards: standards.data || [],
  };
}

/** Part 2 from the database, never from a client. */
async function monthTotals(reportUuid: string) {
  const { data, error } = await supabaseAdmin.rpc('annex8_part2_totals', { p_report_uuid: reportUuid });
  if (error) {
    console.warn('annex8_part2_totals failed:', error.message || error);
    return null;
  }
  return data;
}

/**
 * GET /api/annex8/month?licence_no=&period=
 *
 * The month dashboard: the OPEN report with its entries and live Part 2.
 * `create=0` looks without opening a month, which is what a read-only view of
 * an older month needs.
 */
app.get('/api/annex8/month', async (req, res) => {
  try {
    const licenceNo = String(req.query?.licence_no || '').trim();
    const resolved = await requireAnnex8Licence(req, res, licenceNo);
    if (!resolved) return;

    const period = String(req.query?.period || '').trim() || previousPeriod();
    if (!/^\d{4}-\d{2}$/.test(period)) return apiError(res, 400, 'period must be YYYY-MM.');

    const createIfMissing = String(req.query?.create || '1') !== '0';

    // A closed month is readable; only editing is refused, so look first.
    const { data: rows, error } = await supabaseAdmin
      .from('annex8_reports').select('*')
      .eq('licence_no', licenceNo).eq('period_month', period)
      .order('created_at', { ascending: false });
    if (error) throw error;

    let report = (rows || []).find((r: any) => isEditableStatus(r.status))
      || (rows || [])[0]
      || null;

    if (!report && createIfMissing) {
      report = await openMonthFor(req, res, licenceNo, period,
        { id: String(resolved.userRow?.id || ''), role: resolved.role });
      if (!report) return;   // response already sent
    }

    if (!report) {
      return apiSuccess(res, {
        period_month: period, report: null, entries: null, totals: null,
        deadline: deadlineDate(period), editable: false,
      });
    }

    const [entries, totals, carryOver] = await Promise.all([
      loadMonthEntries(report.id),
      monthTotals(report.id),
      supabaseAdmin.from('annex8_carry_over_updates').select('*').eq('report_uuid', report.id),
    ]);

    return apiSuccess(res, {
      period_month: period,
      report,
      entries,
      totals,
      // Art. 17 results this month settles for instruments reported earlier.
      carry_over: carryOver.data || [],
      editable: isEditableStatus(report.status),
      deadline: deadlineDate(period),
    });
  } catch (err: any) {
    console.error('Annex 8 month load failed:', err?.message || err);
    return apiError(res, 500, 'Unable to load the month.');
  }
});

/**
 * POST /api/annex8/carry-over
 *   { licence_no, period, source_part, source_row_id, new_status, cert_no?, verification_date? }
 *
 * Article 17: an instrument reported in an earlier month as រង់ចាំ gets its
 * verification result recorded in the month the result actually arrived.
 *
 * The result is NOT written to the source row here. It is held against this
 * month and applied at submit, so a result typed and then thought better of
 * cannot quietly rewrite a month that is already with NMC. The source row is
 * re-checked at that point too.
 */
app.post('/api/annex8/carry-over', async (req, res) => {
  try {
    const licenceNo = String(req.body?.licence_no || '').trim();
    const resolved = await requireAnnex8Licence(req, res, licenceNo);
    if (!resolved) return;

    const sourcePart = String(req.body?.source_part || '').trim().toUpperCase();
    const sourceRowId = String(req.body?.source_row_id || '').trim();
    const newStatus = String(req.body?.new_status || '').trim().toUpperCase();
    if (sourcePart !== 'P3' && sourcePart !== 'P4') {
      return apiError(res, 400, 'source_part must be P3 or P4.');
    }
    if (!sourceRowId) return apiError(res, 400, 'source_row_id is required.');
    if (newStatus !== 'PASSED' && newStatus !== 'FAILED') {
      // PENDING would be a no-op: the row already says that.
      return apiError(res, 400, 'new_status must be PASSED or FAILED.');
    }

    const period = String(req.body?.period || '').trim() || previousPeriod();
    const actor = { id: String(resolved.userRow?.id || ''), role: resolved.role };
    const report = await openMonthFor(req, res, licenceNo, period, actor);
    if (!report) return;      // month closed; response already sent

    // The source row must belong to this licensee, be awaiting verification,
    // and come from a month before this one. Anything else is a client that
    // has gone wrong, or one that is trying something.
    const table = sourcePart === 'P4' ? 'annex8_report_repairs' : 'annex8_report_instruments';
    const { data: sourceRow } = await supabaseAdmin
      .from(table).select('*').eq('id', sourceRowId).maybeSingle();
    if (!sourceRow || sourceRow.deleted_at) return apiError(res, 404, 'That entry no longer exists.');

    const { data: sourceReport } = await supabaseAdmin
      .from('annex8_reports').select('id, licence_no, period_month, report_id')
      .eq('id', sourceRow.report_uuid).maybeSingle();
    if (!sourceReport || sourceReport.licence_no !== licenceNo) {
      return res.status(403).json({ error: 'That entry belongs to another enterprise.' });
    }
    if (sourceRow.verification_status !== 'PENDING') {
      return apiError(res, 409, 'That entry already has a verification result.');
    }
    if (String(sourceReport.period_month) >= period) {
      return apiError(res, 400,
        'An entry from this month is edited directly, not carried over.');
    }

    // One carry-over per source row per month: recording a result twice is a
    // correction, not a second result.
    const { data: existing } = await supabaseAdmin
      .from('annex8_carry_over_updates').select('id')
      .eq('report_uuid', report.id).eq('source_row_id', sourceRowId).maybeSingle();

    const values = {
      report_uuid: report.id,
      source_part: sourcePart,
      source_row_id: sourceRowId,
      source_report_id: sourceReport.report_id || null,
      serial_no: sourceRow.serial_no || null,
      new_status: newStatus,
      cert_no: String(req.body?.cert_no || '').trim() || null,
      verification_date: String(req.body?.verification_date || '').trim() || null,
    };

    let saved: any;
    if (existing?.id) {
      const { data, error } = await supabaseAdmin
        .from('annex8_carry_over_updates').update(values).eq('id', existing.id).select('*').single();
      if (error) throw error;
      saved = data;
    } else {
      const { data, error } = await supabaseAdmin
        .from('annex8_carry_over_updates').insert(values).select('*').single();
      if (error) throw error;
      saved = data;
    }

    await writeAnnex8Audit({
      report_uuid: report.id, licence_no: licenceNo, period_month: period,
      entity: 'carry_over', entity_id: String(saved.id),
      action: existing?.id ? 'update' : 'create',
      actor: actor.id, actor_role: actor.role,
      new_value: values,
    });

    return apiSuccess(res, { carry_over: saved });
  } catch (err: any) {
    console.error('Annex 8 carry-over save failed:', err?.message || err);
    return apiError(res, 500, 'Unable to record the carry-over result.');
  }
});

/** DELETE /api/annex8/carry-over/:id  —  take a carry-over back off the month. */
app.delete('/api/annex8/carry-over/:id', async (req, res) => {
  try {
    if (!supabaseAdmin) return apiError(res, 503, 'Server database provider is not configured.');

    const id = String(req.params?.id || '').trim();
    const { data: row } = await supabaseAdmin
      .from('annex8_carry_over_updates').select('*').eq('id', id).maybeSingle();
    if (!row) return apiError(res, 404, 'Carry-over not found.');

    const { data: report } = await supabaseAdmin
      .from('annex8_reports').select('id, licence_no, period_month, status, report_id')
      .eq('id', row.report_uuid).maybeSingle();
    if (!report) return apiError(res, 404, 'Report not found.');

    const resolved = await requireAnnex8Licence(req, res, String(report.licence_no || ''));
    if (!resolved) return;

    if (!isEditableStatus(report.status)) {
      return res.status(409).json({
        success: false,
        ...monthClosedError(report.period_month, String(report.status), report.report_id || null),
      });
    }

    const { error } = await supabaseAdmin.from('annex8_carry_over_updates').delete().eq('id', id);
    if (error) throw error;

    await writeAnnex8Audit({
      report_uuid: report.id, licence_no: String(report.licence_no), period_month: String(report.period_month),
      entity: 'carry_over', entity_id: id, action: 'delete',
      actor: String(resolved.userRow?.id || ''), actor_role: resolved.role,
      old_value: row,
    });

    return apiSuccess(res, { removed: id });
  } catch (err: any) {
    console.error('Annex 8 carry-over delete failed:', err?.message || err);
    return apiError(res, 500, 'Unable to remove the carry-over result.');
  }
});

/**
 * POST /api/annex8/entries
 *   { licence_no, part, entry, period? }
 *
 * The month is decided here from the entry's activity date, not by the client.
 */
app.post('/api/annex8/entries', async (req, res) => {
  try {
    const licenceNo = String(req.body?.licence_no || '').trim();
    const resolved = await requireAnnex8Licence(req, res, licenceNo);
    if (!resolved) return;

    const part = req.body?.part;
    if (!isEntryPart(part)) return apiError(res, 400, 'part must be instrument, module, repair or standard.');

    const payload = req.body?.entry;
    if (!payload || typeof payload !== 'object') return apiError(res, 400, 'An entry is required.');

    const fallback = String(req.body?.period || '').trim() || previousPeriod();
    const period = periodForEntry(part, payload, fallback);
    if (!/^\d{4}-\d{2}$/.test(period)) return apiError(res, 400, 'Could not determine the month for this entry.');

    const actor = { id: String(resolved.userRow?.id || ''), role: resolved.role };
    const report = await openMonthFor(req, res, licenceNo, period, actor);
    if (!report) return;      // month closed; response already sent

    const values = pickEntryColumns(part, payload);

    // row_no is the entry's place in the printed annex, so it follows the
    // highest one already used rather than the count of live rows — otherwise
    // deleting a row would make the next entry reuse its number.
    const { data: last } = await supabaseAdmin
      .from(ENTRY_CONFIG[part].table)
      .select('row_no')
      .eq('report_uuid', report.id)
      .order('row_no', { ascending: false })
      .limit(1);
    values.row_no = Number(last?.[0]?.row_no || 0) + 1;

    values.report_uuid = report.id;
    values.created_by = actor.id;
    values.updated_by = actor.id;

    const { data: created, error } = await supabaseAdmin
      .from(ENTRY_CONFIG[part].table).insert(values).select('*').single();
    if (error) throw error;

    await writeAnnex8Audit({
      report_uuid: report.id, licence_no: licenceNo, period_month: period,
      entity: auditEntityFor(part), entity_id: created.id, action: 'create',
      actor: actor.id, actor_role: actor.role, new_value: created,
    });

    return apiSuccess(res, {
      entry: created,
      report_uuid: report.id,
      period_month: period,
      totals: await monthTotals(report.id),
    });
  } catch (err: any) {
    console.error('Annex 8 entry create failed:', err?.message || err);
    return apiError(res, 500, err?.message || 'Unable to save the entry.');
  }
});

/** Loads an entry and checks the caller may edit the month it belongs to. */
async function loadEditableEntry(req: any, res: any, part: EntryPart, id: string) {
  const { data: row, error } = await supabaseAdmin
    .from(ENTRY_CONFIG[part].table).select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  if (!row) {
    apiError(res, 404, 'Entry not found.');
    return null;
  }

  const { data: report } = await supabaseAdmin
    .from('annex8_reports').select('*').eq('id', row.report_uuid).maybeSingle();
  if (!report) {
    apiError(res, 404, 'The report this entry belongs to is missing.');
    return null;
  }

  const resolved = await requireAnnex8Licence(req, res, String(report.licence_no || ''));
  if (!resolved) return null;

  // NMC staff may correct a SUBMITTED report in place — they are the ones who
  // receive it, and an obvious error should not need a round trip to fix.
  // Every such edit is audited with the actor's role, so a change made by NMC
  // is distinguishable from one made by the licensee.
  //
  // ACCEPTED is final for everyone. Accepting is NMC's own confirmation that
  // the report is correct; editing it afterwards would quietly change
  // something they have already signed off. To alter it, return it first.
  const staffCorrection =
    ['superadmin', 'admin'].includes(resolved.role) && report.status === 'SUBMITTED';

  if (!isEditableStatus(report.status) && !staffCorrection) {
    res.status(409).json({
      success: false,
      ...monthClosedError(report.period_month, String(report.status), report.report_id || null),
    });
    return null;
  }

  return { row, report, resolved };
}

/** PUT /api/annex8/entries/:part/:id */
app.put('/api/annex8/entries/:part/:id', async (req, res) => {
  try {
    if (!supabaseAdmin) return apiError(res, 503, 'Server database provider is not configured.');
    const part = req.params.part;
    if (!isEntryPart(part)) return apiError(res, 400, 'Unknown entry part.');

    const loaded = await loadEditableEntry(req, res, part, String(req.params.id));
    if (!loaded) return;
    const { row, report, resolved } = loaded;

    const values = pickEntryColumns(part, req.body?.entry || {});
    delete values.row_no;                       // position is not the client's to set
    values.updated_by = String(resolved.userRow?.id || '');

    const { data: updated, error } = await supabaseAdmin
      .from(ENTRY_CONFIG[part].table).update(values).eq('id', row.id).select('*').single();
    if (error) throw error;

    await writeAnnex8Audit({
      report_uuid: report.id, licence_no: report.licence_no, period_month: report.period_month,
      entity: auditEntityFor(part), entity_id: row.id, action: 'update',
      actor: values.updated_by, actor_role: resolved.role,
      old_value: row, new_value: updated,
    });

    return apiSuccess(res, { entry: updated, totals: await monthTotals(report.id) });
  } catch (err: any) {
    console.error('Annex 8 entry update failed:', err?.message || err);
    return apiError(res, 500, 'Unable to update the entry.');
  }
});

/** DELETE /api/annex8/entries/:part/:id — soft, so the undo is real. */
app.delete('/api/annex8/entries/:part/:id', async (req, res) => {
  try {
    if (!supabaseAdmin) return apiError(res, 503, 'Server database provider is not configured.');
    const part = req.params.part;
    if (!isEntryPart(part)) return apiError(res, 400, 'Unknown entry part.');

    const loaded = await loadEditableEntry(req, res, part, String(req.params.id));
    if (!loaded) return;
    const { row, report, resolved } = loaded;

    if (row.deleted_at) return apiSuccess(res, { entry: row, already_deleted: true });

    const actorId = String(resolved.userRow?.id || '');
    const { error } = await supabaseAdmin
      .from(ENTRY_CONFIG[part].table)
      .update({ deleted_at: new Date().toISOString(), deleted_by: actorId, updated_by: actorId })
      .eq('id', row.id);
    if (error) throw error;

    await writeAnnex8Audit({
      report_uuid: report.id, licence_no: report.licence_no, period_month: report.period_month,
      entity: auditEntityFor(part), entity_id: row.id, action: 'delete',
      actor: actorId, actor_role: resolved.role, old_value: row,
    });

    return apiSuccess(res, { id: row.id, totals: await monthTotals(report.id) });
  } catch (err: any) {
    console.error('Annex 8 entry delete failed:', err?.message || err);
    return apiError(res, 500, 'Unable to delete the entry.');
  }
});

/**
 * POST /api/annex8/entries/:part/:id/undelete
 *
 * The undo behind the ten-second toast. It is a column rather than a timer, so
 * it still works after a reload — and a mistaken delete stays recoverable long
 * after the toast is gone.
 */
app.post('/api/annex8/entries/:part/:id/undelete', async (req, res) => {
  try {
    if (!supabaseAdmin) return apiError(res, 503, 'Server database provider is not configured.');
    const part = req.params.part;
    if (!isEntryPart(part)) return apiError(res, 400, 'Unknown entry part.');

    const loaded = await loadEditableEntry(req, res, part, String(req.params.id));
    if (!loaded) return;
    const { row, report, resolved } = loaded;

    const actorId = String(resolved.userRow?.id || '');
    const { data: restored, error } = await supabaseAdmin
      .from(ENTRY_CONFIG[part].table)
      .update({ deleted_at: null, deleted_by: null, updated_by: actorId })
      .eq('id', row.id).select('*').single();
    if (error) throw error;

    await writeAnnex8Audit({
      report_uuid: report.id, licence_no: report.licence_no, period_month: report.period_month,
      entity: auditEntityFor(part), entity_id: row.id, action: 'undelete',
      actor: actorId, actor_role: resolved.role, new_value: restored,
    });

    return apiSuccess(res, { entry: restored, totals: await monthTotals(report.id) });
  } catch (err: any) {
    console.error('Annex 8 entry undelete failed:', err?.message || err);
    return apiError(res, 500, 'Unable to restore the entry.');
  }
});

/**
 * GET /api/annex8/entries/:part/:id/duplicate
 *
 * Returns the values to prefill a new form, without creating anything: eight
 * load cells on one weighbridge differ only by serial and certificate. The
 * identity fields are deliberately left blank so a copy can never inherit
 * another unit's serial or verification result.
 */
app.get('/api/annex8/entries/:part/:id/duplicate', async (req, res) => {
  try {
    if (!supabaseAdmin) return apiError(res, 503, 'Server database provider is not configured.');
    const part = req.params.part;
    if (!isEntryPart(part)) return apiError(res, 400, 'Unknown entry part.');

    const { data: row, error } = await supabaseAdmin
      .from(ENTRY_CONFIG[part].table).select('*').eq('id', String(req.params.id)).maybeSingle();
    if (error) throw error;
    if (!row) return apiError(res, 404, 'Entry not found.');

    const { data: report } = await supabaseAdmin
      .from('annex8_reports').select('licence_no').eq('id', row.report_uuid).maybeSingle();
    const resolved = await requireAnnex8Licence(req, res, String(report?.licence_no || ''));
    if (!resolved) return;

    return apiSuccess(res, { values: duplicateValues(part, row) });
  } catch (err: any) {
    console.error('Annex 8 entry duplicate failed:', err?.message || err);
    return apiError(res, 500, 'Unable to copy the entry.');
  }
});

/* ====================================================================
 *  ANNEX 8 — MONTH END: review, submit, lock
 * ==================================================================== */

/** The licence facts V06 and V08 are checked against. */
async function licenceContextFor(licenceNo: string) {
  const [scope, technicians] = await Promise.all([
    supabaseAdmin.from('annex8_licence_scope').select('category_code').eq('license_number', licenceNo),
    supabaseAdmin.from('annex8_licence_technicians').select('full_name').eq('license_number', licenceNo).eq('is_active', true),
  ]);
  const { data: licence } = await supabaseAdmin
    .from('enterprise_licenses').select('license_expiry_date').eq('license_number', licenceNo).maybeSingle();

  return {
    scope: (scope.data || []).map((r: any) => r.category_code),
    staff: (technicians.data || []).map((r: any) => r.full_name),
    licence_valid_to: String(licence?.license_expiry_date || ''),
  };
}

/** Everything the review page and the submit check both need. */
async function reviewMonth(reportUuid: string) {
  const { data: report } = await supabaseAdmin
    .from('annex8_reports').select('*').eq('id', reportUuid).maybeSingle();
  if (!report) return null;

  const [entries, carryOver] = await Promise.all([
    loadMonthEntries(reportUuid),
    supabaseAdmin.from('annex8_carry_over_updates').select('*').eq('report_uuid', reportUuid),
  ]);

  const state = stateFromMonth(report, { ...entries, carryOver: carryOver.data || [] });
  const licence = await licenceContextFor(String(report.licence_no));
  const issues = validateAnnex8(state as any, { licence: licence as any });

  return { report, entries, state, issues };
}

/**
 * GET /api/annex8/month/review?report_uuid=
 *
 * The month-end check: the live Part 2 totals, the balance equation, and every
 * blocking issue with the path of the entry that causes it so the screen can
 * link straight to the field.
 */
app.get('/api/annex8/month/review', async (req, res) => {
  try {
    if (!supabaseAdmin) return apiError(res, 503, 'Server database provider is not configured.');

    const reportUuid = String(req.query?.report_uuid || '').trim();
    if (!reportUuid) return apiError(res, 400, 'report_uuid is required.');

    const loaded = await reviewMonth(reportUuid);
    if (!loaded) return apiError(res, 404, 'Report not found.');

    const resolved = await requireAnnex8Licence(req, res, String(loaded.report.licence_no || ''));
    if (!resolved) return;

    const summary = computeSummary(loaded.state as any);

    return apiSuccess(res, {
      report: loaded.report,
      summary,
      issues: loaded.issues,
      blocking: blockingIssues(loaded.issues),
      warnings: warningIssues(loaded.issues),
      editable: isEditableStatus(loaded.report.status),
      can_submit: isEditableStatus(loaded.report.status) && blockingIssues(loaded.issues).length === 0,
    });
  } catch (err: any) {
    console.error('Annex 8 review failed:', err?.message || err);
    return apiError(res, 500, 'Unable to review the month.');
  }
});

/**
 * PUT /api/annex8/month/meta
 *   { report_uuid, events?, declaration_accepted?, report_type?, contact? }
 *
 * Part 6, the Part 7 declaration, and the "no activity this month" switch.
 * NIL is refused while the month still has entries: silently discarding
 * someone's work to tick a box is not a trade the system should make.
 */
app.put('/api/annex8/month/meta', async (req, res) => {
  try {
    if (!supabaseAdmin) return apiError(res, 503, 'Server database provider is not configured.');

    const reportUuid = String(req.body?.report_uuid || '').trim();
    if (!reportUuid) return apiError(res, 400, 'report_uuid is required.');

    const { data: report } = await supabaseAdmin
      .from('annex8_reports').select('*').eq('id', reportUuid).maybeSingle();
    if (!report) return apiError(res, 404, 'Report not found.');

    const resolved = await requireAnnex8Licence(req, res, String(report.licence_no || ''));
    if (!resolved) return;

    if (!isEditableStatus(report.status)) {
      return res.status(409).json({
        success: false,
        ...monthClosedError(report.period_month, String(report.status), report.report_id || null),
      });
    }

    const patch: Record<string, any> = {};
    if ('events' in req.body) patch.events = req.body.events || {};
    if ('declaration_accepted' in req.body) patch.declaration_accepted = !!req.body.declaration_accepted;

    if ('contact' in req.body && req.body.contact) {
      patch.contact_name = String(req.body.contact.name || '');
      patch.contact_position = String(req.body.contact.position || '');
      patch.contact_phone = String(req.body.contact.phone || '');
      patch.contact_email = String(req.body.contact.email || '');
    }

    if ('report_type' in req.body) {
      const type = String(req.body.report_type || '');
      if (!['REGULAR', 'NIL'].includes(type)) {
        return apiError(res, 400, 'report_type must be REGULAR or NIL here; amendments are created separately.');
      }
      if (type === 'NIL') {
        const entries = await loadMonthEntries(reportUuid);
        const count = entries.instruments.length + entries.modules.length
          + entries.repairs.length + entries.standards.length;
        if (count > 0) {
          return res.status(409).json({
            success: false,
            code: 'NIL_WITH_ENTRIES',
            entry_count: count,
            message_kh: `ខែនេះមាន ${count} ធាតុរួចហើយ។ សូមលុបធាតុទាំងនោះមុន ទើបអាចជ្រើស «គ្មានសកម្មភាព»។`,
            message_en: `This month already has ${count} entries. Delete them before marking it as no activity.`,
          });
        }
      }
      patch.report_type = type;
    }

    if (!Object.keys(patch).length) return apiSuccess(res, { report });

    const { data: updated, error } = await supabaseAdmin
      .from('annex8_reports').update(patch).eq('id', reportUuid).select('*').single();
    if (error) throw error;

    await writeAnnex8Audit({
      report_uuid: reportUuid, licence_no: report.licence_no, period_month: report.period_month,
      entity: 'report', entity_id: reportUuid, action: 'update',
      actor: String(resolved.userRow?.id || ''), actor_role: resolved.role,
      old_value: { events: report.events, declaration_accepted: report.declaration_accepted, report_type: report.report_type },
      new_value: patch,
    });

    return apiSuccess(res, { report: updated });
  } catch (err: any) {
    console.error('Annex 8 month meta update failed:', err?.message || err);
    return apiError(res, 500, 'Unable to save.');
  }
});

/**
 * POST /api/annex8/month/submit
 *   { report_uuid }
 *
 * Everything that decides whether this report counts is settled here, not in
 * the browser: the blocking rules are re-run, Part 2 is recomputed from the
 * rows, lateness comes from the database clock, and the receipt number is
 * allocated atomically. A client that thinks it may submit is not asked.
 */
app.post('/api/annex8/month/submit', async (req, res) => {
  try {
    if (!supabaseAdmin) return apiError(res, 503, 'Server database provider is not configured.');

    const reportUuid = String(req.body?.report_uuid || '').trim();
    if (!reportUuid) return apiError(res, 400, 'report_uuid is required.');

    const loaded = await reviewMonth(reportUuid);
    if (!loaded) return apiError(res, 404, 'Report not found.');
    const { report, entries, state, issues } = loaded;

    const resolved = await requireAnnex8Licence(req, res, String(report.licence_no || ''));
    if (!resolved) return;

    if (!isEditableStatus(report.status)) {
      return res.status(409).json({
        success: false,
        ...monthClosedError(report.period_month, String(report.status), report.report_id || null),
      });
    }

    // Re-run the rules against what is actually stored.
    const blocking = blockingIssues(issues);
    if (blocking.length) {
      return res.status(422).json({
        success: false,
        code: 'BLOCKING_ISSUES',
        issues: blocking.map((i) => ({ code: i.code, path: i.path, message: i.message, step: i.step })),
        message_kh: `មានបញ្ហា ${blocking.length} ត្រូវដោះស្រាយមុនដាក់ជូន។`,
        message_en: `${blocking.length} issue(s) must be fixed before submitting.`,
      });
    }

    if (!report.declaration_accepted) {
      return res.status(422).json({
        success: false,
        code: 'DECLARATION_REQUIRED',
        message_kh: 'សូមធីកការប្រកាសក្នុងផ្នែក៧ មុនដាក់ជូន។',
        message_en: 'The Part 7 declaration must be accepted before submitting.',
      });
    }

    const isNil = report.report_type === 'NIL';
    const entryCount = entries.instruments.length + entries.modules.length
      + entries.repairs.length + entries.standards.length;
    if (!isNil && entryCount === 0) {
      return res.status(422).json({
        success: false,
        code: 'EMPTY_REPORT',
        message_kh: 'ខែនេះគ្មានធាតុទេ។ បើគ្មានសកម្មភាព សូមជ្រើស «គ្មានសកម្មភាពក្នុងខែនេះ»។',
        message_en: 'This month has no entries. Mark it as no activity if that is correct.',
      });
    }

    // Part 2, recomputed from the rows. Never a client's numbers.
    const summary = computeSummary(state as any);

    // Lateness from the database clock, so a wrong device clock or a UTC
    // server cannot change whether a report counts as on time.
    let onTime: boolean;
    const { data: onTimeRow, error: onTimeError } = await supabaseAdmin
      .rpc('annex8_is_on_time', { p_period: report.period_month });
    if (onTimeError) {
      console.warn('annex8_is_on_time unavailable, falling back to server time:', onTimeError.message || onTimeError);
      onTime = isOnTime(report.period_month);
    } else {
      onTime = !!onTimeRow;
    }

    // The receipt number, allocated atomically. A report keeps the number it
    // was given: a returned report that is re-submitted does not get a new one.
    let reportId = report.report_id;
    if (!reportId) {
      const { data: idRow, error: idError } = await supabaseAdmin
        .rpc('annex8_next_report_id', { p_period: report.period_month });
      if (idError || !idRow) {
        console.error('Report number allocation failed:', idError?.message || idError);
        return apiError(res, 500, 'Unable to allocate a report number.');
      }
      reportId = String(idRow);
    }

    const submittedAt = new Date().toISOString();
    const submissionLocation = normalizeSubmissionLocation(req.body?.submission_location);
    const { data: submitted, error } = await supabaseAdmin
      .from('annex8_reports')
      .update({
        status: 'SUBMITTED',
        report_id: reportId,
        part2_summary: summary,
        warnings: warningIssues(issues),
        on_time: onTime,
        submitted_at: submittedAt,
        submitted_by: String(resolved.userRow?.id || ''),
        template_version: report.template_version || DEFAULT_TEMPLATE_VERSION,
      })
      .eq('id', reportUuid)
      .eq('status', report.status)
      .select('*')
      .maybeSingle();
    if (error) throw error;
    if (!submitted) return apiError(res, 409, 'This report was already submitted or changed. Refresh before trying again.');
    await signalMlChange();

    await writeAnnex8Audit({
      report_uuid: reportUuid, licence_no: report.licence_no, period_month: report.period_month,
      entity: 'report', entity_id: reportUuid, action: 'submit',
      actor: String(resolved.userRow?.id || ''), actor_role: resolved.role,
      new_value: { report_id: reportId, on_time: onTime, submitted_at: submittedAt,
        submission_location: submissionLocation },
    });

    const telegramNotification = await notifyAnnex8Submission({
      report: submitted, submittedAt, location: submissionLocation,
    }, {
      getBot: () => getActiveBot('report_group'),
      send: (token, chatId, text) => sendTelegramMessage(token, chatId, text, 8000),
    });
    await writeAnnex8Audit({
      report_uuid: reportUuid, licence_no: report.licence_no, period_month: report.period_month,
      entity: 'report', entity_id: reportUuid, action: 'update',
      actor: String(resolved.userRow?.id || ''), actor_role: resolved.role,
      new_value: { submission_notification: telegramNotification, submitted_at: submittedAt },
    });

    // Resolve any carry-over items this month settled, writing the result back
    // to the row in the month it originally came from.
    const { data: carryOver } = await supabaseAdmin
      .from('annex8_carry_over_updates').select('*').eq('report_uuid', reportUuid);
    for (const c of carryOver || []) {
      if (!c.source_row_id) continue;
      const table = c.source_part === 'P4' ? 'annex8_report_repairs' : 'annex8_report_instruments';
      await supabaseAdmin.from(table).update({
        verification_status: c.new_status,
        verification_cert_no: c.cert_no,
        verification_date: c.verification_date || null,
      }).eq('id', c.source_row_id);
    }

    // The official document is produced once, here, and stored. A failure must
    // not fail a submission that has already been accepted.
    let officialReady = false;
    try {
      const columns = await renderAndStoreOfficialDocuments(
        supabaseAdmin, reportUuid, report.template_version || DEFAULT_TEMPLATE_VERSION,
      );
      await supabaseAdmin.from('annex8_reports').update(columns).eq('id', reportUuid);
      officialReady = !!columns.official_pdf_path || !!columns.official_docx_path;
    } catch (err: any) {
      const message = err instanceof Annex8TemplateMissingError ? err.message : `Render: ${err?.message || err}`;
      console.warn('Annex 8 official document not produced at submit:', message);
      await supabaseAdmin.from('annex8_reports').update({ official_render_error: message }).eq('id', reportUuid);
    }

    return apiSuccess(res, {
      report: submitted,
      report_id: reportId,
      submitted_at: submittedAt,
      on_time: onTime,
      official_document_ready: officialReady,
      telegram_notification: telegramNotification,
      submission_location_status: submissionLocation.status,
      warnings: warningIssues(issues).map((i) => ({ code: i.code, message: i.message })),
    });
  } catch (err: any) {
    console.error('Annex 8 submit failed:', err?.message || err);
    return apiError(res, 500, 'Unable to submit the report.');
  }
});

/**
 * GET /api/annex8/reports-list?licence_no=…
 *
 * One row per monthly report, which is the level a licensee actually asks
 * about: "how many reports have we filed, what was in each one, and which are
 * still open". /api/annex8/my-reports answers a different question — which of
 * the last 13 months are still owed — and is a calendar, not a register.
 *
 * Counts are recomputed from the live entry rows rather than read from
 * part2_summary, so an OPEN month shows what is in it right now and a
 * submitted one still agrees with its own entries. Soft-deleted rows are
 * excluded, exactly as the printed annex excludes them.
 */
/**
 * GET /api/annex8/overview?year=YYYY
 *
 * The numbers behind the Annex 8 dashboard, scoped by who is asking:
 *
 *   superadmin / admin   every licensee
 *   company              its own licence, and nothing else
 *
 * The scope is decided HERE from the resolved user, never from a query
 * parameter, so a company cannot widen it by asking differently. A company
 * that passes someone else's licence_no is refused rather than quietly
 * given its own — silently substituting would hide a broken client.
 */
/**
 * Who is asking, and what are they allowed to see?
 *
 * One answer, used by the dashboard and by the file exports, so the two can
 * never disagree about scope. The scope is derived from the SIGNED-IN USER;
 * a licence in the query string can only narrow it, never widen it.
 *
 * Sends the response and returns null when the request is not allowed.
 */
async function resolveOverviewScope(req: any, res: any): Promise<
  { role: string; isStaff: boolean; scopeLicence: string | null; year: string | null } | null
> {
  if (!supabaseAdmin) {
    apiError(res, 503, 'Server database provider is not configured.');
    return null;
  }

  const resolved = await resolveApiUser(req);
  if (!resolved) {
    res.status(401).json({ error: 'Authentication required.' });
    return null;
  }
  if (!['superadmin', 'admin', 'company'].includes(resolved.role)) {
    res.status(403).json({ error: 'Insufficient permission.' });
    return null;
  }

  const isStaff = resolved.role === 'superadmin' || resolved.role === 'admin';
  const ownLicence = String(resolved.userRow?.license_number || '').trim();
  const asked = String(req.query?.licence_no || '').trim();

  if (!isStaff) {
    if (!ownLicence) {
      apiError(res, 403, 'This account has no licence number.');
      return null;
    }
    // Refused rather than quietly substituted: silently handing back its own
    // data would hide a broken client, or a deliberate attempt.
    if (asked && asked !== ownLicence) {
      res.status(403).json({ error: 'This licence belongs to another enterprise.' });
      return null;
    }
  }

  const year = String(req.query?.year || '').trim();
  return {
    role: resolved.role,
    isStaff,
    scopeLicence: isStaff ? (asked || null) : ownLicence,
    year: /^\d{4}$/.test(year) ? year : null,
  };
}

/**
 * GET /api/annex8/overview?licence_no=&year=
 *
 * The numbers behind the Annex 8 dashboard:
 *
 *   superadmin / admin   every licensee, or one if they narrow to it
 *   company              its own licence, and nothing else
 */
// Complete SQL aggregation. MySQL uses the equivalent read-only statement;
// PostgreSQL requires the approved RPC migration. No sample-data fallback.
app.get('/api/consolidated/preview', async (req, res) => {
  try {
    const user = await resolveApiUser(req);
    if (!user) return res.status(401).json({ error: 'Authentication required.' });
    if (!['superadmin', 'admin'].includes(user.role)) return res.status(403).json({ error: 'NMC staff access required.' });
    let period;
    try {
      period = reportingPeriod(String(req.query.period_type) as PeriodType, Number(req.query.year), Number(req.query.index || 1));
    } catch {
      return apiError(res, 400, 'Invalid consolidated reporting period.');
    }
    if (!supabaseAdmin) {
      return res.status(503).json({ code: 'CONSOLIDATED_SCHEMA_PENDING', error: 'ការប្រមូលទិន្នន័យ PostgreSQL សម្រាប់របាយការណ៍សរុបមិនទាន់អាចប្រើបានទេ។' });
    }
    const { data, error } = await supabaseAdmin.rpc('mlrs_consolidated_preview', {
      p_period_type: period.type, p_year: period.year, p_index: period.index,
    });
    if (error) {
      if (['PGRST202', '42883'].includes(error.code)) {
        return res.status(503).json({ code: 'CONSOLIDATED_SCHEMA_PENDING', error: 'ការប្រមូលទិន្នន័យរបាយការណ៍សរុបត្រូវរង់ចាំការរៀបចំ database ដែលបានអនុម័ត។' });
      }
      throw error;
    }
    const result = formatConsolidatedAggregate(data, period, DB_DRIVER === 'mysql' ? 'mysql' : 'postgresql');
    // Optional evidence must never turn unavailable audit history into invented actions.
    try {
      const window = actionWindow(period, result.data_as_of);
      // Every officer action, not just accept and return: correcting a
      // licensee's figures or removing a bad record is something the Centre
      // did, and excluding it made 6.1 look emptier than the quarter was.
      // Entities beyond the report itself count too — an instrument row an
      // officer corrected is the same kind of intervention.
      const audits = await selectAllRows('annex8_report_audit_log', query => query
        .in('actor_role', ['admin', 'superadmin'])
        .in('action', ['accept', 'return', 'update', 'delete', 'undelete'])
        .gte('created_at', window.start).lt('created_at', window.end).lte('created_at', window.cutoff)
        .order('created_at', { ascending: true }).order('id', { ascending: true }));
      if (audits.length >= 50000) throw new Error('Audit evidence exceeds the complete-read limit.');
      const auditCount = audits.length;
      let reminderCount = 0;
      const auditEvents = draftRecordedActions(audits, period, result.data_as_of);

      /**
       * The reports' own review outcomes.
       *
       * 6.1 used to read the audit log alone, so an empty audit log emptied
       * the section even though `status = 'ACCEPTED'` was sitting in the
       * report row saying the Centre had accepted it. Both records describe
       * the same events and are deduplicated by report.
       */
      const periodReports = await selectAllRows('annex8_reports', q => q
        .in('status', ['ACCEPTED', 'RETURNED'])
        .gte('period_month', period.start.slice(0, 7))
        .lte('period_month', period.end.slice(0, 7)));
      const outcomeEvents = draftReviewOutcomes(periodReports as any, result.data.licensees);

      /**
       * Reminder letters the Centre actually sent, which 6.1 asks for by
       * name ("លិខិតរំលឹក") and which this draft used to ignore — so a
       * quarter full of letters printed an empty table.
       *
       * Resolved to a licence here, because license_reminder_logs keys by
       * the register's row id rather than the licence number.
       */
      let reminderEvents: typeof auditEvents = [];
      try {
        const licences = await selectAllRows('enterprise_licenses', q => q);
        const byId = new Map((licences || []).map((l: any) =>
          [String(l.id), { no: String(l.license_number || ''), name: String(l.company_name_kh || l.company_name || '') }]));
        const logs = await selectAllRows('license_reminder_logs', q => q
          .gte('sent_at', window.start).lt('sent_at', window.end));
        reminderCount = (logs || []).length;
        reminderEvents = draftSentReminders((logs || []).map((row: any) => ({
          id: row.id,
          licence_no: byId.get(String(row.license_id))?.no || null,
          licensee_name: byId.get(String(row.license_id))?.name || null,
          reminder_type: row.reminder_type ?? null,
          reminder_days: row.reminder_days ?? null,
          send_status: row.send_status ?? null,
          sent_at: row.sent_at ?? null,
        })), period, result.data_as_of);
      } catch {
        // Reminder history being unreadable must not invent letters, and
        // must not lose the review actions that were read successfully.
        result.warnings.push('៦.១៖ មិនអាចអានប្រវត្តិលិខិតរំលឹកបានទេ។ មិនបានបង្កើតវិធានការសន្មតឡើយ។');
      }

      result.data.actions = groupActionEvents(
        [...auditEvents, ...outcomeEvents, ...reminderEvents], result.data.licensees);
      if (!result.data.actions.length) {
        /**
         * Say what was searched and what was found.
         *
         * "No records" on its own cannot be told apart from a filter
         * quietly dropping everything, and an officer looking at an empty
         * 6.1 has no way to know which it is. These counts make the
         * difference visible without anyone reading the code: rows read in
         * the window, against rows that qualified.
         */
        result.warnings.push(
          `៦.១៖ មិនមានកំណត់ត្រាវិធានការក្នុងរយៈពេលនេះទេ។ `
          + `បានពិនិត្យ៖ កំណត់ត្រាសវនកម្ម ${auditCount} ជួរ (ទទួលយក/បញ្ជូនត្រឡប់ ដោយមន្ត្រី) `
          + `និងលិខិតរំលឹក ${reminderCount} ជួរ។ `
          + `ប្រសិនបើ ម.ម.ជ បានអនុវត្តវិធានការក្រៅប្រព័ន្ធ សូមបំពេញជួរខាងក្រោមតាមភស្តុតាងពិត `
          + `រួចចុច «បង្កើតព្រាង» ដើម្បីឱ្យភ្នាក់ងារ AI រៀបចំអត្ថបទជូន។`);
      }
    } catch {
      result.data.actions = [];
      result.warnings.push('៦.១៖ មិនអាចផ្ទៀងផ្ទាត់ប្រវត្តិសកម្មភាពមន្ត្រីបានទេ។ មិនបានបង្កើតសកម្មភាពសន្មតឡើយ។');
    }
    /**
     * Section 6.2, worded by the AI analyst when the screen asks for it.
     *
     * Server-side because the provider key is, and opt-in because a model
     * call takes tens of seconds — loading the report must not wait for
     * one. The deterministic proposals are already in result.data and
     * already carry their legal basis, so anything that goes wrong here
     * costs wording, never content.
     *
     * 6.1 is untouched on purpose: it is a register of what NMC actually
     * did, built from the audit evidence above.
     */
    if (String((req.query as any)?.ai || '') === '1') {
      try {
        // One deadline for BOTH calls: 6.2 and 6.1 share a single
        // serverless function, which is killed at maxDuration.
        const aiDeadline = Date.now() + Number(process.env.CONSOLIDATED_AI_REQUEST_MS || 45000);
        const aiConfig = await resolveAiConfig(supabaseAdmin);
        const analysis = analyzeConsolidatedData(result.data);
        const drafted = await draftConsolidatedWithAi(
          result.data, analysis, aiConfig, aiDeadline);
        if (drafted.reason) console.log('Consolidated AI drafter not used:', drafted.reason);
        // 6.1: wording only. The rows come from evidence above and the
        // licensee and date are preserved byte for byte — see aiDrafter.
        const worded = await draftActionsWithAi(result.data.actions, aiConfig, aiDeadline);
        if (worded.actions) result.data.actions = worded.actions;
        else if (worded.reason) console.log('Consolidated 6.1 AI wording not used:', worded.reason);

        (result as any).ai_draft = {
          engine: drafted.engine,
          model: drafted.model,
          reason: drafted.reason || null,
          proposals: drafted.analysis?.proposals || null,
          conclusion: drafted.analysis?.conclusion || null,
          actions_engine: worded.engine,
          actions_reason: worded.reason || null,
        };
      } catch (err: any) {
        console.log('Consolidated AI drafter failed:', err?.message || err);
        (result as any).ai_draft = {
          engine: 'deterministic', model: null,
          reason: String(err?.message || err), proposals: null, conclusion: null,
        };
      }
    }

    return apiSuccess(res, result);
  } catch (err: any) {
    console.error('Consolidated preview failed:', err?.message || err);
    return apiError(res, 500, `មិនអាចផ្ទុកទិន្នន័យរបាយការណ៍សរុបបានទេ។ ${err?.message || ''}`);
  }
});

app.get('/api/annex8/overview', async (req, res) => {
  try {
    const scoped = await resolveOverviewScope(req, res);
    if (!scoped) return;

    const data = await collectOverview(supabaseAdmin, {
      licenceNo: scoped.scopeLicence,
      year: scoped.year,
    });

    // `rows` is row-level detail for the Excel workbook. The dashboard does
    // not need it, and sending it would make the page heavy for no gain.
    const { rows, ...forScreen } = data;
    return apiSuccess(res, {
      scope: scoped.isStaff ? (scoped.scopeLicence ? 'licence' : 'all') : 'own',
      role: scoped.role,
      ...forScreen,
    });
  } catch (err: any) {
    console.error('Annex 8 overview failed:', err?.message || err);
    return apiError(res, 500, 'Unable to load the overview.');
  }
});

/**
 * GET /api/annex8/export?format=xlsx|docx|pdf&licence_no=&year=
 *
 * NMC's own summary of what the licensees have filed — one enterprise or all
 * of them — as a file to keep or send on.
 *
 * This is NOT the official Annex 8. That comes from the template, through
 * /api/reports/:id/annex8.docx, and its layout is never built in code. This
 * is a management report with no prescribed form, so its layout IS built in
 * code, in src/annex8/staffReport.ts, from the same aggregation the dashboard
 * reads — so the file and the screen cannot disagree.
 */
app.get('/api/annex8/export', async (req, res) => {
  try {
    const scoped = await resolveOverviewScope(req, res);
    if (!scoped) return;

    const format = String(req.query?.format || 'xlsx').toLowerCase();
    if (!['xlsx', 'docx', 'pdf'].includes(format)) {
      return apiError(res, 400, 'format must be xlsx, docx or pdf.');
    }

    const data = await collectOverview(supabaseAdmin, {
      licenceNo: scoped.scopeLicence,
      year: scoped.year,
    });

    const send = async (buf: Buffer, ext: 'docx' | 'pdf' | 'xlsx', mime: string) => {
      const resolved = await resolveApiUser(req);
      const issued = await sealServerReport(buf, { kind: 'annex8-overview', format: ext,
        title: 'NMC Monthly Report Overview', issuer: String(resolved?.userRow?.id || ''),
        licence: scoped.scopeLicence || '', period: String(scoped.year || ''), basis: 'database', snapshot: data });
      res.setHeader('Content-Type', mime);
      res.setHeader('Content-Disposition',
        `attachment; filename="${staffReportFileName(data, ext)}"`);
      return res.end(issued);
    };

    if (format === 'xlsx') {
      return await send(await buildStaffReportXlsx(data), 'xlsx',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    }

    const docx = await buildStaffReportDocx(data);
    if (format === 'docx') {
      return await send(docx, 'docx',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    }

    // PDF is that Word file converted by LibreOffice — the same path the
    // official annex uses. A second PDF engine would mean a second set of
    // opinions about how Khmer is shaped.
    try {
      const pdf = await convertDocxToPdf(docx, staffReportFileName(data, 'docx'));
      return await send(pdf, 'pdf', 'application/pdf');
    } catch (err: any) {
      console.error('Annex 8 summary PDF conversion failed:', err?.message || err);
      return apiError(res, 503,
        'PDF conversion is unavailable. Set GOTENBERG_URL, or download the Word file.');
    }
  } catch (err: any) {
    console.error('Annex 8 export failed:', err?.message || err);
    return apiError(res, 500, 'Unable to build the report.');
  }
});

/**
 * NMC staff only: the people who RECEIVE these reports.
 *
 * Sends the response and returns null when the caller is not staff.
 */
async function requireNmcStaff(req: any, res: any) {
  if (!supabaseAdmin) {
    apiError(res, 503, 'Server database provider is not configured.');
    return null;
  }
  const resolved = await resolveApiUser(req);
  if (!resolved) {
    res.status(401).json({ error: 'Authentication required.' });
    return null;
  }
  if (!['superadmin', 'admin'].includes(resolved.role)) {
    res.status(403).json({ error: 'NMC staff only.' });
    return null;
  }
  return resolved;
}

/**
 * GET /api/annex8/staff-reports?month=&year=&licence_no=&status=&q=
 *
 * Every licensee's monthly reports, for NMC to search, read, print and act
 * on. `month` is the two-digit month on its own, because "show me everything
 * filed for September" is the question actually asked — not a date range.
 *
 * Only reports that have been FILED are listed. A month a licensee is still
 * filling in has not been reported to anyone, and NMC looking at it would be
 * reading over their shoulder.
 */
app.get('/api/annex8/staff-reports', async (req, res) => {
  try {
    const resolved = await requireNmcStaff(req, res);
    if (!resolved) return;

    const month = String(req.query?.month || '').trim();
    const year = String(req.query?.year || '').trim();
    const licenceNo = String(req.query?.licence_no || '').trim();
    const status = String(req.query?.status || '').trim().toUpperCase();
    const q = String(req.query?.q || '').trim().toLowerCase();

    let query = supabaseAdmin.from('annex8_reports').select('*');
    if (licenceNo) query = query.eq('licence_no', licenceNo);
    if (status) query = query.eq('status', status);
    const { data: all, error } = await query;
    if (error) throw error;

    const filed = (all || []).filter((r: any) => {
      if (r.status === 'OPEN' || r.status === 'DRAFT') return false;
      const period = String(r.period_month || '');
      if (year && !period.startsWith(year)) return false;
      if (month && period.slice(5, 7) !== month.padStart(2, '0')) return false;
      return true;
    });

    // Enterprise names come from the licence register so a renamed company
    // reads correctly in the list, while the report itself keeps the name it
    // was filed under.
    const { data: licences } = await supabaseAdmin
      .from('enterprise_licenses').select('license_number, company_name, company_name_kh');
    const nameOf = new Map<string, any>(
      (licences || []).map((l: any) => [String(l.license_number), l]));

    const ids = filed.map((r: any) => r.id);
    const none = { data: [] as any[] };
    const [instruments, repairs, modules] = ids.length
      ? await Promise.all([
          supabaseAdmin.from('annex8_report_instruments')
            .select('report_uuid,op_code,serial_no,instrument_name,customer_name,verification_status')
            .in('report_uuid', ids).is('deleted_at', null),
          supabaseAdmin.from('annex8_report_repairs')
            .select('report_uuid,serial_no,instrument_name,customer_name,verification_status')
            .in('report_uuid', ids).is('deleted_at', null),
          supabaseAdmin.from('annex8_report_modules')
            .select('report_uuid').in('report_uuid', ids).is('deleted_at', null),
        ])
      : [none, none, none];

    const tally = new Map<string, any>();
    const bucket = (id: string) => {
      if (!tally.has(id)) {
        tally.set(id, {
          manufactured: 0, installed: 0, repaired: 0,
          passed: 0, failed: 0, pending: 0,
          instruments: 0, repairs: 0, modules: 0, text: [] as string[],
        });
      }
      return tally.get(id);
    };
    const judge = (t: any, s: string) => {
      if (s === 'PASSED') t.passed++; else if (s === 'FAILED') t.failed++; else t.pending++;
    };
    for (const i of instruments.data || []) {
      const t = bucket(String(i.report_uuid));
      t.instruments++;
      if (i.op_code === 'M') t.manufactured++; else t.installed++;
      judge(t, String(i.verification_status || 'PENDING'));
      t.text.push(`${i.serial_no || ''} ${i.instrument_name || ''} ${i.customer_name || ''}`.toLowerCase());
    }
    for (const p of repairs.data || []) {
      const t = bucket(String(p.report_uuid));
      t.repairs++; t.repaired++;
      judge(t, String(p.verification_status || 'PENDING'));
      t.text.push(`${p.serial_no || ''} ${p.instrument_name || ''} ${p.customer_name || ''}`.toLowerCase());
    }
    for (const m of modules.data || []) bucket(String(m.report_uuid)).modules++;

    let rows = filed.map((r: any) => {
      const t = tally.get(String(r.id)) || bucket(String(r.id));
      const licence = nameOf.get(String(r.licence_no)) || {};
      const { text, ...counts } = t;
      return {
        id: r.id,
        licence_no: r.licence_no,
        company_name_kh: licence.company_name_kh || r.enterprise_name_kh || '',
        company_name: licence.company_name || r.enterprise_name_en || '',
        period_month: r.period_month,
        report_id: r.report_id,
        report_type: r.report_type,
        status: r.status,
        on_time: r.on_time,
        submitted_at: r.submitted_at,
        submitted_by: r.submitted_by,
        received_at: r.received_at,
        reviewer: r.reviewer,
        nmc_remarks: r.nmc_remarks,
        returned_at: r.returned_at,
        format_version: r.format_version,
        counts,
        searchText: `${r.report_id || ''} ${r.licence_no} ${licence.company_name_kh || ''} ${licence.company_name || ''} ${text.join(' ')}`.toLowerCase(),
      };
    });

    if (q) rows = rows.filter((r: any) => r.searchText.includes(q));
    rows.sort((a: any, b: any) =>
      String(b.period_month).localeCompare(String(a.period_month))
      || String(a.company_name_kh).localeCompare(String(b.company_name_kh)));

    return apiSuccess(res, {
      reports: rows.map(({ searchText, ...r }: any) => r),
      months: Array.from(new Set(filed.map((r: any) => String(r.period_month).slice(5, 7)))).sort(),
      years: Array.from(new Set(filed.map((r: any) => String(r.period_month).slice(0, 4)))).sort().reverse(),
      licensees: (licences || []).map((l: any) => ({
        licence_no: l.license_number,
        company_name_kh: l.company_name_kh,
        company_name: l.company_name,
      })),
      summary: {
        total: rows.length,
        submitted: rows.filter((r: any) => r.status === 'SUBMITTED').length,
        accepted: rows.filter((r: any) => r.status === 'ACCEPTED').length,
        returned: rows.filter((r: any) => r.status === 'RETURNED').length,
        late: rows.filter((r: any) => r.on_time === false).length,
      },
    });
  } catch (err: any) {
    console.error('Annex 8 staff report list failed:', err?.message || err);
    return apiError(res, 500, 'Unable to load the reports.');
  }
});

/* =====================================================================
 *  Smart Analytics report — NMC staff only
 *
 *  The analysis is DECISION SUPPORT. Nothing here triggers a sanction, a
 *  warning or a licence action: a score or an anomaly produces a row for
 *  an officer to look at, and that is all.
 * ===================================================================== */

const ANALYTICS_PERIOD_TYPES = ['MONTH', 'QUARTER', 'SEMESTER', 'YEAR'] as const;

function analyticsPeriodFromQuery(req: any) {
  const type = String(req.query?.period_type || req.body?.period_type || '').toUpperCase();
  const year = Number(req.query?.year ?? req.body?.year);
  const index = Number(req.query?.index ?? req.body?.index ?? 1);
  if (!(ANALYTICS_PERIOD_TYPES as readonly string[]).includes(type)) return null;
  if (!Number.isInteger(year) || year < 2000 || year > 2100) return null;
  if (!Number.isInteger(index) || index < 1 || index > 12) return null;
  return { type: type as any, year, index };
}

/** The period key as it is stored: 2026-10 | 2026-Q4 | 2026-S2 | 2026. */
function analyticsPeriodKey(type: string, year: number, index: number) {
  if (type === 'MONTH') return `${year}-${String(index).padStart(2, '0')}`;
  if (type === 'QUARTER') return `${year}-Q${index}`;
  if (type === 'SEMESTER') return `${year}-S${index}`;
  return String(year);
}

/**
 * GET /api/analytics/preview?period_type=&year=&index=
 *
 * Recomputes the figures for a period and returns them with the system's
 * Khmer drafts, plus whatever the analyst has already saved. Nothing is
 * written: a preview must be free to run.
 */
app.get('/api/analytics/preview', async (req, res) => {
  try {
    const resolved = await requireNmcStaff(req, res);
    if (!resolved) return;

    const ref = analyticsPeriodFromQuery(req);
    if (!ref) return apiError(res, 400, 'period_type, year and index are required.');

    const source = await collectAnalyticsSource(supabaseAdmin, ref.type, ref.year, ref.index);
    const periodKey = analyticsPeriodKey(ref.type, ref.year, ref.index);

    // An officer's verdicts outlive a rebuild of the anomaly list.
    const { data: verdicts } = await supabaseAdmin
      .from('analytics_anomaly_reviews').select('*')
      .eq('period_type', ref.type).eq('period_key', periodKey);
    const verdictBy = new Map<string, any>(
      (verdicts || []).map((v: any) => [String(v.anomaly_key), v]));
    source.anomalies = source.anomalies.map(a => ({
      ...a,
      review_status: verdictBy.get(anomalyKey(a))?.review_status ?? a.review_status,
    }));

    // A saved draft's words win over freshly drafted ones.
    const { data: saved } = await supabaseAdmin
      .from('analytics_reports').select('*')
      .eq('period_type', ref.type).eq('period_key', periodKey).eq('status', 'DRAFT').maybeSingle();

    const textInputs = saved?.text_inputs || {};
    const data = await buildAnalyticsReport(source, textInputs, periodKey);

    return apiSuccess(res, {
      period: { ...ref, key: periodKey },
      data,
      source: {
        anomalies: source.anomalies.map(a => ({ ...a, key: anomalyKey(a) })),
        licensees_analyzed: source.licensees_analyzed,
        records_analyzed: source.records_analyzed,
        data_completeness_pct: source.data_completeness_pct,
      },
      draft: saved
        ? { id: saved.id, updated_at: saved.updated_at, generated_by: saved.generated_by }
        : null,
      finals: await analyticsFinalsFor(ref.type, periodKey),
    });
  } catch (err: any) {
    console.error('Analytics preview failed:', err?.message || err);
    return apiError(res, 500, 'Unable to build the analytics report.');
  }
});

/**
 * Build a Smart Analytics report: the models' figures, worded by the machine.
 *
 * Three layers, in this order, each beating the one before it:
 *
 *   1. the deterministic Khmer drafter, which always produces something;
 *   2. the AI analyst agent, when it is configured and its answer passes the
 *      checks in aiAnalyst.ts (no invented figures above all);
 *   3. whatever an officer has saved, which always wins — the machine does
 *      the analysis, but a person may still correct a sentence.
 *
 * The analyst block itself is never taken from the request: it names the
 * engine, and buildAnalyticsData computes it.
 */
async function buildAnalyticsReport(
  source: AnalyticsSource, textInputs: Record<string, unknown>, periodKey?: string,
) {
  const base = buildAnalyticsData(source, {});

  /**
   * Wording the AI analyst produced earlier, if any, and if it still holds.
   *
   * No model is called here. The agent runs on the queue (see
   * narrativeQueue.ts); this reads what it left. Stored wording is checked
   * again against TODAY's figures before it is used, because the figures
   * move as reports are accepted and a sentence quoting last week's total
   * would be false. Failing that check is not an error — the deterministic
   * drafter words the report and the limitations line says so.
   */
  let narrative: Record<string, string> = {};
  let engine: 'ai-agent' | 'deterministic' = 'deterministic';
  let agentModel: string | null = null;

  if (periodKey && supabaseAdmin) {
    try {
      const stored = await latestNarrative(supabaseAdmin, source.period.type, periodKey);
      if (stored?.narrative) {
        const checked = narrativeStillGrounded(stored.narrative, base);
        if (checked.narrative) {
          narrative = checked.narrative as unknown as Record<string, string>;
          engine = 'ai-agent';
          agentModel = stored.agent_model;
        } else {
          console.log('Analytics: stored AI wording not used —', checked.problem);
        }
      }
    } catch (err: any) {
      // A queue that is unavailable must not stop a report being produced.
      console.log('Analytics: could not read stored AI wording —', err?.message || err);
    }
  }

  return buildAnalyticsData(
    { ...source, engine: { ...source.engine, narrative: engine, agent_model: agentModel } },
    { ...narrative, ...textInputs } as any);
}

/* ------------------------------------------------------------------ *
 * Where the AI provider is configured
 *
 * Reading is open to NMC staff, because the report screen needs to know
 * whether the agent can be asked at all. Changing it is superadmin only: it
 * holds an API credential that the Centre pays for.
 * ------------------------------------------------------------------ */

/** GET /api/analytics/ai-settings — the provider, never the key. */
app.get('/api/analytics/ai-settings', async (req, res) => {
  try {
    const resolved = await requireNmcStaff(req, res);
    if (!resolved) return;
    if (!supabaseAdmin) return apiError(res, 503, 'Server database provider is not configured.');
    return apiSuccess(res, {
      settings: forClient(await readAiSettings(supabaseAdmin)),
      // True when the agent could run right now, by whatever route.
      ready: !!(await resolveAiConfig(supabaseAdmin)),
      env_fallback: aiAnalystEnabled(),
    });
  } catch (err: any) {
    console.error('AI settings read failed:', err?.message || err);
    return apiError(res, 500, 'Unable to read the AI settings.');
  }
});

/** PUT /api/analytics/ai-settings — superadmin only. */
app.put('/api/analytics/ai-settings', async (req, res) => {
  try {
    const resolved = await requireNmcStaff(req, res);
    if (!resolved) return;
    if (String(resolved.userRow?.role) !== 'superadmin') {
      return apiError(res, 403, 'Only a superadmin may change the AI provider.');
    }
    if (!supabaseAdmin) return apiError(res, 503, 'Server database provider is not configured.');

    const actor = String(resolved.userRow?.username || resolved.userRow?.id || '');
    const { row, problem } = await saveAiSettings(supabaseAdmin, req.body || {}, actor);
    if (problem) return apiError(res, 400, problem);
    return apiSuccess(res, {
      settings: forClient(row),
      ready: !!(await resolveAiConfig(supabaseAdmin)),
    });
  } catch (err: any) {
    console.error('AI settings save failed:', err?.message || err);
    return apiError(res, 500, 'Unable to save the AI settings.');
  }
});

/**
 * POST /api/analytics/ai-settings/test — one short call, to prove the key.
 *
 * Cheaper and far clearer than queueing a report to find out: a wrong key,
 * a retired model name or an exhausted quota each come back as the
 * provider's own words rather than as a report that quietly fell back to
 * the deterministic drafter.
 */
app.post('/api/analytics/ai-settings/test', async (req, res) => {
  try {
    const resolved = await requireNmcStaff(req, res);
    if (!resolved) return;
    if (String(resolved.userRow?.role) !== 'superadmin') {
      return apiError(res, 403, 'Only a superadmin may test the AI provider.');
    }
    if (!supabaseAdmin) return apiError(res, 503, 'Server database provider is not configured.');

    const config = await resolveAiConfig(supabaseAdmin);
    if (!config) {
      return apiError(res, 400, 'No AI provider is configured and switched on.');
    }

    const started = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30000);
    try {
      const text = await config.generate(
        'Reply with this JSON and nothing else: {"ok":true}', config.models[0], controller.signal);
      const parsed = JSON.parse(text);
      const ok = parsed?.ok === true;
      const message = ok
        ? `${config.provider} / ${config.models[0]} answered in ${((Date.now() - started) / 1000).toFixed(1)}s`
        : `answered, but not with the JSON asked for: ${String(text).slice(0, 120)}`;
      await recordAiTest(supabaseAdmin, ok, message);
      return apiSuccess(res, { ok, message, provider: config.provider, model: config.models[0] });
    } catch (err: any) {
      const message = err?.name === 'AbortError'
        ? 'the provider did not answer within 30s'
        : String(err?.message || err).slice(0, 400);
      await recordAiTest(supabaseAdmin, false, message);
      return apiSuccess(res, { ok: false, message, provider: config.provider, model: config.models[0] });
    } finally {
      clearTimeout(timer);
    }
  } catch (err: any) {
    console.error('AI settings test failed:', err?.message || err);
    return apiError(res, 500, 'Unable to test the AI provider.');
  }
});

/* ------------------------------------------------------------------ *
 * The AI analyst's queue
 *
 * Three endpoints: ask for wording, see where it stands, and do one job.
 * The work itself never happens in the first two — see narrativeQueue.ts
 * for why.
 * ------------------------------------------------------------------ */

/** What the screen needs to know about a period's wording, without the text. */
const narrativeState = (job: any) => !job ? null : {
  id: job.id,
  status: job.status,
  attempts: job.attempts ?? 0,
  agent_model: job.agent_model ?? null,
  requested_by: job.requested_by ?? null,
  requested_at: job.requested_at ?? null,
  finished_at: job.finished_at ?? null,
  // The provider's own words, which are usually the whole explanation.
  last_error: job.last_error ?? null,
};

/**
 * POST /api/analytics/narrative
 *   { period_type, year, index }
 *
 * Asks the AI analyst to word this period. Returns at once: the wording
 * appears on the next preview once a worker has produced it. Pressing twice
 * returns the job already queued rather than paying for a second call.
 */
app.post('/api/analytics/narrative', async (req, res) => {
  try {
    const resolved = await requireNmcStaff(req, res);
    if (!resolved) return;
    if (!supabaseAdmin) return apiError(res, 503, 'Server database provider is not configured.');

    const ref = analyticsPeriodFromQuery(req);
    if (!ref) return apiError(res, 400, 'period_type, year and index are required.');
    const periodKey = analyticsPeriodKey(ref.type, ref.year, ref.index);

    // Whatever the settings screen says, not just the environment.
    if (!(await resolveAiConfig(supabaseAdmin))) {
      return apiError(res, 503, 'ភ្នាក់ងារ AI មិនបានកំណត់រចនាសម្ព័ន្ធទេ។ របាយការណ៍ត្រូវតាក់តែងដោយប្រព័ន្ធ។');
    }

    const actor = String(resolved.userRow?.username || resolved.userRow?.id || '');
    const { job, created } = await requestNarrative(supabaseAdmin, ref.type, periodKey, actor);
    return apiSuccess(res, { job: narrativeState(job), created });
  } catch (err: any) {
    console.error('Analytics narrative request failed:', err?.message || err);
    return apiError(res, 500, 'Unable to queue the AI wording.');
  }
});

/**
 * GET /api/analytics/narrative?period_type=&year=&index=
 *
 * Where the wording stands. The screen polls this while a job is live.
 */
app.get('/api/analytics/narrative', async (req, res) => {
  try {
    const resolved = await requireNmcStaff(req, res);
    if (!resolved) return;
    if (!supabaseAdmin) return apiError(res, 503, 'Server database provider is not configured.');

    const ref = analyticsPeriodFromQuery(req);
    if (!ref) return apiError(res, 400, 'period_type, year and index are required.');
    const periodKey = analyticsPeriodKey(ref.type, ref.year, ref.index);

    const [live, latest, done] = await Promise.all([
      liveJob(supabaseAdmin, ref.type, periodKey),
      latestJob(supabaseAdmin, ref.type, periodKey),
      latestNarrative(supabaseAdmin, ref.type, periodKey),
    ]);

    return apiSuccess(res, {
      enabled: !!(await resolveAiConfig(supabaseAdmin)),
      // Live while the work is outstanding; otherwise the last thing to happen.
      job: narrativeState(live || latest),
      working: !!live,
      has_wording: !!done?.narrative,
    });
  } catch (err: any) {
    console.error('Analytics narrative status failed:', err?.message || err);
    return apiError(res, 500, 'Unable to read the AI wording status.');
  }
});

/**
 * POST /api/analytics/narrative/run
 *
 * Does ONE job, then returns. Called by the cron, by the worker script, or
 * by a member of staff who would rather not wait for either.
 *
 * One job per call on purpose: a serverless function has a deadline, and a
 * loop over a full queue would be cut off mid-call, leaving a job claimed
 * and a paid-for answer thrown away. The cron comes back for the next one.
 */
app.post('/api/analytics/narrative/run', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  try {
    // Either the cron secret, or signed-in NMC staff.
    const cronSecret = process.env.CRON_SECRET;
    const reqSecret = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    if (!cronSecret || reqSecret !== cronSecret) {
      const resolved = await requireNmcStaff(req, res);
      if (!resolved) return;
    }
    if (!supabaseAdmin) return apiError(res, 503, 'Server database provider is not configured.');

    /**
     * Sized to finish inside the function's own deadline.
     *
     * vercel.json allows 60s. The agent gets 40, leaving time to record the
     * outcome and answer. A job that outlives the function is never marked
     * done or failed, and the screen waits on it for ever.
     */
    const outcome = await runOneNarrativeJob(supabaseAdmin, {
      // An absolute deadline, because collecting the figures happens first
      // and takes a slice of it. vercel.json allows 60s; this leaves ten to
      // record the outcome and answer.
      deadlineAt: Date.now() + Number(process.env.ANALYTICS_NARRATIVE_REQUEST_MS || 50000),
    });
    return apiSuccess(res, outcome);
  } catch (err: any) {
    console.error('Analytics narrative run failed:', err?.message || err);
    return apiError(res, 500, 'Unable to run the AI wording queue.');
  }
});

async function analyticsFinalsFor(type: string, periodKey: string) {
  const { data } = await supabaseAdmin
    .from('analytics_reports')
    .select('id, report_no, status, finalised_at, finalised_by, reviewer')
    .eq('period_type', type).eq('period_key', periodKey).eq('status', 'FINAL');
  return data || [];
}

/**
 * PUT /api/analytics/draft
 *   { period_type, year, index, text_inputs }
 *
 * Saves what the analyst has written. The computed figures are saved with
 * it so a draft can be reopened exactly as it was left, but they are
 * recomputed on preview — a draft is working state, not a record.
 */
app.put('/api/analytics/draft', async (req, res) => {
  try {
    const resolved = await requireNmcStaff(req, res);
    if (!resolved) return;

    const ref = analyticsPeriodFromQuery(req);
    if (!ref) return apiError(res, 400, 'period_type, year and index are required.');
    const periodKey = analyticsPeriodKey(ref.type, ref.year, ref.index);

    const textInputs = req.body?.text_inputs;
    if (!textInputs || typeof textInputs !== 'object' || Array.isArray(textInputs)) {
      return apiError(res, 400, 'text_inputs must be an object.');
    }

    const source = await collectAnalyticsSource(supabaseAdmin, ref.type, ref.year, ref.index);
    const data = await buildAnalyticsReport(source, textInputs, periodKey);
    const problems = analyticsDataProblems(data);
    if (problems.length) {
      return apiError(res, 422, `The report data is incomplete: ${problems.slice(0, 3).join('; ')}`);
    }

    const actor = String(resolved.userRow?.username || resolved.userRow?.id || '');
    const values = {
      period_type: ref.type,
      period_key: periodKey,
      data_snapshot: data,
      text_inputs: textInputs,
      model_versions: { models: source.models.map(m => `${m.name} ${m.version}`) },
      // The analyst is the engine, taken from the built report rather than
      // from the request: the machine signs its own work and a client cannot
      // put a person's name on it.
      analyst: String((data as any).analyst_name || ''),
      analyst_position: String((data as any).analyst_position || ''),
      generated_by: actor,
    };

    const { data: existing } = await supabaseAdmin
      .from('analytics_reports').select('id')
      .eq('period_type', ref.type).eq('period_key', periodKey).eq('status', 'DRAFT').maybeSingle();

    const saved = existing?.id
      ? await supabaseAdmin.from('analytics_reports').update(values).eq('id', existing.id).select('*').single()
      : await supabaseAdmin.from('analytics_reports').insert({ ...values, status: 'DRAFT' }).select('*').single();
    if (saved.error) throw saved.error;

    return apiSuccess(res, { draft: { id: saved.data.id, updated_at: saved.data.updated_at } });
  } catch (err: any) {
    console.error('Analytics draft save failed:', err?.message || err);
    return apiError(res, 500, 'Unable to save the draft.');
  }
});

/**
 * POST /api/analytics/finalise
 *   { period_type, year, index, text_inputs, reviewer_name?, reviewer_position? }
 *
 * Approves the report. The snapshot is frozen here and never recomputed:
 * reprinting a report that has gone to the Director General must give
 * back what was sent, not today's view of the same months.
 */
app.post('/api/analytics/finalise', async (req, res) => {
  try {
    const resolved = await requireNmcStaff(req, res);
    if (!resolved) return;

    const ref = analyticsPeriodFromQuery(req);
    if (!ref) return apiError(res, 400, 'period_type, year and index are required.');
    const periodKey = analyticsPeriodKey(ref.type, ref.year, ref.index);

    const textInputs = (req.body?.text_inputs && typeof req.body.text_inputs === 'object')
      ? req.body.text_inputs : {};

    // Approving is a signature, and it must be a person's.
    //
    // The analyst is no longer asked for: the models and the AI agent do the
    // analysis and sign it themselves. The reviewer still is, and stays
    // required — an automated score must not be able to leave the Centre
    // without a named human having looked at it.
    const reviewer = String(textInputs.reviewer_name || '').replace(/\./g, '').trim();
    if (!reviewer) return apiError(res, 422, 'អ្នកពិនិត្យ: ត្រូវបំពេញឈ្មោះមុនអនុម័ត។');

    const source = await collectAnalyticsSource(supabaseAdmin, ref.type, ref.year, ref.index);
    const data = await buildAnalyticsReport(source, textInputs, periodKey);
    const problems = analyticsDataProblems(data);
    if (problems.length) {
      return apiError(res, 422, `The report data is incomplete: ${problems.slice(0, 3).join('; ')}`);
    }

    const actor = String(resolved.userRow?.username || resolved.userRow?.id || '');
    const now = new Date().toISOString();

    // Report number: NMC-ANL-<periodKey>-<nnn>, allocated only here.
    const { data: existingFinals } = await supabaseAdmin
      .from('analytics_reports').select('report_no')
      .eq('period_type', ref.type).eq('period_key', periodKey).eq('status', 'FINAL');
    const sequence = String((existingFinals || []).length + 1).padStart(3, '0');
    const reportNo = `NMC-ANL-${periodKey}-${sequence}`;

    /**
     * Letter number, allocated here and nowhere else.
     *
     * Counted across the calendar year rather than the reporting period,
     * because a letter register runs by year: the twelfth monthly report of
     * 2026 is letter 12, not letter 1 of December. A draft prints dots —
     * allocating on preview would burn numbers every time someone looked.
     *
     * Format assumed to be NNN/YY in Khmer numerals. It stays editable, so
     * if the Centre's register uses another form an officer can correct it
     * and the corrected value is what is frozen.
     */
    const signedYear = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Phnom_Penh' }).slice(0, 4);
    const { data: yearFinals } = await supabaseAdmin
      .from('analytics_reports').select('letter_no').eq('status', 'FINAL')
      .like('period_key', `${signedYear}%`);
    const letterSequence = String((yearFinals || []).length + 1).padStart(3, '0');
    const letterNo = toKhmerDigits(`${letterSequence}/${signedYear.slice(2)}`);

    const frozen = {
      ...data,
      report_no: reportNo,
      // An officer's own entry wins, for both registers.
      letter_no: String(textInputs.letter_no || '').replace(/[.\s]/g, '') ? textInputs.letter_no : letterNo,
    };

    const { data: saved, error } = await supabaseAdmin.from('analytics_reports').insert({
      period_type: ref.type,
      period_key: periodKey,
      report_no: reportNo,
      data_snapshot: frozen,
      text_inputs: textInputs,
      model_versions: { models: source.models.map(m => `${m.name} ${m.version}`) },
      analyst: String((data as any).analyst_name || ''),
      analyst_position: String((data as any).analyst_position || ''),
      reviewer: String(textInputs.reviewer_name || ''),
      reviewer_position: String(textInputs.reviewer_position || ''),
      status: 'FINAL',
      generated_by: actor,
      finalised_at: now,
      finalised_by: actor,
    }).select('*').single();
    if (error) throw error;

    // The draft has served its purpose; removing it keeps one live draft
    // per period and stops an approved period being edited by accident.
    await supabaseAdmin.from('analytics_reports').delete()
      .eq('period_type', ref.type).eq('period_key', periodKey).eq('status', 'DRAFT');

    return apiSuccess(res, { report: { id: saved.id, report_no: reportNo, data: frozen } });
  } catch (err: any) {
    console.error('Analytics finalise failed:', err?.message || err);
    return apiError(res, 500, 'Unable to approve the report.');
  }
});

/**
 * GET /api/analytics/report/:id
 *
 * A stored report, exactly as it was saved. For reprinting a FINAL.
 */
app.get('/api/analytics/report/:id', async (req, res) => {
  try {
    const resolved = await requireNmcStaff(req, res);
    if (!resolved) return;

    const { data, error } = await supabaseAdmin
      .from('analytics_reports').select('*').eq('id', String(req.params?.id || '')).maybeSingle();
    if (error) throw error;
    if (!data) return apiError(res, 404, 'Report not found.');

    return apiSuccess(res, { report: data });
  } catch (err: any) {
    console.error('Analytics report read failed:', err?.message || err);
    return apiError(res, 500, 'Unable to load the report.');
  }
});

/** GET /api/analytics/reports — what has been generated, newest first. */
app.get('/api/analytics/reports', async (req, res) => {
  try {
    const resolved = await requireNmcStaff(req, res);
    if (!resolved) return;

    const { data, error } = await supabaseAdmin
      .from('analytics_reports')
      .select('id, period_type, period_key, report_no, status, analyst, reviewer, generated_at, generated_by, finalised_at, finalised_by, updated_at')
      .order('generated_at', { ascending: false }).limit(100);
    if (error) throw error;

    return apiSuccess(res, { reports: data || [] });
  } catch (err: any) {
    console.error('Analytics report list failed:', err?.message || err);
    return apiError(res, 500, 'Unable to list the reports.');
  }
});

/**
 * PUT /api/analytics/anomaly-review
 *   { period_type, year, index, anomaly_key, review_status, note? }
 *
 * An officer's verdict on one anomaly. Only this endpoint moves an
 * anomaly off រង់ចាំពិនិត្យ — the analysis never decides for itself.
 */
app.put('/api/analytics/anomaly-review', async (req, res) => {
  try {
    const resolved = await requireNmcStaff(req, res);
    if (!resolved) return;

    const ref = analyticsPeriodFromQuery(req);
    if (!ref) return apiError(res, 400, 'period_type, year and index are required.');
    const periodKey = analyticsPeriodKey(ref.type, ref.year, ref.index);

    const key = String(req.body?.anomaly_key || '').trim();
    const status = String(req.body?.review_status || '').trim();
    if (!key) return apiError(res, 400, 'anomaly_key is required.');
    if (!ANALYTICS_REVIEW_STATUSES.includes(status as any)) {
      return apiError(res, 400, `review_status must be one of: ${ANALYTICS_REVIEW_STATUSES.join(' | ')}`);
    }

    const actor = String(resolved.userRow?.username || resolved.userRow?.id || '');
    const values = {
      period_type: ref.type, period_key: periodKey, anomaly_key: key,
      review_status: status, note: String(req.body?.note || '') || null,
      reviewed_by: actor, reviewed_at: new Date().toISOString(),
    };

    const { data: existing } = await supabaseAdmin
      .from('analytics_anomaly_reviews').select('id')
      .eq('period_type', ref.type).eq('period_key', periodKey).eq('anomaly_key', key).maybeSingle();

    const saved = existing?.id
      ? await supabaseAdmin.from('analytics_anomaly_reviews').update(values).eq('id', existing.id).select('*').single()
      : await supabaseAdmin.from('analytics_anomaly_reviews').insert(values).select('*').single();
    if (saved.error) throw saved.error;

    return apiSuccess(res, { review: saved.data });
  } catch (err: any) {
    console.error('Analytics anomaly review failed:', err?.message || err);
    return apiError(res, 500, 'Unable to record the review.');
  }
});

/**
 * POST /api/annex8/reports/:id/review   { action: 'accept' | 'return', comment? }
 *
 * NMC accepts a report, or returns it to the licensee for correction.
 *
 * A returned report keeps its receipt number. The licensee corrects and
 * re-submits the same report; it does not become a different one, and NMC's
 * records should not acquire a second number for the same month's return.
 *
 * Returning requires a comment. "Rejected" with no reason is not something a
 * licensee can act on, and the comment is what they are shown.
 */
app.post('/api/annex8/reports/:id/review', async (req, res) => {
  try {
    const resolved = await requireNmcStaff(req, res);
    if (!resolved) return;

    const id = String(req.params?.id || '').trim();
    const action = String(req.body?.action || '').trim().toLowerCase();
    const comment = String(req.body?.comment || '').trim();

    if (action !== 'accept' && action !== 'return') {
      return apiError(res, 400, "action must be 'accept' or 'return'.");
    }
    if (action === 'return' && !comment) {
      return apiError(res, 400, 'A comment is required when returning a report.');
    }

    const { data: report } = await supabaseAdmin
      .from('annex8_reports').select('*').eq('id', id).maybeSingle();
    if (!report) return apiError(res, 404, 'Report not found.');

    if (report.status === 'OPEN' || report.status === 'DRAFT') {
      return apiError(res, 409, 'That month has not been submitted yet.');
    }

    const now = new Date().toISOString();
    const reviewer = String(resolved.userRow?.username || resolved.userRow?.id || '');

    const patch: any = action === 'accept'
      ? {
          status: 'ACCEPTED',
          received_at: report.received_at || now,
          reviewer,
          is_complete: true,
          nmc_remarks: comment || report.nmc_remarks || null,
        }
      : {
          status: 'RETURNED',
          reviewer,
          is_complete: false,
          nmc_remarks: comment,
          returned_at: now,
          returned_by: reviewer,
        };

    const { data: updated, error } = await supabaseAdmin
      .from('annex8_reports').update(patch).eq('id', id).select('*').single();
    if (error) throw error;

    /**
     * Confirm the row really changed, by reading it back.
     *
     * A review that reports success without recording anything is the worst
     * outcome this endpoint has: the officer believes the report is handled,
     * the licensee is never told, and the register says it never happened.
     * The update's own return value is not proof — it is what the driver
     * says it wrote, and the two have disagreed in production.
     *
     * Costs one extra read on an action that happens a few times a day.
     */
    const { data: confirmed } = await supabaseAdmin
      .from('annex8_reports').select('status, reviewer').eq('id', id).maybeSingle();
    if (!confirmed || confirmed.status !== patch.status) {
      console.error('Annex 8 review did not persist:', {
        id, wanted: patch.status, found: confirmed?.status ?? '(row not found)',
      });
      return apiError(res, 500,
        `ប្រព័ន្ធមិនបានរក្សាទុកការសម្រេចទេ (ស្ថានភាពនៅតែ ${confirmed?.status || 'មិនស្គាល់'})។ សូមរាយការណ៍ទៅអ្នកគ្រប់គ្រងប្រព័ន្ធ។`);
    }
    await signalMlChange();

    await writeAnnex8Audit({
      report_uuid: id, licence_no: report.licence_no, period_month: report.period_month,
      entity: 'report', entity_id: id, action: action === 'accept' ? 'accept' : 'return',
      actor: String(resolved.userRow?.id || ''), actor_role: resolved.role,
      old_value: { status: report.status, nmc_remarks: report.nmc_remarks },
      new_value: patch,
    });

    return apiSuccess(res, { report: updated });
  } catch (err: any) {
    console.error('Annex 8 review failed:', err?.message || err);
    return apiError(res, 500, 'Unable to record the review.');
  }
});

/**
 * DELETE /api/annex8/reports/:id   { reason }
 *
 * Removes a report and, by foreign key, its entries.
 *
 * This is the one genuinely destructive action in the system, so three things
 * are true of it: only NMC staff can do it, a reason is required, and the
 * whole report plus its counts are written into the audit log BEFORE the rows
 * go — so what was deleted, by whom and why survives the deletion. The audit
 * table deliberately has no foreign key to the report for exactly this case.
 *
 * An ACCEPTED report is refused. Accepting is NMC's own confirmation that the
 * report is correct and complete; deleting it afterwards would erase that
 * decision as well as the report. Return it first if it must go.
 */
app.delete('/api/annex8/reports/:id', async (req, res) => {
  try {
    const resolved = await requireNmcStaff(req, res);
    if (!resolved) return;

    const id = String(req.params?.id || '').trim();
    const reason = String(req.body?.reason || '').trim();
    if (!reason) return apiError(res, 400, 'A reason is required to delete a report.');

    const { data: report } = await supabaseAdmin
      .from('annex8_reports').select('*').eq('id', id).maybeSingle();
    if (!report) return apiError(res, 404, 'Report not found.');

    if (report.status === 'ACCEPTED') {
      return apiError(res, 409,
        'An accepted report cannot be deleted. Return it to the licensee first.');
    }

    const entries = await loadMonthEntries(id);
    const counts = {
      instruments: entries.instruments.length,
      modules: entries.modules.length,
      repairs: entries.repairs.length,
      standards: entries.standards.length,
    };

    // Recorded first. If the delete then fails, there is a harmless extra
    // audit row; if the audit were written second and failed, the report
    // would be gone with no trace of who removed it.
    await writeAnnex8Audit({
      report_uuid: id, licence_no: report.licence_no, period_month: report.period_month,
      entity: 'report', entity_id: id, action: 'delete',
      actor: String(resolved.userRow?.id || ''), actor_role: resolved.role,
      old_value: { report, counts, reason },
    });

    const { error } = await supabaseAdmin.from('annex8_reports').delete().eq('id', id);
    if (error) throw error;

    return apiSuccess(res, { deleted: id, counts });
  } catch (err: any) {
    console.error('Annex 8 report delete failed:', err?.message || err);
    return apiError(res, 500, 'Unable to delete the report.');
  }
});

/**
 * GET /api/annex8/reports/:id/full
 *
 * One report, whole, for reading on screen: Part 1 through Part 7 as the
 * annex orders them, plus the NMC block.
 *
 * This exists so NMC can READ a report before accepting or returning it.
 * Downloading the Word to look at it, then coming back to the list to decide,
 * is how reports get accepted without being read.
 *
 * It is a view of the stored rows, not a second rendering of the official
 * document — the printed annex still comes only from the template. The two
 * are driven by the same rows, so what is read here is what prints.
 *
 * Owner licensee or NMC staff. A licensee may read back its own submitted
 * report; it cannot read anyone else's.
 */
app.get('/api/annex8/reports/:id/full', async (req, res) => {
  try {
    if (!supabaseAdmin) return apiError(res, 503, 'Server database provider is not configured.');

    const id = String(req.params?.id || '').trim();
    const { data: report } = await supabaseAdmin
      .from('annex8_reports').select('*').eq('id', id).maybeSingle();
    if (!report) return apiError(res, 404, 'Report not found.');

    const resolved = await requireAnnex8Licence(req, res, String(report.licence_no || ''));
    if (!resolved) return;

    const [entries, totals, carryOver, profile, licence] = await Promise.all([
      loadMonthEntries(id),
      monthTotals(id),
      supabaseAdmin.from('annex8_carry_over_updates').select('*').eq('report_uuid', id),
      supabaseAdmin.from('annex8_licence_profiles').select('*')
        .eq('license_number', report.licence_no).maybeSingle(),
      supabaseAdmin.from('enterprise_licenses').select('*')
        .eq('license_number', report.licence_no).maybeSingle(),
    ]);

    return apiSuccess(res, {
      report,
      entries,
      totals,
      carry_over: carryOver.data || [],
      // Part 1 and Part 7 print from the licence record, so they are sent
      // with it rather than read a second time by the page.
      licence: {
        company_name_kh: licence.data?.company_name_kh || report.enterprise_name_kh || '',
        company_name: licence.data?.company_name || report.enterprise_name_en || '',
        address: licence.data?.company_address || '',
        phone: licence.data?.phone_number || '',
        email: licence.data?.email || '',
        owner_name: licence.data?.license_owner_name || '',
        owner_position: licence.data?.license_owner_position || '',
        expiry: licence.data?.license_expiry_date || '',
      },
      profile: {
        registration_no: profile.data?.registration_no || report.registration_no || '',
        decision_no: profile.data?.decision_no || '',
        operating_address: profile.data?.operating_address || report.operating_address || '',
        contact_name: profile.data?.contact_name || report.contact_name || '',
        contact_position: profile.data?.contact_position || report.contact_position || '',
        legal_rep_name: profile.data?.legal_rep_name || '',
        legal_rep_position: profile.data?.legal_rep_position || '',
      },
      deadline: deadlineDate(String(report.period_month || '')),
      is_staff: ['superadmin', 'admin'].includes(resolved.role),
    });
  } catch (err: any) {
    console.error('Annex 8 full report failed:', err?.message || err);
    return apiError(res, 500, 'Unable to load the report.');
  }
});

/**
 * GET /api/annex8/reports/:id/audit
 *
 * Who did what to this report. NMC reviewing a submission should be able to
 * see the trail behind it without opening the database.
 */
app.get('/api/annex8/reports/:id/audit', async (req, res) => {
  try {
    const resolved = await requireNmcStaff(req, res);
    if (!resolved) return;

    const id = String(req.params?.id || '').trim();
    const { data, error } = await supabaseAdmin
      .from('annex8_report_audit_log').select('*')
      .eq('report_uuid', id).order('created_at', { ascending: false }).limit(200);
    if (error) throw error;

    return apiSuccess(res, { entries: data || [] });
  } catch (err: any) {
    console.error('Annex 8 audit read failed:', err?.message || err);
    return apiError(res, 500, 'Unable to load the audit trail.');
  }
});

app.get('/api/annex8/reports-list', async (req, res) => {
  try {
    if (!supabaseAdmin) return apiError(res, 503, 'Server database provider is not configured.');

    const licenceNo = String(req.query?.licence_no || '').trim();
    const resolved = await requireAnnex8Licence(req, res, licenceNo);
    if (!resolved) return;

    const { data: reports, error } = await supabaseAdmin
      .from('annex8_reports')
      .select('*')
      .eq('licence_no', licenceNo)
      .order('period_month', { ascending: false });
    if (error) throw error;

    const rows = reports || [];
    const ids = rows.map((r: any) => r.id).filter(Boolean);

    // Two queries for every report, not two per report.
    const empty = { data: [] as any[] };
    const [instruments, repairs, modules, standards] = ids.length
      ? await Promise.all([
          supabaseAdmin.from('annex8_report_instruments')
            .select('report_uuid,op_code,category,verification_status').in('report_uuid', ids).is('deleted_at', null),
          supabaseAdmin.from('annex8_report_repairs')
            .select('report_uuid,category,verification_status').in('report_uuid', ids).is('deleted_at', null),
          supabaseAdmin.from('annex8_report_modules')
            .select('report_uuid').in('report_uuid', ids).is('deleted_at', null),
          supabaseAdmin.from('annex8_report_standards')
            .select('report_uuid').in('report_uuid', ids).is('deleted_at', null),
        ])
      : [empty, empty, empty, empty];

    const blank = () => ({
      manufactured: 0, installed: 0, repaired: 0,
      passed: 0, failed: 0, pending: 0,
      instruments: 0, modules: 0, repairs: 0, standards: 0,
      categories: new Set<string>(),
    });
    const tally = new Map<string, ReturnType<typeof blank>>();
    const get = (id: string) => {
      if (!tally.has(id)) tally.set(id, blank());
      return tally.get(id)!;
    };
    const judge = (t: any, status: string) => {
      if (status === 'PASSED') t.passed++;
      else if (status === 'FAILED') t.failed++;
      else t.pending++;
    };

    for (const i of instruments.data || []) {
      const t = get(String(i.report_uuid));
      t.instruments++;
      if (i.op_code === 'M') t.manufactured++; else t.installed++;
      if (i.category) t.categories.add(String(i.category));
      judge(t, String(i.verification_status || 'PENDING'));
    }
    for (const p of repairs.data || []) {
      const t = get(String(p.report_uuid));
      t.repairs++; t.repaired++;
      if (p.category) t.categories.add(String(p.category));
      judge(t, String(p.verification_status || 'PENDING'));
    }
    for (const m of modules.data || []) get(String(m.report_uuid)).modules++;
    for (const s of standards.data || []) get(String(s.report_uuid)).standards++;

    const list = rows.map((r: any) => {
      const t = tally.get(String(r.id)) || blank();
      const { categories, ...counts } = t;
      return {
        id: r.id,
        period_month: r.period_month,
        report_id: r.report_id,
        report_type: r.report_type,
        status: r.status,
        on_time: r.on_time,
        submitted_at: r.submitted_at,
        updated_at: r.updated_at,
        format_version: r.format_version,
        original_report_id: r.original_report_id,
        nmc_remarks: r.nmc_remarks,
        editable: isEditableStatus(r.status),
        deadline: deadlineDate(String(r.period_month || '')),
        has_document: !!(r.official_docx_path || r.report_id),
        categories: Array.from(categories).sort(),
        counts,
        total_entries: counts.instruments + counts.modules + counts.repairs + counts.standards,
      };
    });

    const filed = list.filter((r) => r.status !== 'OPEN' && r.status !== 'DRAFT');
    return apiSuccess(res, {
      licence_no: licenceNo,
      reports: list,
      summary: {
        total: list.length,
        filed: filed.length,
        open: list.filter((r) => r.status === 'OPEN' || r.status === 'DRAFT').length,
        returned: list.filter((r) => r.status === 'RETURNED').length,
        accepted: list.filter((r) => r.status === 'ACCEPTED').length,
        late: filed.filter((r) => r.on_time === false).length,
        instruments: list.reduce((n, r) => n + r.counts.instruments, 0),
        repairs: list.reduce((n, r) => n + r.counts.repairs, 0),
      },
    });
  } catch (err: any) {
    console.error('Annex 8 reports-list failed:', err?.message || err);
    return apiError(res, 500, 'Unable to load the report list.');
  }
});

app.get('/api/annex8/my-reports', async (req, res) => {
  try {
    if (!supabaseAdmin) return apiError(res, 503, 'Server database provider is not configured.');

    const resolved = await resolveApiUser(req);
    if (!resolved) return res.status(401).json({ error: 'Authentication required.' });
    if (!['superadmin', 'admin', 'company'].includes(resolved.role)) {
      return res.status(403).json({ error: 'Insufficient permission.' });
    }

    const licenceNo = String(req.query?.licence_no || '').trim();
    if (!licenceNo) return apiError(res, 400, 'licence_no is required.');

    // A company account may only look at its own licence.
    if (resolved.role === 'company') {
      const own = String(resolved.userRow?.license_number || '').trim();
      if (!own || own !== licenceNo) {
        return res.status(403).json({ error: 'This licence belongs to another enterprise.' });
      }
    }

    const months = Math.min(Math.max(Number(req.query?.months) || 13, 1), 36);

    const [reportsRes, draftsRes] = await Promise.all([
      supabaseAdmin
        .from('annex8_reports')
        .select('period_month, report_id, status, on_time, submitted_at, report_type')
        .eq('licence_no', licenceNo),
      supabaseAdmin
        .from('annex8_report_drafts')
        .select('period_month, updated_at')
        .eq('licence_no', licenceNo),
    ]);
    if (reportsRes.error) throw reportsRes.error;

    const byPeriod = new Map<string, any>();
    for (const r of reportsRes.data || []) {
      const key = String(r.period_month);
      const prev = byPeriod.get(key);
      // An amendment supersedes the original for calendar purposes.
      if (!prev || String(r.submitted_at || '') > String(prev.submitted_at || '')) byPeriod.set(key, r);
    }
    const draftAt = new Map<string, string>();
    for (const d of draftsRes.data || []) {
      draftAt.set(String(d.period_month), String(d.updated_at || ''));
    }

    // Walk back from the month that is currently reportable: the one that just
    // ended. The current month is not reportable until it is over.
    const periods: any[] = [];
    const start = previousPeriod();
    const [sy, sm] = start.split('-').map(Number);
    for (let i = 0; i < months; i++) {
      const d = new Date(Date.UTC(sy, sm - 1 - i, 1));
      const period = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
      const report = byPeriod.get(period) || null;
      periods.push({
        period_month: period,
        status: report ? String(report.status || 'SUBMITTED')
          : draftAt.has(period) ? 'DRAFT' : 'NOT_STARTED',
        report_id: report?.report_id || null,
        report_type: report?.report_type || null,
        on_time: report?.on_time ?? null,
        submitted_at: report?.submitted_at || null,
        draft_updated_at: draftAt.get(period) || null,
        deadline: `${period}-${String(DEADLINE_DAY).padStart(2, '0')}`,
      });
    }

    // Months still owed, soonest first — what the form nudges about.
    const outstanding = periods
      .filter((p) => p.status === 'NOT_STARTED' || p.status === 'DRAFT')
      .map((p) => p.period_month);

    return apiSuccess(res, {
      licence_no: licenceNo,
      current_period: start,
      periods,
      outstanding,
      submitted_count: periods.filter((p) => p.status !== 'NOT_STARTED' && p.status !== 'DRAFT').length,
    });
  } catch (err: any) {
    console.error('Annex 8 my-reports failed:', err?.message || err);
    return apiError(res, 500, 'Unable to load the reporting calendar.');
  }
});

app.get('/api/annex8/draft', async (req, res) => {
  try {
    if (!supabaseAdmin) return apiError(res, 503, 'Server database provider is not configured.');
    if (!(await requireApiRole(req, res, ['superadmin', 'admin', 'company']))) return;

    const licenceNo = String(req.query?.licence_no || '').trim();
    const month = String(req.query?.month || '').trim();
    if (!licenceNo || !month) return apiError(res, 400, 'licence_no and month are required.');

    const { data } = await supabaseAdmin
      .from('annex8_report_drafts').select('payload, updated_at')
      .eq('licence_no', licenceNo).eq('period_month', month).maybeSingle();

    return apiSuccess(res, { draft: data?.payload || null, updated_at: data?.updated_at || null });
  } catch (err: any) {
    console.error('Annex 8 draft load failed:', err?.message || err);
    return apiError(res, 500, 'Unable to load the draft.');
  }
});

app.put('/api/annex8/draft', async (req, res) => {
  try {
    if (!supabaseAdmin) return apiError(res, 503, 'Server database provider is not configured.');
    if (!(await requireApiRole(req, res, ['superadmin', 'admin', 'company']))) return;

    const payload = req.body?.payload as Annex8State | undefined;
    if (!payload?.meta?.licence_no || !payload?.meta?.period_month) {
      return apiError(res, 400, 'A draft payload with licence_no and period_month is required.');
    }

    const { error } = await supabaseAdmin.from('annex8_report_drafts').upsert({
      licence_no: payload.meta.licence_no,
      period_month: payload.meta.period_month,
      payload,
      updated_by: String(req.body?.updated_by || ''),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'licence_no,period_month' });

    if (error) {
      console.error('Annex 8 draft save failed:', error.message || error);
      return apiError(res, 500, 'Unable to save the draft.');
    }
    return apiSuccess(res, { saved_at: new Date().toISOString() });
  } catch (err: any) {
    console.error('Annex 8 draft save exception:', err?.message || err);
    return apiError(res, 500, 'Unable to save the draft.');
  }
});

/*
 * The one-shot submit endpoint, POST /api/annex8/reports, was removed here.
 *
 * It wrote a whole month in a single request and set the report straight to
 * SUBMITTED, skipping OPEN and the review. It also wrote no audit entries at
 * all, so a report filed through it left no record of who entered what —
 * against the rule that every create, update, delete and submit is logged.
 * Its only caller was the Full form, which is gone. Reports are now written
 * one entry at a time through /api/annex8/entries and submitted through
 * /api/annex8/month/submit, which validates, computes Part 2 and audits.
 */

/**
 * Official Annex 8 documents.
 *
 * GET /api/reports/:id/annex8.docx
 * GET /api/reports/:id/annex8.pdf
 *
 * Readable by the licensee that owns the report, or by NMC staff. The PDF is
 * generated once at submission and served from storage afterwards, so the file
 * a licensee downloads is byte-for-byte the one NMC received.
 */
async function serveOfficialAnnex8(req: any, res: any, ext: 'docx' | 'pdf') {
  try {
    if (!supabaseAdmin) return apiError(res, 503, 'Server database provider is not configured.');

    const role = await resolveApiRole(req);
    if (!role) return res.status(401).json({ error: 'Authentication required.' });

    const reportUuid = String(req.params?.id || '').trim();
    if (!reportUuid) return apiError(res, 400, 'Report id is required.');

    const { data: report } = await supabaseAdmin
      .from('annex8_reports')
      .select('*')
      .eq('id', reportUuid)
      .maybeSingle();
    if (!report) return apiError(res, 404, 'Report not found.');
    if (report.status === 'DRAFT') {
      return apiError(res, 409, 'A draft has no official document yet.');
    }

    // Owner licensee or NMC staff only.
    const isStaff = ['superadmin', 'admin'].includes(role);
    if (!isStaff) {
      const ownsIt = await licenceBelongsToRequester(req, report.licence_no);
      if (!ownsIt) return res.status(403).json({ error: 'This report belongs to another licensee.' });
    }

    const fileName = officialFileName(report, ext);
    const sealDownload = async (bytes: Buffer) => {
      const resolved = await resolveApiUser(req);
      return sealServerReport(bytes, { kind: 'annex8', format: ext, title: 'NMC Monthly Report',
        issuer: String(resolved?.userRow?.id || ''), licence: report.licence_no, period: report.period_month,
        basis: ['OPEN', 'DRAFT'].includes(report.status) ? 'draft' : 'database', snapshot: report });
    };
    // Render with the template the report was submitted under, never the latest.
    const version = report.template_version || DEFAULT_TEMPLATE_VERSION;

    // Prefer the stored official file.
    const storedPath = ext === 'pdf' ? report.official_pdf_path : report.official_docx_path;
    if (storedPath) {
      const buf = await getOfficialDocument(supabaseAdmin, storedPath);
      if (buf) {
        res.setHeader('Content-Type', ext === 'pdf'
          ? 'application/pdf'
          : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
        res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
        return res.end(await sealDownload(buf));
      }
      console.warn(`Stored Annex 8 ${ext} missing from ${OFFICIAL_BUCKET}, re-rendering: ${storedPath}`);
    }

    const input = await loadAnnex8RenderInput(supabaseAdmin, reportUuid);
    if (!input) return apiError(res, 404, 'Report not found.');

    let docx: Buffer;
    try {
      docx = renderOfficialDocx(input, version);
    } catch (err: any) {
      if (err instanceof Annex8TemplateMissingError) {
        return apiError(res, 503,
          `Annex 8 template assets are not installed on the server: ${err.missing.join(', ')}`);
      }
      throw err;
    }

    const body = ext === 'docx'
      ? docx
      : await convertDocxToPdf(docx, officialFileName(report, 'docx'));

    // Backfill storage so the next download is served from the stored file.
    try {
      const stored = await putOfficialDocument(supabaseAdmin, report, ext, body);
      await supabaseAdmin.from('annex8_reports').update({
        [`official_${ext}_path`]: stored.path,
        [`official_${ext}_sha256`]: stored.sha256,
        official_rendered_at: report.official_rendered_at || new Date().toISOString(),
        official_render_error: null,
      }).eq('id', reportUuid);
    } catch (err: any) {
      console.warn('Annex 8 storage backfill failed:', err?.message || err);
    }

    res.setHeader('Content-Type', ext === 'pdf'
      ? 'application/pdf'
      : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    return res.end(await sealDownload(body));
  } catch (err: any) {
    console.error(`Annex 8 ${ext} render failed:`, err?.message || err);
    return apiError(res, 500, `Unable to produce the Annex 8 ${ext.toUpperCase()}.`);
  }
}

/** True when the requesting account holds the licence the report belongs to. */
/**
 * Does this request belong to the licensee it claims?
 *
 * This used to resolve the caller itself, from a bearer token only, and
 * returned false when there was no token — which denied an owner their own
 * report on every path that is not Supabase Auth, including the whole MySQL
 * driver. It now goes through resolveApiUser(), the same resolver every other
 * Annex 8 endpoint uses, so one definition of "who is calling" serves them
 * all and they cannot disagree.
 */
async function licenceBelongsToRequester(req: any, licenceNo: string): Promise<boolean> {
  if (!supabaseAdmin || !licenceNo) return false;

  const resolved = await resolveApiUser(req);
  if (!resolved) return false;
  if (['superadmin', 'admin'].includes(resolved.role)) return true;

  const own = String(resolved.userRow?.license_number || '').trim();
  return !!own && own === String(licenceNo).trim();
}

app.get('/api/reports/:id/annex8.docx', (req, res) => serveOfficialAnnex8(req, res, 'docx'));
app.get('/api/reports/:id/annex8.pdf', (req, res) => serveOfficialAnnex8(req, res, 'pdf'));

/** Whether the server can currently produce official documents. */
app.get('/api/annex8/render-status', async (req, res) => {
  if (!(await requireApiRole(req, res, ['superadmin', 'admin']))) return;
  const status = officialAssetsStatus();
  return apiSuccess(res, {
    template_ready: status.ready,
    missing: status.missing,
    gotenberg_configured: !!process.env.GOTENBERG_URL,
    storage_driver: STORAGE_DRIVER,
    storage_bucket: OFFICIAL_BUCKET,
  });
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
    const hmrPort = Number(process.env.VITE_HMR_PORT || (24678 + Math.max(0, PORT - 3000)));
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        // Downloaded Word files may be locked briefly on Windows. They are
        // generated test artifacts, not application source to watch for HMR.
        watch: process.env.DISABLE_HMR === 'true' ? null : { ignored: ['**/test-output/**'] },
        hmr: process.env.DISABLE_HMR === 'true'
          ? false
          : {
              port: hmrPort,
              clientPort: hmrPort,
            },
      },
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

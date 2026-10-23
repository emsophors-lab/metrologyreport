/**
 * Where the AI analyst's provider comes from.
 *
 * An administrator sets this on the settings screen — Gemini, Claude or
 * ChatGPT, with a key and a model list — so changing provider does not mean
 * redeploying with new environment variables. The environment stays as the
 * fallback, so a deployment configured that way keeps working and a machine
 * with no database row still has an agent.
 *
 * THE KEY NEVER GOES BACK TO A BROWSER. `forClient` replaces it with a
 * placeholder, and a save that sends the placeholder back means "keep the
 * key you have". The same handling as the Telegram bot token.
 */
import { PROVIDER_INFO, generatorFor, isProviderName } from './aiProviders';
import type { ProviderName } from './aiProviders';
import { aiConfigFromEnv, splitModels } from './aiAnalyst';
import type { AiConfig } from './aiAnalyst';

const TABLE = 'analytics_ai_settings';
const ROW = 'main';

/** What the API sends in place of a stored key. */
export const PROTECTED = 'PROTECTED_SERVER_SIDE';

export interface AiSettingsRow {
  provider: ProviderName;
  models: string;
  api_key_encrypted: string | null;
  is_active: boolean;
  last_test_status: string | null;
  last_test_message: string | null;
  last_tested_at: string | null;
  updated_by: string | null;
  updated_at: string | null;
}

const isPlaceholder = (value: unknown) => {
  const raw = String(value ?? '').trim();
  return !raw || raw === PROTECTED || /^[*•●]+$/.test(raw);
};

/** The stored row, or null when the table is absent or empty. */
export async function readAiSettings(db: any): Promise<AiSettingsRow | null> {
  try {
    const { data, error } = await db.from(TABLE).select('*').eq('id', ROW).maybeSingle();
    if (error || !data) return null;
    return {
      ...data,
      provider: isProviderName(data.provider) ? data.provider : 'gemini',
      is_active: data.is_active === true || data.is_active === 1,
    } as AiSettingsRow;
  } catch {
    // The migration not being applied is not an error: the environment
    // fallback still works, and so does the deterministic drafter.
    return null;
  }
}

/**
 * The row as a browser may see it.
 *
 * Reports whether a key is held, never the key. `key_hint` is the last four
 * characters only, which is enough to tell two keys apart when someone is
 * checking they pasted the right one, and not enough to use.
 */
export function forClient(row: AiSettingsRow | null) {
  const key = String(row?.api_key_encrypted || '');
  return {
    provider: row?.provider || 'gemini',
    models: row?.models || '',
    is_active: !!row?.is_active,
    api_key: key ? PROTECTED : '',
    key_set: !!key,
    key_hint: key.length > 4 ? `…${key.slice(-4)}` : '',
    last_test_status: row?.last_test_status || null,
    last_test_message: row?.last_test_message || null,
    last_tested_at: row?.last_tested_at || null,
    updated_by: row?.updated_by || null,
    updated_at: row?.updated_at || null,
    // So the screen can offer sensible defaults and a link to get a key.
    providers: PROVIDER_INFO,
  };
}

export interface SaveAiSettingsInput {
  provider?: unknown;
  models?: unknown;
  api_key?: unknown;
  is_active?: unknown;
}

/**
 * Save the settings, keeping the stored key when none is supplied.
 *
 * Returns the problem as a string rather than throwing, so the endpoint can
 * answer 400 with something an administrator can act on.
 */
export async function saveAiSettings(
  db: any, input: SaveAiSettingsInput, actor: string,
): Promise<{ row: AiSettingsRow | null; problem?: string }> {
  const existing = await readAiSettings(db);

  const provider: ProviderName = isProviderName(input.provider)
    ? input.provider as ProviderName
    : (existing?.provider || 'gemini');

  const models = typeof input.models === 'string' && input.models.trim()
    ? input.models.trim()
    : (existing?.models || PROVIDER_INFO[provider].defaultModels);
  if (!splitModels(models).length) {
    return { row: existing, problem: 'At least one model name is required.' };
  }
  if (models.length > 500) return { row: existing, problem: 'The model list is too long.' };

  // A blank or placeholder key means "leave the one you have".
  const key = isPlaceholder(input.api_key)
    ? (existing?.api_key_encrypted || '')
    : String(input.api_key).trim();
  if (key.length > 400) return { row: existing, problem: 'That does not look like an API key.' };

  const active = input.is_active === true || input.is_active === 'true';
  if (active && !key) {
    return { row: existing, problem: 'An API key is required before the AI analyst can be switched on.' };
  }

  const values: Record<string, unknown> = {
    provider, models, api_key_encrypted: key || null,
    is_active: active, updated_by: actor, updated_at: new Date().toISOString(),
  };
  // Changing provider or key makes the last test result meaningless.
  if (provider !== existing?.provider || key !== (existing?.api_key_encrypted || '')) {
    values.last_test_status = null;
    values.last_test_message = null;
    values.last_tested_at = null;
  }

  const { error } = await db.from(TABLE).update(values).eq('id', ROW);
  if (error) return { row: existing, problem: `Unable to save: ${error.message || error}` };
  return { row: await readAiSettings(db) };
}

/** Record how a connection test went, so the screen can show it later. */
export async function recordAiTest(db: any, ok: boolean, message: string) {
  try {
    await db.from(TABLE).update({
      last_test_status: ok ? 'ok' : 'failed',
      last_test_message: message.slice(0, 500),
      last_tested_at: new Date().toISOString(),
    }).eq('id', ROW);
  } catch { /* a settings table that cannot be written is not worth failing a test over */ }
}

/**
 * The agent's configuration: the database's if it is switched on, the
 * environment's otherwise.
 *
 * The database wins because that is the screen an administrator just used.
 * The environment is the fallback rather than an override, so turning the
 * agent off on the screen actually turns it off.
 */
export async function resolveAiConfig(db: any): Promise<AiConfig | null> {
  const row = await readAiSettings(db);
  if (row?.is_active && row.api_key_encrypted) {
    const models = splitModels(row.models).length
      ? splitModels(row.models)
      : splitModels(PROVIDER_INFO[row.provider].defaultModels);
    try {
      return { provider: row.provider, models, generate: generatorFor(row.provider, row.api_key_encrypted) };
    } catch {
      return null;
    }
  }
  // Explicitly switched off on the screen: honour that, do not fall back.
  if (row && !row.is_active && row.api_key_encrypted) return null;
  return aiConfigFromEnv();
}

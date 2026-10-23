/**
 * The AI providers the analyst agent can use: Gemini, Claude, or ChatGPT.
 *
 * Each is one HTTPS POST returning JSON. No vendor SDK: for a single
 * generate call an SDK buys nothing and couples the report to a package
 * version — and one of them has already hung for a full timeout here where
 * plain fetch answered in under a second.
 *
 * Everything that makes the agent safe to use in an official report lives in
 * aiAnalyst.ts and applies whichever provider answers: no invented figures,
 * no licensee named to it, no decision taken by it, and a fall back to the
 * deterministic drafter when its answer cannot be used. A provider is only
 * a way of getting text; it is never trusted.
 */
export type ProviderName = 'gemini' | 'claude' | 'openai';

export const PROVIDERS: ProviderName[] = ['gemini', 'claude', 'openai'];

/** How each provider is described on screen, and what a key looks like. */
export const PROVIDER_INFO: Record<ProviderName, {
  label: string; keyUrl: string; defaultModels: string; keyHint: string;
}> = {
  gemini: {
    label: 'Google Gemini',
    keyUrl: 'https://aistudio.google.com/apikey',
    defaultModels: 'gemini-3.8-flash,gemini-flash-latest',
    keyHint: 'AIza… or AQ.…',
  },
  claude: {
    label: 'Anthropic Claude',
    keyUrl: 'https://console.anthropic.com/settings/keys',
    defaultModels: 'claude-sonnet-5-5',
    keyHint: 'sk-ant-…',
  },
  openai: {
    label: 'OpenAI ChatGPT',
    keyUrl: 'https://platform.openai.com/api-keys',
    defaultModels: 'gpt-5.1',
    keyHint: 'sk-…',
  },
};

export const isProviderName = (value: unknown): value is ProviderName =>
  PROVIDERS.includes(String(value) as ProviderName);

/** A provider call: prompt in, JSON text out, or throw with the provider's words. */
export type Generate = (prompt: string, model: string, signal: AbortSignal) => Promise<string>;

/**
 * The provider's own error message, kept.
 *
 * Flattening these to "AI failed" cost a long time once already: it was the
 * provider that said which model had been retired and what to use instead,
 * and that a quota was exhausted rather than the service being down.
 */
async function readError(response: Response): Promise<string> {
  const body = await response.json().catch(() => null) as any;
  return body?.error?.message
    || body?.error?.type
    || body?.message
    || `HTTP ${response.status}`;
}

const geminiGenerate = (apiKey: string): Generate => async (prompt, model, signal) => {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    {
      method: 'POST', signal,
      headers: { 'x-goog-api-key': apiKey, 'content-type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: 'application/json', temperature: 0.2 },
      }),
    });
  if (!response.ok) throw new Error(await readError(response));
  const body = await response.json() as any;
  if (body?.error) throw new Error(body.error.message || 'the provider returned an error');
  const parts = body?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) {
    throw new Error(`the answer had no content (finishReason: ${body?.candidates?.[0]?.finishReason || 'none'})`);
  }
  return parts.map((part: any) => String(part?.text || '')).join('');
};

const claudeGenerate = (apiKey: string): Generate => async (prompt, model, signal) => {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST', signal,
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model,
      max_tokens: 4096,
      temperature: 0.2,
      // Claude has no JSON mode; the prompt already demands JSON only, and
      // aiAnalyst refuses anything that does not parse.
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  if (!response.ok) throw new Error(await readError(response));
  const body = await response.json() as any;
  const blocks = body?.content;
  if (!Array.isArray(blocks)) throw new Error('the answer had no content');
  return blocks.filter((b: any) => b?.type === 'text').map((b: any) => String(b.text || '')).join('');
};

const openaiGenerate = (apiKey: string): Generate => async (prompt, model, signal) => {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST', signal,
    headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      response_format: { type: 'json_object' },
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  if (!response.ok) throw new Error(await readError(response));
  const body = await response.json() as any;
  const text = body?.choices?.[0]?.message?.content;
  if (typeof text !== 'string' || !text) {
    throw new Error(`the answer had no content (finish_reason: ${body?.choices?.[0]?.finish_reason || 'none'})`);
  }
  return text;
};

const BUILDERS: Record<ProviderName, (apiKey: string) => Generate> = {
  gemini: geminiGenerate,
  claude: claudeGenerate,
  openai: openaiGenerate,
};

export function generatorFor(provider: ProviderName, apiKey: string): Generate {
  const build = BUILDERS[provider];
  if (!build) throw new Error(`Unknown AI provider: ${provider}`);
  return build(apiKey);
}

export const GEMINI_BRIEF_MODEL = 'gemini-4-hydrogen';
export const GEMINI_BRIEF_ENDPOINT = '/api/editorial/generate-brief';

export interface GeminiBriefRuntimeStatus {
  enabled: boolean;
  killSwitchActive: boolean;
  hasApiKey: boolean;
  model: string;
  endpoint: string;
  billingScopeNote: string;
}

/**
 * Default-off kill switch for external Gemini API calls.
 * Unless ENABLE_GEMINI_AI_BRIEF is explicitly 'true' (and GEMINI_API_KEY is present),
 * zero requests are sent to Google GenAI / Gemini APIs, guaranteeing Rs 0 AI API cost.
 */
export function resolveGeminiBriefStatus(
  env: Record<string, string | undefined> = process.env,
): GeminiBriefRuntimeStatus {
  const flag = (env.ENABLE_GEMINI_AI_BRIEF || '').trim().toLowerCase() === 'true';
  const hasApiKey = Boolean((env.GEMINI_API_KEY || '').trim());
  const enabled = flag && hasApiKey;
  return {
    enabled,
    killSwitchActive: !flag,
    hasApiKey,
    model: GEMINI_BRIEF_MODEL,
    endpoint: GEMINI_BRIEF_ENDPOINT,
    billingScopeNote:
      'External Gemini API usage is NOT covered by the Firebase Spark free tier. Keep ENABLE_GEMINI_AI_BRIEF=false unless explicitly opted in with a controlled key.',
  };
}

import type { AgentInfo } from '@/lib/generation/pipeline-types';

const TRUE_VALUES = new Set(['1', 'true', 'yes', 'on']);

export function isIa50InternalMode(): boolean {
  return TRUE_VALUES.has((process.env.IA50_INTERNAL_MODE ?? '').trim().toLowerCase());
}

export function isAllowedIa50ApiPath(pathname: string): boolean {
  return (
    pathname === '/api/ia50/tutor' ||
    pathname === '/api/classroom' ||
    pathname === '/api/generate-classroom' ||
    /^\/api\/generate-classroom\/[A-Za-z0-9_-]{1,80}$/.test(pathname) ||
    /^\/api\/classroom-media\/[A-Za-z0-9_-]{1,160}\/.+/.test(pathname)
  );
}

export function getIa50TeacherAgents(): AgentInfo[] {
  return [
    {
      id: 'ia50-clara',
      name: 'Clara',
      role: 'teacher',
      persona:
        'Professora brasileira acolhedora e paciente, especializada em ensinar inteligência artificial para pessoas com 50 anos ou mais. Usa frases curtas, explica termos novos, oferece exemplos cotidianos e conduz uma única ação pedagógica por vez.',
    },
  ];
}

export interface Ia50ClassroomInput {
  enableWebSearch?: boolean;
  webSearchProviderId?: unknown;
  webSearchApiKey?: string;
  baiduSubSources?: unknown;
  enableImageGeneration?: boolean;
  enableVideoGeneration?: boolean;
  enableTTS?: boolean;
  agentMode?: 'default' | 'generate';
}

export interface Ia50ContentFeatureGates {
  webSearch: boolean;
  imageGeneration: boolean;
  videoGeneration: boolean;
  tts: boolean;
}

function enabledByEnvironment(name: string): boolean {
  return TRUE_VALUES.has((process.env[name] ?? '').trim().toLowerCase());
}

/**
 * These are spend-bearing, editorial capabilities. They are opt-in on the
 * server and never enabled by data supplied by a browser or platform client.
 * Provider availability is checked separately by the server pipeline.
 */
export function getIa50ContentFeatureGates(): Ia50ContentFeatureGates {
  return {
    webSearch: enabledByEnvironment('IA50_CONTENT_WEB_SEARCH'),
    imageGeneration: enabledByEnvironment('IA50_CONTENT_IMAGE_GENERATION'),
    videoGeneration: enabledByEnvironment('IA50_CONTENT_VIDEO_GENERATION'),
    tts: enabledByEnvironment('IA50_CONTENT_TTS'),
  };
}

export function constrainIa50ClassroomInput<T extends Ia50ClassroomInput>(input: T): T {
  if (!isIa50InternalMode()) return input;
  const gates = getIa50ContentFeatureGates();
  const {
    // Internal requests may ask for a capability, but provider identity and
    // credentials always come from server-owned configuration.
    webSearchProviderId: _ignoredWebSearchProviderId,
    webSearchApiKey: _ignoredWebSearchApiKey,
    baiduSubSources: _ignoredBaiduSubSources,
    ...safeInput
  } = input;
  return {
    ...safeInput,
    enableWebSearch: input.enableWebSearch === true && gates.webSearch,
    enableImageGeneration: input.enableImageGeneration === true && gates.imageGeneration,
    enableVideoGeneration: input.enableVideoGeneration === true && gates.videoGeneration,
    enableTTS: input.enableTTS === true && gates.tts,
    agentMode: 'generate',
  } as T;
}

export function ia50GenerationRetryLimit(): number | undefined {
  return isIa50InternalMode() ? 1 : undefined;
}

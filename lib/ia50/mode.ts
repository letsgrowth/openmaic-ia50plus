import type { AgentInfo } from '@/lib/generation/pipeline-types';

const TRUE_VALUES = new Set(['1', 'true', 'yes', 'on']);

export function isIa50InternalMode(): boolean {
  return TRUE_VALUES.has((process.env.IA50_INTERNAL_MODE ?? '').trim().toLowerCase());
}

export function isAllowedIa50ApiPath(pathname: string): boolean {
  return (
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
  enableImageGeneration?: boolean;
  enableVideoGeneration?: boolean;
  enableTTS?: boolean;
  agentMode?: 'default' | 'generate';
}

/**
 * Media generation, web search, server TTS and autonomous agent generation
 * stay disabled in the MVP. Approved media is attached later by IA 50+ admins.
 */
export function constrainIa50ClassroomInput<T extends Ia50ClassroomInput>(input: T): T {
  if (!isIa50InternalMode()) return input;
  return {
    ...input,
    enableWebSearch: false,
    enableImageGeneration: false,
    enableVideoGeneration: false,
    enableTTS: false,
    agentMode: 'default',
  };
}

export function ia50GenerationRetryLimit(): number | undefined {
  return isIa50InternalMode() ? 1 : undefined;
}

import { afterEach, describe, expect, test } from 'vitest';

import { hasValidIa50Bearer } from '@/lib/ia50/internal-auth';
import {
  constrainIa50ClassroomInput,
  getIa50TeacherAgents,
  isAllowedIa50ApiPath,
  ia50GenerationRetryLimit,
} from '@/lib/ia50/mode';

afterEach(() => {
  delete process.env.IA50_INTERNAL_MODE;
});

describe('IA 50+ internal mode', () => {
  test('accepts only the exact platform bearer token', () => {
    const token = 'ia50-internal-secret-with-32-chars-minimum';
    expect(hasValidIa50Bearer(`Bearer ${token}`, token)).toBe(true);
    expect(hasValidIa50Bearer(`Bearer ${token.slice(0, -1)}u`, token)).toBe(false);
    expect(hasValidIa50Bearer(`Basic ${token}`, token)).toBe(false);
    expect(hasValidIa50Bearer(null, token)).toBe(false);
    expect(hasValidIa50Bearer('Bearer anything', '')).toBe(false);
    expect(hasValidIa50Bearer('Bearer short-secret', 'short-secret')).toBe(false);
  });

  test('uses Clara as the only persistent classroom agent', () => {
    const agents = getIa50TeacherAgents();

    expect(agents).toHaveLength(1);
    expect(agents[0]).toMatchObject({
      id: 'ia50-clara',
      name: 'Clara',
      role: 'teacher',
    });
  });

  test('exposes only the classroom engine API surface', () => {
    expect(isAllowedIa50ApiPath('/api/generate-classroom')).toBe(true);
    expect(isAllowedIa50ApiPath('/api/generate-classroom/job_123')).toBe(true);
    expect(isAllowedIa50ApiPath('/api/classroom')).toBe(true);
    expect(isAllowedIa50ApiPath('/api/classroom-media/aula_1/video/intro.mp4')).toBe(true);
    expect(isAllowedIa50ApiPath('/api/generate/image')).toBe(false);
    expect(isAllowedIa50ApiPath('/api/web-search')).toBe(false);
    expect(isAllowedIa50ApiPath('/api/proxy-media')).toBe(false);
    expect(isAllowedIa50ApiPath('/')).toBe(false);
  });

  test('disables optional heavy or unreviewed generation capabilities', () => {
    process.env.IA50_INTERNAL_MODE = 'true';

    expect(
      constrainIa50ClassroomInput({
        enableWebSearch: true,
        enableImageGeneration: true,
        enableVideoGeneration: true,
        enableTTS: true,
        agentMode: 'generate',
      }),
    ).toEqual({
      enableWebSearch: false,
      enableImageGeneration: false,
      enableVideoGeneration: false,
      enableTTS: false,
      agentMode: 'default',
    });
    expect(ia50GenerationRetryLimit()).toBe(1);
  });
});

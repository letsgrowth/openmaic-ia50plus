import { afterEach, describe, expect, test } from 'vitest';

import { hasValidIa50Bearer } from '@/lib/ia50/internal-auth';
import {
  constrainIa50ClassroomInput,
  getIa50ContentFeatureGates,
  getIa50TeacherAgents,
  isAllowedIa50ApiPath,
  ia50GenerationRetryLimit,
} from '@/lib/ia50/mode';
import {
  constrainIa50TutorDecision,
  ia50TutorRequestSchema,
  type Ia50TutorDecision,
} from '@/lib/ia50/tutor-contract';

afterEach(() => {
  delete process.env.IA50_INTERNAL_MODE;
  delete process.env.IA50_CONTENT_WEB_SEARCH;
  delete process.env.IA50_CONTENT_IMAGE_GENERATION;
  delete process.env.IA50_CONTENT_VIDEO_GENERATION;
  delete process.env.IA50_CONTENT_TTS;
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
    expect(isAllowedIa50ApiPath('/api/ia50/tutor')).toBe(true);
    expect(isAllowedIa50ApiPath('/api/generate-classroom')).toBe(true);
    expect(isAllowedIa50ApiPath('/api/generate-classroom/job_123')).toBe(true);
    expect(isAllowedIa50ApiPath('/api/classroom')).toBe(true);
    expect(isAllowedIa50ApiPath('/api/classroom-media/aula_1/video/intro.mp4')).toBe(true);
    expect(isAllowedIa50ApiPath('/api/generate/image')).toBe(false);
    expect(isAllowedIa50ApiPath('/api/web-search')).toBe(false);
    expect(isAllowedIa50ApiPath('/api/proxy-media')).toBe(false);
    expect(isAllowedIa50ApiPath('/')).toBe(false);
  });

  test('requires the complete platform identity context for tutor turns', () => {
    const valid = {
      platform_context: {
        user_id: '11111111-1111-4111-8111-111111111111',
        session_id: '22222222-2222-4222-8222-222222222222',
        course_id: null,
        lesson_id: null,
        subscription_plan: 'Essencial',
        remaining_credits: 42,
        accessibility_profile: {
          font_scale: 1.25,
          high_contrast: false,
          reduced_motion: false,
          simplified_mode: true,
          reading_speed: 0.9,
          voice_volume: 0.75,
          captions_enabled: true,
          confirm_before_advance: true,
          playback_mode: 'manual',
          auto_read_responses: false,
        },
      },
      material: {
        task: 'Explique inteligência artificial.',
        context: '',
        memory_context: '',
        requested_mode: 'auto',
        suggested_mode: 'professor',
      },
      learner_context: { personalization_enabled: true },
      approved_content: [],
    };

    expect(ia50TutorRequestSchema.safeParse(valid).success).toBe(true);
    expect(
      ia50TutorRequestSchema.safeParse({
        ...valid,
        platform_context: { ...valid.platform_context, session_id: undefined },
      }).success,
    ).toBe(false);
    expect(
      ia50TutorRequestSchema.safeParse({ ...valid, arbitrary_url: 'https://example.com' }).success,
    ).toBe(false);
  });

  test('degrades invented or incomplete content actions to safe text', () => {
    const decision: Ia50TutorDecision = {
      message: 'Vamos por partes.',
      mode: 'professor',
      title: 'Introdução',
      summary: 'Uma explicação curta.',
      steps: [
        {
          title: 'Primeiro passo',
          instruction: 'Leia a explicação.',
          verification: 'Diga com suas palavras.',
        },
      ],
      cautions: [],
      questions_to_confirm: [],
      requires_human_review: false,
      confidence: 'alta',
      action: 'show_video',
      content_id: 'video-inventado',
      wait_for_completion: true,
      in_platform_scope: true,
    };

    expect(constrainIa50TutorDecision(decision, new Set(['video-aprovado']))).toMatchObject({
      action: 'show_text',
      content_id: null,
      wait_for_completion: false,
    });
    expect(
      constrainIa50TutorDecision(
        { ...decision, content_id: 'video-aprovado' },
        new Set(['video-aprovado']),
      ),
    ).toEqual({ ...decision, content_id: 'video-aprovado' });
  });

  test('keeps spend-bearing content capabilities closed unless server gates enable them', () => {
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
      agentMode: 'generate',
    });
    expect(ia50GenerationRetryLimit()).toBe(1);
  });

  test('allows only server-gated content capabilities and strips client provider credentials', () => {
    process.env.IA50_INTERNAL_MODE = 'true';
    process.env.IA50_CONTENT_WEB_SEARCH = 'true';
    process.env.IA50_CONTENT_IMAGE_GENERATION = '1';
    process.env.IA50_CONTENT_VIDEO_GENERATION = 'on';

    expect(getIa50ContentFeatureGates()).toEqual({
      webSearch: true,
      imageGeneration: true,
      videoGeneration: true,
      tts: false,
    });
    expect(
      constrainIa50ClassroomInput({
        requirement: 'Ensine a usar IA com segurança',
        enableWebSearch: true,
        webSearchProviderId: 'tavily',
        webSearchApiKey: 'client-supplied-key-must-not-be-used',
        baiduSubSources: { webSearch: true, baike: true, scholar: true },
        enableImageGeneration: true,
        enableVideoGeneration: true,
        enableTTS: true,
        agentMode: 'default',
      }),
    ).toEqual({
      requirement: 'Ensine a usar IA com segurança',
      enableWebSearch: true,
      enableImageGeneration: true,
      enableVideoGeneration: true,
      enableTTS: false,
      agentMode: 'generate',
    });
  });
});

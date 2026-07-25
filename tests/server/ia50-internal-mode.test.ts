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
  IA50_TUTOR_MAX_OUTPUT_TOKENS,
  IA50_TUTOR_MAX_TOTAL_WORDS,
  constrainIa50TutorDecision,
  ia50TutorDecisionSchema,
  ia50TutorRequestSchema,
  recoverIa50TutorDecision,
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
  test('keeps enough output budget for the complete structured tutor contract', () => {
    expect(IA50_TUTOR_MAX_OUTPUT_TOKENS).toBe(1024);
    expect(IA50_TUTOR_MAX_TOTAL_WORDS).toBe(250);
  });

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
    expect(isAllowedIa50ApiPath('/api/ia50/tts')).toBe(true);
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

    const approvedContent = new Map([
      [
        'video-aprovado',
        {
          content_type: 'demonstration',
          media_kind: 'video' as const,
        },
      ],
      [
        'imagem-aprovada',
        {
          content_type: 'demonstration',
          media_kind: 'image' as const,
        },
      ],
      ['quiz-aprovado', { content_type: 'quiz' }],
    ]);

    expect(constrainIa50TutorDecision(decision, approvedContent)).toMatchObject({
      action: 'show_text',
      content_id: null,
      wait_for_completion: false,
    });
    expect(
      constrainIa50TutorDecision({ ...decision, content_id: 'video-aprovado' }, approvedContent),
    ).toEqual({ ...decision, content_id: 'video-aprovado' });
    expect(
      constrainIa50TutorDecision(
        {
          ...decision,
          action: 'show_video',
          content_id: 'imagem-aprovada',
        },
        approvedContent,
      ),
    ).toMatchObject({
      action: 'show_text',
      content_id: null,
      wait_for_completion: false,
    });
    expect(
      constrainIa50TutorDecision(
        {
          ...decision,
          action: 'show_quiz',
          content_id: 'quiz-aprovado',
        },
        approvedContent,
      ),
    ).toMatchObject({
      action: 'show_quiz',
      content_id: 'quiz-aprovado',
      wait_for_completion: true,
    });
    expect(
      ia50TutorDecisionSchema.safeParse({
        ...decision,
        message: 'x'.repeat(601),
      }).success,
    ).toBe(false);
    expect(
      ia50TutorDecisionSchema.safeParse({
        ...decision,
        steps: Array.from({ length: 6 }, () => decision.steps[0]),
      }).success,
    ).toBe(false);
  });

  test('recovers a truncated structured response as a safe text-only decision', () => {
    const recovered = recoverIa50TutorDecision(
      {
        mode: 'professor',
        action: 'request_human_help',
        content_id: 'video-inventado',
        wait_for_completion: true,
        in_platform_scope: true,
        confidence: 'alta',
        message:
          '<b>Inteligência artificial</b> ajuda sistemas a reconhecer padrões. ' +
          'Veja https://example.com/segredo e javascript:alert(1) para continuar.\u0000',
        title: 'Cinco passos',
        summary: 'Comece entendendo o objetivo e avance com uma checagem por vez.',
        steps: [
          {
            title: 'Defina o objetivo',
            instruction: 'Escolha uma tarefa simples para praticar.',
            verification: 'Explique qual resultado você espera.',
          },
          {
            title: 'Passo incompleto',
            instruction: 'Compare a resposta com uma fonte confiável.',
          },
          { title: 'Sem instrução' },
        ],
        cautions: ['Não compartilhe dados pessoais.', 'Confira informações importantes.'],
        questions_to_confirm: ['Quer praticar agora?'],
      },
      'professor',
    );

    expect(recovered).not.toBeNull();
    expect(ia50TutorDecisionSchema.safeParse(recovered).success).toBe(true);
    expect(recovered).toMatchObject({
      mode: 'professor',
      action: 'show_text',
      content_id: null,
      wait_for_completion: false,
      confidence: 'alta',
    });
    expect(recovered?.message).not.toContain('<b>');
    expect(recovered?.message).not.toContain('https://');
    expect(recovered?.message).not.toContain('javascript:');
    expect(recovered?.steps).toHaveLength(2);
    expect(recovered?.steps[1]?.verification).toBe('Diga com suas palavras o que entendeu.');
  });

  test('recovers message-only output and rejects unusable partials', () => {
    const recovered = recoverIa50TutorDecision(
      { message: 'Uma explicação útil que chegou antes do limite.' },
      'copiloto',
    );

    expect(recovered).toMatchObject({
      mode: 'copiloto',
      action: 'show_text',
      title: 'Vamos aprender juntos',
      steps: [
        {
          title: 'Confira a explicação',
          verification: 'Diga com suas palavras o que entendeu.',
        },
      ],
    });
    expect(recoverIa50TutorDecision({ message: '   ' }, 'professor')).toBeNull();
    expect(recoverIa50TutorDecision(null, 'professor')).toBeNull();
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

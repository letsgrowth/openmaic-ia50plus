import { streamObject } from 'ai';
import { MockLanguageModelV3, convertArrayToReadableStream } from 'ai/test';
import { describe, expect, test } from 'vitest';

import { ia50TutorDecisionSchema, recoverIa50TutorDecision } from '@/lib/ia50/tutor-contract';

type DoStreamConfig = NonNullable<
  NonNullable<ConstructorParameters<typeof MockLanguageModelV3>[0]>['doStream']
>;
type StreamResult = Extract<DoStreamConfig, { stream: unknown }>;
type StreamPart = StreamResult['stream'] extends ReadableStream<infer Part> ? Part : never;

const USAGE = {
  inputTokens: { total: 1_121, noCache: 1_121, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 1_024, text: 1_024, reasoning: 0 },
};

function truncatedModel(text: string): MockLanguageModelV3 {
  const parts: StreamPart[] = [
    { type: 'stream-start', warnings: [] },
    { type: 'text-start', id: 'response' },
    { type: 'text-delta', id: 'response', delta: text },
    { type: 'text-end', id: 'response' },
    {
      type: 'finish',
      finishReason: { unified: 'length', raw: 'length' },
      usage: USAGE,
    },
  ];
  return new MockLanguageModelV3({
    doStream: async () => ({ stream: convertArrayToReadableStream(parts) }),
  });
}

describe('IA50 tutor truncation recovery', () => {
  test('keeps the last useful partial when the final JSON hits the token cap', async () => {
    const result = streamObject({
      model: truncatedModel(
        JSON.stringify({
          mode: 'professor',
          action: 'request_human_help',
          content_id: null,
          wait_for_completion: true,
          in_platform_scope: true,
          requires_human_review: false,
          confidence: 'alta',
          message: 'Uma explicação útil chegou inteira antes do limite.',
          title: 'Explicação',
          summary: 'Resumo breve.',
        }).slice(0, -1) + ',"steps":[{"title":"Primeiro passo","instruction":"Faça',
      ),
      schema: ia50TutorDecisionSchema,
      prompt: 'Explique inteligência artificial em cinco passos.',
      maxOutputTokens: 1_024,
    });
    const objectOutcome = result.object.then(
      (decision) => ({ success: true as const, decision }),
      (error: unknown) => ({ success: false as const, error }),
    );

    let lastPartial: unknown = null;
    for await (const partial of result.partialObjectStream) {
      lastPartial = partial;
    }
    const outcome = await objectOutcome;

    expect(outcome.success).toBe(false);
    const recovered = recoverIa50TutorDecision(lastPartial, 'professor');
    expect(recovered).toMatchObject({
      action: 'show_text',
      content_id: null,
      wait_for_completion: false,
      message: 'Uma explicação útil chegou inteira antes do limite.',
    });
    expect(ia50TutorDecisionSchema.safeParse(recovered).success).toBe(true);
  });
});

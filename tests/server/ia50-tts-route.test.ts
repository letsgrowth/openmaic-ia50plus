import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  generateTTS: vi.fn(),
  recordGenerationUsage: vi.fn(),
}));

vi.mock('@/lib/audio/tts-providers', () => {
  class TTSRateLimitError extends Error {}
  return {
    generateTTS: mocks.generateTTS,
    TTSRateLimitError,
  };
});

vi.mock('@/lib/server/usage-storage', () => ({
  recordGenerationUsage: mocks.recordGenerationUsage,
}));

vi.mock('@/lib/logger', () => ({
  createLogger: () => ({
    error: vi.fn(),
  }),
}));

import { POST } from '@/app/api/ia50/tts/route';

function request(body: unknown): Request {
  return new Request('http://openmaic.test/api/ia50/tts', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.stubEnv('IA50_INTERNAL_MODE', 'true');
  vi.stubEnv('IA50_CONTENT_TTS', 'true');
  vi.stubEnv('OPENAI_API_KEY', 'internal-gateway-key');
  vi.stubEnv('OPENAI_BASE_URL', 'http://litellm:4000/v1');
  vi.stubEnv('IA50_TTS_MODEL', 'clara-ptbr-tts');
  mocks.generateTTS.mockResolvedValue({
    audio: new Uint8Array([73, 68, 51, 1, 2, 3]),
    format: 'mp3',
    generationId: 'generation-42',
  });
  mocks.recordGenerationUsage.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe('IA 50+ internal TTS route', () => {
  test('pins model, voice, gateway and returns an ephemeral MP3', async () => {
    const response = await POST(
      request({
        input: 'Olá, vamos aprender juntos.',
        voice: 'pf_dora',
        speed: 1,
        response_format: 'mp3',
      }) as never,
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('audio/mpeg');
    expect(response.headers.get('cache-control')).toContain('no-store');
    expect(response.headers.get('x-tts-model')).toBe('clara-ptbr-tts');
    expect(response.headers.get('x-tts-voice')).toBe('pf_dora');
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(
      new Uint8Array([73, 68, 51, 1, 2, 3]),
    );
    expect(mocks.generateTTS).toHaveBeenCalledWith(
      {
        providerId: 'openai-tts',
        modelId: 'clara-ptbr-tts',
        voice: 'pf_dora',
        speed: 1,
        format: 'mp3',
        apiKey: 'internal-gateway-key',
        baseUrl: 'http://litellm:4000/v1',
      },
      'Olá, vamos aprender juntos.',
    );
    expect(mocks.recordGenerationUsage).toHaveBeenCalledWith({
      kind: 'tts',
      unit: 'character',
      providerId: 'openrouter',
      modelId: 'clara-ptbr-tts',
      quantity: 27,
    });
  });

  test('rejects arbitrary voices and request fields', async () => {
    const response = await POST(
      request({
        input: 'Teste',
        voice: 'arbitrary-cloned-voice',
        speed: 1,
        response_format: 'mp3',
        apiKey: 'browser-key',
      }) as never,
    );

    expect(response.status).toBe(400);
    expect(mocks.generateTTS).not.toHaveBeenCalled();
  });

  test('fails closed when the gate is disabled or alias is changed', async () => {
    vi.stubEnv('IA50_CONTENT_TTS', 'false');
    const disabled = await POST(
      request({
        input: 'Teste',
        voice: 'pf_dora',
        speed: 1,
        response_format: 'mp3',
      }) as never,
    );
    expect(disabled.status).toBe(503);

    vi.stubEnv('IA50_CONTENT_TTS', 'true');
    vi.stubEnv('IA50_TTS_MODEL', 'arbitrary-model');
    const unpinned = await POST(
      request({
        input: 'Teste',
        voice: 'pf_dora',
        speed: 1,
        response_format: 'mp3',
      }) as never,
    );
    expect(unpinned.status).toBe(503);
    expect(mocks.generateTTS).not.toHaveBeenCalled();
  });
});

import type { NextRequest } from 'next/server';
import { z } from 'zod';

import { generateTTS, TTSRateLimitError } from '@/lib/audio/tts-providers';
import { getIa50ContentFeatureGates, isIa50InternalMode } from '@/lib/ia50/mode';
import { createLogger } from '@/lib/logger';
import { recordGenerationUsage } from '@/lib/server/usage-storage';

export const maxDuration = 30;

const MAX_REQUEST_BYTES = 8 * 1024;
const MAX_AUDIO_BYTES = 8 * 1024 * 1024;
const log = createLogger('IA50 TTS Runtime');
const requestSchema = z
  .object({
    input: z.string().trim().min(1).max(1_600),
    voice: z.literal('pf_dora'),
    speed: z.number().min(0.75).max(1.25).default(1),
    response_format: z.literal('mp3'),
  })
  .strict();

function errorResponse(status: number, code: string, message: string): Response {
  return Response.json(
    { success: false, errorCode: code, error: message },
    {
      status,
      headers: { 'Cache-Control': 'no-store' },
    },
  );
}

export async function POST(request: NextRequest): Promise<Response> {
  if (!isIa50InternalMode() || !getIa50ContentFeatureGates().tts) {
    return errorResponse(503, 'PROVIDER_DISABLED', 'Clara voice is disabled');
  }
  const rawBody = await request.text();
  if (new TextEncoder().encode(rawBody).byteLength > MAX_REQUEST_BYTES) {
    return errorResponse(413, 'INVALID_REQUEST', 'Request is too large');
  }

  let decoded: unknown;
  try {
    decoded = JSON.parse(rawBody);
  } catch {
    return errorResponse(400, 'INVALID_REQUEST', 'Request body must be valid JSON');
  }
  const parsed = requestSchema.safeParse(decoded);
  if (!parsed.success) {
    return errorResponse(400, 'INVALID_REQUEST', 'Invalid Clara voice request');
  }

  const apiKey = process.env.OPENAI_API_KEY ?? '';
  const baseUrl = (process.env.OPENAI_BASE_URL ?? '').replace(/\/$/, '');
  const modelId = process.env.IA50_TTS_MODEL ?? 'clara-ptbr-tts';
  if (!apiKey || !baseUrl || modelId !== 'clara-ptbr-tts') {
    return errorResponse(503, 'PROVIDER_DISABLED', 'Clara voice is unavailable');
  }

  const input = parsed.data;
  try {
    const result = await generateTTS(
      {
        providerId: 'openai-tts',
        modelId,
        voice: input.voice,
        speed: input.speed,
        format: input.response_format,
        apiKey,
        baseUrl,
      },
      input.input,
    );
    if (!result.audio.length || result.audio.length > MAX_AUDIO_BYTES || result.format !== 'mp3') {
      throw new Error('Invalid Clara voice response');
    }
    await recordGenerationUsage({
      kind: 'tts',
      unit: 'character',
      providerId: 'openrouter',
      modelId,
      quantity: input.input.length,
    });
    const audioBody = Uint8Array.from(result.audio).buffer;
    return new Response(audioBody, {
      status: 200,
      headers: {
        'Content-Type': 'audio/mpeg',
        'Cache-Control': 'no-store, private',
        'X-Content-Type-Options': 'nosniff',
        'X-TTS-Provider': 'openrouter',
        'X-TTS-Model': modelId,
        'X-TTS-Voice': input.voice,
        ...(result.generationId ? { 'X-Generation-ID': result.generationId.slice(0, 160) } : {}),
      },
    });
  } catch (error) {
    if (error instanceof TTSRateLimitError) {
      return errorResponse(429, 'RATE_LIMITED', 'Clara voice rate limit reached');
    }
    log.error('Clara voice generation failed', {
      errorName: error instanceof Error ? error.name : 'UnknownError',
    });
    return errorResponse(502, 'GENERATION_FAILED', 'Clara voice generation failed');
  }
}

import { z } from 'zod';

export const IA50_TUTOR_MAX_OUTPUT_TOKENS = 1024;
export const IA50_TUTOR_MAX_TOTAL_WORDS = 250;

export const IA50_TUTOR_ACTIONS = [
  'show_text',
  'show_video',
  'show_image',
  'read_aloud',
  'ask_question',
  'show_quiz',
  'evaluate_answer',
  'explain_again',
  'simplify_explanation',
  'repeat_step',
  'previous_step',
  'next_step',
  'save_progress',
  'complete_lesson',
  'request_human_help',
] as const;

const tutorActionSchema = z.enum(IA50_TUTOR_ACTIONS);

const platformContextSchema = z
  .object({
    user_id: z.string().uuid(),
    session_id: z.string().uuid(),
    course_id: z.string().uuid().nullable(),
    lesson_id: z.string().uuid().nullable(),
    subscription_plan: z.string().min(1).max(120),
    remaining_credits: z.number().int().nonnegative(),
    accessibility_profile: z
      .object({
        font_scale: z.number().min(1).max(2),
        high_contrast: z.boolean(),
        reduced_motion: z.boolean(),
        simplified_mode: z.boolean(),
        reading_speed: z.number().min(0.5).max(2),
        voice_volume: z.number().min(0).max(1),
        captions_enabled: z.boolean(),
        confirm_before_advance: z.boolean(),
        playback_mode: z.enum(['manual', 'automatic']),
        auto_read_responses: z.boolean(),
      })
      .strict(),
  })
  .strict();

const approvedContentSchema = z
  .object({
    content_id: z.string().regex(/^[a-z0-9][a-z0-9._:-]{0,159}$/),
    content_type: z.string().min(1).max(80),
    lesson_title: z.string().min(1).max(240),
    block_order: z.number().int().min(0).max(100),
    media_kind: z.enum(['image', 'video']).optional(),
  })
  .strict();

export const ia50TutorRequestSchema = z
  .object({
    platform_context: platformContextSchema,
    material: z
      .object({
        task: z.string().min(3).max(2_000),
        context: z.string().max(2_000),
        memory_context: z.string().max(1_500),
        requested_mode: z.enum(['auto', 'professor', 'copiloto', 'guardiao', 'avaliador']),
        suggested_mode: z.enum(['professor', 'copiloto', 'guardiao', 'avaliador']),
      })
      .strict(),
    learner_context: z.record(z.string(), z.unknown()),
    approved_content: z.array(approvedContentSchema).max(24),
  })
  .strict();

export const ia50TutorDecisionSchema = z
  .object({
    mode: z.enum(['professor', 'copiloto', 'guardiao', 'avaliador']),
    action: tutorActionSchema,
    content_id: z
      .string()
      .regex(/^[a-z0-9][a-z0-9._:-]{0,159}$/)
      .nullable(),
    wait_for_completion: z.boolean(),
    in_platform_scope: z.boolean(),
    requires_human_review: z.boolean(),
    confidence: z.enum(['baixa', 'média', 'alta']),
    message: z.string().min(1).max(600),
    title: z.string().min(1).max(80),
    summary: z.string().min(1).max(200),
    steps: z
      .array(
        z
          .object({
            title: z.string().min(1).max(50),
            instruction: z.string().min(1).max(140),
            verification: z.string().min(1).max(100),
          })
          .strict(),
      )
      .min(1)
      .max(5),
    cautions: z.array(z.string().min(1).max(140)).max(2),
    questions_to_confirm: z.array(z.string().min(1).max(140)).max(2),
  })
  .strict();

export type Ia50TutorRequest = z.infer<typeof ia50TutorRequestSchema>;
export type Ia50TutorDecision = z.infer<typeof ia50TutorDecisionSchema>;

type TutorMode = Ia50TutorDecision['mode'];

const TUTOR_MODES = new Set<TutorMode>(['professor', 'copiloto', 'guardiao', 'avaliador']);
const TUTOR_CONFIDENCE = new Set<Ia50TutorDecision['confidence']>(['baixa', 'média', 'alta']);
const CONTROL_CHARACTERS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g;
const HTML_TAG = /<\/?[a-z][^>]*>/giu;
const URL = /\b(?:https?:\/\/|ftp:\/\/|www\.|javascript:|data:|file:)\S+/giu;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function boundedTutorText(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') return null;
  const cleaned = value
    .replace(CONTROL_CHARACTERS, '')
    .replace(HTML_TAG, '')
    .replace(URL, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return null;
  if (cleaned.length <= maxLength) return cleaned;
  const sliced = cleaned.slice(0, maxLength);
  const atWordBoundary = sliced.replace(/\s+\S*$/u, '').trim();
  return atWordBoundary || sliced.trim();
}

function boundedTutorList(value: unknown, maxItems: number): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => boundedTutorText(item, 140))
    .filter((item): item is string => item !== null)
    .slice(0, maxItems);
}

/**
 * Turns a meaningful partial model object into a schema-valid, text-only
 * decision. This is a fail-safe for providers that stream useful text but hit
 * their output cap before closing the JSON object. Recovered output can never
 * trigger media, ticket, progress or lesson-completion side effects.
 */
export function recoverIa50TutorDecision(
  partial: unknown,
  suggestedMode: TutorMode,
): Ia50TutorDecision | null {
  if (!isRecord(partial)) return null;
  const message = boundedTutorText(partial.message, 600) ?? boundedTutorText(partial.summary, 200);
  if (!message) return null;

  const rawSteps = Array.isArray(partial.steps) ? partial.steps : [];
  const steps = rawSteps
    .map((rawStep, index) => {
      if (!isRecord(rawStep)) return null;
      const instruction = boundedTutorText(rawStep.instruction, 140);
      if (!instruction) return null;
      return {
        title: boundedTutorText(rawStep.title, 50) ?? `Passo ${index + 1}`,
        instruction,
        verification:
          boundedTutorText(rawStep.verification, 100) ?? 'Diga com suas palavras o que entendeu.',
      };
    })
    .filter((step): step is NonNullable<typeof step> => step !== null)
    .slice(0, 5);

  if (steps.length === 0) {
    steps.push({
      title: 'Confira a explicação',
      instruction: boundedTutorText(message, 140) ?? message.slice(0, 140),
      verification: 'Diga com suas palavras o que entendeu.',
    });
  }

  const mode =
    typeof partial.mode === 'string' && TUTOR_MODES.has(partial.mode as TutorMode)
      ? (partial.mode as TutorMode)
      : suggestedMode;
  const confidence =
    typeof partial.confidence === 'string' &&
    TUTOR_CONFIDENCE.has(partial.confidence as Ia50TutorDecision['confidence'])
      ? (partial.confidence as Ia50TutorDecision['confidence'])
      : 'baixa';
  const candidate: Ia50TutorDecision = {
    mode,
    action: 'show_text',
    content_id: null,
    wait_for_completion: false,
    in_platform_scope:
      typeof partial.in_platform_scope === 'boolean' ? partial.in_platform_scope : true,
    requires_human_review:
      typeof partial.requires_human_review === 'boolean' ? partial.requires_human_review : false,
    confidence,
    message,
    title: boundedTutorText(partial.title, 80) ?? 'Vamos aprender juntos',
    summary: boundedTutorText(partial.summary, 200) ?? boundedTutorText(message, 200) ?? message,
    steps,
    cautions: boundedTutorList(partial.cautions, 2),
    questions_to_confirm: boundedTutorList(partial.questions_to_confirm, 2),
  };
  const parsed = ia50TutorDecisionSchema.safeParse(candidate);
  return parsed.success ? parsed.data : null;
}

const CONTENT_ACTIONS = new Set<(typeof IA50_TUTOR_ACTIONS)[number]>([
  'show_video',
  'show_image',
  'show_quiz',
]);

/**
 * The model may only select an identifier that the platform included in the
 * approved catalog. Invalid references degrade to text instead of becoming a
 * URL, iframe or unreviewed action.
 */
export function constrainIa50TutorDecision(
  decision: Ia50TutorDecision,
  approvedContentIds: ReadonlySet<string>,
): Ia50TutorDecision {
  if (decision.content_id && !approvedContentIds.has(decision.content_id)) {
    return {
      ...decision,
      action: 'show_text',
      content_id: null,
      wait_for_completion: false,
    };
  }
  if (CONTENT_ACTIONS.has(decision.action) && !decision.content_id) {
    return {
      ...decision,
      action: 'show_text',
      wait_for_completion: false,
    };
  }
  return decision;
}

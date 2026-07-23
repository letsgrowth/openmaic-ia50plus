import { z } from 'zod';

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
    message: z.string().min(1).max(1_600),
    mode: z.enum(['professor', 'copiloto', 'guardiao', 'avaliador']),
    title: z.string().min(1).max(160),
    summary: z.string().min(1).max(900),
    steps: z
      .array(
        z
          .object({
            title: z.string().min(1).max(120),
            instruction: z.string().min(1).max(500),
            verification: z.string().min(1).max(300),
          })
          .strict(),
      )
      .min(1)
      .max(6),
    cautions: z.array(z.string().min(1).max(400)).max(4),
    questions_to_confirm: z.array(z.string().min(1).max(300)).max(3),
    requires_human_review: z.boolean(),
    confidence: z.enum(['baixa', 'média', 'alta']),
    action: tutorActionSchema,
    content_id: z
      .string()
      .regex(/^[a-z0-9][a-z0-9._:-]{0,159}$/)
      .nullable(),
    wait_for_completion: z.boolean(),
    in_platform_scope: z.boolean(),
  })
  .strict();

export type Ia50TutorRequest = z.infer<typeof ia50TutorRequestSchema>;
export type Ia50TutorDecision = z.infer<typeof ia50TutorDecisionSchema>;

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

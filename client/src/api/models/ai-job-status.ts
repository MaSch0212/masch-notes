export type AiJobStatus =
  | ('queued')
  | ('transcribing')
  | ('composing')
  | ('done')
  | ('failed')
  | ('cancelled');

/**
 * All possible values of the enum `AiJobStatus`.
 */
export const AI_JOB_STATUS_VALUES = [
  'queued',
  'transcribing',
  'composing',
  'done',
  'failed',
  'cancelled'
] as const;

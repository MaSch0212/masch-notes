import type { AiJobStatus } from './ai-job-status';
import type { AiResult } from './ai-result';

export type AiJob = {
    jobId: string;
    status: AiJobStatus;
    result?: AiResult;

    /**
     * Error code when status is failed.
     */
    error?: string;
  };

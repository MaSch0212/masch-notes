import type { AiJob } from './ai-job';
import type { WsServerMessageType } from './ws-server-message-type';

export type WsServerMessage = {
    type: WsServerMessageType;
    job?: AiJob;
    error?: string;
  };

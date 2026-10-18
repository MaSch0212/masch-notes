import type { WsClientMessageType } from './ws-client-message-type';

export type WsClientMessage = {
    type: WsClientMessageType;
    token: string;
  };

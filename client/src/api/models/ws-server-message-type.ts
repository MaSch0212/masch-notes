export type WsServerMessageType = ('authOk') | ('error') | ('aiJob');

/**
 * All possible values of the enum `WsServerMessageType`.
 */
export const WS_SERVER_MESSAGE_TYPE_VALUES = ['authOk', 'error', 'aiJob'] as const;

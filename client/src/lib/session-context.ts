import { createContext, useContext } from 'solid-js';
import { session as defaultSession, type Session } from './session';

export const SessionContext = createContext<Session>();

/** The session provided by the nearest `SessionContext`, or the app-wide singleton. */
export function useSession(): Session {
  return useContext(SessionContext) ?? defaultSession;
}

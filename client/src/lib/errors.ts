import type { Dict } from './i18n/en';

type ErrorKey = keyof Dict['errors'];

/** Maps an error (as produced by `apiError`) to a translated message key. */
export function errorKey(code: string): `errors.${ErrorKey}` {
  const known = ERROR_CODES as readonly string[];
  return `errors.${(known.includes(code) ? code : 'internal') as ErrorKey}`;
}

export const ERROR_CODES = [
  'unauthorized',
  'invalidCredentials',
  'registrationDisabled',
  'usernameTaken',
  'wrongPassword',
  'migrationRequired',
  'migrationNotStarted',
  'migrationIncomplete',
  'alreadyMigrated',
  'notFound',
  'invalidRequest',
  'internal',
  'entryExists',
  'dateRequired',
  'nameRequired',
  'invalidRating',
  'aiDisabled',
  'audioTooLarge',
  'emptyTranscript',
  'transcriptionFailed',
  'compositionFailed',
  'network',
] as const;

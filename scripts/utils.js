import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const repoRootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const imageName = 'masch-notes';
export const repository = 'masch0212';

/** The build time as image tag, e.g. "20261018-081131". */
export function getVersionTag() {
  const dateIso = new Date().toISOString();
  return dateIso.replace(/[-T:.Z]/g, (x) => (x === 'T' ? '-' : '')).substring(0, 15);
}

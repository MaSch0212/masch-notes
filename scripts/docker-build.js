import { spawnSync } from 'node:child_process';

import { getVersionTag, imageName, repoRootDir, repository } from './utils.js';

// Client and server are built inside Docker (see Dockerfile).
const buildtime = getVersionTag();
const result = spawnSync(
  'docker',
  [
    'build',
    `-t=${repository}/${imageName}:latest`,
    `-t=${repository}/${imageName}:${buildtime}`,
    '.',
  ],
  { cwd: repoRootDir, stdio: 'inherit' },
);
process.exit(result.status ?? 1);

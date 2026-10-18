import { spawnSync } from 'node:child_process';

import { imageName, repoRootDir, repository } from './utils.js';

// Pushes the newest timestamp tag and "latest" of the image built by docker-build.js to Docker Hub.
const inspectResult = spawnSync(
  'docker',
  ['inspect', '--format={{json .RepoTags}}', `${repository}/${imageName}:latest`],
  { cwd: repoRootDir, stdio: 'pipe' },
);

if (inspectResult.status !== 0) {
  console.error(inspectResult.stdout.toString());
  console.error(inspectResult.stderr.toString());
  process.exit(1);
}

const tag = JSON.parse(inspectResult.stdout.toString())
  .map((t) => t.split(':')[1])
  .filter((t) => t && t !== 'latest')
  .sort((a, b) => b.localeCompare(a))[0];

if (!tag) {
  console.error("No tags other than 'latest' found.");
  process.exit(1);
}

console.log(`Found tag to publish: ${tag}`);

for (const t of [tag, 'latest']) {
  const result = spawnSync('docker', ['push', `${repository}/${imageName}:${t}`], {
    cwd: repoRootDir,
    stdio: 'inherit',
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

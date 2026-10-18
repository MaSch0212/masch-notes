import { OpenApiGenerator } from '@goast/core';
import { GoModelsGenerator, GoServersGenerator } from '@goast/go';
import { TypeScriptFetchClientsGenerator, TypeScriptModelsGenerator } from '@goast/typescript';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const spec = path.join(root, 'api/openapi.yaml');

const goModulePath = 'github.com/MaSch0212/masch-notes/server/internal/api';
const goOptions = { modulePath: goModulePath, packagePath: '', packageName: 'api', newLine: '\n' } as const;

await new OpenApiGenerator({ outputDir: path.join(root, 'server/internal/api') })
  .useType(GoModelsGenerator, goOptions)
  .useType(GoServersGenerator, { ...goOptions, basePath: '/api' })
  .parseAndGenerate(spec);

await new OpenApiGenerator({ outputDir: path.join(root, 'client/src/api'), newLine: '\n' })
  .useType(TypeScriptModelsGenerator)
  .useType(TypeScriptFetchClientsGenerator)
  .parseAndGenerate(spec);

execFileSync('gofmt', ['-l', '-w', 'internal/api'], { cwd: path.join(root, 'server'), stdio: 'inherit' });

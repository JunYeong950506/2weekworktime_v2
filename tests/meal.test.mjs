import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');

async function importMealUtils() {
  const sourcePath = resolve(rootDir, 'src/utils/meal.ts');
  const outPath = resolve(rootDir, 'tests/.tmp/meal.mjs');
  const source = await readFile(sourcePath, 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ES2020,
      target: ts.ScriptTarget.ES2020,
    },
  }).outputText;

  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, compiled);
  return import(`${pathToFileURL(outPath).href}?v=${Date.now()}`);
}

const { getMealBreakMinutes, normalizeMealCount } = await importMealUtils();

assert.equal(normalizeMealCount(0), 0);
assert.equal(normalizeMealCount(1), 1);
assert.equal(normalizeMealCount(2), 2);
assert.equal(normalizeMealCount(undefined, false), 0);
assert.equal(normalizeMealCount(undefined, true), 1);

assert.equal(getMealBreakMinutes(0), 0);
assert.equal(getMealBreakMinutes(1), 30);
assert.equal(getMealBreakMinutes(2), 60);

console.log('PASS meal count migration and deductions');

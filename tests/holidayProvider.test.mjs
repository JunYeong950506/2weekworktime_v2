import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';

import { fetchKasiHolidayYear, normalizeKasiItems } from '../api/_holidayApi.js';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');

async function importHolidayProvider() {
  const sourcePath = resolve(rootDir, 'src/utils/holidayProvider.ts');
  const outPath = resolve(rootDir, 'tests/.tmp/holidayProvider.mjs');
  const source = await readFile(sourcePath, 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ES2020,
      target: ts.ScriptTarget.ES2020,
      jsx: ts.JsxEmit.ReactJSX,
    },
  }).outputText;

  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, compiled);
  return import(`${pathToFileURL(outPath).href}?v=${Date.now()}`);
}

function createLocalStorage() {
  const store = new Map();
  return {
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => {
      store.set(key, String(value));
    },
    removeItem: (key) => {
      store.delete(key);
    },
    clear: () => {
      store.clear();
    },
  };
}

async function run(name, testBody) {
  try {
    await testBody();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

await run('KASI item normalization keeps only official holidays', () => {
  assert.deepEqual(
    normalizeKasiItems([
      { locdate: 20260101, dateName: '신정', isHoliday: 'Y' },
      { locdate: 20260102, dateName: '평일', isHoliday: 'N' },
    ]),
    { '2026-01-01': '신정' },
  );
});

await run('KASI year fetch calls all 12 months and merges items', async () => {
  const requestedUrls = [];
  const fetchImpl = async (url) => {
    requestedUrls.push(url);
    return {
      ok: true,
      json: async () => ({
        response: {
          body: {
            items: {
              item: { locdate: 20260505, dateName: '어린이날', isHoliday: 'Y' },
            },
          },
        },
      }),
    };
  };

  const cache = await fetchKasiHolidayYear(2026, 'service-key', fetchImpl);

  assert.equal(requestedUrls.length, 12);
  assert.equal(cache.holidays['2026-05-05'], '어린이날');
});

await run('fallback includes general holidays and May 1', async () => {
  const provider = await importHolidayProvider();

  assert.equal(provider.isKoreanPublicHolidayFallback('2026-01-01'), true);
  assert.equal(provider.isKoreanPublicHolidayFallback('2026-05-01'), true);
  assert.equal(provider.getFallbackHolidayName('2026-05-01'), '근로자의 날');
});

await run('official cache supports substitute holidays and is reused', async () => {
  const localStorage = createLocalStorage();
  globalThis.window = { localStorage };
  let fetchCount = 0;
  globalThis.fetch = async () => {
    fetchCount += 1;
    return {
      ok: true,
      json: async () => ({
        year: 2026,
        fetchedAt: '2026-01-01T00:00:00.000Z',
        holidays: { '2026-03-02': '대체공휴일', '2026-10-09': '한글날' },
      }),
    };
  };
  const provider = await importHolidayProvider();

  const first = await provider.ensureHolidayCache(2026);
  const second = await provider.ensureHolidayCache(2026);

  assert.equal(fetchCount, 1);
  assert.equal(await provider.isHoliday('2026-03-02'), true);
  assert.equal(first.holidays['2026-10-09'], '한글날');
  assert.equal(second.holidays['2026-10-09'], '한글날');
});

await run('API failure falls back to date-holidays and May 1 rule', async () => {
  globalThis.window = { localStorage: createLocalStorage() };
  globalThis.fetch = async () => {
    throw new Error('network down');
  };
  const provider = await importHolidayProvider();

  assert.equal(await provider.ensureHolidayCache(2027), null);
  assert.equal(await provider.isHoliday('2027-05-01'), true);
});

const KASI_ENDPOINT =
  'http://apis.data.go.kr/B090041/openapi/service/SpcdeInfoService/getRestDeInfo';

function encodeServiceKey(serviceKey) {
  return serviceKey.includes('%') ? serviceKey : encodeURIComponent(serviceKey);
}

function toArray(value) {
  if (!value) {
    return [];
  }

  return Array.isArray(value) ? value : [value];
}

function normalizeLocDate(value) {
  const compact = String(value ?? '').replace(/\D/g, '');
  if (compact.length !== 8) {
    return null;
  }

  return `${compact.slice(0, 4)}-${compact.slice(4, 6)}-${compact.slice(6, 8)}`;
}

export function normalizeKasiItems(items) {
  const holidays = {};

  for (const item of toArray(items)) {
    if (!item || item.isHoliday !== 'Y') {
      continue;
    }

    const date = normalizeLocDate(item.locdate);
    if (!date) {
      continue;
    }

    holidays[date] = String(item.dateName ?? '공휴일');
  }

  return holidays;
}

export async function fetchKasiHolidayYear(year, serviceKey, fetchImpl = fetch) {
  const holidays = {};

  for (let month = 1; month <= 12; month += 1) {
    const solMonth = String(month).padStart(2, '0');
    const url =
      `${KASI_ENDPOINT}?serviceKey=${encodeServiceKey(serviceKey)}` +
      `&pageNo=1&numOfRows=100&solYear=${year}&solMonth=${solMonth}&_type=json`;

    const response = await fetchImpl(url);
    if (!response.ok) {
      throw new Error(`KASI holiday API failed: ${response.status}`);
    }

    const payload = await response.json();
    const items = payload?.response?.body?.items?.item;
    Object.assign(holidays, normalizeKasiItems(items));
  }

  return {
    year,
    fetchedAt: new Date().toISOString(),
    holidays,
  };
}

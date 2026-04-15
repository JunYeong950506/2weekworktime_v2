import { fetchKasiHolidayYear } from './_holidayApi.js';

function getYear(value) {
  const year = Number(value);
  return Number.isInteger(year) && year >= 2000 && year <= 2100 ? year : null;
}

function getServiceKey() {
  return (
    process.env.KASI_HOLIDAY_API_KEY ||
    process.env.DATA_GO_KR_SERVICE_KEY ||
    process.env.PUBLIC_DATA_SERVICE_KEY ||
    ''
  );
}

export default async function handler(request, response) {
  const year = getYear(request.query?.year);
  if (!year) {
    response.status(400).json({ error: 'year must be between 2000 and 2100' });
    return;
  }

  const serviceKey = getServiceKey();
  if (!serviceKey) {
    response.status(503).json({ error: 'KASI holiday API key is not configured' });
    return;
  }

  try {
    const cache = await fetchKasiHolidayYear(year, serviceKey);
    response.setHeader(
      'Cache-Control',
      request.query?.refresh === '1'
        ? 'no-store'
        : 'public, s-maxage=31536000, stale-while-revalidate=604800',
    );
    response.status(200).json(cache);
  } catch (error) {
    console.error(error);
    response.status(502).json({ error: 'failed to fetch KASI holiday data' });
  }
}

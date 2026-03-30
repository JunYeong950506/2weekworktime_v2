const USER_CODE_REGEX = /^(WT|WORK)-[A-Z0-9]{6,8}$/;
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function randomCodePart(length: number): string {
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const values = new Uint32Array(length);
    crypto.getRandomValues(values);
    return Array.from(values, (value) => CODE_CHARS[value % CODE_CHARS.length]).join('');
  }

  let result = '';
  for (let index = 0; index < length; index += 1) {
    const randomIndex = Math.floor(Math.random() * CODE_CHARS.length);
    result += CODE_CHARS[randomIndex];
  }
  return result;
}

export function normalizeUserCode(value: string): string {
  return value.trim().toUpperCase().replace(/\s+/g, '');
}

export function isValidUserCode(value: string): boolean {
  return USER_CODE_REGEX.test(normalizeUserCode(value));
}

export function generateUserCode(): string {
  return `WT-${randomCodePart(6)}`;
}

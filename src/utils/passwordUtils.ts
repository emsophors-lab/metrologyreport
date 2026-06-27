const HASH_PREFIX = 'pbkdf2_sha256';
const ITERATIONS = 120000;
const SALT_BYTES = 16;
const KEY_BYTES = 32;

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

async function derivePasswordHash(password: string, salt: Uint8Array, iterations: number): Promise<string> {
  const passwordBytes = new TextEncoder().encode(password);
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    passwordBytes,
    'PBKDF2',
    false,
    ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      hash: 'SHA-256',
      salt,
      iterations,
    },
    keyMaterial,
    KEY_BYTES * 8
  );
  return bytesToBase64(new Uint8Array(bits));
}

export function isPasswordHash(value?: string | null): boolean {
  return typeof value === 'string' && value.startsWith(`${HASH_PREFIX}$`);
}

export async function hashPassword(password: string): Promise<string> {
  const salt = new Uint8Array(SALT_BYTES);
  crypto.getRandomValues(salt);
  const derived = await derivePasswordHash(password, salt, ITERATIONS);
  return `${HASH_PREFIX}$${ITERATIONS}$${bytesToBase64(salt)}$${derived}`;
}

export async function verifyPassword(password: string, storedHash?: string | null): Promise<boolean> {
  if (!isPasswordHash(storedHash)) return false;
  const parts = storedHash!.split('$');
  if (parts.length !== 4) return false;
  const iterations = Number(parts[1]);
  if (!Number.isFinite(iterations) || iterations < 1) return false;
  const salt = base64ToBytes(parts[2]);
  const expected = parts[3];
  const actual = await derivePasswordHash(password, salt, iterations);
  return timingSafeEqual(actual, expected);
}

export async function verifyUserPassword(
  password: string,
  user: { password_hash?: string | null; password?: string | null }
): Promise<boolean> {
  if (isPasswordHash(user.password_hash)) {
    return verifyPassword(password, user.password_hash);
  }

  // Transition compatibility: legacy records may still have plaintext passwords.
  return user.password === password;
}

export function validatePasswordStrength(newPassword: string): string | null {
  if (newPassword.length < 8) {
    return 'ពាក្យសម្ងាត់ថ្មីត្រូវមានយ៉ាងហោចណាស់ ៨ តួអក្សរ។ / New password must be at least 8 characters.';
  }
  if (!/[A-Za-z]/.test(newPassword)) {
    return 'ពាក្យសម្ងាត់ថ្មីត្រូវមានអក្សរយ៉ាងហោចណាស់មួយ។ / New password must contain at least one letter.';
  }
  if (!/\d/.test(newPassword)) {
    return 'ពាក្យសម្ងាត់ថ្មីត្រូវមានលេខយ៉ាងហោចណាស់មួយ។ / New password must contain at least one number.';
  }
  return null;
}

import argon2 from 'argon2';

export const MIN_PASSWORD_LENGTH = 12;
const MAX_PASSWORD_LENGTH = 200;

// A short blocklist of the most common passwords that pass the length rule.
const COMMON_PASSWORDS = new Set([
  '123456789012', '1234567890123', 'password1234', 'password12345', 'passwordpassword',
  'qwertyuiopas', 'qwerty123456', '111111111111', '000000000000', 'abcdefghijkl',
  'iloveyou1234', 'welcome12345', 'letmein12345', 'administrator', 'changeme1234',
  'password123!', 'Password1234', 'Password123!', 'P@ssw0rd1234', 'qwertyqwerty',
]);

// Returns a message describing what's wrong with the password, or null if it's acceptable.
export function passwordProblem(password, email = '') {
  if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  if (password.length > MAX_PASSWORD_LENGTH) return 'Password is too long.';
  const lower = password.toLowerCase();
  if (COMMON_PASSWORDS.has(password) || COMMON_PASSWORDS.has(lower)) return 'That password is too common.';
  if (new Set(password).size < 4) return 'Password needs more variety.';
  const emailName = email.split('@')[0].toLowerCase();
  if (emailName.length >= 4 && lower.includes(emailName)) return 'Password must not contain your email name.';
  return null;
}

export function hashPassword(password) {
  return argon2.hash(password, { type: argon2.argon2id });
}

export async function verifyPassword(hash, password) {
  try {
    return await argon2.verify(hash, password);
  } catch {
    return false;
  }
}

// Spend the same time as a real check when the user doesn't exist, so response timing
// doesn't reveal which emails have accounts.
let dummyHash;
export async function dummyVerify(password) {
  dummyHash ??= await hashPassword('dummy-password-for-timing-only');
  await verifyPassword(dummyHash, password);
}

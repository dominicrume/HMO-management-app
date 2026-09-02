// Manager whitelist — single source of truth.
// Emails listed here are always treated as Managers regardless of the
// currently stored role, and are allowed to bootstrap the first Manager
// account. Kept in sync between /api/setup, /api/me, and /api/tenants.

const WHITELIST = new Set<string>([
  'dominicrume@gmail.com',
  'orumedominic@gmail.com',
]);

export function isManagerWhitelisted(email?: string | null): boolean {
  return !!email && WHITELIST.has(email.toLowerCase());
}

export const MANAGER_WHITELIST: readonly string[] = [...WHITELIST];

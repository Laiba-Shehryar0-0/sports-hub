import argon2 from 'argon2';
import { randomUUID } from 'node:crypto';

/**
 * argon2id explicitly, not by relying on the library default.
 *
 * OWASP's second recommended parameter set (19 MiB / t=2 / p=1). parallelism is 1 on purpose:
 * the npm binding runs on the libuv threadpool (4 threads by default), so p>1 buys no wall-clock
 * win and multiplies peak memory — the library default of 64 MiB x 4 concurrent slots is ~256 MiB
 * transient, where this caps at ~76 MiB.
 */
export const ARGON2_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
};

export function hashPassword(password) {
  return argon2.hash(password, ARGON2_OPTIONS);
}

/** argon2.verify THROWS on a malformed hash rather than returning false — an unhandled throw
 *  here would surface as a 500 instead of a 401. */
export async function verifyPassword(hash, password) {
  try {
    return await argon2.verify(hash, password);
  } catch {
    return false;
  }
}

/**
 * A throwaway hash used to keep unknown-email logins as slow as real ones.
 *
 * Deliberately derived at runtime from ARGON2_OPTIONS rather than hardcoded: a baked-in constant
 * would freeze whatever parameters were current the day it was generated, so raising memoryCost
 * later would make the dummy path measurably cheaper than the real one and silently restore the
 * timing oracle. Lazily memoized so boot isn't blocked ~60ms; the first login pays it once.
 */
let cachedDummy;
export function dummyHash() {
  cachedDummy ??= hashPassword(randomUUID());
  return cachedDummy;
}

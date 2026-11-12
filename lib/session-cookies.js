import { decode } from 'next-auth/jwt';

export const SESSION_COOKIE_BASES = Object.freeze([
  'authjs.session-token',
  '__Secure-authjs.session-token',
]);

/**
 * Read session pairs directly from Cookie so malformed percent encoding and
 * duplicate names cannot disappear through NextRequest's cookie parser.
 */
export function parseSessionCookies(cookieHeader) {
  if (!cookieHeader) return [];
  const cookies = [];
  // Match Auth.js's parser: only surrounding SP/TAB are removed, and quoted
  // values keep their quotes. Keep duplicates so ambiguous sessions are cleared.
  const trim = (value) => value.replace(/^[\t ]+|[\t ]+$/g, '');
  for (const pair of cookieHeader.split(';')) {
    const separator = pair.indexOf('=');
    if (separator < 0) continue;
    const name = trim(pair.slice(0, separator));
    if (!SESSION_COOKIE_BASES.some((base) => name.startsWith(base))) continue;
    let value = trim(pair.slice(separator + 1));
    try {
      value = decodeURIComponent(value);
    } catch {
      // Auth.js retains undecodable values instead of dropping the cookie.
    }
    cookies.push({ name, value });
  }
  return cookies;
}

const invalidTokenCodes = new Set([
  'ERR_JWE_INVALID',
  'ERR_JWE_DECRYPTION_FAILED',
  'ERR_JWT_INVALID',
  'ERR_JWT_EXPIRED',
  'ERR_JWT_CLAIM_VALIDATION_FAILED',
  'ERR_JOSE_ALG_NOT_ALLOWED',
  'ERR_JOSE_NOT_SUPPORTED',
]);

function isInvalidToken(error) {
  return (
    invalidTokenCodes.has(error?.code) ||
    // Auth.js throws a plain Error when a JWE was issued with another secret.
    (error instanceof Error && error.message === 'no matching decryption secret')
  );
}

/**
 * Find session cookies that cannot be used by Auth.js, without logging tokens.
 * A missing secret is a configuration error; unexpected decoder errors propagate.
 * Return unique names in request order so callers can remove request and response
 * cookies before a Server Component attempts to read the session.
 */
export async function getInvalidSessionCookies(cookies, secret, decodeSession = decode) {
  const secrets = Array.isArray(secret) ? secret : [secret];
  if (!secrets.length || secrets.some((value) => typeof value !== 'string' || !value.length))
    throw new TypeError('A non-empty session secret is required.');

  const invalid = new Set();
  for (const base of SESSION_COOKIE_BASES) {
    // Match Auth.js SessionStore, including malformed suffixes it would consume.
    const group = cookies.filter(({ name }) => name.startsWith(base));
    if (!group.length) continue;

    const chunks = group.map((cookie) => ({
      ...cookie,
      suffix: cookie.name.slice(base.length),
    }));
    const isSingle = chunks.length === 1 && chunks[0].suffix === '';
    const validChunks = chunks.every(({ suffix }) => /^\.(0|[1-9]\d*)$/.test(suffix));
    if (validChunks) chunks.sort((a, b) => Number(a.suffix.slice(1)) - Number(b.suffix.slice(1)));

    const malformed = (
      chunks.some(({ value }) => typeof value !== 'string' || !value.length) ||
      (!isSingle && (
        !validChunks ||
        chunks.some(({ suffix }, index) => Number(suffix.slice(1)) !== index)
      ))
    );

    let unusable = malformed;
    if (!unusable) {
      try {
        unusable = !await decodeSession({
          token: chunks.map(({ value }) => value).join(''),
          secret,
          salt: base,
        });
      } catch (error) {
        if (!isInvalidToken(error)) throw error;
        unusable = true;
      }
    }
    if (unusable)
      for (const { name } of group) invalid.add(name);
  }

  return [...new Set(cookies.map(({ name }) => name))].filter((name) => invalid.has(name));
}

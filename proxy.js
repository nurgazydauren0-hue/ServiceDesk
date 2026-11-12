import { NextResponse } from 'next/server';
import { getInvalidSessionCookies, parseSessionCookies } from './lib/session-cookies.js';

export async function proxy(request) {
  // Match Auth.js env inference, including legacy and numbered rotation secrets.
  const primarySecret = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;
  const secret = primarySecret || [
    process.env.AUTH_SECRET_3,
    process.env.AUTH_SECRET_2,
    process.env.AUTH_SECRET_1,
    process.env.AUTH_SECRET,
  ].filter(Boolean);
  // Leave missing-secret configuration errors to Auth.js.
  if (!secret.length) return NextResponse.next();

  // Preserve duplicate names and malformed encoding that Next's parser drops.
  const cookieHeader = request.headers.get('cookie') || '';
  const invalidCookies = await getInvalidSessionCookies(parseSessionCookies(cookieHeader), secret);
  if (!invalidCookies.length) return NextResponse.next();

  // RSC auth() cannot send Auth.js's cookie cleanup back to the browser.
  // Remove invalid sessions before rendering, and expire them in this response.
  const invalidNames = new Set(invalidCookies);
  const remainingCookies = cookieHeader.split(';').filter((pair) =>
    !invalidNames.has(pair.split('=', 1)[0].trim()),
  ).join(';');
  const headers = new Headers(request.headers);
  if (remainingCookies.trim()) headers.set('cookie', remainingCookies);
  else headers.delete('cookie');
  const response = NextResponse.next({ request: { headers } });
  response.headers.set('Cache-Control', 'private, no-store');
  for (const name of invalidCookies) {
    // Invalid raw header names cannot be stored or expired by a browser.
    if (!/^[!#$%&'*+\-.0-9A-Z^_\x60a-z|~]+$/.test(name)) continue;
    response.cookies.set(name, '', {
      path: '/',
      maxAge: 0,
      httpOnly: true,
      sameSite: 'lax',
      secure: name.startsWith('__Secure-'),
    });
  }
  return response;
}

export const config = {
  matcher: ['/((?!_next/|favicon.ico|robots.txt|sitemap.xml).*)'],
};

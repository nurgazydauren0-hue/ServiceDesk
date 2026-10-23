import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { prisma } from './lib/prisma.js';
import { loginSchema } from './lib/validation.js';
import { verifyPassword, hashPassword } from './lib/passwords.js';
import { consumeRateLimit } from './lib/rate-limit.js';

let dummyHash;
export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  session: { strategy: 'jwt', maxAge: 8 * 60 * 60 },
  pages: { signIn: '/login' },
  providers: [
    Credentials({
      credentials: { email: { type: 'email' }, password: { type: 'password' } },
      async authorize(credentials) {
        const parsed = loginSchema.safeParse(credentials);
        if (!parsed.success) return null;
        const { email, password } = parsed.data;
        try {
          await consumeRateLimit('login', email, 20);
          const user = await prisma.user.findUnique({ where: { email } });
          // Always perform the password KDF, including when an email is unknown.
          dummyHash ||= hashPassword('unavailable-account-dummy-password');
          const valid = await verifyPassword(
            password,
            user?.passwordHash || (await dummyHash),
          );
          if (!user || !valid) return null;
          return {
            id: user.id,
            name: user.name,
            email: user.email,
            role: user.role,
          };
        } catch (error) {
          if (error.status !== 429)
            console.error(
              'Не удалось проверить учётные данные:',
              error.code || error.name,
            );
          return null;
        }
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.userId = user.id;
        token.role = user.role;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.userId;
        session.user.role = token.role;
      }
      return session;
    },
  },
});

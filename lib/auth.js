import { redirect } from 'next/navigation';
import { auth } from '../auth.js';
import { prisma } from './prisma.js';
import { ApiError } from './api-errors.js';

export const safeUserSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  createdAt: true,
};

export async function getCurrentUser() {
  const session = await auth();
  if (!session?.user?.id) return null;
  // JWT identifies a user; PostgreSQL authorizes them on every request.
  return prisma.user.findUnique({
    where: { id: session.user.id },
    select: safeUserSelect,
  });
}

export async function requireUser({ roles, page = false } = {}) {
  const user = await getCurrentUser();
  if (!user) {
    if (page) redirect('/login');
    throw new ApiError('Войдите в аккаунт, чтобы продолжить.', 401);
  }
  if (roles && !roles.includes(user.role)) {
    if (page) redirect('/');
    throw new ApiError('У вас нет доступа к этому разделу.', 403);
  }
  return user;
}

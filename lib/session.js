export { getCurrentUser, requireUser } from './auth.js';
import { requireUser } from './auth.js';
export const requirePageUser = (roles) => requireUser({ page: true, roles });

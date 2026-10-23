import { redirect } from 'next/navigation';
import { getCurrentUser } from '../../lib/auth';
import AuthForm from '../../components/auth-form';
export const metadata = { title: 'Регистрация' };
export default async function Page() {
  const user = await getCurrentUser();
  if (user) redirect('/');
  return <AuthForm register />;
}

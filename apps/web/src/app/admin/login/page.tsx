import type { StaffUser } from '@travel-rock/shared';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { safeAdminPath } from '@/lib/safe-admin-path';
import { getCurrentStaff } from '@/lib/staff-session';
import { LoginForm } from './login-form';

export const metadata: Metadata = { title: 'Ingresar · Travel Rock' };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { next } = await searchParams;
  const nextPath = safeAdminPath(typeof next === 'string' ? next : undefined);
  let staff: StaffUser | null = null;
  try {
    staff = await getCurrentStaff();
  } catch {
    // The session check failed (e.g. API unavailable): show the form as if signed out.
  }
  if (staff) redirect(staff.mustChangePassword ? '/admin/change-password' : nextPath);

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-6 px-4 py-12">
      <div>
        <p className="text-sm font-medium text-slate-600">Travel Rock · Equipo comercial</p>
        <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">Ingresar</h1>
      </div>
      <LoginForm nextPath={nextPath} />
    </main>
  );
}

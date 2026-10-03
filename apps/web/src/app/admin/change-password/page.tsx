import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { LogoutButton } from '@/components/logout-button';
import { getCurrentStaff } from '@/lib/staff-session';
import { ChangePasswordForm } from './change-password-form';

export const metadata: Metadata = { title: 'Cambiar contraseña · Travel Rock' };

export default async function ChangePasswordPage() {
  const staff = await getCurrentStaff();
  if (!staff) redirect('/admin/login?next=%2Fadmin%2Fchange-password');
  const forced = staff.mustChangePassword;

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-6 px-4 py-12">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">
          {forced ? 'Elegí una contraseña nueva' : 'Cambiar contraseña'}
        </h1>
        {forced ? (
          <p className="text-slate-600">
            Ingresaste con una contraseña temporal. Para continuar, elegí una contraseña propia.
          </p>
        ) : null}
      </div>
      <ChangePasswordForm />
      <div className="flex items-center justify-between">
        {forced ? (
          <span />
        ) : (
          <Link href="/admin" className="text-sm underline">
            Volver al panel
          </Link>
        )}
        <LogoutButton />
      </div>
    </main>
  );
}

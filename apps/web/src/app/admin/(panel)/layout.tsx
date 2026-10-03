import { staffRoleLabels } from '@travel-rock/shared';
import { Anton, Inter } from 'next/font/google';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { LogoutButton } from '@/components/logout-button';
import { NavLink } from '@/components/nav-link';
import { getCurrentStaff } from '@/lib/staff-session';

const display = Anton({ subsets: ['latin'], weight: '400', variable: '--font-display' });
const sans = Inter({ subsets: ['latin'] });

const navLinkClass =
  'inline-flex min-h-9 shrink-0 items-center rounded-full px-3 text-sm text-slate-600 hover:bg-slate-100 hover:text-slate-900 aria-[current=page]:bg-orange-50 aria-[current=page]:font-semibold aria-[current=page]:text-orange-800';

/** Staff panel shell: Travel Rock brand, section tabs and the signed-in user. */
export default async function PanelLayout({ children }: { children: ReactNode }) {
  const staff = await getCurrentStaff();
  if (!staff) redirect('/admin/login');
  if (staff.mustChangePassword) redirect('/admin/change-password');
  const initials = staff.fullName
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? '')
    .join('');

  return (
    <div className={`${display.variable} ${sans.className} min-h-dvh bg-[#f7f5f2]`}>
      <header className="border-b border-slate-200/80 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 pt-3 lg:flex-nowrap lg:py-3">
          <nav
            aria-label="Principal"
            className="order-last -mx-4 flex w-[calc(100%+2rem)] items-center gap-1 overflow-x-auto px-4 pb-2 lg:order-none lg:mx-0 lg:w-auto lg:overflow-visible lg:px-0 lg:pb-0"
          >
            <NavLink
              href="/admin"
              exact
              className="mr-3 hidden shrink-0 -skew-x-6 font-(family-name:--font-display) text-xl leading-[0.85] text-orange-600 uppercase lg:block"
            >
              Travel
              <br />
              Rock
            </NavLink>
            <NavLink href="/admin" exact className={`${navLinkClass} lg:hidden`}>
              Panel
            </NavLink>
            <NavLink href="/admin/schools" className={navLinkClass}>
              Colegios
            </NavLink>
            <NavLink href="/admin/groups" className={navLinkClass}>
              Grupos
            </NavLink>
            <NavLink href="/admin/services" className={navLinkClass}>
              Servicios
            </NavLink>
            <NavLink href="/admin/proposals" className={navLinkClass}>
              Propuestas
            </NavLink>
            <NavLink href="/admin/school-requests" className={navLinkClass}>
              Solicitudes
            </NavLink>
            {staff.role === 'ADMIN' ? (
              <NavLink href="/admin/users" className={navLinkClass}>
                Usuarios
              </NavLink>
            ) : null}
          </nav>
          <span
            aria-hidden="true"
            className="-skew-x-6 font-(family-name:--font-display) text-xl leading-[0.85] text-orange-600 uppercase lg:hidden"
          >
            Travel
            <br />
            Rock
          </span>
          <div className="flex items-center gap-3 text-sm">
            <span
              aria-hidden="true"
              className="grid size-9 place-items-center rounded-full bg-orange-100 text-xs font-semibold text-orange-800"
            >
              {initials}
            </span>
            <span className="hidden flex-col leading-tight sm:flex">
              <span className="font-medium text-slate-900">{staff.fullName}</span>
              <span className="text-xs text-slate-500">{staffRoleLabels[staff.role]}</span>
            </span>
            <Link
              href="/admin/change-password"
              className="hidden text-slate-600 hover:text-slate-900 hover:underline md:inline"
            >
              Cambiar contraseña
            </Link>
            <LogoutButton />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
    </div>
  );
}

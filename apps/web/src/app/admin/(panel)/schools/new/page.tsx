import { canEditCatalog } from '@travel-rock/shared';
import type { Metadata } from 'next';
import Link from 'next/link';
import { NoPermission } from '@/components/no-permission';
import { getCurrentStaff } from '@/lib/staff-session';
import { SchoolForm } from '../school-form';

export const metadata: Metadata = { title: 'Nuevo colegio · Travel Rock' };

export default async function NewSchoolPage() {
  const staff = await getCurrentStaff();
  if (!staff || !canEditCatalog(staff.role)) return <NoPermission title="Nuevo colegio" />;
  return (
    <section className="flex flex-col gap-6">
      <div>
        <Link
          href="/admin/schools"
          className="inline-flex items-center gap-1 self-start text-sm font-medium text-slate-600 hover:text-orange-800"
        >
          ← Colegios
        </Link>
        <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">Nuevo colegio</h1>
      </div>
      <SchoolForm />
    </section>
  );
}

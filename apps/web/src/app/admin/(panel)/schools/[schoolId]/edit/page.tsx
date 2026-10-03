import { canEditCatalog } from '@travel-rock/shared';
import type { Metadata } from 'next';
import Link from 'next/link';
import { NoPermission } from '@/components/no-permission';
import { getCurrentStaff } from '@/lib/staff-session';
import { SchoolForm } from '../../school-form';
import { loadSchool } from '../load-school';

export const metadata: Metadata = { title: 'Editar colegio · Travel Rock' };

export default async function EditSchoolPage({
  params,
}: {
  params: Promise<{ schoolId: string }>;
}) {
  const { schoolId } = await params;
  const staff = await getCurrentStaff();
  if (!staff || !canEditCatalog(staff.role)) return <NoPermission title="Editar colegio" />;
  const school = await loadSchool(schoolId);
  return (
    <section className="flex flex-col gap-6">
      <div>
        <Link
          href={`/admin/schools/${school.id}`}
          className="inline-flex items-center gap-1 self-start text-sm font-medium text-slate-600 hover:text-orange-800"
        >
          ← {school.name}
        </Link>
        <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">Editar colegio</h1>
      </div>
      <SchoolForm school={school} />
    </section>
  );
}

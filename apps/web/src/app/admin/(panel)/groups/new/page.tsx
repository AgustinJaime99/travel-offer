import { canEditCatalog, schoolSchema } from '@travel-rock/shared';
import type { Metadata } from 'next';
import Link from 'next/link';
import { z } from 'zod';
import { NoPermission } from '@/components/no-permission';
import { getCurrentStaff, serverApiGet } from '@/lib/staff-session';
import { CreateGroupForm } from '../group-forms';

export const metadata: Metadata = { title: 'Nuevo grupo · Travel Rock' };

export default async function NewGroupPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const staff = await getCurrentStaff();
  if (!staff || !canEditCatalog(staff.role)) return <NoPermission title="Nuevo grupo" />;

  // Coming from a school detail page: the school is preselected.
  const { schoolId } = await searchParams;
  const preselectedId = z.uuid().safeParse(schoolId);
  const school = preselectedId.success
    ? await serverApiGet(`/api/admin/schools/${preselectedId.data}`, schoolSchema)
    : null;

  return (
    <section className="flex flex-col gap-6">
      <div>
        <Link
          href={school ? `/admin/schools/${school.id}` : '/admin/groups'}
          className="text-sm underline"
        >
          ← {school ? school.name : 'Grupos'}
        </Link>
        <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">Nuevo grupo</h1>
      </div>
      {school && !school.active ? (
        <p role="alert">El colegio {school.name} está inactivo. Reactivalo para crear grupos.</p>
      ) : (
        <CreateGroupForm initialSchool={school ?? undefined} />
      )}
    </section>
  );
}

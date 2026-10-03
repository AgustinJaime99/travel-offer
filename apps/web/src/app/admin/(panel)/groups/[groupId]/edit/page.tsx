import { canEditCatalog } from '@travel-rock/shared';
import type { Metadata } from 'next';
import Link from 'next/link';
import { NoPermission } from '@/components/no-permission';
import { getCurrentStaff } from '@/lib/staff-session';
import { EditGroupForm } from '../../group-forms';
import { loadGroup } from '../load-group';

export const metadata: Metadata = { title: 'Editar grupo · Travel Rock' };

export default async function EditGroupPage({ params }: { params: Promise<{ groupId: string }> }) {
  const { groupId } = await params;
  const staff = await getCurrentStaff();
  if (!staff || !canEditCatalog(staff.role)) return <NoPermission title="Editar grupo" />;
  const group = await loadGroup(groupId);
  return (
    <section className="flex flex-col gap-6">
      <div>
        <Link
          href={`/admin/groups/${group.id}`}
          className="inline-flex items-center gap-1 self-start text-sm font-medium text-slate-600 hover:text-orange-800"
        >
          ← {group.name}
        </Link>
        <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">Editar grupo</h1>
      </div>
      <EditGroupForm group={group} />
    </section>
  );
}

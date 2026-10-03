import type { SchoolGroup } from '@travel-rock/shared';
import Link from 'next/link';
import { activeTone, StatusBadge } from '@/components/status-badge';

export function GroupsTable({
  groups,
  showSchool,
}: {
  groups: SchoolGroup[];
  showSchool: boolean;
}) {
  return (
    <div className="overflow-x-auto rounded-2xl bg-white shadow-sm ring-1 ring-slate-200/70">
      <table className="w-full min-w-[36rem] border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50/80 text-xs tracking-wide text-slate-500 uppercase">
            <th scope="col" className="px-4 py-3">
              Grupo
            </th>
            {showSchool ? (
              <th scope="col" className="px-4 py-3">
                Colegio
              </th>
            ) : null}
            <th scope="col" className="px-4 py-3">
              Año de viaje
            </th>
            <th scope="col" className="px-4 py-3">
              Alumnos est.
            </th>
            <th scope="col" className="px-4 py-3">
              Estado
            </th>
            <th scope="col" className="px-4 py-3">
              Código de acceso
            </th>
          </tr>
        </thead>
        <tbody>
          {groups.map((group) => (
            <tr
              key={group.id}
              className="border-b border-slate-100 last:border-0 hover:bg-orange-50/40"
            >
              <td className="px-4 py-3">
                <Link
                  href={`/admin/groups/${group.id}`}
                  className="font-semibold text-slate-900 underline-offset-2 hover:text-orange-800 hover:underline"
                >
                  {group.name}
                </Link>
              </td>
              {showSchool ? (
                <td className="px-4 py-3">
                  <Link
                    href={`/admin/schools/${group.school.id}`}
                    className="underline-offset-2 hover:underline"
                  >
                    {group.school.name}
                  </Link>
                  {group.school.active ? null : <span className="text-slate-500"> (inactivo)</span>}
                </td>
              ) : null}
              <td className="px-4 py-3">{group.travelYear}</td>
              <td className="px-4 py-3">{group.estimatedStudents ?? '—'}</td>
              <td className="px-4 py-3">
                <StatusBadge tone={activeTone(group.status === 'ACTIVE')}>
                  {group.status === 'ACTIVE' ? 'Activo' : 'Inactivo'}
                </StatusBadge>
              </td>
              <td className="px-4 py-3">
                <StatusBadge tone={group.accessCode.configured ? 'blue' : 'slate'}>
                  {group.accessCode.configured ? 'Configurado' : 'Sin código'}
                </StatusBadge>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

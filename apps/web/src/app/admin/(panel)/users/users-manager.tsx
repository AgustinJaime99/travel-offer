'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  createStaffUserRequestSchema,
  createStaffUserResponseSchema,
  type Paginated,
  type StaffRole,
  staffRoleLabels,
  staffRoles,
  type StaffUser,
  staffUserListSchema,
  staffUserSchema,
  temporaryPasswordResponseSchema,
} from '@travel-rock/shared';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { FormAlert, SubmitButton, TextField } from '@/components/form';
import { useHydrated } from '@/components/use-hydrated';
import { ApiRequestError, apiFetch, errorMessage } from '@/lib/api-client';
import { currentAdminLoginHref } from '@/lib/safe-admin-path';
import { activeTone, StatusBadge } from '@/components/status-badge';

const PAGE_SIZE = 20;

interface IssuedPassword {
  email: string;
  password: string;
}

export function UsersManager({ currentStaffId }: { currentStaffId: string }) {
  const router = useRouter();
  const [page, setPage] = useState(1);
  const [users, setUsers] = useState<Paginated<StaffUser> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [issued, setIssued] = useState<IssuedPassword | null>(null);
  const [busyUserId, setBusyUserId] = useState<string | null>(null);

  const handleError = useCallback(
    (caught: unknown) => {
      if (caught instanceof ApiRequestError && caught.status === 401) {
        router.replace(currentAdminLoginHref());
        return;
      }
      setError(errorMessage(caught));
    },
    [router],
  );

  // Bumped after every change to refetch the current page.
  const [reloadKey, setReloadKey] = useState(0);
  const reload = () => setReloadKey((key) => key + 1);

  useEffect(() => {
    let cancelled = false;
    apiFetch(`/api/admin/users?page=${page}&pageSize=${PAGE_SIZE}`, staffUserListSchema).then(
      (result) => {
        if (!cancelled) setUsers(result);
      },
      (caught: unknown) => {
        if (!cancelled) handleError(caught);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [page, reloadKey, handleError]);

  async function updateUser(user: StaffUser, patch: { role?: StaffRole; active?: boolean }) {
    setError(null);
    setBusyUserId(user.id);
    try {
      await apiFetch(`/api/admin/users/${user.id}`, staffUserSchema, {
        method: 'PATCH',
        body: patch,
      });
      reload();
    } catch (caught) {
      handleError(caught);
    } finally {
      setBusyUserId(null);
    }
  }

  async function resetPassword(user: StaffUser) {
    const confirmed = window.confirm(
      `¿Generar una contraseña temporal para ${user.email}? Se cerrarán todas sus sesiones.`,
    );
    if (!confirmed) return;
    setError(null);
    setBusyUserId(user.id);
    try {
      const { temporaryPassword } = await apiFetch(
        `/api/admin/users/${user.id}/temporary-password`,
        temporaryPasswordResponseSchema,
        { method: 'POST' },
      );
      setIssued({ email: user.email, password: temporaryPassword });
      reload();
    } catch (caught) {
      handleError(caught);
    } finally {
      setBusyUserId(null);
    }
  }

  function changeRole(select: HTMLSelectElement, user: StaffUser) {
    const role = select.value as StaffRole;
    const confirmed = window.confirm(
      `¿Cambiar el rol de ${user.fullName} (${user.email}) a ${staffRoleLabels[role]}?`,
    );
    if (!confirmed) {
      select.value = user.role;
      return;
    }
    void updateUser(user, { role });
  }

  function toggleActive(user: StaffUser) {
    if (
      user.active &&
      !window.confirm(`¿Desactivar a ${user.email}? Se cerrarán todas sus sesiones.`)
    ) {
      return;
    }
    void updateUser(user, { active: !user.active });
  }

  const totalPages = users ? Math.max(1, Math.ceil(users.total / users.pageSize)) : 1;

  return (
    <section className="flex flex-col gap-8">
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">Usuarios</h1>
        <p className="text-sm text-slate-600">
          Cuentas del equipo, roles y contraseñas temporales.
        </p>
      </div>

      {issued ? (
        <div
          role="status"
          className="flex flex-col gap-2 rounded-md border border-amber-300 bg-amber-50 p-4"
        >
          <p>
            Contraseña temporal para <strong>{issued.email}</strong>:{' '}
            <code
              className="rounded bg-white px-2 py-1 font-mono text-base"
              data-testid="temporary-password"
            >
              {issued.password}
            </code>
          </p>
          <p className="text-sm">
            Copiala y compartila por un canal seguro: no se vuelve a mostrar. La persona tendrá que
            cambiarla al ingresar.
          </p>
          <button
            type="button"
            onClick={() => setIssued(null)}
            className="self-start text-sm underline"
          >
            Ya la copié
          </button>
        </div>
      ) : null}

      <CreateUserForm
        onCreated={(created) => {
          setIssued(created);
          setPage(1);
          reload();
        }}
        onUnauthenticated={() => router.replace(currentAdminLoginHref())}
      />

      <div className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold text-slate-900">Equipo</h2>
        <FormAlert message={error} />
        {users === null ? (
          <p>Cargando…</p>
        ) : (
          <div className="overflow-x-auto rounded-2xl bg-white shadow-sm ring-1 ring-slate-200/70">
            <table className="w-full min-w-[40rem] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/80 text-xs tracking-wide text-slate-500 uppercase">
                  <th scope="col" className="px-4 py-3">
                    Nombre
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Email
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Rol
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Estado
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Acciones
                  </th>
                </tr>
              </thead>
              <tbody>
                {users.items.map((user) => {
                  const isSelf = user.id === currentStaffId;
                  const busy = busyUserId === user.id;
                  return (
                    <tr
                      key={user.id}
                      className="border-b border-slate-100 last:border-0 hover:bg-orange-50/40"
                    >
                      <td className="px-4 py-3">
                        {user.fullName}
                        {isSelf ? <span className="text-slate-500"> (vos)</span> : null}
                      </td>
                      <td className="px-4 py-3">{user.email}</td>
                      <td className="px-4 py-3">
                        <label className="sr-only" htmlFor={`role-${user.id}`}>
                          Rol de {user.fullName}
                        </label>
                        <select
                          id={`role-${user.id}`}
                          value={user.role}
                          disabled={isSelf || busy}
                          onChange={(event) => changeRole(event.target, user)}
                          className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm disabled:opacity-60"
                        >
                          {staffRoles.map((role) => (
                            <option key={role} value={role}>
                              {staffRoleLabels[role]}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge tone={activeTone(user.active)}>
                          {user.active ? 'Activo' : 'Inactivo'}
                        </StatusBadge>
                        {user.active && user.mustChangePassword ? (
                          <span className="block text-xs text-slate-500">Contraseña temporal</span>
                        ) : null}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            disabled={isSelf || busy}
                            onClick={() => toggleActive(user)}
                            className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                          >
                            {user.active ? 'Desactivar' : 'Activar'}
                          </button>
                          <button
                            type="button"
                            disabled={isSelf || busy}
                            onClick={() => void resetPassword(user)}
                            className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                          >
                            Contraseña temporal
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {users && totalPages > 1 ? (
          <nav
            aria-label="Paginación"
            className="flex items-center justify-between gap-3 rounded-2xl bg-white shadow-sm ring-1 ring-slate-200/70 px-4 py-2.5 text-sm text-slate-600"
          >
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage(page - 1)}
              className="rounded-lg px-2.5 py-1 font-medium text-orange-800 hover:bg-orange-50 disabled:text-slate-400 disabled:hover:bg-transparent"
            >
              Anterior
            </button>
            <span>
              Página {page} de {totalPages}
            </span>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => setPage(page + 1)}
              className="rounded-lg px-2.5 py-1 font-medium text-orange-800 hover:bg-orange-50 disabled:text-slate-400 disabled:hover:bg-transparent"
            >
              Siguiente
            </button>
          </nav>
        ) : null}
      </div>
    </section>
  );
}

function CreateUserForm({
  onCreated,
  onUnauthenticated,
}: {
  onCreated: (issued: IssuedPassword) => void;
  onUnauthenticated: () => void;
}) {
  const hydrated = useHydrated();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(createStaffUserRequestSchema),
    defaultValues: { email: '', fullName: '', role: 'COMMERCIAL' as StaffRole },
  });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      const { user, temporaryPassword } = await apiFetch(
        '/api/admin/users',
        createStaffUserResponseSchema,
        {
          method: 'POST',
          body: values,
        },
      );
      reset();
      onCreated({ email: user.email, password: temporaryPassword });
    } catch (caught) {
      if (caught instanceof ApiRequestError && caught.status === 401) {
        onUnauthenticated();
        return;
      }
      setFormError(errorMessage(caught));
    }
  });

  return (
    <form
      noValidate
      onSubmit={(event) => void onSubmit(event)}
      aria-labelledby="create-user-title"
      className="rounded-2xl bg-white shadow-sm ring-1 ring-slate-200/70 p-5"
    >
      <fieldset disabled={!hydrated} className="m-0 flex min-w-0 flex-col gap-4 border-0 p-0">
        <h2 id="create-user-title" className="text-lg font-semibold text-slate-900">
          Nuevo usuario
        </h2>
        <FormAlert message={formError} />
        <div className="grid gap-4 sm:grid-cols-3">
          <TextField
            id="new-fullName"
            label="Nombre completo"
            error={errors.fullName?.message}
            {...register('fullName')}
          />
          <TextField
            id="new-email"
            label="Email"
            type="email"
            error={errors.email?.message}
            {...register('email')}
          />
          <div className="flex flex-col gap-1">
            <label htmlFor="new-role" className="text-sm font-medium">
              Rol
            </label>
            <select
              id="new-role"
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm"
              {...register('role')}
            >
              {staffRoles.map((role) => (
                <option key={role} value={role}>
                  {staffRoleLabels[role]}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <SubmitButton pending={isSubmitting}>Crear usuario</SubmitButton>
        </div>
      </fieldset>
    </form>
  );
}

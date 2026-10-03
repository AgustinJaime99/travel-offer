'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { apiCall } from '@/lib/api-client';

export function LogoutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function logout() {
    setPending(true);
    try {
      await apiCall('/api/admin/auth/logout', { method: 'POST' });
    } catch {
      // An expired session is already logged out; go to the login page either way.
    }
    router.replace('/admin/login');
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={() => void logout()}
      disabled={pending}
      className="rounded-md border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-100 disabled:opacity-60"
    >
      Salir
    </button>
  );
}

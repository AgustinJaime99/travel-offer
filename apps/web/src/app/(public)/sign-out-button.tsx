'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { apiCall } from '@/lib/api-client';
import { useOnboarding } from './onboarding/store';

/** Ends the family session and clears the stored draft (shared devices), then goes home. */
export function SignOutButton({ className = '' }: { className?: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function signOut() {
    setPending(true);
    try {
      await apiCall('/api/public/auth/logout', { method: 'POST' });
    } catch {
      // An expired session is already signed out; clear the device either way.
    }
    useOnboarding.getState().reset();
    router.replace('/');
  }

  return (
    <button
      type="button"
      onClick={() => void signOut()}
      disabled={pending}
      className={`inline-flex min-h-11 items-center text-sm underline disabled:opacity-60 ${className}`}
    >
      Salir
    </button>
  );
}

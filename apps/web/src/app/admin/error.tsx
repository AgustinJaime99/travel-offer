'use client';

import Link from 'next/link';

/** Also wraps the panel layout, so a failed session check lands here instead of a blank page. */
export default function AdminError({
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <main className="mx-auto flex max-w-lg flex-col gap-4 px-4 py-16">
      <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">
        No pudimos cargar esta página
      </h1>
      <p role="alert" className="text-slate-700">
        Hubo un problema al comunicarnos con el servidor. Probá de nuevo en unos minutos.
      </p>
      <div className="flex flex-wrap items-center gap-4">
        <button
          type="button"
          onClick={() => retry()}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-orange-700 px-4 py-2 font-semibold text-white shadow-sm hover:bg-orange-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-700"
        >
          Reintentar
        </button>
        <Link href="/admin" className="font-medium text-orange-800 underline underline-offset-2">
          Ir al panel
        </Link>
      </div>
    </main>
  );
}

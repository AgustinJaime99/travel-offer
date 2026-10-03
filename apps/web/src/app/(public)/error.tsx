'use client';

import Link from 'next/link';

export default function PublicError({
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <section className="flex flex-col gap-4 py-6">
      <h1 className="text-2xl font-bold">No pudimos cargar esta página</h1>
      <p role="alert" className="text-slate-700">
        Hubo un problema de conexión. Probá de nuevo en unos minutos.
      </p>
      <button
        type="button"
        onClick={() => retry()}
        className="w-full rounded-xl bg-orange-600 px-4 py-3 text-[1.1875rem] font-bold text-white hover:bg-orange-700 sm:w-auto sm:self-start"
      >
        Reintentar
      </button>
      <Link href="/" className="inline-flex min-h-11 items-center self-start underline">
        Ir al inicio
      </Link>
    </section>
  );
}

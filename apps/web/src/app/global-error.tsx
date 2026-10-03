'use client';

import './globals.css';

/** Replaces the root layout when it fails, so it brings its own document and styles. */
export default function GlobalError({
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <html lang="es-AR">
      <body className="min-h-dvh bg-white text-slate-900 antialiased">
        <title>Error · Travel Rock</title>
        <main className="mx-auto flex max-w-lg flex-col gap-4 px-4 py-16">
          <h1 className="text-2xl font-bold">Algo salió mal</h1>
          <p role="alert" className="text-slate-700">
            No pudimos cargar Travel Rock. Probá de nuevo en unos minutos.
          </p>
          <button
            type="button"
            onClick={() => retry()}
            className="self-start rounded-md bg-slate-900 px-4 py-3 font-medium text-white hover:bg-slate-700"
          >
            Reintentar
          </button>
        </main>
      </body>
    </html>
  );
}

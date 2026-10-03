import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = { title: 'Página no encontrada · Travel Rock' };

export default function NotFound() {
  return (
    <main className="mx-auto flex max-w-lg flex-col gap-4 px-4 py-16">
      <h1 className="text-2xl font-bold">No encontramos esta página</h1>
      <p className="text-slate-700">
        Puede que el enlace esté mal escrito o que la página ya no exista.
      </p>
      <Link href="/" className="self-start underline">
        Ir al inicio
      </Link>
    </main>
  );
}

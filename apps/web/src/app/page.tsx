import Link from 'next/link';

export default function HomePage() {
  return (
    <main className="mx-auto flex max-w-lg flex-col gap-4 px-4 py-16">
      <h1 className="text-3xl font-bold">Travel Rock</h1>
      <p className="text-slate-700">Viajes de egresados.</p>
      <Link
        href="/onboarding"
        className="rounded-md bg-slate-900 px-4 py-3 text-center font-medium text-white hover:bg-slate-700"
      >
        Registrar el interés en el viaje
      </Link>
      <Link href="/ingresar" className="text-center underline">
        Ya me registré: ingresar
      </Link>
      <Link href="/admin" className="mt-8 text-center text-sm text-slate-600 underline">
        Acceso para el equipo de Travel Rock
      </Link>
    </main>
  );
}

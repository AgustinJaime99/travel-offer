export function NoPermission({ title }: { title: string }) {
  return (
    <section className="flex flex-col gap-2">
      <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">{title}</h1>
      <p role="alert">No tenés permisos para ver esta sección.</p>
    </section>
  );
}

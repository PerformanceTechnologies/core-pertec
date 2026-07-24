// Next.js muestra esto automaticamente mientras se resuelve page.tsx (guard +
// consultas a Supabase) -- evita que cambiar de empresa o entrar por primera
// vez se sienta "pegado" sin ningun feedback visual.
export default function CargandoPanelOdoo() {
  return (
    <div className="animate-pulse">
      <div className="h-3 w-24 rounded bg-gris/20" />
      <div className="mt-3 h-7 w-48 rounded bg-gris/20" />

      <div className="mt-5 h-9 w-72 rounded-xl bg-gris/15" />

      <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-borde bg-white p-4">
            <div className="h-4 w-24 rounded bg-gris/20" />
            <div className="mt-3 grid grid-cols-3 gap-2">
              {Array.from({ length: 3 }).map((_, j) => (
                <div key={j} className="space-y-1.5">
                  <div className="h-2.5 w-full rounded bg-gris/15" />
                  <div className="h-4 w-4/5 rounded bg-gris/20" />
                </div>
              ))}
            </div>
            <div className="mt-3 h-24 w-full rounded bg-gris/10" />
            <div className="mt-3 space-y-2">
              {Array.from({ length: 3 }).map((_, k) => (
                <div key={k} className="h-3 w-full rounded bg-gris/10" />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

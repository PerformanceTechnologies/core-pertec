// Skeleton de la lista de rendiciones. Next envuelve la página en un Suspense
// con esto como fallback, así que la navegación pinta algo de inmediato en vez
// de quedarse en blanco mientras el server component consulta la base.
export default function Cargando() {
  return (
    <div className="animate-pulse">
      <div className="h-3 w-28 rounded bg-tinta/10" />
      <div className="mt-2 h-7 w-64 rounded bg-tinta/10" />
      <div className="mt-2 h-4 w-full max-w-2xl rounded bg-tinta/5" />

      <div className="mt-6 rounded-2xl border border-borde bg-white p-5 shadow-sm">
        <div className="h-4 w-40 rounded bg-tinta/10" />
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="h-[38px] rounded-md bg-tinta/5 sm:col-span-2" />
          <div className="h-[38px] rounded-md bg-tinta/5" />
          <div className="h-[38px] rounded-md bg-tinta/5" />
          <div className="h-[38px] rounded-md bg-tinta/5" />
          <div className="h-[38px] w-56 rounded-md bg-tinta/5" />
        </div>
      </div>

      <div className="mt-6 space-y-2">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-[68px] rounded-xl border border-borde bg-white shadow-sm" />
        ))}
      </div>
    </div>
  );
}

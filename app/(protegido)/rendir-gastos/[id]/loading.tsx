// Skeleton de una rendición. Entrar a una rendición con 16 gastos leía el
// jsonb completo antes de pintar nada; ahora la navegación se siente inmediata.
export default function Cargando() {
  return (
    <div className="animate-pulse">
      <div className="h-3 w-28 rounded bg-tinta/10" />
      <div className="mt-2 h-7 w-72 rounded bg-tinta/10" />
      <div className="mt-2 h-4 w-56 rounded bg-tinta/5" />

      <div className="mt-4 rounded-2xl border border-borde bg-white p-5 shadow-sm">
        <div className="h-4 w-48 rounded bg-tinta/10" />
        <div className="mt-3 h-4 w-full max-w-3xl rounded bg-tinta/5" />
        <div className="mt-4 h-[38px] w-48 rounded-md bg-tinta/5" />
      </div>

      <div className="mt-4 rounded-2xl border border-borde bg-white p-5 shadow-sm">
        <div className="h-4 w-44 rounded bg-tinta/10" />
        <div className="mt-4 space-y-2">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-10 rounded bg-tinta/5" />
          ))}
        </div>
      </div>
    </div>
  );
}

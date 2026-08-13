// El hueco de una tarjeta mientras se resuelven sus consultas.
//
// Mismo alto, mismo borde y mismo radio que una tarjeta real, y con el acento de
// su modulo: asi la grilla queda armada desde el primer instante y las tarjetas
// aparecen en su lugar en vez de empujarse unas a otras al llegar.
//
// El alto fijo es a proposito. Sin el, la grilla se re-mide cada vez que entra
// una tarjeta y las de al lado saltan.
export default function EsqueletoTarjeta({ titulo }: { titulo: string }) {
  return (
    <div
      className="min-h-[19rem] animate-pulse rounded-xl border border-borde bg-gris/[0.04] p-4"
      aria-busy="true"
      aria-label={`Cargando ${titulo}`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="h-4 w-28 rounded bg-gris/20" />
        <div className="h-6 w-6 rounded-full bg-gris/15" />
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="space-y-1.5">
            <div className="h-2.5 w-full rounded bg-gris/15" />
            <div className="h-4 w-4/5 rounded bg-gris/20" />
          </div>
        ))}
      </div>

      <div className="mt-4 h-24 w-full rounded bg-gris/10" />

      <div className="mt-4 space-y-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-3 w-full rounded bg-gris/10" />
        ))}
      </div>
    </div>
  );
}

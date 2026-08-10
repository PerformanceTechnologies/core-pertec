// Skeleton de la lista de rendiciones. Next envuelve la página en un Suspense con
// esto como fallback, así que la navegación pinta algo de inmediato en vez de
// quedarse en blanco mientras el server component consulta la base.
//
// Replica la estructura real —título de display, cinta de cuatro cifras, banda de
// "Nueva rendición", barra de filtros y las filas— para que al llegar el
// contenido nada salte de lugar. Estaba desactualizado: dibujaba el formulario
// blanco abierto de una versión anterior, sin la cinta ni la barra de filtros, y
// usaba bg-white, que en modo oscuro se veía blanco.

function Barra({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-tinta/[0.07] ${className}`} />;
}

export default function Cargando() {
  return (
    <div className="max-w-[1500px]">
      <span className="etiqueta-seccion">Rendir Gastos</span>
      <Barra className="mt-2 h-9 w-72" />
      <Barra className="mt-3 h-4 w-[28rem] max-w-full" />

      <div className="mt-8 grid grid-cols-2 overflow-hidden rounded-2xl border border-borde sm:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="border-b border-borde px-5 py-4 sm:border-b-0 sm:border-r sm:last:border-r-0"
          >
            <Barra className="h-3 w-24" />
            <Barra className="mt-2 h-7 w-28" />
          </div>
        ))}
      </div>

      <div className="mt-6 flex items-center gap-3 rounded-2xl border border-borde bg-crema/60 px-4 py-3.5">
        <div className="h-7 w-7 shrink-0 rounded-md bg-naranjo/30" />
        <Barra className="h-4 w-40" />
      </div>

      <div className="mt-6 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <Barra className="h-9 w-full rounded-lg lg:w-72" />
        <div className="flex flex-col gap-2 sm:flex-row">
          <Barra className="h-9 w-full rounded-lg sm:w-64" />
          <Barra className="h-9 w-full rounded-lg sm:w-40" />
        </div>
      </div>

      <div className="mt-3 flex flex-col gap-2">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="rounded-xl border border-borde border-l-[3px] border-l-gris bg-superficie px-4 py-3.5"
          >
            <Barra className="h-5 w-48" />
            <Barra className="mt-2 h-3 w-40" />
            {/* Las cuatro cifras: 2×2 en angosto, en línea desde xl, igual que las
                filas reales. */}
            <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
              {[0, 1, 2, 3].map((j) => (
                <div key={j}>
                  <Barra className="h-2.5 w-14" />
                  <Barra className="mt-1.5 h-4 w-20" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

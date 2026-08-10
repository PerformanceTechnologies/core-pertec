// Armar el resumen es una llamada al modelo sobre el correo del día: la primera
// visita de la mañana tarda unos segundos. Sin esto la pantalla queda en blanco
// y parece que no hizo nada.
//
// El esqueleto imita la estructura real —título de display, cinta de cuatro
// cifras, tarjeta de prioridades y las dos columnas— para que al llegar el
// contenido nada salte de lugar. Es la razón por la que no es un spinner: un
// círculo girando no reserva el espacio.
//
// Los anchos van variados a propósito. Un esqueleto de barras todas iguales se
// lee como una tabla vacía; escalonarlas insinúa texto.
function Barra({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-tinta/[0.07] ${className}`} />;
}

function FilaFantasma() {
  return (
    <div className="rounded-lg border border-borde bg-superficie px-4 py-3">
      <Barra className="h-4 w-3/5" />
      <Barra className="mt-2.5 h-3 w-full" />
      <Barra className="mt-1.5 h-3 w-2/5" />
    </div>
  );
}

export default function CargandoMiDia() {
  return (
    <div className="max-w-[1500px]">
      <span className="etiqueta-seccion">Mi día</span>
      <Barra className="mt-2 h-11 w-80" />
      <Barra className="mt-3 h-4 w-[26rem]" />

      <div className="mt-8 grid grid-cols-2 overflow-hidden rounded-2xl border border-borde sm:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="border-b border-borde px-5 py-4 sm:border-b-0 sm:border-r sm:last:border-r-0"
          >
            <Barra className="h-3 w-16" />
            <Barra className="mt-2 h-8 w-14" />
            <Barra className="mt-2 h-3 w-24" />
          </div>
        ))}
      </div>

      <div className="mt-6 rounded-2xl border border-naranjo/25 bg-naranjo/[0.05] px-6 py-6">
        <Barra className="h-4 w-full" />
        <Barra className="mt-2 h-4 w-4/5" />
        <div className="mt-5 flex flex-col gap-3.5 border-t border-naranjo/15 pt-4">
          <Barra className="h-4 w-3/4" />
          <Barra className="h-4 w-2/3" />
          <Barra className="h-4 w-4/5" />
        </div>
      </div>

      <div className="mt-10 grid grid-cols-1 gap-x-10 gap-y-8 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <div>
          {[0, 1].map((bloque) => (
            <div key={bloque} className="mt-8 first:mt-0">
              <div className="border-b border-borde pb-2">
                <Barra className="h-6 w-48" />
              </div>
              <div className="mt-3 flex flex-col gap-2">
                {[0, 1, 2].map((i) => (
                  <FilaFantasma key={i} />
                ))}
              </div>
            </div>
          ))}
        </div>
        <div>
          <div className="border-b border-borde pb-2">
            <Barra className="h-6 w-28" />
          </div>
          <div className="mt-3 flex flex-col gap-2">
            {[0, 1].map((i) => (
              <FilaFantasma key={i} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

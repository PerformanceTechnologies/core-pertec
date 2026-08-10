// Armar el resumen es una llamada al modelo sobre el correo del día: la primera
// visita de la mañana tarda unos segundos. Sin esto la pantalla queda en blanco
// y parece que no hizo nada.
//
// El esqueleto imita la estructura real —cinta de cuatro segmentos, tarjeta de
// prioridades, dos listas— para que al llegar el contenido nada salte de lugar.
export default function CargandoMiDia() {
  return (
    <div>
      <span className="etiqueta-seccion">Mi día</span>
      <div className="mt-2 h-8 w-72 animate-pulse rounded bg-tinta/10" />
      <div className="mt-2 h-4 w-96 animate-pulse rounded bg-tinta/5" />

      <div className="mt-6 grid grid-cols-2 overflow-hidden rounded-xl border border-borde sm:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="border-b border-borde px-5 py-4 sm:border-b-0 sm:border-r sm:last:border-r-0"
          >
            <div className="h-3 w-20 animate-pulse rounded bg-tinta/10" />
            <div className="mt-2 h-7 w-12 animate-pulse rounded bg-tinta/10" />
            <div className="mt-2 h-3 w-24 animate-pulse rounded bg-tinta/5" />
          </div>
        ))}
      </div>

      <div className="mt-6 rounded-xl border border-naranjo/20 bg-naranjo/[0.06] px-5 py-5">
        <div className="h-4 w-full animate-pulse rounded bg-tinta/10" />
        <div className="mt-2 h-4 w-4/5 animate-pulse rounded bg-tinta/10" />
        <div className="mt-5 flex flex-col gap-3 border-t border-naranjo/15 pt-4">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-4 w-2/3 animate-pulse rounded bg-tinta/10" />
          ))}
        </div>
      </div>

      {[0, 1].map((bloque) => (
        <div key={bloque} className="mt-8">
          <div className="h-5 w-40 animate-pulse rounded bg-tinta/10" />
          <div className="mt-3 flex flex-col gap-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-20 animate-pulse rounded-xl border border-borde bg-tinta/[0.04]" />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

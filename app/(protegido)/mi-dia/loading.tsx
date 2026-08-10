// Armar el resumen es una llamada al modelo sobre el correo del día: la primera
// visita de la mañana tarda unos segundos. Sin esto la pantalla queda en blanco
// y parece que no hizo nada.
export default function CargandoMiDia() {
  return (
    <div>
      <span className="etiqueta-seccion">Mi día</span>
      <div className="mt-2 h-8 w-72 animate-pulse rounded bg-tinta/10" />
      <div className="mt-2 h-4 w-96 animate-pulse rounded bg-tinta/5" />
      <div className="mt-6 h-44 animate-pulse rounded-2xl bg-tinta/10" />
      <div className="mt-6 h-3 w-28 animate-pulse rounded bg-tinta/5" />
      <div className="mt-2 flex flex-col gap-1.5">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-16 animate-pulse rounded-lg border border-borde bg-tinta/[0.04]" />
        ))}
      </div>
    </div>
  );
}

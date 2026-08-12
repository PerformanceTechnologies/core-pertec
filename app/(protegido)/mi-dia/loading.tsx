import ResumenCargando from "@/components/mi-dia/ResumenCargando";

// Fallback de navegación hacia /mi-dia.
//
// Muestra lo MISMO que el Suspense interno de la página, a propósito: si acá
// hubiera un esqueleto gris y adentro la pantalla con los pasos, al entrar se
// verían dos estados de carga distintos uno tras otro.
//
// La banda oscura se dibuja completa —no como esqueleto— porque su color y su
// forma no dependen de los datos: lo único que falta es el texto de la fecha.
export default function CargandoMiDia() {
  return (
    <div className="max-w-[1500px]">
      <header className="rounded-2xl bg-tinta px-6 py-7 sm:px-8 sm:py-9">
        <span className="flex items-center gap-2.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-naranjo">
          <span className="h-px w-6 bg-naranjo" />
          Mi día
        </span>
        <div className="mt-3 h-9 w-48 animate-pulse rounded bg-crema/10" />
        <div className="mt-2 h-9 w-64 animate-pulse rounded bg-crema/10" />
        <div className="mt-5 h-3.5 w-full max-w-[26rem] animate-pulse rounded bg-crema/[0.06]" />
      </header>
      <ResumenCargando />
    </div>
  );
}

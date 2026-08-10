import ResumenCargando from "@/components/mi-dia/ResumenCargando";

// Fallback de navegación hacia /mi-dia.
//
// Muestra lo MISMO que el Suspense interno de la página, a propósito: si acá
// hubiera un esqueleto gris y adentro la pantalla con los pasos, al entrar se
// verían dos estados de carga distintos uno tras otro. Lo único que cambia es que
// el encabezado todavía es un esqueleto, porque la fecha depende del servidor.
export default function CargandoMiDia() {
  return (
    <div className="max-w-[1500px]">
      <span className="etiqueta-seccion">Mi día</span>
      <div className="mt-2 h-11 w-80 max-w-full animate-pulse rounded bg-tinta/[0.07]" />
      <div className="mt-3 h-4 w-[26rem] max-w-full animate-pulse rounded bg-tinta/[0.07]" />
      <ResumenCargando />
    </div>
  );
}

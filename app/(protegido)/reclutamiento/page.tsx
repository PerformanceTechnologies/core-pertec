import { exigirAccesoApp } from "@/lib/autorizacion";
import PanelPostulaciones from "@/components/reclutamiento/PanelPostulaciones";

const SLUG_APP = "panel-de-postulacion-laboral";

export default async function ReclutamientoPage() {
  const usuario = await exigirAccesoApp(SLUG_APP);

  return (
    // Mismo encabezado y mismo tope de ancho que Cotizador, Rendir Gastos y
    // Proyectos: etiqueta, título condensado en dos líneas y una bajada corta.
    <div className="max-w-[1500px]">
      <span className="etiqueta-seccion">Postulaciones Web</span>
      <h1 className="mt-2 max-w-[24ch] font-condensed text-3xl font-bold uppercase leading-[0.95] tracking-tight text-tinta sm:text-4xl">
        Postulaciones
        <span className="block text-tinta/40">Formulario público</span>
      </h1>
      <p className="mt-3 max-w-[52ch] text-sm font-light leading-relaxed text-pretty text-tinta/55">
        Lo que va llegando desde el formulario público de postulación.
      </p>

      <PanelPostulaciones esAdmin={usuario.rol === "admin"} />
    </div>
  );
}

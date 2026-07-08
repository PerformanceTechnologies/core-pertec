import { exigirAccesoApp } from "@/lib/autorizacion";
import PanelPostulaciones from "@/components/reclutamiento/PanelPostulaciones";

const SLUG_APP = "panel-de-postulacion-laboral";

export default async function ReclutamientoPage() {
  const usuario = await exigirAccesoApp(SLUG_APP);

  return (
    <div>
      <span className="etiqueta-seccion">Reclutamiento</span>
      <h1 className="mt-2 font-condensed text-2xl font-bold uppercase text-tinta">
        Postulaciones
      </h1>
      <p className="mt-1 text-sm text-tinta/60">
        Lo que va llegando desde el formulario público de postulación.
      </p>

      <div className="mt-6">
        <PanelPostulaciones esAdmin={usuario.rol === "admin"} />
      </div>
    </div>
  );
}

import { notFound } from "next/navigation";
import Link from "next/link";
import { IconPlayerPause } from "@tabler/icons-react";
import { exigirAdmin } from "@/lib/autorizacion";
import { obtenerAplicacionPorId } from "@/lib/aplicaciones";
import { estaPausada } from "@/lib/apps-pausadas";
import { TARJETA } from "@/lib/estilos";
import FormularioAplicacion from "@/components/FormularioAplicacion";
import EncabezadoAdmin from "@/components/admin/EncabezadoAdmin";
import { actualizarAplicacionAction } from "../acciones";

export default async function EditarAplicacionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await exigirAdmin();
  const { id } = await params;
  const app = await obtenerAplicacionPorId(id);
  if (!app) notFound();

  const accionConId = actualizarAplicacionAction.bind(null, id);

  return (
    <div className="animar-entrada space-y-6">
      <EncabezadoAdmin
        titulo={app.nombre}
        rutaPadre={{ href: "/aplicaciones", nombre: "Aplicaciones" }}
        descripcion="Cambia cómo se ve esta aplicación en el menú y a dónde lleva. Quién puede usarla se asigna desde Usuarios."
      />

      {estaPausada(app.slug) && (
        <div role="status" className={`${TARJETA} flex max-w-3xl items-start gap-3 p-4`}>
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-tinta/10 text-tinta/70">
            <IconPlayerPause size={18} stroke={2} aria-hidden />
          </span>
          <p className="text-sm text-tinta/70">
            <strong className="font-semibold text-tinta">Esta aplicación está en pausa.</strong> No aparece en el menú, el
            Inicio ni el buscador, y su página no abre para nadie. Conserva sus datos y las personas que la tienen
            asignada; se reactiva desde el código (lib/apps-pausadas.ts).
          </p>
        </div>
      )}

      <div className={`${TARJETA} max-w-3xl p-6 sm:p-7`}>
        <FormularioAplicacion
          accion={accionConId}
          valoresPorDefecto={app}
          textoBoton="Guardar cambios"
          cancelar={
            <Link
              href="/aplicaciones"
              className="inline-flex min-h-11 items-center rounded-lg px-4 text-sm font-semibold text-tinta/70 transition hover:bg-tinta/5 hover:text-tinta focus-visible:outline focus-visible:outline-2 focus-visible:outline-naranjo"
            >
              Cancelar
            </Link>
          }
        />
      </div>
    </div>
  );
}

import Link from "@/components/contratos/Enlace";
import { IconArrowLeft } from "@tabler/icons-react";
import FormularioNuevoVehiculo from "@/components/contratos/FormularioNuevoVehiculo";
import { exigirAccesoApp } from "@/lib/contratos/autorizacion";
import { TARJETA } from "@/lib/contratos/estilos";
import { listarCategorias } from "@/lib/contratos/vehiculos";
import { CAMPOS_DE_VEHICULO } from "@/lib/contratos/vehiculos-modelo";

export const dynamic = "force-dynamic";

export default async function NuevoVehiculoPage() {
  await exigirAccesoApp("acreditacion-vehiculos");

  const categorias = (await listarCategorias()).filter((c) => c.activo);
  const faenas = CAMPOS_DE_VEHICULO.find((c) => c.campo === "faena")?.opciones ?? [];

  return (
    <div className="animar-entrada">
      <Link
        href="/contratos/acreditacion-vehiculos"
        className="inline-flex items-center gap-1 text-xs font-bold uppercase tracking-wide text-gris transition hover:text-azul"
      >
        <IconArrowLeft size={14} />
        Flota
      </Link>

      <h1 className="titular mt-3 text-3xl text-azul">Nuevo vehículo</h1>
      <p className="mt-1 max-w-2xl text-sm text-gris">
        Con la patente y el tipo alcanza para empezar: el checklist se arma solo según lo que pide ese tipo
        de vehículo, y el resto de los datos se completa después en su ficha.
      </p>

      <div className={`${TARJETA} mt-6 max-w-3xl p-5 sm:p-6`}>
        {categorias.length === 0 ? (
          <p className="text-sm text-gris">
            No hay tipos de vehículo activos.{" "}
            <Link
              href="/contratos/acreditacion-vehiculos/configuracion"
              className="font-semibold text-azul hover:underline"
            >
              Crea el primero en Configuración
            </Link>
            .
          </p>
        ) : (
          <FormularioNuevoVehiculo
            categorias={categorias.map((c) => ({ id: c.id, nombre: c.nombre }))}
            faenas={faenas}
          />
        )}
      </div>
    </div>
  );
}

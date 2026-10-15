import Link from "@/components/contratos/Enlace";
import { IconArrowLeft } from "@tabler/icons-react";
import FormularioNuevaPersona from "@/components/contratos/FormularioNuevaPersona";
import { exigirAccesoApp } from "@/lib/contratos/autorizacion";
import { CAMPOS_DE_PERSONA } from "@/lib/contratos/acreditacion-modelo";
import { listarCargos } from "@/lib/contratos/acreditacion";
import { TARJETA } from "@/lib/contratos/estilos";

export const dynamic = "force-dynamic";

export default async function NuevaPersonaPage() {
  await exigirAccesoApp("acreditacion");

  const cargos = (await listarCargos()).filter((c) => c.activo);
  const opciones = (campo: string) =>
    CAMPOS_DE_PERSONA.find((c) => c.campo === campo)?.opciones ?? [];

  return (
    <div className="animar-entrada">
      <Link
        href="/contratos/acreditacion"
        className="inline-flex items-center gap-1 text-xs font-bold uppercase tracking-wide text-gris transition hover:text-azul"
      >
        <IconArrowLeft size={14} />
        Nómina
      </Link>

      <h1 className="titular mt-3 text-3xl text-azul">Nueva persona</h1>
      <p className="mt-1 max-w-2xl text-sm text-gris">
        Con el nombre, el RUT y el cargo alcanza para empezar: el checklist se arma solo según lo
        que pide el cargo, y el resto de los datos se completa después en su ficha.
      </p>

      <div className={`${TARJETA} mt-6 max-w-3xl p-5 sm:p-6`}>
        {cargos.length === 0 ? (
          <p className="text-sm text-gris">
            No hay cargos activos.{" "}
            <Link href="/contratos/acreditacion/configuracion" className="font-semibold text-azul hover:underline">
              Crea el primero en Configuración
            </Link>
            .
          </p>
        ) : (
          <FormularioNuevaPersona
            cargos={cargos.map((c) => ({ id: c.id, nombre: c.nombre }))}
            faenas={opciones("faena")}
            turnos={opciones("turno")}
          />
        )}
      </div>
    </div>
  );
}

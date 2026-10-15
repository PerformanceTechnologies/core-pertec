import Link from "@/components/contratos/Enlace";
import { IconArrowLeft, IconBriefcase, IconFileDescription, IconFiles } from "@tabler/icons-react";
import AdministradorDeCargos from "@/components/contratos/AdministradorDeCargos";
import AdministradorDeDocumentos from "@/components/contratos/AdministradorDeDocumentos";
import type { GrupoDeTipos } from "@/components/contratos/EditorDeCargo";
import FormularioContrato from "@/components/contratos/FormularioContrato";
import PanelesDeConfiguracion from "@/components/contratos/PanelesDeConfiguracion";
import { exigirCapacidadEnPagina } from "@/lib/contratos/autorizacion";
import { TARJETA } from "@/lib/contratos/estilos";
import { listarCargos, listarTipos, listarTodosLosTipos, obtenerContrato } from "@/lib/contratos/acreditacion";
import { guardarContratoAction } from "../acciones";

export const dynamic = "force-dynamic";

export default async function ConfiguracionPage({
  searchParams,
}: {
  searchParams: Promise<{ panel?: string }>;
}) {
  await exigirCapacidadEnPagina("acreditacion", "configurar", "/contratos/acreditacion");
  const { panel } = await searchParams;

  const [contrato, tipos, cargos, catalogo] = await Promise.all([
    obtenerContrato(),
    listarTipos(),
    listarCargos(),
    listarTodosLosTipos(),
  ]);

  // Los grupos en el orden en que aparecen en el catálogo.
  const grupos: GrupoDeTipos[] = [];
  for (const t of tipos) {
    let g = grupos.find((x) => x.grupo === t.grupo);
    if (!g) grupos.push((g = { grupo: t.grupo, tipos: [] }));
    g.tipos.push({ id: t.id, nombre: t.nombre });
  }

  return (
    <div className="animar-entrada">
      <Link
        href="/contratos/acreditacion"
        className="inline-flex min-h-11 items-center gap-1 text-xs font-bold uppercase tracking-wide text-gris transition hover:text-azul"
      >
        <IconArrowLeft size={14} />
        Nómina
      </Link>

      <h1 className="titular mt-1 text-3xl text-azul">Configuración</h1>
      <p className="mt-1 max-w-3xl text-sm text-gris">
        Los cargos y los documentos que pide cada uno. Es lo que en el Excel eran las celdas verdes: un
        cambio acá se aplica de inmediato a todas las personas con ese cargo.
      </p>

      <PanelesDeConfiguracion
        inicial={panel ?? "cargos"}
        paneles={[
          {
            clave: "cargos",
            titulo: "Cargos",
            conteo: cargos.length,
            icono: <IconBriefcase size={16} />,
            contenido: (
              <AdministradorDeCargos
                cargos={cargos.map((c) => ({ ...c, usos: c.personas }))}
                grupos={grupos}
                totalDocumentos={tipos.length}
              />
            ),
          },
          {
            clave: "documentos",
            titulo: "Documentos",
            conteo: catalogo.length,
            icono: <IconFiles size={16} />,
            // Un documento es de todos los cargos: se edita acá, en el catálogo, y no desde
            // uno solo, que sugeriría que cambia únicamente para ese. Qué documentos pide cada
            // cargo se marca en la pestaña Cargos.
            contenido: (
              <AdministradorDeDocumentos
                tipos={catalogo}
                cargos={cargos
                  .filter((c) => c.activo)
                  .map((c) => ({ id: c.id, nombre: c.nombre, tipoIds: c.tipoIds }))}
              />
            ),
          },
          {
            clave: "contrato",
            titulo: "El contrato",
            icono: <IconFileDescription size={16} />,
            contenido: (
              <section className={`${TARJETA} max-w-3xl p-5 sm:p-6`}>
                <h2 className="titular text-base text-azul">Datos del contrato</h2>
                <p className="mb-4 mt-0.5 text-xs text-gris">
                  Es la cabecera de la hoja Consolidado: aparece en la nómina y en el Excel que se exporta.
                </p>
                <FormularioContrato valores={contrato} guardar={guardarContratoAction} />
              </section>
            ),
          },
        ]}
      />
    </div>
  );
}

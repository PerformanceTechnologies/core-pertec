import Link from "@/components/contratos/Enlace";
import { IconArrowLeft, IconCar, IconFiles } from "@tabler/icons-react";
import AdministradorDeCargos from "@/components/contratos/AdministradorDeCargos";
import AdministradorDeDocumentos from "@/components/contratos/AdministradorDeDocumentos";
import type { GrupoDeTipos } from "@/components/contratos/EditorDeCargo";
import PanelesDeConfiguracion from "@/components/contratos/PanelesDeConfiguracion";
import { exigirCapacidadEnPagina } from "@/lib/contratos/autorizacion";
import { listarCategorias, listarTiposDeDocumento, listarTodosLosTiposDeDocumento } from "@/lib/contratos/vehiculos";

export const dynamic = "force-dynamic";

export default async function ConfiguracionDeVehiculosPage({
  searchParams,
}: {
  searchParams: Promise<{ panel?: string }>;
}) {
  await exigirCapacidadEnPagina("acreditacion-vehiculos", "configurar", "/contratos/acreditacion-vehiculos");
  const { panel } = await searchParams;

  const [tipos, categorias, catalogo] = await Promise.all([
    listarTiposDeDocumento(),
    listarCategorias(),
    listarTodosLosTiposDeDocumento(),
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
        href="/contratos/acreditacion-vehiculos"
        className="inline-flex min-h-11 items-center gap-1 text-xs font-bold uppercase tracking-wide text-gris transition hover:text-azul"
      >
        <IconArrowLeft size={14} />
        Flota
      </Link>

      <h1 className="titular mt-1 text-3xl text-azul">Configuración</h1>
      <p className="mt-1 max-w-3xl text-sm text-gris">
        Los tipos de vehículo y los documentos que pide cada uno. Un cambio acá se aplica de inmediato a todos
        los vehículos de ese tipo. El nombre, la fecha de inicio y el administrador del contrato son los mismos
        de Acreditación Personas y se editan allá.
      </p>

      <PanelesDeConfiguracion
        inicial={panel ?? "tipos"}
        paneles={[
          {
            clave: "tipos",
            titulo: "Tipos de vehículo",
            conteo: categorias.length,
            icono: <IconCar size={16} />,
            contenido: (
              <AdministradorDeCargos
                dominio="vehiculos"
                cargos={categorias.map((c) => ({
                  id: c.id,
                  nombre: c.nombre,
                  activo: c.activo,
                  tipoIds: c.tipoIds,
                  usos: c.vehiculos,
                }))}
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
            // Un documento es de todos los tipos de vehículo: se edita acá, en el catálogo, y no desde
            // uno solo, que sugeriría que cambia únicamente para ese. Qué documentos pide cada tipo se
            // marca en la pestaña de tipos.
            contenido: (
              <AdministradorDeDocumentos
                dominio="vehiculos"
                tipos={catalogo}
                cargos={categorias
                  .filter((c) => c.activo)
                  .map((c) => ({ id: c.id, nombre: c.nombre, tipoIds: c.tipoIds }))}
              />
            ),
          },
        ]}
      />
    </div>
  );
}

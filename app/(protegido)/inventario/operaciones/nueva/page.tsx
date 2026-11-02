import Link from "next/link";
import { IconArrowLeft } from "@tabler/icons-react";
import FormularioTransferencia from "@/components/inventario/FormularioTransferencia";
import { listarLotes, listarProductosConStock, listarTiposOperacion, listarUbicaciones, listarUnidades, mapaDeStock } from "@/lib/inventario";
import { TARJETA } from "@/lib/estilos";

export const dynamic = "force-dynamic";

export default async function NuevaOperacionPage({ searchParams }: { searchParams: Promise<{ clase?: string }> }) {
  const { clase } = await searchParams;
  const [todosLosTipos, productos, ubicaciones, unidades, stock] = await Promise.all([
    listarTiposOperacion(),
    listarProductosConStock(),
    listarUbicaciones(),
    listarUnidades(),
    mapaDeStock(),
  ]);
  // Los ajustes tienen su propio asistente; aquí solo recepciones, entregas e internas.
  const tipos = todosLosTipos
    .filter((t) => t.clase !== "ajuste")
    .sort((a, b) => Number(b.clase === clase) - Number(a.clase === clase));
  // Desde un atajo (?clase=recepcion) se salta al paso 2 si hay un solo tipo de esa clase.
  const deLaClase = clase ? tipos.filter((t) => t.clase === clase) : [];
  const tipoInicial = deLaClase.length === 1 ? deLaClase[0].id : undefined;
  const abrevUni = new Map(unidades.map((u) => [u.id, u.abreviacion]));

  // Lotes de los productos que llevan seguimiento (para asignarlos en la línea).
  const conSeguimiento = productos.filter((p) => p.seguimiento !== "ninguno");
  const lotesLista = await Promise.all(conSeguimiento.map((p) => listarLotes(p.id)));
  const lotesPorProducto: Record<string, Awaited<ReturnType<typeof listarLotes>>> = {};
  conSeguimiento.forEach((p, i) => { lotesPorProducto[p.id] = lotesLista[i]; });

  const productosMin = productos
    .filter((p) => p.tipo !== "servicio")
    .map((p) => ({ id: p.id, nombre: p.nombre, unidadAbrev: abrevUni.get(p.unidadId ?? "") ?? "" }));

  return (
    <div className="space-y-5">
      <Link href="/inventario/operaciones" className="inline-flex items-center gap-1 text-sm font-semibold text-gris transition hover:text-tinta">
        <IconArrowLeft size={16} /> Volver a operaciones
      </Link>

      {tipos.length === 0 ? (
        <div className={`${TARJETA} p-8 text-center`}>
          <p className="text-sm text-gris">No hay tipos de operación configurados. Créalos en Configuración.</p>
        </div>
      ) : (
        <FormularioTransferencia
          tipos={tipos}
          productos={productosMin}
          ubicaciones={ubicaciones}
          lotesPorProducto={lotesPorProducto}
          stock={stock}
          tipoInicial={tipoInicial}
        />
      )}
    </div>
  );
}

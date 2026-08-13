import { Suspense } from "react";
import { exigirAccesoPanelOdoo } from "@/lib/panel-odoo";
import { COMPANIAS_ODOO, COMPANIA_ODOO_DEFECTO } from "@/lib/panel-odoo/companias";
import { NOMBRES_MODULO } from "@/lib/panel-odoo/orden-modulos";
import { obtenerUltimasEjecuciones } from "@/lib/panel-odoo/sync-ejecuciones";
import { obtenerOrdenModulos } from "@/lib/panel-odoo/orden-modulos";
import SelectorEmpresa from "@/components/panel-odoo/SelectorEmpresa";
import BotonActualizarOdoo from "@/components/panel-odoo/BotonActualizarOdoo";
import BotonOrdenarTarjetas from "@/components/panel-odoo/BotonOrdenarTarjetas";
import OrdenTarjetasOdoo from "@/components/panel-odoo/OrdenTarjetasOdoo";
import EsqueletoTarjeta from "@/components/panel-odoo/EsqueletoTarjeta";
import TarjetaFacturas from "@/components/panel-odoo/TarjetaFacturas";
import TarjetaContabilidad from "@/components/panel-odoo/TarjetaContabilidad";
import TarjetaCrm from "@/components/panel-odoo/TarjetaCrm";
import TarjetaGastos from "@/components/panel-odoo/TarjetaGastos";
import TarjetaFlota from "@/components/panel-odoo/TarjetaFlota";
import TarjetaProyectos from "@/components/panel-odoo/TarjetaProyectos";
import TarjetaVentas from "@/components/panel-odoo/TarjetaVentas";
import TarjetaCompras from "@/components/panel-odoo/TarjetaCompras";
import type { ModuloVisiblePanelOdoo } from "@/lib/panel-odoo/modulos-usuario";
import type { ReactNode } from "react";

// Sin cache: cada carga vuelve a leer la cache de Supabase (no Odoo en vivo,
// ver lib/panel-odoo/datos.ts), asi que un sync recien terminado o un cambio
// de permisos se ve de inmediato, igual que el resto de los paneles del core.
export const dynamic = "force-dynamic";

export default async function PanelOdooPage({
  searchParams,
}: {
  searchParams: Promise<{ empresa?: string }>;
}) {
  // Estas dos no dependen del usuario ni de la empresa elegida, asi que arrancan
  // ANTES de esperar al guard en vez de despues: iban en una tercera tanda
  // secuencial de consultas, con el guard esperando al layout y estas esperando
  // al guard. El guard sigue siendo el que decide si se renderiza algo.
  const promesaEjecuciones = obtenerUltimasEjecuciones();
  const promesaOrden = obtenerOrdenModulos();

  const { usuario, rol, modulosVisibles } = await exigirAccesoPanelOdoo();
  const { empresa } = await searchParams;
  const companyId = COMPANIAS_ODOO.some((c) => c.id === Number(empresa))
    ? Number(empresa)
    : COMPANIA_ODOO_DEFECTO;
  const [ejecuciones, ordenModulos] = await Promise.all([promesaEjecuciones, promesaOrden]);

  // El orden es global (lo define un admin del core, no el rol interno de
  // Panel Odoo) -- ver comentario en moverModuloOrdenAction. Cada tarjeta se
  // arma como elemento aqui y se selecciona por modulo en el .map de abajo,
  // en vez de la cadena de && que habia antes (esa no permitia reordenar).
  // "key" se pone aca, al construir cada elemento, para poder renderizar
  // directamente el resultado del .map() de abajo sin envolverlo en un <div>
  // -- un <div> extra ahi rompia el alto parejo de las tarjetas de una
  // misma fila (CSS grid solo estira parejo a su hijo directo, y el hijo
  // directo pasaba a ser ese <div> vacio en vez de la tarjeta con borde).
  const tarjetasPorModulo: Record<ModuloVisiblePanelOdoo, ReactNode> = {
    facturas: <TarjetaFacturas key="facturas" companyId={companyId} ejecucion={ejecuciones.facturas} />,
    contabilidad: (
      <TarjetaContabilidad key="contabilidad" companyId={companyId} ejecucion={ejecuciones.contabilidad} />
    ),
    crm: <TarjetaCrm key="crm" companyId={companyId} ejecucion={ejecuciones.crm} />,
    gastos: <TarjetaGastos key="gastos" companyId={companyId} ejecucion={ejecuciones.gastos} />,
    ventas: <TarjetaVentas key="ventas" companyId={companyId} ejecucion={ejecuciones.ventas} />,
    compras: <TarjetaCompras key="compras" companyId={companyId} ejecucion={ejecuciones.compras} />,
    flota: <TarjetaFlota key="flota" companyId={companyId} ejecucion={ejecuciones.flota} />,
    proyectos: <TarjetaProyectos key="proyectos" ejecucion={ejecuciones.proyectos} />,
  };
  const modulosARenderizar = ordenModulos.filter((m) => modulosVisibles.includes(m));

  return (
    <div>
      <span className="etiqueta-seccion">Panel Odoo</span>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-4">
        <h1 className="font-condensed text-2xl font-bold uppercase text-tinta">Panel Odoo</h1>
        <div className="flex flex-wrap items-center gap-2">
          {usuario.rol === "admin" && (
            <BotonOrdenarTarjetas>
              <OrdenTarjetasOdoo orden={ordenModulos} />
            </BotonOrdenarTarjetas>
          )}
          {rol === "admin" && <BotonActualizarOdoo />}
        </div>
      </div>

      <div className="mt-5">
        <SelectorEmpresa companias={COMPANIAS_ODOO} companyIdActual={companyId} />
      </div>

      {modulosVisibles.length === 0 ? (
        <p className="mt-8 text-sm text-tinta/50">
          No tienes ningún módulo asignado en Panel Odoo. Pídele a un administrador que te asigne acceso.
        </p>
      ) : (
        <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {/* Un Suspense POR TARJETA, no uno para toda la grilla.

              Sin esto la pagina entera —titulo, selector de empresa, boton de
              actualizar— esperaba a que las ocho tarjetas terminaran sus 27
              consultas, porque el `await` de cada tarjeta bloquea el render del
              arbol completo. Con un limite por tarjeta, la cascara se manda de
              inmediato y cada tarjeta entra en su hueco cuando esta lista: la
              mas rapida ya no espera a la mas lenta.

              El fallback tiene el mismo alto y borde que la tarjeta real, asi
              que la grilla no salta cuando cada una llega. */}
          {modulosARenderizar.map((modulo) => (
            <Suspense key={modulo} fallback={<EsqueletoTarjeta titulo={NOMBRES_MODULO[modulo]} />}>
              {tarjetasPorModulo[modulo]}
            </Suspense>
          ))}
        </div>
      )}
    </div>
  );
}

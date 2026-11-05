import Link from "next/link";
import { notFound } from "next/navigation";
import {
  IconAdjustmentsHorizontal,
  IconArrowLeft,
  IconBell,
  IconBuildingWarehouse,
  IconCoins,
  IconHistory,
  IconListNumbers,
  IconMapPin,
  IconReceipt,
  IconTag,
  type Icon,
} from "@tabler/icons-react";
import FormularioProducto from "@/components/inventario/FormularioProducto";
import FormularioLote from "@/components/inventario/FormularioLote";
import FormularioRegla from "@/components/inventario/FormularioRegla";
import FormularioAjuste from "@/components/inventario/FormularioAjuste";
import FotosProducto from "@/components/inventario/FotosProducto";
import { ChipEstadoOperativo, tonoDeTexto } from "@/components/inventario/Visual";
import { IconoTile, type TonoIcono } from "@/components/contactos/Visual";
import { fotosDeProducto, leerMinimoGeneral, listarCategorias, listarUbicaciones, listarUnidades, obtenerFichaProducto } from "@/lib/inventario";
import {
  ETIQUETA_CERTIFICADO,
  ETIQUETA_SEGUIMIENTO,
  ETIQUETA_TIPO_PRODUCTO,
  diasHasta,
  estadoCertificado,
  formatearCantidad,
  formatearMonto,
  porVencer,
} from "@/lib/inventario-modelo";
import { TARJETA } from "@/lib/estilos";

export const dynamic = "force-dynamic";

export default async function FichaProductoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [ficha, categorias, unidades, ubicaciones, fotos, general] = await Promise.all([
    obtenerFichaProducto(id),
    listarCategorias(),
    listarUnidades(),
    listarUbicaciones(),
    fotosDeProducto(id),
    leerMinimoGeneral(),
  ]);
  if (!ficha) notFound();

  const { producto, stock, aMano, lotes, reglas, movimientos } = ficha;
  const abrevUni = unidades.find((u) => u.id === producto.unidadId)?.abreviacion ?? "";
  const nombreCat = categorias.find((c) => c.id === producto.categoriaId)?.nombre;
  const nombreUbi = new Map(ubicaciones.map((u) => [u.id, u.nombre]));
  const esFisico = producto.tipo !== "servicio";

  const certificado = ETIQUETA_CERTIFICADO[estadoCertificado(producto)];

  return (
    <div className="space-y-5">
      <Link href="/inventario/productos" className="inline-flex items-center gap-1 text-sm font-semibold text-gris transition hover:text-tinta">
        <IconArrowLeft size={16} /> Volver a productos
      </Link>

      {/* Cabecera: la foto, qué es y el botón para editarlo. Debajo, las cuatro cifras. */}
      <section className={`${TARJETA} p-5`}>
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
          <FotosProducto productoId={producto.id} fotos={fotos} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="text-2xl font-extrabold tracking-tight text-tinta">{producto.nombre}</h2>
                <p className="mt-1 text-sm text-gris">
                  {producto.sku ? <>Código <span className="font-mono text-tinta">{producto.sku}</span></> : "Sin código"}
                  {producto.marca ? ` · Marca ${producto.marca}` : ""}
                </p>
              </div>
              <FormularioProducto categorias={categorias} unidades={unidades} ubicaciones={ubicaciones} producto={producto} />
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              <ChipEstadoOperativo estado={producto.estadoOperativo} />
              <span className="rounded-full bg-tinta/[0.06] px-2.5 py-0.5 text-[11px] font-semibold text-gris">{ETIQUETA_TIPO_PRODUCTO[producto.tipo]}</span>
              {nombreCat && <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${tonoDeTexto(nombreCat)}`}>{nombreCat}</span>}
              {producto.seguimiento !== "ninguno" && (
                <span className="rounded-full bg-tinta/[0.06] px-2.5 py-0.5 text-[11px] font-semibold text-gris">{ETIQUETA_SEGUIMIENTO[producto.seguimiento]}</span>
              )}
              {certificado && <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${certificado.tono}`}>{certificado.texto}</span>}
            </div>
            {producto.descripcion && <p className="mt-3 max-w-2xl text-sm leading-relaxed text-gris">{producto.descripcion}</p>}

            <div className="mt-5 grid grid-cols-2 gap-2 lg:grid-cols-4">
              <Dato Icono={IconBuildingWarehouse} etiqueta="Hay en bodega" valor={esFisico ? `${formatearCantidad(aMano)} ${abrevUni}`.trim() : "—"} destacado />
              <Dato Icono={IconReceipt} etiqueta="Nos cuesta (c/u)" valor={formatearMonto(producto.costo)} />
              <Dato Icono={IconTag} etiqueta="Lo vendemos a (c/u)" valor={formatearMonto(producto.precio)} />
              <Dato Icono={IconCoins} etiqueta="Vale todo lo que hay" valor={formatearMonto(aMano * producto.costo)} />
            </div>
          </div>
        </div>
      </section>

      {/* Dos columnas que crecen cada una a su ritmo: sin huecos cuando una sección es corta. */}
      <div className="grid gap-5 lg:grid-cols-2 lg:items-start">
        <div className="space-y-5">
          {/* ¿Dónde está? */}
          {esFisico && (
            <Bloque Icono={IconMapPin} tono="azul" titulo="¿Dónde está?" ayuda="Cuánto hay en cada bodega.">
              {stock.length === 0 ? (
                <p className="rounded-xl bg-tinta/[0.03] px-4 py-6 text-center text-sm text-gris">Todavía no hay nada guardado. Usa «Corregir la cantidad» para anotar lo que tienes.</p>
              ) : (
                <ul className="divide-y divide-borde rounded-xl border border-borde">
                  {stock.map((s) => (
                    <li key={s.ubicacion.id} className="flex items-center gap-3 px-4 py-3 text-sm">
                      <span className="flex-1 text-tinta">{s.ubicacion.nombre}</span>
                      {s.reservado > 0 && <span className="text-xs tabular-nums text-gris">{formatearCantidad(s.reservado)} apartado</span>}
                      <span className="font-bold tabular-nums text-tinta">{formatearCantidad(s.cantidad)} {abrevUni}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Bloque>
          )}
          {/* Avísame cuando quede poco */}
          {esFisico && (
            <Bloque Icono={IconBell} tono="ambar" titulo="Avísame cuando quede poco" ayuda={
              reglas.length
                ? "Este producto tiene su propio mínimo: si hay menos, aparece en «Reabastecimiento»."
                : general.minimo > 0
                  ? `Usa el aviso general: con menos de ${formatearCantidad(general.minimo)} aparece en «Reabastecimiento». Si este necesita otro número, ponlo aquí.`
                  : "Todavía no hay un aviso general (se pone en Inventario › Configuración). Si quieres uno solo para este producto, ponlo aquí."
            }>
              <FormularioRegla productoId={producto.id} ubicaciones={ubicaciones} reglas={reglas} />
            </Bloque>
          )}
        </div>
        <div className="space-y-5">
          {/* Corregir la cantidad */}
          {esFisico && (
            <Bloque Icono={IconAdjustmentsHorizontal} tono="marca" titulo="Corregir la cantidad" ayuda="¿Contaste y hay otra cantidad? Escríbela aquí y el sistema ajusta la diferencia.">
              <FormularioAjuste producto={{ id: producto.id, nombre: producto.nombre }} ubicaciones={ubicaciones} lotes={lotes} />
            </Bloque>
          )}
          {/* Lotes o series */}
          {esFisico && producto.seguimiento !== "ninguno" && (
            <Bloque
              Icono={IconListNumbers}
              tono="verde"
              titulo={producto.seguimiento === "serie" ? "Números de serie" : "Lotes"}
              ayuda={producto.seguimiento === "serie" ? "Cada unidad con su número, para saber cuál es cuál." : "Cada lote con su vencimiento."}
            >
              {lotes.length > 0 && (
                <ul className="mb-3 divide-y divide-borde rounded-xl border border-borde">
                  {lotes.map((l) => {
                    const d = diasHasta(l.fechaVencimiento);
                    return (
                      <li key={l.id} className="flex items-center gap-2 px-3 py-2 text-sm">
                        <span className="flex-1 font-mono text-tinta">{l.nombre}</span>
                        {l.fechaVencimiento && (
                          <span className={`text-xs ${porVencer(l.fechaVencimiento) ? "font-semibold text-amber-600" : "text-gris"}`}>
                            vence {l.fechaVencimiento}{d !== null && d < 0 ? " (vencido)" : ""}
                          </span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
              <FormularioLote productoId={producto.id} seguimiento={producto.seguimiento} />
            </Bloque>
          )}
        </div>
      </div>

      {/* Historial */}
      <Bloque Icono={IconHistory} tono="azul" titulo="Historial" ayuda="Cada vez que este producto entró, salió o se movió de bodega.">
        {movimientos.length === 0 ? (
          <p className="rounded-xl bg-tinta/[0.03] px-4 py-6 text-center text-sm text-gris">Todavía no se ha movido.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-borde">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-borde text-left text-xs font-semibold text-gris">
                  <th className="px-4 py-2.5">Documento</th>
                  <th className="px-4 py-2.5">Desde → hacia</th>
                  <th className="px-4 py-2.5 text-right">Cantidad</th>
                  <th className="px-4 py-2.5">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-borde">
                {movimientos.map((m) => (
                  <tr key={m.id}>
                    <td className="px-4 py-2.5">
                      <Link href={`/inventario/operaciones/${m.transferenciaId}`} className="font-mono font-semibold text-azul hover:underline">{m.referencia}</Link>
                    </td>
                    <td className="px-4 py-2.5 text-gris">
                      {nombreUbi.get(m.ubicacionOrigenId) ?? "—"} → {nombreUbi.get(m.ubicacionDestinoId) ?? "—"}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-tinta">{formatearCantidad(m.cantidad)}</td>
                    <td className="px-4 py-2.5 text-xs text-gris">{m.estado === "hecho" ? "Hecho" : m.estado === "cancelado" ? "Cancelado" : "Borrador"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Bloque>
    </div>
  );
}

/** Una sección de la ficha: ícono, título en palabras simples y una línea que explica para qué sirve. */
function Bloque({ Icono, tono, titulo, ayuda, children }: { Icono: Icon; tono: TonoIcono; titulo: string; ayuda: string; children: React.ReactNode }) {
  return (
    <section className={`${TARJETA} p-5`}>
      <div className="mb-4 flex items-start gap-3">
        <IconoTile Icono={Icono} tono={tono} />
        <div>
          <h3 className="text-base font-bold text-tinta">{titulo}</h3>
          <p className="text-sm text-gris">{ayuda}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

function Dato({ Icono, etiqueta, valor, destacado = false }: { Icono: Icon; etiqueta: string; valor: string; destacado?: boolean }) {
  return (
    <div className={`rounded-xl px-3 py-2.5 ${destacado ? "bg-naranjo/[0.07]" : "bg-tinta/[0.03]"}`}>
      <span className="flex items-center gap-1.5 text-xs text-gris">
        <Icono size={14} stroke={1.8} className={destacado ? "text-naranjo" : "text-gris-suave"} />
        {etiqueta}
      </span>
      <p className="mt-0.5 text-lg font-extrabold tabular-nums text-tinta">{valor}</p>
    </div>
  );
}

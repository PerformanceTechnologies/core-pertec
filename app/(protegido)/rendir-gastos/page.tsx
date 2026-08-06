import { Suspense } from "react";
import Link from "next/link";
import { exigirAccesoApp } from "@/lib/autorizacion";
import { listarRendiciones } from "@/lib/rendidor/datos";
import { buscarEmpleadoPorCorreo } from "@/lib/rendidor/odoo";
import SelectorEmpleado from "@/components/rendidor/SelectorEmpleado";
import BotonBorrarRendicion from "@/components/rendidor/BotonBorrarRendicion";
import BotonEnviar from "@/components/BotonEnviar";
import { money, pct } from "@/lib/cotizador/formato";
import { crearRendicionAction, eliminarRendicionAction } from "./acciones";

const SLUG_APP = "rendir-gastos";

export const dynamic = "force-dynamic";

/**
 * El campo "quién rinde", detrás de su propio límite de Suspense.
 *
 * La ficha se busca por el correo del usuario logueado, que es único y lo
 * administra RRHH. Eso es un round-trip XML-RPC a Odoo, y la página es
 * force-dynamic: si se esperara antes de renderizar, CADA carga de la lista
 * pagaría esa latencia. Acá el resto de la página se manda enseguida y este
 * campo entra cuando Odoo contesta.
 *
 * Si Odoo no responde no se cae nada: el selector queda en modo búsqueda por
 * nombre.
 */
async function CampoEmpleado({ correo }: { correo: string }) {
  const empleado = await buscarEmpleadoPorCorreo(correo).catch((e) => {
    console.error("[rendidor] No se pudo buscar el empleado por correo:", e);
    return null;
  });
  return <SelectorEmpleado inicial={empleado} />;
}

function CampoEmpleadoCargando() {
  return (
    <div>
      <label className="block text-[10px] font-semibold uppercase tracking-wide text-tinta/45">
        Quién rinde (empleado de Odoo)
      </label>
      <div className="mt-1 h-[38px] animate-pulse rounded-md border border-borde bg-tinta/5" />
      <p className="mt-1 text-[10px] text-tinta/40">Buscando tu ficha en Odoo...</p>
    </div>
  );
}

export default async function RendirGastosPage() {
  const usuario = await exigirAccesoApp(SLUG_APP);
  const rendiciones = await listarRendiciones(usuario.id);

  const faltaApiKey = !process.env.ANTHROPIC_API_KEY;

  // Los tres números de las tarjetas. Salen de la vista rendiciones_resumen, que
  // ya trae la cantidad y el total calculados en Postgres.
  const totalRendido = rendiciones.reduce((a, r) => a + r.totalGastos, 0);
  const totalComprobantes = rendiciones.reduce((a, r) => a + r.cantidadGastos, 0);
  const borradores = rendiciones.filter((r) => r.estado === "borrador");
  const cargadas = rendiciones.filter((r) => r.estado === "cargada_odoo");
  const montoBorradores = borradores.reduce((a, r) => a + r.totalGastos, 0);

  return (
    <div>
      <span className="etiqueta-seccion">Rendir Gastos</span>
      <h1 className="mt-2 font-condensed text-2xl font-bold uppercase text-tinta">Mis rendiciones</h1>
      <p className="mt-1 max-w-2xl text-sm text-tinta/60">
        Subí las boletas y facturas, revisá lo que se leyó de cada una, y cargalas a Odoo con el proveedor, el
        tipo de documento y el IVA correctos.
      </p>

      {faltaApiKey && (
        <div className="mt-4 rounded-lg border border-naranjo/25 bg-naranjo/5 px-3 py-2 text-xs text-naranjo">
          Falta configurar <code className="font-mono">ANTHROPIC_API_KEY</code> en el entorno. Sin eso los
          comprobantes no se pueden leer automáticamente — se pueden cargar a mano igual.
        </div>
      )}

      {/* Mismos tres estilos de tarjeta que el Cotizador (naranjo / gris / teal),
          para que los dos modulos se lean como el mismo producto. */}
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-naranjo/20 bg-naranjo/[0.06] p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-tinta/50">Total rendido</div>
          <div className="mt-1 font-condensed text-2xl font-bold text-tinta">{money(totalRendido)}</div>
          <div className="mt-1 text-xs text-tinta/50">
            {rendiciones.length} rendici
            {rendiciones.length === 1 ? "ón" : "ones"} · {totalComprobantes} comprobante
            {totalComprobantes === 1 ? "" : "s"}
          </div>
        </div>
        <div className="rounded-xl border border-gris/25 bg-gris/[0.08] p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-tinta/50">En borrador</div>
          <div className="mt-1 font-condensed text-2xl font-bold text-naranjo">{borradores.length}</div>
          <div className="mt-1 text-xs text-tinta/50">
            {borradores.length === 0
              ? "nada pendiente de cargar"
              : `${money(montoBorradores)} sin cargar a Odoo`}
          </div>
        </div>
        <div className="rounded-xl border border-teal/20 bg-teal/[0.06] p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-tinta/50">Cargadas a Odoo</div>
          <div className="mt-1 font-condensed text-2xl font-bold text-teal">
            {rendiciones.length ? pct(cargadas.length / rendiciones.length, 0) : "—"}
          </div>
          <div className="mt-1 text-xs text-tinta/50">
            {cargadas.length} de {rendiciones.length} cargadas
          </div>
        </div>
      </div>

      {/* Banda colapsable, igual que "Nueva cotización". Arranca abierta solo
          cuando no hay nada: con rendiciones en la lista, lo que importa es la
          lista, no el formulario. <details> lo hace sin una linea de JS. */}
      <details
        open={rendiciones.length === 0}
        className="group mt-6 rounded-xl border-2 border-naranjo bg-naranjo/5 open:bg-white"
      >
        <summary className="flex cursor-pointer list-none items-center gap-2 px-5 py-4 font-condensed text-base font-bold uppercase tracking-wide text-naranjo transition hover:bg-naranjo/10 group-open:hover:bg-transparent">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-naranjo text-sm font-black text-white">
            +
          </span>
          Nueva rendición
        </summary>
        <div className="px-5 pb-5">
          {/* Los campos ocupan la grilla y la acción vive en su propia fila. El
              botón NO va como una celda más: estaba al lado de Empresa con
              items-end, y se alineaba al borde inferior de una fila cuya altura
              la marca el campo MÁS su texto de ayuda, así que quedaba colgado. */}
          <form action={crearRendicionAction} className="grid grid-cols-1 gap-x-4 gap-y-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="block text-[10px] font-semibold uppercase tracking-wide text-tinta/45">
                Título o detalle de la rendición
              </label>
              <input
                name="tituloRendicion"
                required
                placeholder="Ej: Operación Antucoya — marzo"
                className="mt-1 w-full rounded-md border border-borde bg-white px-2.5 py-1.5 text-sm"
              />
            </div>
            <Suspense fallback={<CampoEmpleadoCargando />}>
              <CampoEmpleado correo={usuario.correo} />
            </Suspense>
            <div>
              <label className="block text-[10px] font-semibold uppercase tracking-wide text-tinta/45">
                Monto asignado (CLP)
              </label>
              <input
                name="montoAsignado"
                type="number"
                min={0}
                defaultValue={0}
                className="mt-1 w-full rounded-md border border-borde bg-white px-2.5 py-1.5 text-sm"
              />
              <p className="mt-1 text-[10px] text-tinta/40">0 si no hubo fondo por rendir.</p>
            </div>
            <div>
              <label className="block text-[10px] font-semibold uppercase tracking-wide text-tinta/45">
                Empresa
              </label>
              <select
                name="empresaCompanyId"
                defaultValue={1}
                className="mt-1 w-full rounded-md border border-borde bg-white px-2.5 py-1.5 text-sm"
              >
                <option value={1}>PERFORMANCE TECHNOLOGIES SPA</option>
                <option value={2}>PERFORMANCE SERVICE SPA</option>
              </select>
              <p className="mt-1 text-[10px] text-tinta/40">
                Define el impuesto de IVA que se usa al cargar a Odoo.
              </p>
            </div>
            <div className="mt-1 flex justify-end border-t border-borde pt-4 sm:col-span-2">
              {/* Ancho completo en una columna: a la derecha y solo, en pantalla
                angosta queda huérfano. */}
              {/* Crear la rendición toca Odoo y Supabase, así que puede tardar
                  un par de segundos. Sin la rueda el botón parece no haber
                  hecho nada y la gente lo aprieta de nuevo. */}
              <BotonEnviar
                cargando="Creando rendición..."
                className="w-full rounded-md bg-tinta px-4 py-2 text-xs font-semibold uppercase tracking-wide text-crema transition hover:bg-tinta/85 sm:w-auto"
              >
                Crear y subir comprobantes →
              </BotonEnviar>
            </div>
          </form>
        </div>
      </details>

      {rendiciones.length === 0 ? (
        <p className="mt-6 text-sm text-tinta/50">
          Todavía no tenés rendiciones. Empezá arriba con el título, el fondo entregado y la empresa.
        </p>
      ) : (
        <>
          {/* El conteo ya vive en la tarjeta de arriba, así que acá solo va el
              título de la sección. */}
          <h2 className="mt-8 font-condensed text-lg font-bold uppercase tracking-wide text-tinta">
            Rendiciones
          </h2>

          {/* Tabla en vez de tarjetas sueltas: las cifras quedan alineadas a la
              derecha y comparables entre filas, que es lo que uno viene a hacer
              acá. Mismos estilos de cabecera y pastillas que la tabla del
              Cotizador. */}
          <div className="mt-2 overflow-x-auto rounded-2xl border border-borde bg-white shadow-sm">
            <table className="w-full min-w-[1000px] table-fixed text-left text-sm">
              {/* Suman 1000, el mismo min-w de la tabla: así en una ventana
                  angosta la tabla scrollea entera en vez de comprimir las
                  columnas hasta que los montos se parten en dos líneas. */}
              <colgroup>
                <col style={{ width: 210 }} />
                <col style={{ width: 120 }} />
                <col style={{ width: 85 }} />
                <col style={{ width: 105 }} />
                <col style={{ width: 110 }} />
                <col style={{ width: 110 }} />
                <col style={{ width: 90 }} />
                <col style={{ width: 170 }} />
              </colgroup>
              <thead className="border-b border-borde bg-crema/60 text-xs uppercase text-tinta/50">
                <tr>
                  <th className="px-3 py-3">Rendición</th>
                  <th className="px-3 py-3">Quién rinde</th>
                  <th className="px-3 py-3 text-right">Comprob.</th>
                  <th className="px-3 py-3 text-right">Fondo</th>
                  <th className="px-3 py-3 text-right">Rendido</th>
                  <th className="px-3 py-3 text-right">Saldo</th>
                  <th className="px-3 py-3">Estado</th>
                  <th className="px-3 py-3" />
                </tr>
              </thead>
              <tbody>
                {rendiciones.map((r) => {
                  // Positivo: la persona puso más que el fondo y hay que
                  // reembolsarle. Negativo: sobró fondo y lo tiene que devolver.
                  const saldo = r.totalGastos - r.montoAsignado;
                  const cargada = r.estado === "cargada_odoo";
                  // Una rendición recién creada, sin fondo ni comprobantes, tiene
                  // saldo 0 — pero pintarlo de verde como "a reembolsar" es ruido:
                  // todavía no hay nada que devolver ni cobrar.
                  const saldoVacio = r.totalGastos === 0 && r.montoAsignado === 0;

                  return (
                    <tr key={r.id} className="border-b border-borde last:border-0 hover:bg-crema/40">
                      <td className="px-3 py-3">
                        <Link
                          href={`/rendir-gastos/${r.id}`}
                          title={r.tituloRendicion}
                          className="block truncate font-condensed text-sm font-bold uppercase tracking-wide text-tinta transition hover:text-naranjo"
                        >
                          {r.tituloRendicion}
                        </Link>
                      </td>
                      <td className="px-3 py-3 text-tinta/60">
                        <span className="block truncate" title={r.nombreQuienRinde}>
                          {r.nombreQuienRinde}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-right text-tinta/60">{r.cantidadGastos}</td>
                      <td className="px-3 py-3 text-right text-tinta/60">{money(r.montoAsignado)}</td>
                      <td className="px-3 py-3 text-right font-semibold text-tinta">
                        {money(r.totalGastos)}
                      </td>
                      <td
                        className={`px-3 py-3 text-right ${
                          saldoVacio ? "text-tinta/30" : saldo >= 0 ? "text-teal" : "text-naranjo"
                        }`}
                        title={
                          saldoVacio
                            ? "Sin fondo entregado y sin comprobantes todavía"
                            : saldo >= 0
                              ? `A reembolsar a ${r.nombreQuienRinde}`
                              : "A reintegrar a la empresa"
                        }
                      >
                        {saldoVacio ? "—" : money(Math.abs(saldo))}
                      </td>
                      <td className="px-3 py-3">
                        <span
                          className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                            cargada ? "bg-teal/10 text-teal" : "bg-gris/10 text-gris"
                          }`}
                        >
                          {cargada ? "Cargada" : "Borrador"}
                        </span>
                      </td>
                      <td className="px-3 py-3 align-top">
                        {/* También las cargadas. La confirmación avisa que los
                            gastos quedan vivos en Odoo y muestra sus ids. */}
                        <BotonBorrarRendicion
                          id={r.id}
                          titulo={r.tituloRendicion}
                          cargada={cargada}
                          idsOdoo={r.odooExpenseIds}
                          borrar={eliminarRendicionAction}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

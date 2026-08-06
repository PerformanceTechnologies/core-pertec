import { Suspense } from "react";
import { exigirAccesoApp } from "@/lib/autorizacion";
import { listarRendiciones } from "@/lib/rendidor/datos";
import { buscarEmpleadoPorCorreo } from "@/lib/rendidor/odoo";
import SelectorEmpleado from "@/components/rendidor/SelectorEmpleado";
import ListaRendiciones from "@/components/rendidor/ListaRendiciones";
import BotonEnviar from "@/components/BotonEnviar";
import { money } from "@/lib/cotizador/formato";
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

  // Los números de la cinta de resumen. Salen de la vista rendiciones_resumen,
  // que ya trae la cantidad y el total calculados en Postgres.
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

      {/* Una sola cinta oscura en vez de tres tarjetas de color. El Cotizador
          usa las tarjetas pastel; este módulo no tiene por qué verse igual, y
          apretar los cuatro números en una banda deja la lista más arriba, que
          es a lo que se entra. Los separadores son bordes entre celdas de la
          grilla, no elementos aparte. */}
      <dl className="mt-6 grid grid-cols-2 overflow-hidden rounded-2xl bg-tinta text-crema sm:grid-cols-4">
        <div className="border-b border-crema/10 px-5 py-4 sm:border-b-0 sm:border-r">
          <dt className="text-[10px] font-semibold uppercase tracking-[0.14em] text-crema/45">
            Total rendido
          </dt>
          <dd className="mt-1 font-condensed text-2xl font-bold tabular-nums">{money(totalRendido)}</dd>
        </div>
        <div className="border-b border-crema/10 px-5 py-4 sm:border-b-0 sm:border-r">
          <dt className="text-[10px] font-semibold uppercase tracking-[0.14em] text-crema/45">
            Sin cargar a Odoo
          </dt>
          <dd className="mt-1 font-condensed text-2xl font-bold tabular-nums text-naranjo-suave">
            {money(montoBorradores)}
          </dd>
          <dd className="text-[11px] text-crema/40">
            en {borradores.length} borrador{borradores.length === 1 ? "" : "es"}
          </dd>
        </div>
        <div className="border-crema/10 px-5 py-4 sm:border-r">
          <dt className="text-[10px] font-semibold uppercase tracking-[0.14em] text-crema/45">Cargadas</dt>
          <dd className="mt-1 font-condensed text-2xl font-bold tabular-nums text-teal-suave">
            {cargadas.length}
            <span className="text-base text-crema/30"> / {rendiciones.length}</span>
          </dd>
        </div>
        <div className="px-5 py-4">
          <dt className="text-[10px] font-semibold uppercase tracking-[0.14em] text-crema/45">
            Comprobantes
          </dt>
          <dd className="mt-1 font-condensed text-2xl font-bold tabular-nums">{totalComprobantes}</dd>
        </div>
      </dl>

      {/* Colapsable con <details>, sin una línea de JS. Arranca abierta solo
          cuando no hay nada: con rendiciones en la lista, lo que importa es la
          lista, no el formulario.

          El cuadrado naranjo gira 45 grados al abrirse, así que la cruz pasa a
          ser una equis y el mismo elemento sirve de "abrir" y de "cerrar". */}
      <details open={rendiciones.length === 0} className="group mt-4">
        <summary className="flex cursor-pointer list-none items-center gap-3 rounded-xl border border-borde bg-superficie px-4 py-3 transition hover:border-naranjo/50 group-open:rounded-b-none group-open:border-b-transparent">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-naranjo text-base font-bold leading-none text-white transition-transform duration-200 group-open:rotate-45">
            +
          </span>
          <span className="font-condensed text-base font-bold uppercase tracking-wide text-tinta">
            Nueva rendición
          </span>
          <span className="ml-auto text-[11px] text-tinta/40 group-open:hidden">
            Crear una y empezar a subir comprobantes
          </span>
        </summary>
        <div className="rounded-b-xl border border-t-0 border-borde bg-superficie px-4 pb-4">
          {/* Los campos ocupan la grilla y la acción vive en su propia fila. El
              botón NO va como una celda más: estaba al lado de Empresa con
              items-end, y se alineaba al borde inferior de una fila cuya altura
              la marca el campo MÁS su texto de ayuda, así que quedaba colgado. */}
          <form
            action={crearRendicionAction}
            className="grid grid-cols-1 gap-x-4 gap-y-4 border-t border-borde pt-4 sm:grid-cols-2"
          >
            <div className="sm:col-span-2">
              <label className="block text-[10px] font-semibold uppercase tracking-wide text-tinta/45">
                Título o detalle de la rendición
              </label>
              <input
                name="tituloRendicion"
                required
                placeholder="Ej: Operación Antucoya — marzo"
                className="mt-1 w-full rounded-md border border-borde bg-superficie px-2.5 py-1.5 text-sm"
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
                className="mt-1 w-full rounded-md border border-borde bg-superficie px-2.5 py-1.5 text-sm"
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
                className="mt-1 w-full rounded-md border border-borde bg-superficie px-2.5 py-1.5 text-sm"
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
        <p className="mt-8 rounded-xl border border-dashed border-borde px-4 py-10 text-center text-sm text-tinta/50">
          Todavía no tenés rendiciones. Empezá arriba con el título, el fondo entregado y la empresa.
        </p>
      ) : (
        <ListaRendiciones rendiciones={rendiciones} borrar={eliminarRendicionAction} />
      )}
    </div>
  );
}

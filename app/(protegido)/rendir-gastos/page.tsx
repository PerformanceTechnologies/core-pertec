import { Suspense } from "react";
import Link from "next/link";
import { exigirAccesoApp } from "@/lib/autorizacion";
import { listarRendiciones } from "@/lib/rendidor/datos";
import { buscarEmpleadoPorCorreo } from "@/lib/rendidor/odoo";
import SelectorEmpleado from "@/components/rendidor/SelectorEmpleado";
import { crearRendicionAction } from "./acciones";

const SLUG_APP = "rendir-gastos";

export const dynamic = "force-dynamic";

const money = (n: number) =>
  new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 }).format(n);

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

      <div className="mt-6 rounded-2xl border border-borde bg-white p-5 shadow-sm">
        <p className="font-condensed text-base font-bold uppercase tracking-wide text-tinta">
          Nueva rendición
        </p>
        <form action={crearRendicionAction} className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
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
          <div className="flex items-end">
            <button
              type="submit"
              className="rounded-md bg-tinta px-4 py-2 text-xs font-semibold uppercase tracking-wide text-crema transition hover:bg-tinta/85"
            >
              Crear y subir comprobantes →
            </button>
          </div>
        </form>
      </div>

      <div className="mt-6">
        {rendiciones.length === 0 ? (
          <p className="text-sm text-tinta/50">Todavía no tenés rendiciones.</p>
        ) : (
          <div className="space-y-2">
            {rendiciones.map((r) => {
              return (
                <Link
                  key={r.id}
                  href={`/rendir-gastos/${r.id}`}
                  className="block rounded-xl border border-borde bg-white px-4 py-3 shadow-sm transition hover:border-naranjo/40"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-condensed text-sm font-bold uppercase tracking-wide text-tinta">
                        {r.tituloRendicion}
                      </p>
                      <p className="mt-0.5 text-xs text-tinta/50">
                        {r.nombreQuienRinde} · {r.cantidadGastos} comprobante(s) ·{" "}
                        {money(r.totalGastos)}
                      </p>
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide ${
                        r.estado === "cargada_odoo"
                          ? "bg-teal/10 text-teal"
                          : "bg-naranjo/10 text-naranjo"
                      }`}
                    >
                      {r.estado === "cargada_odoo" ? "Cargada a Odoo" : "Borrador"}
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

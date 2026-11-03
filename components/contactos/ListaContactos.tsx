import Link from "next/link";
import { IconChevronRight, IconSearch, IconUsers } from "@tabler/icons-react";
import FormularioContacto from "@/components/contactos/FormularioContacto";
import { Avatar, ChipsRol, EstadoFactura, Rut } from "@/components/contactos/Visual";
import {
  ETIQUETA_FILTRO,
  coincideBusqueda,
  esFiltro,
  faltantesParaFacturar,
  listoParaFacturar,
  pasaFiltro,
  type Contacto,
  type FiltroContactos,
} from "@/lib/contactos-modelo";
import { CAMPO, TARJETA } from "@/lib/estilos";

const FILTROS: FiltroContactos[] = ["todos", "clientes", "proveedores", "por_completar", "archivados"];

/**
 * La lista de contactos con sus cifras, filtros y búsqueda. Recibe los datos ya leídos: la página
 * los trae de Supabase (y una prueba puede dibujarla con datos de relleno).
 */
export default function ListaContactos({
  todos,
  ver,
  q,
}: {
  todos: (Contacto & { personas: number })[];
  ver?: string;
  q?: string;
}) {
  const filtro: FiltroContactos = esFiltro(ver) ? ver : "todos";
  const contactos = todos.filter((c) => pasaFiltro(c, filtro) && coincideBusqueda(c, q ?? ""));
  const activos = todos.filter((c) => c.activo);
  const listos = activos.filter(listoParaFacturar).length;
  const url = (f: FiltroContactos) => {
    const p = new URLSearchParams();
    if (f !== "todos") p.set("ver", f);
    if (q) p.set("q", q);
    const s = p.toString();
    return s ? `/finanzas/contactos?${s}` : "/finanzas/contactos";
  };

  const empresas = activos.filter((c) => c.tipoPersona === "empresa").map((c) => ({ id: c.id, razonSocial: c.razonSocial, rut: c.rut }));
  const cifras = [
    { etiqueta: "Contactos", valor: activos.length, f: "todos" as const },
    { etiqueta: "Clientes", valor: activos.filter((c) => c.esCliente).length, f: "clientes" as const },
    { etiqueta: "Proveedores", valor: activos.filter((c) => c.esProveedor).length, f: "proveedores" as const },
  ];
  const pctListos = activos.length ? Math.round((listos / activos.length) * 100) : 0;

  return (
    <div className="space-y-4">
      {/* ── Banda: la libreta de un vistazo ── */}
      <section className="banda-contraste overflow-hidden rounded-2xl px-6 py-5 sm:px-7">
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
          <div>
            <span className="flex items-center gap-2.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-naranjo">
              <span className="h-px w-6 bg-naranjo" /> Libreta de contactos
            </span>
            <div className="mt-2 flex flex-wrap items-end gap-x-6 gap-y-2">
              <p className="texto-banda font-condensed text-4xl font-bold leading-none tabular-nums">
                {pctListos}%<span className="texto-banda-65 ml-2 text-lg font-semibold">listos para facturar</span>
              </p>
            </div>
            <div className="mt-3 h-1.5 max-w-md overflow-hidden rounded-full bg-white/10">
              <div className="h-full rounded-full bg-emerald-500" style={{ width: `${pctListos}%` }} />
            </div>
            <p className="texto-banda-65 mt-2 text-xs">
              {listos.toLocaleString("es-CL")} de {activos.length.toLocaleString("es-CL")} tienen todo lo que pide el SII.{" "}
              {activos.length - listos > 0 && (
                <Link href={url("por_completar")} className="font-semibold text-naranjo hover:underline">
                  Ver los {(activos.length - listos).toLocaleString("es-CL")} por completar →
                </Link>
              )}
            </p>
          </div>
          <dl className="borde-banda grid grid-cols-3 gap-x-7 rounded-xl border px-5 py-3">
            {cifras.map((m) => (
              <Link key={m.etiqueta} href={url(m.f)} className="group">
                <dt className="texto-banda-45 text-[10px] font-semibold uppercase tracking-[0.14em]">{m.etiqueta}</dt>
                <dd className="texto-banda mt-0.5 font-condensed text-2xl font-bold tabular-nums transition group-hover:text-naranjo">{m.valor.toLocaleString("es-CL")}</dd>
              </Link>
            ))}
          </dl>
        </div>
      </section>

      {/* ── Buscador a la izquierda, filtros al medio, nuevo contacto a la derecha ── */}
      <div className="flex flex-wrap items-center gap-3">
        <form className="relative w-full sm:w-80" role="search">
          {filtro !== "todos" && <input type="hidden" name="ver" value={filtro} />}
          <IconSearch size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gris" />
          <input name="q" defaultValue={q ?? ""} placeholder="RUT, razón social, giro o comuna…" className={`${CAMPO} pl-9`} aria-label="Buscar contactos" />
        </form>
        <div className="flex flex-wrap gap-1.5">
          {FILTROS.map((f) => (
            <Link
              key={f}
              href={url(f)}
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${filtro === f ? "border-tinta bg-tinta text-superficie" : "border-borde bg-superficie text-gris hover:border-naranjo/50 hover:text-tinta"}`}
            >
              {ETIQUETA_FILTRO[f]} <span className="opacity-60">{todos.filter((c) => pasaFiltro(c, f)).length}</span>
            </Link>
          ))}
        </div>
        <div className="ml-auto">
          <FormularioContacto empresas={empresas} />
        </div>
      </div>

      {contactos.length === 0 ? (
        <div className={`${TARJETA} p-10 text-center text-sm text-gris`}>
          {todos.length === 0
            ? "Todavía no hay contactos. Crea el primero con «Nuevo contacto»."
            : "Ningún contacto coincide con la búsqueda."}
        </div>
      ) : (
        <div className={`${TARJETA} overflow-hidden`}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-borde bg-tinta/[0.02] text-left text-[11px] font-semibold uppercase tracking-wide text-gris">
                  <th className="px-4 py-2.5">Contacto</th>
                  <th className="hidden px-4 py-2.5 md:table-cell">Giro y comuna</th>
                  <th className="hidden px-4 py-2.5 sm:table-cell">Relación</th>
                  <th className="px-4 py-2.5">Facturación</th>
                  <th className="px-4 py-2.5"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-borde">
                {contactos.map((c) => (
                  <tr key={c.id} className={`group transition hover:bg-tinta/[0.02] ${c.activo ? "" : "opacity-60"}`}>
                    <td className="relative px-4 py-2">
                      <span className={`absolute inset-y-0 left-0 w-1 ${faltantesParaFacturar(c).some((f) => f.bloquea) ? "bg-amber-400" : "bg-emerald-500"}`} />
                      <Link href={`/finanzas/contactos/${c.id}`} className="flex items-center gap-3">
                        <Avatar nombre={c.razonSocial} tipo={c.tipoPersona} />
                        <span className="min-w-0">
                          <span className="block max-w-[22rem] truncate font-semibold text-tinta group-hover:text-naranjo">{c.razonSocial}</span>
                          <span className="flex items-center gap-2">
                            <Rut rut={c.rut} />
                            {c.personas > 0 && (
                              <span className="inline-flex items-center gap-0.5 text-[11px] text-gris-suave" title="Personas de contacto">
                                <IconUsers size={12} /> {c.personas}
                              </span>
                            )}
                          </span>
                        </span>
                      </Link>
                    </td>
                    <td className="hidden px-4 py-2 md:table-cell">
                      <span className="block max-w-[18rem] truncate text-tinta">{c.giro ?? <span className="text-gris-suave">Sin giro</span>}</span>
                      <span className="block text-xs text-gris">{c.comuna ?? "Sin comuna"}</span>
                    </td>
                    <td className="hidden px-4 py-2 sm:table-cell"><ChipsRol cliente={c.esCliente} proveedor={c.esProveedor} /></td>
                    <td className="px-4 py-2"><EstadoFactura faltantes={faltantesParaFacturar(c)} compacto /></td>
                    <td className="px-4 py-2 text-right">
                      <Link href={`/finanzas/contactos/${c.id}`} className="inline-grid h-9 w-9 place-items-center text-gris-suave group-hover:text-naranjo" aria-label={`Ver ficha de ${c.razonSocial}`}>
                        <IconChevronRight size={18} />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

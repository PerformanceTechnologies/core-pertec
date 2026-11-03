import Link from "next/link";
import { IconChevronRight, IconSearch, IconUsers } from "@tabler/icons-react";
import FormularioContacto from "@/components/contactos/FormularioContacto";
import { Avatar, CAMPO_C, ChipsRol, EstadoFactura, HOJA, Rut } from "@/components/contactos/Visual";
import {
  ETIQUETA_FILTRO,
  coincideBusqueda,
  esFiltro,
  faltantesParaFacturar,
  pasaFiltro,
  type Contacto,
  type FiltroContactos,
} from "@/lib/contactos-modelo";

const FILTROS: FiltroContactos[] = ["todos", "clientes", "proveedores", "por_completar", "archivados"];

/**
 * La lista de contactos con su resumen, filtros y búsqueda. Recibe los datos ya leídos: la página
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
  const url = (f: FiltroContactos) => {
    const p = new URLSearchParams();
    if (f !== "todos") p.set("ver", f);
    if (q) p.set("q", q);
    const s = p.toString();
    return s ? `/finanzas/contactos?${s}` : "/finanzas/contactos";
  };

  const empresas = activos.filter((c) => c.tipoPersona === "empresa").map((c) => ({ id: c.id, razonSocial: c.razonSocial, rut: c.rut }));
  // Solo cuántos hay: cada cifra lleva al filtro correspondiente.
  const cifras = [
    { etiqueta: "Contactos", emoji: "👥", valor: activos.length, f: "todos" as const, fondo: "bg-sky-500/10" },
    { etiqueta: "Clientes", emoji: "🤝", valor: activos.filter((c) => c.esCliente).length, f: "clientes" as const, fondo: "bg-emerald-500/10" },
    { etiqueta: "Proveedores", emoji: "🚚", valor: activos.filter((c) => c.esProveedor).length, f: "proveedores" as const, fondo: "bg-amber-500/12" },
  ];

  return (
    <div className="space-y-3">
      {/* ── Resumen: una tarjeta clara y compacta ── */}
      <section className={`${HOJA} grid max-w-2xl grid-cols-3 gap-1.5 p-1.5`} aria-label="Resumen de la libreta">
        {cifras.map((m) => (
          <Link
            key={m.etiqueta}
            href={url(m.f)}
            className={`group flex flex-col items-start gap-1.5 rounded-2xl px-3 py-2.5 transition hover:bg-tinta/[0.04] sm:flex-row sm:items-center sm:gap-3 ${filtro === m.f ? "bg-tinta/[0.04]" : ""}`}
          >
            <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl text-lg leading-none ${m.fondo}`} aria-hidden>
              {m.emoji}
            </span>
            <span className="min-w-0">
              <span className="block font-condensed text-2xl font-bold leading-none tabular-nums text-tinta transition group-hover:text-naranjo">
                {m.valor.toLocaleString("es-CL")}
              </span>
              <span className="mt-1 block truncate text-[11px] font-semibold text-gris">{m.etiqueta}</span>
            </span>
          </Link>
        ))}
      </section>

      {/* ── Buscador a la izquierda, filtros al medio, nuevo contacto a la derecha ── */}
      <div className="flex flex-wrap items-center gap-2.5">
        <form className="relative w-full sm:w-72" role="search">
          {filtro !== "todos" && <input type="hidden" name="ver" value={filtro} />}
          <IconSearch size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-gris" />
          <input name="q" defaultValue={q ?? ""} placeholder="RUT, razón social, giro o comuna…" className={`${CAMPO_C} rounded-full pl-9`} aria-label="Buscar contactos" />
        </form>
        <div className="flex flex-wrap gap-1.5">
          {FILTROS.map((f) => (
            <Link
              key={f}
              href={url(f)}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${filtro === f ? "bg-tinta text-superficie" : "bg-tinta/[0.05] text-gris hover:bg-tinta/[0.09] hover:text-tinta"}`}
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
        <div className={`${HOJA} p-10 text-center text-sm text-gris`}>
          {todos.length === 0
            ? "Todavía no hay contactos. Crea el primero con «Nuevo contacto»."
            : "Ningún contacto coincide con la búsqueda."}
        </div>
      ) : (
        <div className={`${HOJA} overflow-hidden`}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-borde/60 bg-tinta/[0.02] text-left text-[11px] font-semibold uppercase tracking-wide text-gris">
                  <th className="px-4 py-2.5">Contacto</th>
                  <th className="hidden px-4 py-2.5 md:table-cell">Giro y comuna</th>
                  <th className="hidden px-4 py-2.5 sm:table-cell">Relación</th>
                  <th className="px-4 py-2.5">Facturación</th>
                  <th className="px-4 py-2.5"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-borde/60">
                {contactos.map((c) => (
                  <tr key={c.id} className={`group transition hover:bg-tinta/[0.025] ${c.activo ? "" : "opacity-60"}`}>
                    <td className="relative px-4 py-2">
                      <span className={`absolute inset-y-2 left-0 w-1 rounded-r-full ${faltantesParaFacturar(c).some((f) => f.bloquea) ? "bg-amber-400" : "bg-emerald-500"}`} />
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

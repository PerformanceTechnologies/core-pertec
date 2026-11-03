import Link from "next/link";
import { IconAddressBook, IconChevronRight, IconSearch, IconUsers } from "@tabler/icons-react";
import IntroSeccion from "@/components/inventario/IntroSeccion";
import FormularioContacto from "@/components/contactos/FormularioContacto";
import { ImportarDesdeOdoo } from "@/components/contactos/Acciones";
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
  esAdmin,
}: {
  todos: (Contacto & { personas: number })[];
  ver?: string;
  q?: string;
  esAdmin: boolean;
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

  return (
    <div className="space-y-4">
      <IntroSeccion
        Icono={IconAddressBook}
        tono="bg-naranjo/12 text-naranjo"
        titulo="Libreta de contactos"
        bajada="Cada cliente y proveedor con su RUT, razón social, giro, dirección y comuna: lo que exige el SII en la factura electrónica. Toca uno para ver su ficha."
      >
        <div className="flex flex-wrap items-center gap-2">
          <FormularioContacto />
          {esAdmin && <ImportarDesdeOdoo />}
        </div>
      </IntroSeccion>

      {/* ── Cifras ── */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { etiqueta: "Contactos", valor: activos.length, detalle: `${todos.length - activos.length} archivados`, f: "todos" as const },
          { etiqueta: "Clientes", valor: activos.filter((c) => c.esCliente).length, detalle: "Les facturamos", f: "clientes" as const },
          { etiqueta: "Proveedores", valor: activos.filter((c) => c.esProveedor).length, detalle: "Nos facturan", f: "proveedores" as const },
          { etiqueta: "Listos para facturar", valor: listos, detalle: `${activos.length - listos} por completar`, f: "por_completar" as const, barra: activos.length ? listos / activos.length : 0 },
        ].map((m) => (
          <Link key={m.etiqueta} href={url(m.f)} className={`${TARJETA} group p-4 transition hover:-translate-y-0.5 hover:border-naranjo/40`}>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-gris">{m.etiqueta}</p>
            <p className="mt-1 font-condensed text-3xl font-bold tabular-nums text-tinta">{m.valor.toLocaleString("es-CL")}</p>
            {"barra" in m ? (
              <>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-tinta/[0.06]">
                  <div className="h-full rounded-full bg-cian" style={{ width: `${Math.round((m.barra ?? 0) * 100)}%` }} />
                </div>
                <p className="mt-1 text-[11px] text-gris group-hover:text-naranjo">{m.detalle}</p>
              </>
            ) : (
              <p className="mt-0.5 text-[11px] text-gris">{m.detalle}</p>
            )}
          </Link>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex flex-wrap gap-1.5">
          {FILTROS.map((f) => (
            <Link
              key={f}
              href={url(f)}
              className={`rounded-full border px-3.5 py-1.5 text-xs font-semibold transition ${filtro === f ? "border-tinta bg-tinta text-superficie" : "border-borde bg-superficie text-gris hover:border-naranjo/50 hover:text-tinta"}`}
            >
              {ETIQUETA_FILTRO[f]} <span className="opacity-60">{todos.filter((c) => pasaFiltro(c, f)).length}</span>
            </Link>
          ))}
        </div>
        <form className="relative ml-auto w-full sm:w-80" role="search">
          {filtro !== "todos" && <input type="hidden" name="ver" value={filtro} />}
          <IconSearch size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gris" />
          <input name="q" defaultValue={q ?? ""} placeholder="RUT, razón social, giro o comuna…" className={`${CAMPO} pl-9`} aria-label="Buscar contactos" />
        </form>
      </div>

      {contactos.length === 0 ? (
        <div className={`${TARJETA} p-10 text-center text-sm text-gris`}>
          {todos.length === 0
            ? esAdmin
              ? "Todavía no hay contactos. Crea el primero con «Nuevo contacto» o tráelos todos con «Traer desde Odoo»."
              : "Todavía no hay contactos. Crea el primero con «Nuevo contacto»."
            : "Ningún contacto coincide con la búsqueda."}
        </div>
      ) : (
        <div className={`${TARJETA} overflow-hidden`}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-borde text-left text-[11px] font-semibold uppercase tracking-wide text-gris">
                  <th className="px-4 py-3">Contacto</th>
                  <th className="hidden px-4 py-3 md:table-cell">Giro y comuna</th>
                  <th className="hidden px-4 py-3 sm:table-cell">Relación</th>
                  <th className="px-4 py-3">Facturación</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-borde">
                {contactos.map((c) => (
                  <tr key={c.id} className={`group transition hover:bg-tinta/[0.02] ${c.activo ? "" : "opacity-60"}`}>
                    <td className="px-4 py-3">
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
                    <td className="hidden px-4 py-3 md:table-cell">
                      <span className="block max-w-[18rem] truncate text-tinta">{c.giro ?? <span className="text-gris-suave">Sin giro</span>}</span>
                      <span className="block text-xs text-gris">{c.comuna ?? "Sin comuna"}</span>
                    </td>
                    <td className="hidden px-4 py-3 sm:table-cell"><ChipsRol cliente={c.esCliente} proveedor={c.esProveedor} /></td>
                    <td className="px-4 py-3"><EstadoFactura faltantes={faltantesParaFacturar(c)} compacto /></td>
                    <td className="px-4 py-3 text-right">
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

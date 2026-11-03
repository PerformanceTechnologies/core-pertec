import Link from "next/link";
import { IconAlertTriangle, IconArrowLeft, IconBuilding, IconCircleCheck, IconMail, IconNotes, IconPhone, IconReceipt, IconUsers } from "@tabler/icons-react";
import FormularioContacto, { type EmpresaMin } from "@/components/contactos/FormularioContacto";
import { AccionesPersona, ArchivarContacto, FormularioPersona } from "@/components/contactos/Acciones";
import { Avatar, ChipsRol, HOJA, Rut, VistaReceptor } from "@/components/contactos/Visual";
import {
  ETIQUETA_TIPO_CONTRIBUYENTE,
  LARGO,
  comunaOficial,
  faltantesParaFacturar,
  regionDeComuna,
  textoPlazo,
  type ContactoConPersonas,
  type DatosContacto,
} from "@/lib/contactos-modelo";
import { formatearRut } from "@/lib/contratos/rut";

const fechaCl = (f: string) => new Date(f).toLocaleDateString("es-CL", { day: "numeric", month: "short", year: "numeric" });

/** La ficha de un contacto: datos tributarios, envío y cobro, personas y cómo sale en la factura. */
export default function FichaContacto({
  contacto: c,
  empresas = [],
  empresa = null,
  vinculados = [],
}: {
  contacto: ContactoConPersonas;
  empresas?: EmpresaMin[];
  /** Si es una persona: la empresa de la que es contacto. */
  empresa?: { id: string; razonSocial: string } | null;
  /** Si es una empresa: las personas de la libreta que son contacto suyo. */
  vinculados?: { id: string; nombre: string; correo: string | null; telefono: string | null }[];
}) {
  const faltantes = faltantesParaFacturar(c);
  const bloquean = faltantes.filter((f) => f.bloquea);
  const avisos = faltantes.filter((f) => !f.bloquea);
  const falta = new Set(bloquean.map((f) => f.campo));
  const principal = c.personas.find((p) => p.principal) ?? null;
  const comuna = comunaOficial(c.comuna);
  const region = comuna ? regionDeComuna(comuna) : null;

  return (
    <div className="space-y-5">
      <Link href="/finanzas/contactos" className="inline-flex items-center gap-1 rounded-full text-sm font-semibold text-gris transition hover:text-tinta">
        <IconArrowLeft size={16} /> Volver a contactos
      </Link>

      {/* ── Cabecera ── */}
      <header className={`${HOJA} p-5 sm:p-6`}>
        <div className="flex flex-wrap items-start gap-4 sm:gap-5">
          <Avatar nombre={c.razonSocial} tipo={c.tipoPersona} grande />
          <div className="min-w-0 flex-1">
            <Rut rut={c.rut} />
            <h2 className="mt-0.5 break-words text-2xl font-extrabold leading-tight tracking-tight text-tinta sm:text-[28px]">{c.razonSocial}</h2>
            <p className="mt-1 text-sm text-gris">
              {[c.tipoPersona === "empresa" ? "Empresa" : "Persona", ETIQUETA_TIPO_CONTRIBUYENTE[c.tipoContribuyente], c.activo ? null : "Archivado"].filter(Boolean).join(" · ")}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <ChipsRol cliente={c.esCliente} proveedor={c.esProveedor} />
              {empresa && (
                <Link href={`/finanzas/contactos/${empresa.id}`} className="inline-flex items-center gap-1.5 rounded-full bg-tinta/[0.06] px-2.5 py-0.5 text-[11px] font-semibold text-tinta transition hover:bg-tinta/[0.1]">
                  <IconBuilding size={12} /> Contacto de {empresa.razonSocial}
                </Link>
              )}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {c.activo && <FormularioContacto contacto={c} empresas={empresas} />}
            <ArchivarContacto id={c.id} activo={c.activo} />
          </div>
        </div>
      </header>

      {/* ── ¿Se le puede facturar? ── */}
      {bloquean.length > 0 ? (
        <section className="tono-aviso fondo-tono flex flex-wrap items-center gap-3 rounded-2xl px-4 py-3">
          <IconAlertTriangle size={20} stroke={2} className="shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold">Todavía no se le puede emitir una factura electrónica</p>
            <p className="mt-0.5 text-xs">{bloquean.map((f) => f.texto).join(" · ")}</p>
          </div>
          {c.activo && <FormularioContacto contacto={c} empresas={empresas} completar />}
        </section>
      ) : (
        <section className="tono-ok fondo-tono flex items-center gap-3 rounded-2xl px-4 py-3">
          <IconCircleCheck size={20} stroke={2} className="shrink-0" />
          <p className="text-sm font-bold">
            Listo para facturar
            {avisos.length > 0 && <span className="ml-2 text-xs font-semibold opacity-80">· {avisos.map((a) => a.texto).join(" · ")}</span>}
          </p>
        </section>
      )}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
        <div className="space-y-5">
          {/* ── Datos tributarios ── */}
          <section className={`${HOJA} p-5`}>
            <h3 className="flex items-center gap-2 text-sm font-bold text-tinta">
              <IconReceipt size={18} className="text-naranjo" /> Datos tributarios
              <span className="ml-auto text-[11px] font-normal text-gris-suave">Lo que pide el SII en la factura</span>
            </h3>
            <dl className="mt-4 grid gap-x-6 gap-y-4 sm:grid-cols-2">
              <Dato etiqueta="RUT" falta={falta.has("rut")} valor={c.rut ? formatearRut(c.rut) : null} mono />
              <Dato etiqueta="Razón social" falta={falta.has("razonSocial")} valor={c.razonSocial} />
              <Dato
                etiqueta="Giro"
                falta={falta.has("giro")}
                valor={c.giro}
                nota={c.giro && c.giro.length > LARGO.giro ? `Tiene ${c.giro.length} caracteres: el SII imprime hasta ${LARGO.giro}` : undefined}
              />
              <Dato etiqueta="Dirección" falta={falta.has("direccion")} valor={c.direccion} />
              <Dato etiqueta="Comuna" falta={falta.has("comuna")} valor={c.comuna} nota={region ? `Región de ${region}` : undefined} />
              {c.tipoContribuyente === "extranjero" ? <Dato etiqueta="País" valor={c.pais} /> : <Dato etiqueta="Ciudad" valor={c.ciudad} opcional />}
            </dl>
          </section>

          {/* ── Personas de la libreta que son contacto de esta empresa ── */}
          {vinculados.length > 0 && (
            <section className={`${HOJA} p-5`}>
              <h3 className="flex items-center gap-2 text-sm font-bold text-tinta">
                <IconUsers size={18} className="text-naranjo" /> Contactos vinculados
                <span className="ml-auto text-[11px] font-normal text-gris-suave">{vinculados.length} {vinculados.length === 1 ? "persona" : "personas"}</span>
              </h3>
              <ul className="mt-3 divide-y divide-borde">
                {vinculados.map((p) => (
                  <li key={p.id}>
                    <Link href={`/finanzas/contactos/${p.id}`} className="flex items-center gap-3 py-2 transition hover:text-naranjo">
                      <Avatar nombre={p.nombre} tipo="persona" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-tinta">{p.nombre}</span>
                        <span className="block truncate text-xs text-gris">{[p.correo, p.telefono].filter(Boolean).join(" · ") || "Sin datos de contacto"}</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* ── Envío y cobro ── */}
          <section className={`${HOJA} p-5`}>
            <h3 className="flex items-center gap-2 text-sm font-bold text-tinta">
              <IconMail size={18} className="text-naranjo" /> Envío y cobro
            </h3>
            <dl className="mt-4 grid gap-x-6 gap-y-4 sm:grid-cols-2">
              <Dato etiqueta="Correo de intercambio DTE" valor={c.correoDte} nota={c.correoDte ? undefined : "El que el contacto tiene inscrito en el SII para recibir facturas"} enlace={c.correoDte ? `mailto:${c.correoDte}` : undefined} />
              <Dato etiqueta="Correo de contacto" valor={c.correo} opcional enlace={c.correo ? `mailto:${c.correo}` : undefined} />
              <Dato etiqueta="Teléfono" valor={c.telefono} opcional enlace={c.telefono ? `tel:${c.telefono.replace(/\s/g, "")}` : undefined} />
              <Dato etiqueta="Plazo de pago" valor={textoPlazo(c.plazoPagoDias)} />
            </dl>
          </section>

          {c.notas && (
            <section className={`${HOJA} p-5`}>
              <h3 className="flex items-center gap-2 text-sm font-bold text-tinta">
                <IconNotes size={18} className="text-naranjo" /> Notas
              </h3>
              <p className="mt-3 whitespace-pre-line text-sm text-tinta">{c.notas}</p>
            </section>
          )}
        </div>

        <div className="space-y-5">
          <VistaReceptor contacto={c as DatosContacto} atencion={principal} />

          {/* ── Personas de contacto ── */}
          <section className={`${HOJA} p-5`}>
            <h3 className="flex items-center gap-2 text-sm font-bold text-tinta">
              <IconUsers size={18} className="text-naranjo" /> Personas de contacto
              <span className="rounded-full bg-tinta/[0.06] px-2 py-0.5 text-[10px] font-bold tabular-nums text-gris">{c.personas.length}</span>
            </h3>
            {c.personas.length === 0 ? (
              <p className="mt-3 text-sm text-gris">Nadie todavía. Agrega a quien recibe las facturas.</p>
            ) : (
              <ul className="mt-3 divide-y divide-borde">
                {c.personas.map((p) => (
                  <li key={p.id} className="flex items-start gap-2 py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-tinta">
                        {p.nombre}
                        {p.principal && <span className="ml-1.5 rounded-full bg-amber-500/14 px-1.5 py-0.5 align-middle text-[10px] font-bold text-amber-500">Atención A</span>}
                      </p>
                      {p.cargo && <p className="truncate text-xs text-gris">{p.cargo}</p>}
                      <p className="mt-0.5 flex flex-wrap gap-x-3 text-xs">
                        {p.correo && <a href={`mailto:${p.correo}`} className="inline-flex items-center gap-1 truncate text-azul hover:underline"><IconMail size={12} />{p.correo}</a>}
                        {p.telefono && <a href={`tel:${p.telefono.replace(/\s/g, "")}`} className="inline-flex items-center gap-1 text-azul hover:underline"><IconPhone size={12} />{p.telefono}</a>}
                      </p>
                    </div>
                    {c.activo && <AccionesPersona contactoId={c.id} persona={p} />}
                  </li>
                ))}
              </ul>
            )}
            {c.activo && <div className="mt-3"><FormularioPersona contactoId={c.id} /></div>}
          </section>

          <p className="px-1 text-[11px] leading-relaxed text-gris-suave">
            {c.creadoPor === "Importado desde Odoo"
              ? `Importado desde Odoo el ${fechaCl(c.creadoEn)} (ficha ${c.odooIds.length > 1 ? `${c.odooId}, fusionada con ${c.odooIds.filter((o) => o !== c.odooId).join(", ")}` : c.odooId}).`
              : `Creado ${c.creadoPor ? `por ${c.creadoPor} ` : ""}el ${fechaCl(c.creadoEn)}.`}
            {c.actualizadoEn !== c.creadoEn && ` Última edición el ${fechaCl(c.actualizadoEn)}${c.actualizadoPor ? ` por ${c.actualizadoPor}` : ""}.`}
          </p>
        </div>
      </div>
    </div>
  );
}

function Dato({
  etiqueta,
  valor,
  falta = false,
  opcional = false,
  mono = false,
  nota,
  enlace,
}: {
  etiqueta: string;
  valor: string | null;
  falta?: boolean;
  opcional?: boolean;
  mono?: boolean;
  nota?: string;
  enlace?: string;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-gris">{etiqueta}</dt>
      <dd className={`mt-0.5 break-words text-sm ${mono ? "font-mono" : ""} ${falta ? "tono-aviso font-semibold" : "text-tinta"}`}>
        {valor ? (
          enlace ? <a href={enlace} className="text-azul hover:underline">{valor}</a> : valor
        ) : (
          <span className={falta ? "" : "text-gris-suave"}>{falta ? "Falta" : opcional ? "—" : "Sin definir"}</span>
        )}
        {falta && valor && <span className="ml-1.5 inline-flex align-middle"><IconAlertTriangle size={14} /></span>}
      </dd>
      {nota && <p className={`mt-0.5 text-[11px] ${falta ? "tono-aviso" : "text-gris-suave"}`}>{nota}</p>}
    </div>
  );
}

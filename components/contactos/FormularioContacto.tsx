"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { IconBuilding, IconCircleCheck, IconCircleDashed, IconPencil, IconPlus, IconSearch, IconUser, IconX } from "@tabler/icons-react";
import VentanaModal from "@/components/inventario/VentanaModal";
import BotonGuardar from "@/components/inventario/BotonGuardar";
import { Campo, Seccion } from "@/components/flota/Campos";
import { VistaReceptor } from "@/components/contactos/Visual";
import { CAMPO } from "@/lib/estilos";
import { formatearRut, normalizarRut } from "@/lib/contratos/rut";
import { COMUNAS_POR_REGION, REGIONES } from "@/lib/contratos/chile-comunas";
import {
  AYUDA_TIPO_CONTRIBUYENTE,
  ETIQUETA_TIPO_CONTRIBUYENTE,
  LARGO,
  comunaOficial,
  faltantesParaFacturar,
  regionDeComuna,
  rutDeEmpresa,
  rutUsable,
  type Contacto,
  type DatosContacto,
  type TipoContribuyente,
  type TipoPersona,
} from "@/lib/contactos-modelo";
import { actualizarContactoAction, crearContactoAction } from "@/app/(protegido)/finanzas/contactos/acciones";

const PLAZOS = [0, 7, 15, 30, 45, 60, 90];

/** El largo usado y el máximo del SII; se pone en rojo al pasarse. */
function Contador({ valor, max }: { valor: string; max: number }) {
  const pasado = valor.length > max;
  return <span className={`tabular-nums ${pasado ? "tono-alerta font-bold" : ""}`}>{valor.length}/{max}</span>;
}

export type EmpresaMin = { id: string; razonSocial: string; rut: string | null };

export default function FormularioContacto({
  contacto,
  completar = false,
  empresas = [],
}: {
  contacto?: Contacto;
  /** Botón «Completar datos» en vez de «Editar», para la franja de lo que falta. */
  completar?: boolean;
  /** Las empresas de la libreta, para marcar a una persona como contacto de una de ellas. */
  empresas?: EmpresaMin[];
}) {
  const editar = Boolean(contacto);
  const [abierta, setAbierta] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();
  const router = useRouter();

  const inicial = () => ({
    tipoPersona: (contacto?.tipoPersona ?? "empresa") as TipoPersona,
    tipoContribuyente: (contacto?.tipoContribuyente ?? "primera_categoria") as TipoContribuyente,
    rut: contacto?.rut ? formatearRut(contacto.rut) : "",
    razonSocial: contacto?.razonSocial ?? "",
    giro: contacto?.giro ?? "",
    direccion: contacto?.direccion ?? "",
    comuna: contacto?.comuna ?? "",
    ciudad: contacto?.ciudad ?? "",
    pais: contacto?.pais && contacto.pais !== "Chile" ? contacto.pais : "",
    region: (contacto?.comuna && regionDeComuna(contacto.comuna)) || "",
    empresaId: contacto?.empresaId ?? "",
    esDeEmpresa: Boolean(contacto?.empresaId),
  });
  const [v, setV] = useState(inicial);
  const poner = <K extends keyof ReturnType<typeof inicial>>(k: K, valor: ReturnType<typeof inicial>[K]) => setV((x) => ({ ...x, [k]: valor }));

  const extranjero = v.tipoContribuyente === "extranjero";
  const rutNormal = v.rut ? normalizarRut(v.rut) : "";
  const rutOk = rutNormal ? rutUsable(rutNormal) : null;
  const comuna = comunaOficial(v.comuna);
  const comunasDeRegion = v.region ? COMUNAS_POR_REGION[v.region] ?? [] : [];
  const [buscarEmpresa, setBuscarEmpresa] = useState("");
  const empresaElegida = empresas.find((e) => e.id === v.empresaId);
  const qEmp = buscarEmpresa.trim().toLowerCase();
  const empresasVisibles = empresas
    .filter((e) => e.id !== contacto?.id && (!qEmp || `${e.razonSocial} ${e.rut ?? ""}`.toLowerCase().includes(qEmp)))
    .slice(0, 8);

  // Lo mismo que verá la ficha: qué falta para facturar, en vivo.
  const borrador: DatosContacto = {
    rut: extranjero ? null : rutOk ? rutNormal : v.rut ? v.rut : null,
    tipoPersona: v.tipoPersona,
    razonSocial: v.razonSocial,
    giro: v.giro || null,
    direccion: v.direccion || null,
    comuna: comuna ?? (v.comuna || null),
    ciudad: v.ciudad || null,
    pais: extranjero ? v.pais || "Extranjero" : "Chile",
    tipoContribuyente: v.tipoContribuyente,
    correoDte: "x", // el correo DTE se revisa aparte: en la lista solo van los obligatorios del SII
    correo: null,
    telefono: null,
    esCliente: false,
    esProveedor: false,
    plazoPagoDias: null,
    notas: null,
  };
  const faltantes = faltantesParaFacturar(borrador).filter((f) => f.bloquea);
  const requisitos: { texto: string; ok: boolean }[] = [
    ...(extranjero ? [] : [{ texto: "RUT válido", ok: !faltantes.some((f) => f.campo === "rut") }]),
    { texto: "Razón social", ok: !faltantes.some((f) => f.campo === "razonSocial") },
    { texto: `Giro (hasta ${LARGO.giro})`, ok: !faltantes.some((f) => f.campo === "giro") },
    { texto: "Dirección", ok: !faltantes.some((f) => f.campo === "direccion") },
    { texto: "Comuna", ok: !faltantes.some((f) => f.campo === "comuna") },
  ];

  function abrir() {
    setV(inicial());
    setBuscarEmpresa("");
    setError(null);
    setAbierta(true);
  }

  function enviar(fd: FormData) {
    setError(null);
    iniciar(async () => {
      const r = editar ? await actualizarContactoAction(contacto!.id, fd) : await crearContactoAction(fd);
      if (!r.ok) return setError(r.error);
      setAbierta(false);
      if (!editar && r.id) router.push(`/finanzas/contactos/${r.id}`);
      else router.refresh();
    });
  }

  return (
    <>
      {completar ? (
        <button onClick={abrir} className="inline-flex items-center gap-1.5 rounded-lg border border-borde px-3 py-2 text-sm font-semibold text-azul transition hover:border-cian">
          <IconPencil size={16} /> Completar datos
        </button>
      ) : (
        <button
          onClick={abrir}
          className={
            editar
              ? "inline-flex items-center gap-1.5 rounded-lg border border-borde px-3 py-2 text-sm font-semibold text-azul transition hover:border-cian"
              : "inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-naranjo px-4 text-xs font-bold uppercase tracking-wide text-white shadow-sm transition hover:bg-naranjo-suave"
          }
        >
          {editar ? <IconPencil size={16} /> : <IconPlus size={16} />}
          {editar ? "Editar" : "Nuevo contacto"}
        </button>
      )}

      <VentanaModal
        abierta={abierta}
        alCerrar={() => setAbierta(false)}
        titulo={editar ? "Editar contacto" : "Nuevo contacto"}
        descripcion="Para guardar basta la razón social. Para facturar, el SII pide además RUT, giro, dirección y comuna."
        ancho="max-w-5xl"
      >
        <form action={enviar} className="grid gap-6 lg:grid-cols-[minmax(0,18rem)_minmax(0,1fr)]">
          <aside className="space-y-4 lg:sticky lg:top-0 lg:self-start">
            <VistaReceptor contacto={borrador} />
            <div className="rounded-xl border border-borde p-3">
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-gris">Para facturar (SII)</p>
              <ul className="mt-2 space-y-1.5 text-xs">
                {requisitos.map((r) => (
                  <li key={r.texto} className={`flex items-center gap-2 ${r.ok ? "text-tinta" : "text-gris"}`}>
                    {r.ok ? <IconCircleCheck size={16} className="tono-ok" /> : <IconCircleDashed size={16} className="text-gris-suave" />}
                    {r.texto}
                  </li>
                ))}
              </ul>
              <p className={`mt-3 rounded-lg px-2.5 py-1.5 text-xs font-semibold ${faltantes.length ? "tono-aviso fondo-tono" : "tono-ok fondo-tono"}`}>
                {faltantes.length ? `Faltan ${faltantes.length} para poder facturarle` : "Listo para facturar"}
              </p>
            </div>
          </aside>

          <div className="space-y-6">
            <Seccion n={1} titulo="Identificación">
              <div className="grid gap-2 sm:grid-cols-2">
                {(["empresa", "persona"] as const).map((t) => (
                  <label
                    key={t}
                    className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 transition has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-cian/40 ${
                      v.tipoPersona === t ? "border-naranjo bg-naranjo/[0.06]" : "border-borde hover:border-naranjo/40"
                    }`}
                  >
                    <input type="radio" name="tipoPersona" value={t} checked={v.tipoPersona === t} onChange={() => poner("tipoPersona", t)} className="sr-only" />
                    <span className={`grid h-9 w-9 place-items-center rounded-lg ${v.tipoPersona === t ? "bg-naranjo text-white" : "bg-tinta/[0.05] text-gris"}`}>
                      {t === "empresa" ? <IconBuilding size={18} /> : <IconUser size={18} />}
                    </span>
                    <span>
                      <span className="block text-sm font-bold text-tinta">{t === "empresa" ? "Empresa" : "Persona"}</span>
                      <span className="block text-[11px] text-gris">{t === "empresa" ? "SpA, Ltda., S.A., EIRL…" : "Persona natural"}</span>
                    </span>
                  </label>
                ))}
              </div>

              {/* Una persona puede ser contacto de una empresa de la libreta. */}
              {v.tipoPersona === "persona" && (
                <div className="rounded-xl border border-borde bg-tinta/[0.015] p-3">
                  <input type="hidden" name="esDeEmpresa" value={v.esDeEmpresa ? "si" : "no"} />
                  <input type="hidden" name="empresaId" value={v.esDeEmpresa ? v.empresaId : ""} />
                  <p className="text-xs font-semibold text-gris">¿Es contacto de alguna empresa?</p>
                  <div className="mt-2 inline-flex rounded-lg border border-borde bg-superficie p-0.5 text-xs font-semibold">
                    {[
                      { on: false, t: "No, es independiente" },
                      { on: true, t: "Sí, de una empresa" },
                    ].map((o) => (
                      <button
                        key={o.t}
                        type="button"
                        onClick={() => poner("esDeEmpresa", o.on)}
                        className={`rounded-md px-3 py-1.5 transition ${v.esDeEmpresa === o.on ? "bg-tinta text-superficie" : "text-gris hover:text-tinta"}`}
                      >
                        {o.t}
                      </button>
                    ))}
                  </div>
                  {v.esDeEmpresa &&
                    (empresaElegida ? (
                      <div className="mt-3 flex items-center gap-3 rounded-lg border border-naranjo/40 bg-naranjo/[0.04] px-3 py-2">
                        <span className="grid h-8 w-8 place-items-center rounded-lg bg-naranjo/10 text-naranjo"><IconBuilding size={16} /></span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold text-tinta">{empresaElegida.razonSocial}</span>
                          {empresaElegida.rut && <span className="block font-mono text-[11px] text-gris">{formatearRut(empresaElegida.rut)}</span>}
                        </span>
                        <button type="button" onClick={() => poner("empresaId", "")} className="inline-flex items-center gap-1 text-xs font-semibold text-gris hover:text-tinta">
                          <IconX size={14} /> Cambiar
                        </button>
                      </div>
                    ) : (
                      <div className="mt-3">
                        <div className="relative">
                          <IconSearch size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gris" />
                          <input value={buscarEmpresa} onChange={(e) => setBuscarEmpresa(e.target.value)} placeholder="Busca la empresa por nombre o RUT" className={`${CAMPO} pl-9`} />
                        </div>
                        <ul className="mt-1.5 max-h-48 divide-y divide-borde overflow-y-auto rounded-lg border border-borde bg-superficie">
                          {empresasVisibles.map((e) => (
                            <li key={e.id}>
                              <button type="button" onClick={() => poner("empresaId", e.id)} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-naranjo/[0.05]">
                                <IconBuilding size={14} className="shrink-0 text-gris" />
                                <span className="min-w-0 flex-1 truncate text-tinta">{e.razonSocial}</span>
                                {e.rut && <span className="font-mono text-[11px] text-gris">{formatearRut(e.rut)}</span>}
                              </button>
                            </li>
                          ))}
                          {empresasVisibles.length === 0 && <li className="px-3 py-2.5 text-xs text-gris">Ninguna empresa coincide. Créala primero como «Empresa».</li>}
                        </ul>
                      </div>
                    ))}
                </div>
              )}

              <div className="grid gap-4 sm:grid-cols-2">
                {!extranjero && (
                  <Campo etiqueta="RUT" ayuda={rutOk === false ? undefined : "Con dígito verificador"}>
                    <input
                      name="rut"
                      value={v.rut}
                      onChange={(e) => {
                        const crudo = e.target.value.replace(/[^0-9kK.\-\s]/g, "");
                        poner("rut", crudo);
                        const n = normalizarRut(crudo);
                        // Con un RUT válido se sugiere el tipo: de 50 millones para arriba es empresa.
                        if (!editar && rutUsable(n)) poner("tipoPersona", rutDeEmpresa(n) ? "empresa" : "persona");
                      }}
                      onBlur={() => rutOk && poner("rut", formatearRut(rutNormal))}
                      maxLength={12}
                      inputMode="text"
                      autoFocus={!editar}
                      className={`${CAMPO} font-mono ${rutOk === false ? "border-rose-500/60" : ""}`}
                      placeholder="76.123.456-7"
                      aria-invalid={rutOk === false}
                    />
                    {rutOk === false && v.rut.length >= 8 && <span className="tono-alerta mt-1 block text-[11px] font-semibold">El dígito verificador no cuadra</span>}
                    {rutOk && <span className="tono-ok mt-1 block text-[11px] font-semibold">RUT válido</span>}
                  </Campo>
                )}
                <Campo etiqueta="Tipo de contribuyente">
                  <select name="tipoContribuyente" value={v.tipoContribuyente} onChange={(e) => poner("tipoContribuyente", e.target.value as TipoContribuyente)} className={CAMPO}>
                    {(Object.keys(ETIQUETA_TIPO_CONTRIBUYENTE) as TipoContribuyente[]).map((t) => (
                      <option key={t} value={t}>{ETIQUETA_TIPO_CONTRIBUYENTE[t]}</option>
                    ))}
                  </select>
                  <span className="mt-1 block text-[11px] text-gris-suave">{AYUDA_TIPO_CONTRIBUYENTE[v.tipoContribuyente]}</span>
                </Campo>
              </div>
              <Campo etiqueta={v.tipoPersona === "empresa" ? "Razón social" : "Nombre completo"} obligatorio>
                <input
                  name="razonSocial"
                  required
                  value={v.razonSocial}
                  onChange={(e) => poner("razonSocial", e.target.value)}
                  maxLength={LARGO.razonSocial + 20}
                  className={CAMPO}
                  placeholder={v.tipoPersona === "empresa" ? "Ej: Minera Los Andes SpA" : "Ej: Juan Pérez Soto"}
                  autoFocus={editar || extranjero}
                />
                <span className="mt-1 flex justify-between text-[11px] text-gris-suave">
                  <span>Tal como está inscrita en el SII</span>
                  <Contador valor={v.razonSocial} max={LARGO.razonSocial} />
                </span>
              </Campo>
            </Seccion>

            <Seccion n={2} titulo="Datos tributarios">
              <Campo etiqueta="Giro">
                <input name="giro" value={v.giro} onChange={(e) => poner("giro", e.target.value)} maxLength={200} className={CAMPO} placeholder="Ej: Servicios de ingeniería" />
                <span className="mt-1 flex justify-between gap-3 text-[11px] text-gris-suave">
                  <span>La actividad que sale en la factura. El SII imprime hasta {LARGO.giro} caracteres.</span>
                  <Contador valor={v.giro} max={LARGO.giro} />
                </span>
              </Campo>
              <Campo etiqueta="Dirección">
                <input name="direccion" value={v.direccion} onChange={(e) => poner("direccion", e.target.value)} maxLength={200} className={CAMPO} placeholder="Calle, número, oficina" />
                <span className="mt-1 flex justify-between gap-3 text-[11px] text-gris-suave">
                  <span>La dirección legal registrada en el SII</span>
                  <Contador valor={v.direccion} max={LARGO.direccion} />
                </span>
              </Campo>
              {extranjero ? (
                <div className="grid gap-4 sm:grid-cols-2">
                  <Campo etiqueta="País">
                    <input name="pais" value={v.pais} onChange={(e) => poner("pais", e.target.value)} className={CAMPO} placeholder="Ej: Perú" />
                  </Campo>
                  <Campo etiqueta="Ciudad">
                    <input name="ciudad" value={v.ciudad} onChange={(e) => poner("ciudad", e.target.value)} maxLength={LARGO.ciudad} className={CAMPO} />
                  </Campo>
                </div>
              ) : (
                <div className="grid gap-4 sm:grid-cols-3">
                  <Campo etiqueta="Región">
                    <select
                      value={v.region}
                      onChange={(e) => setV((x) => ({ ...x, region: e.target.value, comuna: "", ciudad: "" }))}
                      className={CAMPO}
                    >
                      <option value="">Elige la región</option>
                      {REGIONES.map((r) => <option key={r} value={r}>{r}</option>)}
                    </select>
                  </Campo>
                  <Campo etiqueta="Comuna">
                    <select
                      name="comuna"
                      value={comuna ?? v.comuna}
                      disabled={!v.region && !v.comuna}
                      // La ciudad parte igual a la comuna (es lo habitual en la factura) y se puede cambiar.
                      onChange={(e) => setV((x) => ({ ...x, comuna: e.target.value, ciudad: !x.ciudad || x.ciudad === x.comuna ? e.target.value : x.ciudad }))}
                      className={`${CAMPO} disabled:opacity-50`}
                    >
                      <option value="">{v.region ? "Elige la comuna" : "Primero la región"}</option>
                      {v.comuna && !comuna && <option value={v.comuna}>{v.comuna} (no oficial)</option>}
                      {[...comunasDeRegion].sort((a, b) => a.localeCompare(b, "es")).map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                    {v.comuna && !comuna && <span className="tono-aviso mt-1 block text-[11px] font-semibold">«{v.comuna}» no es una comuna oficial: elígela de nuevo</span>}
                  </Campo>
                  <Campo etiqueta="Ciudad">
                    <select name="ciudad" value={v.ciudad} disabled={!v.region} onChange={(e) => poner("ciudad", e.target.value)} className={`${CAMPO} disabled:opacity-50`}>
                      <option value="">{v.region ? "Elige la ciudad" : "Primero la región"}</option>
                      {v.ciudad && !comunasDeRegion.includes(v.ciudad) && <option value={v.ciudad}>{v.ciudad}</option>}
                      {[...comunasDeRegion].sort((a, b) => a.localeCompare(b, "es")).map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </Campo>
                </div>
              )}
            </Seccion>

            <Seccion n={3} titulo="Envío y cobro">
              <div className="grid gap-4 sm:grid-cols-2">
                <Campo etiqueta="Correo de intercambio DTE">
                  <input name="correoDte" type="email" defaultValue={contacto?.correoDte ?? ""} maxLength={LARGO.correo} className={CAMPO} placeholder="dte@empresa.cl" />
                  <span className="mt-1 block text-[11px] text-gris-suave">Adonde llega el XML de la factura (el registrado en el SII)</span>
                </Campo>
                <Campo etiqueta="Correo de contacto" ayuda="Opcional">
                  <input name="correo" type="email" defaultValue={contacto?.correo ?? ""} maxLength={LARGO.correo} className={CAMPO} placeholder="contacto@empresa.cl" />
                </Campo>
                <Campo etiqueta="Teléfono" ayuda="Opcional">
                  <input name="telefono" type="tel" defaultValue={contacto?.telefono ?? ""} maxLength={LARGO.telefono} className={CAMPO} placeholder="+56 9 1234 5678" />
                </Campo>
                <Campo etiqueta="Plazo de pago" ayuda="Para el vencimiento de la factura">
                  <select name="plazoPagoDias" defaultValue={contacto?.plazoPagoDias ?? ""} className={CAMPO}>
                    <option value="">Sin definir</option>
                    {[...new Set([...PLAZOS, ...(contacto?.plazoPagoDias != null ? [contacto.plazoPagoDias] : [])])]
                      .sort((a, b) => a - b)
                      .map((d) => <option key={d} value={d}>{d === 0 ? "Contado" : `${d} días`}</option>)}
                  </select>
                </Campo>
              </div>
            </Seccion>

            <Seccion n={4} titulo="Relación y notas">
              <div className="flex flex-wrap gap-2">
                {[
                  { name: "esCliente", texto: "Es cliente", detalle: "Le emitimos facturas", on: contacto?.esCliente ?? true },
                  { name: "esProveedor", texto: "Es proveedor", detalle: "Nos emite facturas", on: contacto?.esProveedor ?? false },
                ].map((r) => (
                  <label key={r.name} className="flex cursor-pointer items-center gap-3 rounded-xl border border-borde px-3 py-2.5 transition hover:border-naranjo/40 has-[:checked]:border-cian has-[:checked]:bg-cian/[0.06]">
                    <input type="checkbox" name={r.name} defaultChecked={r.on} className="h-4 w-4 accent-[var(--color-cian)]" />
                    <span>
                      <span className="block text-sm font-bold text-tinta">{r.texto}</span>
                      <span className="block text-[11px] text-gris">{r.detalle}</span>
                    </span>
                  </label>
                ))}
              </div>
              <Campo etiqueta="Notas" ayuda="Opcional">
                <textarea name="notas" rows={2} defaultValue={contacto?.notas ?? ""} className={CAMPO} placeholder="Condiciones especiales, orden de compra obligatoria…" />
              </Campo>
            </Seccion>

            {error && <p className="tono-alerta fondo-tono rounded-lg px-3 py-2 text-sm font-semibold">{error}</p>}

            <div className="flex items-center justify-end gap-2 border-t border-borde pt-4">
              <button type="button" onClick={() => setAbierta(false)} className="rounded-lg border border-borde px-4 py-2.5 text-xs font-bold uppercase tracking-wide text-gris transition hover:text-tinta">
                Cancelar
              </button>
              <BotonGuardar pendiente={pendiente}>{editar ? "Guardar cambios" : "Crear contacto"}</BotonGuardar>
            </div>
          </div>
        </form>
      </VentanaModal>
    </>
  );
}

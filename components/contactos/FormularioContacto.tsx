"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { IconArrowLeft, IconArrowRight, IconBuilding, IconCheck, IconCircleCheck, IconCircleDashed, IconPencil, IconPlus, IconSearch, IconUser, IconX } from "@tabler/icons-react";
import VentanaModal from "@/components/inventario/VentanaModal";
import BotonGuardar from "@/components/inventario/BotonGuardar";
import { Campo } from "@/components/flota/Campos";
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
const PASOS = ["Qué es", "Quién es", "Dónde está", "Relación"];

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
  const [paso, setPaso] = useState(0);
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
    setPaso(0);
    setError(null);
    setAbierta(true);
  }

  function enviar(fd: FormData) {
    setError(null);
    // El nombre está en el paso 2, que puede estar oculto: se avisa y se lleva allá, en vez de
    // dejar que el navegador bloquee el envío sin mostrar nada.
    if (!v.razonSocial.trim()) {
      setPaso(1);
      return setError(v.tipoPersona === "empresa" ? "Escribe la razón social." : "Escribe el nombre.");
    }
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
        descripcion="Cuatro pasos cortos. Solo el nombre es obligatorio: lo demás se puede completar después."
        ancho="max-w-2xl"
      >
        <form
          action={enviar}
          // Enter en un campo avanza de paso en vez de guardar a medias.
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.target as HTMLElement).tagName === "INPUT" && paso < PASOS.length - 1) {
              e.preventDefault();
              setPaso((p) => p + 1);
            }
          }}
          className="space-y-5"
        >
          {/* ── Los pasos: se puede saltar a cualquiera ── */}
          <ol className="grid grid-cols-4 gap-1.5">
            {PASOS.map((t, i) => (
              <li key={t}>
                <button
                  type="button"
                  onClick={() => setPaso(i)}
                  className={`flex w-full flex-col items-center gap-1 rounded-xl px-1 py-2 text-center transition ${i === paso ? "bg-naranjo/[0.08]" : "hover:bg-tinta/[0.03]"}`}
                >
                  <span
                    className={`grid h-7 w-7 place-items-center rounded-full text-xs font-bold transition ${
                      i === paso ? "bg-naranjo text-white" : i < paso ? "bg-emerald-500 text-white" : "bg-tinta/[0.06] text-gris"
                    }`}
                  >
                    {i < paso ? <IconCheck size={14} /> : i + 1}
                  </span>
                  <span className={`text-[11px] font-semibold leading-tight ${i === paso ? "text-tinta" : "text-gris"}`}>{t}</span>
                </button>
              </li>
            ))}
          </ol>

          {/* Todos los pasos quedan montados (ocultos) para que el formulario mande todo junto. */}

          {/* ── 1. Qué es ── */}
          <div className={paso === 0 ? "space-y-4" : "hidden"}>
            <p className="text-base font-bold text-tinta">¿Qué vas a agregar?</p>
            <div className="grid gap-3 sm:grid-cols-2">
              {(["empresa", "persona"] as const).map((t) => (
                <label
                  key={t}
                  className={`flex cursor-pointer flex-col items-center gap-2 rounded-2xl border-2 p-5 text-center transition has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-cian/40 ${
                    v.tipoPersona === t ? "border-naranjo bg-naranjo/[0.05]" : "border-borde hover:border-naranjo/40"
                  }`}
                >
                  <input type="radio" name="tipoPersona" value={t} checked={v.tipoPersona === t} onChange={() => poner("tipoPersona", t)} className="sr-only" />
                  <span className={`grid h-12 w-12 place-items-center rounded-2xl ${v.tipoPersona === t ? "bg-naranjo text-white" : "bg-tinta/[0.05] text-gris"}`}>
                    {t === "empresa" ? <IconBuilding size={24} /> : <IconUser size={24} />}
                  </span>
                  <span className="text-base font-bold text-tinta">{t === "empresa" ? "Una empresa" : "Una persona"}</span>
                  <span className="text-xs text-gris">{t === "empresa" ? "SpA, Ltda., S.A., EIRL…" : "Persona natural"}</span>
                </label>
              ))}
            </div>

            {/* Una persona puede ser contacto de una empresa de la libreta. */}
            {v.tipoPersona === "persona" && (
              <div className="rounded-2xl border border-borde bg-tinta/[0.015] p-4">
                <input type="hidden" name="esDeEmpresa" value={v.esDeEmpresa ? "si" : "no"} />
                <input type="hidden" name="empresaId" value={v.esDeEmpresa ? v.empresaId : ""} />
                <p className="text-sm font-semibold text-tinta">¿Trabaja en alguna empresa de la libreta?</p>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  {[
                    { on: false, t: "No" },
                    { on: true, t: "Sí" },
                  ].map((o) => (
                    <button
                      key={o.t}
                      type="button"
                      onClick={() => poner("esDeEmpresa", o.on)}
                      className={`rounded-xl border py-2 text-sm font-semibold transition ${v.esDeEmpresa === o.on ? "border-naranjo bg-naranjo/[0.06] text-tinta" : "border-borde text-gris hover:border-naranjo/40"}`}
                    >
                      {o.t}
                    </button>
                  ))}
                </div>
                {v.esDeEmpresa &&
                  (empresaElegida ? (
                    <div className="mt-3 flex items-center gap-3 rounded-xl border border-naranjo/40 bg-naranjo/[0.04] px-3 py-2">
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
                        <input value={buscarEmpresa} onChange={(e) => setBuscarEmpresa(e.target.value)} placeholder="Escribe el nombre o RUT de la empresa" className={`${CAMPO} pl-9`} />
                      </div>
                      <ul className="mt-1.5 max-h-44 divide-y divide-borde overflow-y-auto rounded-xl border border-borde bg-superficie">
                        {empresasVisibles.map((e) => (
                          <li key={e.id}>
                            <button type="button" onClick={() => poner("empresaId", e.id)} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-naranjo/[0.05]">
                              <IconBuilding size={14} className="shrink-0 text-gris" />
                              <span className="min-w-0 flex-1 truncate text-tinta">{e.razonSocial}</span>
                              {e.rut && <span className="font-mono text-[11px] text-gris">{formatearRut(e.rut)}</span>}
                            </button>
                          </li>
                        ))}
                        {empresasVisibles.length === 0 && <li className="px-3 py-2.5 text-xs text-gris">Ninguna empresa coincide. Créala primero como «Una empresa».</li>}
                      </ul>
                    </div>
                  ))}
              </div>
            )}
          </div>

          {/* ── 2. Quién es ── */}
          <div className={paso === 1 ? "space-y-4" : "hidden"}>
            <p className="text-base font-bold text-tinta">{v.tipoPersona === "empresa" ? "¿Cómo se llama la empresa?" : "¿Cómo se llama la persona?"}</p>
            <Campo etiqueta={v.tipoPersona === "empresa" ? "Razón social" : "Nombre completo"} obligatorio>
              <input
                name="razonSocial"
                value={v.razonSocial}
                onChange={(e) => poner("razonSocial", e.target.value)}
                maxLength={LARGO.razonSocial + 20}
                className={CAMPO}
                placeholder={v.tipoPersona === "empresa" ? "Ej: Minera Los Andes SpA" : "Ej: Juan Pérez Soto"}
              />
              <span className="mt-1 flex justify-between text-[11px] text-gris-suave">
                <span>{v.tipoPersona === "empresa" ? "Tal como está inscrita en el SII" : "Nombre y apellidos"}</span>
                <Contador valor={v.razonSocial} max={LARGO.razonSocial} />
              </span>
            </Campo>
            <div className="grid gap-4 sm:grid-cols-2">
              {!extranjero && (
                <Campo etiqueta="RUT" ayuda="Opcional">
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
                    className={`${CAMPO} font-mono ${rutOk === false ? "border-rose-500/60" : ""}`}
                    placeholder="76.123.456-7"
                    aria-invalid={rutOk === false}
                  />
                  {rutOk === false && v.rut.length >= 8 && <span className="tono-alerta mt-1 block text-[11px] font-semibold">El dígito verificador no cuadra</span>}
                  {rutOk && <span className="tono-ok mt-1 block text-[11px] font-semibold">RUT válido ✓</span>}
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
            <Campo etiqueta="Giro" ayuda="A qué se dedica">
              <input name="giro" value={v.giro} onChange={(e) => poner("giro", e.target.value)} maxLength={200} className={CAMPO} placeholder="Ej: Servicios de ingeniería" />
              <span className="mt-1 flex justify-between gap-3 text-[11px] text-gris-suave">
                <span>Sale en la factura (hasta {LARGO.giro} caracteres)</span>
                <Contador valor={v.giro} max={LARGO.giro} />
              </span>
            </Campo>
          </div>

          {/* ── 3. Dónde está ── */}
          <div className={paso === 2 ? "space-y-4" : "hidden"}>
            <p className="text-base font-bold text-tinta">¿Dónde está?</p>
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
                  <select value={v.region} onChange={(e) => setV((x) => ({ ...x, region: e.target.value, comuna: "", ciudad: "" }))} className={CAMPO}>
                    <option value="">Elige</option>
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
                    <option value="">{v.region ? "Elige" : "Primero la región"}</option>
                    {v.comuna && !comuna && <option value={v.comuna}>{v.comuna} (no oficial)</option>}
                    {[...comunasDeRegion].sort((a, b) => a.localeCompare(b, "es")).map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                  {v.comuna && !comuna && <span className="tono-aviso mt-1 block text-[11px] font-semibold">No es oficial: elígela de nuevo</span>}
                </Campo>
                <Campo etiqueta="Ciudad">
                  <select name="ciudad" value={v.ciudad} disabled={!v.region} onChange={(e) => poner("ciudad", e.target.value)} className={`${CAMPO} disabled:opacity-50`}>
                    <option value="">{v.region ? "Elige" : "Primero la región"}</option>
                    {v.ciudad && !comunasDeRegion.includes(v.ciudad) && <option value={v.ciudad}>{v.ciudad}</option>}
                    {[...comunasDeRegion].sort((a, b) => a.localeCompare(b, "es")).map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </Campo>
              </div>
            )}
            <Campo etiqueta="Dirección">
              <input name="direccion" value={v.direccion} onChange={(e) => poner("direccion", e.target.value)} maxLength={200} className={CAMPO} placeholder="Calle, número, oficina" />
              <span className="mt-1 flex justify-between gap-3 text-[11px] text-gris-suave">
                <span>La registrada en el SII</span>
                <Contador valor={v.direccion} max={LARGO.direccion} />
              </span>
            </Campo>
          </div>

          {/* ── 4. Contacto y relación ── */}
          <div className={paso === 3 ? "space-y-4" : "hidden"}>
            <p className="text-base font-bold text-tinta">¿Qué relación tenemos?</p>
            <div className="grid grid-cols-2 gap-2">
              {[
                { name: "esCliente", texto: "Es cliente", detalle: "Le facturamos", on: contacto?.esCliente ?? true },
                { name: "esProveedor", texto: "Es proveedor", detalle: "Nos factura", on: contacto?.esProveedor ?? false },
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
            <div className="grid gap-4 sm:grid-cols-2">
              <Campo etiqueta="Correo para facturas (DTE)" ayuda="Opcional">
                <input name="correoDte" type="email" defaultValue={contacto?.correoDte ?? ""} maxLength={LARGO.correo} className={CAMPO} placeholder="dte@empresa.cl" />
              </Campo>
              <Campo etiqueta="Correo de contacto" ayuda="Opcional">
                <input name="correo" type="email" defaultValue={contacto?.correo ?? ""} maxLength={LARGO.correo} className={CAMPO} placeholder="contacto@empresa.cl" />
              </Campo>
              <Campo etiqueta="Teléfono" ayuda="Opcional">
                <input name="telefono" type="tel" defaultValue={contacto?.telefono ?? ""} maxLength={LARGO.telefono} className={CAMPO} placeholder="+56 9 1234 5678" />
              </Campo>
              <Campo etiqueta="Plazo de pago" ayuda="Opcional">
                <select name="plazoPagoDias" defaultValue={contacto?.plazoPagoDias ?? ""} className={CAMPO}>
                  <option value="">Sin definir</option>
                  {[...new Set([...PLAZOS, ...(contacto?.plazoPagoDias != null ? [contacto.plazoPagoDias] : [])])]
                    .sort((a, b) => a - b)
                    .map((d) => <option key={d} value={d}>{d === 0 ? "Contado" : `${d} días`}</option>)}
                </select>
              </Campo>
            </div>
            <Campo etiqueta="Notas" ayuda="Opcional">
              <textarea name="notas" rows={2} defaultValue={contacto?.notas ?? ""} className={CAMPO} placeholder="Condiciones especiales, orden de compra obligatoria…" />
            </Campo>
          </div>

          {error && <p className="tono-alerta fondo-tono rounded-lg px-3 py-2 text-sm font-semibold">{error}</p>}

          {/* ── Pie: qué falta para facturar y los botones ── */}
          <div className="flex flex-wrap items-center gap-3 border-t border-borde pt-4">
            <span
              title={requisitos.filter((r) => !r.ok).map((r) => r.texto).join(", ") || undefined}
              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${faltantes.length ? "tono-aviso fondo-tono" : "tono-ok fondo-tono"}`}
            >
              {faltantes.length ? <IconCircleDashed size={14} /> : <IconCircleCheck size={14} />}
              {faltantes.length ? `Para facturar: ${requisitos.filter((r) => r.ok).length} de ${requisitos.length}` : "Listo para facturar"}
            </span>
            <div className="ml-auto flex gap-2">
              {paso > 0 ? (
                <button type="button" onClick={() => setPaso((p) => p - 1)} className="inline-flex items-center gap-1 rounded-lg border border-borde px-4 py-2.5 text-xs font-bold uppercase tracking-wide text-gris transition hover:text-tinta">
                  <IconArrowLeft size={14} /> Atrás
                </button>
              ) : (
                <button type="button" onClick={() => setAbierta(false)} className="rounded-lg border border-borde px-4 py-2.5 text-xs font-bold uppercase tracking-wide text-gris transition hover:text-tinta">
                  Cancelar
                </button>
              )}
              {paso < PASOS.length - 1 && (
                <button type="button" onClick={() => setPaso((p) => p + 1)} className="inline-flex items-center gap-1 rounded-lg bg-naranjo px-4 py-2.5 text-xs font-bold uppercase tracking-wide text-white transition hover:bg-naranjo-suave">
                  Siguiente <IconArrowRight size={14} />
                </button>
              )}
              {/* Al editar se puede guardar desde cualquier paso; al crear, en el último. */}
              {(editar || paso === PASOS.length - 1) && (
                <BotonGuardar pendiente={pendiente} secundario={paso < PASOS.length - 1}>{editar ? "Guardar" : "Crear contacto"}</BotonGuardar>
              )}
            </div>
          </div>
        </form>
      </VentanaModal>
    </>
  );
}

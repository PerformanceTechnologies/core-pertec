"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  IconAt,
  IconBriefcase,
  IconBuildingCommunity,
  IconBuildingPlus,
  IconBuildingSkyscraper,
  IconCalendarDue,
  IconCircleCheck,
  IconCircleDashed,
  IconHome2,
  IconId,
  IconLocation,
  IconMail,
  IconMap2,
  IconNotes,
  IconPencil,
  IconPhone,
  IconPlus,
  IconReceiptTax,
  IconSearch,
  IconUser,
  IconUserEdit,
  IconUserPlus,
  IconWorld,
  IconX,
} from "@tabler/icons-react";
import VentanaModal from "@/components/inventario/VentanaModal";
import RuedaCarga from "@/components/RuedaCarga";
import { BOTON_C, BOTON_SUAVE_C, CAMPO_I, ConIcono, ICONO, IconoTile } from "@/components/contactos/Visual";
import { formatearRut, normalizarRut } from "@/lib/contratos/rut";
import { COMUNAS_POR_REGION, REGIONES } from "@/lib/contratos/chile-comunas";
import {
  AYUDA_TIPO_CONTRIBUYENTE,
  ETIQUETA_TIPO_CONTRIBUYENTE,
  LARGO,
  comunaOficial,
  faltantesParaFacturar,
  nombrePropio,
  regionDeComuna,
  rutDeEmpresa,
  rutUsable,
  type Contacto,
  type DatosContacto,
  type TipoContribuyente,
  type TipoPersona,
} from "@/lib/contactos-modelo";
import { actualizarContactoAction, crearContactoAction, crearEmpresaRapidaAction } from "@/app/(protegido)/finanzas/contactos/acciones";

const PLAZOS = [0, 7, 15, 30, 45, 60, 90];

export type EmpresaMin = { id: string; razonSocial: string; rut: string | null };

/** Un campo del formulario: etiqueta chica arriba y, a la derecha, lo que haga falta (contador, aviso). */
function Campo({
  etiqueta,
  obligatorio,
  extra,
  ancho = "completo",
  children,
}: {
  etiqueta: string;
  obligatorio?: boolean;
  extra?: React.ReactNode;
  ancho?: "completo" | "mitad" | "tercio";
  children: React.ReactNode;
}) {
  const cols = { completo: "col-span-2 sm:col-span-6", mitad: "col-span-2 sm:col-span-3", tercio: "col-span-2 sm:col-span-2" }[ancho];
  return (
    <label className={`block min-w-0 ${cols}`}>
      <span className="mb-1 flex items-baseline justify-between gap-2 text-[11px] font-semibold text-gris">
        <span>
          {etiqueta}
          {obligatorio && <span className="text-rose-500"> *</span>}
        </span>
        {extra}
      </span>
      {children}
    </label>
  );
}

/** El largo usado y el máximo del SII; se pone en rojo al pasarse. */
function Contador({ valor, max }: { valor: string; max: number }) {
  const pasado = valor.length > max;
  return <span className={`font-normal tabular-nums ${pasado ? "tono-alerta font-bold" : "text-gris-suave"}`}>{valor.length}/{max}</span>;
}

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
    esCliente: contacto?.esCliente ?? true,
    esProveedor: contacto?.esProveedor ?? false,
    rut: contacto?.rut ? formatearRut(contacto.rut) : "",
    razonSocial: contacto?.razonSocial ?? "",
    giro: contacto?.giro ?? "",
    direccion: contacto?.direccion ?? "",
    comuna: contacto?.comuna ?? "",
    ciudad: contacto?.ciudad ?? "",
    pais: contacto?.pais && contacto.pais !== "Chile" ? contacto.pais : "",
    region: (contacto?.comuna && regionDeComuna(contacto.comuna)) || "",
    empresaId: contacto?.empresaId ?? "",
  });
  type Valores = ReturnType<typeof inicial>;
  const [v, setV] = useState(inicial);
  const poner = <K extends keyof Valores>(k: K, valor: Valores[K]) => setV((x) => ({ ...x, [k]: valor }));
  /** Al salir de un campo de texto: lo que quedó TODO en mayúscula (o minúscula) pasa a Nombre Propio. */
  const ordenar = (k: "razonSocial" | "giro" | "direccion" | "ciudad" | "pais") => () => poner(k, nombrePropio(v[k], { direccion: k === "direccion" }));

  const extranjero = v.tipoContribuyente === "extranjero";
  const rutNormal = v.rut ? normalizarRut(v.rut) : "";
  const rutOk = rutNormal ? rutUsable(rutNormal) : null;
  const comuna = comunaOficial(v.comuna);
  const comunasDeRegion = v.region ? [...(COMUNAS_POR_REGION[v.region] ?? [])].sort((a, b) => a.localeCompare(b, "es")) : [];

  // ── La empresa de una persona: se busca en la libreta o se crea ahí mismo ──
  const [buscarEmpresa, setBuscarEmpresa] = useState("");
  const [creadas, setCreadas] = useState<EmpresaMin[]>([]);
  const [nueva, setNueva] = useState<{ razon: string; rut: string } | null>(null);
  const [errorEmpresa, setErrorEmpresa] = useState<string | null>(null);
  const [creando, iniciarEmpresa] = useTransition();
  const todasLasEmpresas = [...empresas, ...creadas];
  const empresaElegida = todasLasEmpresas.find((e) => e.id === v.empresaId);
  const qEmp = buscarEmpresa.trim().toLowerCase();
  const empresasVisibles = todasLasEmpresas
    .filter((e) => e.id !== contacto?.id && (!qEmp || `${e.razonSocial} ${e.rut ?? ""}`.toLowerCase().includes(qEmp)))
    .slice(0, 6);
  const nuevaRutOk = nueva?.rut ? rutUsable(normalizarRut(nueva.rut)) : null;

  function abrirNueva(razon = "") {
    setErrorEmpresa(null);
    setNueva({ razon: nombrePropio(razon), rut: "" });
  }

  function crearEmpresa() {
    if (!nueva) return;
    setErrorEmpresa(null);
    iniciarEmpresa(async () => {
      const r = await crearEmpresaRapidaAction(nueva.razon, nueva.rut, v.esCliente, v.esProveedor);
      if (!r.ok) return setErrorEmpresa(r.error);
      setCreadas((x) => [...x, r.empresa]);
      setV((x) => ({ ...x, empresaId: r.empresa.id }));
      setNueva(null);
      setBuscarEmpresa("");
    });
  }

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
  const totalRequisitos = extranjero ? 4 : 5;
  const cumplidos = totalRequisitos - faltantes.length;

  function abrir() {
    setV(inicial());
    setBuscarEmpresa("");
    setCreadas([]);
    setNueva(null);
    setErrorEmpresa(null);
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

  const IconoTipo = v.tipoPersona === "empresa" ? IconBuildingSkyscraper : IconUser;

  return (
    <>
      {completar ? (
        <button onClick={abrir} className={BOTON_SUAVE_C}>
          <IconPencil size={16} /> Completar datos
        </button>
      ) : editar ? (
        <button onClick={abrir} className={BOTON_SUAVE_C}>
          <IconPencil size={16} /> Editar
        </button>
      ) : (
        <button onClick={abrir} className={BOTON_C}>
          <IconPlus size={16} /> Nuevo contacto
        </button>
      )}

      <VentanaModal
        abierta={abierta}
        alCerrar={() => setAbierta(false)}
        titulo={editar ? "Editar contacto" : "Nuevo contacto"}
        icono={<IconoTile Icono={editar ? IconUserEdit : IconUserPlus} tono="marca" />}
        variante="hoja"
        ancho="max-w-xl"
      >
        <form action={enviar} className="space-y-3.5">
          <div className="grid grid-cols-2 gap-x-3 gap-y-2.5 sm:grid-cols-6">
            {/* ── Qué es y qué relación tenemos ── */}
            <div className="col-span-2 sm:col-span-3">
              <input type="hidden" name="tipoPersona" value={v.tipoPersona} />
              <div role="radiogroup" aria-label="Tipo de contacto" className="grid h-10 grid-cols-2 gap-1 rounded-xl bg-tinta/[0.06] p-1">
                {(["empresa", "persona"] as const).map((t) => {
                  const Icono = t === "empresa" ? IconBuildingSkyscraper : IconUser;
                  return (
                    <button
                      key={t}
                      type="button"
                      role="radio"
                      aria-checked={v.tipoPersona === t}
                      onClick={() => poner("tipoPersona", t)}
                      className={`inline-flex items-center justify-center gap-1.5 rounded-lg text-[13px] font-semibold transition ${
                        v.tipoPersona === t ? "bg-superficie text-tinta shadow-sm" : "text-gris hover:text-tinta"
                      }`}
                    >
                      <Icono size={16} stroke={1.75} />
                      {t === "empresa" ? "Empresa" : "Persona"}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="col-span-2 grid grid-cols-2 gap-1.5 sm:col-span-3">
              {(
                [
                  { name: "esCliente", clave: "esCliente", Icono: ICONO.clientes, texto: "Cliente", color: "has-[:checked]:bg-emerald-500/15 has-[:checked]:text-tinta has-[:checked]:[&>svg]:text-emerald-500" },
                  { name: "esProveedor", clave: "esProveedor", Icono: ICONO.proveedores, texto: "Proveedor", color: "has-[:checked]:bg-amber-500/15 has-[:checked]:text-tinta has-[:checked]:[&>svg]:text-amber-500" },
                ] as const
              ).map((r) => (
                <label
                  key={r.name}
                  className={`flex h-10 cursor-pointer items-center justify-center gap-1.5 rounded-xl bg-tinta/[0.05] text-[13px] font-semibold text-gris transition has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-cian/15 ${r.color}`}
                >
                  <input type="checkbox" name={r.name} checked={v[r.clave]} onChange={(e) => poner(r.clave, e.target.checked)} className="sr-only" />
                  <r.Icono size={16} stroke={1.75} aria-hidden /> {r.texto}
                </label>
              ))}
            </div>

            {/* Una persona puede ser contacto de una empresa de la libreta; si no está, se crea ahí mismo. */}
            {v.tipoPersona === "persona" && (
              <div className="col-span-2 sm:col-span-6">
                <input type="hidden" name="esDeEmpresa" value={v.empresaId ? "si" : "no"} />
                <input type="hidden" name="empresaId" value={v.empresaId} />
                <span className="mb-1 block text-[11px] font-semibold text-gris">
                  Trabaja en <span className="font-normal text-gris-suave">· opcional</span>
                </span>
                {empresaElegida ? (
                  <div className="flex items-center gap-2.5 rounded-xl bg-naranjo/[0.08] px-3 py-1.5">
                    <IconBuildingSkyscraper size={16} stroke={1.75} className="shrink-0 text-naranjo" />
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold text-tinta">
                      {empresaElegida.razonSocial}
                      {creadas.some((c) => c.id === empresaElegida.id) && <span className="tono-ok fondo-tono ml-1.5 rounded-full px-1.5 py-0.5 align-middle text-[10px] font-bold">Recién creada</span>}
                    </span>
                    <button type="button" onClick={() => poner("empresaId", "")} className="inline-flex items-center gap-1 text-xs font-semibold text-gris hover:text-tinta">
                      <IconX size={14} /> Cambiar
                    </button>
                  </div>
                ) : nueva ? (
                  <div role="group" aria-label="Nueva empresa" className="space-y-2.5 rounded-2xl bg-tinta/[0.04] p-3">
                    <div className="flex items-center gap-2.5">
                      <IconoTile Icono={IconBuildingPlus} tono="marca" tamano="chico" />
                      <p className="min-w-0 flex-1 text-[13px] font-bold text-tinta">Nueva empresa</p>
                      <button type="button" onClick={() => setNueva(null)} aria-label="Cancelar nueva empresa" className="grid h-7 w-7 place-items-center rounded-full text-gris transition hover:bg-tinta/[0.08] hover:text-tinta">
                        <IconX size={15} />
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-2.5">
                      <label className="col-span-2 block">
                        <span className="mb-1 block text-[11px] font-semibold text-gris">Razón social <span className="text-rose-500">*</span></span>
                        <ConIcono Icono={IconBuildingSkyscraper}>
                          <input
                            value={nueva.razon}
                            onChange={(e) => setNueva({ ...nueva, razon: e.target.value })}
                            onBlur={() => setNueva((n) => (n ? { ...n, razon: nombrePropio(n.razon) } : n))}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                crearEmpresa();
                              }
                            }}
                            maxLength={LARGO.razonSocial + 20}
                            className={CAMPO_I}
                            placeholder="Ej: Minera Los Andes SpA"
                            autoFocus
                          />
                        </ConIcono>
                      </label>
                      <label className="col-span-2 block sm:col-span-1">
                        <span className="mb-1 flex items-baseline justify-between gap-2 text-[11px] font-semibold text-gris">
                          <span>RUT <span className="font-normal text-gris-suave">· opcional</span></span>
                          {nuevaRutOk === false && nueva.rut.length >= 8 && <span className="tono-alerta font-semibold">No cuadra</span>}
                          {nuevaRutOk && <span className="tono-ok font-semibold">Válido ✓</span>}
                        </span>
                        <ConIcono Icono={IconId}>
                          <input
                            value={nueva.rut}
                            onChange={(e) => setNueva({ ...nueva, rut: e.target.value.replace(/[^0-9kK.\-\s]/g, "") })}
                            onBlur={() => nuevaRutOk && setNueva((n) => (n ? { ...n, rut: formatearRut(normalizarRut(n.rut)) } : n))}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                crearEmpresa();
                              }
                            }}
                            maxLength={12}
                            className={`${CAMPO_I} font-mono`}
                            placeholder="76.123.456-7"
                          />
                        </ConIcono>
                      </label>
                      <div className="col-span-2 flex items-end gap-2 sm:col-span-1">
                        <button type="button" onClick={crearEmpresa} disabled={creando || !nueva.razon.trim()} aria-busy={creando} className={`${BOTON_C} w-full`}>
                          {creando ? <RuedaCarga className="h-4 w-4" /> : <IconPlus size={16} />}
                          {creando ? "Creando…" : "Crear y elegir"}
                        </button>
                      </div>
                    </div>
                    {errorEmpresa && <p className="tono-alerta fondo-tono rounded-xl px-3 py-1.5 text-xs font-semibold">{errorEmpresa}</p>}
                    <p className="text-[11px] text-gris-suave">Se guarda de inmediato en la libreta. Su giro, dirección y comuna los completas después en su ficha.</p>
                  </div>
                ) : (
                  <div>
                    <div className="relative">
                      <IconSearch size={16} stroke={1.75} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gris-suave" />
                      <input
                        value={buscarEmpresa}
                        onChange={(e) => setBuscarEmpresa(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && e.preventDefault()}
                        placeholder="Busca la empresa por nombre o RUT"
                        className={CAMPO_I}
                      />
                    </div>
                    {qEmp && (
                      <ul className="mt-1 max-h-40 divide-y divide-borde/60 overflow-y-auto rounded-xl border border-borde/60 bg-superficie">
                        {empresasVisibles.map((e) => (
                          <li key={e.id}>
                            <button type="button" onClick={() => poner("empresaId", e.id)} className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-naranjo/[0.06]">
                              <IconBuildingSkyscraper size={15} stroke={1.75} className="shrink-0 text-gris" />
                              <span className="min-w-0 flex-1 truncate text-tinta">{e.razonSocial}</span>
                              {e.rut && <span className="font-mono text-[11px] text-gris">{formatearRut(e.rut)}</span>}
                            </button>
                          </li>
                        ))}
                        {empresasVisibles.length === 0 && <li className="px-3 py-2 text-xs text-gris">Ninguna empresa coincide.</li>}
                      </ul>
                    )}
                    <button
                      type="button"
                      onClick={() => abrirNueva(buscarEmpresa)}
                      className="mt-1.5 inline-flex items-center gap-1.5 rounded-full bg-naranjo/[0.08] px-3 py-1.5 text-xs font-semibold text-naranjo transition hover:bg-naranjo/[0.14]"
                    >
                      <IconBuildingPlus size={15} stroke={1.75} />
                      {qEmp && empresasVisibles.length === 0 ? `Crear «${nombrePropio(buscarEmpresa)}» como empresa nueva` : "¿No está? Agregar una empresa nueva"}
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* ── Identificación y datos tributarios ── */}
            <Campo etiqueta={v.tipoPersona === "empresa" ? "Razón social" : "Nombre completo"} obligatorio extra={<Contador valor={v.razonSocial} max={LARGO.razonSocial} />}>
              <ConIcono Icono={IconoTipo}>
                <input
                  name="razonSocial"
                  required
                  value={v.razonSocial}
                  onChange={(e) => poner("razonSocial", e.target.value)}
                  onBlur={ordenar("razonSocial")}
                  maxLength={LARGO.razonSocial + 20}
                  className={CAMPO_I}
                  placeholder={v.tipoPersona === "empresa" ? "Ej: Minera Los Andes SpA" : "Ej: Juan Pérez Soto"}
                  autoFocus={v.tipoPersona === "empresa"}
                />
              </ConIcono>
            </Campo>
            {!extranjero && (
              <Campo
                etiqueta="RUT"
                ancho="mitad"
                extra={
                  rutOk === false && v.rut.length >= 8 ? (
                    <span className="tono-alerta font-semibold">Dígito verificador no cuadra</span>
                  ) : rutOk ? (
                    <span className="tono-ok font-semibold">Válido ✓</span>
                  ) : null
                }
              >
                <ConIcono Icono={IconId}>
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
                    className={`${CAMPO_I} font-mono ${rutOk === false && v.rut.length >= 8 ? "border-rose-500/60" : ""}`}
                    placeholder="76.123.456-7"
                    aria-invalid={rutOk === false}
                  />
                </ConIcono>
              </Campo>
            )}
            <Campo etiqueta="Contribuyente" ancho={extranjero ? "completo" : "mitad"}>
              <ConIcono Icono={IconReceiptTax}>
                <select
                  name="tipoContribuyente"
                  value={v.tipoContribuyente}
                  onChange={(e) => poner("tipoContribuyente", e.target.value as TipoContribuyente)}
                  title={AYUDA_TIPO_CONTRIBUYENTE[v.tipoContribuyente]}
                  className={CAMPO_I}
                >
                  {(Object.keys(ETIQUETA_TIPO_CONTRIBUYENTE) as TipoContribuyente[]).map((t) => (
                    <option key={t} value={t}>{ETIQUETA_TIPO_CONTRIBUYENTE[t]}</option>
                  ))}
                </select>
              </ConIcono>
            </Campo>
            <Campo etiqueta="Giro" extra={<Contador valor={v.giro} max={LARGO.giro} />}>
              <ConIcono Icono={IconBriefcase}>
                <input name="giro" value={v.giro} onChange={(e) => poner("giro", e.target.value)} onBlur={ordenar("giro")} maxLength={200} className={CAMPO_I} placeholder="Ej: Servicios de ingeniería" />
              </ConIcono>
            </Campo>

            {/* ── Ubicación ── */}
            <Campo etiqueta="Dirección" extra={<Contador valor={v.direccion} max={LARGO.direccion} />}>
              <ConIcono Icono={IconHome2}>
                <input name="direccion" value={v.direccion} onChange={(e) => poner("direccion", e.target.value)} onBlur={ordenar("direccion")} maxLength={200} className={CAMPO_I} placeholder="Calle, número, oficina" />
              </ConIcono>
            </Campo>
            {extranjero ? (
              <>
                <Campo etiqueta="País" ancho="mitad">
                  <ConIcono Icono={IconWorld}>
                    <input name="pais" value={v.pais} onChange={(e) => poner("pais", e.target.value)} onBlur={ordenar("pais")} className={CAMPO_I} placeholder="Ej: Perú" />
                  </ConIcono>
                </Campo>
                <Campo etiqueta="Ciudad" ancho="mitad">
                  <ConIcono Icono={IconBuildingCommunity}>
                    <input name="ciudad" value={v.ciudad} onChange={(e) => poner("ciudad", e.target.value)} onBlur={ordenar("ciudad")} maxLength={LARGO.ciudad} className={CAMPO_I} />
                  </ConIcono>
                </Campo>
              </>
            ) : (
              <>
                <Campo etiqueta="Región" ancho="tercio">
                  <ConIcono Icono={IconMap2}>
                    <select value={v.region} onChange={(e) => setV((x) => ({ ...x, region: e.target.value, comuna: "", ciudad: "" }))} className={CAMPO_I}>
                      <option value="">Elige</option>
                      {REGIONES.map((r) => <option key={r} value={r}>{r}</option>)}
                    </select>
                  </ConIcono>
                </Campo>
                <Campo etiqueta="Comuna" ancho="tercio" extra={v.comuna && !comuna ? <span className="tono-aviso font-semibold">No oficial</span> : null}>
                  <ConIcono Icono={IconLocation}>
                    <select
                      name="comuna"
                      value={comuna ?? v.comuna}
                      disabled={!v.region && !v.comuna}
                      // La ciudad parte igual a la comuna (es lo habitual en la factura) y se puede cambiar.
                      onChange={(e) => setV((x) => ({ ...x, comuna: e.target.value, ciudad: !x.ciudad || x.ciudad === x.comuna ? e.target.value : x.ciudad }))}
                      className={CAMPO_I}
                    >
                      <option value="">{v.region ? "Elige" : "Primero la región"}</option>
                      {v.comuna && !comuna && <option value={v.comuna}>{v.comuna} (no oficial)</option>}
                      {comunasDeRegion.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </ConIcono>
                </Campo>
                <Campo etiqueta="Ciudad" ancho="tercio">
                  <ConIcono Icono={IconBuildingCommunity}>
                    <select name="ciudad" value={v.ciudad} disabled={!v.region} onChange={(e) => poner("ciudad", e.target.value)} className={CAMPO_I}>
                      <option value="">{v.region ? "Elige" : "Primero la región"}</option>
                      {v.ciudad && !comunasDeRegion.includes(v.ciudad) && <option value={v.ciudad}>{v.ciudad}</option>}
                      {comunasDeRegion.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </ConIcono>
                </Campo>
              </>
            )}

            {/* ── Envío y cobro ── */}
            <Campo etiqueta="Correo para facturas (DTE)" ancho="mitad">
              <ConIcono Icono={IconMail}>
                <input name="correoDte" type="email" defaultValue={contacto?.correoDte ?? ""} maxLength={LARGO.correo} className={CAMPO_I} placeholder="dte@empresa.cl" />
              </ConIcono>
            </Campo>
            <Campo etiqueta="Correo de contacto" ancho="mitad">
              <ConIcono Icono={IconAt}>
                <input name="correo" type="email" defaultValue={contacto?.correo ?? ""} maxLength={LARGO.correo} className={CAMPO_I} placeholder="contacto@empresa.cl" />
              </ConIcono>
            </Campo>
            <Campo etiqueta="Teléfono" ancho="mitad">
              <ConIcono Icono={IconPhone}>
                <input name="telefono" type="tel" defaultValue={contacto?.telefono ?? ""} maxLength={LARGO.telefono} className={CAMPO_I} placeholder="+56 9 1234 5678" />
              </ConIcono>
            </Campo>
            <Campo etiqueta="Plazo de pago" ancho="mitad">
              <ConIcono Icono={IconCalendarDue}>
                <select name="plazoPagoDias" defaultValue={contacto?.plazoPagoDias ?? ""} className={CAMPO_I}>
                  <option value="">Sin definir</option>
                  {[...new Set([...PLAZOS, ...(contacto?.plazoPagoDias != null ? [contacto.plazoPagoDias] : [])])]
                    .sort((a, b) => a - b)
                    .map((d) => <option key={d} value={d}>{d === 0 ? "Contado" : `${d} días`}</option>)}
                </select>
              </ConIcono>
            </Campo>
            <Campo etiqueta="Notas">
              <ConIcono Icono={IconNotes} arriba>
                <textarea name="notas" rows={2} defaultValue={contacto?.notas ?? ""} className={`${CAMPO_I} resize-none`} placeholder="Condiciones especiales, orden de compra obligatoria…" />
              </ConIcono>
            </Campo>
          </div>

          {error && <p className="tono-alerta fondo-tono rounded-xl px-3 py-2 text-sm font-semibold">{error}</p>}

          {/* ── Pie: qué falta para facturar y los botones ── */}
          <div className="flex flex-wrap items-center gap-3 border-t border-borde/60 pt-3.5">
            <span
              title={faltantes.map((f) => f.texto).join("\n") || undefined}
              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${faltantes.length ? "tono-aviso fondo-tono" : "tono-ok fondo-tono"}`}
            >
              {faltantes.length ? <IconCircleDashed size={14} /> : <IconCircleCheck size={14} />}
              {faltantes.length ? `Para facturar: ${cumplidos} de ${totalRequisitos}` : "Listo para facturar"}
            </span>
            <div className="ml-auto flex gap-2">
              <button type="button" onClick={() => setAbierta(false)} className={BOTON_SUAVE_C}>
                Cancelar
              </button>
              <button type="submit" disabled={pendiente} aria-busy={pendiente} className={BOTON_C}>
                {pendiente && <RuedaCarga className="h-4 w-4" />}
                {pendiente ? "Guardando…" : editar ? "Guardar" : "Crear contacto"}
              </button>
            </div>
          </div>
        </form>
      </VentanaModal>
    </>
  );
}

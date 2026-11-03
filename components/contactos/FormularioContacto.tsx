"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { IconBuilding, IconCircleCheck, IconCircleDashed, IconPencil, IconPlus, IconUser } from "@tabler/icons-react";
import VentanaModal from "@/components/inventario/VentanaModal";
import BotonGuardar from "@/components/inventario/BotonGuardar";
import { Campo, Seccion } from "@/components/flota/Campos";
import { VistaReceptor } from "@/components/contactos/Visual";
import { CAMPO } from "@/lib/estilos";
import { formatearRut, normalizarRut } from "@/lib/contratos/rut";
import {
  AYUDA_TIPO_CONTRIBUYENTE,
  COMUNAS_ORDENADAS,
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

export default function FormularioContacto({ contacto, completar = false }: { contacto?: Contacto; /** Botón «Completar datos» en vez de «Editar», para la franja de lo que falta. */ completar?: boolean }) {
  const editar = Boolean(contacto);
  const [abierta, setAbierta] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();
  const router = useRouter();
  const idComunas = useId();

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
  });
  const [v, setV] = useState(inicial);
  const poner = <K extends keyof ReturnType<typeof inicial>>(k: K, valor: ReturnType<typeof inicial>[K]) => setV((x) => ({ ...x, [k]: valor }));

  const extranjero = v.tipoContribuyente === "extranjero";
  const rutNormal = v.rut ? normalizarRut(v.rut) : "";
  const rutOk = rutNormal ? rutUsable(rutNormal) : null;
  const comuna = comunaOficial(v.comuna);
  const region = comuna ? regionDeComuna(comuna) : null;

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
                <div className="grid gap-4 sm:grid-cols-2">
                  <Campo etiqueta="Comuna">
                    <input
                      name="comuna"
                      list={idComunas}
                      value={v.comuna}
                      onChange={(e) => poner("comuna", e.target.value)}
                      onBlur={() => comuna && poner("comuna", comuna)}
                      autoComplete="off"
                      className={`${CAMPO} ${v.comuna && !comuna ? "border-amber-500/60" : ""}`}
                      placeholder="Escribe y elige"
                    />
                    <datalist id={idComunas}>
                      {COMUNAS_ORDENADAS.map((c) => <option key={c} value={c} />)}
                    </datalist>
                    <span className="mt-1 block text-[11px] text-gris-suave">
                      {region ? `Región de ${region}` : v.comuna ? <span className="tono-aviso font-semibold">Elige una comuna de la lista</span> : "Las 346 comunas oficiales"}
                    </span>
                  </Campo>
                  <Campo etiqueta="Ciudad" ayuda="Opcional">
                    <input name="ciudad" value={v.ciudad} onChange={(e) => poner("ciudad", e.target.value)} maxLength={LARGO.ciudad} className={CAMPO} placeholder="Ej: Santiago" />
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

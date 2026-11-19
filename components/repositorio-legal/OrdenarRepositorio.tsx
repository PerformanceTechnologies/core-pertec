"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { IconArrowRight, IconBuildingBank, IconFolderQuestion, IconPlus, IconRefresh, IconSparkles, IconTrash, IconWand, IconX } from "@tabler/icons-react";
import { Kpi, Seccion, TD, TH, Vacio } from "@/components/fin/piezas";
import { aplicarLote, calcularPlan, terminarOrden, type OpcionesDelFormulario } from "@/app/(protegido)/repositorio-legal/ordenar/acciones";
import { BOTON_PRIMARIO, CAMPO } from "@/lib/estilos";
import type { SociedadBase } from "@/lib/repositorio-legal/modelo";
import type { Accion, Operacion, ResumenPlan } from "@/lib/repositorio-legal/orden";
import VentanaModal from "@/components/contratos/VentanaModal";
import { HOJA } from "./Resumen";
import { pesoLegible } from "./Visual";

const LOTE = 15;

const ETIQUETA: Record<Accion, string> = { mover: "Ordenar", revisar: "Por revisar", eliminar: "Eliminar", mantener: "Sin cambios" };
const TONO: Record<Accion, string> = {
  mover: "bg-cian/12 text-cian",
  revisar: "bg-amber-500/15 text-aviso",
  eliminar: "bg-rose-500/12 text-alerta",
  mantener: "bg-tinta/[0.06] text-gris",
};

/**
 * Ordenar el repositorio: se ajustan los nombres de carpeta de cada sociedad (para renombrar una), se agregan
 * las nuevas, se calcula el plan y se aplica por lotes. Todo lo que se elimina va a la papelera de SharePoint.
 */
export default function OrdenarRepositorio({ sociedades, porOmisionInicial, opsIniciales, resumenInicial }: { sociedades: SociedadBase[]; porOmisionInicial: string | null; opsIniciales: Operacion[]; resumenInicial: ResumenPlan }) {
  const router = useRouter();
  const [carpetas, setCarpetas] = useState<Record<string, string>>(Object.fromEntries(sociedades.map((s) => [s.slug, s.nombre])));
  const [nuevas, setNuevas] = useState<string[]>([]);
  const [nueva, setNueva] = useState("");
  const [versiones, setVersiones] = useState(false);
  const [porOmision, setPorOmision] = useState<string>(porOmisionInicial ?? "");
  const [ops, setOps] = useState(opsIniciales);
  const [resumen, setResumen] = useState(resumenInicial);
  const [ver, setVer] = useState<Accion>("mover");
  const [desactualizado, setDesactualizado] = useState(false);
  const [calculando, iniciar] = useTransition();
  const [avance, setAvance] = useState<{ hechos: number; total: number } | null>(null);
  const [errores, setErrores] = useState<{ ruta: string; error: string }[]>([]);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmando, setConfirmando] = useState(false);

  const opciones: OpcionesDelFormulario = { eliminarVersionesAnteriores: versiones, carpetas, porOmision: porOmision || null };
  const nombreSociedad = useMemo(() => new Map(sociedades.map((s) => [s.slug, s.nombre])), [sociedades]);
  const pendientes = ops.filter((o) => o.accion !== "mantener");
  const visibles = ops.filter((o) => o.accion === ver);

  function recalcular() {
    setError(null);
    iniciar(async () => {
      const r = await calcularPlan(opciones);
      if (!r.ok) return setError(r.error);
      setOps(r.ops);
      setResumen(r.resumen);
      setDesactualizado(false);
    });
  }

  function cambiar<T>(fn: (v: T) => void) {
    return (v: T) => {
      fn(v);
      setDesactualizado(true);
    };
  }

  /** Primero se confirma en una ventana de la página (no la nativa del navegador, que algunos bloquean). */
  function pedirConfirmacion() {
    if (desactualizado) return setError("Cambiaste opciones: vuelve a calcular el plan antes de aplicarlo.");
    setError(null);
    setConfirmando(true);
  }

  async function aplicar() {
    setConfirmando(false);
    setError(null);
    setMensaje(null);
    setErrores([]);
    const ids = pendientes.map((o) => o.id);
    setAvance({ hechos: 0, total: ids.length });
    let hechos = 0;
    const todosLosErrores: { ruta: string; error: string }[] = [];
    for (let i = 0; i < ids.length; i += LOTE) {
      const r = await aplicarLote(opciones, ids.slice(i, i + LOTE));
      if (!r.ok) {
        setError(r.error);
        break;
      }
      hechos += r.hechos;
      todosLosErrores.push(...r.errores);
      setAvance({ hechos: Math.min(i + LOTE, ids.length), total: ids.length });
    }
    const fin = await terminarOrden(nuevas);
    setAvance(null);
    setErrores(todosLosErrores);
    if (!fin.ok) setError(fin.error);
    else setMensaje(`Listo: ${hechos} cambios aplicados y ${fin.carpetasBorradas} carpetas vacías eliminadas.${todosLosErrores.length ? ` ${todosLosErrores.length} no se pudieron aplicar (abajo el detalle).` : ""}`);
    setNuevas([]);
    router.refresh();
    recalcular();
  }

  return (
    <div className="space-y-7">
      <section className={`${HOJA} flex flex-wrap items-center gap-4 p-5`}>
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-linear-to-br from-naranjo to-naranjo-suave text-white">
          <IconWand size={22} stroke={1.9} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-tinta">Ordenar SharePoint por sociedad</p>
          <p className="text-[13px] text-gris">
            Cada documento va a <span className="font-semibold text-tinta">SOCIEDADES / sociedad / categoría</span> con un nombre corto y su fecha de emisión. Lo que no es documentación legal va a{" "}
            <span className="font-semibold text-tinta">POR REVISAR</span>. Las copias idénticas y las carpetas de solicitudes se eliminan (a la papelera, se recuperan durante 93 días).
          </p>
        </div>
      </section>

      <VentanaModal abierta={confirmando} alCerrar={() => setConfirmando(false)} titulo="¿Aplicar el plan en SharePoint?" descripcion="Lo eliminado se puede recuperar desde la papelera del sitio durante 93 días.">
        <ul className="space-y-1.5 text-sm text-tinta">
          <li>
            <span className="font-semibold tabular-nums">{resumen.mover}</span> documentos a su sociedad y categoría, con nombre nuevo
          </li>
          <li>
            <span className="font-semibold tabular-nums">{resumen.revisar}</span> a «POR REVISAR»
          </li>
          <li>
            <span className="font-semibold tabular-nums text-alerta">{resumen.eliminar}</span> a la papelera ({pesoLegible(resumen.bytesLiberados)})
          </li>
          {nuevas.length > 0 && <li>Sociedades nuevas: {nuevas.join(", ")}</li>}
        </ul>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={() => setConfirmando(false)} className="inline-flex min-h-10 items-center rounded-lg bg-tinta/[0.06] px-4 text-sm font-semibold text-tinta hover:bg-tinta/[0.1]">
            Cancelar
          </button>
          <button type="button" onClick={aplicar} className={BOTON_PRIMARIO}>
            <IconWand size={17} stroke={1.75} /> Sí, aplicar
          </button>
        </div>
      </VentanaModal>

      <Seccion titulo="Sociedades" icono={<IconBuildingBank size={15} />}>
        <div className={`${HOJA} p-4`}>
          <p className="mb-3 text-xs text-gris">El nombre de la carpeta de cada sociedad. Para renombrar una (por ejemplo, si cambió de razón social), escribe el nombre nuevo: sus documentos pasan a esa carpeta.</p>
          <div className="grid gap-2 md:grid-cols-2">
            {sociedades.map((s) => (
              <label key={s.slug} className="flex items-center gap-2 text-sm">
                <span className="w-48 shrink-0 truncate text-gris" title={s.carpeta}>
                  {s.carpeta}
                </span>
                <IconArrowRight size={14} className="shrink-0 text-gris-suave" />
                <input className={`${CAMPO} min-h-9 py-1.5`} value={carpetas[s.slug] ?? ""} onChange={(e) => cambiar<string>((v) => setCarpetas((c) => ({ ...c, [s.slug]: v })))(e.target.value)} />
              </label>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-borde/60 pt-4">
            <span className="text-sm font-semibold text-tinta">Agregar sociedad</span>
            <input className={`${CAMPO} min-h-9 w-64 flex-none py-1.5`} placeholder="Nombre (ej. Nueva Sociedad SpA)" value={nueva} onChange={(e) => setNueva(e.target.value)} />
            <button
              type="button"
              className="inline-flex min-h-9 items-center gap-1 rounded-lg bg-tinta/[0.06] px-3 text-sm font-semibold text-tinta hover:bg-tinta/[0.1]"
              onClick={() => {
                const n = nueva.trim();
                if (n && !nuevas.includes(n)) setNuevas([...nuevas, n]);
                setNueva("");
              }}
            >
              <IconPlus size={15} /> Agregar
            </button>
            {nuevas.map((n) => (
              <span key={n} className="inline-flex items-center gap-1 rounded-full bg-cian/12 px-2.5 py-1 text-xs font-semibold text-cian">
                {n}
                <button type="button" aria-label={`Quitar ${n}`} onClick={() => setNuevas(nuevas.filter((x) => x !== n))}>
                  <IconX size={12} />
                </button>
              </span>
            ))}
          </div>
          <label className="mt-4 flex flex-wrap items-center gap-2 border-t border-borde/60 pt-4 text-sm text-tinta">
            <span>Lo que no dice de qué sociedad es (las solicitudes, por ejemplo) va a</span>
            <select className={`${CAMPO.replace("w-full", "")} min-h-9 w-auto py-1.5`} value={porOmision} onChange={(e) => cambiar<string>(setPorOmision)(e.target.value)}>
              <option value="">Por revisar (sin sociedad)</option>
              {sociedades.map((s) => (
                <option key={s.slug} value={s.slug}>
                  {s.nombre}
                </option>
              ))}
            </select>
          </label>
          <label className="mt-4 flex items-center gap-2 border-t border-borde/60 pt-4 text-sm text-tinta">
            <input type="checkbox" checked={versiones} onChange={(e) => cambiar<boolean>(setVersiones)(e.target.checked)} />
            También eliminar las <span className="font-semibold">versiones anteriores</span> de un mismo documento (por ejemplo, certificados de vigencia viejos cuando hay uno más nuevo).
          </label>
          <div className="mt-4 flex justify-end">
            <button type="button" onClick={recalcular} disabled={calculando} className="inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-tinta/[0.06] px-4 text-sm font-semibold text-tinta hover:bg-tinta/[0.1] disabled:opacity-50">
              <IconRefresh size={16} className={calculando ? "animate-spin" : ""} /> {calculando ? "Calculando…" : "Calcular plan"}
            </button>
          </div>
        </div>
      </Seccion>

      <Seccion titulo="Plan" icono={<IconSparkles size={15} />} accion={desactualizado ? <span className="text-xs font-semibold text-aviso">Cambiaste opciones: vuelve a calcular</span> : undefined}>
        <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
          <Kpi etiqueta="A su sociedad" valor={String(resumen.mover)} tono="text-cian" detalle="con nombre nuevo" />
          <Kpi etiqueta="Por revisar" valor={String(resumen.revisar)} tono="text-aviso" detalle="no legal o sin sociedad" />
          <Kpi etiqueta="A la papelera" valor={String(resumen.eliminar)} tono="text-alerta" detalle={`libera ${pesoLegible(resumen.bytesLiberados)}`} />
          <Kpi etiqueta="Sin cambios" valor={String(resumen.mantener)} detalle="ya ordenados" />
        </div>

        <div className="mb-3 flex flex-wrap items-center gap-3">
          <div className="inline-flex max-w-full flex-wrap gap-1 rounded-xl border border-borde bg-superficie p-1">
            {(["mover", "revisar", "eliminar", "mantener"] as Accion[]).map((a) => (
              <button key={a} type="button" onClick={() => setVer(a)} className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${ver === a ? "bg-tinta text-superficie" : "text-gris hover:text-tinta"}`}>
                {ETIQUETA[a]} <span className="tabular-nums opacity-70">{ops.filter((o) => o.accion === a).length}</span>
              </button>
            ))}
          </div>
          <button type="button" onClick={pedirConfirmacion} disabled={Boolean(avance) || calculando || (pendientes.length === 0 && nuevas.length === 0)} className={`${BOTON_PRIMARIO} ml-auto`}>
            <IconWand size={17} stroke={1.75} /> {avance ? `Aplicando… ${avance.hechos}/${avance.total}` : `Aplicar plan (${pendientes.length})`}
          </button>
        </div>

        {avance && (
          <div className="mb-3 h-2 overflow-hidden rounded-full bg-tinta/[0.06]">
            <div className="h-full rounded-full bg-naranjo transition-all" style={{ width: `${(avance.hechos / Math.max(avance.total, 1)) * 100}%` }} />
          </div>
        )}
        {mensaje && <p className="tono-ok mb-3 rounded-lg px-3 py-2 text-sm">{mensaje}</p>}
        {error && <p className="tono-alerta mb-3 rounded-lg px-3 py-2 text-sm">{error}</p>}
        {errores.length > 0 && (
          <ul className="tono-alerta mb-3 space-y-1 rounded-lg px-3 py-2 text-xs">
            {errores.map((e) => (
              <li key={e.ruta}>
                {e.ruta}: {e.error}
              </li>
            ))}
          </ul>
        )}

        {visibles.length === 0 ? (
          <Vacio titulo="Nada en esta lista" icono={ver === "eliminar" ? <IconTrash size={24} stroke={1.6} /> : <IconFolderQuestion size={24} stroke={1.6} />} />
        ) : (
          <div className={`${HOJA} overflow-x-auto p-1.5`}>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-borde">
                  <th className={TH}>Acción</th>
                  <th className={TH}>Hoy</th>
                  {ver !== "eliminar" && ver !== "mantener" && <th className={TH}>Queda como</th>}
                  <th className={TH}>Por qué</th>
                </tr>
              </thead>
              <tbody>
                {visibles.map((o) => (
                  <tr key={o.id} className="border-b border-borde/50 last:border-0">
                    <td className={TD}>
                      <span className={`inline-block whitespace-nowrap rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${TONO[o.accion]}`}>{ETIQUETA[o.accion]}</span>
                    </td>
                    <td className={`${TD} max-w-[22rem] break-words text-gris`}>{o.rutaActual}</td>
                    {ver !== "eliminar" && ver !== "mantener" && (
                      <td className={`${TD} max-w-[24rem] break-words`}>
                        <span className="block text-[11px] text-gris">{o.destino}</span>
                        <span className="font-semibold text-tinta">{o.nombre}</span>
                      </td>
                    )}
                    <td className={`${TD} max-w-[18rem] text-xs text-gris`}>
                      {o.motivo}
                      {o.sociedad && ver === "revisar" ? ` · ${nombreSociedad.get(o.sociedad) ?? ""}` : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Seccion>
    </div>
  );
}

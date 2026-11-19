"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  IconArrowsMove,
  IconDownload,
  IconEye,
  IconFileUpload,
  IconPackageExport,
  IconPencil,
  IconRefresh,
  IconSearch,
  IconTrash,
} from "@tabler/icons-react";
import VentanaModal from "@/components/contratos/VentanaModal";
import { BOTON_PRIMARIO, CAMPO, CELDA_SIN_CORTE } from "@/lib/estilos";
import { TD, TH, Vacio } from "@/components/fin/piezas";
import { HOJA } from "./Resumen";
import {
  antiguedad,
  CATEGORIAS,
  ETIQUETA_ESTADO,
  formatearFecha,
  PESO_ESTADO,
  type Categoria,
  type Documento,
  type Estado,
  type SociedadBase,
} from "@/lib/repositorio-legal/modelo";
import { eliminarDocumento, moverDocumento, renombrarDocumento } from "@/app/(protegido)/repositorio-legal/acciones";
import SubirDocumento from "./SubirDocumento";
import { ChipEstado, pesoLegible } from "./Visual";

export interface PermisosCliente {
  subir: boolean;
  editar: boolean;
}

type FiltroEstado = "todos" | "atencion" | Estado;

/**
 * La tabla de documentos del Repositorio Legal: buscador, filtros (sociedad, categoría, estado,
 * formato), orden por fecha de emisión y las acciones de cada fila. Se usa en la ficha de una
 * sociedad, en el buscador global y en Vencimientos.
 */
export default function TablaDocumentos({
  documentos,
  sociedades,
  carpetas,
  permisos,
  sociedadFija,
  estadoInicial = "todos",
  sociedadInicial,
  categoriaInicial,
}: {
  documentos: Documento[];
  sociedades: SociedadBase[];
  carpetas: string[];
  permisos: PermisosCliente;
  sociedadFija?: string | null;
  estadoInicial?: FiltroEstado;
  /** Filtros que llegan por la URL (desde las tarjetas del Resumen: «vencidos de tal sociedad»). */
  sociedadInicial?: string | null;
  categoriaInicial?: Categoria | null;
}) {
  const router = useRouter();
  const [pendiente, iniciar] = useTransition();
  const [texto, setTexto] = useState("");
  const [sociedad, setSociedad] = useState<string>(sociedadFija ?? sociedadInicial ?? "todas");
  const [categoria, setCategoria] = useState<Categoria | "todas">(categoriaInicial ?? "todas");
  const [estado, setEstado] = useState<FiltroEstado>(estadoInicial);
  const [formato, setFormato] = useState("todos");
  const [conCopias, setConCopias] = useState(false);
  const [orden, setOrden] = useState<"emision" | "estado" | "nombre">(estadoInicial === "atencion" ? "estado" : "emision");
  const [elegidos, setElegidos] = useState<Set<string>>(new Set());
  const [subir, setSubir] = useState(false);
  const [renovar, setRenovar] = useState<Documento | null>(null);
  const [visor, setVisor] = useState<{ doc: Documento; url: string | null } | null>(null);
  const [moviendo, setMoviendo] = useState<Documento | null>(null);
  const [destino, setDestino] = useState("");
  const [error, setError] = useState<string | null>(null);

  const nombreSociedad = useMemo(() => new Map(sociedades.map((s) => [s.slug, s.nombre])), [sociedades]);
  const formatos = useMemo(() => [...new Set(documentos.map((d) => d.extension).filter(Boolean))].sort(), [documentos]);

  const filas = useMemo(() => {
    const q = texto
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .trim();
    const lista = documentos.filter((d) => {
      if (!conCopias && d.copiaDe) return false;
      if (sociedad !== "todas" && (sociedad === "sin" ? d.sociedad : d.sociedad !== sociedad)) return false;
      if (categoria !== "todas" && d.categoria !== categoria) return false;
      if (estado === "atencion" ? !(d.estado === "vencido" || d.estado === "por_vencer") : estado !== "todos" && d.estado !== estado) return false;
      if (formato !== "todos" && d.extension !== formato) return false;
      if (q) {
        const hay = `${d.nombre} ${d.tipoNombre} ${d.ruta}`
          .normalize("NFD")
          .replace(/[̀-ͯ]/g, "")
          .toLowerCase();
        if (!q.split(/\s+/).every((p) => hay.includes(p))) return false;
      }
      return true;
    });
    return lista.sort((a, b) => {
      if (orden === "nombre") return a.nombre.localeCompare(b.nombre, "es");
      if (orden === "estado") return PESO_ESTADO[a.estado] - PESO_ESTADO[b.estado] || (a.vence ?? "9").localeCompare(b.vence ?? "9");
      return (b.emision ?? "").localeCompare(a.emision ?? "") || a.nombre.localeCompare(b.nombre, "es");
    });
  }, [documentos, texto, sociedad, categoria, estado, formato, conCopias, orden]);

  const porCategoria = useMemo(() => {
    const m = new Map<Categoria, number>();
    for (const d of documentos) if ((conCopias || !d.copiaDe) && (sociedad === "todas" || d.sociedad === sociedad)) m.set(d.categoria, (m.get(d.categoria) ?? 0) + 1);
    return m;
  }, [documentos, sociedad, conCopias]);

  function alternar(id: string) {
    setElegidos((prev) => {
      const s = new Set(prev);
      if (s.has(id)) s.delete(id);
      else s.add(id);
      return s;
    });
  }

  async function ver(doc: Documento) {
    setVisor({ doc, url: null });
    const r = await fetch(`/api/repositorio-legal/archivo/${doc.id}?vista=1`).then((x) => x.json()).catch(() => null);
    setVisor({ doc, url: r?.url ?? "" });
  }

  function accion(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    iniciar(async () => {
      const r = await fn();
      if (!r.ok) setError(r.error ?? "No se pudo completar.");
      else router.refresh();
    });
  }

  function pedirRenombre(d: Documento) {
    const nuevo = window.prompt("Nuevo nombre del archivo (incluye la fecha de emisión):", d.nombre);
    if (nuevo && nuevo.trim() && nuevo !== d.nombre) accion(() => renombrarDocumento(d.id, nuevo.trim()));
  }

  function pedirEliminar(d: Documento) {
    if (window.confirm(`¿Eliminar «${d.nombre}»?\n\nVa a la papelera de SharePoint y se puede recuperar desde el sitio durante 93 días.`)) accion(() => eliminarDocumento(d.id));
  }

  const carpetasDestino = carpetas.filter((c) => c.split("/").length <= 3).sort((a, b) => a.localeCompare(b, "es"));

  return (
    <div className="space-y-4">
      {/* Categorías: el mismo selector de pestañas que Gestión financiera */}
      <div className="inline-flex max-w-full flex-wrap gap-1 rounded-xl border border-borde bg-superficie p-1">
        {[{ id: "todas" as const, corto: "Todas", n: [...porCategoria.values()].reduce((a, b) => a + b, 0) }, ...CATEGORIAS.filter((c) => porCategoria.get(c.id)).map((c) => ({ id: c.id, corto: c.corto, n: porCategoria.get(c.id) ?? 0 }))].map((c) => (
          <button key={c.id} type="button" onClick={() => setCategoria(c.id)} className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${categoria === c.id ? "bg-tinta text-superficie" : "text-gris hover:text-tinta"}`}>
            {c.corto}
            <span className="tabular-nums opacity-70">{c.n}</span>
          </button>
        ))}
      </div>

      {/* Filtros */}
      <div className={`${HOJA} flex flex-wrap items-center gap-2 p-3`}>
        <label className="relative min-w-[220px] flex-1">
          <IconSearch size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gris-suave" />
          <input className={`${CAMPO} pl-9`} placeholder="Buscar por nombre, tipo o carpeta…" value={texto} onChange={(e) => setTexto(e.target.value)} />
        </label>
        {!sociedadFija && (
          <select className={`${CAMPO} w-auto`} value={sociedad} onChange={(e) => setSociedad(e.target.value)}>
            <option value="todas">Todas las sociedades</option>
            {sociedades.map((s) => (
              <option key={s.slug} value={s.slug}>
                {s.nombre}
              </option>
            ))}
            <option value="sin">Sin sociedad</option>
          </select>
        )}
        <select className={`${CAMPO} w-auto`} value={estado} onChange={(e) => setEstado(e.target.value as FiltroEstado)}>
          <option value="todos">Todos los estados</option>
          <option value="atencion">Vencidos y por vencer</option>
          {(Object.keys(ETIQUETA_ESTADO) as Estado[]).map((e) => (
            <option key={e} value={e}>
              {ETIQUETA_ESTADO[e]}
            </option>
          ))}
        </select>
        <select className={`${CAMPO} w-auto`} value={formato} onChange={(e) => setFormato(e.target.value)}>
          <option value="todos">Todo formato</option>
          {formatos.map((f) => (
            <option key={f} value={f}>
              .{f}
            </option>
          ))}
        </select>
        <select className={`${CAMPO} w-auto`} value={orden} onChange={(e) => setOrden(e.target.value as typeof orden)}>
          <option value="emision">Más recientes primero</option>
          <option value="estado">Lo urgente primero</option>
          <option value="nombre">Por nombre</option>
        </select>
        <label className="flex items-center gap-2 px-1 text-sm text-gris">
          <input type="checkbox" checked={conCopias} onChange={(e) => setConCopias(e.target.checked)} /> Ver copias
        </label>
        {permisos.subir && (
          <button type="button" className={`${BOTON_PRIMARIO} ml-auto`} onClick={() => setSubir(true)}>
            <IconFileUpload size={17} stroke={1.75} /> Subir documento
          </button>
        )}
      </div>

      {error && <p className="tono-alerta rounded-lg px-3 py-2 text-sm">{error}</p>}

      {/* Paquete */}
      {elegidos.size > 0 && (
        <form method="post" action="/api/repositorio-legal/paquete" className={`${HOJA} flex flex-wrap items-center gap-3 border-naranjo/40 p-3`}>
          {[...elegidos].map((id) => (
            <input key={id} type="hidden" name="id" value={id} />
          ))}
          <span className="text-sm font-semibold text-tinta">{elegidos.size} elegidos</span>
          <input name="titulo" className={`${CAMPO} w-auto flex-1`} placeholder="Nombre del paquete (ej. Antecedentes Banco - nov 2026)" />
          <button type="submit" className={BOTON_PRIMARIO}>
            <IconPackageExport size={17} stroke={1.75} /> Descargar ZIP
          </button>
          <button type="button" className="text-sm text-gris hover:text-tinta" onClick={() => setElegidos(new Set())}>
            Limpiar
          </button>
        </form>
      )}

      {/* Tabla */}
      {filas.length === 0 ? (
        <Vacio titulo="No hay documentos con estos filtros" texto="Prueba con otra categoría, otro estado o «Todas las sociedades»." />
      ) : (
      <div className={`${HOJA} overflow-x-auto p-1.5`}>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-borde">
              <th className={`${TH} w-8`} />
              <th className={TH}>Documento</th>
              {!sociedadFija && <th className={TH}>Sociedad</th>}
              <th className={TH}>Emisión</th>
              <th className={TH}>Vigencia</th>
              <th className={TH}>Estado</th>
              <th className={`${TH} text-right`}>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((d) => (
              <tr key={d.id} className={`border-b border-borde/50 last:border-0 transition hover:bg-tinta/[0.025] ${d.estado === "historico" ? "opacity-60" : ""}`}>
                <td className={TD}>
                  <input type="checkbox" aria-label="Elegir para el paquete" checked={elegidos.has(d.id)} onChange={() => alternar(d.id)} />
                </td>
                <td className={`${TD} max-w-[420px]`}>
                  <button type="button" onClick={() => ver(d)} className="text-left font-semibold text-tinta hover:text-naranjo">
                    {d.nombre}
                  </button>
                  <p className="text-xs text-gris">
                    {d.tipoNombre} · {pesoLegible(d.tamano)}
                    {d.modificadoPor ? ` · ${d.modificadoPor}` : ""}
                    {d.copiaDe ? " · copia" : ""}
                    {d.confidencial ? " · confidencial" : ""}
                  </p>
                  {d.area !== "sociedades" && <p className="truncate text-[11px] text-gris-suave">{d.carpeta}</p>}
                </td>
                {!sociedadFija && <td className={`${TD} ${CELDA_SIN_CORTE} text-gris`}>{d.sociedad ? nombreSociedad.get(d.sociedad) : "—"}</td>}
                <td className={`${TD} ${CELDA_SIN_CORTE}`}>
                  <span className={d.emision ? "font-semibold text-tinta" : "text-naranjo"}>{formatearFecha(d.emision)}</span>
                  {d.emision && <p className="text-[11px] text-gris">{antiguedad(d.emision)}</p>}
                </td>
                <td className={`${TD} ${CELDA_SIN_CORTE} text-gris`}>{d.vence ? `Hasta ${formatearFecha(d.vence)}` : "—"}</td>
                <td className={TD}>
                  <ChipEstado estado={d.estado} />
                </td>
                <td className={TD}>
                  <div className="flex justify-end gap-1">
                    <BotonIcono titulo="Ver" onClick={() => ver(d)}>
                      <IconEye size={17} stroke={1.75} />
                    </BotonIcono>
                    <a href={`/api/repositorio-legal/archivo/${d.id}`} title="Descargar" className="grid h-8 w-8 place-items-center rounded-lg text-gris hover:bg-tinta/[0.05] hover:text-tinta">
                      <IconDownload size={17} stroke={1.75} />
                    </a>
                    {permisos.editar && (
                      <>
                        <BotonIcono titulo="Renovar (subir versión nueva)" onClick={() => setRenovar(d)} tono={d.estado === "vencido" || d.estado === "por_vencer" ? "naranjo" : undefined}>
                          <IconRefresh size={17} stroke={1.75} />
                        </BotonIcono>
                        <BotonIcono titulo="Renombrar" onClick={() => pedirRenombre(d)} deshabilitado={pendiente}>
                          <IconPencil size={17} stroke={1.75} />
                        </BotonIcono>
                        <BotonIcono
                          titulo="Mover"
                          onClick={() => {
                            setMoviendo(d);
                            setDestino(d.carpeta);
                          }}
                        >
                          <IconArrowsMove size={17} stroke={1.75} />
                        </BotonIcono>
                        <BotonIcono titulo="Eliminar" onClick={() => pedirEliminar(d)} deshabilitado={pendiente} tono="alerta">
                          <IconTrash size={17} stroke={1.75} />
                        </BotonIcono>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      )}
      <p className="text-xs text-gris">{filas.length} documentos{!conCopias ? " (sin contar copias repetidas)" : ""}.</p>

      {subir && <SubirDocumento abierta alCerrar={() => setSubir(false)} sociedades={sociedades} sociedadInicial={sociedadFija ?? (sociedad !== "todas" && sociedad !== "sin" ? sociedad : null)} />}
      {renovar && <SubirDocumento abierta alCerrar={() => setRenovar(null)} sociedades={sociedades} reemplaza={renovar} />}

      <VentanaModal abierta={Boolean(visor)} alCerrar={() => setVisor(null)} titulo={visor?.doc.nombre ?? ""} descripcion={visor ? `${visor.doc.tipoNombre} · emitido ${formatearFecha(visor.doc.emision)}` : undefined} ancho="max-w-5xl">
        {visor && (visor.url === null ? <p className="py-16 text-center text-gris">Abriendo…</p> : visor.url ? <iframe src={visor.url} className="h-[72vh] w-full rounded-lg border border-borde" title={visor.doc.nombre} /> : <p className="py-10 text-center text-gris">SharePoint no tiene vista previa para este archivo. <a className="font-semibold text-naranjo" href={`/api/repositorio-legal/archivo/${visor.doc.id}`}>Descárgalo</a>.</p>)}
      </VentanaModal>

      <VentanaModal abierta={Boolean(moviendo)} alCerrar={() => setMoviendo(null)} titulo="Mover documento" descripcion={moviendo?.nombre}>
        <div className="space-y-4">
          <select className={CAMPO} value={destino} onChange={(e) => setDestino(e.target.value)}>
            {carpetasDestino.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <div className="flex justify-end">
            <button
              type="button"
              className={BOTON_PRIMARIO}
              disabled={pendiente}
              onClick={() => {
                const d = moviendo;
                setMoviendo(null);
                if (d && destino && destino !== d.carpeta) accion(() => moverDocumento(d.id, destino));
              }}
            >
              <IconArrowsMove size={17} stroke={1.75} /> Mover
            </button>
          </div>
        </div>
      </VentanaModal>
    </div>
  );
}

function BotonIcono({ titulo, onClick, children, tono, deshabilitado }: { titulo: string; onClick: () => void; children: React.ReactNode; tono?: "alerta" | "naranjo"; deshabilitado?: boolean }) {
  const color = tono === "alerta" ? "hover:text-alerta" : tono === "naranjo" ? "text-naranjo" : "hover:text-tinta";
  return (
    <button type="button" title={titulo} aria-label={titulo} disabled={deshabilitado} onClick={onClick} className={`grid h-8 w-8 place-items-center rounded-lg text-gris transition hover:bg-tinta/[0.05] disabled:opacity-40 ${color}`}>
      {children}
    </button>
  );
}

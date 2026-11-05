"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { IconCamera, IconCertificate, IconFileCheck, IconPencil, IconPlus, IconUpload, IconX } from "@tabler/icons-react";
import VentanaModal from "@/components/inventario/VentanaModal";
import BotonGuardar from "@/components/inventario/BotonGuardar";
import { ESTILO_ESTADO_OPERATIVO, FichaProducto, tonoDeTexto } from "@/components/inventario/Visual";
import { CAMPO } from "@/lib/estilos";
import { leerRespuesta } from "@/lib/subidas";
import {
  ETIQUETA_ESTADO_OPERATIVO,
  ETIQUETA_METODO_COSTO,
  ETIQUETA_SEGUIMIENTO,
  ETIQUETA_TIPO_PRODUCTO,
  MAX_FOTOS_PRODUCTO,
  TIPOS_CERTIFICADO,
  TIPOS_FOTO_PRODUCTO,
  type Categoria,
  type EstadoOperativo,
  type MetodoCosto,
  type Producto,
  type Seguimiento,
  type TipoProducto,
  type Ubicacion,
  type Unidad,
} from "@/lib/inventario-modelo";
import {
  actualizarProductoAction,
  crearProductoAction,
  quitarCertificadoAction,
  referenciasHistoricasAction,
  verCertificadoAction,
} from "@/app/(protegido)/inventario/acciones";
import { REFERENCIAS_VACIAS, type ReferenciasHistoricas } from "@/lib/valorizacion-historica-modelo";
import CampoReferencia from "@/components/inventario/CampoReferencia";

const AYUDA_TIPO: Record<TipoProducto, string> = {
  almacenable: "Lleva stock por bodega",
  consumible: "Se gasta, sin control fino",
  servicio: "No ocupa bodega",
};

export default function FormularioProducto({
  categorias,
  unidades,
  ubicaciones,
  producto,
}: {
  categorias: Categoria[];
  unidades: Unidad[];
  /** Para elegir la bodega: se muestran solo las internas. */
  ubicaciones: Ubicacion[];
  producto?: Producto;
}) {
  const editar = Boolean(producto);
  const [abierta, setAbierta] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();
  const [requiere, setRequiere] = useState(producto?.requiereCertificacion ?? false);
  const [certificado, setCertificado] = useState<File | null>(null);
  const [tieneCert, setTieneCert] = useState(producto?.tieneCertificado ?? false);
  // Fotos elegidas en esta ventana: se suben a SharePoint al guardar (ver /api/inventario/fotos).
  const [fotos, setFotos] = useState<File[]>([]);
  const entradaFotos = useRef<HTMLInputElement>(null);
  const caben = MAX_FOTOS_PRODUCTO - (producto?.cantidadFotos ?? 0);
  const vistas = useMemo(() => fotos.map((f) => URL.createObjectURL(f)), [fotos]);
  useEffect(() => () => vistas.forEach((u) => URL.revokeObjectURL(u)), [vistas]);
  const [nombre, setNombre] = useState(producto?.nombre ?? "");
  const [sku, setSku] = useState(producto?.sku ?? "");
  const [marca, setMarca] = useState(producto?.marca ?? "");
  // Los nombres y marcas del histórico de compras: se piden una vez, al abrir el formulario.
  const [referencias, setReferencias] = useState<ReferenciasHistoricas | null>(null);
  const [cargandoReferencias, setCargandoReferencias] = useState(false);
  const [categoriaId, setCategoriaId] = useState(producto?.categoriaId ?? "");
  const [tipo, setTipo] = useState<TipoProducto>(producto?.tipo ?? "almacenable");
  const [estado, setEstado] = useState<EstadoOperativo>(producto?.estadoOperativo ?? "operativo");
  const router = useRouter();
  const bodegas = ubicaciones.filter((u) => u.tipo === "interna");
  const nombreCategoria = categorias.find((c) => c.id === categoriaId)?.nombre ?? null;

  function abrir() {
    setRequiere(producto?.requiereCertificacion ?? false);
    setCertificado(null);
    setFotos([]);
    setTieneCert(producto?.tieneCertificado ?? false);
    setNombre(producto?.nombre ?? "");
    setSku(producto?.sku ?? "");
    setMarca(producto?.marca ?? "");
    if (!referencias && !cargandoReferencias) {
      setCargandoReferencias(true);
      referenciasHistoricasAction()
        .then(setReferencias)
        .catch(() => setReferencias(REFERENCIAS_VACIAS))
        .finally(() => setCargandoReferencias(false));
    }
    setCategoriaId(producto?.categoriaId ?? "");
    setTipo(producto?.tipo ?? "almacenable");
    setEstado(producto?.estadoOperativo ?? "operativo");
    setError(null);
    setAbierta(true);
  }

  function elegirCertificado(f: File | undefined) {
    if (!f) return;
    if (!Object.hasOwn(TIPOS_CERTIFICADO, f.type)) return setError(`"${f.name}" no se acepta: sube un PDF o una imagen.`);
    if (f.size > 4 * 1024 * 1024) return setError(`"${f.name}" pasa el tope de 4 MB.`);
    setError(null);
    setCertificado(f);
  }

  function elegirFotos(lista: FileList | null) {
    const nuevas = Array.from(lista ?? []);
    if (entradaFotos.current) entradaFotos.current.value = "";
    const malas = nuevas.filter((f) => !Object.hasOwn(TIPOS_FOTO_PRODUCTO, f.type) || f.size > 4 * 1024 * 1024);
    if (malas.length) setError(`${malas.map((f) => `"${f.name}"`).join(", ")}: sube fotos JPG, PNG, WEBP o HEIC de hasta 4 MB.`);
    else setError(null);
    setFotos((antes) => [...antes, ...nuevas.filter((f) => !malas.includes(f))].slice(0, Math.max(0, caben)));
  }

  function enviar(fd: FormData) {
    setError(null);
    fd.set("requiereCertificacion", requiere ? "si" : "no");
    iniciar(async () => {
      const r = editar ? await actualizarProductoAction(producto!.id, fd) : await crearProductoAction(fd);
      if (!r.ok) return setError(r.error);
      const id = editar ? producto!.id : r.id;
      // El documento va aparte (por tamaño). Si falla, el producto ya quedó guardado y se avisa.
      if (requiere && certificado && id) {
        try {
          const datos = new FormData();
          datos.set("productoId", id);
          datos.set("archivo", certificado);
          await leerRespuesta(await fetch("/api/inventario/certificado", { method: "POST", body: datos }));
        } catch (e) {
          router.refresh();
          return setError(`El producto se guardó, pero el certificado no se pudo subir: ${e instanceof Error ? e.message : "error"}`);
        }
      }
      // Las fotos, de a una (cada una puede pesar hasta 4 MB). Si alguna falla, el producto ya quedó.
      const fallas: string[] = [];
      for (const foto of id ? fotos : []) {
        try {
          const datos = new FormData();
          datos.set("productoId", id!);
          datos.set("archivo", foto);
          await leerRespuesta(await fetch("/api/inventario/fotos", { method: "POST", body: datos }));
        } catch (e) {
          fallas.push(e instanceof Error ? e.message : `${foto.name}: no se pudo subir.`);
        }
      }
      if (fallas.length) {
        router.refresh();
        return setError(`El producto se guardó, pero ${fallas.length === 1 ? "una foto no se pudo subir" : "algunas fotos no se pudieron subir"}: ${fallas.join(" ")}`);
      }
      setAbierta(false);
      router.refresh();
    });
  }

  async function verCertificado() {
    const r = await verCertificadoAction(producto!.id);
    if (r.ok) window.open(r.url, "_blank", "noopener");
    else setError(r.error);
  }

  function quitarCertificado() {
    if (!confirm("¿Quitar el certificado subido?")) return;
    iniciar(async () => {
      const r = await quitarCertificadoAction(producto!.id);
      if (r.ok) {
        setTieneCert(false);
        router.refresh();
      } else setError(r.error);
    });
  }

  return (
    <>
      <button
        onClick={abrir}
        className={
          editar
            ? "inline-flex items-center gap-1.5 rounded-lg border border-borde px-3 py-2 text-sm font-semibold text-azul transition hover:border-cian"
            : "inline-flex items-center gap-1.5 rounded-lg bg-naranjo px-3.5 py-2.5 text-xs font-bold uppercase tracking-wide text-white shadow-sm transition hover:bg-naranjo-suave"
        }
      >
        {editar ? <IconPencil size={16} /> : <IconPlus size={16} />}
        {editar ? "Editar" : "Nuevo producto"}
      </button>

      <VentanaModal
        abierta={abierta}
        alCerrar={() => setAbierta(false)}
        titulo={editar ? "Editar producto" : "Nuevo producto"}
        descripcion="Solo el nombre es obligatorio. El resto lo puedes completar después."
        ancho="max-w-4xl"
      >
        <form action={enviar} className="grid gap-6 lg:grid-cols-[minmax(0,15rem)_minmax(0,1fr)]">
          {/* Vista previa: cómo se va a ver en la lista mientras se completa. */}
          <aside className="space-y-4 lg:sticky lg:top-0 lg:self-start">
            <div className="banda-contraste rounded-2xl p-5">
              <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-naranjo">Vista previa</span>
              <div className="mt-4 flex items-center gap-3">
                <FichaProducto nombre={nombre || "?"} categoria={nombreCategoria} foto={vistas[0]} />
                <div className="min-w-0">
                  <p className="texto-banda truncate text-sm font-bold">{nombre || "Nombre del producto"}</p>
                  <p className="texto-banda-65 truncate text-xs">{[marca.trim(), sku || "Sin código"].filter(Boolean).join(" · ")}</p>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-1.5">
                <span className="rounded-full bg-naranjo/20 px-2.5 py-1 text-[11px] font-semibold text-naranjo">{ETIQUETA_TIPO_PRODUCTO[tipo]}</span>
                {nombreCategoria && <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${tonoDeTexto(nombreCategoria)}`}>{nombreCategoria}</span>}
                <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${ESTILO_ESTADO_OPERATIVO[estado]}`}>{ETIQUETA_ESTADO_OPERATIVO[estado]}</span>
                {requiere && <span className="rounded-full bg-amber-500/20 px-2.5 py-1 text-[11px] font-semibold text-amber-600">Certificado</span>}
              </div>
            </div>
            <ol className="hidden space-y-2 text-xs text-gris lg:block">
              {["Datos básicos", "Dónde y cómo se guarda", "Costos", "Certificación"].map((t, i) => (
                <li key={t} className="flex items-center gap-2">
                  <span className="grid h-5 w-5 place-items-center rounded-full bg-naranjo/12 text-[10px] font-bold text-naranjo">{i + 1}</span>
                  {t}
                </li>
              ))}
            </ol>
          </aside>

          <div className="space-y-6">
            <Seccion n={1} titulo="Datos básicos">
              <Campo etiqueta="Nombre" obligatorio>
                <CampoReferencia
                  name="nombre"
                  valor={nombre}
                  alCambiar={setNombre}
                  referencias={referencias?.nombres ?? []}
                  cargando={cargandoReferencias}
                  placeholder="Ej: Casco de seguridad"
                  required
                  autoFocus
                />
              </Campo>
              <div className="grid gap-4 sm:grid-cols-2">
                <Campo etiqueta="Marca">
                  {producto?.marca && <input type="hidden" name="marcaPrevia" value="si" />}
                  <CampoReferencia
                    name="marca"
                    valor={marca}
                    alCambiar={setMarca}
                    referencias={referencias?.marcas ?? []}
                    cargando={cargandoReferencias}
                    placeholder="Ej: 3M, Makita"
                    maximo={80}
                  />
                </Campo>
                <Campo etiqueta="SKU / código" ayuda="Para buscarlo rápido">
                  <input name="sku" value={sku} onChange={(e) => setSku(e.target.value)} className={CAMPO} placeholder="EPP-001" />
                </Campo>
              </div>
              <div>
                <Campo etiqueta="Categoría">
                  <select name="categoriaId" value={categoriaId} onChange={(e) => setCategoriaId(e.target.value)} className={CAMPO}>
                    <option value="">— Sin categoría —</option>
                    {categorias.map((c) => (
                      <option key={c.id} value={c.id}>{c.nombre}</option>
                    ))}
                  </select>
                </Campo>
              </div>
              <div>
                <span className="mb-1 flex items-baseline gap-1.5 text-xs font-semibold text-gris">
                  Fotos
                  <span className="font-normal text-gris-suave">
                    · Opcional{editar && producto!.cantidadFotos > 0 ? `, se suman a las ${producto!.cantidadFotos} que ya tiene` : `, hasta ${MAX_FOTOS_PRODUCTO}`}
                  </span>
                </span>
                <div className="flex flex-wrap items-center gap-2">
                  {vistas.map((u, i) => (
                    <span key={u} className="group relative h-14 w-14 overflow-hidden rounded-lg bg-tinta/[0.04] ring-1 ring-borde">
                      {/* eslint-disable-next-line @next/next/no-img-element -- vista previa local, todavía no subida */}
                      <img src={u} alt={fotos[i]?.name ?? ""} className="h-full w-full object-cover opacity-90 saturate-[.85]" />
                      <button
                        type="button"
                        onClick={() => setFotos((xs) => xs.filter((_, j) => j !== i))}
                        aria-label={`Quitar ${fotos[i]?.name ?? "foto"}`}
                        className="absolute right-0.5 top-0.5 grid h-5 w-5 place-items-center rounded-full bg-superficie/90 text-gris shadow-sm transition hover:text-rose-600"
                      >
                        <IconX size={12} />
                      </button>
                    </span>
                  ))}
                  {fotos.length < caben && (
                    <button
                      type="button"
                      onClick={() => entradaFotos.current?.click()}
                      className="inline-flex h-14 items-center gap-1.5 rounded-lg border border-dashed border-borde px-3.5 text-xs font-semibold text-gris transition hover:border-gris-suave hover:text-tinta"
                    >
                      <IconCamera size={16} stroke={1.8} />
                      {fotos.length ? "Agregar más" : "Agregar fotos"}
                    </button>
                  )}
                  {caben <= 0 && <span className="text-xs text-gris">Ya tiene {MAX_FOTOS_PRODUCTO} fotos, el máximo.</span>}
                  <input ref={entradaFotos} type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" multiple className="sr-only" onChange={(e) => elegirFotos(e.target.files)} />
                </div>
              </div>
              <div>
                <span className="mb-1.5 block text-xs font-semibold text-gris">¿Qué tipo de producto es?</span>
                <div className="grid gap-2 sm:grid-cols-3">
                  {(Object.keys(ETIQUETA_TIPO_PRODUCTO) as TipoProducto[]).map((t) => (
                    <label
                      key={t}
                      className={`cursor-pointer rounded-xl border p-3 transition ${tipo === t ? "border-naranjo bg-naranjo/[0.06] ring-2 ring-naranjo/15" : "border-borde hover:border-naranjo/40"}`}
                    >
                      <input type="radio" name="tipo" value={t} checked={tipo === t} onChange={() => setTipo(t)} className="sr-only" />
                      <span className="block text-sm font-bold text-tinta">{ETIQUETA_TIPO_PRODUCTO[t]}</span>
                      <span className="block text-[11px] leading-snug text-gris">{AYUDA_TIPO[t]}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <span className="mb-1.5 block text-xs font-semibold text-gris">Estado</span>
                <div className="grid gap-2 sm:grid-cols-2">
                  {(Object.keys(ETIQUETA_ESTADO_OPERATIVO) as EstadoOperativo[]).map((e) => (
                    <label
                      key={e}
                      className={`flex cursor-pointer items-center gap-2.5 rounded-xl border p-3 transition ${
                        estado === e ? (e === "operativo" ? "border-emerald-500 bg-emerald-500/[0.06] ring-2 ring-emerald-500/15" : "border-rose-500 bg-rose-500/[0.06] ring-2 ring-rose-500/15") : "border-borde hover:border-naranjo/40"
                      }`}
                    >
                      <input type="radio" name="estadoOperativo" value={e} checked={estado === e} onChange={() => setEstado(e)} className="sr-only" />
                      <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${e === "operativo" ? "bg-emerald-500" : "bg-rose-500"}`} />
                      <span>
                        <span className="block text-sm font-bold text-tinta">{ETIQUETA_ESTADO_OPERATIVO[e]}</span>
                        <span className="block text-[11px] leading-snug text-gris">{e === "operativo" ? "En condiciones de usarse" : "En reparación, dañado o fuera de servicio"}</span>
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            </Seccion>

            {/* Un servicio no ocupa bodega: se oculta, pero los campos se siguen enviando tal cual. */}
            <div className={tipo === "servicio" ? "hidden" : undefined}>
              <Seccion n={2} titulo="Dónde y cómo se guarda">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Campo etiqueta="Bodega">
                    <select name="ubicacionId" defaultValue={producto?.ubicacionId ?? ""} className={CAMPO}>
                      <option value="">— Sin bodega asignada —</option>
                      {bodegas.map((u) => (
                        <option key={u.id} value={u.id}>{u.nombre}{u.codigo ? ` (${u.codigo})` : ""}</option>
                      ))}
                    </select>
                  </Campo>
                  <Campo etiqueta="Unidad de medida">
                    <select name="unidadId" defaultValue={producto?.unidadId ?? ""} className={CAMPO}>
                      <option value="">— Sin unidad —</option>
                      {unidades.map((u) => (
                        <option key={u.id} value={u.id}>{u.nombre} ({u.abreviacion})</option>
                      ))}
                    </select>
                  </Campo>
                  <Campo etiqueta="Seguimiento" ayuda="Lote o serie si necesitas trazabilidad">
                    <select name="seguimiento" defaultValue={producto?.seguimiento ?? "ninguno"} className={CAMPO}>
                      {(Object.keys(ETIQUETA_SEGUIMIENTO) as Seguimiento[]).map((x) => (
                        <option key={x} value={x}>{ETIQUETA_SEGUIMIENTO[x]}</option>
                      ))}
                    </select>
                  </Campo>
                  <Campo etiqueta="Vencimiento del producto" ayuda="Opcional">
                    <input name="fechaVencimiento" type="date" defaultValue={producto?.fechaVencimiento ?? ""} className={CAMPO} />
                  </Campo>
                </div>
              </Seccion>
            </div>

            <Seccion n={tipo !== "servicio" ? 3 : 2} titulo="Costos">
              <div className="grid gap-4 sm:grid-cols-3">
                <Campo etiqueta="Costo">
                  <Pesos name="costo" valor={producto?.costo ?? 0} />
                </Campo>
                <Campo etiqueta="Precio de venta">
                  <Pesos name="precio" valor={producto?.precio ?? 0} />
                </Campo>
                <Campo etiqueta="Método de costo">
                  <select name="metodoCosto" defaultValue={producto?.metodoCosto ?? "promedio"} className={CAMPO}>
                    {(Object.keys(ETIQUETA_METODO_COSTO) as MetodoCosto[]).map((m) => (
                      <option key={m} value={m}>{ETIQUETA_METODO_COSTO[m]}</option>
                    ))}
                  </select>
                </Campo>
              </div>
            </Seccion>

            <Seccion n={tipo !== "servicio" ? 4 : 3} titulo="Certificación y notas">
              {/* Certificación: al activarla aparecen el documento y su vencimiento. */}
              <section className={`rounded-xl border p-4 transition ${requiere ? "border-naranjo/40 bg-naranjo/[0.04]" : "border-borde"}`}>
                <div className="flex items-start gap-3">
                  <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${requiere ? "bg-naranjo/10 text-naranjo" : "bg-tinta/[0.05] text-gris"}`}>
                    <IconCertificate size={19} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-tinta">Requiere certificación</p>
                    <p className="text-xs text-gris">
                      {requiere ? "Sube el certificado y su fecha de vencimiento. Sin documento, el producto queda marcado." : "Actívalo si este producto necesita un certificado vigente."}
                    </p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={requiere}
                    aria-label="Requiere certificación"
                    onClick={() => setRequiere((v) => !v)}
                    className={`relative mt-1 h-6 w-11 shrink-0 rounded-full transition ${requiere ? "bg-naranjo" : "bg-borde"}`}
                  >
                    <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${requiere ? "left-[22px]" : "left-0.5"}`} />
                  </button>
                </div>

                {requiere && (
                  <div className="mt-4 grid gap-4 sm:grid-cols-2">
                    <div>
                      <span className="mb-1 block text-xs font-semibold text-gris">Documento del certificado</span>
                      {certificado ? (
                        <div className="flex min-h-11 items-center gap-2 rounded-lg border border-borde bg-superficie px-3 text-sm">
                          <IconFileCheck size={16} className="shrink-0 text-emerald-600" />
                          <span className="min-w-0 flex-1 truncate text-tinta">{certificado.name}</span>
                          <button type="button" onClick={() => setCertificado(null)} className="text-gris hover:text-rose-600" aria-label="Quitar archivo elegido">
                            <IconX size={15} />
                          </button>
                        </div>
                      ) : tieneCert ? (
                        <div className="flex min-h-11 items-center gap-2 rounded-lg border border-borde bg-superficie px-3 text-sm">
                          <IconFileCheck size={16} className="shrink-0 text-emerald-600" />
                          <button type="button" onClick={verCertificado} className="min-w-0 flex-1 truncate text-left font-semibold text-cian hover:underline">
                            {producto?.certificadoNombre ?? "Ver certificado"}
                          </button>
                          <label className="cursor-pointer text-xs font-semibold text-gris hover:text-tinta">
                            Reemplazar
                            <input type="file" accept=".pdf,image/png,image/jpeg,image/webp" className="sr-only" onChange={(e) => elegirCertificado(e.target.files?.[0])} />
                          </label>
                          <button type="button" onClick={quitarCertificado} className="text-gris hover:text-rose-600" aria-label="Quitar certificado">
                            <IconX size={15} />
                          </button>
                        </div>
                      ) : (
                        <label className="flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-lg border-2 border-dashed border-naranjo/40 px-3 text-sm font-semibold text-naranjo transition hover:bg-naranjo/[0.05]">
                          <IconUpload size={16} /> Subir PDF o imagen
                          <input type="file" accept=".pdf,image/png,image/jpeg,image/webp" className="sr-only" onChange={(e) => elegirCertificado(e.target.files?.[0])} />
                        </label>
                      )}
                    </div>
                    <Campo etiqueta="Vencimiento del certificado">
                      <input name="certificadoVence" type="date" defaultValue={producto?.certificadoVence ?? ""} className={CAMPO} />
                    </Campo>
                  </div>
                )}
              </section>
              <Campo etiqueta="Descripción" ayuda="Opcional">
                <textarea name="descripcion" rows={2} defaultValue={producto?.descripcion ?? ""} className={CAMPO} placeholder="Talla, marca, norma, observaciones…" />
              </Campo>
            </Seccion>

            {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">{error}</p>}

            <div className="flex items-center justify-end gap-2 border-t border-borde pt-4">
              <button type="button" onClick={() => setAbierta(false)} className="rounded-lg border border-borde px-4 py-2.5 text-xs font-bold uppercase tracking-wide text-gris transition hover:text-tinta">
                Cancelar
              </button>
              <BotonGuardar pendiente={pendiente}>{editar ? "Guardar cambios" : "Crear producto"}</BotonGuardar>
            </div>
          </div>
        </form>
      </VentanaModal>
    </>
  );
}

function Seccion({ n, titulo, children }: { n: number; titulo: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4">
      <h3 className="flex items-center gap-2.5 text-sm font-bold text-tinta">
        <span className="grid h-6 w-6 place-items-center rounded-full bg-naranjo text-[11px] font-bold text-white">{n}</span>
        {titulo}
        <span className="h-px flex-1 bg-borde" />
      </h3>
      {children}
    </section>
  );
}

/** Un monto en pesos, con el signo dentro del campo. */
function Pesos({ name, valor }: { name: string; valor: number }) {
  return (
    <span className="relative block">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gris">$</span>
      <input name={name} type="number" min="0" step="1" defaultValue={valor} className={`${CAMPO} pl-7`} />
    </span>
  );
}

function Campo({ etiqueta, obligatorio, ayuda, children }: { etiqueta: string; obligatorio?: boolean; ayuda?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 flex items-baseline gap-1.5 text-xs font-semibold text-gris">
        {etiqueta} {obligatorio && <span className="text-rose-500">*</span>}
        {ayuda && <span className="font-normal text-gris-suave">· {ayuda}</span>}
      </span>
      {children}
    </label>
  );
}

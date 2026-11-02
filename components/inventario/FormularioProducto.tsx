"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { IconCertificate, IconFileCheck, IconPencil, IconPlus, IconUpload, IconX } from "@tabler/icons-react";
import VentanaModal from "@/components/inventario/VentanaModal";
import BotonGuardar from "@/components/inventario/BotonGuardar";
import { CAMPO } from "@/lib/estilos";
import { leerRespuesta } from "@/lib/subidas";
import {
  ETIQUETA_METODO_COSTO,
  ETIQUETA_SEGUIMIENTO,
  ETIQUETA_TIPO_PRODUCTO,
  TIPOS_CERTIFICADO,
  type Categoria,
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
  verCertificadoAction,
} from "@/app/(protegido)/inventario/acciones";

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
  const router = useRouter();
  const bodegas = ubicaciones.filter((u) => u.tipo === "interna");

  function abrir() {
    setRequiere(producto?.requiereCertificacion ?? false);
    setCertificado(null);
    setTieneCert(producto?.tieneCertificado ?? false);
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

      <VentanaModal abierta={abierta} alCerrar={() => setAbierta(false)} titulo={editar ? "Editar producto" : "Nuevo producto"}>
        <form action={enviar} className="space-y-4">
          <Campo etiqueta="Nombre" obligatorio>
            <input name="nombre" required defaultValue={producto?.nombre} className={CAMPO} placeholder="Casco de seguridad" />
          </Campo>

          <div className="grid gap-4 sm:grid-cols-2">
            <Campo etiqueta="SKU / código">
              <input name="sku" defaultValue={producto?.sku ?? ""} className={CAMPO} placeholder="EPP-001" />
            </Campo>
            <Campo etiqueta="Unidad de medida">
              <select name="unidadId" defaultValue={producto?.unidadId ?? ""} className={CAMPO}>
                <option value="">— Sin unidad —</option>
                {unidades.map((u) => (
                  <option key={u.id} value={u.id}>{u.nombre} ({u.abreviacion})</option>
                ))}
              </select>
            </Campo>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Campo etiqueta="Tipo">
              <select name="tipo" defaultValue={producto?.tipo ?? "almacenable"} className={CAMPO}>
                {(Object.keys(ETIQUETA_TIPO_PRODUCTO) as TipoProducto[]).map((t) => (
                  <option key={t} value={t}>{ETIQUETA_TIPO_PRODUCTO[t]}</option>
                ))}
              </select>
            </Campo>
            <Campo etiqueta="Seguimiento">
              <select name="seguimiento" defaultValue={producto?.seguimiento ?? "ninguno"} className={CAMPO}>
                {(Object.keys(ETIQUETA_SEGUIMIENTO) as Seguimiento[]).map((s) => (
                  <option key={s} value={s}>{ETIQUETA_SEGUIMIENTO[s]}</option>
                ))}
              </select>
            </Campo>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Campo etiqueta="Categoría">
              <select name="categoriaId" defaultValue={producto?.categoriaId ?? ""} className={CAMPO}>
                <option value="">— Sin categoría —</option>
                {categorias.map((c) => (
                  <option key={c.id} value={c.id}>{c.nombre}</option>
                ))}
              </select>
            </Campo>
            <div className="grid grid-cols-2 gap-3">
              <Campo etiqueta="Costo ($)">
                <input name="costo" type="number" min="0" step="1" defaultValue={producto?.costo ?? 0} className={CAMPO} />
              </Campo>
              <Campo etiqueta="Precio ($)">
                <input name="precio" type="number" min="0" step="1" defaultValue={producto?.precio ?? 0} className={CAMPO} />
              </Campo>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Campo etiqueta="Bodega">
              <select name="ubicacionId" defaultValue={producto?.ubicacionId ?? ""} className={CAMPO}>
                <option value="">— Sin bodega asignada —</option>
                {bodegas.map((u) => (
                  <option key={u.id} value={u.id}>{u.nombre}{u.codigo ? ` (${u.codigo})` : ""}</option>
                ))}
              </select>
            </Campo>
            <Campo etiqueta="Vencimiento del producto (opcional)">
              <input name="fechaVencimiento" type="date" defaultValue={producto?.fechaVencimiento ?? ""} className={CAMPO} />
            </Campo>
          </div>

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

          <Campo etiqueta="Método de costo">
            <select name="metodoCosto" defaultValue={producto?.metodoCosto ?? "promedio"} className={CAMPO}>
              {(Object.keys(ETIQUETA_METODO_COSTO) as MetodoCosto[]).map((m) => (
                <option key={m} value={m}>{ETIQUETA_METODO_COSTO[m]}</option>
              ))}
            </select>
          </Campo>

          <Campo etiqueta="Descripción">
            <textarea name="descripcion" rows={2} defaultValue={producto?.descripcion ?? ""} className={CAMPO} />
          </Campo>

          {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">{error}</p>}

          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={() => setAbierta(false)} className="rounded-lg border border-borde px-4 py-2.5 text-xs font-bold uppercase tracking-wide text-gris transition hover:text-tinta">
              Cancelar
            </button>
            <BotonGuardar pendiente={pendiente}>{editar ? "Guardar cambios" : "Crear producto"}</BotonGuardar>
          </div>
        </form>
      </VentanaModal>
    </>
  );
}

function Campo({ etiqueta, obligatorio, children }: { etiqueta: string; obligatorio?: boolean; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold text-gris">
        {etiqueta} {obligatorio && <span className="text-rose-500">*</span>}
      </span>
      {children}
    </label>
  );
}

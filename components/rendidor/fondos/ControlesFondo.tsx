"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { IconLoader2, IconPaperclip, IconPlus, IconWallet } from "@tabler/icons-react";
import VentanaModal from "@/components/inventario/VentanaModal";
import { Campo, TarjetaAccion } from "@/components/flota/Campos";
import { CAMPO } from "@/lib/estilos";
import { asignarFondoAction, solicitarFondoAction } from "@/app/(protegido)/rendir-gastos/acciones-fondos";

type Resultado = { ok: true; id?: string } | { ok: false; error: string };

/** El texto de un botón, aunque lleve íconos: sirve de título de la ventana. */
function textoDe(nodo: React.ReactNode): string {
  if (typeof nodo === "string" || typeof nodo === "number") return String(nodo);
  if (Array.isArray(nodo)) return nodo.map(textoDe).join("").trim();
  if (nodo && typeof nodo === "object" && "props" in nodo) return textoDe((nodo as { props: { children?: React.ReactNode } }).props.children);
  return "";
}

/**
 * Un botón que ejecuta una acción del servidor ya «atada» a su fondo o informe. Si hace falta un dato
 * (`pide`: motivo, referencia de la transferencia…), un comprobante (`comprobante`) o una confirmación
 * (`confirma`), abre una ventana del sistema en vez de los cuadros del navegador.
 */
export function BotonAccion({
  accion,
  children,
  pide,
  obligatorio = true,
  confirma,
  comprobante,
  tono = "primario",
}: {
  accion: (texto: string, comprobante?: string) => Promise<Resultado>;
  children: React.ReactNode;
  pide?: string;
  obligatorio?: boolean;
  confirma?: string;
  /** Deja subir el comprobante de la transferencia o depósito (PDF o imagen). */
  comprobante?: { fondoId: string };
  tono?: "primario" | "secundario" | "peligro";
}) {
  const router = useRouter();
  const [pendiente, iniciar] = useTransition();
  const [abierta, setAbierta] = useState(false);
  const [texto, setTexto] = useState("");
  const [archivo, setArchivo] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const clases = {
    primario: "bg-naranjo text-white shadow-sm hover:bg-naranjo-suave",
    secundario: "border border-borde bg-superficie text-tinta hover:border-naranjo/40",
    peligro: "border border-rose-300/60 bg-superficie text-rose-600 hover:bg-rose-500/10",
  }[tono];
  const conVentana = Boolean(pide || confirma || comprobante);
  const titulo = textoDe(children) || "Confirmar";

  const ejecutar = () =>
    iniciar(async () => {
      setError(null);
      if (pide && obligatorio && !texto.trim()) return setError("Falta completar ese dato.");
      let ruta: string | undefined;
      if (comprobante && archivo) {
        const fd = new FormData();
        fd.append("archivo", archivo);
        const resp = await fetch(`/api/rendidor/fondos/${comprobante.fondoId}/comprobante`, { method: "POST", body: fd });
        const cuerpo = (await resp.json().catch(() => ({}))) as { ruta?: string; error?: string };
        if (!resp.ok || !cuerpo.ruta) return setError(cuerpo.error ?? "No pudimos subir el comprobante.");
        ruta = cuerpo.ruta;
      }
      const r = await accion(texto, ruta);
      if (!r.ok) return setError(r.error);
      setAbierta(false);
      setTexto("");
      setArchivo(null);
      router.refresh();
    });

  const largo = Boolean(pide?.startsWith("¿"));
  return (
    <>
      <button
        type="button"
        disabled={pendiente}
        onClick={() => {
          if (conVentana) {
            setError(null);
            setAbierta(true);
          } else ejecutar();
        }}
        className={`inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg px-4 text-sm font-bold transition disabled:opacity-50 ${clases}`}
      >
        {pendiente && !abierta && <IconLoader2 size={15} className="animate-spin" />}
        {children}
      </button>
      {!conVentana && error && <span className="text-xs text-rose-600">{error}</span>}
      <VentanaModal abierta={abierta} alCerrar={() => !pendiente && setAbierta(false)} titulo={titulo} descripcion={confirma} ancho="max-w-md">
        <div className="space-y-4">
          {pide && (
            <label className="block">
              <span className="mb-1 block text-sm font-semibold text-tinta">{pide}</span>
              {largo ? (
                <textarea autoFocus value={texto} onChange={(e) => setTexto(e.target.value)} rows={3} maxLength={1000} className={CAMPO} />
              ) : (
                <input autoFocus value={texto} onChange={(e) => setTexto(e.target.value)} maxLength={120} className={CAMPO} />
              )}
            </label>
          )}
          {comprobante && (
            <div>
              <span className="mb-1 block text-sm font-semibold text-tinta">Comprobante de la transferencia o depósito</span>
              <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-dashed border-borde bg-superficie px-3.5 py-3 transition hover:border-naranjo/60">
                <IconPaperclip size={18} className="shrink-0 text-gris" />
                <span className="min-w-0 flex-1 truncate text-sm text-gris">{archivo ? archivo.name : "Adjuntar PDF o imagen (opcional)"}</span>
                {archivo && (
                  <button type="button" onClick={(e) => { e.preventDefault(); setArchivo(null); }} className="text-xs font-semibold text-gris underline underline-offset-2 hover:text-rose-600">Quitar</button>
                )}
                <input type="file" accept="application/pdf,image/jpeg,image/png,image/webp" onChange={(e) => setArchivo(e.target.files?.[0] ?? null)} className="sr-only" />
              </label>
              <span className="mt-1 block text-[11px] text-gris-suave">Queda guardado en SharePoint y visible en los movimientos del fondo.</span>
            </div>
          )}
          {error && <p className="rounded-lg bg-rose-500/10 px-3 py-2 text-sm text-rose-600">{error}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" disabled={pendiente} onClick={() => setAbierta(false)} className="inline-flex min-h-10 items-center rounded-lg border border-borde px-4 text-sm font-semibold text-gris hover:text-tinta disabled:opacity-50">Cancelar</button>
            <button type="button" disabled={pendiente} onClick={ejecutar} className={`inline-flex min-h-10 items-center gap-2 rounded-lg px-5 text-sm font-bold disabled:opacity-50 ${tono === "peligro" ? "bg-rose-600 text-white hover:bg-rose-700" : "bg-naranjo text-white hover:bg-naranjo-suave"}`}>
              {pendiente && <IconLoader2 size={16} className="animate-spin" />} Confirmar
            </button>
          </div>
        </div>
      </VentanaModal>
    </>
  );
}

function Formulario({ accion, alListo, children, boton }: { accion: (fd: FormData) => Promise<Resultado>; alListo: (id?: string) => void; children: React.ReactNode; boton: string }) {
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();
  return (
    <form
      action={(fd) =>
        iniciar(async () => {
          setError(null);
          const r = await accion(fd);
          if (r.ok) alListo(r.id);
          else setError(r.error);
        })
      }
      className="space-y-4"
    >
      {children}
      {error && <p className="rounded-lg bg-rose-500/10 px-3 py-2 text-sm text-rose-600">{error}</p>}
      <div className="flex justify-end">
        <button type="submit" disabled={pendiente} className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-naranjo px-5 text-sm font-bold text-white shadow-sm disabled:opacity-50">
          {pendiente && <IconLoader2 size={16} className="animate-spin" />} {boton}
        </button>
      </div>
    </form>
  );
}

/** Quien rinde pide un fondo: monto, para qué, centro de costo y fecha estimada. */
export function SolicitarFondo({ comoTarjeta = false }: { comoTarjeta?: boolean }) {
  const router = useRouter();
  const [abierta, setAbierta] = useState(false);
  return (
    <>
      {comoTarjeta ? (
        <TarjetaAccion titulo="Solicitar fondo" detalle="Pide dinero para tus gastos" Icono={IconWallet} tono="bg-emerald-500/10 text-emerald-600" onClick={() => setAbierta(true)} />
      ) : (
        <button onClick={() => setAbierta(true)} className="inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-naranjo px-4 text-sm font-bold text-white shadow-sm">
          <IconWallet size={16} /> Solicitar fondo
        </button>
      )}
      <VentanaModal abierta={abierta} alCerrar={() => setAbierta(false)} titulo="Solicitar un fondo" descripcion="Lo validan, lo asignan y Tesorería lo transfiere. Te avisamos en cada paso." ancho="max-w-lg">
        <Formulario accion={solicitarFondoAction} boton="Enviar solicitud" alListo={(id) => { setAbierta(false); router.push(id ? `/rendir-gastos/fondos/${id}` : "/rendir-gastos?ver=fondos"); }}>
          <Campo etiqueta="Monto que necesitas *">
            <input name="monto" required inputMode="numeric" placeholder="Ej: 300.000" className={CAMPO} />
          </Campo>
          <Campo etiqueta="¿Para qué es? *">
            <textarea name="motivo" required rows={3} maxLength={1000} placeholder="Ej: Viaje a faena Antucoya, combustible y alojamiento" className={CAMPO} />
          </Campo>
          <div className="grid gap-3 sm:grid-cols-2">
            <Campo etiqueta="Centro de costo / proyecto">
              <input name="centroCosto" maxLength={120} className={CAMPO} />
            </Campo>
            <Campo etiqueta="¿Para cuándo?">
              <input name="fechaEstimada" type="date" className={CAMPO} />
            </Campo>
          </div>
        </Formulario>
      </VentanaModal>
    </>
  );
}

/**
 * El asignador crea un fondo: a partir de una solicitud ya validada (fondoId) o directo a nombre
 * de una persona.
 */
export function AsignarFondo({
  personas,
  validado,
  plazoPorOmision,
}: {
  personas: { correo: string; nombre: string }[];
  validado?: { id: string; codigo: string; rendidorNombre: string; montoSolicitado: number | null };
  plazoPorOmision: number;
}) {
  const router = useRouter();
  const [abierta, setAbierta] = useState(false);
  const [fijo, setFijo] = useState(false);
  return (
    <>
      {validado ? (
        <button onClick={() => setAbierta(true)} className="inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-naranjo px-4 text-sm font-bold text-white shadow-sm">
          Asignar
        </button>
      ) : (
        <TarjetaAccion titulo="Asignar fondo" detalle="Directo, sin solicitud" Icono={IconPlus} tono="bg-sky-500/10 text-sky-600" onClick={() => setAbierta(true)} />
      )}
      <VentanaModal
        abierta={abierta}
        alCerrar={() => setAbierta(false)}
        titulo={validado ? `Asignar ${validado.codigo}` : "Asignar un fondo directo"}
        descripcion={validado ? `${validado.rendidorNombre} lo pidió y ya está validado.` : "Se le avisa a la persona y a Tesorería para que lo transfiera."}
        ancho="max-w-lg"
      >
        <Formulario accion={asignarFondoAction} boton="Asignar fondo" alListo={() => { setAbierta(false); router.refresh(); }}>
          {validado ? (
            <input type="hidden" name="fondoId" value={validado.id} />
          ) : (
            <>
              <Campo etiqueta="A quién *">
                <select name="rendidorCorreo" required className={CAMPO} defaultValue="">
                  <option value="">Elige una persona…</option>
                  {personas.map((p) => (
                    <option key={p.correo} value={p.correo}>{p.nombre}</option>
                  ))}
                </select>
              </Campo>
              <Campo etiqueta="¿Para qué es? *">
                <textarea name="motivo" required rows={2} maxLength={1000} className={CAMPO} />
              </Campo>
              <Campo etiqueta="Centro de costo / proyecto">
                <input name="centroCosto" maxLength={120} className={CAMPO} />
              </Campo>
            </>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <Campo etiqueta="Monto autorizado *">
              <input name="monto" required inputMode="numeric" defaultValue={validado?.montoSolicitado ?? ""} className={CAMPO} />
            </Campo>
            <Campo etiqueta="Días para rendir">
              <input name="plazoDias" type="number" min={1} max={365} defaultValue={plazoPorOmision} className={CAMPO} />
            </Campo>
          </div>
          <label className="flex items-start gap-3 rounded-xl border border-borde p-3">
            <input type="checkbox" name="esFijo" value="si" checked={fijo} onChange={(e) => setFijo(e.target.checked)} className="mt-1 h-4 w-4 accent-[var(--color-naranjo)]" />
            <span className="text-sm">
              <b className="text-tinta">Fondo fijo</b>
              <span className="block text-xs text-gris">Monto constante: al rendir puede quedar saldo a favor y la reposición transfiere solo la diferencia.</span>
            </span>
          </label>
        </Formulario>
      </VentanaModal>
    </>
  );
}

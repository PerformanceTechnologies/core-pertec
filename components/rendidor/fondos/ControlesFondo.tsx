"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { IconLoader2, IconPlus, IconWallet } from "@tabler/icons-react";
import VentanaModal from "@/components/inventario/VentanaModal";
import { Campo, TarjetaAccion } from "@/components/flota/Campos";
import { CAMPO } from "@/lib/estilos";
import { asignarFondoAction, solicitarFondoAction } from "@/app/(protegido)/rendir-gastos/acciones-fondos";

type Resultado = { ok: true; id?: string } | { ok: false; error: string };

/**
 * Un botón que ejecuta una acción del servidor ya «atada» a su fondo o informe. Si `pide` viene,
 * pregunta un texto antes (motivo, referencia de la transferencia…); si `confirma`, pide confirmar.
 */
export function BotonAccion({
  accion,
  children,
  pide,
  obligatorio = true,
  confirma,
  tono = "primario",
}: {
  accion: (texto: string) => Promise<Resultado>;
  children: React.ReactNode;
  pide?: string;
  obligatorio?: boolean;
  confirma?: string;
  tono?: "primario" | "secundario" | "peligro";
}) {
  const router = useRouter();
  const [pendiente, iniciar] = useTransition();
  const clases = {
    primario: "bg-naranjo text-white shadow-sm hover:bg-naranjo-suave",
    secundario: "border border-borde bg-superficie text-tinta hover:border-naranjo/40",
    peligro: "border border-rose-300/60 bg-superficie text-rose-600 hover:bg-rose-500/10",
  }[tono];
  return (
    <button
      type="button"
      disabled={pendiente}
      onClick={() => {
        let texto = "";
        if (pide) {
          const t = prompt(pide);
          if (t === null) return;
          if (obligatorio && !t.trim()) return alert("Falta completar ese dato.");
          texto = t;
        }
        if (confirma && !confirm(confirma)) return;
        iniciar(async () => {
          const r = await accion(texto);
          if (!r.ok) alert(r.error);
          else router.refresh();
        });
      }}
      className={`inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg px-4 text-sm font-bold transition disabled:opacity-50 ${clases}`}
    >
      {pendiente && <IconLoader2 size={15} className="animate-spin" />}
      {children}
    </button>
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

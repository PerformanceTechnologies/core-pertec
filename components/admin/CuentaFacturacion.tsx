"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { IconLoader2, IconLock, IconPlugConnected, IconTrash } from "@tabler/icons-react";
import { FormAccion, Campo } from "@/components/fin/ui";
import { BOTON, BOTON_SEC, CAMPO } from "@/components/fin/estilos";
import { confirmar } from "@/components/fin/dialogos";
import { cambiarEmisionAction, guardarCarpetaAction, guardarCuentaAction, probarCuentaAction, quitarCuentaAction } from "@/app/(protegido)/integraciones/acciones";

type Res = { ok: true; mensaje?: string } | { ok: false; error: string };

export interface EstadoVista {
  cargada: boolean;
  metodo: "usuario" | "token" | null;
  ambiente: "certificacion" | "produccion";
  rutEmisorPrueba: string | null;
  emisionHabilitada: boolean;
  carpetaSp: string | null;
  carpetaPorOmision: string;
  probadoOk: boolean | null;
}

function Mensaje({ r }: { r: Res | null }) {
  if (!r) return null;
  return <p className={`rounded-lg px-3 py-2 text-[12px] ${r.ok ? "bg-emerald-500/10 text-ok" : "bg-rose-500/10 text-alerta"}`}>{r.ok ? r.mensaje : r.error}</p>;
}

/** Un botón que llama a una acción, pide confirmación si corresponde y muestra el resultado. */
function Boton({ accion, children, clase = BOTON_SEC, pregunta }: { accion: () => Promise<Res>; children: React.ReactNode; clase?: string; pregunta?: string }) {
  const router = useRouter();
  const [pendiente, iniciar] = useTransition();
  const [r, setR] = useState<Res | null>(null);
  return (
    <div className="space-y-2">
      <button
        type="button"
        disabled={pendiente}
        className={clase}
        onClick={async () => {
          if (pregunta && !(await confirmar({ titulo: pregunta }))) return;
          iniciar(async () => {
            const x = await accion();
            setR(x);
            router.refresh();
          });
        }}
      >
        {pendiente && <IconLoader2 size={14} className="animate-spin" />} {children}
      </button>
      <Mensaje r={r} />
    </div>
  );
}

export function FormularioCuenta({ e }: { e: EstadoVista }) {
  const [metodo, setMetodo] = useState<"usuario" | "token">(e.metodo ?? "usuario");
  const [ambiente, setAmbiente] = useState(e.ambiente);
  const [r, setR] = useState<Res | null>(null);
  return (
    <div className="space-y-3">
      <FormAccion accion={guardarCuentaAction} textoBoton={e.cargada ? "Guardar cambios y probar" : "Guardar cuenta y probar"} alOk={(x) => setR(x)} limpiar>
        <input type="hidden" name="metodo" value={metodo} />
        <div className="flex flex-wrap gap-2 text-[13px]">
          {(["usuario", "token"] as const).map((m) => (
            <button key={m} type="button" onClick={() => setMetodo(m)} className={`rounded-full px-3 py-1.5 font-semibold ${metodo === m ? "bg-tinta text-white" : "bg-tinta/[0.05] text-tinta/70"}`}>
              {m === "usuario" ? "Usuario y clave" : "Token de integración"}
            </button>
          ))}
        </div>
        {metodo === "usuario" ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <Campo etiqueta="Usuario (correo) de SimpleFactura"><input name="email" type="email" autoComplete="off" placeholder={e.metodo === "usuario" ? "•••••• (guardado)" : ""} className={CAMPO} /></Campo>
            <Campo etiqueta="Clave"><input name="password" type="password" autoComplete="new-password" placeholder={e.metodo === "usuario" ? "•••••• (guardada)" : ""} className={CAMPO} /></Campo>
          </div>
        ) : (
          <Campo etiqueta="Token de integración" ayuda="Se crea en developers.simplefactura.cl y dura un año.">
            <textarea name="token" rows={3} autoComplete="off" placeholder={e.metodo === "token" ? "•••••• (guardado)" : ""} className={`${CAMPO} font-mono text-[12px]`} />
          </Campo>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo etiqueta="Ambiente">
            <select name="ambiente" value={ambiente} onChange={(x) => setAmbiente(x.target.value as typeof ambiente)} className={CAMPO}>
              <option value="certificacion">Pruebas (certificación)</option>
              <option value="produccion">Producción (documentos reales ante el SII)</option>
            </select>
          </Campo>
          {ambiente === "certificacion" && (
            <Campo etiqueta="RUT emisor de prueba (opcional)" ayuda="Solo para la cuenta demo de SimpleFactura. Vacío = el RUT de la empresa.">
              <input name="rutPrueba" defaultValue={e.rutEmisorPrueba ?? ""} className={CAMPO} />
            </Campo>
          )}
        </div>
        <p className="flex items-start gap-1.5 text-[11px] leading-snug text-gris">
          <IconLock size={13} className="mt-px shrink-0" /> Se guarda cifrado y no se vuelve a mostrar. Si dejas los campos vacíos se conserva lo guardado. Cambiar la cuenta o el ambiente deshabilita la emisión hasta volver a probar y habilitar.
        </p>
      </FormAccion>
      <Mensaje r={r} />
    </div>
  );
}

export function AccionesCuenta({ e }: { e: EstadoVista }) {
  if (!e.cargada) return null;
  return (
    <div className="flex flex-wrap items-start gap-3">
      <Boton accion={probarCuentaAction}>
        <IconPlugConnected size={14} /> Probar conexión
      </Boton>
      <Boton accion={quitarCuentaAction} pregunta="¿Quitar la cuenta de SimpleFactura de esta empresa? La emisión queda deshabilitada.">
        <IconTrash size={14} /> Quitar cuenta
      </Boton>
    </div>
  );
}

export function InterruptorEmision({ e }: { e: EstadoVista }) {
  const prod = e.ambiente === "produccion";
  if (e.emisionHabilitada) {
    return (
      <Boton accion={() => cambiarEmisionAction(false)} pregunta="¿Deshabilitar la emisión? El Core dejará de emitir y ceder documentos.">
        Deshabilitar emisión
      </Boton>
    );
  }
  return (
    <Boton
      accion={() => cambiarEmisionAction(true)}
      clase={BOTON}
      pregunta={prod ? "¿Habilitar la emisión en PRODUCCIÓN? Cada documento que se emita será real ante el SII." : "¿Habilitar la emisión en pruebas (certificación)?"}
    >
      Habilitar emisión{prod ? " (producción)" : " (pruebas)"}
    </Boton>
  );
}

export function FormularioCarpeta({ e }: { e: EstadoVista }) {
  const [r, setR] = useState<Res | null>(null);
  return (
    <div className="space-y-2">
      <FormAccion accion={guardarCarpetaAction} textoBoton="Guardar carpeta" alOk={(x) => setR(x)}>
        <Campo etiqueta="Carpeta en SharePoint (dentro de «ARCHIVOS CORE»)" ayuda={`Vacío = ${e.carpetaPorOmision}`}>
          <input name="carpeta" defaultValue={e.carpetaSp ?? ""} placeholder={e.carpetaPorOmision} className={CAMPO} />
        </Campo>
      </FormAccion>
      <Mensaje r={r} />
    </div>
  );
}

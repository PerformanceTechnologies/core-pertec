"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { IconAlertTriangle, IconCircleCheck, IconInfoCircle, IconMessage2, IconX, type Icon } from "@tabler/icons-react";
import VentanaModal from "@/components/inventario/VentanaModal";
import { IconoTile, type TonoIcono } from "@/components/contactos/Visual";

// Los diálogos de Gestión financiera, en vez de los del navegador (prompt/confirm/alert):
// se ven como el resto del Core, en el idioma de la app, y en el celular no tapan toda la pantalla.
//
// Se usan como funciones que devuelven una promesa —`await pedirTexto(…)`, `await confirmar(…)`,
// `avisar(…)`— para reemplazar a los nativos sin cambiar la lógica de quien los llama. El que los
// dibuja es <DialogosFin />, montado una vez en la barra del módulo.

type Pedido =
  | { tipo: "texto"; titulo: string; ayuda?: string; inicial?: string; placeholder?: string; boton?: string; resolver: (v: string | null) => void }
  | { tipo: "confirmar"; titulo: string; ayuda?: string; boton?: string; peligro?: boolean; resolver: (v: boolean) => void };
type Aviso = { id: number; texto: string; tono: "error" | "ok" | "info" };

let ponerPedido: ((p: Pedido | null) => void) | null = null;
let ponerAvisos: ((f: (a: Aviso[]) => Aviso[]) => void) | null = null;
let siguienteId = 1;

/** Pide un texto (un motivo, un patrón). Devuelve null si se cancela. */
export function pedirTexto(o: { titulo: string; ayuda?: string; inicial?: string; placeholder?: string; boton?: string }): Promise<string | null> {
  if (!ponerPedido) return Promise.resolve(window.prompt(o.titulo, o.inicial ?? ""));
  return new Promise((resolver) => ponerPedido!({ tipo: "texto", ...o, resolver }));
}

/** Pide confirmar una acción. */
export function confirmar(o: { titulo: string; ayuda?: string; boton?: string; peligro?: boolean }): Promise<boolean> {
  if (!ponerPedido) return Promise.resolve(window.confirm(o.titulo));
  return new Promise((resolver) => ponerPedido!({ tipo: "confirmar", ...o, resolver }));
}

/** Un aviso que aparece abajo y se va solo (los errores duran más). */
export function avisar(texto: string, tono: Aviso["tono"] = "error") {
  if (!ponerAvisos) return window.alert(texto);
  const id = siguienteId++;
  ponerAvisos((a) => [...a.slice(-2), { id, texto, tono }]);
  setTimeout(() => ponerAvisos?.((a) => a.filter((x) => x.id !== id)), tono === "error" ? 7000 : 3500);
}

const ESTILO_AVISO: Record<Aviso["tono"], { Icono: Icon; clase: string }> = {
  error: { Icono: IconAlertTriangle, clase: "text-rose-500" },
  ok: { Icono: IconCircleCheck, clase: "text-emerald-500" },
  info: { Icono: IconInfoCircle, clase: "text-cian" },
};

export const BOTON_VENTANA =
  "inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl bg-naranjo px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-naranjo-suave active:scale-[0.98] disabled:cursor-progress disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-naranjo";
export const BOTON_VENTANA_SUAVE =
  "inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl px-4 text-sm font-semibold text-gris transition hover:bg-tinta/[0.06] hover:text-tinta active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-naranjo";
const BOTON_PELIGRO =
  "inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl bg-rose-600 px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-rose-500 active:scale-[0.98] disabled:opacity-60";

/** Dibuja el diálogo pendiente y los avisos. Va una sola vez en el módulo. */
export function DialogosFin() {
  const [pedido, setPedido] = useState<Pedido | null>(null);
  const [avisos, setAvisos] = useState<Aviso[]>([]);
  const [texto, setTexto] = useState("");
  // En el servidor no hay <body> para el portal de los avisos.
  const montado = useSyncExternalStore(() => () => {}, () => true, () => false);
  const caja = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    ponerPedido = (p) => {
      setPedido(p);
      if (p?.tipo === "texto") setTexto(p.inicial ?? "");
    };
    ponerAvisos = setAvisos;
    return () => {
      ponerPedido = null;
      ponerAvisos = null;
    };
  }, []);

  useEffect(() => {
    if (pedido?.tipo === "texto") setTimeout(() => caja.current?.focus(), 30);
  }, [pedido]);

  const cerrar = (valor: string | boolean | null) => {
    if (!pedido) return;
    if (pedido.tipo === "texto") pedido.resolver(typeof valor === "string" ? valor : null);
    else pedido.resolver(valor === true);
    setPedido(null);
  };

  const icono: { Icono: Icon; tono: TonoIcono } =
    pedido?.tipo === "texto" ? { Icono: IconMessage2, tono: "marca" } : pedido?.peligro ? { Icono: IconAlertTriangle, tono: "ambar" } : { Icono: IconInfoCircle, tono: "azul" };

  return (
    <>
      <VentanaModal
        abierta={pedido !== null}
        alCerrar={() => cerrar(pedido?.tipo === "texto" ? null : false)}
        titulo={pedido?.titulo ?? ""}
        descripcion={pedido?.ayuda}
        variante="hoja"
        ancho="max-w-md"
        icono={<IconoTile Icono={icono.Icono} tono={icono.tono} />}
      >
        {pedido?.tipo === "texto" ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (texto.trim()) cerrar(texto.trim());
            }}
            className="space-y-4"
          >
            <textarea
              ref={caja}
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  if (texto.trim()) cerrar(texto.trim());
                }
              }}
              rows={3}
              placeholder={pedido.placeholder ?? "Escríbelo aquí…"}
              className="w-full resize-none rounded-xl border border-transparent bg-tinta/[0.05] px-3 py-2.5 text-sm text-tinta placeholder:text-gris-suave transition focus:border-cian/60 focus:bg-superficie focus:outline-none focus:ring-4 focus:ring-cian/15"
            />
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button type="button" onClick={() => cerrar(null)} className={BOTON_VENTANA_SUAVE}>Cancelar</button>
              <button type="submit" disabled={!texto.trim()} className={BOTON_VENTANA}>{pedido.boton ?? "Continuar"}</button>
            </div>
          </form>
        ) : pedido ? (
          <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
            <button type="button" onClick={() => cerrar(false)} className={BOTON_VENTANA_SUAVE}>Cancelar</button>
            <button type="button" autoFocus onClick={() => cerrar(true)} className={pedido.peligro ? BOTON_PELIGRO : BOTON_VENTANA}>{pedido.boton ?? "Sí, continuar"}</button>
          </div>
        ) : null}
      </VentanaModal>

      {montado &&
        createPortal(
          <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[60] flex flex-col items-center gap-2 px-4" aria-live="polite">
            {avisos.map((a) => {
              const { Icono, clase } = ESTILO_AVISO[a.tono];
              return (
                <div key={a.id} role={a.tono === "error" ? "alert" : "status"} className="animar-aviso pointer-events-auto flex w-full max-w-md items-start gap-3 rounded-2xl border border-borde/60 bg-superficie px-4 py-3 text-sm text-tinta shadow-[0_18px_40px_-14px_rgba(23,20,17,0.35)]">
                  <Icono size={19} stroke={1.9} className={`mt-px shrink-0 ${clase}`} />
                  <p className="min-w-0 flex-1 leading-snug">{a.texto}</p>
                  <button type="button" onClick={() => setAvisos((xs) => xs.filter((x) => x.id !== a.id))} aria-label="Cerrar aviso" className="-mr-1 grid h-6 w-6 shrink-0 place-items-center rounded-full text-gris transition hover:bg-tinta/[0.08] hover:text-tinta">
                    <IconX size={14} />
                  </button>
                </div>
              );
            })}
          </div>,
          document.body,
        )}
    </>
  );
}

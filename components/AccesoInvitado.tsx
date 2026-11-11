"use client";

import { useState, useTransition } from "react";
import { IconLoader2, IconMail } from "@tabler/icons-react";
import { entrarComoInvitadoAction, pedirCodigoAction } from "@/app/ingresar/acciones";

/** Ingreso de invitados (fuera de PERTEC): correo → código de 6 dígitos por mail → adentro. */
export default function AccesoInvitado() {
  const [abierto, setAbierto] = useState(false);
  const [paso, setPaso] = useState<"correo" | "codigo">("correo");
  const [correo, setCorreo] = useState("");
  const [codigo, setCodigo] = useState("");
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();

  if (!abierto) {
    return (
      <button type="button" onClick={() => setAbierto(true)} className="mt-4 text-xs font-semibold text-tinta/60 underline-offset-2 hover:text-naranjo hover:underline">
        ¿Eres invitado y no tienes cuenta PERTEC? Ingresa con tu correo
      </button>
    );
  }

  return (
    <div className="mt-6 border-t border-borde pt-5 text-left">
      <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-tinta/70"><IconMail size={14} /> Acceso de invitado</p>
      {paso === "correo" ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            iniciar(async () => {
              setMensaje(null);
              const r = await pedirCodigoAction(correo);
              if (!r.ok) return setMensaje(r.error ?? "No se pudo enviar.");
              setPaso("codigo");
              setMensaje("Si tu correo tiene acceso, te llegó un código de 6 dígitos. Revisa también el spam.");
            });
          }}
          className="mt-3 space-y-2.5"
        >
          <input type="email" required value={correo} onChange={(e) => setCorreo(e.target.value)} placeholder="tu@correo.com" className="w-full rounded-lg border border-borde px-3 py-2.5 text-sm focus:border-naranjo focus:outline-none" />
          <button type="submit" disabled={pendiente} className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-naranjo px-4 py-2.5 text-sm font-bold text-naranjo disabled:opacity-50">
            {pendiente && <IconLoader2 size={15} className="animate-spin" />} Enviarme un código
          </button>
        </form>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            iniciar(async () => {
              const r = await entrarComoInvitadoAction(correo, codigo);
              if (r?.error) setMensaje(r.error);
            });
          }}
          className="mt-3 space-y-2.5"
        >
          <input
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            required
            value={codigo}
            onChange={(e) => setCodigo(e.target.value.replace(/\D/g, ""))}
            placeholder="000000"
            className="w-full rounded-lg border border-borde px-3 py-2.5 text-center font-condensed text-2xl tracking-[0.5em] focus:border-naranjo focus:outline-none"
          />
          <button type="submit" disabled={pendiente || codigo.length !== 6} className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-naranjo px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50">
            {pendiente && <IconLoader2 size={15} className="animate-spin" />} Entrar
          </button>
          <button type="button" onClick={() => { setPaso("correo"); setCodigo(""); setMensaje(null); }} className="w-full text-xs text-tinta/60 hover:text-naranjo">
            Usar otro correo o pedir otro código
          </button>
        </form>
      )}
      {mensaje && <p className="mt-2.5 text-xs text-tinta/70">{mensaje}</p>}
    </div>
  );
}

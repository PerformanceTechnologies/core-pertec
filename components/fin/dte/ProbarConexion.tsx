"use client";

import { useState, useTransition } from "react";
import { IconLoader2, IconPlugConnected } from "@tabler/icons-react";
import { probarConexionDteAction } from "@/app/(protegido)/gestion-financiera/acciones-dte";
import { BOTON_SEC } from "../estilos";

/** Prueba las credenciales con SimpleFactura (no emite nada) y muestra el resultado tal cual. */
export default function ProbarConexion() {
  const [pendiente, iniciar] = useTransition();
  const [r, setR] = useState<{ ok: boolean; texto: string } | null>(null);
  return (
    <div className="space-y-2">
      <button type="button" disabled={pendiente} className={BOTON_SEC} onClick={() => iniciar(async () => {
        const x = await probarConexionDteAction();
        setR(x.ok ? { ok: true, texto: x.mensaje ?? "Conectado." } : { ok: false, texto: x.error });
      })}>
        {pendiente ? <IconLoader2 size={14} className="animate-spin" /> : <IconPlugConnected size={14} />} Probar conexión
      </button>
      {r && <p className={`rounded-lg px-3 py-2 text-[12px] ${r.ok ? "bg-emerald-500/10 text-ok" : "bg-rose-500/10 text-alerta"}`}>{r.texto}</p>}
    </div>
  );
}

"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BOTON_PRIMARIO, CAMPO, TARJETA } from "@/lib/estilos";
import { CAMPOS_CONFIG } from "@/lib/pagina-web-modelo";
import { guardarConfigAction } from "@/app/(protegido)/pagina-web/acciones";

/** Los teléfonos de WhatsApp y los correos del sitio (tabla config). */
export default function FormularioContacto({ valores }: { valores: Record<string, string> }) {
  const router = useRouter();
  const [v, setV] = useState(valores);
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);
  const [guardando, iniciar] = useTransition();
  const cambiado = CAMPOS_CONFIG.some((c) => (v[c.clave] ?? "") !== (valores[c.clave] ?? ""));

  const guardar = () => {
    setAviso(null);
    iniciar(async () => {
      const r = await guardarConfigAction(v);
      if (!r.ok) return setAviso({ ok: false, texto: r.error });
      setAviso({ ok: true, texto: "Guardado. El sitio lo muestra en la próxima carga de cada página." });
      router.refresh();
    });
  };

  return (
    <div className="space-y-4">
      {(["WhatsApp", "Correo"] as const).map((grupo) => (
        <section key={grupo} className={`${TARJETA} p-5`}>
          <h2 className="text-sm font-bold uppercase tracking-wide text-tinta/70">{grupo}</h2>
          <div className="mt-3 grid gap-4 md:grid-cols-2">
            {CAMPOS_CONFIG.filter((c) => c.grupo === grupo).map((c) => (
              <label key={c.clave} className={`block ${c.largo ? "md:col-span-2" : ""}`}>
                <span className="mb-1 block text-xs font-semibold text-tinta/80">{c.etiqueta}</span>
                {c.largo ? (
                  <textarea
                    className={`${CAMPO} min-h-20`}
                    rows={2}
                    value={v[c.clave] ?? ""}
                    placeholder={c.porOmision}
                    onChange={(e) => setV((x) => ({ ...x, [c.clave]: e.target.value }))}
                  />
                ) : (
                  <input
                    className={CAMPO}
                    inputMode={c.formato === "telefono" ? "tel" : c.formato === "correos" ? "email" : undefined}
                    value={v[c.clave] ?? ""}
                    placeholder={c.porOmision}
                    onChange={(e) => setV((x) => ({ ...x, [c.clave]: e.target.value }))}
                  />
                )}
                <span className="mt-1 block text-[11px] text-gris">
                  {c.ayuda}
                  {c.formato === "telefono" && " Con código de país, sin + ni espacios: 56912345678."}
                  {" "}Vacío: el sitio usa «{c.porOmision}».
                </span>
              </label>
            ))}
          </div>
        </section>
      ))}

      <div className="flex flex-wrap items-center justify-end gap-3">
        {aviso && (
          <p className={`text-sm ${aviso.ok ? "text-teal" : "text-red-700 dark:text-red-400"}`} role="status">{aviso.texto}</p>
        )}
        <button type="button" className={`${BOTON_PRIMARIO} disabled:opacity-50`} disabled={guardando || !cambiado} onClick={guardar}>
          {guardando ? "Guardando…" : "Guardar cambios"}
        </button>
      </div>
    </div>
  );
}

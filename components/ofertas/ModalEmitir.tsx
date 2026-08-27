"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import RuedaCarga from "@/components/RuedaCarga";
import { BOTON_PRIMARIO } from "@/lib/estilos";
import { leerRespuesta } from "@/lib/subidas";
import type { RegistroEmision } from "@/lib/ofertas/datos";

/**
 * Emitir: qué pasa con el PDF una vez que la oferta está lista.
 *
 * Antes emitir era un link que abría el PDF en otra pestaña y marcaba el estado. El
 * documento quedaba ahí y lo que venía después —guardarlo en alguna parte,
 * mandárselo al cliente— era trabajo a mano que no dejaba rastro. Acá se elige, se
 * hace en un paso y queda anotado.
 *
 * Las tres cosas son independientes a propósito: se puede emitir sin mandar nada
 * —bajarlo y listo— o mandarlo sin guardarlo. Lo que no se puede es que una falla en
 * el correo se lea como que todo salió bien: el resultado dice destino por destino.
 *
 * El asunto y el mensaje vienen escritos con los datos de la oferta, porque el 90%
 * de las veces el correo dice exactamente eso. Están para editarlos, no para
 * rellenarlos de cero.
 */
export default function ModalEmitir({
  id,
  numeroOferta,
  cliente,
  titulo,
  atencion,
  onCerrar,
}: {
  id: string;
  numeroOferta: string | null;
  cliente: string | null;
  titulo: string;
  /** "Sr. Alan Muñoz G." — encabeza el mensaje si está. */
  atencion: string | null;
  onCerrar: () => void;
}) {
  const router = useRouter();
  const [guardarEnWorkspace, setGuardarEnWorkspace] = useState(true);
  const [destinatarios, setDestinatarios] = useState("");
  const [copias, setCopias] = useState("");
  const [asunto, setAsunto] = useState(
    [numeroOferta, titulo].filter(Boolean).join(" · ").slice(0, 180) || "Oferta técnica",
  );
  const [mensaje, setMensaje] = useState(
    `${atencion ? `${atencion}:` : "Estimados:"}

Adjuntamos la oferta técnica y económica ${numeroOferta ? `${numeroOferta} ` : ""}correspondiente a ${titulo}.

Quedamos a disposición para cualquier consulta.

Saludos cordiales.`,
  );
  const [emitiendo, setEmitiendo] = useState(false);
  const [resultado, setResultado] = useState<RegistroEmision | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const alPresionarTecla = (e: KeyboardEvent) => {
      // Con el trabajo en curso no se cierra: cancelar a mitad de camino dejaría la
      // pantalla sin saber si el correo salió.
      if (e.key === "Escape" && !emitiendo) onCerrar();
    };
    window.addEventListener("keydown", alPresionarTecla);
    return () => window.removeEventListener("keydown", alPresionarTecla);
  }, [onCerrar, emitiendo]);

  const emitir = async () => {
    setEmitiendo(true);
    setError(null);
    try {
      const respuesta = await fetch(`/api/ofertas/${id}/emitir`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ guardarEnWorkspace, destinatarios, copias, asunto, mensaje }),
      });
      const datos = await leerRespuesta<{ emision: RegistroEmision }>(respuesta);
      setResultado(datos.emision);
      // La oferta quedó emitida: la pantalla de atrás tiene que reflejarlo.
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo emitir.");
    } finally {
      setEmitiendo(false);
    }
  };

  const cuantos = destinatarios.split(/[,;\s]+/).filter(Boolean).length;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-tinta/40 p-4 sm:items-center"
      onClick={() => !emitiendo && onCerrar()}
    >
      <div
        className="w-full max-w-lg rounded-xl border border-borde bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="font-condensed text-lg font-bold uppercase text-tinta">
              {resultado ? "Oferta emitida" : "Emitir la oferta"}
            </h2>
            <p className="text-[11px] text-tinta/50">
              {numeroOferta ?? "Sin número"}
              {cliente && ` · ${cliente}`}
            </p>
          </div>
          <button
            onClick={onCerrar}
            disabled={emitiendo}
            className="rounded-full p-1 text-tinta/50 hover:bg-crema hover:text-tinta disabled:opacity-30"
            aria-label="Cerrar"
          >
            ✕
          </button>
        </div>

        {resultado ? (
          <div className="mt-4 flex flex-col gap-3 text-sm">
            <p className="text-tinta/70">
              Se generó <span className="font-medium text-tinta">{resultado.nombreArchivo}</span> y la oferta
              quedó de solo lectura.
            </p>

            <ul className="flex flex-col gap-1.5 text-xs">
              <li className="text-tinta/70">
                {resultado.enWorkspace ? (
                  <>
                    Guardada en el workspace ·{" "}
                    {resultado.enWorkspace.startsWith("http") ? (
                      <a
                        href={resultado.enWorkspace}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-medium text-naranjo underline"
                      >
                        abrir
                      </a>
                    ) : (
                      resultado.enWorkspace
                    )}
                  </>
                ) : (
                  <span className="text-tinta/45">No se guardó en el workspace.</span>
                )}
              </li>
              <li className="text-tinta/70">
                {resultado.enviadoA.length > 0 ? (
                  <>Enviada a {resultado.enviadoA.join(", ")}</>
                ) : (
                  <span className="text-tinta/45">No se envió por correo.</span>
                )}
              </li>
            </ul>

            {/* Los problemas se dicen igual que los aciertos: una emisión donde el
                correo no salió no puede leerse como una emisión limpia. */}
            {resultado.problemas.length > 0 && (
              <ul className="flex flex-col gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                {resultado.problemas.map((p, i) => (
                  <li key={i} className="text-pretty">
                    {p}
                  </li>
                ))}
              </ul>
            )}

            <div className="mt-1 flex flex-wrap gap-2">
              <a
                href={`/api/ofertas/${id}/pdf?descargar=1`}
                className={`${BOTON_PRIMARIO} inline-flex items-center justify-center`}
              >
                Descargar el PDF
              </a>
              <button
                type="button"
                onClick={onCerrar}
                className="rounded-lg border border-borde px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-tinta transition hover:border-naranjo/50 hover:text-naranjo"
              >
                Cerrar
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-4 flex flex-col gap-4">
            <p className="text-xs text-pretty text-tinta/55">
              Se genera el PDF una vez y se usa para todo lo que elijas. La oferta queda de solo lectura.
            </p>

            <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-borde bg-crema/40 px-3 py-2.5">
              <input
                type="checkbox"
                checked={guardarEnWorkspace}
                onChange={(e) => setGuardarEnWorkspace(e.target.checked)}
                className="mt-0.5 h-3.5 w-3.5 accent-naranjo"
              />
              <span className="text-xs text-tinta/70">
                <span className="font-semibold text-tinta">Guardar en el workspace</span>
                <span className="block text-[11px] text-tinta/45">
                  En SharePoint, en Ofertas técnicas / {new Date().getFullYear()}.
                </span>
              </span>
            </label>

            <div className="flex flex-col gap-2 rounded-lg border border-borde px-3 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-tinta/45">
                Enviar por correo
              </p>
              <p className="text-[11px] text-pretty text-tinta/45">
                Sale desde tu cuenta y queda en tus enviados. Dejalo vacío para no enviar nada.
              </p>
              <Campo
                rotulo="Para"
                valor={destinatarios}
                onChange={setDestinatarios}
                placeholder="cliente@empresa.cl, otro@empresa.cl"
              />
              <Campo rotulo="Copia" valor={copias} onChange={setCopias} placeholder="opcional" />
              <Campo rotulo="Asunto" valor={asunto} onChange={setAsunto} />
              <label className="block">
                <span className="block text-[10px] font-semibold uppercase tracking-wide text-tinta/45">
                  Mensaje
                </span>
                <textarea
                  rows={7}
                  value={mensaje}
                  onChange={(e) => setMensaje(e.target.value)}
                  className="mt-1 w-full resize-y rounded-lg border border-borde bg-superficie px-2.5 py-1.5 text-sm text-tinta outline-none focus:border-naranjo/50"
                />
              </label>
            </div>

            {error && (
              <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-pretty text-red-700">
                {error}
              </p>
            )}

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={emitir}
                disabled={emitiendo}
                className={`${BOTON_PRIMARIO} inline-flex items-center justify-center gap-2 disabled:opacity-40`}
              >
                {emitiendo && <RuedaCarga />}
                {emitiendo ? "Emitiendo…" : "Emitir"}
              </button>
              <button
                type="button"
                onClick={onCerrar}
                disabled={emitiendo}
                className="rounded-lg border border-borde px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-tinta transition hover:border-naranjo/50 hover:text-naranjo disabled:opacity-40"
              >
                Cancelar
              </button>
              <span className="text-[11px] text-tinta/45">
                {cuantos > 0
                  ? `Se enviará a ${cuantos} destinatario${cuantos === 1 ? "" : "s"}.`
                  : "Sin envío."}
              </span>
            </div>

            {emitiendo && (
              <p className="text-[11px] text-tinta/45">
                Imprimir una oferta con fotos tarda unos segundos. No cierres esta ventana.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Campo({
  rotulo,
  valor,
  onChange,
  placeholder,
}: {
  rotulo: string;
  valor: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="block text-[10px] font-semibold uppercase tracking-wide text-tinta/45">{rotulo}</span>
      <input
        type="text"
        value={valor}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-lg border border-borde bg-superficie px-2.5 py-1.5 text-sm text-tinta outline-none placeholder:text-tinta/30 focus:border-naranjo/50"
      />
    </label>
  );
}

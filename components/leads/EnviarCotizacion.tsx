"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { IconAlertTriangle, IconExternalLink, IconLoader2, IconMail, IconPaperclip, IconSend } from "@tabler/icons-react";
import VentanaModal from "@/components/inventario/VentanaModal";
import { IconoTile } from "@/components/contactos/Visual";
import { prepararEnvioCotizacionAction, type PreparacionEnvio } from "@/app/(protegido)/leads/acciones";
import { BOTON, CAMPO, Campo } from "@/components/fin/ui";
import { avisar, BOTON_VENTANA, BOTON_VENTANA_SUAVE } from "@/components/fin/dialogos";

/**
 * «Enviar por correo»: ves y editas el destinatario, el asunto y el mensaje (armado con los datos de la
 * cotización) y sale con el PDF adjunto desde tu Outlook. Se abre desde el detalle o al terminar de editar.
 */
export default function EnviarCotizacion({ id, abierta, alCerrar, alEnviar }: { id: string; abierta: boolean; alCerrar: () => void; alEnviar?: () => void }) {
  return (
    <VentanaModal abierta={abierta} alCerrar={alCerrar} titulo="Enviar cotización" descripcion="Sale desde tu correo, con el PDF adjunto." ancho="max-w-2xl" variante="hoja" completaEnMovil icono={<IconoTile Icono={IconMail} tono="marca" />}>
      {/* El cuerpo solo existe con la ventana abierta: cada apertura prepara el mensaje desde cero. */}
      <ContenidoEnvio id={id} alCerrar={alCerrar} alEnviar={alEnviar} />
    </VentanaModal>
  );
}

function ContenidoEnvio({ id, alCerrar, alEnviar }: { id: string; alCerrar: () => void; alEnviar?: () => void }) {
  const router = useRouter();
  const [prep, setPrep] = useState<PreparacionEnvio | null>(null);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  const [para, setPara] = useState("");
  const [copias, setCopias] = useState("");
  const [asunto, setAsunto] = useState("");
  const [mensaje, setMensaje] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let vigente = true;
    prepararEnvioCotizacionAction(id).then((r) => {
      if (!vigente) return;
      if (!r.ok) return setErrorCarga(r.error);
      setPrep(r.envio);
      setPara(r.envio.para);
      setAsunto(r.envio.asunto);
      setMensaje(r.envio.mensaje);
    });
    return () => {
      vigente = false;
    };
  }, [id]);

  const enviar = async () => {
    setEnviando(true);
    setError(null);
    const r = await fetch(`/api/leads/cotizaciones/${id}/enviar`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ destinatarios: para, copias, asunto, mensaje }),
    })
      .then((x) => x.json())
      .catch(() => ({ error: "No se pudo enviar. Revisa tu conexión." }));
    setEnviando(false);
    if (r.error) return setError(r.error);
    avisar(r.problemas?.length ? `Enviada. ${r.problemas.join(" ")}` : "Cotización enviada al cliente.", r.problemas?.length ? "info" : "ok");
    alCerrar();
    alEnviar?.();
    router.refresh();
  };

  return (
    <>
      {errorCarga ? (
        <p role="alert" className="flex items-start gap-2 rounded-xl bg-rose-500/[0.08] px-3 py-2.5 text-[13px] font-medium text-alerta"><IconAlertTriangle size={16} className="mt-px shrink-0" /> {errorCarga}</p>
      ) : !prep ? (
        <p className="flex items-center gap-2 py-8 text-sm text-gris"><IconLoader2 size={16} className="animate-spin" /> Preparando el mensaje…</p>
      ) : (
        <div className="space-y-4">
          {prep.yaEnviadaA && <p className="rounded-xl bg-sky-500/10 px-3 py-2 text-xs text-info">Ya se envió a {prep.yaEnviadaA}. Si la mandas otra vez, queda registrado un segundo envío.</p>}
          {prep.faltantes.length > 0 && (
            <p className="flex items-start gap-2 rounded-xl bg-amber-500/10 px-3 py-2 text-xs text-aviso">
              <IconAlertTriangle size={14} className="mt-px shrink-0" />
              <span>Al PDF le faltan datos de la empresa: {prep.faltantes.join(", ")}. Complétalos en <Link href="/gestion-financiera/configuracion?ver=empresa" target="_blank" className="font-semibold underline">Configuración › Datos de la empresa</Link> antes de enviar, o envíala así.</span>
            </p>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <Campo etiqueta="Para *" ayuda="Varios correos, separados por coma"><input value={para} onChange={(e) => setPara(e.target.value)} className={CAMPO} type="text" inputMode="email" autoComplete="off" placeholder="cliente@empresa.cl" /></Campo>
            <Campo etiqueta="Con copia"><input value={copias} onChange={(e) => setCopias(e.target.value)} className={CAMPO} type="text" inputMode="email" autoComplete="off" placeholder="opcional" /></Campo>
          </div>
          <Campo etiqueta="Asunto *"><input value={asunto} onChange={(e) => setAsunto(e.target.value)} className={CAMPO} maxLength={200} /></Campo>
          <Campo etiqueta="Mensaje *"><textarea value={mensaje} onChange={(e) => setMensaje(e.target.value)} rows={12} className={`${CAMPO} leading-relaxed`} /></Campo>
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-borde bg-tinta/[0.02] px-3 py-2.5 text-xs text-gris">
            <span className="inline-flex items-center gap-1.5"><IconPaperclip size={14} /> Se adjunta el PDF de la cotización {prep.numero} · {prep.total}</span>
            <a href={`/api/leads/cotizaciones/${id}/pdf`} target="_blank" rel="noopener" className="inline-flex items-center gap-1 font-semibold text-naranjo hover:underline">Ver vista previa <IconExternalLink size={12} /></a>
          </div>
          <p className="text-[11px] text-gris">Remitente: {prep.remitente}. Quedará en tus enviados y, si el cliente responde, te llegará a ti.</p>
          {error && <p role="alert" className="flex items-start gap-2 rounded-xl bg-rose-500/[0.08] px-3 py-2.5 text-[13px] font-medium text-alerta"><IconAlertTriangle size={16} className="mt-px shrink-0" /> {error}</p>}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button type="button" onClick={alCerrar} className={BOTON_VENTANA_SUAVE}>Ahora no</button>
            <button type="button" onClick={enviar} disabled={enviando || !para.trim() || !asunto.trim() || !mensaje.trim()} className={BOTON_VENTANA}>
              {enviando ? <IconLoader2 size={16} className="animate-spin" /> : <IconSend size={16} />} {enviando ? "Generando y enviando…" : "Enviar al cliente"}
            </button>
          </div>
        </div>
      )}
    </>
  );
}

/** El botón que abre el diálogo de envío (para páginas de servidor, que no guardan estado). */
export function BotonEnviarCotizacion({ id, texto = "Enviar por correo" }: { id: string; texto?: string }) {
  const [abierta, setAbierta] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setAbierta(true)} className={BOTON}><IconSend size={14} /> {texto}</button>
      <EnviarCotizacion id={id} abierta={abierta} alCerrar={() => setAbierta(false)} />
    </>
  );
}

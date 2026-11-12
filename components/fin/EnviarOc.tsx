"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { IconAlertTriangle, IconExternalLink, IconLoader2, IconMail, IconPaperclip, IconSend, IconUserPlus } from "@tabler/icons-react";
import VentanaModal from "@/components/inventario/VentanaModal";
import { IconoTile } from "@/components/contactos/Visual";
import { prepararEnvioOcAction, type PreparacionEnvioOc } from "@/app/(protegido)/gestion-financiera/acciones-compras";
import { BOTON, BOTON_SEC, CAMPO, Campo } from "@/components/fin/ui";
import { avisar, BOTON_VENTANA, BOTON_VENTANA_SUAVE } from "@/components/fin/dialogos";

/**
 * «Enviar OC por correo»: ves y editas el destinatario, el asunto y el mensaje (armado con los datos de la OC, sin el detalle de
 * los productos, que va en el PDF) y sale con el PDF adjunto desde tu Outlook. Al enviar, la solicitud pasa a esperar la
 * respuesta del proveedor.
 */
function EnviarOc({ id, abierta, alCerrar }: { id: string; abierta: boolean; alCerrar: () => void }) {
  return (
    <VentanaModal abierta={abierta} alCerrar={alCerrar} titulo="Enviar OC al proveedor" descripcion="Sale desde tu correo, con el PDF de la orden adjunto." ancho="max-w-2xl" variante="hoja" completaEnMovil icono={<IconoTile Icono={IconMail} tono="marca" />}>
      {/* El cuerpo solo existe con la ventana abierta: cada apertura prepara el mensaje desde cero. */}
      <ContenidoEnvio id={id} alCerrar={alCerrar} />
    </VentanaModal>
  );
}

function ContenidoEnvio({ id, alCerrar }: { id: string; alCerrar: () => void }) {
  const router = useRouter();
  const [prep, setPrep] = useState<PreparacionEnvioOc | null>(null);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  const [para, setPara] = useState("");
  const [copias, setCopias] = useState("");
  const [asunto, setAsunto] = useState("");
  const [mensaje, setMensaje] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let vigente = true;
    prepararEnvioOcAction(id).then((r) => {
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

  // Los correos registrados del proveedor que todavía no están ni en «Para» ni en «Con copia».
  const correosEnUso = new Set(`${para},${copias}`.split(/[,;\s]+/).map((x) => x.trim().toLowerCase()).filter(Boolean));
  const porTraer = (prep?.correosRegistrados ?? []).filter((c) => !correosEnUso.has(c.toLowerCase()));
  const traerCorreoDelProveedor = () => setCopias((x) => [x.trim().replace(/[,;]+$/, ""), ...porTraer].filter(Boolean).join(", "));

  const enviar = async () => {
    setEnviando(true);
    setError(null);
    const r = await fetch(`/api/finanzas/compras/${id}/enviar-oc`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ destinatarios: para, copias, asunto, mensaje }),
    })
      .then((x) => x.json())
      .catch(() => ({ error: "No se pudo enviar. Revisa tu conexión." }));
    setEnviando(false);
    if (r.error) return setError(r.error);
    avisar(r.problemas?.length ? `Enviada. ${r.problemas.join(" ")}` : "OC enviada al proveedor. Ahora se espera su respuesta.", r.problemas?.length ? "info" : "ok");
    alCerrar();
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
          {!prep.para && <p className="rounded-xl bg-amber-500/10 px-3 py-2 text-xs text-aviso">El proveedor no tiene un correo cargado: escríbelo en «Para».</p>}
          <div className="grid gap-3 sm:grid-cols-2">
            <Campo etiqueta="Para *" ayuda="Varios correos, separados por coma"><input value={para} onChange={(e) => setPara(e.target.value)} className={CAMPO} type="text" inputMode="email" autoComplete="off" placeholder="ventas@proveedor.cl" /></Campo>
            <Campo etiqueta="Con copia">
              <input value={copias} onChange={(e) => setCopias(e.target.value)} className={CAMPO} type="text" inputMode="email" autoComplete="off" placeholder="opcional" />
              {porTraer.length > 0 && (
                <button type="button" onClick={traerCorreoDelProveedor} className="mt-1.5 inline-flex max-w-full items-center gap-1 truncate rounded-md px-1.5 py-1 text-[11px] font-semibold text-naranjo hover:bg-naranjo/10" title="Agrega a «Con copia» el correo registrado del proveedor en Contactos">
                  <IconUserPlus size={13} className="shrink-0" /> Traer el correo del proveedor ({porTraer.join(", ")})
                </button>
              )}
            </Campo>
          </div>
          <Campo etiqueta="Asunto *"><input value={asunto} onChange={(e) => setAsunto(e.target.value)} className={CAMPO} maxLength={200} /></Campo>
          <Campo etiqueta="Mensaje *"><textarea value={mensaje} onChange={(e) => setMensaje(e.target.value)} rows={12} className={`${CAMPO} leading-relaxed`} /></Campo>
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-borde bg-tinta/[0.02] px-3 py-2.5 text-xs text-gris">
            <span className="inline-flex items-center gap-1.5"><IconPaperclip size={14} /> Se adjunta el PDF de la OC {prep.numero} · {prep.total}</span>
            <a href={`/api/finanzas/compras/${id}/oc-pdf`} target="_blank" rel="noopener" className="inline-flex items-center gap-1 font-semibold text-naranjo hover:underline">Ver vista previa <IconExternalLink size={12} /></a>
          </div>
          <p className="text-[11px] text-gris">Remitente: {prep.remitente}. Quedará en tus enviados y, si el proveedor responde, te llegará a ti.</p>
          {error && <p role="alert" className="flex items-start gap-2 rounded-xl bg-rose-500/[0.08] px-3 py-2.5 text-[13px] font-medium text-alerta"><IconAlertTriangle size={16} className="mt-px shrink-0" /> {error}</p>}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button type="button" onClick={alCerrar} className={BOTON_VENTANA_SUAVE}>Ahora no</button>
            <button type="button" onClick={enviar} disabled={enviando || !para.trim() || !asunto.trim() || !mensaje.trim()} className={BOTON_VENTANA}>
              {enviando ? <IconLoader2 size={16} className="animate-spin" /> : <IconSend size={16} />} {enviando ? "Generando y enviando…" : "Enviar al proveedor"}
            </button>
          </div>
        </div>
      )}
    </>
  );
}

/** El botón que abre el diálogo de envío (sirve en páginas de servidor y en la tabla, que no guardan estado). */
export function BotonEnviarOc({ id, texto = "Enviar OC por correo", secundario = false }: { id: string; texto?: string; secundario?: boolean }) {
  const [abierta, setAbierta] = useState(false);
  return (
    <>
      <button type="button" onClick={(e) => (e.stopPropagation(), setAbierta(true))} className={secundario ? BOTON_SEC : BOTON}><IconSend size={14} /> {texto}</button>
      <EnviarOc id={id} abierta={abierta} alCerrar={() => setAbierta(false)} />
    </>
  );
}

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { sesionDeLaPeticion } from "@/lib/sesion-de-la-peticion";
import { obtenerUsuarioActivo } from "@/lib/usuarios";
import { Client } from "@microsoft/microsoft-graph-client";
import { adjuntoDeFirma, firmaDe, guardarFirma, guardarTextoFirma, LARGO_MAX_TEXTO, normalizarFirma, PESO_MAX_SUBIDA } from "@/lib/firma-correo";
import { remitenteParaEnviar } from "@/lib/correo-empresa";
import { contextoDeEmpresa } from "@/lib/empresas";
import { cuerpoHtml, firmaHtml } from "@/lib/ofertas/correo-html";

export type EstadoFirma = { ok: boolean; error?: string } | null;

const TIPOS = ["image/png", "image/jpeg", "image/webp"];

/**
 * Guarda (o quita) la firma de quien está en sesión. Nunca la de otro: el id sale de la sesión,
 * no del formulario. «quitar=1» la borra.
 */
export async function guardarFirmaAction(_previo: EstadoFirma, form: FormData): Promise<EstadoFirma> {
  const usuario = await obtenerUsuarioActivo((await sesionDeLaPeticion())?.user?.email);
  if (!usuario) redirect("/ingresar");
  if (usuario.tipo === "invitado") return { ok: false, error: "Los invitados no tienen firma de correo." };

  try {
    if (form.get("quitar") === "1") {
      await guardarFirma(usuario.id, null);
    } else {
      const archivo = form.get("imagen");
      if (!(archivo instanceof File) || archivo.size === 0) return { ok: false, error: "Elige una imagen." };
      if (!TIPOS.includes(archivo.type)) return { ok: false, error: "La firma tiene que ser una imagen PNG, JPG o WebP." };
      if (archivo.size > PESO_MAX_SUBIDA) return { ok: false, error: "La imagen pesa más de 1 MB. Achícala o guárdala como JPG." };
      await guardarFirma(usuario.id, await normalizarFirma(Buffer.from(await archivo.arrayBuffer())));
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "No se pudo guardar la firma." };
  }
  revalidatePath("/mi-perfil");
  return { ok: true };
}

/** Guarda el texto de la firma de quien está en sesión (vacío = sin texto). Nunca el de otro: el id sale de la sesión. */
export async function guardarTextoFirmaAction(_previo: EstadoFirma, form: FormData): Promise<EstadoFirma> {
  const usuario = await obtenerUsuarioActivo((await sesionDeLaPeticion())?.user?.email);
  if (!usuario) redirect("/ingresar");
  if (usuario.tipo === "invitado") return { ok: false, error: "Los invitados no tienen firma de correo." };
  const texto = String(form.get("texto") ?? "");
  if (texto.length > LARGO_MAX_TEXTO) return { ok: false, error: `El texto de la firma puede tener hasta ${LARGO_MAX_TEXTO} caracteres.` };
  try {
    await guardarTextoFirma(usuario.id, texto);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "No se pudo guardar el texto de la firma." };
  }
  revalidatePath("/mi-perfil");
  return { ok: true };
}

/**
 * Un correo de prueba a uno mismo, con la firma guardada, para ver cómo la reciben los demás. Sale por el mismo
 * camino que las cotizaciones y OC (desde la cuenta propia, o la de la empresa activa si tiene correo propio) y
 * SOLO a la propia dirección: el destinatario no viene del formulario.
 */
export async function enviarPruebaFirmaAction(_previo: EstadoFirma, _form: FormData): Promise<EstadoFirma> {
  void _previo; // la firma de useActionState: (estado previo, formulario); aquí no se usan
  void _form;
  const usuario = await obtenerUsuarioActivo((await sesionDeLaPeticion())?.user?.email);
  if (!usuario) redirect("/ingresar");
  if (usuario.tipo === "invitado") return { ok: false, error: "Los invitados no tienen firma de correo." };
  const firma = await firmaDe(usuario);
  if (!firma) return { ok: false, error: "Todavía no tienes firma: escribe el texto o sube una imagen y guárdala." };
  const { activa } = await contextoDeEmpresa(usuario.id, usuario.rol);
  const token = await remitenteParaEnviar(usuario, activa?.id);
  if (token.estado !== "ok") return { ok: false, error: token.error };
  try {
    const graph = Client.init({ authProvider: (done) => done(null, token.accessToken) });
    await graph.api("/me/sendMail").post({
      message: {
        subject: "Prueba de tu firma de correo (Core PERTEC)",
        body: {
          contentType: "HTML",
          content:
            cuerpoHtml("Hola:\n\nEste es un correo de prueba que te mandaste desde el Core para ver cómo se ve tu firma. Así la van a ver tus clientes y proveedores al final de las cotizaciones, órdenes de compra y ofertas que envíes.\n\nSaludos.") +
            firmaHtml(firma),
        },
        ...(firma.imagen ? { attachments: [adjuntoDeFirma(firma.imagen)] } : {}),
        toRecipients: [{ emailAddress: { address: usuario.correo } }],
      },
      saveToSentItems: false,
    });
  } catch (e) {
    console.error("[firma] no salió el correo de prueba:", e instanceof Error ? e.message : e);
    return { ok: false, error: "No se pudo enviar el correo de prueba. Vuelve a intentarlo en un rato." };
  }
  return { ok: true };
}

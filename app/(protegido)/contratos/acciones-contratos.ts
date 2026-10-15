"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { signIn } from "@/auth";
import { exigirCapacidad } from "@/lib/contratos/autorizacion";
import { crearContrato, prepararCarpetas, prepararCarpetasDeNombre } from "@/lib/contratos/contratos";
import { SCOPES_SHAREPOINT } from "@/lib/contratos/graph-token";
import { olvidarTokenDe } from "@/lib/contratos/graph-credenciales";
import { obtenerContratoPorSlug } from "@/lib/contratos/contrato-actual";
import type { EstadoForm } from "@/lib/contratos/acreditacion-modelo";

function texto(form: FormData, campo: string): string | null {
  const valor = String(form.get(campo) ?? "").trim();
  return valor || null;
}

/**
 * Crea un contrato y lo deja listo para trabajar.
 *
 * Con el permiso de configurar: abrir un contrato es definir un expediente nuevo, no agregar datos
 * a uno.
 *
 * La carpeta en SharePoint se crea PRIMERO. Un contrato sin su carpeta no sirve —los documentos,
 * las fichas y las partidas viven ahí—, así que si SharePoint no responde o no hay permiso, no se
 * crea nada y se dice por qué. Si lo que falla es la base después de crear la carpeta, la carpeta
 * queda y se reutiliza al reintentar: crearla es idempotente.
 */
export async function crearContratoAction(_previo: EstadoForm, form: FormData): Promise<EstadoForm> {
  const usuario = await exigirCapacidad("contratos", "configurar");
  const nombre = String(form.get("nombre") ?? "").trim();

  let slug: string;
  try {
    const carpeta = await prepararCarpetasDeNombre(nombre);
    const contrato = await crearContrato(
      {
        nombre,
        cliente: texto(form, "cliente"),
        numero: texto(form, "numero"),
        fechaInicio: texto(form, "fecha_inicio"),
        administrador: texto(form, "administrador"),
      },
      usuario,
      carpeta,
    );
    slug = contrato.slug;
  } catch (e) {
    return {
      error: `No se pudo crear el contrato: ${e instanceof Error ? e.message : "error desconocido"}`,
    };
  }

  revalidatePath("/contratos");
  redirect(`/contratos/${slug}`);
}

/** Conectar SharePoint desde «Nuevo contrato»: vuelve ahí mismo, listo para crearlo. */
export async function conectarParaCrearAction(): Promise<void> {
  const usuario = await exigirCapacidad("contratos", "configurar");
  olvidarTokenDe(usuario.correo);
  await signIn("microsoft-entra-id", { redirectTo: "/contratos/nuevo" }, { scope: SCOPES_SHAREPOINT });
}

/** Crea (o completa) las carpetas de SharePoint de un contrato que nació sin ellas. */
export async function prepararCarpetasAction(slug: string): Promise<{ error?: string }> {
  await exigirCapacidad("contratos", "crear");
  const contrato = await obtenerContratoPorSlug(slug);
  if (!contrato) return { error: "El contrato ya no existe." };

  try {
    await prepararCarpetas(contrato);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudieron crear las carpetas." };
  }
  revalidatePath("/contratos/[contrato]", "layout");
  return {};
}

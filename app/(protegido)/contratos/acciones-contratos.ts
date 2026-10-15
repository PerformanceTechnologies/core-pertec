"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { exigirCapacidad } from "@/lib/contratos/autorizacion";
import { crearContrato, prepararCarpetas } from "@/lib/contratos/contratos";
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
 * a uno. Las carpetas de SharePoint se intentan crear en el mismo paso; si quien lo crea todavía no
 * conectó SharePoint, el contrato queda creado igual y las carpetas se preparan desde su portada.
 */
export async function crearContratoAction(_previo: EstadoForm, form: FormData): Promise<EstadoForm> {
  const usuario = await exigirCapacidad("contratos", "configurar");

  let slug: string;
  try {
    const contrato = await crearContrato(
      {
        nombre: String(form.get("nombre") ?? ""),
        cliente: texto(form, "cliente"),
        numero: texto(form, "numero"),
        fechaInicio: texto(form, "fecha_inicio"),
        administrador: texto(form, "administrador"),
      },
      usuario,
    );
    slug = contrato.slug;

    try {
      await prepararCarpetas(contrato);
    } catch (e) {
      // No es un error del alta: el contrato existe y se puede seguir. Las carpetas se crean
      // después con el botón de su portada.
      console.error(`[contratos] El contrato ${contrato.slug} se creó sin carpetas en SharePoint:`, e);
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo crear el contrato." };
  }

  revalidatePath("/contratos");
  redirect(`/contratos/${slug}`);
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

"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { exigirAccesoApp } from "@/lib/autorizacion";
import { crearRendicion, eliminarRendicion, obtenerRendicion } from "@/lib/rendidor/datos";

const SLUG_APP = "rendir-gastos";

// PASO 0 de la skill: los 3 datos iniciales (quién rinde, monto asignado,
// título), antes de analizar ningún comprobante.
export async function crearRendicionAction(form: FormData) {
  const usuario = await exigirAccesoApp(SLUG_APP);

  const nombreQuienRinde = String(form.get("nombreQuienRinde") ?? "").trim();
  const tituloRendicion = String(form.get("tituloRendicion") ?? "").trim();
  const montoAsignado = Number(form.get("montoAsignado") ?? 0) || 0;
  const empresaCompanyId = Number(form.get("empresaCompanyId") ?? 1) || 1;

  if (!nombreQuienRinde || !tituloRendicion) {
    throw new Error("El nombre de quien rinde y el título son obligatorios.");
  }

  const rendicion = await crearRendicion(
    { nombreQuienRinde, tituloRendicion, montoAsignado, empresaCompanyId },
    usuario.id,
  );

  revalidatePath("/rendir-gastos");
  redirect(`/rendir-gastos/${rendicion.id}`);
}

export async function eliminarRendicionAction(id: string) {
  const usuario = await exigirAccesoApp(SLUG_APP);
  const rendicion = await obtenerRendicion(id);
  if (!rendicion) return;
  if (rendicion.creadoPor !== usuario.id && usuario.rol !== "admin") {
    throw new Error("No autorizado");
  }
  await eliminarRendicion(id);
  revalidatePath("/rendir-gastos");
}

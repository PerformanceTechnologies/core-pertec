"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  exigirAccesoCotizador,
  crearCotizacion,
  actualizarInputCotizacion,
  actualizarMetaCotizacion,
  marcarEmitida,
  crearNuevaVersion,
  eliminarCotizacion,
} from "@/lib/cotizador";
import { esEmpresaValida, EMPRESAS } from "@/lib/cotizador/empresas";
import type { QuotationInput } from "@/lib/cotizador/motor/types";

function leerDatosMeta(form: FormData) {
  const tipoServicio = String(form.get("tipoServicio") ?? "spot");
  const empresa = String(form.get("empresa") ?? "");
  return {
    nombre: String(form.get("nombre") ?? ""),
    empresa: esEmpresaValida(empresa) ? empresa : EMPRESAS[0],
    cliente: String(form.get("cliente") ?? "") || null,
    faena: String(form.get("faena") ?? "") || null,
    tipoServicio: tipoServicio === "contrato_permanente" ? ("contrato_permanente" as const) : ("spot" as const),
  };
}

export async function crearCotizacionAction(form: FormData) {
  const { usuario } = await exigirAccesoCotizador("crear_cotizacion");
  const cotizacion = await crearCotizacion(leerDatosMeta(form), usuario.id);
  revalidatePath("/cotizador");
  redirect(`/cotizador/${cotizacion.id}`);
}

export async function actualizarMetaCotizacionAction(id: string, form: FormData) {
  await exigirAccesoCotizador("editar_cotizacion");
  await actualizarMetaCotizacion(id, leerDatosMeta(form));
  revalidatePath(`/cotizador/${id}`);
  revalidatePath("/cotizador");
}

// Llamada directa (no vía <form>) desde el editor cliente: cada edición de
// dotación/costos/márgenes dispara esto con debounce, no tiene sentido como
// submit de formulario. Ver guía de Server Actions del repo (server-actions.md):
// una función "use server" se puede invocar como cualquier async function
// desde un Client Component.
export async function actualizarInputCotizacionAction(id: string, input: QuotationInput) {
  await exigirAccesoCotizador("editar_cotizacion");
  const summary = await actualizarInputCotizacion(id, input);
  revalidatePath(`/cotizador/${id}`);
  revalidatePath("/cotizador");
  return summary;
}

export async function marcarEmitidaAction(id: string) {
  await exigirAccesoCotizador("marcar_emitida");
  await marcarEmitida(id);
  revalidatePath(`/cotizador/${id}`);
  revalidatePath("/cotizador");
}

export async function crearNuevaVersionAction(id: string) {
  const { usuario } = await exigirAccesoCotizador("crear_nueva_version");
  const nueva = await crearNuevaVersion(id, usuario.id);
  revalidatePath("/cotizador");
  redirect(`/cotizador/${nueva.id}`);
}

export async function eliminarCotizacionAction(form: FormData) {
  await exigirAccesoCotizador("eliminar_cotizacion");
  const id = String(form.get("id"));
  await eliminarCotizacion(id);
  revalidatePath("/cotizador");
}

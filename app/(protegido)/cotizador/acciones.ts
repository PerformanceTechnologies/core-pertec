"use server";

import type { EntradaCotizacion } from "@/lib/cotizador";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  exigirAccesoCotizador,
  exigirCotizacion,
  crearCotizacion,
  actualizarInputCotizacion,
  actualizarMetaCotizacion,
  marcarEmitida,
  crearNuevaVersion,
  eliminarCotizacion,
} from "@/lib/cotizador";
import { esEmpresaValida, EMPRESAS } from "@/lib/cotizador/empresas";
import { crearClienteOdoo, type ClienteOdoo } from "@/lib/cotizador/clientes-odoo";
import type { QuotationInput } from "@/lib/cotizador/motor/types";

function leerDatosMeta(form: FormData) {
  const tipoServicio = String(form.get("tipoServicio") ?? "spot");
  const empresa = String(form.get("empresa") ?? "");
  return {
    nombre: String(form.get("nombre") ?? ""),
    empresa: esEmpresaValida(empresa) ? empresa : EMPRESAS[0],
    cliente: String(form.get("cliente") ?? "") || null,
    faena: String(form.get("faena") ?? "") || null,
    tipoServicio:
      tipoServicio === "contrato_permanente" ? ("contrato_permanente" as const) : ("spot" as const),
  };
}

export async function crearCotizacionAction(form: FormData) {
  const { usuario } = await exigirAccesoCotizador("crear_cotizacion");
  const cotizacion = await crearCotizacion(leerDatosMeta(form), usuario.id);
  revalidatePath("/cotizador");
  redirect(`/cotizador/${cotizacion.id}`);
}

// Las acciones que reciben un id usan exigirCotizacion y no exigirAccesoCotizador:
// además del rol, verifica que la cotización sea de quien la manda. Sin eso,
// cualquiera con la app podía editar, emitir o borrar la de otro mandando el id.
export async function actualizarMetaCotizacionAction(id: string, form: FormData) {
  await exigirCotizacion(id, "editar_cotizacion");
  await actualizarMetaCotizacion(id, leerDatosMeta(form));
  revalidatePath(`/cotizador/${id}`);
  revalidatePath("/cotizador");
}

// Llamada directa (no vía <form>) desde el editor cliente: cada edición de
// dotación/costos/márgenes dispara esto con debounce, no tiene sentido como
// submit de formulario. Ver guía de Server Actions del repo (server-actions.md):
// una función "use server" se puede invocar como cualquier async function
// desde un Client Component.
// Acepta las dos formas de entrada (motor y obra); actualizarInputCotizacion
// verifica que el tipo calce con el de la cotización antes de calcular.
export async function actualizarInputCotizacionAction(id: string, input: EntradaCotizacion) {
  await exigirCotizacion(id, "editar_cotizacion");
  const summary = await actualizarInputCotizacion(id, input);
  revalidatePath(`/cotizador/${id}`);
  revalidatePath("/cotizador");
  return summary;
}

export async function marcarEmitidaAction(id: string) {
  await exigirCotizacion(id, "marcar_emitida");
  await marcarEmitida(id);
  revalidatePath(`/cotizador/${id}`);
  revalidatePath("/cotizador");
}

export async function crearNuevaVersionAction(id: string) {
  const { usuario } = await exigirCotizacion(id, "crear_nueva_version");
  const nueva = await crearNuevaVersion(id, usuario.id);
  revalidatePath("/cotizador");
  redirect(`/cotizador/${nueva.id}`);
}

export async function eliminarCotizacionAction(form: FormData) {
  const id = String(form.get("id"));
  await exigirCotizacion(id, "eliminar_cotizacion");
  await eliminarCotizacion(id);
  revalidatePath("/cotizador");
}

// Llamada directa (no vía <form>) desde el autocompletado de cliente: se usa
// tanto al crear una cotización nueva como al editar una existente, así que
// se gatea con "crear_cotizacion" (mismo nivel que "editar_cotizacion" en
// ACCIONES_USUARIO — admin/usuario sí, visualizador no).
export async function crearClienteOdooAction(nombre: string): Promise<ClienteOdoo> {
  await exigirAccesoCotizador("crear_cotizacion");
  return crearClienteOdoo(nombre);
}

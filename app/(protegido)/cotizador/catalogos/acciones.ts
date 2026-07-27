"use server";

import { revalidatePath } from "next/cache";
import { exigirAccesoCotizador } from "@/lib/cotizador";
import {
  crearCargoCatalogo,
  actualizarCargoCatalogo,
  desactivarCargoCatalogo,
} from "@/lib/cotizador/catalogo-cargos";
import type { CatalogoCargo, DatosCargoCatalogo } from "@/lib/cotizador/catalogo-cargos-tipos";

export async function crearCargoCatalogoAction(datos: DatosCargoCatalogo): Promise<CatalogoCargo> {
  await exigirAccesoCotizador("administrar_catalogo_cargos");
  const cargo = await crearCargoCatalogo(datos);
  revalidatePath("/cotizador/catalogos");
  return cargo;
}

export async function actualizarCargoCatalogoAction(id: string, datos: DatosCargoCatalogo): Promise<void> {
  await exigirAccesoCotizador("administrar_catalogo_cargos");
  await actualizarCargoCatalogo(id, datos);
  revalidatePath("/cotizador/catalogos");
}

export async function desactivarCargoCatalogoAction(id: string): Promise<void> {
  await exigirAccesoCotizador("administrar_catalogo_cargos");
  await desactivarCargoCatalogo(id);
  revalidatePath("/cotizador/catalogos");
}

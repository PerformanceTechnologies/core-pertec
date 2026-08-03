"use server";

import { revalidatePath } from "next/cache";
import { exigirAccesoCotizador } from "@/lib/cotizador";
import { actualizarEmpresa, type DatosEmpresa } from "@/lib/cotizador/empresas-datos";

export async function actualizarEmpresaAction(id: string, datos: DatosEmpresa): Promise<void> {
  await exigirAccesoCotizador("administrar_empresas");
  await actualizarEmpresa(id, datos);
  revalidatePath("/cotizador/empresas");
  // El encabezado del ECO-1 se arma con estos datos, así que la vista de cada
  // cotización tiene que volver a renderizarse para tomarlos.
  revalidatePath("/cotizador", "layout");
}

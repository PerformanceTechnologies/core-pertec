import "server-only";
import { cargarRepositorio, exigirRepositorio, type Permisos, type Repositorio } from "./datos";

/** Lo que necesita cada página: permisos y el repositorio, o el error de SharePoint para mostrarlo. */
export async function datosDePagina(): Promise<{ permisos: Permisos; repo: Repositorio | null; error: string | null }> {
  const { permisos } = await exigirRepositorio();
  try {
    return { permisos, repo: await cargarRepositorio(permisos), error: null };
  } catch (e) {
    console.error("[repositorio-legal] no se pudo leer SharePoint:", e instanceof Error ? e.message : e);
    return { permisos, repo: null, error: e instanceof Error ? e.message : "Error desconocido." };
  }
}

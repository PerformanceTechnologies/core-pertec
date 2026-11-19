import { redirect } from "next/navigation";
import ErrorSharePoint from "@/components/repositorio-legal/ErrorSharePoint";
import OrdenarRepositorio from "@/components/repositorio-legal/OrdenarRepositorio";
import { cargarRepositorioCompleto, exigirRepositorio, type Repositorio } from "@/lib/repositorio-legal/datos";
import { RUTA_REPOSITORIO_LEGAL } from "@/lib/repositorio-legal/modelo";
import { planDeOrden, resumirPlan } from "@/lib/repositorio-legal/orden";

/** Ordenar el repositorio en SharePoint. Solo administradores (quienes ven lo confidencial). */
export default async function OrdenarPage() {
  const { permisos } = await exigirRepositorio();
  if (!permisos.confidencial) redirect(RUTA_REPOSITORIO_LEGAL);

  let repo: Repositorio | null = null;
  let error = "";
  try {
    repo = await cargarRepositorioCompleto({ fresco: true, incluirOcultos: true });
  } catch (e) {
    error = e instanceof Error ? e.message : "Error desconocido.";
  }
  if (!repo) return <ErrorSharePoint mensaje={error} volver={`${RUTA_REPOSITORIO_LEGAL}/ordenar`} />;

  const ops = planDeOrden(repo.documentos, repo.sociedades);
  return <OrdenarRepositorio sociedades={repo.sociedades} porOmisionInicial={repo.porOmision} opsIniciales={ops} resumenInicial={resumirPlan(ops)} />;
}

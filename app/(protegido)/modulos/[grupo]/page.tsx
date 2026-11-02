import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { obtenerUsuarioActivo } from "@/lib/usuarios";
import { listarAplicaciones } from "@/lib/aplicaciones";
import { contextoDeEmpresa } from "@/lib/empresas";
import { tieneDatosCargados } from "@/lib/empresas-modelo";
import { listarContratosDelMenu } from "@/lib/contratos/contratos";
import { filtrarAppsDelUsuario, subpanelesFinanzasDelMenu } from "@/lib/menu-usuario";
import { armarMenu } from "@/lib/menu-modelo";
import VistaDeModulo from "@/components/modulos/VistaDeModulo";

// Sin caché, igual que el layout: lo que se ve acá depende de los permisos de la persona.
export const dynamic = "force-dynamic";

/**
 * La página de un módulo del menú (Finanzas, CRM, Página web…): sus submódulos como cartillas.
 *
 * Es a donde lleva el nombre del módulo en la barra lateral. Antes, tocar un módulo solo lo
 * plegaba y la persona seguía mirando el Inicio; acá "entra" al módulo y ve todo lo que tiene
 * adentro de una vez, con una línea de qué hace cada cosa.
 *
 * Arma el menú con la MISMA función y los mismos permisos que la barra (armarMenu), así que
 * una cartilla nunca aparece para quien no ve esa puerta en el menú. Si el módulo no existe o
 * la persona no ve nada de él, es un 404, igual que cualquier otra ruta que no le corresponde.
 */
export default async function ModuloPage({ params }: { params: Promise<{ grupo: string }> }) {
  const { grupo: slug } = await params;

  const session = await auth();
  const usuario = await obtenerUsuarioActivo(session?.user?.email);
  if (!usuario) return null; // el layout ya redirige antes de llegar aquí

  const apps = filtrarAppsDelUsuario(await listarAplicaciones(), usuario);
  const [subpanelesFinanzas, empresa] = await Promise.all([
    subpanelesFinanzasDelMenu(usuario, apps),
    contextoDeEmpresa(usuario.id, usuario.rol),
  ]);

  const grupo = armarMenu(apps, subpanelesFinanzas, { admin: usuario.rol === "admin" }).find(
    (g) => g.slug === slug,
  );
  if (!grupo) notFound();

  // Los contratos son de PERTEC: parado en otra empresa no se listan (igual que en el menú).
  const contratos =
    grupo.slug === "contratos" && tieneDatosCargados(empresa.activa) ? await listarContratosDelMenu() : [];

  return <VistaDeModulo grupo={grupo} contratos={contratos} />;
}

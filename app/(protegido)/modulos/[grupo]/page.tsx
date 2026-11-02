import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { obtenerUsuarioActivo } from "@/lib/usuarios";
import { listarAplicaciones } from "@/lib/aplicaciones";
import { contextoDeEmpresa } from "@/lib/empresas";
import { tieneDatosCargados } from "@/lib/empresas-modelo";
import { listarContratosDelMenu } from "@/lib/contratos/contratos";
import { filtrarAppsDelUsuario, subpanelesFinanzasDelMenu } from "@/lib/menu-usuario";
import { armarMenu } from "@/lib/menu-modelo";
import { cargarResumenDeItem, RUTAS_CON_RESUMEN } from "@/lib/modulos-resumen";
import { claveDeResumen, type ResumenOpcional } from "@/lib/modulos-resumen-modelo";
import VistaDeModulo from "@/components/modulos/VistaDeModulo";

// Sin caché, igual que el layout: lo que se ve acá depende de los permisos de la persona.
export const dynamic = "force-dynamic";

/**
 * La página de un módulo del menú (Finanzas, CRM, Inventario…): el resumen de todos sus submódulos.
 *
 * Es a donde lleva el nombre del módulo en la barra lateral. Entra al módulo y muestra, de una
 * vez, cada submódulo con sus cifras clave, lo que pide atención y atajos a sus pantallas.
 *
 * Arma el menú con la MISMA función y los mismos permisos que la barra (armarMenu), así que
 * un panel nunca aparece para quien no ve esa puerta en el menú. Si el módulo no existe o
 * la persona no ve nada de él, es un 404, igual que cualquier otra ruta que no le corresponde.
 *
 * Las cifras se piden aquí SIN esperarlas: se arma una promesa por submódulo y la vista las
 * consume dentro de Suspense, así que la página sale enseguida y cada panel completa su cifras
 * cuando llegan (ver lib/modulos-resumen.ts: ninguna rechaza ni tarda más de ocho segundos).
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

  // Los datos de los módulos son de PERTEC: parado en otra empresa no se listan ni se cuentan
  // (igual que en el menú). Administración es del Core, no de una empresa: siempre tiene cifras.
  const delCore = grupo.slug === "administracion";
  const conDatos = delCore || tieneDatosCargados(empresa.activa);

  const contratos =
    grupo.slug === "contratos" && conDatos ? await listarContratosDelMenu() : [];

  const resumenes = new Map<string, Promise<ResumenOpcional>>();
  if (conDatos) {
    const ctx = { usuario, hoy: new Date() };
    for (const item of grupo.items) {
      const clave = claveDeResumen(item);
      if (clave && RUTAS_CON_RESUMEN.includes(clave)) resumenes.set(clave, cargarResumenDeItem(item, ctx));
    }
  }

  return (
    <VistaDeModulo
      grupo={grupo}
      contratos={contratos}
      resumenes={resumenes}
      empresaSinDatos={conDatos ? null : (empresa.activa?.nombre ?? "esta empresa")}
    />
  );
}

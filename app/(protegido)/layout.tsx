import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { obtenerUsuarioActivo } from "@/lib/usuarios";
import { listarAplicaciones } from "@/lib/aplicaciones";
import BarraLateral from "@/components/BarraLateral";
import BarraSuperior from "@/components/BarraSuperior";
import { HUECO_DE_BARRA } from "@/lib/estilos";
import BotonSubir from "@/components/BotonSubir";
import NavInferior from "@/components/NavInferior";
import PanelIndicadores from "@/components/finanzas/PanelIndicadores";
import { listarContratosDelMenu } from "@/lib/contratos/contratos";
import { contextoDeEmpresa } from "@/lib/empresas";
import { tieneDatosCargados } from "@/lib/empresas-modelo";
import { filtrarAppsDelUsuario, subpanelesFinanzasDelMenu } from "@/lib/menu-usuario";

// Sin caché: cada navegación vuelve a consultar Supabase, así que si el
// admin borra o desactiva a alguien, esa persona queda fuera en la
// siguiente página que cargue, no cuando expire su sesión.
export const dynamic = "force-dynamic";

export default async function LayoutProtegido({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user?.email) redirect("/ingresar");

  // El catalogo de aplicaciones no depende de quien sea el usuario: se pide al
  // mismo tiempo y no despues. Encadenadas eran dos viajes a Supabase seguidos
  // en el camino critico de toda pagina protegida.
  const promesaApps = listarAplicaciones();

  const usuario = await obtenerUsuarioActivo(session.user.email);
  if (!usuario) redirect("/ingresar?error=sin_acceso");

  const todasLasApps = await promesaApps;
  const apps = filtrarAppsDelUsuario(todasLasApps, usuario);

  // Empresa, subpaneles de Finanzas y contratos del menú se piden a la vez (antes iban uno tras
  // otro). Los contratos son de PERTEC: se piden si la persona ve la app y se descartan si la
  // empresa activa no tiene datos cargados.
  const veContratos = apps.some((app) => app.slug === "contratos");
  const [empresa, subpanelesFinanzas, contratosDelMenu] = await Promise.all([
    contextoDeEmpresa(usuario.id, usuario.rol),
    subpanelesFinanzasDelMenu(usuario, apps),
    veContratos ? listarContratosDelMenu() : Promise.resolve([]),
  ]);
  const conDatos = tieneDatosCargados(empresa.activa);
  const contratos = conDatos ? contratosDelMenu : [];

  return (
    <div className="min-h-screen" data-empresa={empresa.activa?.slug ?? "pertec"}>
      <BarraLateral
        correo={usuario.correo}
        rol={usuario.rol}
        apps={apps}
        contratos={contratos}
        empresaActiva={empresa.activa}
        subpanelesFinanzas={subpanelesFinanzas}
      />
      {/* La barra es FIJA (sale del flujo), así que el hueco se lo deja el
          contenido con un padding: ver BARRA_FIJA / HUECO_DE_BARRA en
          lib/estilos.ts, donde está el porqué. Antes eran dos ítems flex y la
          barra era `sticky`, que se descuadraba al llegar al fondo de las
          páginas con popovers.

          min-w-0 sigue haciendo falta: si algo adentro es muy ancho (la grilla
          del Gantt de Proyectos, con muchas columnas de día de ancho fijo), sin
          esto no scrollea internamente y empuja el layout más ancho que el
          viewport. */}
      <main className={`min-w-0 pb-24 pt-5 lg:py-8 ${HUECO_DE_BARRA}`}>
        <BarraSuperior
          veMiDia={apps.some((app) => app.url === "/mi-dia")}
          mostrarBuzon={conDatos}
          empresaActiva={empresa.activa}
          empresasPermitidas={empresa.permitidas}
        />
        {/* Solo en Finanzas, CRM y sus submódulos: la cartilla de indicadores, bajo la barra superior. */}
        <PanelIndicadores />
        {children}
      </main>
      <BotonSubir />
      <NavInferior veMiDia={apps.some((app) => app.url === "/mi-dia")} />
    </div>
  );
}

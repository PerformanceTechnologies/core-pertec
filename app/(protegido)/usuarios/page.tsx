import Link from "next/link";
import { IconPlus } from "@tabler/icons-react";
import { exigirAdmin } from "@/lib/autorizacion";
import { listarUsuarios } from "@/lib/usuarios";
import { listarAplicaciones } from "@/lib/aplicaciones";
import { empresaIdsPorUsuario, listarEmpresas } from "@/lib/empresas";
import { SLUG_POR_OMISION, type Empresa } from "@/lib/empresas-modelo";
import { appsAsignadasVigentes } from "@/lib/administracion-modelo";
import { haceCuanto } from "@/lib/modulos-resumen-modelo";
import EncabezadoAdmin from "@/components/admin/EncabezadoAdmin";
import ListaDeUsuarios, { type EmpresaDeFila, type FilaUsuario, type FiltroUsuarios } from "@/components/admin/ListaDeUsuarios";

export const dynamic = "force-dynamic";

const aMini = (e: Empresa): EmpresaDeFila => ({ id: e.id, slug: e.slug, logo: e.logo, nombre: e.nombre, color: e.color });

/** Los enlaces de antes (?rol=admin, ?estado=inactivos, ?acceso=sin-apps) siguen abriendo el filtro que pedían. */
function filtroDeLaDireccion(p: Record<string, string | string[] | undefined>): FiltroUsuarios {
  const v = (clave: string) => (Array.isArray(p[clave]) ? p[clave]?.[0] : p[clave]);
  if (v("acceso") === "sin-apps") return "sin-apps";
  if (v("rol") === "admin") return "admin";
  if (v("estado") === "inactivos") return "inactivos";
  if (v("tipo") === "invitados") return "invitados";
  return "todos";
}

/**
 * Administración › Usuarios: quién entra al Core. La lista busca y filtra en el navegador (son
 * decenas de personas, no miles); crear y editar viven en su propia pantalla.
 */
export default async function UsuariosPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const admin = await exigirAdmin();
  const parametros = await searchParams;
  const [usuarios, apps, empresas, empresasPorUsuario] = await Promise.all([listarUsuarios(), listarAplicaciones(), listarEmpresas(), empresaIdsPorUsuario()]);

  const idsDelCatalogo = new Set(apps.map((a) => a.id));
  const empresaPorId = new Map(empresas.map((e) => [e.id, e]));
  const porOmision = empresas.find((e) => e.slug === SLUG_POR_OMISION);

  const filas: FilaUsuario[] = usuarios.map((u) => ({
    id: u.id,
    nombre: u.nombre,
    correo: u.correo,
    esAdmin: u.rol === "admin",
    invitado: u.tipo === "invitado",
    activo: u.activo,
    esYo: u.id === admin.id,
    apps: appsAsignadasVigentes(u, idsDelCatalogo),
    empresas: (empresasPorUsuario.get(u.id) ?? []).map((id) => empresaPorId.get(id)).filter((e): e is Empresa => Boolean(e)).map(aMini),
    ultimoIngreso: u.ultimo_ingreso ? haceCuanto(u.ultimo_ingreso) : "Nunca",
  }));

  return (
    <div className="animar-entrada space-y-6">
      <EncabezadoAdmin
        titulo="Usuarios"
        descripcion="Quién entra al Core y a qué. Toca a una persona para cambiar su acceso."
        acciones={
          <Link
            href="/usuarios/nuevo"
            className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-naranjo px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-naranjo-suave focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-naranjo"
          >
            <IconPlus size={17} stroke={2.2} aria-hidden /> Nuevo usuario
          </Link>
        }
      />

      <ListaDeUsuarios
        filas={filas}
        porOmision={porOmision ? aMini(porOmision) : null}
        filtroInicial={filtroDeLaDireccion(parametros)}
        busquedaInicial={typeof parametros.q === "string" ? parametros.q : ""}
      />
    </div>
  );
}

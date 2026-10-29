import { IconBuildingSkyscraper } from "@tabler/icons-react";
import { auth } from "@/auth";
import { obtenerUsuarioActivo } from "@/lib/usuarios";
import { contextoDeEmpresa } from "@/lib/empresas";
import { tieneDatosCargados } from "@/lib/empresas-modelo";

/**
 * Envuelve un módulo con datos: si la empresa activa no tiene nada cargado en él,
 * muestra el aviso en vez de los datos de PERTEC. Ver tieneDatosCargados.
 *
 * Usuarios y Aplicaciones NO van envueltos: son del Core, no de una empresa.
 */
export default async function FiltroDeEmpresa({ children }: { children: React.ReactNode }) {
  const session = await auth();
  const usuario = await obtenerUsuarioActivo(session?.user?.email);
  if (!usuario) return null; // el layout protegido ya redirige antes de llegar acá

  const { activa } = await contextoDeEmpresa(usuario.id, usuario.rol);
  if (tieneDatosCargados(activa)) return children;

  return (
    <div className="mx-auto mt-16 max-w-md text-center">
      <span className="mx-auto grid h-12 w-12 place-items-center rounded-xl bg-tinta/5 text-tinta/40">
        <IconBuildingSkyscraper size={24} stroke={1.75} />
      </span>
      <h2 className="mt-4 text-lg font-bold text-tinta">Sin datos en {activa?.nombre}</h2>
      <p className="mt-1 text-sm text-gris">
        Este módulo todavía no tiene información de esta empresa. Cambia de empresa arriba del menú para ver
        la de otra.
      </p>
    </div>
  );
}

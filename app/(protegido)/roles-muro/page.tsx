import { redirect } from "next/navigation";
import { exigirAdmin } from "@/lib/autorizacion";
import { empresaDelMuro, personasDeEmpresa, rolesDelMuro } from "@/lib/muro";
import EncabezadoAdmin from "@/components/admin/EncabezadoAdmin";
import RolesMuro from "@/components/muro/RolesMuro";

export const dynamic = "force-dynamic";

/** Administración > Roles del Muro: quién puede borrar mensajes en el muro de la empresa activa. */
export default async function RolesMuroPage() {
  const usuario = await exigirAdmin();
  const empresa = await empresaDelMuro(usuario);
  if (!empresa) redirect("/");
  const [personas, roles] = await Promise.all([personasDeEmpresa(empresa), rolesDelMuro(empresa.id)]);

  return (
    <div className="animar-entrada space-y-6">
      <EncabezadoAdmin
        titulo="Roles del Muro"
        descripcion={`Quién puede borrar mensajes en el muro de ${empresa.nombre}. Para otra empresa, cámbiala en el selector de arriba.`}
      />
      <div className="max-w-3xl">
        <RolesMuro key={empresa.id} personas={personas} roles={roles} yo={usuario.correo.toLowerCase()} />
      </div>
    </div>
  );
}

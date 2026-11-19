import { redirect } from "next/navigation";
import { IconSignature } from "@tabler/icons-react";
import { sesionDeLaPeticion } from "@/lib/sesion-de-la-peticion";
import { obtenerUsuarioActivo } from "@/lib/usuarios";
import { firmaDe } from "@/lib/firma-correo";
import { HOJA } from "@/components/contactos/Visual";
import { AvatarUsuario } from "@/components/admin/VisualUsuarios";
import EditorDeFirma from "@/components/correo/EditorDeFirma";
import { guardarFirmaAction } from "../firma-correo/acciones";

/**
 * Mi perfil: lo que cada persona puede cambiar de sí misma. Por ahora, solo su firma de correo
 * (el resto —rol, aplicaciones, empresas— lo cambia un administrador en Usuarios).
 */
export default async function MiPerfilPage() {
  const usuario = await obtenerUsuarioActivo((await sesionDeLaPeticion())?.user?.email);
  if (!usuario) redirect("/ingresar");
  const invitado = usuario.tipo === "invitado";
  const png = invitado ? null : await firmaDe(usuario);

  return (
    <div className="animar-entrada mx-auto max-w-4xl space-y-5">
      <header className={`${HOJA} flex flex-wrap items-center gap-4 p-5 sm:p-6`}>
        <AvatarUsuario nombre={usuario.nombre} correo={usuario.correo} tipo={usuario.rol === "admin" ? "admin" : invitado ? "invitado" : "usuario"} grande />
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-gris">Mi perfil</p>
          <h1 className="break-words text-2xl font-extrabold leading-tight tracking-tight text-tinta">{usuario.nombre || usuario.correo}</h1>
          {usuario.nombre && <p className="break-all text-sm text-gris">{usuario.correo}</p>}
        </div>
      </header>

      <section className={`${HOJA} p-5 sm:p-6`}>
        <h2 className="flex items-center gap-2 text-sm font-bold text-tinta">
          <IconSignature size={18} className="text-naranjo" /> Firma de correo
        </h2>
        <p className="mt-1 text-xs text-gris">
          Se agrega al final de las cotizaciones, órdenes de compra, solicitudes de cotización y ofertas que envías desde el Core.
        </p>
        <div className="mt-4">
          {invitado ? (
            <p className="text-sm text-gris">Los invitados no tienen firma de correo: no envían correos a clientes ni proveedores desde el Core.</p>
          ) : (
            <EditorDeFirma actual={png ? `data:image/png;base64,${png}` : null} guardar={guardarFirmaAction} />
          )}
        </div>
      </section>
    </div>
  );
}

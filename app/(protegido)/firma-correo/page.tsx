import { redirect } from "next/navigation";
import { IconSignature } from "@tabler/icons-react";
import { sesionDeLaPeticion } from "@/lib/sesion-de-la-peticion";
import { obtenerUsuarioActivo } from "@/lib/usuarios";
import { firmaDe } from "@/lib/firma-correo";
import { HOJA, IconoTile } from "@/components/contactos/Visual";
import EditorDeFirma from "@/components/correo/EditorDeFirma";
import { guardarFirmaAction } from "./acciones";

async function firmaComoImagen(usuario: { id: string; tipo?: string | null }): Promise<string | null> {
  const png = await firmaDe(usuario);
  return png ? `data:image/png;base64,${png}` : null;
}

/** Tu firma de correo: la que el Core agrega al final de lo que envías a clientes y proveedores. */
export default async function FirmaCorreoPage() {
  const usuario = await obtenerUsuarioActivo((await sesionDeLaPeticion())?.user?.email);
  if (!usuario) redirect("/ingresar");

  return (
    <div className="animar-entrada mx-auto max-w-4xl space-y-5">
      <header className="flex items-center gap-3">
        <IconoTile Icono={IconSignature} tono="marca" tamano="grande" />
        <div>
          <h1 className="font-condensed text-2xl font-bold uppercase tracking-tight text-tinta">Firma de correo</h1>
          <p className="text-sm text-gris">
            Se agrega al final de las cotizaciones, órdenes de compra, solicitudes de cotización y ofertas que envías desde el Core.
          </p>
        </div>
      </header>

      <section className={`${HOJA} p-5 sm:p-6`}>
        {usuario.tipo === "invitado" ? (
          <p className="text-sm text-gris">Los invitados no tienen firma de correo: no envían correos a clientes ni proveedores desde el Core.</p>
        ) : (
          <EditorDeFirma actual={await firmaComoImagen(usuario)} guardar={guardarFirmaAction} />
        )}
      </section>
    </div>
  );
}

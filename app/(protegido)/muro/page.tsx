import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { obtenerUsuarioActivo } from "@/lib/usuarios";
import { empresaDelMuro, listarMensajes, personasDeEmpresa } from "@/lib/muro";
import MuroChat from "@/components/muro/MuroChat";

export const dynamic = "force-dynamic";

export default async function MuroPage() {
  const usuario = await obtenerUsuarioActivo((await auth())?.user?.email);
  if (!usuario) redirect("/ingresar");
  const empresa = await empresaDelMuro(usuario);
  if (!empresa) redirect("/");

  let inicial: Awaited<ReturnType<typeof listarMensajes>> = { mensajes: [], hayMas: false };
  let falta: string | null = null;
  try {
    inicial = await listarMensajes(empresa.id);
  } catch (e) {
    falta = e instanceof Error ? e.message : "No se pudo leer el muro.";
  }
  const personas = await personasDeEmpresa(empresa);

  return (
    <MuroChat
      key={empresa.id}
      empresa={{ id: empresa.id, nombre: empresa.nombre }}
      yo={{ correo: usuario.correo.toLowerCase(), nombre: usuario.nombre ?? usuario.correo, admin: usuario.rol === "admin" }}
      personas={personas}
      inicial={inicial.mensajes}
      hayMas={inicial.hayMas}
      aviso={falta}
    />
  );
}

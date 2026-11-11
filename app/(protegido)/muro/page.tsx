import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { obtenerUsuarioActivo } from "@/lib/usuarios";
import { empresaDelMuro, listarMensajes, permisoDeBorrar, personasDeEmpresa, reaccionesDe } from "@/lib/muro";
import MuroChat from "@/components/muro/MuroChat";

export const dynamic = "force-dynamic";

export default async function MuroPage() {
  const usuario = await obtenerUsuarioActivo((await auth())?.user?.email);
  if (!usuario) redirect("/ingresar");
  if (usuario.tipo === "invitado") redirect("/");
  const empresa = await empresaDelMuro(usuario);
  if (!empresa) redirect("/");

  let inicial: Awaited<ReturnType<typeof listarMensajes>> = { mensajes: [], respuestas: [], hayMas: false };
  let falta: string | null = null;
  try {
    inicial = await listarMensajes(empresa.id);
  } catch (e) {
    falta = e instanceof Error ? e.message : "No se pudo leer el muro.";
  }
  const admin = usuario.rol === "admin";
  const [personas, reacciones, borrar] = await Promise.all([
    personasDeEmpresa(empresa),
    reaccionesDe([...inicial.mensajes, ...inicial.respuestas].map((m) => m.id)),
    permisoDeBorrar(usuario, empresa.id),
  ]);

  return (
    <MuroChat
      key={empresa.id}
      empresa={{ id: empresa.id, nombre: empresa.nombre }}
      yo={{ correo: usuario.correo.toLowerCase(), nombre: usuario.nombre ?? usuario.correo, admin, borrar }}
      personas={personas}
      inicial={inicial.mensajes}
      respuestasIniciales={inicial.respuestas}
      reaccionesIniciales={reacciones ?? {}}
      hayMas={inicial.hayMas}
      aviso={falta}
    />
  );
}

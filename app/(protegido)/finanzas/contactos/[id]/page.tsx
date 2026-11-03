import { notFound } from "next/navigation";
import FichaContacto from "@/components/contactos/FichaContacto";
import { exigirAccesoContactos, listarContactos, obtenerContacto } from "@/lib/contactos";

export default async function FichaContactoPage({ params }: { params: Promise<{ id: string }> }) {
  await exigirAccesoContactos();
  const { id } = await params;
  const [contacto, todos] = await Promise.all([obtenerContacto(id), listarContactos()]);
  if (!contacto) notFound();
  const empresas = todos.filter((c) => c.tipoPersona === "empresa" && c.activo).map((c) => ({ id: c.id, razonSocial: c.razonSocial, rut: c.rut }));
  // La empresa de esta persona, o las personas que dicen ser contacto de esta empresa.
  const empresa = contacto.empresaId ? todos.find((c) => c.id === contacto.empresaId) ?? null : null;
  const vinculados = todos.filter((c) => c.empresaId === contacto.id && c.activo).map((c) => ({ id: c.id, nombre: c.razonSocial, correo: c.correo, telefono: c.telefono }));
  return (
    <FichaContacto
      contacto={contacto}
      empresas={empresas}
      empresa={empresa ? { id: empresa.id, razonSocial: empresa.razonSocial } : null}
      vinculados={vinculados}
    />
  );
}

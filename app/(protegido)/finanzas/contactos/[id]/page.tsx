import { notFound } from "next/navigation";
import FichaContacto from "@/components/contactos/FichaContacto";
import { exigirAccesoContactos, obtenerContacto } from "@/lib/contactos";

export default async function FichaContactoPage({ params }: { params: Promise<{ id: string }> }) {
  await exigirAccesoContactos();
  const { id } = await params;
  const contacto = await obtenerContacto(id);
  if (!contacto) notFound();
  return <FichaContacto contacto={contacto} />;
}

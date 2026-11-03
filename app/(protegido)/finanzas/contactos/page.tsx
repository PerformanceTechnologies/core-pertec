import ListaContactos from "@/components/contactos/ListaContactos";
import { exigirAccesoContactos, listarContactos } from "@/lib/contactos";

export default async function ContactosPage({ searchParams }: { searchParams: Promise<{ ver?: string; q?: string }> }) {
  const [usuario, todos, { ver, q }] = await Promise.all([exigirAccesoContactos(), listarContactos(), searchParams]);
  return <ListaContactos todos={todos} ver={ver} q={q} esAdmin={usuario.rol === "admin"} />;
}

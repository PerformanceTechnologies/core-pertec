import { notFound } from "next/navigation";
import { exigirAccesoCotizador, obtenerCotizacion } from "@/lib/cotizador";
import EditorCotizacion from "@/components/cotizador/EditorCotizacion";

export default async function CotizacionPage({ params }: { params: Promise<{ id: string }> }) {
  const { rol } = await exigirAccesoCotizador();
  const { id } = await params;

  const cotizacion = await obtenerCotizacion(id);
  if (!cotizacion) notFound();

  return <EditorCotizacion cotizacion={cotizacion} rol={rol} />;
}

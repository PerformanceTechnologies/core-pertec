import { notFound } from "next/navigation";
import { exigirAccesoApp } from "@/lib/autorizacion";
import { obtenerCotizacion } from "@/lib/cotizador";
import EditorCotizacion from "@/components/cotizador/EditorCotizacion";

const SLUG_APP = "cotizador";

export default async function CotizacionPage({ params }: { params: Promise<{ id: string }> }) {
  await exigirAccesoApp(SLUG_APP);
  const { id } = await params;

  const cotizacion = await obtenerCotizacion(id);
  if (!cotizacion) notFound();

  return <EditorCotizacion cotizacion={cotizacion} />;
}

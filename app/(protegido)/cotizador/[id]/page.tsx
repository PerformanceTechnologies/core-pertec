import { notFound } from "next/navigation";
import { exigirAccesoCotizador, obtenerCotizacion } from "@/lib/cotizador";
import { listarCatalogoCargos } from "@/lib/cotizador/catalogo-cargos";
import { obtenerEmpresaPorNombre } from "@/lib/cotizador/empresas-datos";
import EditorCotizacion from "@/components/cotizador/EditorCotizacion";

export default async function CotizacionPage({ params }: { params: Promise<{ id: string }> }) {
  const { usuario, rol } = await exigirAccesoCotizador();
  const { id } = await params;

  const [cotizacion, catalogoCargos] = await Promise.all([obtenerCotizacion(id), listarCatalogoCargos()]);
  if (!cotizacion) notFound();

  // La identidad legal depende de la empresa de la cotización, así que se pide
  // recién acá (no en paralelo con las de arriba).
  const empresa = await obtenerEmpresaPorNombre(cotizacion.empresa);
  const preparadoPor = { nombre: usuario.nombre ?? usuario.correo, correo: usuario.correo };

  return (
    <EditorCotizacion
      cotizacion={cotizacion}
      rol={rol}
      catalogoCargos={catalogoCargos}
      preparadoPor={preparadoPor}
      empresa={empresa}
    />
  );
}

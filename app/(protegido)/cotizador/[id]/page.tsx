import { notFound } from "next/navigation";
import { esObra, exigirAccesoCotizador, obtenerCotizacion } from "@/lib/cotizador";
import { listarCatalogoCargos } from "@/lib/cotizador/catalogo-cargos";
import { obtenerEmpresaPorNombre } from "@/lib/cotizador/empresas-datos";
import EditorCotizacion from "@/components/cotizador/EditorCotizacion";
import EditorObra from "@/components/cotizador/obra/EditorObra";

export default async function CotizacionPage({ params }: { params: Promise<{ id: string }> }) {
  const { usuario, rol } = await exigirAccesoCotizador();
  const { id } = await params;

  const [cotizacion, catalogoCargos] = await Promise.all([obtenerCotizacion(id), listarCatalogoCargos()]);
  if (!cotizacion) notFound();

  // La identidad legal depende de la empresa de la cotización, así que se pide
  // recién acá (no en paralelo con las de arriba).
  const empresa = await obtenerEmpresaPorNombre(cotizacion.empresa);
  const preparadoPor = { nombre: usuario.nombre ?? usuario.correo, correo: usuario.correo };

  // Dos editores, uno por forma de la entrada. El `input` se desestructura y se
  // vuelve a poner en el objeto para que TypeScript estreche el tipo de toda la
  // cotización: sin eso haría falta un cast, y un cast acá es justo lo que
  // dejaría pasar un input de obra al editor mensual.
  const { input } = cotizacion;
  if (esObra(input)) {
    return <EditorObra cotizacion={{ ...cotizacion, input }} rol={rol} catalogoCargos={catalogoCargos} />;
  }

  return (
    <EditorCotizacion
      cotizacion={{ ...cotizacion, input }}
      rol={rol}
      catalogoCargos={catalogoCargos}
      preparadoPor={preparadoPor}
      empresa={empresa}
    />
  );
}

import { esObra, exigirCotizacion } from "@/lib/cotizador";
import { listarCatalogoCargos } from "@/lib/cotizador/catalogo-cargos";
import { obtenerEmpresaPorNombre } from "@/lib/cotizador/empresas-datos";
import EditorCotizacion from "@/components/cotizador/EditorCotizacion";
import EditorObra from "@/components/cotizador/obra/EditorObra";

export default async function CotizacionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // Trae la cotización y verifica que sea de quien la pide: filtrar el listado
  // no alcanza, porque la URL de una cotización ajena se puede pegar a mano.
  const [{ usuario, rol, cotizacion }, catalogoCargos] = await Promise.all([
    exigirCotizacion(id),
    listarCatalogoCargos(),
  ]);

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

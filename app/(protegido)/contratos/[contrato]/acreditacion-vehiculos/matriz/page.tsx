import Link from "@/components/contratos/Enlace";
import EncabezadoDeVehiculos from "@/components/contratos/EncabezadoDeVehiculos";
import MatrizDeAcreditacion, { TERMINOS_DE_MATRIZ_DE_VEHICULOS } from "@/components/contratos/MatrizDeAcreditacion";
import { exigirAccesoApp } from "@/lib/contratos/autorizacion";
import { cargarFlota } from "@/lib/contratos/vehiculos";
import { descripcionDeVehiculo, formatearPatente } from "@/lib/contratos/vehiculos-modelo";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function MatrizDeVehiculosPage({
  searchParams,
}: {
  searchParams: Promise<{ [clave: string]: string | string[] | undefined }>;
}) {
  await exigirAccesoApp("acreditacion-vehiculos");
  const consulta = await searchParams;

  // El filtro viaja en la URL y no en estado del navegador: así la vista filtrada se puede mandar por
  // enlace («mira cómo van las camionetas»).
  const tipoPedido = typeof consulta.tipo === "string" && UUID.test(consulta.tipo) ? consulta.tipo : null;
  const conBajas = consulta.bajas === "1";

  const { tipos, categorias, vehiculos } = await cargarFlota();

  const visibles = vehiculos.filter(
    (v) => (conBajas || v.vehiculo.activo) && (!tipoPedido || v.vehiculo.categoriaId === tipoPedido),
  );

  // Los documentos que ningún tipo del filtro pide no tienen nada que mostrar: una columna entera de
  // puntos grises.
  const tiposVisibles = tipos.filter((t) => visibles.some((v) => v.analisis.celdas.get(t.id)?.requerido));

  const enlace = (tipo: string | null, bajas: boolean) => {
    const q = new URLSearchParams();
    if (tipo) q.set("tipo", tipo);
    if (bajas) q.set("bajas", "1");
    const texto = q.toString();
    return texto ? `?${texto}` : "?";
  };

  const chip = (activo: boolean) =>
    `rounded-lg border px-3 py-1.5 text-xs font-bold transition ${
      activo ? "border-cian bg-cian-lavado text-azul" : "border-borde text-gris hover:border-cian hover:text-azul"
    }`;

  return (
    <div className="animar-entrada">
      <EncabezadoDeVehiculos actual="matriz" />

      <p className="mt-4 max-w-3xl text-sm text-gris">
        Qué falta en toda la flota, de un vistazo. Cada columna es un documento y cada fila un vehículo.
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Link href={enlace(null, conBajas)} className={chip(!tipoPedido)}>
          Todos los tipos
        </Link>
        {categorias
          .filter((c) => c.activo || c.id === tipoPedido)
          .map((c) => (
            <Link key={c.id} href={enlace(c.id, conBajas)} className={chip(tipoPedido === c.id)}>
              {c.nombre}
            </Link>
          ))}
        <Link href={enlace(tipoPedido, !conBajas)} className={`ml-auto ${chip(conBajas)}`}>
          {conBajas ? "Ocultar bajas" : "Incluir bajas"}
        </Link>
      </div>

      <MatrizDeAcreditacion
        hrefBase="/contratos/acreditacion-vehiculos"
        terminos={TERMINOS_DE_MATRIZ_DE_VEHICULOS}
        tipos={tiposVisibles}
        filas={visibles.map((v) => ({
          id: v.vehiculo.id,
          numero: v.vehiculo.numero,
          nombre: formatearPatente(v.vehiculo.patente),
          cargo: [descripcionDeVehiculo(v.vehiculo), v.categoria?.nombre].filter(Boolean).join(" · ") || "—",
          porcentaje: v.analisis.avance.porcentaje,
          activo: v.vehiculo.activo,
          celdas: v.analisis.celdas,
        }))}
      />
    </div>
  );
}

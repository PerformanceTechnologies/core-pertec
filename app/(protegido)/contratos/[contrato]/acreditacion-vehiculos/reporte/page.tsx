import EncabezadoDeVehiculos from "@/components/contratos/EncabezadoDeVehiculos";
import ReporteDeAcreditacion, { TERMINOS_DE_REPORTE_DE_VEHICULOS } from "@/components/contratos/ReporteDeAcreditacion";
import { exigirAccesoApp } from "@/lib/contratos/autorizacion";
import { cargarFlota } from "@/lib/contratos/vehiculos";
import { agruparReporte, documentosMasFaltantes } from "@/lib/contratos/acreditacion-reporte";

export const dynamic = "force-dynamic";

export default async function ReporteDeVehiculosPage() {
  await exigirAccesoApp("acreditacion-vehiculos");
  const { tipos, vehiculos } = await cargarFlota();

  const base = vehiculos.map((v) => ({
    activo: v.vehiculo.activo,
    cargo: v.categoria?.nombre ?? "Sin tipo",
    faena: v.vehiculo.datos.faena,
    analisis: v.analisis,
  }));

  return (
    <div className="animar-entrada">
      <EncabezadoDeVehiculos actual="reporte" />

      <p className="mt-4 max-w-3xl text-sm text-gris">
        Cómo va la acreditación por tipo de vehículo y por faena, y qué documentos son los que más faltan.
        Cuenta solo a los vehículos activos.
      </p>

      <ReporteDeAcreditacion
        terminos={TERMINOS_DE_REPORTE_DE_VEHICULOS}
        porCargo={agruparReporte(base, (v) => v.cargo)}
        porFaena={agruparReporte(base, (v) => v.faena?.trim() || "Sin faena")}
        faltantes={documentosMasFaltantes(base, tipos)}
      />
    </div>
  );
}

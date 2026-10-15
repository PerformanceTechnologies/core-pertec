import EncabezadoDeAcreditacion from "@/components/contratos/EncabezadoDeAcreditacion";
import ReporteDeAcreditacion from "@/components/contratos/ReporteDeAcreditacion";
import { exigirAccesoApp } from "@/lib/contratos/autorizacion";
import { cargarNomina } from "@/lib/contratos/acreditacion";
import { agruparReporte, documentosMasFaltantes } from "@/lib/contratos/acreditacion-reporte";
import { estaContratada } from "@/lib/contratos/acreditacion-modelo";

export const dynamic = "force-dynamic";

export default async function ReportePage() {
  const usuario = await exigirAccesoApp("acreditacion");
  const { tipos, personas } = await cargarNomina();

  const base = personas.map((p) => ({
    activo: p.persona.activo,
    cargo: p.cargo?.nombre ?? "Sin cargo",
    faena: p.persona.datos.faena,
    contratada: estaContratada(p.persona),
    analisis: p.analisis,
  }));

  return (
    <div className="animar-entrada">
      <EncabezadoDeAcreditacion actual="reporte" esAdmin={usuario.rol === "admin"} />

      <p className="mt-4 max-w-3xl text-sm text-gris">
        Cómo va la acreditación por cargo y por faena, y qué documentos son los que más faltan.
        Cuenta solo a las personas activas.
      </p>

      <ReporteDeAcreditacion
        porCargo={agruparReporte(base, (p) => p.cargo)}
        porFaena={agruparReporte(base, (p) => p.faena?.trim() || "Sin faena")}
        faltantes={documentosMasFaltantes(base, tipos)}
      />
    </div>
  );
}

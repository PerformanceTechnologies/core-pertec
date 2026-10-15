import { IconAlertTriangle } from "@tabler/icons-react";
import EncabezadoDeVehiculos from "@/components/contratos/EncabezadoDeVehiculos";
import ListaDeFlota, { type FilaDeFlota } from "@/components/contratos/ListaDeFlota";
import PanelDeAtencionDeFlota from "@/components/contratos/PanelDeAtencionDeFlota";
import ResumenDeFlota from "@/components/contratos/ResumenDeFlota";
import { exigirAccesoApp } from "@/lib/contratos/autorizacion";
import { fechaCorta, resumirDotacion } from "@/lib/contratos/acreditacion-modelo";
import { cargarFlota } from "@/lib/contratos/vehiculos";
import {
  alertasDeVehiculo,
  descripcionDeVehiculo,
  ordenarAlertasDeVehiculos,
} from "@/lib/contratos/vehiculos-modelo";

export const dynamic = "force-dynamic";

export default async function FlotaPage() {
  const usuario = await exigirAccesoApp("acreditacion-vehiculos");
  const esAdmin = usuario.rol === "admin";

  let flota;
  try {
    flota = await cargarFlota();
  } catch (e) {
    return (
      <div className="animar-entrada">
        <EncabezadoDeVehiculos actual="nomina" />
        <div className="mt-8 rounded-xl border border-amber-200 bg-amber-50 p-5">
          <p className="flex items-center gap-2 text-sm font-bold text-amber-700">
            <IconAlertTriangle size={18} />
            No se pudo leer la base de datos
          </p>
          <p className="mt-1.5 text-xs leading-relaxed text-amber-700/90">
            ¿Se corrió la migración <code className="font-mono">supabase/contratos/0001_contratos.sql</code> en
            Supabase? Detalle: {e instanceof Error ? e.message : "desconocido"}
          </p>
        </div>
      </div>
    );
  }

  const { contrato, dotacionRequerida, tipos, categorias, vehiculos } = flota;

  const filas: FilaDeFlota[] = vehiculos.map(({ vehiculo, categoria, analisis }) => ({
    id: vehiculo.id,
    numero: vehiculo.numero,
    patente: vehiculo.patente,
    descripcion: descripcionDeVehiculo(vehiculo),
    categoriaId: vehiculo.categoriaId,
    categoria: categoria?.nombre ?? "—",
    conductor: vehiculo.datos.conductor,
    faena: vehiculo.datos.faena,
    activo: vehiculo.activo,
    etapa: analisis.etapa,
    porcentaje: analisis.avance.porcentaje,
    subidos: analisis.avance.subidos,
    total: analisis.avance.total,
    vencidos: analisis.vencidos,
    porVencer: analisis.porVencer,
    tieneCarpeta: Boolean(vehiculo.carpetaItemId),
  }));

  // Los avisos solo de los vehículos activos: de uno que ya no está en la flota no hay nada que renovar.
  const alertas = ordenarAlertasDeVehiculos(
    vehiculos.filter((v) => v.vehiculo.activo).flatMap((v) => alertasDeVehiculo(v.vehiculo, v.analisis, tipos)),
  );

  return (
    <div className="animar-entrada">
      <EncabezadoDeVehiculos actual="nomina" />

      <p className="mt-4 text-sm text-gris">
        <strong className="text-tinta">{contrato.nombre}</strong>
        {contrato.fechaInicio && <> · inicio {fechaCorta(contrato.fechaInicio)}</>}
        {contrato.administrador && <> · administra {contrato.administrador}</>}
      </p>

      {/* Cinco tarjetas, cada una con su detalle en una ventana. La quinta es la dotación: cuántos
          vehículos se deben contratar y cuántos faltan (cuenta a los ACTIVOS: uno dado de baja ya
          no está en la flota). */}
      <ResumenDeFlota
        vehiculos={vehiculos}
        categorias={categorias}
        tipos={tipos}
        dotacion={resumirDotacion(
          dotacionRequerida,
          categorias,
          vehiculos.filter((v) => v.vehiculo.activo).map((v) => ({ cargoId: v.vehiculo.categoriaId })),
        )}
        totalDelContrato={dotacionRequerida}
      />

      <PanelDeAtencionDeFlota alertas={alertas} />

      <div className="mt-8">
        <ListaDeFlota
          filas={filas}
          esAdmin={esAdmin}
          categorias={categorias.filter((c) => c.activo).map((c) => ({ id: c.id, nombre: c.nombre }))}
        />
      </div>
    </div>
  );
}

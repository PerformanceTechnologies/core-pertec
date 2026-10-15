import { IconAlertTriangle } from "@tabler/icons-react";
import EncabezadoDeAcreditacion from "@/components/contratos/EncabezadoDeAcreditacion";
import ListaDeNomina, { type FilaDeNomina } from "@/components/contratos/ListaDeNomina";
import PanelDeAtencion from "@/components/contratos/PanelDeAtencion";
import ResumenDeNomina from "@/components/contratos/ResumenDeNomina";
import { exigirAccesoApp } from "@/lib/contratos/autorizacion";
import { alertasDePersona, estaContratada, fechaCorta, ordenarAlertas, resumirDotacion } from "@/lib/contratos/acreditacion-modelo";
import { cargarNomina } from "@/lib/contratos/acreditacion";
import { alertasDeCapacitaciones, registrarCapacitaciones, resumirCapacitaciones } from "@/lib/contratos/capacitaciones-modelo";

export const dynamic = "force-dynamic";

export default async function AcreditacionPage() {
  const usuario = await exigirAccesoApp("acreditacion");
  const esAdmin = usuario.rol === "admin";

  let nomina;
  try {
    nomina = await cargarNomina();
  } catch (e) {
    return (
      <div className="animar-entrada">
        <EncabezadoDeAcreditacion actual="nomina" esAdmin={esAdmin} />
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

  const { contrato, tipos, cargos, personas } = nomina;

  const filas: FilaDeNomina[] = personas.map(({ persona, cargo, analisis }) => ({
    id: persona.id,
    numero: persona.numero,
    nombre: persona.nombre,
    rut: persona.rut,
    cargoId: persona.cargoId,
    cargo: cargo?.nombre ?? "—",
    faena: persona.datos.faena,
    turno: persona.datos.turno,
    activo: persona.activo,
    etapa: analisis.etapa,
    porcentaje: analisis.avance.porcentaje,
    subidos: analisis.avance.subidos,
    total: analisis.avance.total,
    vencidos: analisis.vencidos,
    porVencer: analisis.porVencer,
    diasTermino: analisis.diasTermino,
    tieneCarpeta: Boolean(persona.carpetaItemId),
    contratada: estaContratada(persona),
  }));

  // Los avisos solo de las personas activas: de quien ya no está no hay nada que
  // renovar.
  const alertas = ordenarAlertas(
    personas
      .filter((p) => p.persona.activo)
      // Documentos por vencer, contratos que terminan y cursos o exámenes reservados cuya fecha ya
      // llegó sin que nadie anotara que se rindieron.
      .flatMap((p) => [
        ...alertasDePersona(p.persona, p.analisis, tipos),
        ...alertasDeCapacitaciones(p.persona, p.cursos, nomina.hoy),
      ]),
  );

  // Solo las personas activas: de quien se dio de baja no queda nada por rendir.
  const capacitaciones = registrarCapacitaciones(
    personas
      .filter((p) => p.persona.activo)
      .map((p) => ({
        id: p.persona.id,
        nombre: p.persona.nombre,
        rut: p.persona.rut,
        cargo: p.cargo?.nombre ?? "—",
        cursos: p.cursos,
      })),
    nomina.hoy,
  );

  return (
    <div className="animar-entrada">
      <EncabezadoDeAcreditacion actual="nomina" esAdmin={esAdmin} />

      <p className="mt-4 text-sm text-gris">
        <strong className="text-tinta">{contrato.nombre}</strong>
        {contrato.fechaInicio && <> · inicio {fechaCorta(contrato.fechaInicio)}</>}
        {contrato.administrador && <> · administra {contrato.administrador}</>}
      </p>

      {/* Seis tarjetas, cada una con su detalle en una ventana. La sexta es la dotación:
          cuántas personas se deben contratar y cuántas faltan (cuenta a las ACTIVAS: a
          quien se dio de baja ya no cubre el puesto). */}
      <ResumenDeNomina
        personas={personas}
        cargos={cargos}
        tipos={tipos}
        dotacion={resumirDotacion(
          contrato.dotacionRequerida,
          cargos,
          // Solo las CONTRATADAS: activas, con fecha de ingreso y sin la marca «sin contrato aún».
          personas.filter((p) => estaContratada(p.persona)).map((p) => ({ cargoId: p.persona.cargoId })),
          personas.filter((p) => p.persona.activo).map((p) => ({ cargoId: p.persona.cargoId })),
        )}
        totalDelContrato={contrato.dotacionRequerida}
        capacitaciones={resumirCapacitaciones(capacitaciones)}
      />

      <PanelDeAtencion alertas={alertas} />

      <div className="mt-8">
        <ListaDeNomina
          filas={filas}
          esAdmin={esAdmin}
          cargos={cargos.filter((c) => c.activo).map((c) => ({ id: c.id, nombre: c.nombre }))}
        />
      </div>
    </div>
  );
}

import "server-only";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { odooCampos, odooSearchRead } from "./odoo-cliente";
import { eliminarNoVigentes } from "./limpieza";
import { obtenerCompania } from "./companias";

function nombreDeTupla(t: unknown): string | null {
  return Array.isArray(t) && typeof t[1] === "string" ? t[1] : null;
}
function idDeTupla(t: unknown): number | null {
  return Array.isArray(t) && typeof t[0] === "number" ? t[0] : null;
}
function comoTexto(valor: unknown): string | null {
  if (Array.isArray(valor)) return nombreDeTupla(valor);
  if (typeof valor === "string") return valor || null;
  return null;
}
function comoNumero(valor: unknown): number {
  return typeof valor === "number" ? valor : 0;
}

interface LeadOdoo {
  id: number;
  [campo: string]: unknown;
}

/**
 * Los nombres posibles de cada dato en crm.lead, del preferido al mas viejo.
 *
 * Igual que en Flota: no se piden nombres fijos, se le pregunta a Odoo cuales tiene
 * (fields_get) y se usa el primero de cada lista que exista. crm.lead cambia de campos
 * entre versiones de Odoo —`lost_reason` paso a `lost_reason_id`, `won_status` no existe
 * en las viejas— y un nombre que no esta tumba la sincronizacion entera con "Invalid
 * field", que es lo que le paso a Flota tres dias seguidos.
 *
 * Lo unico imprescindible es el nombre: sin eso no hay nada que listar.
 */
const CAMPOS_LEAD = {
  nombre: ["name"],
  cliente: ["partner_id"],
  contacto: ["contact_name"],
  razonSocial: ["partner_name"],
  etapa: ["stage_id"],
  tipo: ["type"],
  activa: ["active"],
  estadoGanada: ["won_status"],
  motivoPerdida: ["lost_reason_id", "lost_reason"],
  montoEsperado: ["expected_revenue"],
  montoPonderado: ["prorated_revenue"],
  probabilidad: ["probability"],
  vendedor: ["user_id"],
  equipo: ["team_id"],
  empresa: ["company_id"],
  creacion: ["create_date"],
  cierreEstimado: ["date_deadline"],
  cierreReal: ["date_closed"],
  conversion: ["date_conversion"],
  ultimoMovimiento: ["date_last_stage_update", "write_date"],
  diasParaAsignar: ["day_open"],
  diasParaCerrar: ["day_close"],
  prioridad: ["priority"],
  origen: ["source_id"],
  medio: ["medium_id"],
  campana: ["campaign_id"],
  etiquetas: ["tag_ids"],
  correo: ["email_from"],
  telefono: ["phone", "mobile"],
  ciudad: ["city"],
  actividadFecha: ["activity_date_deadline"],
  actividadResumen: ["activity_summary"],
  actividadTipo: ["activity_type_id"],
} as const;

type CamposDeLead = Record<keyof typeof CAMPOS_LEAD, string | null>;

/** crm.lead.priority es "0".."3"; en la interfaz de Odoo son las estrellitas. */
const PRIORIDADES: Record<string, string> = {
  "0": "Normal",
  "1": "Media",
  "2": "Alta",
  "3": "Muy alta",
};

const TOPE = 2000;

export function resolverCamposLead(camposQueTiene: Record<string, { type: string }>): CamposDeLead {
  const campo = Object.fromEntries(
    Object.entries(CAMPOS_LEAD).map(([que, posibles]) => [
      que,
      posibles.find((nombre) => camposQueTiene[nombre] !== undefined) ?? null,
    ]),
  ) as CamposDeLead;

  if (campo.nombre === null) {
    throw new Error(
      `crm.lead ya no tiene el campo del nombre (${CAMPOS_LEAD.nombre.join(", ")}). Los que tiene hoy: ` +
        `${Object.keys(camposQueTiene).sort().join(", ")}`,
    );
  }
  return campo;
}

/** Los campos que hay que pedirle a Odoo, sin repetidos y sin los que no existen. */
export function camposAPedirDeLead(campo: CamposDeLead): string[] {
  return [...new Set(Object.values(campo).filter((n): n is string => n !== null))];
}

export interface EtapaDelEmbudo {
  /** El orden real del embudo en Odoo. */
  secuencia: number;
  /** Las etapas marcadas como ganadoras: de ahí sale "ganada" sin depender de la versión. */
  esGanada: boolean;
}

/**
 * En qué estado está una oportunidad: ganada, perdida o todavía abierta.
 *
 * Odoo lo dice de tres formas distintas según la versión y hay que mirarlas en orden:
 *
 *  1. `won_status`, que es explícito y existe en las nuevas.
 *  2. la etapa marcada como ganadora en crm.stage (`is_won`).
 *  3. archivada (`active = false`): así es como Odoo guarda una oportunidad PERDIDA —se
 *     archiva con probabilidad 0—, y es el motivo por el que este panel no podía mostrar
 *     ninguna tasa de conversión: la sincronización pedía solo las activas, así que las
 *     perdidas no existían para el core.
 */
export function estadoDelLead(
  valores: { estadoGanada: string | null; activa: boolean; etapa: string | null; probabilidad: number },
  etapas: Map<string, EtapaDelEmbudo>,
): "ganada" | "perdida" | "abierta" {
  if (valores.estadoGanada === "won") return "ganada";
  if (valores.estadoGanada === "lost") return "perdida";
  if (valores.etapa !== null && etapas.get(valores.etapa)?.esGanada === true) return "ganada";
  if (!valores.activa) return "perdida";
  return "abierta";
}

export async function sincronizarCrm(): Promise<number> {
  const campo = resolverCamposLead(await odooCampos("crm.lead"));

  // Las etapas, con su orden y cuáles son de "ganada". El embudo se dibuja en ESTE orden
  // y no por monto ni alfabético, que no es un embudo: "Propuesta 2" tiene que ir donde
  // Odoo la puso.
  const etapasOdoo = await odooSearchRead<{ id: number; name: string; sequence: number; is_won?: boolean }>(
    "crm.stage",
    [],
    ["name", "sequence", "is_won"],
    { limit: 200 },
  );
  const etapas = new Map<string, EtapaDelEmbudo>(
    etapasOdoo.map((e) => [e.name, { secuencia: e.sequence ?? 0, esGanada: e.is_won === true }]),
  );

  // `active in [true, false]` trae también las archivadas, que es donde Odoo guarda las
  // perdidas. Sin ellas no hay tasa de conversión ni motivos de pérdida que mostrar.
  const leads = await odooSearchRead<LeadOdoo>(
    "crm.lead",
    campo.activa ? [[campo.activa, "in", [true, false]]] : [],
    camposAPedirDeLead(campo),
    { order: "create_date desc", limit: TOPE },
  );

  // Las etiquetas llegan como ids: sus nombres se piden de una sola vez y no una consulta
  // por lead.
  const idsDeEtiquetas = new Set<number>();
  if (campo.etiquetas) {
    for (const l of leads) {
      const ids = l[campo.etiquetas];
      if (Array.isArray(ids)) for (const id of ids) if (typeof id === "number") idsDeEtiquetas.add(id);
    }
  }
  const nombreDeEtiqueta = new Map<number, string>();
  if (idsDeEtiquetas.size > 0) {
    const etiquetas = await odooSearchRead<{ id: number; name: string }>(
      "crm.tag",
      [["id", "in", [...idsDeEtiquetas]]],
      ["name"],
      { limit: 500 },
    );
    for (const e of etiquetas) nombreDeEtiqueta.set(e.id, e.name);
  }

  const leer = (l: LeadOdoo, que: keyof typeof CAMPOS_LEAD): unknown =>
    campo[que] === null ? undefined : l[campo[que] as string];

  const filas = leads.map((l) => {
    const companyId = idDeTupla(leer(l, "empresa")) ?? 1;
    const etapa = comoTexto(leer(l, "etapa"));
    const activa = leer(l, "activa") !== false;
    const probabilidad = comoNumero(leer(l, "probabilidad"));
    const montoEsperado = comoNumero(leer(l, "montoEsperado"));
    const idsEtiquetas = leer(l, "etiquetas");
    return {
      odoo_id: l.id,
      company_id: companyId,
      company_nombre: obtenerCompania(companyId).nombre,
      tipo: comoTexto(leer(l, "tipo")) ?? "opportunity",
      nombre: comoTexto(leer(l, "nombre")) ?? `Oportunidad #${l.id}`,
      partner_nombre: comoTexto(leer(l, "cliente")) ?? comoTexto(leer(l, "razonSocial")),
      contacto: comoTexto(leer(l, "contacto")),
      etapa,
      etapa_secuencia: etapa !== null ? (etapas.get(etapa)?.secuencia ?? null) : null,
      activa,
      estado: estadoDelLead(
        { estadoGanada: comoTexto(leer(l, "estadoGanada")), activa, etapa, probabilidad },
        etapas,
      ),
      motivo_perdida: comoTexto(leer(l, "motivoPerdida")),
      monto_esperado: montoEsperado,
      // Ponderado por probabilidad: es el número con el que se proyecta de verdad. Odoo
      // lo trae calculado en prorated_revenue; si no está, se calcula acá.
      monto_ponderado:
        campo.montoPonderado !== null
          ? comoNumero(leer(l, "montoPonderado"))
          : Math.round((montoEsperado * probabilidad) / 100),
      probabilidad,
      vendedor: comoTexto(leer(l, "vendedor")),
      equipo: comoTexto(leer(l, "equipo")),
      prioridad: PRIORIDADES[String(leer(l, "prioridad"))] ?? null,
      origen: comoTexto(leer(l, "origen")),
      medio: comoTexto(leer(l, "medio")),
      campana: comoTexto(leer(l, "campana")),
      etiquetas: Array.isArray(idsEtiquetas)
        ? idsEtiquetas.map((id) => nombreDeEtiqueta.get(id as number)).filter((n): n is string => !!n)
        : null,
      correo: comoTexto(leer(l, "correo")),
      telefono: comoTexto(leer(l, "telefono")),
      ciudad: comoTexto(leer(l, "ciudad")),
      fecha_creacion: comoTexto(leer(l, "creacion")),
      fecha_cierre_estimada: comoTexto(leer(l, "cierreEstimado")),
      fecha_cierre_real: comoTexto(leer(l, "cierreReal")),
      fecha_conversion: comoTexto(leer(l, "conversion")),
      fecha_ultimo_movimiento: comoTexto(leer(l, "ultimoMovimiento")),
      dias_para_asignar: typeof leer(l, "diasParaAsignar") === "number" ? (leer(l, "diasParaAsignar") as number) : null,
      dias_para_cerrar: typeof leer(l, "diasParaCerrar") === "number" ? (leer(l, "diasParaCerrar") as number) : null,
      actividad_proxima: comoTexto(leer(l, "actividadFecha")),
      actividad_resumen: comoTexto(leer(l, "actividadResumen")),
      actividad_tipo: comoTexto(leer(l, "actividadTipo")),
      actualizado_en: new Date().toISOString(),
    };
  });

  if (filas.length === 0) return 0;

  const { error, count } = await supabaseAdmin
    .from("panel_odoo_crm_leads")
    .upsert(filas, { onConflict: "odoo_id", count: "exact" });

  if (error) throw new Error(error.message);

  // Lo que Odoo ya no devuelve sale de la cache. Va DESPUES del upsert: si el
  // upsert falla, la tabla no queda vaciada.
  await eliminarNoVigentes(
    "panel_odoo_crm_leads",
    filas.map((f) => f.odoo_id),
    {
      topeAlcanzado: leads.length >= TOPE,
    },
  );

  return count ?? filas.length;
}

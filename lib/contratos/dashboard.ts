import "server-only";
import { supabaseAdmin } from "./supabase-admin";
import { idDelContrato } from "./contrato-actual";
import { recordar } from "./memoria-dashboard";
import { cargarNomina, obtenerContrato, type DatosDeContrato } from "./acreditacion";
import {
  alertasDePersona,
  estaContratada,
  hoyEnChile,
  ordenarAlertas,
  resumirDotacion,
  type Etapa,
} from "./acreditacion-modelo";
import { agruparReporte, documentosMasFaltantes, type PersonaParaReporte } from "./acreditacion-reporte";
import { alertasDeCapacitaciones, registrarCapacitaciones, resumirCapacitaciones } from "./capacitaciones-modelo";
import { listarCategorias, listarPartidas } from "./arranque";
import { cargarFlota } from "./vehiculos";
import { cargarResumenDePresupuesto } from "./gastos";
import { listarResponsablesDeModulos } from "./responsables-de-modulo";
import { alertasDeVehiculo, ordenarAlertasDeVehiculos } from "./vehiculos-modelo";
import { resumir, type ModuloArranque } from "./arranque-modelo";
import { calcularAvance, estadoEfectivo, type Avance } from "./contratos-estado";
import { sumarEtapas, etapasVacias, type EtapasDeRequisitos } from "./documento-estado";
import { revisionDeGrupos, type RequisitoLeido } from "./contratos-revision";
import { aplicarEstadoDeAcreditacion } from "./acreditacion-en-documentos";
import { estadosDe } from "./contratos-seguimiento";
import {
  esCarpetaDeAcreditacion,
  hojasBajo,
  listar,
  secciones,
  tieneDocumentos,
  type ElementoSharePoint,
} from "./sharepoint";
import { tieneAccesoASharePoint } from "./graph-credenciales";
import { listarPlazos } from "./plazos";
import { leerPlazo } from "./plazos-modelo";
import {
  analizarArranque,
  type DocumentosDelTablero,
  type GrupoDeDocumentos,
  type MovimientoReciente,
  type PlazosDelTablero,
  type ResumenDeAcreditacion,
  type ResponsablesDelTablero,
  type ResumenDeVehiculos,
  type ResumenDeArranqueDelTablero,
} from "./dashboard-modelo";

// Cuánto se recuerda cada lectura (ver memoria-dashboard.ts). Lo de la base es barato de
// repetir; lo de SharePoint recorre carpetas, y además es POR PERSONA: Graph responde con el
// token de quien mira, y los permisos mandan.
const VIGENCIA_BASE_MS = 30_000;
const VIGENCIA_SHAREPOINT_MS = 60_000;

/** Cuántos movimientos recientes muestra el tablero. */
const MOVIMIENTOS = 8;

// -----------------------------------------------------------------------------
//  Acreditación
// -----------------------------------------------------------------------------

async function movimientosRecientes(): Promise<MovimientoReciente[]> {
  const { data, error } = await supabaseAdmin
    .from("ct_acreditacion_historial")
    // `!inner` + el contrato: el historial no lleva contrato (cuelga de la persona), y sin esto el
    // tablero de un contrato mostraría los movimientos de todos.
    .select("id, accion, detalle, usuario_nombre, creado_en, persona_id, ct_acreditacion_personas!inner(nombre, contrato_id)")
    .eq("ct_acreditacion_personas.contrato_id", await idDelContrato())
    .order("creado_en", { ascending: false })
    .limit(MOVIMIENTOS);

  // La actividad es un adorno del tablero: si no se puede leer, el tablero sigue sin ella.
  if (error) {
    console.error(`[dashboard] No se pudo leer el historial reciente: ${error.message}`);
    return [];
  }

  return ((data ?? []) as Record<string, unknown>[]).map((f) => {
    // Según cómo Supabase infiera la relación, el embebido llega como objeto o como lista.
    const rel = f.ct_acreditacion_personas as { nombre?: string } | { nombre?: string }[] | null;
    const persona = (Array.isArray(rel) ? rel[0]?.nombre : rel?.nombre) ?? "Persona eliminada";
    return {
      id: f.id as number,
      accion: f.accion as string,
      detalle: (f.detalle as string) ?? null,
      usuario: f.usuario_nombre as string,
      persona,
      personaId: f.persona_id as string,
      cuando: f.creado_en as string,
    };
  });
}

async function leerAcreditacion(): Promise<ResumenDeAcreditacion> {
  const [nomina, movimientos] = await Promise.all([cargarNomina(), movimientosRecientes()]);
  const activas = nomina.personas.filter((p) => p.persona.activo);

  // El mismo avance que la tarjeta de la portada de Contratos y el de la nómina: documentos
  // sumados, no porcentajes promediados.
  const suma = activas.reduce(
    (acc, p) => ({
      total: acc.total + p.analisis.avance.total,
      subidos: acc.subidos + p.analisis.avance.subidos,
      noAplican: acc.noAplican + p.analisis.avance.noAplican,
    }),
    { total: 0, subidos: 0, noAplican: 0 },
  );
  const avance: Avance = {
    total: suma.total,
    subidos: suma.subidos,
    pendientes: suma.total - suma.subidos,
    noAplican: suma.noAplican,
    porcentaje: suma.total === 0 ? 0 : Math.round((suma.subidos / suma.total) * 100),
  };

  const etapas: Record<Etapa, number> = { documentacion: 0, web_control: 0, buk: 0, acreditada: 0 };
  for (const p of activas) etapas[p.analisis.etapa]++;

  // Las alertas son las de la nómina: documentos vencidos o por vencer y contratos que terminan.
  const alertas = ordenarAlertas(
    activas.flatMap((p) => [
      ...alertasDePersona(p.persona, p.analisis, nomina.tipos),
      // Los cursos y exámenes reservados cuya fecha llegó o pasó: llegan al tablero y a Mi Día
      // como cualquier otra alerta de la nómina.
      ...alertasDeCapacitaciones(p.persona, p.cursos, nomina.hoy),
    ]),
  );

  const capacitaciones = resumirCapacitaciones(
    registrarCapacitaciones(
      activas.map((p) => ({
        id: p.persona.id,
        nombre: p.persona.nombre,
        rut: p.persona.rut,
        cargo: p.cargo?.nombre ?? "Sin cargo",
        cursos: p.cursos,
      })),
      nomina.hoy,
    ),
  );

  const paraReporte: PersonaParaReporte[] = nomina.personas.map((p) => ({
    activo: p.persona.activo,
    cargo: p.cargo?.nombre ?? "Sin cargo",
    faena: p.persona.datos.faena ?? null,
    contratada: estaContratada(p.persona),
    analisis: p.analisis,
  }));

  return {
    personas: activas.length,
    bajas: nomina.personas.length - activas.length,
    etapas,
    avance,
    dotacion: resumirDotacion(
      nomina.contrato.dotacionRequerida,
      nomina.cargos,
      // Solo las contratadas (con fecha de ingreso y sin «sin contrato aún»): las demás siguen en
      // la nómina y en los documentos, pero no cuentan como dotación.
      activas.filter((p) => estaContratada(p.persona)).map((p) => ({ cargoId: p.persona.cargoId })),
      activas.map((p) => ({ cargoId: p.persona.cargoId })),
    ),
    sinContrato: activas.filter((p) => !estaContratada(p.persona)).length,
    faltantes: documentosMasFaltantes(paraReporte, nomina.tipos)
      .slice(0, 6)
      .map((f) => ({ nombre: f.tipo.nombre, faltan: f.faltan, exigido: f.exigido })),
    alertas,
    vencidos: alertas.filter((a) => a.tipo === "vencido").length,
    porVencer: alertas.filter((a) => a.tipo === "por_vencer").length,
    contratosPorTerminar: alertas.filter((a) => a.tipo === "contrato").length,
    capacitaciones: {
      enCurso: capacitaciones.enCurso,
      examenes: capacitaciones.examenesEnCurso,
      cursos: capacitaciones.cursosEnCurso,
      atrasadas: capacitaciones.atrasadas,
      estaSemana: capacitaciones.estaSemana,
      realizadas: capacitaciones.realizadas,
      aprobadas: capacitaciones.aprobadas,
      reprobadas: capacitaciones.reprobadas,
    },
    porCargo: agruparReporte(paraReporte, (p) => p.cargo).map((f) => ({
      nombre: f.nombre,
      personas: f.personas,
      contratadas: f.contratadas,
      acreditadas: f.acreditadas,
      porcentaje: f.porcentaje,
    })),
    movimientos,
    fechaInicio: nomina.contrato.fechaInicio,
    contrato: nomina.contrato.nombre,
    administrador: nomina.contrato.administrador,
  };
}

export function cargarAcreditacion(): Promise<ResumenDeAcreditacion> {
  return recordar("acreditacion", VIGENCIA_BASE_MS, leerAcreditacion);
}

// -----------------------------------------------------------------------------
//  Acreditación Vehículos
// -----------------------------------------------------------------------------

async function leerVehiculos(): Promise<ResumenDeVehiculos> {
  const flota = await cargarFlota();
  const activos = flota.vehiculos.filter((v) => v.vehiculo.activo);

  // El mismo avance que la tarjeta de la portada y el de la flota: documentos sumados, no porcentajes
  // promediados.
  const suma = activos.reduce(
    (acc, v) => ({
      total: acc.total + v.analisis.avance.total,
      subidos: acc.subidos + v.analisis.avance.subidos,
      noAplican: acc.noAplican + v.analisis.avance.noAplican,
    }),
    { total: 0, subidos: 0, noAplican: 0 },
  );
  const avance: Avance = {
    total: suma.total,
    subidos: suma.subidos,
    pendientes: suma.total - suma.subidos,
    noAplican: suma.noAplican,
    porcentaje: suma.total === 0 ? 0 : Math.round((suma.subidos / suma.total) * 100),
  };

  const etapas = { documentacion: 0, web_control: 0, acreditado: 0 };
  for (const v of activos) etapas[v.analisis.etapa]++;

  const alertas = ordenarAlertasDeVehiculos(
    activos.flatMap((v) => alertasDeVehiculo(v.vehiculo, v.analisis, flota.tipos)),
  );

  const paraReporte: PersonaParaReporte[] = flota.vehiculos.map((v) => ({
    activo: v.vehiculo.activo,
    cargo: v.categoria?.nombre ?? "Sin tipo",
    faena: v.vehiculo.datos.faena ?? null,
    analisis: v.analisis,
  }));

  return {
    vehiculos: activos.length,
    bajas: flota.vehiculos.length - activos.length,
    etapas,
    avance,
    dotacion: resumirDotacion(
      flota.dotacionRequerida,
      flota.categorias,
      activos.map((v) => ({ cargoId: v.vehiculo.categoriaId })),
    ),
    faltantes: documentosMasFaltantes(paraReporte, flota.tipos)
      .slice(0, 6)
      .map((f) => ({ nombre: f.tipo.nombre, faltan: f.faltan, exigido: f.exigido })),
    alertas,
    vencidos: alertas.filter((a) => a.tipo === "vencido").length,
    porVencer: alertas.filter((a) => a.tipo === "por_vencer").length,
    porCategoria: agruparReporte(paraReporte, (p) => p.cargo).map((f) => ({
      nombre: f.nombre,
      vehiculos: f.personas,
      acreditados: f.acreditadas,
      porcentaje: f.porcentaje,
    })),
  };
}

export function cargarVehiculos(): Promise<ResumenDeVehiculos> {
  return recordar("vehiculos", VIGENCIA_BASE_MS, leerVehiculos);
}

// -----------------------------------------------------------------------------
//  Logística y Gastos de arranque
// -----------------------------------------------------------------------------

async function leerArranque(modulo: ModuloArranque): Promise<ResumenDeArranqueDelTablero> {
  const [partidas, categorias] = await Promise.all([
    listarPartidas(modulo),
    // Con las inactivas: una partida vieja puede seguir en una categoría que ya se desactivó.
    listarCategorias(modulo, { incluirInactivas: true }),
  ]);
  const hoy = hoyEnChile();
  const resumen = analizarArranque(modulo, partidas, categorias, resumir(modulo, partidas, hoy), hoy);

  // El presupuesto de Gastos es un añadido: si no se puede leer (la migración 0026 sin correr, una
  // caída), el tablero sigue con el resumen de siempre en vez de quedarse sin el módulo.
  if (modulo === "gastos") {
    try {
      resumen.presupuesto = await cargarResumenDePresupuesto({ partidas, categorias });
    } catch (e) {
      console.error(`[dashboard] No se pudo leer el presupuesto de Gastos: ${e instanceof Error ? e.message : e}`);
    }
  }
  return resumen;
}

export function cargarArranque(modulo: ModuloArranque): Promise<ResumenDeArranqueDelTablero> {
  return recordar(`arranque-${modulo}`, VIGENCIA_BASE_MS, () => leerArranque(modulo));
}

// -----------------------------------------------------------------------------
//  Documentos generales (SharePoint)
// -----------------------------------------------------------------------------

function esDocumentosGenerales(nombre: string): boolean {
  return nombre.trim().toLowerCase() === "documentos generales";
}

/**
 * El avance de Documentos generales, partido por sus grupos (1.1, 1.2, 1.3, 1.4…) y por etapa
 * de revisión.
 *
 * Calcula con las MISMAS reglas que la tarjeta de la portada de Contratos: los requisitos son
 * las carpetas hoja, el estado que se muestra mira también lo que hay en la carpeta
 * (estadoEfectivo) y la etapa de cada requisito es la de su archivo menos avanzado. Los grupos
 * son las carpetas de primer nivel de DOCUMENTOS GENERALES; un grupo que es él mismo una hoja
 * cuenta como su propio requisito, igual que en la lista.
 */
async function leerDocumentos(correo: string): Promise<DocumentosDelTablero> {
  if (!(await tieneAccesoASharePoint(correo))) return { estado: "sin_conexion" };

  try {
    const seccion = (await secciones())[0];
    const raiz = await listar(seccion, "");
    const carpeta = raiz.find((e) => e.esCarpeta && esDocumentosGenerales(e.nombre));

    const vacio = {
      estado: "ok" as const,
      total: calcularAvance([]),
      etapas: etapasVacias(),
      grupos: [] as GrupoDeDocumentos[],
    };
    if (!carpeta) return vacio;

    const grupos = (await listar(seccion, carpeta.ruta)).filter((e) => e.esCarpeta);

    const leidos = await Promise.all(
      grupos.map(async (grupo) => {
        // Un grupo al que esta persona no tiene acceso no puede tumbar el tablero: se omite.
        // La carpeta de Acreditación (1.3) es UN requisito que mide el submódulo; bajar a sus
        // hojas contaría una por persona (ver aplicarEstadoDeAcreditacion).
        let hojas: ElementoSharePoint[] = [];
        try {
          if (!esCarpetaDeAcreditacion(grupo.ruta)) hojas = await hojasBajo(seccion, grupo.ruta);
        } catch {
          return null;
        }
        const base = hojas.length === 0 ? [grupo] : hojas;
        const guardados = await estadosDe(base.map((h) => h.id));
        const requisitos = await aplicarEstadoDeAcreditacion(
          base.map((h): RequisitoLeido => ({
            estado: estadoEfectivo(guardados.get(h.id)?.estado, tieneDocumentos(h)),
            carpeta: h,
          })),
        );
        return { grupo, requisitos };
      }),
    );
    const validos = leidos.filter((l): l is NonNullable<typeof l> => l !== null);

    // Las etapas de todos los grupos juntas: una sola consulta a la base.
    const revisiones = await revisionDeGrupos(
      seccion,
      validos.map((v) => v.requisitos),
    );

    let etapas: EtapasDeRequisitos = etapasVacias();
    const salida: GrupoDeDocumentos[] = validos.map((v, i) => {
      etapas = sumarEtapas(etapas, revisiones[i].etapas);
      return {
        nombre: v.grupo.nombre,
        href: `/contratos/${v.grupo.ruta.split("/").map(encodeURIComponent).join("/")}`,
        avance: calcularAvance(v.requisitos.map((r) => r.estado)),
        etapas: revisiones[i].etapas,
      };
    });

    return {
      estado: "ok",
      total: calcularAvance(validos.flatMap((v) => v.requisitos.map((r) => r.estado))),
      etapas,
      grupos: salida,
    };
  } catch (e) {
    return {
      estado: "error",
      mensaje: e instanceof Error ? e.message : "No se pudo leer SharePoint.",
    };
  }
}

/** Para sacar un resultado que NO se debe recordar del camino de recordar(): ver cargarDocumentos. */
class NoRecordar {
  constructor(readonly resultado: DocumentosDelTablero) {}
}

export async function cargarDocumentos(correo: string): Promise<DocumentosDelTablero> {
  // Solo se recuerda lo que salió bien. «Sin conexión» y los errores no: si alguien conecta
  // SharePoint o se arregla un permiso, el tablero tiene que verlo al instante y no un minuto
  // después. Se logra lanzando desde adentro, porque recordar() descarta lo que falla.
  try {
    // La clave lleva el CORREO: ver VIGENCIA_SHAREPOINT_MS.
    return await recordar(`documentos|${correo.toLowerCase()}`, VIGENCIA_SHAREPOINT_MS, async () => {
      const resultado = await leerDocumentos(correo);
      if (resultado.estado !== "ok") throw new NoRecordar(resultado);
      return resultado;
    });
  } catch (e) {
    if (e instanceof NoRecordar) return e.resultado;
    throw e;
  }
}

// -----------------------------------------------------------------------------
//  El contrato y las fechas límite
// -----------------------------------------------------------------------------

/** El nombre, el inicio y el administrador del contrato: lo ven todos, tengan o no Acreditación. */
export function cargarContrato(): Promise<Pick<DatosDeContrato, "nombre" | "fechaInicio" | "administrador">> {
  return recordar("contrato", VIGENCIA_BASE_MS, async () => {
    const c = await obtenerContrato();
    return { nombre: c.nombre, fechaInicio: c.fechaInicio, administrador: c.administrador };
  });
}

/** Las fechas límite de cada módulo ya leídas contra hoy, con las claves del tablero. */
/**
 * Quién responde por cada módulo, para el resumen de responsables del tablero. Nunca lanza
 * (listarResponsablesDeModulos tampoco): sin la tabla el tablero sigue, solo que sin nombres.
 */
export async function cargarResponsables(): Promise<ResponsablesDelTablero> {
  const todos = await listarResponsablesDeModulos();
  const nombres = (m: keyof typeof todos) => (todos[m] ?? []).map((r) => r.nombre);
  return {
    acreditacion: nombres("acreditacion"),
    vehiculos: nombres("acreditacion-vehiculos"),
    logistica: nombres("logistica"),
    gastos: nombres("gastos"),
  };
}

export async function cargarPlazos(hoy: string): Promise<PlazosDelTablero> {
  const guardados = await listarPlazos();
  return {
    documentos: leerPlazo(guardados["documentos-generales"], hoy),
    acreditacion: leerPlazo(guardados.acreditacion, hoy),
    vehiculos: leerPlazo(guardados["acreditacion-vehiculos"], hoy),
    logistica: leerPlazo(guardados.logistica, hoy),
    gastos: leerPlazo(guardados.gastos, hoy),
  };
}

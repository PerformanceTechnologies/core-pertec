import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "./supabase-admin";
import { pertecWebSupabase } from "./pertec-web-supabase";
import type { ItemDelMenu } from "./menu-modelo";
import { SLUGS_PAUSADOS } from "./apps-pausadas";
import type { UsuarioConAcceso } from "./tipos";
import { claveDeResumen, cuenta, haceCuanto, type Aviso, type ResumenOpcional } from "./modulos-resumen-modelo";
import { money } from "./cotizador/formato";

// Lo que cada submódulo cuenta de sí mismo en la página de su módulo (ver VistaDeModulo).
//
// ── Cómo se arma ───────────────────────────────────────────────────────────
//
// Un cargador por submódulo, registrado por su ruta (la `url` de la aplicación o el `href` del
// enlace del menú). Cada uno lee lo MISMO que ya lee la pantalla del submódulo —no inventa otra
// consulta con otras reglas— y devuelve unas pocas cifras. Así lo que dice la portada de un
// módulo nunca contradice a su pantalla, y una regla de permisos (las cotizaciones de cada
// persona, las rendiciones propias) vive en un solo lugar.
//
// ── Lo que garantiza ───────────────────────────────────────────────────────
//
// `cargarResumenDeItem` NUNCA lanza ni se cuelga: una consulta que falla o que tarda más del
// límite deja esa cartilla sin cifras, con el error en el registro, y el resto de la página sale
// igual. La portada de un módulo es una vista de resumen: no puede ser la pantalla que se cae
// porque Microsoft Graph tardó.
//
// Solo se llama para quien ya ve el submódulo en el menú (la página arma el menú con el mismo
// armarMenu y los mismos permisos): acá no se vuelve a decidir quién ve qué.

export interface ContextoDeResumen {
  usuario: UsuarioConAcceso;
  hoy: Date;
}

type Cargador = (ctx: ContextoDeResumen) => Promise<ResumenOpcional>;

/** Cuánto se espera a un submódulo antes de dejar su cartilla sin cifras. */
const LIMITE_MS = 8_000;

function conLimite<T>(promesa: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolver, rechazar) => {
    const reloj = setTimeout(() => rechazar(new Error(`tardó más de ${ms / 1000} s`)), ms);
    promesa.then(
      (valor) => {
        clearTimeout(reloj);
        resolver(valor);
      },
      (error) => {
        clearTimeout(reloj);
        rechazar(error);
      },
    );
  });
}

/** Cuenta las filas de una tabla que cumplen `igualA` (columna → valor), sin traerlas. */
async function contarFilas(cliente: SupabaseClient, tabla: string, igualA: Record<string, string> = {}): Promise<number> {
  let consulta = cliente.from(tabla).select("id", { count: "exact", head: true });
  for (const [columna, valor] of Object.entries(igualA)) consulta = consulta.eq(columna, valor);
  const { count, error } = await consulta;
  if (error) throw new Error(`contar ${tabla}: ${error.message}`);
  return count ?? 0;
}

const n = (valor: number) => valor.toLocaleString("es-CL");

// ─── Inventario ──────────────────────────────────────────────────────────────

const inventario: Cargador = async () => {
  const [{ tablero }, { formatearMonto }] = await Promise.all([import("./inventario"), import("./inventario-modelo")]);
  const t = await tablero();

  const avisos: Aviso[] = [];
  if (t.bajoMinimo > 0) {
    avisos.push({ texto: `${cuenta(t.bajoMinimo, "producto", "productos")} bajo el mínimo de stock`, tono: "alerta", href: "/inventario/reabastecimiento" });
  }
  if (t.transferenciasPendientes > 0) {
    avisos.push({ texto: `${cuenta(t.transferenciasPendientes, "operación", "operaciones")} sin validar`, tono: "aviso", href: "/inventario/operaciones" });
  }
  return {
    metricas: [
      { etiqueta: "Valor en bodega", valor: formatearMonto(t.valorInventario), detalle: "A costo promedio", href: "/inventario/valorizacion" },
      { etiqueta: "Productos", valor: n(t.productos), detalle: "En el catálogo", href: "/inventario/productos" },
      {
        etiqueta: "Bajo el mínimo",
        valor: n(t.bajoMinimo),
        detalle: t.bajoMinimo > 0 ? "Hay que reponer" : "Todo sobre el mínimo",
        tono: t.bajoMinimo > 0 ? "alerta" : "ok",
        href: "/inventario/reabastecimiento",
      },
      {
        etiqueta: "Por validar",
        valor: n(t.transferenciasPendientes),
        detalle: "Recepciones, entregas y traslados",
        tono: t.transferenciasPendientes > 0 ? "aviso" : "neutro",
        href: "/inventario/operaciones",
      },
    ],
    avisos,
  };
};

// ─── Flota ───────────────────────────────────────────────────────────────────

const flota: Cargador = async ({ hoy }) => {
  const [f, modelo] = await Promise.all([import("./flota"), import("./flota-modelo")]);
  const [vehiculos, servicios, contratos, documentos] = await Promise.all([
    f.listarVehiculos(false),
    f.listarServicios(),
    f.listarContratos(),
    f.listarDocumentos(),
  ]);

  const alertas = modelo.alertasDeFlota(vehiculos, contratos, documentos, hoy);
  const vencidos = new Set(alertas.filter((a) => a.estado === "vencido").map((a) => a.vehiculoId));
  const porVencer = new Set(alertas.filter((a) => a.estado === "por_vencer").map((a) => a.vehiculoId));
  const pendientes = servicios.filter((s) => s.estado === "programado" || s.estado === "en_curso").length;
  const enUso = vehiculos.filter((v) => v.estado === "asignado").length;
  const disponibles = vehiculos.filter((v) => v.estado === "disponible").length;
  const mes = hoy.toISOString().slice(0, 7);
  const gastoMes = servicios.filter((s) => s.estado === "hecho" && s.fecha.startsWith(mes)).reduce((t, s) => t + s.costo, 0);

  const avisos: Aviso[] = [];
  if (vencidos.size > 0) {
    avisos.push({ texto: `${cuenta(vencidos.size, "vehículo con documentos vencidos", "vehículos con documentos vencidos")}`, tono: "alerta", href: "/flota#alertas" });
  }
  if (porVencer.size > 0) {
    avisos.push({ texto: `${cuenta(porVencer.size, "vehículo con documentos por vencer", "vehículos con documentos por vencer")} (30 días)`, tono: "aviso", href: "/flota#alertas" });
  }
  if (pendientes > 0) {
    avisos.push({ texto: `${cuenta(pendientes, "servicio pendiente", "servicios pendientes")}`, tono: "aviso", href: "/flota/servicios" });
  }

  const conAlerta = new Set([...vencidos, ...porVencer]).size;
  return {
    metricas: [
      { etiqueta: "Vehículos", valor: n(vehiculos.length), detalle: `${n(enUso)} en uso`, href: "/flota/vehiculos" },
      { etiqueta: "Disponibles", valor: n(disponibles), detalle: "Sin conductor asignado", href: "/flota/vehiculos?estado=disponible" },
      {
        etiqueta: "Servicios pendientes",
        valor: n(pendientes),
        detalle: "Programados o en curso",
        tono: pendientes > 0 ? "aviso" : "neutro",
        href: "/flota/servicios",
      },
      {
        etiqueta: "Documentos al límite",
        valor: n(conAlerta),
        detalle: vencidos.size > 0 ? `${n(vencidos.size)} vencidos` : conAlerta > 0 ? "Vencen en 30 días" : "Todo vigente",
        tono: vencidos.size > 0 ? "alerta" : conAlerta > 0 ? "aviso" : "ok",
        href: "/flota#alertas",
      },
    ],
    avisos,
    pie: `Gasto en servicios este mes: ${modelo.formatearMonto(gastoMes)}`,
  };
};

// ─── Tareas ──────────────────────────────────────────────────────────────────

const tareas: Cargador = async ({ usuario, hoy }) => {
  const [{ listarTareas }, { estaVencida }] = await Promise.all([import("./tareas"), import("./tareas-modelo")]);
  const todas = await listarTareas(usuario.correo);
  const correo = usuario.correo.toLowerCase();

  const mias = todas.filter((t) => t.estado !== "hecho" && t.responsables.some((r) => r.toLowerCase() === correo)).length;
  const porHacer = todas.filter((t) => t.estado === "por_hacer").length;
  const enCurso = todas.filter((t) => t.estado === "en_curso").length;
  const hechas = todas.filter((t) => t.estado === "hecho").length;
  const vencidas = todas.filter((t) => estaVencida(t, hoy)).length;

  return {
    metricas: [
      { etiqueta: "Mis pendientes", valor: n(mias), detalle: "Donde eres responsable", tono: mias > 0 ? "aviso" : "ok", href: "/tareas" },
      { etiqueta: "Por hacer", valor: n(porHacer), href: "/tareas" },
      { etiqueta: "En curso", valor: n(enCurso), href: "/tareas" },
      {
        etiqueta: "Vencidas",
        valor: n(vencidas),
        detalle: vencidas > 0 ? "Pasaron su fecha límite" : "Ninguna atrasada",
        tono: vencidas > 0 ? "alerta" : "ok",
        href: "/tareas",
      },
    ],
    avisos: vencidas > 0 ? [{ texto: `${cuenta(vencidas, "tarea vencida", "tareas vencidas")}`, tono: "alerta", href: "/tareas" }] : [],
    pie: `${cuenta(hechas, "tarea hecha", "tareas hechas")}`,
  };
};

// ─── Contratos ───────────────────────────────────────────────────────────────

const contratos: Cargador = async () => {
  const { listarContratosDelMenu } = await import("./contratos/contratos");
  const todos = await listarContratosDelMenu();
  const activos = todos.filter((c) => c.activo).length;
  return {
    metricas: [
      { etiqueta: "Contratos activos", valor: n(activos), href: "/contratos" },
      { etiqueta: "Cerrados", valor: n(todos.length - activos), detalle: "Sin movimiento", href: "/contratos" },
    ],
    avisos: [],
  };
};

// ─── CRM ─────────────────────────────────────────────────────────────────────

const cotizador: Cargador = async ({ usuario, hoy }) => {
  const { listarCotizaciones, resolverRolCotizador } = await import("./cotizador");
  const rol = await resolverRolCotizador(usuario);
  // Las de ejemplo no cuentan: sus cifras son ilustrativas (ver CotizacionResumen.esDemo).
  const todas = (await listarCotizaciones({ usuario, rol })).filter((c) => !c.esDemo);
  const mes = hoy.toISOString().slice(0, 7);
  const emitidas = todas.filter((c) => c.emitida).length;
  return {
    metricas: [
      { etiqueta: "Cotizaciones", valor: n(todas.length), detalle: rol === "admin" ? "De todo el equipo" : "Las tuyas", href: "/cotizador" },
      { etiqueta: "En borrador", valor: n(todas.length - emitidas), detalle: "Sin emitir", href: "/cotizador" },
      { etiqueta: "Emitidas", valor: n(emitidas), href: "/cotizador" },
      { etiqueta: "Movidas este mes", valor: n(todas.filter((c) => c.actualizadoEn.startsWith(mes)).length), href: "/cotizador" },
    ],
    avisos: [],
  };
};

const ofertas: Cargador = async ({ usuario }) => {
  const { listarOfertas } = await import("./ofertas/datos");
  const todas = await listarOfertas(usuario);
  const borradores = todas.filter((o) => o.estado === "borrador");
  const porRevisar = borradores.filter((o) => o.pendientes > 0).length;
  return {
    metricas: [
      { etiqueta: "Ofertas", valor: n(todas.length), detalle: usuario.rol === "admin" ? "De todo el equipo" : "Las tuyas", href: "/ofertas" },
      { etiqueta: "En borrador", valor: n(borradores.length), href: "/ofertas" },
      { etiqueta: "Emitidas", valor: n(todas.length - borradores.length), href: "/ofertas" },
      {
        etiqueta: "Con controles por revisar",
        valor: n(porRevisar),
        tono: porRevisar > 0 ? "aviso" : "ok",
        detalle: porRevisar > 0 ? "Antes de emitir" : "Nada pendiente",
        href: "/ofertas",
      },
    ],
    avisos: porRevisar > 0 ? [{ texto: `${cuenta(porRevisar, "oferta con controles sin revisar", "ofertas con controles sin revisar")}`, tono: "aviso", href: "/ofertas" }] : [],
  };
};

// ─── Finanzas ────────────────────────────────────────────────────────────────

const rendirGastos: Cargador = async ({ usuario }) => {
  const { listarRendiciones } = await import("./rendidor/datos");
  // Solo las propias: la portada de un módulo es personal. Quien administra gastos ve las de todos
  // dentro de la pantalla de Rendir Gastos, que es donde se revisan.
  const todas = await listarRendiciones({ usuarioId: usuario.id, correo: usuario.correo, verTodas: false });
  const enMano = todas.filter((r) => r.estado === "borrador" || r.estado === "rechazada");
  const enRevision = todas.filter((r) => r.estado === "enviada");
  const porPagar = todas.filter((r) => r.estado === "aprobada");
  const rechazadas = todas.filter((r) => r.estado === "rechazada");
  return {
    metricas: [
      { etiqueta: "Mis rendiciones", valor: n(todas.length), href: "/rendir-gastos" },
      { etiqueta: "Por enviar", valor: n(enMano.length), tono: enMano.length > 0 ? "aviso" : "ok", detalle: "Borradores y rechazadas", href: "/rendir-gastos?ver=borrador" },
      { etiqueta: "En revisión", valor: n(enRevision.length), href: "/rendir-gastos?ver=enviada" },
      { etiqueta: "Por pagar", valor: money(porPagar.reduce((t, r) => t + r.totalGastos, 0)), detalle: "Aprobadas sin pagar", href: "/rendir-gastos?ver=aprobada" },
    ],
    avisos:
      rechazadas.length > 0
        ? [{ texto: `${rechazadas.length} ${rechazadas.length === 1 ? "rendición rechazada" : "rendiciones rechazadas"}: corrige y vuelve a enviar.`, tono: "alerta" as const, href: "/rendir-gastos?ver=rechazada" }]
        : [],
  };
};

const facturasSii: Cargador = async () => {
  const { data: ultimo } = await supabaseAdmin.from("facturas_sii").select("periodo").order("periodo", { ascending: false }).limit(1).maybeSingle();
  if (!ultimo) return null; // todavía no se leyó ningún período del SII
  const periodo = ultimo.periodo as string; // AAAAMM
  const delPeriodo = (extra: Record<string, string>) => contarFilas(supabaseAdmin, "facturas_sii", { periodo, ...extra });

  const [compras, ventas, pendientes, reclamadas, { obtenerUltimaEjecucionExitosa }] = await Promise.all([
    delPeriodo({ tipo_documento: "compra" }),
    delPeriodo({ tipo_documento: "venta" }),
    delPeriodo({ estado: "pendiente" }),
    delPeriodo({ estado: "reclamado" }),
    import("./finanzas"),
  ]);
  const ejecucion = await obtenerUltimaEjecucionExitosa();
  const nombrePeriodo = `${periodo.slice(4, 6)}/${periodo.slice(0, 4)}`;

  return {
    metricas: [
      { etiqueta: "Compras del período", valor: n(compras), detalle: `Período ${nombrePeriodo}`, href: "/finanzas/sii" },
      { etiqueta: "Ventas del período", valor: n(ventas), detalle: `Período ${nombrePeriodo}`, href: "/finanzas/sii" },
      { etiqueta: "Pendientes", valor: n(pendientes), detalle: "Compras por decidir", tono: pendientes > 0 ? "aviso" : "ok", href: "/finanzas/sii" },
      { etiqueta: "Reclamadas", valor: n(reclamadas), tono: reclamadas > 0 ? "alerta" : "ok", href: "/finanzas/sii" },
    ],
    avisos: [
      ...(reclamadas > 0 ? [{ texto: `${cuenta(reclamadas, "factura reclamada", "facturas reclamadas")} en ${nombrePeriodo}`, tono: "alerta" as const, href: "/finanzas/sii" }] : []),
      ...(pendientes > 0 ? [{ texto: `${cuenta(pendientes, "factura de compra pendiente", "facturas de compra pendientes")} en ${nombrePeriodo}`, tono: "aviso" as const, href: "/finanzas/sii" }] : []),
    ],
    pie: ejecucion ? `Última lectura del SII: ${haceCuanto(ejecucion.ejecutado_en)}` : undefined,
  };
};

const contactos: Cargador = async () => {
  const [{ listarContactos }, { listoParaFacturar }] = await Promise.all([import("./contactos"), import("./contactos-modelo")]);
  const activos = (await listarContactos()).filter((c) => c.activo);
  const clientes = activos.filter((c) => c.esCliente);
  const porCompletar = activos.filter((c) => !listoParaFacturar(c)).length;
  const clientesPorCompletar = clientes.filter((c) => !listoParaFacturar(c)).length;
  return {
    metricas: [
      { etiqueta: "Contactos", valor: n(activos.length), href: "/finanzas/contactos" },
      { etiqueta: "Clientes", valor: n(clientes.length), href: "/finanzas/contactos?ver=clientes" },
      { etiqueta: "Proveedores", valor: n(activos.filter((c) => c.esProveedor).length), href: "/finanzas/contactos?ver=proveedores" },
      { etiqueta: "Por completar", valor: n(porCompletar), detalle: "Les falta algo para facturar", tono: porCompletar > 0 ? "aviso" : "ok", href: "/finanzas/contactos?ver=por_completar" },
    ],
    avisos:
      clientesPorCompletar > 0
        ? [{ texto: `${cuenta(clientesPorCompletar, "cliente sin los datos para facturarle", "clientes sin los datos para facturarles")}`, tono: "aviso", href: "/finanzas/contactos?ver=por_completar" }]
        : [],
  };
};

const facturasHistoricas: Cargador = async () => {
  const [compras, ventas, { obtenerUltimaEjecucionHistoricoExitosa }] = await Promise.all([
    contarFilas(supabaseAdmin, "facturas_compra_historico"),
    contarFilas(supabaseAdmin, "facturas_venta_historico"),
    import("./facturas-historicas"),
  ]);
  const ejecucion = await obtenerUltimaEjecucionHistoricoExitosa();
  return {
    metricas: [
      { etiqueta: "Facturas de compra", valor: n(compras), detalle: "Archivadas en SharePoint", href: "/finanzas/facturas-historicas" },
      { etiqueta: "Facturas de venta", valor: n(ventas), detalle: "Archivadas en SharePoint", href: "/finanzas/facturas-historicas" },
    ],
    avisos: [],
    pie: ejecucion ? `Última actualización: ${haceCuanto(ejecucion.ejecutado_en)}` : undefined,
  };
};

// ─── Página web ──────────────────────────────────────────────────────────────

const paginaWeb: Cargador = async () => {
  const [nuevas, equipos, casos] = await Promise.all([
    contarFilas(pertecWebSupabase, "solicitudes", { estado: "nuevo" }),
    contarFilas(pertecWebSupabase, "equipos"),
    contarFilas(pertecWebSupabase, "casos"),
  ]);
  return {
    metricas: [
      {
        etiqueta: "Solicitudes nuevas",
        valor: n(nuevas),
        detalle: nuevas > 0 ? "Sin responder" : "Todas atendidas",
        tono: nuevas > 0 ? "aviso" : "ok",
        href: "/pagina-web/solicitudes",
      },
      { etiqueta: "Equipos en el catálogo", valor: n(equipos), href: "/pagina-web" },
      { etiqueta: "Casos de éxito", valor: n(casos), href: "/pagina-web/casos" },
    ],
    avisos: nuevas > 0 ? [{ texto: `${cuenta(nuevas, "solicitud nueva", "solicitudes nuevas")} desde el sitio`, tono: "aviso", href: "/pagina-web/solicitudes" }] : [],
  };
};

const postulaciones: Cargador = async ({ hoy }) => {
  const { credencialesGraphConfiguradas, listarPostulaciones } = await import("./reclutamiento");
  if (!credencialesGraphConfiguradas()) return null;
  const todas = await listarPostulaciones();
  const desde = hoy.getTime() - 7 * 24 * 60 * 60 * 1000;
  const recientes = todas.filter((p) => new Date(p.creadaEn).getTime() >= desde).length;
  return {
    metricas: [
      { etiqueta: "Postulaciones", valor: n(todas.length), detalle: "Recibidas desde el sitio", href: "/reclutamiento" },
      { etiqueta: "Últimos 7 días", valor: n(recientes), tono: recientes > 0 ? "aviso" : "neutro", href: "/reclutamiento" },
    ],
    avisos: recientes > 0 ? [{ texto: `${cuenta(recientes, "postulación nueva", "postulaciones nuevas")} esta semana`, tono: "aviso", href: "/reclutamiento" }] : [],
  };
};

// ─── Administración ──────────────────────────────────────────────────────────

const usuarios: Cargador = async () => {
  const [{ listarUsuarios }, { listarAplicaciones }, { appsAsignadasVigentes }] = await Promise.all([
    import("./usuarios"),
    import("./aplicaciones"),
    import("./administracion-modelo"),
  ]);
  const [todos, catalogo] = await Promise.all([listarUsuarios(), listarAplicaciones()]);
  const idsDelCatalogo = new Set(catalogo.map((a) => a.id));
  const activos = todos.filter((u) => u.activo);
  const admins = activos.filter((u) => u.rol === "admin").length;
  // La misma regla que el filtro «Sin aplicaciones» de Usuarios (ver filtrarUsuarios).
  const sinApps = activos.filter((u) => u.rol !== "admin" && appsAsignadasVigentes(u, idsDelCatalogo) === 0).length;
  return {
    metricas: [
      { etiqueta: "Usuarios", valor: n(todos.length), detalle: `${n(todos.length - activos.length)} inactivos`, href: "/usuarios" },
      { etiqueta: "Activos", valor: n(activos.length), href: "/usuarios?estado=activos" },
      { etiqueta: "Administradores", valor: n(admins), href: "/usuarios?rol=admin" },
      {
        etiqueta: "Sin aplicaciones",
        valor: n(sinApps),
        detalle: sinApps > 0 ? "Entran y no ven nada" : "Todos tienen acceso",
        tono: sinApps > 0 ? "aviso" : "ok",
        href: "/usuarios?acceso=sin-apps",
      },
    ],
    avisos: sinApps > 0 ? [{ texto: `${cuenta(sinApps, "usuario activo sin aplicaciones", "usuarios activos sin aplicaciones")}`, tono: "aviso", href: "/usuarios?acceso=sin-apps" }] : [],
  };
};

const aplicaciones: Cargador = async () => {
  const { listarAplicaciones } = await import("./aplicaciones");
  const todas = await listarAplicaciones();
  const enMantencion = todas.filter((a) => a.estado === "mantenimiento").length;
  const enPausa = todas.filter((a) => SLUGS_PAUSADOS.includes(a.slug)).length;
  return {
    metricas: [
      { etiqueta: "Aplicaciones", valor: n(todas.length), href: "/aplicaciones" },
      { etiqueta: "Activas", valor: n(todas.filter((a) => a.estado === "activa").length), tono: "ok", href: "/aplicaciones?estado=activa" },
      { etiqueta: "En desarrollo", valor: n(todas.filter((a) => a.estado === "en_desarrollo").length), href: "/aplicaciones?estado=en_desarrollo" },
      { etiqueta: "En mantención", valor: n(enMantencion), tono: enMantencion > 0 ? "aviso" : "neutro", href: "/aplicaciones?estado=mantenimiento" },
    ],
    avisos: enMantencion > 0 ? [{ texto: `${cuenta(enMantencion, "aplicación en mantención", "aplicaciones en mantención")}`, tono: "aviso", href: "/aplicaciones?estado=mantenimiento" }] : [],
    pie: enPausa > 0 ? `${cuenta(enPausa, "aplicación en pausa", "aplicaciones en pausa")}` : undefined,
  };
};

// ─── Registro ────────────────────────────────────────────────────────────────

const CARGADORES: Record<string, Cargador> = {
  "/inventario": inventario,
  "/flota": flota,
  "/tareas": tareas,
  "/contratos": contratos,
  "/cotizador": cotizador,
  "/ofertas": ofertas,
  "/rendir-gastos": rendirGastos,
  "/finanzas/contactos": contactos,
  "/finanzas/sii": facturasSii,
  "/finanzas/facturas-historicas": facturasHistoricas,
  "/pagina-web": paginaWeb,
  "/reclutamiento": postulaciones,
  "/usuarios": usuarios,
  "/aplicaciones": aplicaciones,
};

/**
 * Las cifras de un submódulo, o null si no tiene (nada que contar, sin datos, o algo falló).
 * Nunca lanza ni tarda más de LIMITE_MS.
 */
export async function cargarResumenDeItem(item: ItemDelMenu, ctx: ContextoDeResumen): Promise<ResumenOpcional> {
  const clave = claveDeResumen(item);
  const cargador = clave ? CARGADORES[clave] : undefined;
  if (!clave || !cargador) return null;
  try {
    return await conLimite(cargador(ctx), LIMITE_MS);
  } catch (error) {
    console.error(`[módulos] No se pudo armar el resumen de ${clave}:`, error);
    return null;
  }
}

/** Para las pruebas: las rutas con cargador. */
export const RUTAS_CON_RESUMEN = Object.keys(CARGADORES);

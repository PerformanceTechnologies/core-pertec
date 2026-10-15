"use server";


import { refrescarContrato } from "@/lib/contratos/refrescar";
import { exigirAccesoApp, exigirCapacidad } from "@/lib/contratos/autorizacion";
import { SinPermiso, puede, type Capacidad } from "@/lib/contratos/permisos";
import { diasHasta, hoyEnChile, type EstadoForm } from "@/lib/contratos/acreditacion-modelo";
import { obtenerPartida, listarCategorias } from "@/lib/contratos/arranque";
import { asegurarCarpetaDeCotizacion, nombreDeCarpetaDeCotizacion } from "@/lib/contratos/arranque-carpetas";
import { MODULOS, leerMonto, type Partida } from "@/lib/contratos/arranque-modelo";
import {
  actualizarCotizacion,
  aprobarCotizacion,
  cambiarEstadoDeCotizacion,
  crearCotizacion,
  eliminarCotizacion,
  guardarAprobadores,
  guardarCarpetaDeCotizacion,
  guardarEnlaceDeCarpetaDeCotizacion,
  guardarPresupuesto,
  guardarPresupuestoDeItem,
  listarCotizacionesDeLinea,
  obtenerCotizacion,
  obtenerPresupuesto,
  puedeAprobar,
  recordarTipoDeCambio,
  type DatosDeCotizacion,
} from "@/lib/contratos/gastos";
import {
  aprobacionPideMotivo,
  calcularTotalClp,
  esEstadoDeCotizacion,
  esMoneda,
  leerCantidad,
  leerPrecioUnitario,
  leerTipoDeCambio,
  lineaTieneOrdenDeCompra,
  type Cotizacion,
} from "@/lib/contratos/gastos-modelo";
import { eliminarElemento, obtenerElemento, renombrarElemento, sesionDeSubidaEnCarpeta } from "@/lib/contratos/sharepoint";
import { leerEnteroOpcional, leerFecha, leerTexto, leerUuid, nombreParaSharePoint } from "@/lib/contratos/validar-form";

// exigirAccesoApp() se repite en CADA acción, no solo en la página: una Server Action es un
// endpoint, y esconder un botón no protege nada.
//
// Lo que mueve plata —el presupuesto, los ítems, aprobar una cotización— además exige poder
// aprobar (un administrador, o quien el administrador designó). Quien solo tiene el módulo puede
// cargar y comparar cotizaciones, pero no decidir.

const APP = MODULOS.gastos.appSlug;

/** El módulo asignado Y un rol que permita la capacidad (lib/permisos.ts). */
async function guardia(capacidad: Capacidad) {
  return await exigirCapacidad(APP, capacidad);
}

async function guardiaDeAprobador() {
  const usuario = await exigirAccesoApp(APP);
  const autorizado = await puedeAprobar(usuario);
  return { usuario, autorizado };
}

const SIN_PERMISO: EstadoForm = {
  error: "Esto lo hacen los administradores y las personas designadas para aprobar gastos.",
};

function comoError(e: unknown): EstadoForm {
  return { error: e instanceof Error ? e.message : "No se pudo guardar." };
}

function refrescar(partidaId?: string) {
  refrescarContrato();
  refrescarContrato();
  if (partidaId) refrescarContrato();
}

// -----------------------------------------------------------------------------
//  Presupuesto
// -----------------------------------------------------------------------------

export async function guardarPresupuestoAction(_previo: EstadoForm, form: FormData): Promise<EstadoForm> {
  const { usuario, autorizado } = await guardiaDeAprobador();
  if (!autorizado) return SIN_PERMISO;

  try {
    const monto = leerMonto(form.get("monto"), "El presupuesto total");
    if (monto === null) throw new Error("Escribe el presupuesto total, en pesos y sin IVA.");

    const motivo = leerTexto(form.get("motivo"), 300);
    const actual = await obtenerPresupuesto();
    // El primero se define sin explicaciones; los cambios, no: sin el porqué, un presupuesto que
    // sube es un número que nadie sabe justificar.
    if (actual.vigente !== null && actual.vigente !== monto && !motivo) {
      throw new Error("Explica el motivo del cambio: queda en el historial del presupuesto.");
    }

    await guardarPresupuesto({ monto, motivo, usuario });
    refrescar();
    return { ok: true };
  } catch (e) {
    return comoError(e);
  }
}

export async function guardarPresupuestoDeItemAction(
  categoriaId: string,
  _previo: EstadoForm,
  form: FormData,
): Promise<EstadoForm> {
  const { autorizado } = await guardiaDeAprobador();
  if (!autorizado) return SIN_PERMISO;

  try {
    const id = leerUuid(categoriaId, "Ítem");
    // Tiene que ser un ítem de Gastos: la tabla de categorías es compartida con Logística.
    const categorias = await listarCategorias("gastos", { incluirInactivas: true });
    if (!categorias.some((c) => c.id === id)) throw new Error("Ese ítem no existe.");

    await guardarPresupuestoDeItem(id, leerMonto(form.get("presupuesto"), "El presupuesto del ítem"));
    refrescar();
    return { ok: true };
  } catch (e) {
    return comoError(e);
  }
}

// -----------------------------------------------------------------------------
//  Cotizaciones
// -----------------------------------------------------------------------------

/** La partida tiene que existir y ser de Gastos. */
async function lineaDeGastos(partidaId: unknown): Promise<Partida> {
  const partida = await obtenerPartida(leerUuid(partidaId, "Línea"));
  if (!partida || partida.modulo !== "gastos") throw new Error("La línea ya no existe.");
  return partida;
}

/** La cotización y su línea. Una cotización de otro módulo es lo mismo que inexistente. */
async function cotizacionConLinea(id: unknown): Promise<{ cotizacion: Cotizacion; partida: Partida }> {
  const cotizacion = await obtenerCotizacion(leerUuid(id, "Cotización"));
  if (!cotizacion) throw new Error("La cotización ya no existe.");
  return { cotizacion, partida: await lineaDeGastos(cotizacion.partidaId) };
}

function leerDatosDeCotizacion(form: FormData): { datos: DatosDeCotizacion; cambioParaRecordar: number | null } {
  const proveedor = leerTexto(form.get("proveedor"), 120);
  if (!proveedor) throw new Error("Falta el proveedor.");

  const monedaEntrante = form.get("moneda");
  const moneda = esMoneda(monedaEntrante) ? monedaEntrante : "CLP";
  const cantidad = leerCantidad(form.get("cantidad"));
  const precioUnitario = leerPrecioUnitario(form.get("precio_unitario"), moneda, "El precio unitario");
  const tipoCambio = precioUnitario === null && moneda !== "CLP" && !String(form.get("tipo_cambio") ?? "").trim()
    ? 1
    : leerTipoDeCambio(form.get("tipo_cambio"), moneda);

  let estado = String(form.get("estado") ?? "solicitada");
  if (!esEstadoDeCotizacion(estado) || estado === "aprobada") estado = "solicitada";
  // Un precio escrito es una cotización recibida: no tiene sentido «solicitada» con precio.
  if (estado === "solicitada" && precioUnitario !== null) estado = "recibida";
  if (estado === "recibida" && precioUnitario === null) {
    throw new Error("Una cotización recibida lleva su precio unitario. Si todavía no llega, déjala como «solicitada».");
  }

  const plazo = leerEnteroOpcional(form.get("plazo_entrega_dias"), "El plazo de entrega", 3650);

  return {
    datos: {
      proveedor,
      descripcion: leerTexto(form.get("descripcion"), 200),
      cantidad,
      moneda,
      precioUnitario,
      tipoCambio,
      totalClp: precioUnitario === null ? null : calcularTotalClp(precioUnitario, cantidad, tipoCambio),
      plazoEntregaDias: plazo,
      garantia: leerTexto(form.get("garantia"), 120),
      condicionesPago: leerTexto(form.get("condiciones_pago"), 200),
      vigenciaHasta: leerFecha(form.get("vigencia_hasta"), "La vigencia"),
      respuestaEsperada: leerFecha(form.get("respuesta_esperada"), "La fecha de respuesta"),
      estado: estado as DatosDeCotizacion["estado"],
      porConfirmar: leerTexto(form.get("por_confirmar"), 1000),
      notas: leerTexto(form.get("notas"), 1000),
    },
    cambioParaRecordar: moneda !== "CLP" && precioUnitario !== null ? tipoCambio : null,
  };
}

/** Crea una cotización (sin `cotizacionId`) o guarda los cambios de una que no está aprobada. */
export async function guardarCotizacionAction(
  partidaId: string,
  cotizacionId: string | null,
  _previo: EstadoForm,
  form: FormData,
): Promise<EstadoForm> {
  const usuario = await guardia(cotizacionId ? "editar" : "crear");

  try {
    const partida = await lineaDeGastos(partidaId);
    const { datos, cambioParaRecordar } = leerDatosDeCotizacion(form);
    const quien = usuario.nombre || usuario.correo;

    if (cotizacionId) {
      const { cotizacion } = await cotizacionConLinea(cotizacionId);
      if (cotizacion.partidaId !== partida.id) throw new Error("Esa cotización es de otra línea.");
      if (cotizacion.estado === "aprobada") {
        throw new Error("Esta cotización está aprobada. Quítale la aprobación antes de editarla.");
      }
      await actualizarCotizacion(cotizacion.id, datos);

      // Si cambió el proveedor, la subcarpeta cambia con él. Es lo último y no hace fallar el
      // guardado: los datos ya están, y una carpeta con el nombre viejo es un desorden, no una pérdida.
      if (cotizacion.carpetaItemId && cotizacion.proveedor !== datos.proveedor) {
        try {
          const { webUrl } = await renombrarElemento(
            cotizacion.carpetaItemId,
            nombreDeCarpetaDeCotizacion({ id: cotizacion.id, proveedor: datos.proveedor }),
          );
          await guardarEnlaceDeCarpetaDeCotizacion(cotizacion.id, webUrl);
        } catch (e) {
          console.error(`[gastos] No se pudo renombrar la carpeta de la cotización: ${e instanceof Error ? e.message : e}`);
        }
      }
    } else {
      await crearCotizacion(partida.id, datos, quien);
    }

    if (cambioParaRecordar !== null) await recordarTipoDeCambio(datos.moneda, cambioParaRecordar, quien);
    refrescar(partida.id);
    return { ok: true };
  } catch (e) {
    return comoError(e);
  }
}

/** Marca una cotización como solicitada, recibida o descartada (aprobarla es otra acción). */
export async function cambiarEstadoDeCotizacionAction(
  cotizacionId: string,
  estado: string,
  motivo: string | null = null,
): Promise<EstadoForm> {
  const { usuario, autorizado } = await guardiaDeAprobador();
  if (!puede(usuario.rol, "editar")) throw new SinPermiso();

  try {
    if (estado !== "solicitada" && estado !== "recibida" && estado !== "descartada") {
      throw new Error("Estado inválido.");
    }
    const { cotizacion, partida } = await cotizacionConLinea(cotizacionId);

    // Mover una aprobada cambia lo comprometido: es decisión de quien aprueba.
    if (cotizacion.estado === "aprobada") {
      if (!autorizado) return SIN_PERMISO;
      if (lineaTieneOrdenDeCompra(partida.estado)) {
        throw new Error("Esta línea ya tiene orden de compra. Cambia primero el estado de la línea.");
      }
    }
    if (estado === "recibida" && cotizacion.totalClp === null) {
      throw new Error("Registra primero el precio: edita la cotización y escríbelo.");
    }

    await cambiarEstadoDeCotizacion(cotizacion.id, estado, estado === "descartada" ? leerTexto(motivo, 300) : null);
    refrescar(partida.id);
    return { ok: true };
  } catch (e) {
    return comoError(e);
  }
}

/** Aprueba una cotización. Exige poder aprobar, y un motivo cuando no hay con qué comparar. */
export async function aprobarCotizacionAction(cotizacionId: string, motivo: string | null): Promise<EstadoForm> {
  const { usuario, autorizado } = await guardiaDeAprobador();
  if (!autorizado) return SIN_PERMISO;

  try {
    const { cotizacion, partida } = await cotizacionConLinea(cotizacionId);
    if (cotizacion.estado === "aprobada") return { ok: true };
    if (cotizacion.estado !== "recibida") throw new Error("Solo se aprueba una cotización recibida, con su precio.");
    if (lineaTieneOrdenDeCompra(partida.estado)) {
      throw new Error("Esta línea ya tiene orden de compra. Cambia primero el estado de la línea.");
    }

    const limpio = leerTexto(motivo, 300);
    const hermanas = await listarCotizacionesDeLinea(partida.id);
    const vencida =
      cotizacion.vigenciaHasta !== null && (diasHasta(cotizacion.vigenciaHasta, hoyEnChile()) ?? 0) < 0;

    if (!limpio) {
      if (vencida) throw new Error("La vigencia de esta cotización ya pasó. Explica por qué se aprueba igual.");
      if (aprobacionPideMotivo(cotizacion, hermanas)) {
        throw new Error(
          "No hay otra cotización con la que comparar: explica por qué se aprueba esta (queda registrado).",
        );
      }
    }

    await aprobarCotizacion({ id: cotizacion.id, usuario, motivo: limpio });
    refrescar(partida.id);
    return { ok: true };
  } catch (e) {
    return comoError(e);
  }
}

export async function eliminarCotizacionAction(cotizacionId: string): Promise<EstadoForm> {
  await guardia("editar");

  try {
    const { cotizacion, partida } = await cotizacionConLinea(cotizacionId);
    if (cotizacion.estado === "aprobada") {
      throw new Error("Esta cotización está aprobada. Quítale la aprobación antes de eliminarla.");
    }

    // SharePoint va primero, y si falla no se toca la cotización: borrar la fila y que su carpeta
    // quede huérfana es peor que no borrar nada. Va a la papelera del sitio.
    if (cotizacion.carpetaItemId) await eliminarElemento(cotizacion.carpetaItemId);

    await eliminarCotizacion(cotizacion.id);
    refrescar(partida.id);
    return { ok: true };
  } catch (e) {
    return comoError(e);
  }
}

// -----------------------------------------------------------------------------
//  Archivos de una cotización
// -----------------------------------------------------------------------------

/**
 * Abre la subida de un archivo a la subcarpeta de la cotización, creándola la primera vez.
 *
 * El archivo conserva su nombre —limpiado de lo que SharePoint no admite—: una cotización se
 * reconoce por el suyo. Si ya hay uno igual, SharePoint le agrega un sufijo en vez de pisarlo.
 */
export async function prepararSubidaDeCotizacionAction(
  cotizacionId: string,
  nombreOriginal: string,
): Promise<{ url: string }> {
  await guardia("crear");

  const { cotizacion, partida } = await cotizacionConLinea(cotizacionId);
  const carpetaId = await asegurarCarpetaDeCotizacion(partida, cotizacion, (c) =>
    guardarCarpetaDeCotizacion(cotizacion.id, c),
  );

  const coincide = /^(.*?)(\.[A-Za-z0-9]{1,8})?$/.exec(nombreOriginal.trim());
  const base = nombreParaSharePoint(coincide?.[1] ?? "", 120) || "archivo";
  const extension = (coincide?.[2] ?? "").toLowerCase();

  return await sesionDeSubidaEnCarpeta(carpetaId, `${base}${extension}`);
}

/**
 * Elimina un archivo de la subcarpeta de una cotización, también en SharePoint.
 *
 * El id del archivo viaja desde el navegador, y un cliente puede mentir: se le pregunta a
 * SharePoint de dónde cuelga, y solo se elimina si es de la carpeta DE ESTA cotización.
 */
export async function eliminarArchivoDeCotizacionAction(
  cotizacionId: string,
  archivoId: string,
): Promise<EstadoForm> {
  const usuario = await guardia("editar");

  try {
    const { cotizacion, partida } = await cotizacionConLinea(cotizacionId);
    if (!cotizacion.carpetaItemId) throw new Error("Esta cotización todavía no tiene archivos.");

    const id = String(archivoId ?? "");
    if (!id) throw new Error("Archivo inválido.");
    const elemento = await obtenerElemento(id);
    // Un archivo que ya no está se da por eliminado: es lo que se quería.
    if (elemento) {
      if (elemento.carpetaId !== cotizacion.carpetaItemId) {
        throw new Error("Ese archivo no está en la carpeta de esta cotización.");
      }
      await eliminarElemento(elemento.id);
      console.info(
        `[gastos-arranque] ${usuario.correo} eliminó «${elemento.nombre}» de una cotización de ${cotizacion.proveedor}.`,
      );
    }
    refrescar(partida.id);
    return { ok: true };
  } catch (e) {
    return comoError(e);
  }
}

// -----------------------------------------------------------------------------
//  Quién aprueba
// -----------------------------------------------------------------------------

/** Solo un administrador decide quién más puede aprobar. */
export async function guardarAprobadoresAction(_previo: EstadoForm, form: FormData): Promise<EstadoForm> {
  const usuario = await guardia("usuarios");

  try {
    const ids = form.getAll("aprobador").filter((v): v is string => typeof v === "string" && v !== "");
    await guardarAprobadores(ids, usuario.id);
    refrescar();
    return { ok: true };
  } catch (e) {
    return comoError(e);
  }
}

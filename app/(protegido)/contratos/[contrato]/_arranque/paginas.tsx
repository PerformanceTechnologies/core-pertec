import { contratoActual } from "@/lib/contratos/contrato-actual";
import { AnclaDeContrato } from "@/components/contratos/Enlace";
import Link from "@/components/contratos/Enlace";
import { notFound } from "next/navigation";
import {
  IconAlertTriangle,
  IconArrowLeft,
  IconFileSpreadsheet,
  IconLink,
  IconPlus,
  IconSettings,
} from "@tabler/icons-react";
import BotonEliminarPartida from "@/components/contratos/BotonEliminarPartida";
import TituloConDescripcion from "@/components/contratos/TituloConDescripcion";
import PlazoDeCabecera from "@/components/contratos/PlazoDeCabecera";
import ConectarSharePoint from "@/components/contratos/ConectarSharePoint";
import DocumentosDePartida, { type ArchivoParaMostrar } from "@/components/contratos/DocumentosDePartida";
import EditorDeCategorias from "@/components/contratos/EditorDeCategorias";
import FormularioDePartida from "@/components/contratos/FormularioDePartida";
import ListaDePartidas, { type FilaDePartida } from "@/components/contratos/ListaDePartidas";
import PanelDePresupuesto from "@/components/contratos/PanelDePresupuesto";
import CotizacionesDeLaLinea, { type FilaDeCotizacionParaMostrar } from "@/components/contratos/CotizacionesDeLaLinea";
import { exigirAccesoApp, exigirCapacidadEnPagina, tieneAccesoAApp } from "@/lib/contratos/autorizacion";
import { origenDeGasto } from "@/lib/contratos/capacitaciones-gastos";
import { situacionDePago } from "@/lib/contratos/capacitaciones-modelo";
import {
  cargarResumenDePresupuesto,
  leerTiposDeCambio,
  listarAprobadores,
  listarCambiosDePresupuesto,
  listarCotizacionesDeLinea,
  puedeAprobar,
} from "@/lib/contratos/gastos";
import { analizarCotizaciones, lineaTieneOrdenDeCompra } from "@/lib/contratos/gastos-modelo";
import { candidatosDeModulo } from "@/lib/contratos/responsables-de-modulo";
import { listarPlazos } from "@/lib/contratos/plazos";
import type { UsuarioConAcceso } from "@/lib/contratos/tipos";
import { fechaCorta, hoyEnChile } from "@/lib/contratos/acreditacion-modelo";
import {
  listarCategorias,
  listarPartidas,
  listarReferenciasA,
  obtenerPartida,
  usoDeCategorias,
} from "@/lib/contratos/arranque";
import {
  MODULOS,
  esAlerta,
  etiquetaDeEstadoDePartida,
  resumir,
  type ModuloArranque,
} from "@/lib/contratos/arranque-modelo";
import { TARJETA } from "@/lib/contratos/estilos";
import { listarResponsables } from "@/lib/contratos/responsables";
import { tieneAccesoASharePoint } from "@/lib/contratos/graph-credenciales";
import { formatearPeso, listarArchivosDeCarpeta } from "@/lib/contratos/sharepoint";
import type { ArchivoDeCarpeta } from "@/lib/contratos/sharepoint";
import {
  conectarGastosAction,
  conectarLogisticaAction,
} from "../acciones-partidas";
import { Protegido, SoloSi } from "@/components/contratos/PermisosDelUsuario";

// Las pantallas de Logística y Gastos de arranque son las mismas con otras etiquetas,
// así que viven acá una sola vez y cada ruta (logistica/, gastos-arranque/) es un
// archivo de tres líneas que dice de cuál módulo se trata. Esta carpeta empieza con
// guion bajo para que Next no la trate como una ruta.

function ErrorDeBase({ modulo, detalle }: { modulo: ModuloArranque; detalle: string }) {
  return (
    <div className="mt-8 rounded-xl border border-amber-200 bg-amber-50 p-5">
      <p className="flex items-center gap-2 text-sm font-bold text-amber-700">
        <IconAlertTriangle size={18} />
        No se pudo leer la base de datos
      </p>
      <p className="mt-1.5 text-xs leading-relaxed text-amber-700/90">
        ¿Se corrió la migración <code className="font-mono">supabase/contratos/0001_contratos.sql</code>
        en Supabase? Módulo: {MODULOS[modulo].titulo}. Detalle: {detalle}
      </p>
    </div>
  );
}

async function Cabecera({
  modulo,
  acciones,
  atras,
  conDescripcion = false,
}: {
  modulo: ModuloArranque;
  acciones?: React.ReactNode;
  atras?: { href: string; texto: string };
  /** La descripción del módulo, al pasar el mouse por el título. Solo en la pantalla principal. */
  conDescripcion?: boolean;
}) {
  const config = MODULOS[modulo];
  return (
    <>
      {atras ? (
        <Link
          href={atras.href}
          className="inline-flex min-h-11 items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-gris transition hover:text-azul"
        >
          <IconArrowLeft size={14} />
          {atras.texto}
        </Link>
      ) : (
        <span className="etiqueta-seccion">{(await contratoActual()).nombre}</span>
      )}
      <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
        {conDescripcion ? (
          <TituloConDescripcion titulo={config.titulo} descripcion={config.descripcion} />
        ) : (
          <h1 className="titular text-3xl text-azul">{config.titulo}</h1>
        )}
        {acciones && <div className="flex items-center gap-2">{acciones}</div>}
      </div>
    </>
  );
}

const BOTON_PRINCIPAL =
  "inline-flex min-h-11 items-center gap-2 rounded-lg bg-azul px-4 py-2 text-xs font-bold uppercase tracking-wide text-white transition hover:bg-azul-suave";
const BOTON_SECUNDARIO =
  "inline-flex min-h-11 items-center gap-2 rounded-lg border border-borde px-3 py-2 text-xs font-bold uppercase tracking-wide text-azul transition hover:border-cian";

const NOMBRE_CORTO = { logistica: "Logística", gastos: "Gastos" } as const;

/** «0007 · Despacho a Calama»: cómo se nombra una partida cuando se la menciona desde otra. */
function etiquetaDePartida(p: { numero: number; descripcion: string }): string {
  return `${String(p.numero).padStart(4, "0")} · ${p.descripcion}`;
}

/** Lo que relaciona a una partida con el otro módulo: lo que ella apunta y lo que la apunta. */
function vinculosDe(
  modulo: ModuloArranque,
  p: { id: string; partidaVinculadaId: string | null },
  delOtro: { id: string; modulo: ModuloArranque; numero: number; descripcion: string; partidaVinculadaId: string | null }[],
): { texto: string; href: string }[] {
  const otro = modulo === "gastos" ? "logistica" : "gastos";
  const salida: { texto: string; href: string }[] = [];

  const apuntada = p.partidaVinculadaId ? delOtro.find((o) => o.id === p.partidaVinculadaId) : undefined;
  if (apuntada) {
    salida.push({ texto: `${NOMBRE_CORTO[otro]}: ${apuntada.descripcion}`, href: `${MODULOS[otro].ruta}/${apuntada.id}` });
  }
  for (const o of delOtro) {
    if (o.partidaVinculadaId === p.id && o.id !== apuntada?.id) {
      salida.push({ texto: `${NOMBRE_CORTO[otro]}: ${o.descripcion}`, href: `${MODULOS[otro].ruta}/${o.id}` });
    }
  }
  return salida;
}

/** La pantalla principal del módulo: resumen y lista. */
/**
 * Todo lo que el panel de presupuesto de Gastos necesita, en paralelo. Cualquier fallo sube: la
 * pantalla lo muestra como «no se pudo leer la base» con la migración que probablemente falta.
 */
async function datosDelPresupuesto(usuario: UsuarioConAcceso) {
  const [resumen, cambios, idsAprobadores, candidatos, autorizado] = await Promise.all([
    cargarResumenDePresupuesto(),
    listarCambiosDePresupuesto(),
    listarAprobadores(),
    candidatosDeModulo("gastos"),
    puedeAprobar(usuario),
  ]);
  const nombres = new Map(candidatos.map((c) => [c.id, c.nombre]));
  return {
    resumen,
    cambios,
    puedeEditar: autorizado,
    esAdmin: usuario.rol === "admin",
    candidatos,
    aprobadores: idsAprobadores.flatMap((id) => (nombres.has(id) ? [{ id, nombre: nombres.get(id) as string }] : [])),
  };
}

export async function PaginaDelModulo({ modulo }: { modulo: ModuloArranque }) {
  const config = MODULOS[modulo];
  const usuario = await exigirAccesoApp(config.appSlug);

  let datos;
  let presupuesto: Awaited<ReturnType<typeof datosDelPresupuesto>> | null = null;
  let delOtroModulo: Awaited<ReturnType<typeof listarPartidas>> = [];
  try {
    datos = await Promise.all([
      listarPartidas(modulo),
      listarCategorias(modulo, { incluirInactivas: true }),
      listarResponsables(),
    ]);
    // Las del otro módulo, solo para mostrar con qué se relaciona cada una.
    delOtroModulo = await listarPartidas(modulo === "gastos" ? "logistica" : "gastos");
    if (modulo === "gastos") presupuesto = await datosDelPresupuesto(usuario);
  } catch (e) {
    return (
      <div className="animar-entrada">
        <Cabecera modulo={modulo} />
        <ErrorDeBase modulo={modulo} detalle={e instanceof Error ? e.message : "desconocido"} />
      </div>
    );
  }

  const [partidas, categorias, responsables] = datos;
  const hoy = hoyEnChile();
  const resumen = resumir(modulo, partidas, hoy);
  const nombreCategoria = new Map(categorias.map((c) => [c.id, c.nombre]));
  const nombreResponsable = new Map(
    [...responsables.internos, ...responsables.externos].map((p) => [p.id, p.nombre]),
  );

  const filas: FilaDePartida[] = partidas.map((p) => ({
    id: p.id,
    descripcion: p.descripcion,
    categoriaId: p.categoriaId,
    categoria: nombreCategoria.get(p.categoriaId) ?? "—",
    proveedor: p.proveedor,
    referencia: p.referencia,
    estado: p.estado,
    fecha: p.fecha,
    montoPresupuestado: p.montoPresupuestado,
    montoReal: p.montoReal,
    enlace: p.enlace,
    carpetaUrl: p.carpetaUrl,
    responsable: p.responsableId ? (nombreResponsable.get(p.responsableId) ?? null) : null,
    alerta: esAlerta(modulo, p, hoy),
    vinculos: vinculosDe(modulo, p, delOtroModulo),
  }));

  const { avance } = resumen;

  return (
    <div className="animar-entrada">
      <Cabecera
        modulo={modulo}
        conDescripcion
        acciones={
          <>
            <Link href={`${config.ruta}/nueva`} className={BOTON_PRINCIPAL}>
              <IconPlus size={16} />
              Nuevo {config.singular}
            </Link>
            {/* <a> y no <Link>: es una descarga, no una página (con Link el enrutador pide el archivo
                dos veces). La regla del linter no distingue un Route Handler de una página. */}
            <AnclaDeContrato href={`${config.ruta}/exportar`} className={BOTON_SECUNDARIO} aria-label="Exportar a Excel">
              <IconFileSpreadsheet size={16} />
              <span className="hidden sm:inline">Excel</span>
            </AnclaDeContrato>
            <SoloSi capacidad="configurar">
              <Link
                href={`${config.ruta}/categorias`}
                className={BOTON_SECUNDARIO}
                aria-label={modulo === "gastos" ? "Administrar ítems" : "Administrar categorías"}
              >
                <IconSettings size={16} />
                <span className="hidden sm:inline">{modulo === "gastos" ? "Ítems" : "Categorías"}</span>
              </Link>
            </SoloSi>
          </>
        }
      />

      {/* La descripción del módulo ya no ocupa una línea fija: aparece al pasar el mouse por el título. */}
      <div className="mt-3">
        <PlazoDeCabecera modulo={modulo} />
      </div>

      {modulo === "gastos" && presupuesto && (
        <div className="mt-5">
          <PanelDePresupuesto
            resumen={presupuesto.resumen}
            pendientes={presupuesto.resumen.pendientes}
            cambios={presupuesto.cambios}
            puedeEditar={presupuesto.puedeEditar}
            aprobadores={presupuesto.aprobadores}
            candidatosAAprobar={presupuesto.candidatos}
            esAdmin={presupuesto.esAdmin}
          />
        </div>
      )}

      {modulo === "logistica" && (
        <dl className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Dato etiqueta="Requerimientos" valor={avance.total} ayuda={`${avance.noAplican} cancelados`} />
          <Dato
            etiqueta="Ejecutados"
            valor={`${avance.porcentaje}%`}
            tono={avance.porcentaje === 100 && avance.total > 0 ? "ok" : undefined}
            ayuda={`${avance.subidos} de ${avance.total}`}
          />
          <Dato etiqueta="Por solicitar" valor={resumen.porIniciar} ayuda="nadie los ha movido" />
          <Dato
            etiqueta="Atrasados"
            valor={resumen.alertas}
            tono={resumen.alertas > 0 ? "aviso" : undefined}
            ayuda="fecha requerida vencida"
          />
        </dl>
      )}

      <div className="mt-6">
        <ListaDePartidas
          modulo={modulo}
          filas={filas}
          categorias={categorias.map((c) => ({ id: c.id, nombre: c.nombre }))}
        />
      </div>
    </div>
  );
}

/** Alta de una partida. */
export async function PaginaNuevaPartida({ modulo }: { modulo: ModuloArranque }) {
  const config = MODULOS[modulo];
  const usuario = await exigirAccesoApp(config.appSlug);
  // Los archivos se suben con el token de ESTA persona: si no lo conectó, el formulario
  // no ofrece adjuntar y explica dónde hacerlo, en vez de fallar al guardar.
  const conectado = await tieneAccesoASharePoint(usuario.correo);

  let datos;
  try {
    datos = await Promise.all([
      listarCategorias(modulo, { incluirInactivas: true }),
      listarResponsables(),
      listarPartidas(modulo === "gastos" ? "logistica" : "gastos"),
    ]);
  } catch (e) {
    return (
      <div className="animar-entrada">
        <Cabecera modulo={modulo} atras={{ href: config.ruta, texto: config.titulo }} />
        <ErrorDeBase modulo={modulo} detalle={e instanceof Error ? e.message : "desconocido"} />
      </div>
    );
  }
  const [categorias, responsables, delOtroModulo] = datos;
  const vinculables = delOtroModulo.map((o) => ({ id: o.id, etiqueta: etiquetaDePartida(o) }));

  return (
    <div className="animar-entrada">
      <Cabecera modulo={modulo} atras={{ href: config.ruta, texto: config.titulo }} />
      <p className="mt-3 text-sm text-gris">Nuevo {config.singular}.</p>

      {categorias.filter((c) => c.activo).length === 0 ? (
        <div className={`${TARJETA} mt-6 p-6 text-sm text-gris`}>
          Antes de agregar hace falta al menos una categoría.{" "}
          <Link href={`${config.ruta}/categorias`} className="font-bold text-azul hover:underline">
            Crea la primera
          </Link>
          .
        </div>
      ) : (
        <div className={`${TARJETA} mt-6 p-5 sm:p-6`}>
          <FormularioDePartida
            modulo={modulo}
            categorias={categorias}
            responsables={responsables}
            vinculables={vinculables}
            sharePointConectado={conectado}
          />
        </div>
      )}
    </div>
  );
}

/** La ficha de una partida: editar y eliminar. */
export async function PaginaDeLaPartida({
  modulo,
  partidaId,
}: {
  modulo: ModuloArranque;
  partidaId: string;
}) {
  const config = MODULOS[modulo];
  const usuario = await exigirAccesoApp(config.appSlug);

  // Un id que no es un UUID haría fallar la consulta con un error de Postgres: para
  // quien lo escribió a mano es lo mismo que no existir.
  if (!/^[0-9a-f-]{36}$/i.test(partidaId)) notFound();

  let datos;
  try {
    datos = await Promise.all([
      obtenerPartida(partidaId),
      listarCategorias(modulo, { incluirInactivas: true }),
      listarResponsables(),
      listarPartidas(modulo === "gastos" ? "logistica" : "gastos"),
      listarReferenciasA(partidaId),
    ]);
  } catch (e) {
    return (
      <div className="animar-entrada">
        <Cabecera modulo={modulo} atras={{ href: config.ruta, texto: config.titulo }} />
        <ErrorDeBase modulo={modulo} detalle={e instanceof Error ? e.message : "desconocido"} />
      </div>
    );
  }
  const [partida, categorias, responsables, delOtroModulo, referencias] = datos;
  // De otro módulo es lo mismo que inexistente: el guardia de arriba es el de ESTE.
  if (!partida || partida.modulo !== modulo) notFound();

  const otro = modulo === "gastos" ? "logistica" : "gastos";
  const vinculables = delOtroModulo.map((o) => ({ id: o.id, etiqueta: etiquetaDePartida(o) }));
  const apuntada = partida.partidaVinculadaId ? delOtroModulo.find((o) => o.id === partida.partidaVinculadaId) : undefined;
  // Lo que la apunta, sin repetir lo que ella misma apunta.
  const referenciadaPor = referencias.filter((r) => r.id !== apuntada?.id);

  // Las cotizaciones existen solo en Gastos. Se leen antes que SharePoint para que un fallo de la
  // base se muestre como tal, y no como una ficha a medias.
  let cotizacionesDeLaLinea: Awaited<ReturnType<typeof listarCotizacionesDeLinea>> = [];
  let datosDeGastos: {
    autorizado: boolean;
    tiposDeCambio: Awaited<ReturnType<typeof leerTiposDeCambio>>;
    fechaLimite: string | null;
  } | null = null;
  if (modulo === "gastos") {
    try {
      const [lista, autorizado, tiposDeCambio, plazos] = await Promise.all([
        listarCotizacionesDeLinea(partida.id),
        puedeAprobar(usuario),
        leerTiposDeCambio(),
        listarPlazos(),
      ]);
      cotizacionesDeLaLinea = lista;
      // Para cuándo tiene que estar lo comprado: la fecha de la línea, o la fecha límite del módulo.
      datosDeGastos = { autorizado, tiposDeCambio, fechaLimite: partida.fecha ?? plazos.gastos ?? null };
    } catch (e) {
      return (
        <div className="animar-entrada">
          <Cabecera modulo={modulo} atras={{ href: config.ruta, texto: config.titulo }} />
          <ErrorDeBase modulo={modulo} detalle={e instanceof Error ? e.message : "desconocido"} />
        </div>
      );
    }
  }

  // Los documentos viven en SharePoint y el core los lee con el token de ESTA persona:
  // si todavía no lo conectó, pedírselo es un paso, no un error. Y si SharePoint no deja
  // leer la carpeta (sin acceso, caída), se dice, en vez de mostrar «sin documentos»:
  // una lista vacía por un error es peor que el error.
  const conectado = await tieneAccesoASharePoint(usuario.correo);
  // Si este gasto nació de la factura de un curso o examen de Acreditación Personas, de cuál.
  const origen = modulo === "gastos" ? await origenDeGasto(partida.id) : null;
  const puedeVerOrigen = origen ? await tieneAccesoAApp(usuario, "acreditacion") : false;
  let archivos: ArchivoParaMostrar[] = [];
  let errorDeLectura: string | null = null;
  if (conectado && partida.carpetaItemId) {
    try {
      archivos = (await listarArchivosDeCarpeta(partida.carpetaItemId)).map((a) => ({
        id: a.id,
        nombre: a.nombre,
        peso: formatearPeso(a.tamano),
        fecha: a.subidoEn ? new Date(a.subidoEn).toLocaleDateString("es-CL") : "",
        subidoPor: a.subidoPor,
        webUrl: a.webUrl,
      }));
    } catch (e) {
      errorDeLectura = e instanceof Error ? e.message : "No se pudo leer la carpeta en SharePoint.";
    }
  }

  // Los archivos de cada cotización, de SharePoint. Uno que no se pueda leer no tumba la ficha: esa
  // tarjeta dice por qué, y las demás siguen.
  const filasDeCotizacion: FilaDeCotizacionParaMostrar[] = [];
  let analisisDeCotizaciones: ReturnType<typeof analizarCotizaciones> | null = null;
  if (modulo === "gastos" && datosDeGastos) {
    analisisDeCotizaciones = analizarCotizaciones(cotizacionesDeLaLinea, {
      hoy: hoyEnChile(),
      fechaLimite: datosDeGastos.fechaLimite,
    });
    const leidos = await Promise.all(
      analisisDeCotizaciones.filas.map(async (fila) => {
        const carpeta = fila.cotizacion.carpetaItemId;
        if (!conectado || !carpeta) return { archivos: [] as ArchivoDeCarpeta[], error: null as string | null };
        try {
          return { archivos: await listarArchivosDeCarpeta(carpeta), error: null as string | null };
        } catch (e) {
          return {
            archivos: [] as ArchivoDeCarpeta[],
            error: e instanceof Error ? e.message : "No se pudo leer la carpeta en SharePoint.",
          };
        }
      }),
    );
    analisisDeCotizaciones.filas.forEach((fila, i) => {
      filasDeCotizacion.push({
        fila,
        errorDeLectura: leidos[i].error,
        archivos: leidos[i].archivos.map((a) => ({
          id: a.id,
          nombre: a.nombre,
          peso: formatearPeso(a.tamano),
          fecha: a.subidoEn ? new Date(a.subidoEn).toLocaleDateString("es-CL") : "",
          subidoPor: a.subidoPor,
          webUrl: a.webUrl,
        })),
      });
    });
  }

  return (
    <div className="animar-entrada">
      <Cabecera modulo={modulo} atras={{ href: config.ruta, texto: config.titulo }} />
      <p className="mt-3 text-sm text-gris">
        Creado {partida.creadoPor ? `por ${partida.creadoPor} ` : ""}el{" "}
        {new Date(partida.creadoEn).toLocaleDateString("es-CL")}.
      </p>

      {conectado ? (
        <DocumentosDePartida
          modulo={modulo}
          partidaId={partida.id}
          archivos={archivos}
          carpetaUrl={partida.carpetaUrl}
          errorDeLectura={errorDeLectura}
        />
      ) : (
        <ConectarSharePoint
          accion={modulo === "logistica" ? conectarLogisticaAction : conectarGastosAction}
        />
      )}

      {modulo === "gastos" && datosDeGastos && analisisDeCotizaciones && (
        <CotizacionesDeLaLinea
          partidaId={partida.id}
          cantidadDeLaLinea={partida.cantidad}
          filas={filasDeCotizacion}
          analisis={analisisDeCotizaciones}
          puedeAprobar={datosDeGastos.autorizado}
          conectado={conectado}
          tiposDeCambio={datosDeGastos.tiposDeCambio}
          hermanas={cotizacionesDeLaLinea}
          lineaConOrdenDeCompra={lineaTieneOrdenDeCompra(partida.estado)}
        />
      )}

      {origen && (
        <section aria-labelledby="origen-titulo" className="mt-6">
          <h2 id="origen-titulo" className="titular text-lg text-azul">
            Origen
          </h2>
          <div className={`${TARJETA} mt-3 px-4 py-3 text-sm text-gris`}>
            Factura del {origen.tipo === "examen" ? "examen" : "curso"}{" "}
            <strong className="text-tinta">{origen.curso}</strong> de{" "}
            {puedeVerOrigen ? (
              <Link
                href={`/contratos/acreditacion/${origen.personaId}?tab=cursos`}
                className="font-semibold text-azul hover:underline"
              >
                {origen.persona}
              </Link>
            ) : (
              <strong className="text-tinta">{origen.persona}</strong>
            )}{" "}
            (Acreditación Personas).
            {origen.plazoDePagoDias && partida.estado !== "pagado" && partida.estado !== "anulado" && (
              <>
                {" "}
                <strong className="text-tinta">Pago a {origen.plazoDePagoDias} días</strong>
                {(() => {
                  const pago = situacionDePago(
                    { pagada: false, anulada: false, fecha: partida.fecha },
                    origen.plazoDePagoDias,
                    hoyEnChile(),
                  );
                  return pago.vence ? (
                    <span className={pago.clave === "vencido" ? "font-semibold text-red-600" : undefined}>
                      {" "}
                      · vence el {fechaCorta(pago.vence)}
                      {pago.clave === "vencido" ? ` (vencido hace ${-(pago.dias ?? 0)} días)` : ""}.
                    </span>
                  ) : (
                    "."
                  );
                })()}
              </>
            )}{" "}
            Lo que se corrija acá, la ficha de la persona lo refleja; y al eliminar el curso o examen allá se puede elegir si este gasto también se elimina.
          </div>
        </section>
      )}

      {(apuntada || referenciadaPor.length > 0) && (
        <section aria-labelledby="vinculos-titulo" className="mt-6">
          <h2 id="vinculos-titulo" className="titular text-lg text-azul">
            Relacionado con {NOMBRE_CORTO[otro]}
          </h2>
          <ul className={`${TARJETA} mt-3 divide-y divide-borde`}>
            {[...(apuntada ? [apuntada] : []), ...referenciadaPor].map((o) => (
              <li key={o.id}>
                <Link
                  href={`${MODULOS[otro].ruta}/${o.id}`}
                  className="flex min-h-11 items-center gap-3 px-4 py-2.5 transition hover:bg-cian-lavado/60"
                >
                  <IconLink size={16} className="shrink-0 text-cian" aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-tinta">{etiquetaDePartida(o)}</span>
                    <span className="block text-[11px] text-gris">
                      {etiquetaDeEstadoDePartida(otro, o.estado)}
                      {o.id === apuntada?.id ? " · a la que se vincula" : " · la referencia"}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <h2 className="titular mt-8 text-lg text-azul">Datos</h2>
      <div className={`${TARJETA} mt-3 p-5 sm:p-6`}>
        <Protegido capacidad="editar">
          <FormularioDePartida
            modulo={modulo}
            partida={partida}
            categorias={categorias}
            responsables={responsables}
            vinculables={vinculables}
          />
        </Protegido>
      </div>

      <div className="mt-6 border-t border-borde pt-4">
        <SoloSi capacidad="editar">
          <BotonEliminarPartida modulo={modulo} partidaId={partida.id} descripcion={partida.descripcion} />
        </SoloSi>
      </div>
    </div>
  );
}

/** Administrar las categorías del módulo. */
export async function PaginaDeCategorias({ modulo }: { modulo: ModuloArranque }) {
  const config = MODULOS[modulo];
  await exigirCapacidadEnPagina(config.appSlug, "configurar", config.ruta);

  let datos;
  try {
    datos = await Promise.all([listarCategorias(modulo, { incluirInactivas: true }), usoDeCategorias(modulo)]);
  } catch (e) {
    return (
      <div className="animar-entrada">
        <Cabecera modulo={modulo} atras={{ href: config.ruta, texto: config.titulo }} />
        <ErrorDeBase modulo={modulo} detalle={e instanceof Error ? e.message : "desconocido"} />
      </div>
    );
  }
  const [categorias, uso] = datos;

  return (
    <div className="animar-entrada">
      <Cabecera modulo={modulo} atras={{ href: config.ruta, texto: config.titulo }} />
      <p className="mt-3 max-w-2xl text-sm text-gris">
        {modulo === "gastos"
          ? `Los ítems ordenan los gastos —por ejemplo «Sala de activación»— y cada uno lleva su presupuesto, que se
             asigna desde la pantalla de Gastos. Puedes agregar los que falten, renombrarlos o desactivarlos; un ítem
             con gastos registrados no se elimina, se desactiva.`
          : `Las categorías ordenan los ${config.plural}. Puedes agregar las que falten, renombrarlas o
             desactivarlas; una categoría con ${config.plural} registrados no se elimina, se desactiva.`}
      </p>

      <div className="mt-6">
        <EditorDeCategorias
          modulo={modulo}
          categorias={categorias.map((c) => ({
            id: c.id,
            nombre: c.nombre,
            activo: c.activo,
            enUso: uso.get(c.id) ?? 0,
          }))}
        />
      </div>
    </div>
  );
}

function Dato({
  etiqueta,
  valor,
  tono,
  ayuda,
}: {
  etiqueta: string;
  valor: number | string;
  tono?: "ok" | "aviso";
  ayuda?: string;
}) {
  // El color solo cuando hay algo que mirar: un cero en ámbar es una alarma que dice
  // «todo bien».
  const color = tono === "ok" ? "text-emerald-600" : tono === "aviso" ? "text-amber-600" : "text-tinta";
  return (
    <div className={`${TARJETA} p-4`}>
      <dd className={`text-xl font-extrabold tabular-nums sm:text-2xl ${color}`}>{valor}</dd>
      <dt className="text-[11px] font-bold uppercase tracking-wide text-gris">{etiqueta}</dt>
      {ayuda && <p className="mt-0.5 text-[11px] text-gris-suave">{ayuda}</p>}
    </div>
  );
}

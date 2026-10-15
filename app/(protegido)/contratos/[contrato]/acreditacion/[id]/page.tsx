import Link from "@/components/contratos/Enlace";
import { notFound } from "next/navigation";
import {
  IconAlertTriangle,
  IconArrowLeft,
  IconExternalLink,
  IconFolderOpen,
} from "@tabler/icons-react";
import BarraDeAvance from "@/components/contratos/BarraDeAvance";
import BotonEliminarPersona from "@/components/contratos/BotonEliminarPersona";
import BotonEnviar from "@/components/contratos/BotonEnviar";
import ChecklistAcreditacion from "@/components/contratos/ChecklistAcreditacion";
import ChipDeEtapa from "@/components/contratos/ChipDeEtapa";
import ConectarSharePoint from "@/components/contratos/ConectarSharePoint";
import FormularioDatosPersona from "@/components/contratos/FormularioDatosPersona";
import FormularioSeguimiento from "@/components/contratos/FormularioSeguimiento";
import PanelDeCapacitaciones from "@/components/contratos/PanelDeCapacitaciones";
import { exigirAccesoApp, tieneAccesoAApp } from "@/lib/contratos/autorizacion";
import { puede } from "@/lib/contratos/permisos";
import { MODULOS } from "@/lib/contratos/arranque-modelo";
import { leerFacturasConArchivos } from "@/lib/contratos/capacitaciones-gastos";
import type { DocumentoDelCurso } from "@/components/contratos/DocumentoYFacturaDeCurso";
import { TARJETA } from "@/lib/contratos/estilos";
import {
  ETIQUETAS_WEB_CONTROL,
  avanceDePersona,
  contarVencimientos,
  diasParaTermino,
  estaContratada,
  etapaDe,
  fechaCorta,
  hoyEnChile,
} from "@/lib/contratos/acreditacion-modelo";
import { resumenDeFicha } from "@/lib/contratos/capacitaciones-modelo";
import { listarCargos, listarHistorial, listarTipos, obtenerPersona } from "@/lib/contratos/acreditacion";
import { tieneAccesoASharePoint } from "@/lib/contratos/graph-credenciales";
import { formatearRut } from "@/lib/contratos/rut";
import {
  actualizarDatosAction,
  actualizarSeguimientoAction,
  agregarCursoAction,
  cambiarActivoAction,
  cambiarEstadoDocumentoAction,
  cambiarRequeridoExtraAction,
  conectarSharePointAction,
  eliminarArchivoAction,
  guardarDetalleDocumentoAction,
  prepararSubidaDocumentoAction,
  registrarSubidaDocumentoAction,
} from "../acciones";

export const dynamic = "force-dynamic";

const PESTANAS = [
  { clave: "documentos", etiqueta: "Documentos" },
  { clave: "datos", etiqueta: "Datos" },
  { clave: "cursos", etiqueta: "Cursos y exámenes" },
  { clave: "seguimiento", etiqueta: "Seguimiento" },
  { clave: "historial", etiqueta: "Historial" },
] as const;

type Pestana = (typeof PESTANAS)[number]["clave"];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function FichaPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ [clave: string]: string | string[] | undefined }>;
}) {
  const usuario = await exigirAccesoApp("acreditacion");

  const { id } = await params;
  // Un id que no es un UUID haría fallar la consulta con un error de Postgres, no
  // con un "no encontrado": se corta antes de llegar a la base.
  if (!UUID.test(id)) notFound();

  const consulta = await searchParams;
  const pestana: Pestana =
    PESTANAS.find((p) => p.clave === consulta.tab)?.clave ?? "documentos";
  const soloPendientes = consulta.ver === "pendientes";

  const [encontrada, tipos, cargos] = await Promise.all([
    obtenerPersona(id),
    listarTipos(),
    listarCargos(),
  ]);
  if (!encontrada) notFound();

  const { persona, documentos, cursos } = encontrada;
  const hoy = hoyEnChile();
  const cargo = cargos.find((c) => c.id === persona.cargoId);
  const delCargo = new Set(cargo?.tipoIds ?? []);

  const avance = avanceDePersona(tipos, delCargo, documentos, hoy);
  const etapa = etapaDe(avance, persona);
  const { porVencer, vencidos } = contarVencimientos(tipos, delCargo, documentos, hoy);
  const diasTermino = diasParaTermino(persona, hoy);
  const resumenCursos = resumenDeFicha(cursos, hoy);

  const historial = pestana === "historial" ? await listarHistorial(persona.id) : [];

  // Antes de ofrecer subir, no después de que falle: sin el permiso de SharePoint
  // la subida termina en un error de Microsoft sobre un consentimiento que nadie
  // pidió. Sabiéndolo antes, la pantalla ofrece el botón que lo arregla.
  const conectado =
    pestana === "documentos" || pestana === "cursos" ? await tieneAccesoASharePoint(usuario.correo) : true;

  // Lo de la pestaña Cursos y exámenes: el documento de cada uno (de la lista de documentos de la
  // persona) y su factura (una línea de Gastos de arranque). Solo se lee ahí: es el único lugar que
  // lo muestra, y los archivos de la factura salen de SharePoint.
  const [puedeVerGastos, puedeCrearEnGastos] =
    pestana === "cursos"
      ? await Promise.all([
          tieneAccesoAApp(usuario, MODULOS.gastos.appSlug),
          tieneAccesoAApp(usuario, MODULOS.gastos.appSlug).then((v) => v && puede(usuario.rol, "crear")),
        ])
      : [false, false];

  const documentosDeCursos: Record<string, DocumentoDelCurso> = {};
  if (pestana === "cursos") {
    for (const c of cursos) {
      if (!c.documentoTipoId) continue;
      const tipo = tipos.find((t) => t.id === c.documentoTipoId);
      const doc = documentos.get(c.documentoTipoId);
      if (!tipo || !doc) continue;
      documentosDeCursos[c.id] = {
        tipoId: tipo.id,
        nombre: tipo.nombre,
        archivos: doc.archivos.map((a) => ({ id: a.id, nombre: a.nombre, url: a.url })),
      };
    }
  }

  const lecturaDeFacturas =
    pestana === "cursos"
      ? await leerFacturasConArchivos(
          cursos.flatMap((c) => (c.partidaGastoId ? [c.partidaGastoId] : [])),
          conectado,
        )
      : { facturas: {}, archivos: {}, errorDeArchivos: false };

  return (
    <div className="animar-entrada">
      <Link
        href="/contratos/acreditacion"
        className="inline-flex items-center gap-1 text-xs font-bold uppercase tracking-wide text-gris transition hover:text-azul"
      >
        <IconArrowLeft size={14} />
        Nómina
      </Link>

      <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="titular text-2xl text-azul sm:text-3xl">{persona.nombre}</h1>
          <p className="mt-1 text-sm text-gris">
            #{persona.numero} · {formatearRut(persona.rut)} · {cargo?.nombre ?? "Sin cargo"}
            {persona.datos.faena ? ` · ${persona.datos.faena}` : ""}
            {persona.datos.turno ? ` · ${persona.datos.turno}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {persona.activo && !estaContratada(persona) && (
            <span
              title="No cuenta como contratada en la dotación: falta la fecha de ingreso en Datos, o está marcada «sin contrato aún»."
              className="rounded-lg border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] font-bold uppercase tracking-wide text-amber-700"
            >
              Sin contrato aún
            </span>
          )}
          {!persona.activo && (
            <span className="rounded-lg border border-borde bg-fondo px-2 py-1 text-[11px] font-bold uppercase tracking-wide text-gris">
              De baja
            </span>
          )}
          <ChipDeEtapa etapa={etapa} />
        </div>
      </div>

      <BarraDeAvance avance={avance} titulo="Avance de la documentación" unidad="cargados" />

      <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Hito
          etiqueta="Web Control"
          valor={persona.wcAcreditado ? "Acreditado" : ETIQUETAS_WEB_CONTROL[persona.estadoWebControl]}
          hecho={persona.wcAcreditado}
        />
        <Hito etiqueta="BUK" valor={persona.creadoEnBuk ? "Creado" : "Pendiente"} hecho={persona.creadoEnBuk} />
        <Hito
          etiqueta="Cursos y exámenes"
          valor={resumenCursos.texto}
          hecho={resumenCursos.hecho}
        />
        <Hito
          etiqueta="Pase"
          valor={persona.numeroPase ? `N.º ${persona.numeroPase}` : "Sin pase"}
          detalle={persona.estadoPase}
          hecho={Boolean(persona.numeroPase)}
        />
      </dl>

      {(vencidos > 0 || porVencer > 0 || (diasTermino !== null && diasTermino <= 30)) && (
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <p className="flex items-center gap-2 text-sm font-bold text-amber-700">
            <IconAlertTriangle size={17} />
            Hay que revisar
          </p>
          <ul className="mt-1.5 list-disc space-y-0.5 pl-9 text-xs text-amber-700/90">
            {vencidos > 0 && (
              <li>
                {vencidos} {vencidos === 1 ? "documento vencido" : "documentos vencidos"}: no cuentan
                para el avance hasta renovarlos.
              </li>
            )}
            {porVencer > 0 && (
              <li>
                {porVencer} {porVencer === 1 ? "documento vence" : "documentos vencen"} en los
                próximos 30 días.
              </li>
            )}
            {diasTermino !== null && diasTermino <= 30 && (
              <li>
                {diasTermino < 0
                  ? "El contrato ya terminó"
                  : diasTermino === 0
                    ? "El contrato termina hoy"
                    : `El contrato termina en ${diasTermino} ${diasTermino === 1 ? "día" : "días"}`}{" "}
                ({fechaCorta(persona.datos.fecha_termino_2 ?? persona.datos.fecha_termino_1)}).
              </li>
            )}
          </ul>
        </div>
      )}

      <nav
        aria-label="Secciones de la ficha"
        className="mt-6 flex gap-1 overflow-x-auto border-b border-borde"
      >
        {PESTANAS.map((p) => (
          <Link
            key={p.clave}
            href={p.clave === "documentos" ? `?` : `?tab=${p.clave}`}
            aria-current={pestana === p.clave ? "page" : undefined}
            className={`-mb-px flex min-h-11 shrink-0 items-center border-b-2 px-4 text-xs font-bold uppercase tracking-wide transition ${
              pestana === p.clave
                ? "border-cian text-azul"
                : "border-transparent text-gris hover:text-azul"
            }`}
          >
            {p.etiqueta}
          </Link>
        ))}
      </nav>

      <div className="mt-6">
        {pestana === "documentos" && (
          <>
            {!conectado && <ConectarSharePoint accion={conectarSharePointAction} />}

            <div className={`mb-4 flex flex-wrap items-center justify-between gap-3 ${conectado ? "" : "mt-6"}`}>
              <div className="flex gap-1 rounded-lg border border-borde p-0.5 text-[11px] font-bold uppercase tracking-wide">
                <Link
                  href="?"
                  className={`rounded-md px-3 py-1.5 transition ${!soloPendientes ? "bg-cian-lavado text-azul" : "text-gris hover:text-azul"}`}
                >
                  Todos
                </Link>
                <Link
                  href="?ver=pendientes"
                  className={`rounded-md px-3 py-1.5 transition ${soloPendientes ? "bg-cian-lavado text-azul" : "text-gris hover:text-azul"}`}
                >
                  Lo que falta
                </Link>
              </div>

              {persona.carpetaUrl ? (
                <a
                  href={persona.carpetaUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-azul hover:underline"
                >
                  <IconFolderOpen size={15} />
                  Carpeta en SharePoint
                  <IconExternalLink size={12} />
                </a>
              ) : (
                <p className="text-xs text-gris-suave">
                  Su carpeta en SharePoint se crea al subir el primer documento.
                </p>
              )}
            </div>

            <ChecklistAcreditacion
              personaId={persona.id}
              acciones={{
                prepararSubida: prepararSubidaDocumentoAction,
                registrarSubida: registrarSubidaDocumentoAction,
                eliminarArchivo: eliminarArchivoAction,
                cambiarEstado: cambiarEstadoDocumentoAction,
                cambiarRequeridoExtra: cambiarRequeridoExtraAction,
                guardarDetalle: guardarDetalleDocumentoAction,
              }}
              tipos={tipos}
              tiposDelCargo={delCargo}
              documentos={documentos}
              hoy={hoy}
              soloPendientes={soloPendientes}
            />
          </>
        )}

        {pestana === "datos" && (
          <div className={`${TARJETA} p-4 sm:p-5`}>
            <FormularioDatosPersona
              persona={persona}
              cargos={cargos.map((c) => ({ id: c.id, nombre: c.nombre, activo: c.activo }))}
              guardar={actualizarDatosAction.bind(null, persona.id)}
              hoy={hoy}
            />

            <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-borde pt-4">
              <form action={cambiarActivoAction.bind(null, persona.id, !persona.activo)}>
                <BotonEnviar
                  cargando="Guardando..."
                  className="rounded-lg border border-borde px-3 py-2 text-xs font-bold uppercase tracking-wide text-gris transition hover:border-cian hover:text-azul"
                >
                  {persona.activo ? "Dar de baja" : "Reactivar"}
                </BotonEnviar>
              </form>

              {usuario.rol === "admin" && (
                <BotonEliminarPersona
                  personaId={persona.id}
                  nombre={persona.nombre}
                  tieneCarpeta={Boolean(persona.carpetaItemId)}
                />
              )}
            </div>
          </div>
        )}

        {pestana === "cursos" && (
          <>
            {!conectado && <ConectarSharePoint accion={conectarSharePointAction} />}
            <div className={`${TARJETA} p-4 sm:p-5 ${conectado ? "" : "mt-6"}`}>
              <PanelDeCapacitaciones
                personaId={persona.id}
                cursos={cursos}
                hoy={hoy}
                agregar={agregarCursoAction.bind(null, persona.id)}
                contexto={{
                  tipos: tipos.map((t) => ({ id: t.id, nombre: t.nombre, grupo: t.grupo })),
                  documentos: documentosDeCursos,
                  facturas: lecturaDeFacturas.facturas,
                  archivosDeFactura: lecturaDeFacturas.archivos,
                  errorDeArchivos: lecturaDeFacturas.errorDeArchivos,
                  conectado,
                  puedeFacturar: puedeCrearEnGastos,
                  puedeVerGastos,
                }}
              />
            </div>
          </>
        )}

        {pestana === "seguimiento" && (
          <div className={`${TARJETA} max-w-2xl p-4 sm:p-5`}>
            <h2 className="mb-3 text-[11px] font-bold uppercase tracking-wide text-gris">
              Web Control, BUK y pase
            </h2>
            <FormularioSeguimiento
              persona={persona}
              guardar={actualizarSeguimientoAction.bind(null, persona.id)}
            />
          </div>
        )}

        {pestana === "historial" &&
          (historial.length === 0 ? (
            <p className={`${TARJETA} p-6 text-center text-sm text-gris`}>Todavía no hay movimientos.</p>
          ) : (
            // Una sola tarjeta con filas separadas por una línea, no una tarjeta por movimiento: el
            // historial puede tener decenas, y cada tarjeta gastaba el doble en bordes y aire.
            <ol className={`${TARJETA} divide-y divide-borde overflow-hidden`}>
              {historial.map((e) => (
                <li
                  key={e.id}
                  className="flex flex-wrap items-baseline gap-x-3 gap-y-0 px-3.5 py-2 sm:flex-nowrap"
                >
                  <span className="w-full shrink-0 text-sm font-semibold text-tinta sm:w-48">
                    {e.accion}
                  </span>
                  <span className="min-w-0 flex-1 basis-40 text-xs text-gris">{e.detalle}</span>
                  <span className="shrink-0 text-[11px] text-gris-suave">
                    {fechaCorta(e.creadoEn)} · {e.usuarioNombre}
                  </span>
                </li>
              ))}
            </ol>
          ))}
      </div>
    </div>
  );
}

function Hito({
  etiqueta,
  valor,
  detalle,
  hecho,
}: {
  etiqueta: string;
  valor: string;
  detalle?: string | null;
  hecho: boolean;
}) {
  return (
    <div className={`${TARJETA} p-3`}>
      <dt className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-gris">
        <span
          className={`h-2 w-2 rounded-full ${hecho ? "bg-emerald-500" : "bg-gris-suave"}`}
          aria-hidden
        />
        {etiqueta}
      </dt>
      <dd className="mt-1 text-sm font-semibold leading-snug text-tinta">{valor}</dd>
      {detalle && <dd className="text-xs text-gris">{detalle}</dd>}
    </div>
  );
}

import Link from "@/components/contratos/Enlace";
import { notFound } from "next/navigation";
import {
  IconAlertTriangle,
  IconArrowLeft,
  IconExternalLink,
  IconFolderOpen,
} from "@tabler/icons-react";
import BarraDeAvance from "@/components/contratos/BarraDeAvance";
import BotonEliminarVehiculo from "@/components/contratos/BotonEliminarVehiculo";
import BotonEnviar from "@/components/contratos/BotonEnviar";
import ChecklistAcreditacion from "@/components/contratos/ChecklistAcreditacion";
import ChipDeEtapaDeVehiculo from "@/components/contratos/ChipDeEtapaDeVehiculo";
import ConectarSharePoint from "@/components/contratos/ConectarSharePoint";
import FormularioDatosVehiculo from "@/components/contratos/FormularioDatosVehiculo";
import FormularioSeguimientoVehiculo from "@/components/contratos/FormularioSeguimientoVehiculo";
import { exigirAccesoApp } from "@/lib/contratos/autorizacion";
import { TARJETA } from "@/lib/contratos/estilos";
import { fechaCorta, hoyEnChile } from "@/lib/contratos/acreditacion-modelo";
import { TERMINOS_DE_VEHICULO } from "@/lib/contratos/acciones-de-documento";
import { listarCategorias, listarHistorialDeVehiculo, listarTiposDeDocumento, obtenerVehiculo } from "@/lib/contratos/vehiculos";
import {
  ETIQUETAS_WEB_CONTROL_VEHICULO,
  analizarVehiculo,
  descripcionDeVehiculo,
  etapaDeVehiculo,
  formatearPatente,
} from "@/lib/contratos/vehiculos-modelo";
import { tieneAccesoASharePoint } from "@/lib/contratos/graph-credenciales";
import {
  actualizarDatosAction,
  actualizarSeguimientoAction,
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

const RAIZ = "/contratos/acreditacion-vehiculos";

const PESTANAS = [
  { clave: "documentos", etiqueta: "Documentos" },
  { clave: "datos", etiqueta: "Datos" },
  { clave: "seguimiento", etiqueta: "Seguimiento" },
  { clave: "historial", etiqueta: "Historial" },
] as const;

type Pestana = (typeof PESTANAS)[number]["clave"];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function FichaDeVehiculoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ [clave: string]: string | string[] | undefined }>;
}) {
  const usuario = await exigirAccesoApp("acreditacion-vehiculos");

  const { id } = await params;
  // Un id que no es un UUID haría fallar la consulta con un error de Postgres, no con un «no
  // encontrado»: se corta antes de llegar a la base.
  if (!UUID.test(id)) notFound();

  const consulta = await searchParams;
  const pestana: Pestana = PESTANAS.find((p) => p.clave === consulta.tab)?.clave ?? "documentos";
  const soloPendientes = consulta.ver === "pendientes";

  const [encontrado, tipos, categorias] = await Promise.all([
    obtenerVehiculo(id),
    listarTiposDeDocumento(),
    listarCategorias(),
  ]);
  if (!encontrado) notFound();

  const { vehiculo, documentos } = encontrado;
  const hoy = hoyEnChile();
  const categoria = categorias.find((c) => c.id === vehiculo.categoriaId);
  const delTipo = new Set(categoria?.tipoIds ?? []);

  const analisis = analizarVehiculo(vehiculo, documentos, tipos, delTipo, hoy);
  const { avance, vencidos, porVencer } = analisis;
  const etapa = etapaDeVehiculo(avance, vehiculo);
  const patente = formatearPatente(vehiculo.patente);
  const descripcion = descripcionDeVehiculo(vehiculo);

  const historial = pestana === "historial" ? await listarHistorialDeVehiculo(vehiculo.id) : [];

  // Antes de ofrecer subir, no después de que falle: sin el permiso de SharePoint la subida termina en
  // un error de Microsoft sobre un consentimiento que nadie pidió. Sabiéndolo antes, la pantalla
  // ofrece el botón que lo arregla.
  const conectado = pestana === "documentos" ? await tieneAccesoASharePoint(usuario.correo) : true;

  return (
    <div className="animar-entrada">
      <Link
        href={RAIZ}
        className="inline-flex items-center gap-1 text-xs font-bold uppercase tracking-wide text-gris transition hover:text-azul"
      >
        <IconArrowLeft size={14} />
        Flota
      </Link>

      <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="titular text-2xl text-azul sm:text-3xl">{patente}</h1>
          <p className="mt-1 text-sm text-gris">
            #{vehiculo.numero}
            {descripcion ? ` · ${descripcion}` : ""} · {categoria?.nombre ?? "Sin tipo"}
            {vehiculo.datos.faena ? ` · ${vehiculo.datos.faena}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {!vehiculo.activo && (
            <span className="rounded-lg border border-borde bg-fondo px-2 py-1 text-[11px] font-bold uppercase tracking-wide text-gris">
              De baja
            </span>
          )}
          <ChipDeEtapaDeVehiculo etapa={etapa} />
        </div>
      </div>

      <BarraDeAvance avance={avance} titulo="Avance de la documentación" unidad="cargados" />

      <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Hito
          etiqueta="Web Control"
          valor={vehiculo.wcAcreditado ? "Acreditado" : ETIQUETAS_WEB_CONTROL_VEHICULO[vehiculo.estadoWebControl]}
          hecho={vehiculo.wcAcreditado}
        />
        <Hito
          etiqueta="Documentos"
          valor={avance.total === 0 ? "Sin requisitos" : `${avance.subidos} de ${avance.total} vigentes`}
          hecho={avance.total > 0 && avance.subidos === avance.total}
        />
        <Hito
          etiqueta="Vencimientos"
          valor={
            vencidos > 0
              ? `${vencidos} ${vencidos === 1 ? "vencido" : "vencidos"}`
              : porVencer > 0
                ? `${porVencer} por vencer`
                : "Al día"
          }
          hecho={vencidos === 0 && porVencer === 0}
        />
        <Hito
          etiqueta="Conductor"
          valor={vehiculo.datos.conductor ?? "Sin asignar"}
          hecho={Boolean(vehiculo.datos.conductor)}
        />
      </dl>

      {(vencidos > 0 || porVencer > 0) && (
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <p className="flex items-center gap-2 text-sm font-bold text-amber-700">
            <IconAlertTriangle size={17} />
            Hay que revisar
          </p>
          <ul className="mt-1.5 list-disc space-y-0.5 pl-9 text-xs text-amber-700/90">
            {vencidos > 0 && (
              <li>
                {vencidos} {vencidos === 1 ? "documento vencido" : "documentos vencidos"}: no cuentan para el
                avance hasta renovarlos.
              </li>
            )}
            {porVencer > 0 && (
              <li>
                {porVencer} {porVencer === 1 ? "documento vence" : "documentos vencen"} en los próximos 30 días.
              </li>
            )}
          </ul>
        </div>
      )}

      <nav
        aria-label="Secciones de la ficha"
        className="mt-6 flex gap-1 overflow-x-auto overflow-y-hidden border-b border-borde [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {PESTANAS.map((p) => (
          <Link
            key={p.clave}
            href={p.clave === "documentos" ? `?` : `?tab=${p.clave}`}
            aria-current={pestana === p.clave ? "page" : undefined}
            className={`flex min-h-11 shrink-0 items-center border-b-2 px-4 text-xs font-bold uppercase tracking-wide transition ${
              pestana === p.clave ? "border-cian text-azul" : "border-transparent text-gris hover:text-azul"
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

              {vehiculo.carpetaUrl ? (
                <a
                  href={vehiculo.carpetaUrl}
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
              personaId={vehiculo.id}
              acciones={{
                prepararSubida: prepararSubidaDocumentoAction,
                registrarSubida: registrarSubidaDocumentoAction,
                eliminarArchivo: eliminarArchivoAction,
                cambiarEstado: cambiarEstadoDocumentoAction,
                cambiarRequeridoExtra: cambiarRequeridoExtraAction,
                guardarDetalle: guardarDetalleDocumentoAction,
              }}
              terminos={TERMINOS_DE_VEHICULO}
              tipos={tipos}
              tiposDelCargo={delTipo}
              documentos={documentos}
              hoy={hoy}
              soloPendientes={soloPendientes}
            />
          </>
        )}

        {pestana === "datos" && (
          <div className={`${TARJETA} p-4 sm:p-5`}>
            <FormularioDatosVehiculo
              vehiculo={vehiculo}
              categorias={categorias.map((c) => ({ id: c.id, nombre: c.nombre, activo: c.activo }))}
              guardar={actualizarDatosAction.bind(null, vehiculo.id)}
              hoy={hoy}
            />

            <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-borde pt-4">
              <form action={cambiarActivoAction.bind(null, vehiculo.id, !vehiculo.activo)}>
                <BotonEnviar
                  cargando="Guardando..."
                  className="rounded-lg border border-borde px-3 py-2 text-xs font-bold uppercase tracking-wide text-gris transition hover:border-cian hover:text-azul"
                >
                  {vehiculo.activo ? "Dar de baja" : "Reactivar"}
                </BotonEnviar>
              </form>

              {usuario.rol === "admin" && (
                <BotonEliminarVehiculo
                  vehiculoId={vehiculo.id}
                  nombre={patente}
                  tieneCarpeta={Boolean(vehiculo.carpetaItemId)}
                />
              )}
            </div>
          </div>
        )}

        {pestana === "seguimiento" && (
          <div className={`${TARJETA} max-w-3xl p-4 sm:p-5`}>
            <h2 className="mb-3 text-[11px] font-bold uppercase tracking-wide text-gris">Web Control</h2>
            <FormularioSeguimientoVehiculo
              vehiculo={vehiculo}
              guardar={actualizarSeguimientoAction.bind(null, vehiculo.id)}
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
                <li key={e.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-0 px-3.5 py-2 sm:flex-nowrap">
                  <span className="w-full shrink-0 text-sm font-semibold text-tinta sm:w-48">{e.accion}</span>
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

function Hito({ etiqueta, valor, hecho }: { etiqueta: string; valor: string; hecho: boolean }) {
  return (
    <div className={`${TARJETA} p-3`}>
      <dt className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-gris">
        <span className={`h-2 w-2 rounded-full ${hecho ? "bg-emerald-500" : "bg-gris-suave"}`} aria-hidden />
        {etiqueta}
      </dt>
      <dd className="mt-1 text-sm font-semibold leading-snug text-tinta">{valor}</dd>
    </div>
  );
}

"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  IconAlertTriangle,
  IconCheck,
  IconClockHour4,
  IconPlus,
  IconTrophy,
} from "@tabler/icons-react";
import ArchivosDeCotizacion from "./ArchivosDeCotizacion";
import FormularioDeCotizacion from "./FormularioDeCotizacion";
import RuedaCarga from "./RuedaCarga";
import VentanaModal from "./VentanaModal";
import type { ArchivoParaMostrar } from "./DocumentosDePartida";
import { CAMPO, TARJETA } from "@/lib/contratos/estilos";
import { formatearPesos } from "@/lib/contratos/arranque-modelo";
import {
  ETIQUETAS_DE_COTIZACION,
  aprobacionPideMotivo,
  formatearMoneda,
  type AnalisisDeCotizaciones,
  type Cotizacion,
  type EstadoDeCotizacion,
  type FilaDelComparador,
} from "@/lib/contratos/gastos-modelo";
import {
  aprobarCotizacionAction,
  cambiarEstadoDeCotizacionAction,
  eliminarCotizacionAction,
} from "@/app/(protegido)/contratos/[contrato]/acciones-gastos";
import { mensajeDeError } from "@/lib/contratos/errores-cliente";
import { usePuede } from "./PermisosDelUsuario";

export interface FilaDeCotizacionParaMostrar {
  fila: FilaDelComparador;
  archivos: ArchivoParaMostrar[];
  errorDeLectura: string | null;
}

const COLOR_DE_ESTADO: Record<EstadoDeCotizacion, string> = {
  solicitada: "bg-amber-50 text-amber-700",
  recibida: "bg-cian-lavado text-azul",
  aprobada: "bg-emerald-50 text-emerald-700",
  descartada: "bg-borde text-gris",
};

const FECHA = new Intl.DateTimeFormat("es-CL", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const fechaCorta = (f: string | null) => (f ? FECHA.format(new Date(`${f}T00:00:00Z`)) : "—");

/** Aprobada primero; después las recibidas de la más barata a la más cara; luego lo que falta; al final lo descartado. */
function ordenar(filas: FilaDeCotizacionParaMostrar[]): FilaDeCotizacionParaMostrar[] {
  const peso = (e: EstadoDeCotizacion) => ({ aprobada: 0, recibida: 1, solicitada: 2, descartada: 3 })[e];
  return [...filas].sort((a, b) => {
    const ca = a.fila.cotizacion;
    const cb = b.fila.cotizacion;
    if (peso(ca.estado) !== peso(cb.estado)) return peso(ca.estado) - peso(cb.estado);
    return (ca.totalClp ?? Infinity) - (cb.totalClp ?? Infinity);
  });
}

/**
 * Las cotizaciones de una línea de Gastos: compararlas, aprobar una y guardar sus archivos.
 *
 * Lo que decide quien aprueba está a la vista en cada tarjeta: el total, cuánto más cara es que la
 * más barata, si la entrega llega a tiempo, si el precio sigue vigente y lo que falta confirmar con
 * el proveedor antes de emitir la orden de compra.
 */
export default function CotizacionesDeLaLinea({
  partidaId,
  cantidadDeLaLinea,
  filas,
  analisis,
  puedeAprobar,
  conectado,
  tiposDeCambio,
  hermanas,
  lineaConOrdenDeCompra,
}: {
  partidaId: string;
  cantidadDeLaLinea: number;
  filas: FilaDeCotizacionParaMostrar[];
  analisis: Pick<AnalisisDeCotizaciones, "ahorro" | "hayQueComparar">;
  puedeAprobar: boolean;
  conectado: boolean;
  tiposDeCambio: { UF?: number; USD?: number };
  /** Las cotizaciones de la línea tal cual, para decidir si aprobar pide un motivo. */
  hermanas: Cotizacion[];
  lineaConOrdenDeCompra: boolean;
}) {
  const [formulario, setFormulario] = useState<{ cotizacion?: Cotizacion } | null>(null);
  const [aprobando, setAprobando] = useState<FilaDelComparador | null>(null);
  const [descartando, setDescartando] = useState<Cotizacion | null>(null);
  const ordenadas = ordenar(filas);

  const masBarata = filas.find((f) => f.fila.esLaMasBarata)?.fila.cotizacion ?? null;

  return (
    <section aria-labelledby="cotizaciones-titulo" className="mt-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="cotizaciones-titulo" className="titular text-lg text-azul">
            Cotizaciones
          </h2>
          <p className="text-xs text-gris">
            Precios neto, en pesos. Se aprueba una por línea; las demás quedan como respaldo de la decisión.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setFormulario({})}
          className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-azul px-4 py-2 text-xs font-bold uppercase tracking-wide text-white transition hover:bg-azul-suave"
        >
          <IconPlus size={16} />
          Agregar cotización
        </button>
      </div>

      {analisis.hayQueComparar && (
        <p className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg bg-fondo/70 px-3 py-2 text-xs text-gris">
          {masBarata && (
            <span className="inline-flex items-center gap-1.5">
              <IconTrophy size={14} className="text-amber-500" />
              Más barata: <b className="text-tinta">{masBarata.proveedor}</b> {formatearPesos(masBarata.totalClp)}
            </span>
          )}
          {analisis.ahorro && (
            <span className="inline-flex items-center gap-1.5 font-semibold text-emerald-700">
              <IconCheck size={14} />
              Ahorro frente a la más cara: {formatearPesos(analisis.ahorro.monto)} ({analisis.ahorro.pct}%)
            </span>
          )}
        </p>
      )}

      {ordenadas.length === 0 ? (
        <p className="mt-3 rounded-xl border border-dashed border-borde bg-superficie/60 p-6 text-center text-xs text-gris">
          Todavía no hay cotizaciones. Agrega la primera aunque aún no llegue el precio: queda como «solicitada»
          y el core te avisa si se pasa la fecha en que la esperabas.
        </p>
      ) : (
        <ul className="mt-3 space-y-3">
          {ordenadas.map((f) => (
            <TarjetaDeCotizacion
              key={f.fila.cotizacion.id}
              datos={f}
              puedeAprobar={puedeAprobar}
              conectado={conectado}
              lineaConOrdenDeCompra={lineaConOrdenDeCompra}
              alEditar={() => setFormulario({ cotizacion: f.fila.cotizacion })}
              alAprobar={() => setAprobando(f.fila)}
              alDescartar={() => setDescartando(f.fila.cotizacion)}
            />
          ))}
        </ul>
      )}

      <VentanaModal
        abierta={formulario !== null}
        alCerrar={() => setFormulario(null)}
        titulo={formulario?.cotizacion ? "Editar cotización" : "Agregar cotización"}
        descripcion="Neto, sin IVA"
      >
        {formulario && (
          <FormularioDeCotizacion
            partidaId={partidaId}
            cotizacion={formulario.cotizacion}
            cantidadDeLaLinea={cantidadDeLaLinea}
            tiposDeCambio={tiposDeCambio}
            alTerminar={() => setFormulario(null)}
          />
        )}
      </VentanaModal>

      <VentanaModal
        abierta={aprobando !== null}
        alCerrar={() => setAprobando(null)}
        titulo="Aprobar cotización"
        descripcion={aprobando?.cotizacion.proveedor}
        ancho="max-w-md"
      >
        {aprobando && <FormularioDeAprobacion fila={aprobando} hermanas={hermanas} alTerminar={() => setAprobando(null)} />}
      </VentanaModal>

      <VentanaModal
        abierta={descartando !== null}
        alCerrar={() => setDescartando(null)}
        titulo="Descartar cotización"
        descripcion={descartando?.proveedor}
        ancho="max-w-md"
      >
        {descartando && <FormularioDeDescarte cotizacion={descartando} alTerminar={() => setDescartando(null)} />}
      </VentanaModal>
    </section>
  );
}

function Insignia({
  tono,
  children,
}: {
  tono: "ok" | "aviso" | "critico" | "neutro";
  children: React.ReactNode;
}) {
  const clases = {
    ok: "bg-emerald-50 text-emerald-700",
    aviso: "bg-amber-50 text-amber-700",
    critico: "bg-red-50 text-red-700",
    neutro: "bg-borde text-gris",
  }[tono];
  return (
    <span className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${clases}`}>
      {children}
    </span>
  );
}

function TarjetaDeCotizacion({
  datos,
  puedeAprobar,
  conectado,
  lineaConOrdenDeCompra,
  alEditar,
  alAprobar,
  alDescartar,
}: {
  datos: FilaDeCotizacionParaMostrar;
  puedeAprobar: boolean;
  conectado: boolean;
  lineaConOrdenDeCompra: boolean;
  alEditar: () => void;
  alAprobar: () => void;
  alDescartar: () => void;
}) {
  const router = useRouter();
  const { fila, archivos, errorDeLectura } = datos;
  const c = fila.cotizacion;
  const [pendiente, iniciar] = useTransition();
  const [error, setError] = useState<string | null>(null);
  // Registrar un precio, editar, descartar, reabrir o eliminar es cambiar lo existente: editar.
  // Agregar cotizaciones y subir archivos lo puede hacer cualquiera con el módulo.
  const puedeEditar = usePuede("editar");

  function ejecutar(accion: () => Promise<{ error?: string }>) {
    setError(null);
    iniciar(async () => {
      try {
        const r = await accion();
        if (r.error) setError(r.error);
        else router.refresh();
      } catch (e) {
        setError(mensajeDeError(e, "No se pudo hacer el cambio."));
      }
    });
  }

  const unitario =
    c.precioUnitario === null
      ? null
      : c.moneda === "CLP"
        ? `${c.cantidad} × ${formatearPesos(c.precioUnitario)}`
        : `${c.cantidad} × ${formatearMoneda(c.precioUnitario, c.moneda)} (TC ${formatearPesos(c.tipoCambio).replace("$", "$ ")})`;

  const descartada = c.estado === "descartada";

  return (
    <li className={`${TARJETA} p-4 ${descartada ? "opacity-70" : ""} ${c.estado === "aprobada" ? "ring-2 ring-emerald-300" : ""}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-bold text-tinta">{c.proveedor}</h3>
            <span className={`rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${COLOR_DE_ESTADO[c.estado]}`}>
              {ETIQUETAS_DE_COTIZACION[c.estado]}
            </span>
            {fila.esLaMasBarata && (
              <Insignia tono="ok">
                <IconTrophy size={11} />
                Más barata
              </Insignia>
            )}
            {fila.masCaraPct !== null && fila.masCaraPct > 0 && <Insignia tono="aviso">+{fila.masCaraPct}% sobre la más barata</Insignia>}
            {fila.llegaATiempo === false && (
              <Insignia tono="critico">
                <IconAlertTriangle size={11} />
                No llega a tiempo
              </Insignia>
            )}
            {fila.vigencia === "vencida" && <Insignia tono="critico">Precio vencido</Insignia>}
            {fila.vigencia === "por_vencer" && <Insignia tono="aviso">Precio por vencer</Insignia>}
            {fila.respuestaAtrasada && (
              <Insignia tono="aviso">
                <IconClockHour4 size={11} />
                Respuesta atrasada
              </Insignia>
            )}
          </div>
          {c.descripcion && <p className="mt-0.5 text-sm text-gris">{c.descripcion}</p>}
        </div>

        <div className="text-right">
          <p className="text-xl font-extrabold tabular-nums text-tinta">
            {c.totalClp === null ? "Sin precio" : formatearPesos(c.totalClp)}
          </p>
          {unitario && <p className="text-[11px] text-gris-suave">{unitario}</p>}
        </div>
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-xs sm:grid-cols-4">
        <Dato
          etiqueta="Entrega"
          valor={c.plazoEntregaDias === null ? "—" : `${c.plazoEntregaDias} ${c.plazoEntregaDias === 1 ? "día" : "días"}`}
          ayuda={
            fila.holgura === null
              ? undefined
              : fila.llegaATiempo
                ? `llega con ${fila.holgura} d de holgura`
                : `llega ${-fila.holgura} d tarde`
          }
          alerta={fila.llegaATiempo === false}
        />
        <Dato etiqueta="Garantía" valor={c.garantia ?? "—"} />
        <Dato etiqueta="Pago" valor={c.condicionesPago ?? "—"} />
        <Dato
          etiqueta={c.estado === "solicitada" ? "Respuesta esperada" : "Precio vigente hasta"}
          valor={fechaCorta(c.estado === "solicitada" ? c.respuestaEsperada : c.vigenciaHasta)}
          alerta={fila.respuestaAtrasada || fila.vigencia === "vencida"}
        />
      </dl>

      {c.porConfirmar && (
        <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50/60 px-3 py-2">
          <p className="text-[10px] font-bold uppercase tracking-wide text-amber-700">Por confirmar antes de la OC</p>
          <p className="mt-0.5 whitespace-pre-line text-xs text-amber-900">{c.porConfirmar}</p>
        </div>
      )}
      {c.notas && <p className="mt-2 whitespace-pre-line text-xs text-gris">{c.notas}</p>}

      {c.motivoDecision && (
        <p className="mt-2 rounded-lg bg-fondo/70 px-3 py-2 text-xs text-gris">
          <b className="text-tinta">{c.estado === "aprobada" ? "Por qué se aprobó:" : "Motivo:"}</b> {c.motivoDecision}
        </p>
      )}
      {c.estado === "aprobada" && c.aprobadoPorNombre && (
        <p className="mt-1.5 text-[11px] text-emerald-700">
          Aprobada por {c.aprobadoPorNombre}
          {c.aprobadoEn ? ` el ${FECHA.format(new Date(c.aprobadoEn))}` : ""}.
        </p>
      )}

      <ArchivosDeCotizacion
        cotizacionId={c.id}
        archivos={archivos}
        carpetaUrl={c.carpetaUrl}
        errorDeLectura={errorDeLectura}
        conectado={conectado}
      />

      {error && (
        <p role="alert" className="mt-2 text-xs font-semibold text-red-600">
          {error}
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-borde pt-3">
        {pendiente && <RuedaCarga className="h-4 w-4" />}

        {c.estado === "recibida" && puedeAprobar && (
          <BotonDeCotizacion principal onClick={alAprobar} disabled={pendiente || lineaConOrdenDeCompra} titulo={lineaConOrdenDeCompra ? "La línea ya tiene orden de compra" : undefined}>
            <IconCheck size={14} />
            Aprobar
          </BotonDeCotizacion>
        )}
        {c.estado === "solicitada" && puedeEditar && (
          <BotonDeCotizacion
            onClick={() => (c.totalClp === null ? alEditar() : ejecutar(() => cambiarEstadoDeCotizacionAction(c.id, "recibida")))}
            disabled={pendiente}
          >
            Registrar precio recibido
          </BotonDeCotizacion>
        )}
        {c.estado === "aprobada" && puedeAprobar && (
          <BotonDeCotizacion
            onClick={() => ejecutar(() => cambiarEstadoDeCotizacionAction(c.id, "recibida"))}
            disabled={pendiente || lineaConOrdenDeCompra}
            titulo={lineaConOrdenDeCompra ? "La línea ya tiene orden de compra" : undefined}
          >
            Quitar aprobación
          </BotonDeCotizacion>
        )}
        {c.estado !== "aprobada" && !descartada && puedeEditar && (
          <BotonDeCotizacion onClick={alDescartar} disabled={pendiente}>
            Descartar
          </BotonDeCotizacion>
        )}
        {descartada && puedeEditar && (
          <BotonDeCotizacion
            onClick={() => ejecutar(() => cambiarEstadoDeCotizacionAction(c.id, c.totalClp === null ? "solicitada" : "recibida"))}
            disabled={pendiente}
          >
            Reabrir
          </BotonDeCotizacion>
        )}
        {c.estado !== "aprobada" && puedeEditar && (
          <BotonDeCotizacion onClick={alEditar} disabled={pendiente}>
            Editar
          </BotonDeCotizacion>
        )}
        {c.estado !== "aprobada" && puedeEditar && (
          <button
            type="button"
            disabled={pendiente}
            onClick={() => {
              if (!window.confirm(`¿Eliminar la cotización de ${c.proveedor}?\n\nSi tiene archivos, van a la papelera de SharePoint.`)) return;
              ejecutar(() => eliminarCotizacionAction(c.id));
            }}
            className="ml-auto inline-flex min-h-10 items-center text-[11px] font-bold uppercase tracking-wide text-red-600/80 transition hover:text-red-600 disabled:opacity-60"
          >
            Eliminar
          </button>
        )}
      </div>
    </li>
  );
}

function BotonDeCotizacion({
  children,
  onClick,
  disabled,
  principal = false,
  titulo,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  principal?: boolean;
  titulo?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={titulo}
      className={`inline-flex min-h-10 items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide transition disabled:cursor-not-allowed disabled:opacity-50 ${
        principal ? "bg-emerald-600 text-white hover:bg-emerald-700" : "border border-borde text-azul hover:border-cian"
      }`}
    >
      {children}
    </button>
  );
}

function Dato({
  etiqueta,
  valor,
  ayuda,
  alerta = false,
}: {
  etiqueta: string;
  valor: string;
  ayuda?: string;
  alerta?: boolean;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] font-bold uppercase tracking-wide text-gris-suave">{etiqueta}</dt>
      <dd className={`break-words font-semibold ${alerta ? "text-red-600" : "text-tinta"}`}>{valor}</dd>
      {ayuda && <dd className={`text-[11px] ${alerta ? "text-red-600" : "text-gris-suave"}`}>{ayuda}</dd>}
    </div>
  );
}

function FormularioDeAprobacion({
  fila,
  hermanas,
  alTerminar,
}: {
  fila: FilaDelComparador;
  hermanas: Cotizacion[];
  alTerminar: () => void;
}) {
  const router = useRouter();
  const c = fila.cotizacion;
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();

  // El servidor es quien exige el motivo; esto solo avisa antes de ir, para que no sea una sorpresa.
  const pideMotivo = fila.vigencia === "vencida" || aprobacionPideMotivo(c, hermanas);
  const razon =
    fila.vigencia === "vencida"
      ? "La vigencia de este precio ya pasó: explica por qué se aprueba igual."
      : "No hay otra cotización con la que comparar y el monto es alto: explica por qué se aprueba esta.";

  function aprobar() {
    setError(null);
    iniciar(async () => {
      try {
        const r = await aprobarCotizacionAction(c.id, motivo.trim() || null);
        if (r.error) setError(r.error);
        else {
          alTerminar();
          router.refresh();
        }
      } catch (e) {
        setError(mensajeDeError(e, "No se pudo aprobar."));
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg bg-cian-lavado/60 px-3 py-2.5">
        <p className="text-[11px] font-bold uppercase tracking-wide text-gris">Se compromete</p>
        <p className="text-xl font-extrabold tabular-nums text-azul">{formatearPesos(c.totalClp)}</p>
        <p className="text-[11px] text-gris">
          {fila.esLaMasBarata ? "Es la más barata." : fila.masCaraPct ? `Es ${fila.masCaraPct}% más cara que la más barata.` : ""}
          {fila.llegaATiempo === false ? " OJO: no llega a tiempo." : ""}
        </p>
      </div>

      <label className="block">
        <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-gris">
          Por qué esta {pideMotivo ? "" : <span className="font-normal normal-case text-gris-suave">(opcional)</span>}
        </span>
        <textarea
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          rows={3}
          maxLength={300}
          placeholder="Ej.: 39% más barata, técnicamente superior y llega a tiempo"
          className={`${CAMPO} resize-y`}
        />
        {pideMotivo && <span className="mt-1 block text-[11px] font-semibold text-amber-700">{razon}</span>}
      </label>

      <p className="text-[11px] text-gris">
        Si hay otra aprobada en esta línea, vuelve a «recibida». Queda registrado quién aprobó y cuándo.
      </p>

      {error && (
        <p role="alert" className="text-xs font-semibold text-red-600">
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3 border-t border-borde pt-4">
        <button
          type="button"
          onClick={aprobar}
          disabled={pendiente || (pideMotivo && motivo.trim() === "")}
          className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-xs font-bold uppercase tracking-wide text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pendiente ? <RuedaCarga /> : <IconCheck size={14} />}
          Aprobar cotización
        </button>
        <button
          type="button"
          onClick={alTerminar}
          className="min-h-11 px-2 text-xs font-bold uppercase tracking-wide text-gris transition hover:text-azul"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}

function FormularioDeDescarte({ cotizacion, alTerminar }: { cotizacion: Cotizacion; alTerminar: () => void }) {
  const router = useRouter();
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();

  function descartar() {
    setError(null);
    iniciar(async () => {
      try {
        const r = await cambiarEstadoDeCotizacionAction(cotizacion.id, "descartada", motivo.trim() || null);
        if (r.error) setError(r.error);
        else {
          alTerminar();
          router.refresh();
        }
      } catch (e) {
        setError(mensajeDeError(e, "No se pudo descartar."));
      }
    });
  }

  return (
    <div className="space-y-4">
      <label className="block">
        <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-gris">
          Motivo <span className="font-normal normal-case text-gris-suave">(opcional, pero queda de respaldo)</span>
        </span>
        <textarea
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          rows={3}
          maxLength={300}
          placeholder="Ej.: sin stock en Chile, entrega 35-45 días"
          className={`${CAMPO} resize-y`}
        />
      </label>
      {error && (
        <p role="alert" className="text-xs font-semibold text-red-600">
          {error}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-3 border-t border-borde pt-4">
        <button
          type="button"
          onClick={descartar}
          disabled={pendiente}
          className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-azul px-4 py-2.5 text-xs font-bold uppercase tracking-wide text-white transition hover:bg-azul-suave disabled:opacity-60"
        >
          {pendiente && <RuedaCarga />}
          Descartar
        </button>
        <button
          type="button"
          onClick={alTerminar}
          className="min-h-11 px-2 text-xs font-bold uppercase tracking-wide text-gris transition hover:text-azul"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}

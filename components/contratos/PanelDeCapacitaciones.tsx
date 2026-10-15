"use client";

import { useId, useRef, useState, useTransition } from "react";
import { IconCalendarPlus, IconPencil, IconTrash, IconX } from "@tabler/icons-react";
import BotonGuardar from "./BotonGuardar";
import MensajeDeForm from "./MensajeDeForm";
import { useFormulario } from "./useFormulario";
import { InsigniaDeResultado, InsigniaDeSituacion, InsigniaDeTipo } from "./InsigniasDeCapacitacion";
import DocumentoYFacturaDeCurso, {
  type ArchivoDeFactura,
  type DocumentoDelCurso,
  type TipoParaElegir,
} from "./DocumentoYFacturaDeCurso";
import { usePuede } from "./PermisosDelUsuario";
import { CAMPO_COMPACTO } from "@/lib/contratos/estilos";
import {
  CURSOS_SUGERIDOS,
  ETIQUETAS_ESTADO_CURSO,
  ETIQUETAS_RESULTADO,
  ETIQUETAS_TIPO_CAPACITACION,
  EXAMENES_SUGERIDOS,
  TIPOS_DE_CAPACITACION,
  fechaCorta,
  type CursoPersona,
  type EstadoCurso,
  type EstadoForm,
  type ResultadoDeCurso,
  type TipoDeCapacitacion,
} from "@/lib/contratos/acreditacion-modelo";
import {
  detalleDeCapacitacion,
  horaCorta,
  situacionDe,
  ordenarEnCurso,
  resumenDeFicha,
  type FacturaDeCurso,
} from "@/lib/contratos/capacitaciones-modelo";
import { formatearPesos } from "@/lib/contratos/arranque-modelo";
import {
  actualizarCursoAction,
  cambiarEstadoCursoAction,
  eliminarCursoAction,
} from "@/app/(protegido)/contratos/[contrato]/acreditacion/acciones";
import { mensajeDeError } from "@/lib/contratos/errores-cliente";

const ETIQUETA = "mb-0.5 block text-[10px] font-bold uppercase tracking-wide text-gris";
const BOTON_DE_FILA =
  "inline-flex min-h-8 pointer-coarse:min-h-11 items-center gap-1 rounded-md border border-borde px-2 text-[10px] font-bold uppercase tracking-wide text-gris transition hover:border-cian hover:text-azul disabled:opacity-60";

type Accion = (previo: EstadoForm, form: FormData) => Promise<EstadoForm>;

/**
 * Los campos de un curso o un examen. Los mismos para agregar y para corregir: un solo lugar donde
 * vive la regla de qué se pide y cuándo (el resultado solo si ya se realizó).
 */
function FormularioDeCapacitacion({
  inicial,
  accion,
  textoBoton,
  cargando,
  alTerminar,
  alCancelar,
}: {
  inicial?: CursoPersona;
  accion: Accion;
  textoBoton: string;
  cargando: string;
  /** Qué hacer cuando salió bien (vaciar el formulario, o cerrar la edición). */
  alTerminar?: () => void;
  alCancelar?: () => void;
}) {
  const formulario = useRef<HTMLFormElement>(null);
  const idLista = useId();
  const [tipo, setTipo] = useState<TipoDeCapacitacion>(inicial?.tipo ?? "examen");
  const [estadoActual, setEstadoActual] = useState<EstadoCurso>(inicial?.estado ?? "reservado");

  const { estado, enviar, pendiente } = useFormulario(async (previo, datos) => {
    const resultado = await accion(previo, datos);
    if (resultado.ok) {
      // Vaciar solo si salió bien: si falló, lo escrito se queda para corregirlo.
      if (!inicial) {
        formulario.current?.reset();
        setEstadoActual("reservado");
      }
      alTerminar?.();
    }
    return resultado;
  });

  const sugeridos = tipo === "examen" ? EXAMENES_SUGERIDOS : CURSOS_SUGERIDOS;

  return (
    <form
      ref={formulario}
      onSubmit={enviar}
      className="grid grid-cols-1 gap-x-3 gap-y-2.5 sm:grid-cols-6"
    >
      <fieldset className="sm:col-span-6">
        <legend className={ETIQUETA}>¿Qué es?</legend>
        <div className="inline-flex gap-1 rounded-lg border border-borde p-0.5">
          {TIPOS_DE_CAPACITACION.map((t) => (
            <label
              key={t}
              className={`flex min-h-9 pointer-coarse:min-h-11 cursor-pointer items-center rounded-md px-4 text-[11px] font-bold uppercase tracking-wide transition has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-cian ${
                tipo === t ? "bg-cian-lavado text-azul" : "text-gris hover:text-azul"
              }`}
            >
              <input
                type="radio"
                name="tipo"
                value={t}
                checked={tipo === t}
                onChange={() => setTipo(t)}
                className="sr-only"
              />
              {ETIQUETAS_TIPO_CAPACITACION[t]}
            </label>
          ))}
        </div>
      </fieldset>

      <label className="sm:col-span-4">
        <span className={ETIQUETA}>{tipo === "examen" ? "Examen" : "Curso"}</span>
        <input
          name="curso"
          required
          list={idLista}
          maxLength={80}
          defaultValue={inicial?.curso ?? ""}
          className={CAMPO_COMPACTO}
        />
        <datalist id={idLista}>
          {sugeridos.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
      </label>

      <label className="sm:col-span-2">
        <span className={ETIQUETA}>Estado</span>
        <select
          name="estado"
          value={estadoActual}
          onChange={(e) => setEstadoActual(e.target.value as EstadoCurso)}
          className={CAMPO_COMPACTO}
        >
          {(Object.keys(ETIQUETAS_ESTADO_CURSO) as EstadoCurso[]).map((e) => (
            <option key={e} value={e}>
              {ETIQUETAS_ESTADO_CURSO[e]}
            </option>
          ))}
        </select>
      </label>

      <label className="sm:col-span-3">
        <span className={ETIQUETA}>Fecha</span>
        <input name="fecha" type="date" defaultValue={inicial?.fecha ?? ""} className={CAMPO_COMPACTO} />
      </label>
      <label className="sm:col-span-3">
        <span className={ETIQUETA}>Hora</span>
        <input name="hora" type="time" defaultValue={horaCorta(inicial?.hora) ?? ""} className={CAMPO_COMPACTO} />
      </label>
      <label className="sm:col-span-6">
        <span className={ETIQUETA}>Lugar o proveedor</span>
        <input
          name="lugar"
          maxLength={80}
          defaultValue={inicial?.lugar ?? ""}
          placeholder="Clínica, centro o empresa"
          className={CAMPO_COMPACTO}
        />
      </label>

      {estadoActual === "realizado" && (
        <label className="sm:col-span-2">
          <span className={ETIQUETA}>Resultado</span>
          <select name="resultado" defaultValue={inicial?.resultado ?? ""} className={CAMPO_COMPACTO}>
            <option value="">Sin resultado todavía</option>
            {(Object.keys(ETIQUETAS_RESULTADO) as ResultadoDeCurso[]).map((r) => (
              <option key={r} value={r}>
                {ETIQUETAS_RESULTADO[r]}
              </option>
            ))}
          </select>
        </label>
      )}

      <label className={estadoActual === "realizado" ? "sm:col-span-4" : "sm:col-span-6"}>
        <span className={ETIQUETA}>Nota</span>
        <input
          name="nota"
          maxLength={300}
          defaultValue={inicial?.nota ?? ""}
          placeholder="Opcional: folio, indicaciones, observaciones"
          className={CAMPO_COMPACTO}
        />
      </label>

      <div className="flex flex-wrap items-center gap-3 sm:col-span-6">
        <BotonGuardar pendiente={pendiente} cargando={cargando}>
          {textoBoton}
        </BotonGuardar>
        {alCancelar && (
          <button
            type="button"
            onClick={alCancelar}
            className="min-h-11 rounded-lg border border-borde px-4 text-xs font-bold uppercase tracking-wide text-gris transition hover:border-cian hover:text-azul"
          >
            Cancelar
          </button>
        )}
        <MensajeDeForm estado={estado} />
      </div>
    </form>
  );
}

/** Lo que la ficha le pasa al panel para dibujar el documento y la factura de cada fila. */
export interface ContextoDeArchivos {
  tipos: TipoParaElegir[];
  /** Por id de curso. */
  documentos: Record<string, DocumentoDelCurso>;
  /** Por id de la línea de Gastos. */
  facturas: Record<string, FacturaDeCurso>;
  archivosDeFactura: Record<string, ArchivoDeFactura[]>;
  errorDeArchivos: boolean;
  /** Si quien mira ya conectó su cuenta con SharePoint: sin eso no se sube nada. */
  conectado: boolean;
  /** Tiene Gastos de arranque asignado y su rol permite crear ahí. */
  puedeFacturar: boolean;
  puedeVerGastos: boolean;
}

function FilaDeCapacitacion({
  personaId,
  c,
  hoy,
  puedeEditar,
  ocupado,
  ejecutar,
  contexto,
}: {
  personaId: string;
  c: CursoPersona;
  hoy: string;
  puedeEditar: boolean;
  ocupado: boolean;
  ejecutar: (tarea: () => Promise<EstadoForm | void>) => void;
  contexto: ContextoDeArchivos;
}) {
  const [editando, setEditando] = useState(false);
  const [eliminando, setEliminando] = useState(false);
  const [quitarGasto, setQuitarGasto] = useState(true);
  const factura = c.partidaGastoId ? (contexto.facturas[c.partidaGastoId] ?? null) : null;
  const situacion = situacionDe(c, hoy);
  const detalle = detalleDeCapacitacion(c, fechaCorta);

  if (editando) {
    return (
      <li className="bg-cian-lavado/30 px-3 py-3">
        <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-azul">
          Editar {c.tipo === "examen" ? "examen" : "curso"}
        </p>
        <FormularioDeCapacitacion
          inicial={c}
          accion={actualizarCursoAction.bind(null, personaId, c.id)}
          textoBoton="Guardar cambios"
          cargando="Guardando..."
          alTerminar={() => setEditando(false)}
          alCancelar={() => setEditando(false)}
        />
      </li>
    );
  }

  const cambiar = (estado: EstadoCurso, resultado: ResultadoDeCurso | null = null) =>
    ejecutar(() => cambiarEstadoCursoAction(personaId, c.id, estado, resultado));

  return (
    <li className="bg-superficie px-3 py-2.5">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <InsigniaDeTipo tipo={c.tipo} />
            <p
              className={`text-sm font-semibold leading-tight ${
                c.estado === "cancelado" ? "text-gris-suave line-through" : "text-tinta"
              }`}
            >
              {c.curso}
            </p>
          </div>
          <p className="mt-1 text-[11px] leading-tight text-gris">{detalle || "Sin fecha"}</p>
          {c.nota && <p className="mt-0.5 text-[11px] italic leading-snug text-gris-suave">{c.nota}</p>}
        </div>

        <div className="shrink-0">
          {c.estado === "realizado" ? (
            <InsigniaDeResultado resultado={c.resultado} />
          ) : (
            <InsigniaDeSituacion situacion={situacion} />
          )}
        </div>
      </div>

      <DocumentoYFacturaDeCurso
        personaId={personaId}
        curso={c}
        tipos={contexto.tipos}
        documento={contexto.documentos[c.id] ?? null}
        factura={factura}
        archivosDeFactura={factura ? (contexto.archivosDeFactura[factura.partidaId] ?? []) : []}
        errorDeArchivos={contexto.errorDeArchivos}
        conectado={contexto.conectado}
        puedeFacturar={contexto.puedeFacturar}
        puedeEditar={puedeEditar}
        puedeVerGastos={contexto.puedeVerGastos}
        hoy={hoy}
      />

      {puedeEditar && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {c.estado === "reservado" && (
            <button type="button" disabled={ocupado} onClick={() => cambiar("realizado")} className={BOTON_DE_FILA}>
              Marcar realizado
            </button>
          )}

          {c.estado === "realizado" &&
            (Object.keys(ETIQUETAS_RESULTADO) as ResultadoDeCurso[]).map((r) => (
              <button
                key={r}
                type="button"
                disabled={ocupado}
                aria-pressed={c.resultado === r}
                // Volver a tocar el resultado puesto lo quita: así un error de dedo se corrige.
                onClick={() => cambiar("realizado", c.resultado === r ? null : r)}
                className={`${BOTON_DE_FILA} ${
                  c.resultado === r
                    ? r === "aprobado"
                      ? "!border-emerald-300 !bg-emerald-50 !text-emerald-700"
                      : "!border-red-300 !bg-red-50 !text-red-700"
                    : ""
                }`}
              >
                {ETIQUETAS_RESULTADO[r]}
              </button>
            ))}

          {c.estado === "reservado" && (
            <button type="button" disabled={ocupado} onClick={() => cambiar("cancelado")} className={BOTON_DE_FILA}>
              <IconX size={12} aria-hidden />
              Cancelar reserva
            </button>
          )}
          {c.estado !== "reservado" && (
            <button type="button" disabled={ocupado} onClick={() => cambiar("reservado")} className={BOTON_DE_FILA}>
              {c.estado === "cancelado" ? "Reactivar reserva" : "Volver a reservado"}
            </button>
          )}

          <span className="ml-auto flex gap-1">
            <button
              type="button"
              disabled={ocupado}
              onClick={() => setEditando(true)}
              aria-label={`Editar ${c.curso}`}
              className={BOTON_DE_FILA}
            >
              <IconPencil size={13} aria-hidden />
              Editar
            </button>
            <button
              type="button"
              disabled={ocupado}
              aria-label={`Eliminar ${c.curso}`}
              onClick={() => setEliminando((v) => !v)}
              aria-expanded={eliminando}
              className={`${BOTON_DE_FILA} hover:!border-red-300 hover:!text-red-600`}
            >
              <IconTrash size={13} aria-hidden />
              Eliminar
            </button>
          </span>
        </div>
      )}

      {puedeEditar && eliminando && (
        <div role="alertdialog" aria-label="Confirmar eliminación" className="mt-2 rounded-lg border border-red-200 bg-red-50 p-3">
          <p className="text-sm font-semibold text-red-700">
            ¿Eliminar {c.tipo === "examen" ? "este examen" : "este curso"} «{c.curso}»?
          </p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs text-red-700/90">
            <li>Se quita la reserva de la ficha, de la tarjeta «Cursos y exámenes» de la nómina y de los resúmenes.</li>
            {contexto.documentos[c.id] && (
              <li>El documento que se subió se queda en la pestaña Documentos (es un papel de la persona).</li>
            )}
          </ul>
          {factura && (
            <label className="mt-2 flex items-start gap-2 text-xs text-red-800">
              <input
                type="checkbox"
                checked={quitarGasto}
                onChange={(e) => setQuitarGasto(e.target.checked)}
                disabled={!contexto.puedeFacturar}
                className="mt-0.5 h-4 w-4"
              />
              <span>
                También eliminar el gasto de la factura en Gastos de arranque
                {factura.monto !== null && <> ({formatearPesos(factura.monto)} neto)</>}.{" "}
                <span className="text-red-700/80">
                  Si lo dejas, el gasto sigue en Gastos sin estar asociado a nadie.
                  {!contexto.puedeFacturar && " Necesitas acceso a Gastos de arranque para quitarlo."}
                </span>
              </span>
            </label>
          )}
          <div className="mt-2.5 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={ocupado}
              onClick={() => ejecutar(() => eliminarCursoAction(personaId, c.id, Boolean(factura) && quitarGasto && contexto.puedeFacturar))}
              className="inline-flex min-h-9 pointer-coarse:min-h-11 items-center gap-1.5 rounded-lg bg-red-600 px-3 text-[11px] font-bold uppercase tracking-wide text-white transition hover:bg-red-700 disabled:opacity-60"
            >
              <IconTrash size={14} aria-hidden />
              Sí, eliminar
            </button>
            <button
              type="button"
              onClick={() => setEliminando(false)}
              className="min-h-9 pointer-coarse:min-h-11 rounded-lg border border-borde bg-superficie px-3 text-[11px] font-bold uppercase tracking-wide text-gris transition hover:border-cian hover:text-azul"
            >
              No, conservar
            </button>
          </div>
          <p className="mt-2 text-[11px] text-red-700/80">
            Si solo se canceló, es mejor «Cancelar reserva»: queda en el historial de la persona.
          </p>
        </div>
      )}
    </li>
  );
}

/**
 * Las reservas de cursos y exámenes de una persona (Franke, PLL, POX, preocupacional, altura…):
 * lo que está en curso arriba, con cuánto falta o cuánto se atrasó, y lo ya hecho debajo con su
 * resultado.
 *
 * Agregar es de todos los roles; marcar realizado, anotar el resultado, corregir o quitar es
 * editar (el servidor lo comprueba otra vez en cada acción: esto solo esconde los botones).
 */
export default function PanelDeCapacitaciones({
  personaId,
  cursos,
  hoy,
  agregar,
  contexto,
}: {
  personaId: string;
  cursos: CursoPersona[];
  hoy: string;
  agregar: Accion;
  contexto: ContextoDeArchivos;
}) {
  const puedeEditar = usePuede("editar");
  const [agregando, setAgregando] = useState(false);
  const [ocupado, iniciar] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function ejecutar(tarea: () => Promise<EstadoForm | void>) {
    setError(null);
    iniciar(async () => {
      try {
        const resultado = await tarea();
        // Las acciones devuelven su error en vez de lanzarlo (en producción Next lo esconde).
        if (resultado && resultado.error) setError(resultado.error);
      } catch (e) {
        setError(mensajeDeError(e, "No se pudo guardar."));
      }
    });
  }

  const enCurso = ordenarEnCurso(cursos.filter((c) => c.estado === "reservado"));
  // Lo hecho o caído, lo más reciente primero.
  const historial = cursos
    .filter((c) => c.estado !== "reservado")
    .sort((a, b) => (b.fecha ?? "").localeCompare(a.fecha ?? ""));
  const resumen = resumenDeFicha(cursos, hoy);

  const lista = (titulo: string, items: CursoPersona[]) => (
    <section aria-label={titulo}>
      <h3 className="mb-1.5 text-[10px] font-bold uppercase tracking-wide text-gris">
        {titulo} <span className="font-semibold text-gris-suave">· {items.length}</span>
      </h3>
      <ul className="divide-y divide-borde overflow-hidden rounded-lg border border-borde">
        {items.map((c) => (
          <FilaDeCapacitacion
            key={c.id}
            personaId={personaId}
            c={c}
            hoy={hoy}
            puedeEditar={puedeEditar}
            ocupado={ocupado}
            ejecutar={ejecutar}
            contexto={contexto}
          />
        ))}
      </ul>
    </section>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-gris">
          {cursos.length === 0 ? "Sin cursos ni exámenes anotados." : resumen.texto}
        </p>
        <button
          type="button"
          onClick={() => setAgregando((v) => !v)}
          aria-expanded={agregando}
          className="inline-flex min-h-9 pointer-coarse:min-h-11 items-center gap-1.5 rounded-lg border border-borde px-3 text-[11px] font-bold uppercase tracking-wide text-azul transition hover:border-cian"
        >
          <IconCalendarPlus size={15} aria-hidden />
          {agregando ? "Cerrar" : "Agregar curso o examen"}
        </button>
      </div>

      {agregando && (
        <div className="rounded-lg border border-dashed border-borde bg-fondo/50 p-3">
          <FormularioDeCapacitacion accion={agregar} textoBoton="Agregar" cargando="Agregando..." />
        </div>
      )}

      {error && (
        <p role="alert" className="text-xs font-semibold text-red-600">
          {error}
        </p>
      )}

      {cursos.length === 0 && !agregando && (
        <p className="rounded-lg border border-borde bg-fondo px-3 py-3 text-center text-xs text-gris">
          Todavía no hay cursos ni exámenes para esta persona. Usa «Agregar» para reservar el primero.
        </p>
      )}

      {enCurso.length > 0 && lista("En curso", enCurso)}
      {historial.length > 0 && lista("Realizados y cancelados", historial)}
    </div>
  );
}

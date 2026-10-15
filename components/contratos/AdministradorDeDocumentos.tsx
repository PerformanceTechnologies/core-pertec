"use client";

import { useMemo, useState, useTransition } from "react";
import { IconClockHour4, IconPencil, IconPlus, IconSearch, IconTrash } from "@tabler/icons-react";
import BotonGuardar from "./BotonGuardar";
import MensajeDeForm from "./MensajeDeForm";
import VentanaModal from "./VentanaModal";
import { useFormulario } from "./useFormulario";
import { BOTON_PRIMARIO, CAMPO } from "@/lib/contratos/estilos";
import type { TipoDeCatalogo } from "@/lib/contratos/acreditacion-modelo";
import {
  actualizarTipoAction,
  crearTipoAction,
  eliminarTipoAction,
} from "@/app/(protegido)/contratos/[contrato]/acreditacion/acciones";
import {
  actualizarTipoAction as actualizarTipoDeVehiculoAction,
  crearTipoAction as crearTipoDeVehiculoAction,
  eliminarTipoAction as eliminarTipoDeVehiculoAction,
} from "@/app/(protegido)/contratos/[contrato]/acreditacion-vehiculos/acciones";
import { TERMINOS_DE_CONFIGURACION, type Dominio } from "@/lib/contratos/dominio-de-acreditacion";
import { mensajeDeError } from "@/lib/contratos/errores-cliente";

// Cada submódulo escribe en SUS tablas: el componente elige las acciones según lo que se acredita.
const ACCIONES = {
  personas: { crear: crearTipoAction, actualizar: actualizarTipoAction, eliminar: eliminarTipoAction },
  vehiculos: {
    crear: crearTipoDeVehiculoAction,
    actualizar: actualizarTipoDeVehiculoAction,
    eliminar: eliminarTipoDeVehiculoAction,
  },
} as const;

const ETIQUETA = "mb-1 block text-[11px] font-bold uppercase tracking-wide text-gris";
const CASILLA = "h-4 w-4 rounded border-borde text-azul focus:ring-cian";

interface CargoParaDocumentos {
  id: string;
  nombre: string;
  /** Los documentos que pide: de acá sale «lo piden 2 cargos». */
  tipoIds: string[];
}

/**
 * El catálogo de documentos: agregar los que faltan, corregir los que están y
 * quitar los que sobran.
 *
 * Agrupados como en el checklist, con un buscador (son 25 y crecen) y la edición en una
 * ventana en lugar de desplegarse en la propia fila: con el formulario abierto en la lista,
 * el documento que se edita empujaba al resto y se perdía de vista cuál era.
 *
 * Un documento nuevo se puede pedir de una vez a los cargos que corresponda. Y
 * eliminar tiene una regla: solo si NADIE lo tiene anotado. Con personas de por
 * medio se desactiva, que lo saca de los checklists y del avance sin llevarse por
 * delante estados ni archivos — es lo que evita que un clic borre el expediente de
 * veinte personas.
 */
export default function AdministradorDeDocumentos({
  dominio = "personas",
  tipos,
  cargos,
}: {
  dominio?: Dominio;
  tipos: TipoDeCatalogo[];
  /** Los cargos (o tipos de vehículo) activos y qué documentos pide cada uno. */
  cargos: CargoParaDocumentos[];
}) {
  const grupos = useMemo(() => [...new Set(tipos.map((t) => t.grupo))], [tipos]);
  const [busqueda, setBusqueda] = useState("");
  // `null` = cerrada; «nuevo» = crear; un id = editar ese documento.
  const [abierto, setAbierto] = useState<string | null>(null);
  const cerrar = () => setAbierto(null);

  const editado = tipos.find((t) => t.id === abierto);
  const activos = tipos.filter((t) => t.activo).length;

  const q = busqueda.trim().toLowerCase();
  const visibles = tipos.filter(
    (t) => !q || t.nombre.toLowerCase().includes(q) || t.grupo.toLowerCase().includes(q),
  );
  const gruposVisibles = grupos.filter((g) => visibles.some((t) => t.grupo === g));

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-gris">
          <strong className="text-tinta">{activos}</strong> {activos === 1 ? "documento activo" : "documentos activos"}
          {tipos.length > activos && ` · ${tipos.length - activos} desactivados`} · {grupos.length}{" "}
          {grupos.length === 1 ? "grupo" : "grupos"}
        </p>
        <button
          type="button"
          onClick={() => setAbierto("nuevo")}
          className={`${BOTON_PRIMARIO} inline-flex items-center gap-2`}
        >
          <IconPlus size={16} />
          Nuevo documento
        </button>
      </div>

      <label className="relative mt-4 block sm:max-w-sm">
        <span className="sr-only">Buscar un documento</span>
        <IconSearch
          size={16}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gris-suave"
        />
        <input
          type="search"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar por nombre o grupo"
          className={`${CAMPO} pl-9`}
        />
      </label>

      {gruposVisibles.length === 0 ? (
        <p className="mt-6 rounded-xl border border-dashed border-borde bg-superficie/60 p-8 text-center text-sm text-gris">
          {q ? "Ningún documento coincide con la búsqueda." : "Todavía no hay documentos en el catálogo."}
        </p>
      ) : (
        <div className="mt-5 space-y-6">
          {gruposVisibles.map((grupo) => {
            const delGrupo = visibles.filter((t) => t.grupo === grupo);
            return (
              <section key={grupo}>
                <h3 className="mb-2 flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-gris">
                  <span className="h-[2px] w-3 rounded-full bg-cian" />
                  {grupo}
                  <span className="rounded-full bg-borde/70 px-1.5 py-0.5 text-[10px] tabular-nums">
                    {delGrupo.length}
                  </span>
                </h3>
                <ul className="divide-y divide-borde overflow-hidden rounded-xl border border-borde bg-superficie shadow-[var(--sombra-tarjeta)]">
                  {delGrupo.map((t) => (
                    <FilaDeTipo
                      key={t.id}
                      dominio={dominio}
                      tipo={t}
                      cargosQueLoPiden={cargos.filter((c) => c.tipoIds.includes(t.id)).length}
                      alEditar={() => setAbierto(t.id)}
                    />
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}

      <VentanaModal
        abierta={abierto === "nuevo"}
        alCerrar={cerrar}
        titulo="Nuevo documento"
        descripcion="Se agrega al catálogo y aparece en el checklist de quien lo tenga que presentar."
      >
        <FormularioNuevoDocumento
          dominio={dominio}
          grupos={grupos}
          cargos={cargos}
          alGuardar={cerrar}
          alCancelar={cerrar}
        />
      </VentanaModal>

      <VentanaModal
        abierta={editado !== undefined}
        alCerrar={cerrar}
        titulo="Editar documento"
        descripcion={editado?.nombre}
      >
        {editado && (
          <FormularioEditarDocumento
            key={editado.id}
            dominio={dominio}
            tipo={editado}
            grupos={grupos}
            alGuardar={cerrar}
            alCancelar={cerrar}
          />
        )}
      </VentanaModal>
    </div>
  );
}

function FilaDeTipo({
  dominio,
  tipo,
  cargosQueLoPiden,
  alEditar,
}: {
  dominio: Dominio;
  tipo: TipoDeCatalogo;
  cargosQueLoPiden: number;
  alEditar: () => void;
}) {
  const [eliminando, iniciar] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const t = TERMINOS_DE_CONFIGURACION[dominio];

  function eliminar() {
    if (!window.confirm(t.confirmarEliminarDocumento(tipo.nombre))) {
      return;
    }
    setError(null);
    iniciar(async () => {
      try {
        const r = await ACCIONES[dominio].eliminar(tipo.id);
        if (r.error) setError(r.error);
      } catch (e) {
        setError(mensajeDeError(e, "No se pudo eliminar."));
      }
    });
  }

  const enUso = tipo.enUso > 0;

  return (
    <li className={tipo.activo ? "" : "opacity-70"}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
        {/* En el celular el texto ocupa la línea entera y las acciones van juntas debajo, a la
            derecha; desde `sm`, todo en una fila. Con las acciones sueltas, la papelera caía a
            una tercera línea y cada fila medía el doble. */}
        <div className="min-w-0 flex-1 basis-full sm:basis-52">
          <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-tinta">
            {tipo.nombre}
            {tipo.tieneVencimiento && (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-amber-700">
                <IconClockHour4 size={10} aria-hidden />
                Vence
              </span>
            )}
            {!tipo.activo && (
              <span className="rounded-full bg-borde px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-gris">
                Desactivado
              </span>
            )}
          </p>
          <p className="mt-0.5 text-[11px] text-gris">
            {t.quienLoPide(cargosQueLoPiden)}
            <span className="text-gris-suave">
              {" · "}
              {t.usoDeDocumento(tipo.enUso)}
            </span>
          </p>
        </div>

        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            onClick={alEditar}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-borde px-3 py-2 text-[11px] font-bold uppercase tracking-wide text-azul transition hover:border-cian"
          >
            <IconPencil size={14} />
            Editar
          </button>

          <button
            type="button"
            onClick={eliminar}
            disabled={eliminando || enUso}
            aria-label={`Eliminar ${tipo.nombre}`}
            title={enUso ? t.documentoEnUso : "Eliminar del catálogo"}
            className="flex h-11 w-11 items-center justify-center rounded-lg text-gris transition hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-gris"
          >
            <IconTrash size={17} />
          </button>
        </div>
      </div>

      {error && (
        <p role="alert" className="px-4 pb-3 text-xs font-semibold text-red-600">
          {error}
        </p>
      )}
    </li>
  );
}

function PieDeFormulario({
  pendiente,
  etiqueta,
  cargando,
  alCancelar,
  estado,
}: {
  pendiente: boolean;
  etiqueta: string;
  cargando?: string;
  alCancelar: () => void;
  estado: Parameters<typeof MensajeDeForm>[0]["estado"];
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 border-t border-borde pt-4">
      <BotonGuardar pendiente={pendiente} cargando={cargando}>
        {etiqueta}
      </BotonGuardar>
      <button
        type="button"
        onClick={alCancelar}
        className="min-h-11 px-2 text-xs font-bold uppercase tracking-wide text-gris transition hover:text-azul"
      >
        Cancelar
      </button>
      <MensajeDeForm estado={estado} />
    </div>
  );
}

function FormularioNuevoDocumento({
  dominio,
  grupos,
  cargos,
  alGuardar,
  alCancelar,
}: {
  dominio: Dominio;
  grupos: string[];
  cargos: CargoParaDocumentos[];
  alGuardar: () => void;
  alCancelar: () => void;
}) {
  const { estado, enviar, pendiente } = useFormulario(async (previo, datos) => {
    const resultado = await ACCIONES[dominio].crear(previo, datos);
    if (resultado.ok) alGuardar();
    return resultado;
  });

  return (
    <form onSubmit={enviar} className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label>
          <span className={ETIQUETA}>Nombre</span>
          <input
            name="nombre"
            required
            maxLength={120}
            placeholder="Por ejemplo: Examen de altura geográfica"
            className={CAMPO}
          />
        </label>
        <label>
          <span className={ETIQUETA}>Grupo del checklist</span>
          <input
            name="grupo"
            required
            list="grupos-de-documentos"
            maxLength={60}
            placeholder="Elige uno o escribe uno nuevo"
            className={CAMPO}
          />
          <datalist id="grupos-de-documentos">
            {grupos.map((g) => (
              <option key={g} value={g} />
            ))}
          </datalist>
        </label>
      </div>

      <label className="flex min-h-11 items-center gap-2 text-sm text-tinta">
        <input type="checkbox" name="tiene_vencimiento" className={CASILLA} />
        Vence (pide fecha de vencimiento y avisa antes de que caduque)
      </label>

      {cargos.length > 0 && (
        <fieldset>
          <legend className={ETIQUETA}>{TERMINOS_DE_CONFIGURACION[dominio].pedirleA}</legend>
          <div className="flex flex-wrap gap-x-5 gap-y-1">
            {cargos.map((c) => (
              <label key={c.id} className="flex min-h-11 items-center gap-2 text-sm text-tinta">
                <input type="checkbox" name="cargos" value={c.id} className={CASILLA} />
                {c.nombre}
              </label>
            ))}
          </div>
          <p className="mt-1 text-[11px] text-gris-suave">{TERMINOS_DE_CONFIGURACION[dominio].cambiarDespues}</p>
        </fieldset>
      )}

      <PieDeFormulario
        pendiente={pendiente}
        etiqueta="Agregar documento"
        cargando="Agregando..."
        alCancelar={alCancelar}
        estado={estado}
      />
    </form>
  );
}

function FormularioEditarDocumento({
  dominio,
  tipo,
  grupos,
  alGuardar,
  alCancelar,
}: {
  dominio: Dominio;
  tipo: TipoDeCatalogo;
  grupos: string[];
  alGuardar: () => void;
  alCancelar: () => void;
}) {
  const { estado, enviar, pendiente } = useFormulario(async (previo, datos) => {
    const resultado = await ACCIONES[dominio].actualizar(tipo.id, previo, datos);
    if (resultado.ok) alGuardar();
    return resultado;
  });

  return (
    <form onSubmit={enviar} className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label>
          <span className={ETIQUETA}>Nombre</span>
          <input name="nombre" required maxLength={120} defaultValue={tipo.nombre} className={CAMPO} />
        </label>
        <label>
          <span className={ETIQUETA}>Grupo del checklist</span>
          <input
            name="grupo"
            required
            list={`grupos-${tipo.id}`}
            maxLength={60}
            defaultValue={tipo.grupo}
            className={CAMPO}
          />
          <datalist id={`grupos-${tipo.id}`}>
            {grupos.map((g) => (
              <option key={g} value={g} />
            ))}
          </datalist>
        </label>
      </div>

      <div className="flex flex-wrap gap-x-6 gap-y-1">
        <label className="flex min-h-11 items-center gap-2 text-sm text-tinta">
          <input type="checkbox" name="tiene_vencimiento" defaultChecked={tipo.tieneVencimiento} className={CASILLA} />
          Vence
        </label>
        <label className="flex min-h-11 items-center gap-2 text-sm text-tinta">
          <input type="checkbox" name="activo" defaultChecked={tipo.activo} className={CASILLA} />
          Activo (se pide en los checklists)
        </label>
      </div>

      <p className="rounded-lg bg-fondo/60 px-3 py-2 text-[11px] text-gris">
        Renombrarlo no cambia el nombre de los archivos que ya están en SharePoint: esos se quedan como
        se subieron.
      </p>

      <PieDeFormulario pendiente={pendiente} etiqueta="Guardar documento" alCancelar={alCancelar} estado={estado} />
    </form>
  );
}

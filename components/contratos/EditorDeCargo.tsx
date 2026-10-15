"use client";

import { useRef, useState, useTransition } from "react";
import BotonGuardar from "./BotonGuardar";
import MensajeDeForm from "./MensajeDeForm";
import { useFormulario } from "./useFormulario";
import { CAMPO } from "@/lib/contratos/estilos";
import type { EstadoForm } from "@/lib/contratos/acreditacion-modelo";
import { TERMINOS_DE_CONFIGURACION, type Dominio } from "@/lib/contratos/dominio-de-acreditacion";

export interface GrupoDeTipos {
  grupo: string;
  tipos: { id: string; nombre: string }[];
}

/**
 * Un cargo (o un tipo de vehículo) y los documentos que pide. Sirve para crear uno nuevo y para
 * editar uno existente: la diferencia es solo si trae valores y si se puede eliminar.
 *
 * Las casillas son el color verde del Excel: tildar un documento acá es pintarlo
 * de verde para ese cargo, y se aplica a todas las personas que lo tienen.
 *
 * Vive dentro de una ventana emergente (ver AdministradorDeCargos). Por eso el pie con los
 * botones queda pegado al fondo de la ventana (`sticky`): con 25 documentos en seis grupos
 * el formulario es largo, y «Guardar» no puede quedar tres pantallas más abajo.
 */
export default function EditorDeCargo({
  dominio = "personas",
  cargo,
  grupos,
  guardar,
  eliminar,
  alGuardar,
  alCancelar,
}: {
  /** Qué se acredita: decide cómo se llama cada cosa en pantalla. */
  dominio?: Dominio;
  /** `usos`: cuántas personas (o vehículos) lo tienen. */
  cargo?: { nombre: string; activo: boolean; tipoIds: string[]; usos: number };
  grupos: GrupoDeTipos[];
  guardar: (previo: EstadoForm, form: FormData) => Promise<EstadoForm>;
  /** Solo en cargos existentes. */
  eliminar?: () => Promise<EstadoForm>;
  /** Se llama cuando el servidor confirma el guardado: la ventana se cierra. */
  alGuardar?: () => void;
  /** Cerrar la ventana sin guardar. */
  alCancelar?: () => void;
}) {
  const formulario = useRef<HTMLFormElement>(null);
  const esNuevo = !cargo;
  const t = TERMINOS_DE_CONFIGURACION[dominio];

  const { estado, enviar, pendiente } = useFormulario(async (previo, datos) => {
    const resultado = await guardar(previo, datos);
    if (resultado.ok) alGuardar?.();
    return resultado;
  });

  const [eliminando, iniciar] = useTransition();
  const [errorAlEliminar, setErrorAlEliminar] = useState<string | null>(null);

  const elegidos = new Set(cargo?.tipoIds ?? []);
  const total = grupos.reduce((n, g) => n + g.tipos.length, 0);

  // Qué casillas están tildadas AHORA, para los contadores («7 de 25», «2/5»). Las casillas
  // siguen siendo del navegador (sin estado de React por cada una); acá solo se lee lo que
  // hay marcado cada vez que algo cambia.
  const [tildados, setTildados] = useState<Set<string>>(elegidos);

  function recontar() {
    const marcadas = formulario.current?.querySelectorAll<HTMLInputElement>('input[name="tipos"]:checked');
    setTildados(new Set(Array.from(marcadas ?? []).map((c) => c.value)));
  }
  const marcados = tildados.size;

  function marcar(grupo: string | null, valor: boolean) {
    const casillas = formulario.current?.querySelectorAll<HTMLInputElement>(
      grupo ? `input[name="tipos"][data-grupo="${CSS.escape(grupo)}"]` : 'input[name="tipos"]',
    );
    casillas?.forEach((c) => {
      c.checked = valor;
    });
    recontar();
  }

  /** Cuántos de un grupo están tildados, para el «3 de 5» de su título. */
  const enGrupo = (g: GrupoDeTipos) => g.tipos.filter((t) => tildados.has(t.id)).length;

  return (
    <form ref={formulario} onSubmit={enviar} onChange={recontar} className="space-y-5">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_auto]">
        <label>
          <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-gris">
            {t.etiquetaDeNombre}
          </span>
          <input
            name="nombre"
            required
            maxLength={80}
            defaultValue={cargo?.nombre ?? ""}
            placeholder={t.ejemploDeNombre}
            className={CAMPO}
          />
        </label>

        {cargo && (
          <label className="flex min-h-11 items-center gap-2 self-end text-sm text-tinta">
            <input
              type="checkbox"
              name="activo"
              defaultChecked={cargo.activo}
              className="h-4 w-4 rounded border-borde text-azul focus:ring-cian"
            />
            Activo
          </label>
        )}
      </div>

      <div>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <p className="text-[11px] font-bold uppercase tracking-wide text-gris">
            {t.documentosQuePide}{" "}
            <span className="ml-1 rounded-full bg-cian-lavado px-2 py-0.5 text-[10px] tabular-nums text-cian-texto">
              {marcados} de {total}
            </span>
          </p>
          <div className="flex gap-3 text-[11px] font-bold uppercase tracking-wide">
            <button
              type="button"
              onClick={() => marcar(null, true)}
              className="min-h-11 text-azul hover:underline"
            >
              Todos
            </button>
            <button
              type="button"
              onClick={() => marcar(null, false)}
              className="min-h-11 text-gris hover:underline"
            >
              Ninguno
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {grupos.map((g) => (
            <fieldset key={g.grupo} className="rounded-xl border border-borde bg-fondo/40 p-3">
              <legend className="px-1 text-[11px] font-bold uppercase tracking-wide text-gris">
                {g.grupo}{" "}
                <span className="font-semibold tabular-nums text-gris-suave">
                  ({enGrupo(g)}/{g.tipos.length})
                </span>
              </legend>
              <div className="space-y-0.5">
                {g.tipos.map((t) => (
                  <label key={t.id} className="flex min-h-11 items-center gap-2 text-sm text-tinta">
                    <input
                      type="checkbox"
                      name="tipos"
                      value={t.id}
                      data-grupo={g.grupo}
                      defaultChecked={elegidos.has(t.id)}
                      className="h-4 w-4 shrink-0 rounded border-borde text-azul focus:ring-cian"
                    />
                    {t.nombre}
                  </label>
                ))}
              </div>
              <button
                type="button"
                onClick={() => marcar(g.grupo, true)}
                className="mt-1 min-h-11 text-[11px] font-bold uppercase tracking-wide text-azul hover:underline"
              >
                Marcar el grupo
              </button>
            </fieldset>
          ))}
        </div>

        <p className="mt-3 text-xs text-gris">
          ¿Falta algún documento?{" "}
          <button
            type="button"
            onClick={() => {
              // Cierra esta ventana y pide la pestaña de Documentos: el catálogo es de todos los
              // cargos, y se edita ahí, no desde uno solo. El evento evita que este editor
              // tenga que conocer a las pestañas.
              alCancelar?.();
              window.dispatchEvent(new CustomEvent("configuracion:ir-a", { detail: "documentos" }));
            }}
            className="font-semibold text-azul hover:underline"
          >
            Agrégalo, edítalo o elimínalo en Documentos
          </button>
          .
        </p>
      </div>

      <div className="sticky bottom-0 -mx-5 -mb-5 flex flex-wrap items-center gap-3 rounded-b-2xl border-t border-borde bg-superficie px-5 py-3">
        <BotonGuardar pendiente={pendiente}>{esNuevo ? t.crear : t.guardar}</BotonGuardar>
        {alCancelar && (
          <button
            type="button"
            onClick={alCancelar}
            className="min-h-11 px-2 text-xs font-bold uppercase tracking-wide text-gris transition hover:text-azul"
          >
            Cancelar
          </button>
        )}
        <MensajeDeForm estado={estado} />

        {eliminar && (
          <button
            type="button"
            disabled={eliminando || (cargo?.usos ?? 0) > 0}
            title={(cargo?.usos ?? 0) > 0 ? t.noSePuedeEliminar : undefined}
            onClick={() => {
              if (!window.confirm(t.confirmarEliminar)) return;
              setErrorAlEliminar(null);
              iniciar(async () => {
                const r = await eliminar();
                if (r.error) setErrorAlEliminar(r.error);
                else alGuardar?.();
              });
            }}
            className="ml-auto min-h-11 text-xs font-bold uppercase tracking-wide text-red-600/80 transition hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {t.eliminar}
          </button>
        )}
      </div>

      {errorAlEliminar && (
        <p role="alert" className="text-xs font-semibold text-red-600">
          {errorAlEliminar}
        </p>
      )}
    </form>
  );
}

"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import BotonGuardar from "./BotonGuardar";
import MensajeDeForm from "./MensajeDeForm";
import RuedaCarga from "./RuedaCarga";
import { useFormulario } from "./useFormulario";
import { CAMPO } from "@/lib/contratos/estilos";
import { MODULOS, type ModuloArranque } from "@/lib/contratos/arranque-modelo";
import {
  actualizarCategoriaAction,
  crearCategoriaAction,
  eliminarCategoriaAction,
} from "@/app/(protegido)/contratos/[contrato]/acciones-partidas";
import { mensajeDeError } from "@/lib/contratos/errores-cliente";

export interface CategoriaEditable {
  id: string;
  nombre: string;
  activo: boolean;
  /** Cuántas partidas la usan: decide si se puede eliminar o solo desactivar. */
  enUso: number;
}

/**
 * Las categorías de un módulo: agregar, renombrar, desactivar y eliminar.
 *
 * Una categoría con partidas no se puede eliminar —la base lo impide—, así que el botón
 * ni se ofrece: se desactiva, y deja de aparecer al crear partidas nuevas pero conserva
 * las que ya tiene. Es lo mismo que pasa con los cargos de Acreditación.
 */
export default function EditorDeCategorias({
  modulo,
  categorias,
}: {
  modulo: ModuloArranque;
  categorias: CategoriaEditable[];
}) {
  const config = MODULOS[modulo];
  const nueva = useFormulario((previo, form) => crearCategoriaAction(modulo, previo, form));
  const [nombre, setNombre] = useState("");

  // Un alta que salió bien vacía el campo; si falla se queda para corregirlo. Como el
  // envío es asíncrono, se limpia cuando el estado pasa a «ok», no al enviar. Ajustar
  // estado durante el render, y no en un efecto, evita un parpadeo con el texto viejo.
  if (nueva.estado.ok && nombre !== "") setNombre("");

  return (
    <div className="space-y-6">
      <form onSubmit={nueva.enviar} className="flex flex-wrap items-end gap-3">
        <label className="min-w-0 flex-1 sm:max-w-sm">
          <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-gris">
            Nueva categoría
          </span>
          <input
            name="nombre"
            required
            maxLength={80}
            autoComplete="off"
            value={nombre}
            onChange={(e) => {
              setNombre(e.target.value);
              if (nueva.estado.ok || nueva.estado.error) nueva.reiniciar();
            }}
            placeholder={modulo === "logistica" ? "Ej.: Transporte de residuos" : "Ej.: Capacitación"}
            className={CAMPO}
          />
        </label>
        <BotonGuardar pendiente={nueva.pendiente} cargando="Agregando...">
          Agregar
        </BotonGuardar>
        <MensajeDeForm estado={nueva.estado} />
      </form>

      {categorias.length === 0 ? (
        <p className="text-sm text-gris">
          Todavía no hay categorías de {config.titulo.toLowerCase()}. Agrega la primera arriba.
        </p>
      ) : (
        <ul className="divide-y divide-borde overflow-hidden rounded-xl border border-borde bg-superficie shadow-[var(--sombra-tarjeta)]">
          {categorias.map((c) => (
            <FilaDeCategoria key={c.id} modulo={modulo} categoria={c} />
          ))}
        </ul>
      )}
    </div>
  );
}

function FilaDeCategoria({
  modulo,
  categoria,
}: {
  modulo: ModuloArranque;
  categoria: CategoriaEditable;
}) {
  const router = useRouter();
  const { estado, enviar, pendiente } = useFormulario((previo, form) =>
    actualizarCategoriaAction(modulo, categoria.id, previo, form),
  );
  const [eliminando, iniciar] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function eliminar() {
    if (!window.confirm(`¿Eliminar la categoría «${categoria.nombre}»?`)) return;
    setError(null);
    iniciar(async () => {
      try {
        const resultado = await eliminarCategoriaAction(modulo, categoria.id);
        if (resultado.error) setError(resultado.error);
        else router.refresh();
      } catch (e) {
        setError(mensajeDeError(e, "No se pudo eliminar."));
      }
    });
  }

  return (
    <li className="p-3.5 sm:px-4">
      <form onSubmit={enviar} className="flex flex-wrap items-center gap-3">
        <input
          name="nombre"
          required
          maxLength={80}
          defaultValue={categoria.nombre}
          aria-label="Nombre de la categoría"
          className={`${CAMPO} min-w-0 flex-1 sm:max-w-xs`}
        />

        <label className="flex min-h-11 items-center gap-2 text-xs font-bold uppercase tracking-wide text-gris">
          <input
            type="checkbox"
            name="activo"
            defaultChecked={categoria.activo}
            className="h-4 w-4 accent-[var(--color-azul)]"
          />
          Activa
        </label>

        <span className="text-[11px] text-gris-suave">
          {categoria.enUso === 0
            ? "Sin partidas"
            : `${categoria.enUso} ${categoria.enUso === 1 ? "partida" : "partidas"}`}
        </span>

        <div className="ml-auto flex items-center gap-3">
          <BotonGuardar pendiente={pendiente} secundario>
            Guardar
          </BotonGuardar>
          {categoria.enUso === 0 && (
            <button
              type="button"
              onClick={eliminar}
              disabled={eliminando}
              className="inline-flex min-h-11 items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-red-600/80 transition hover:text-red-600 disabled:opacity-60"
            >
              {eliminando && <RuedaCarga className="h-3.5 w-3.5" />}
              Eliminar
            </button>
          )}
        </div>
      </form>

      <div className="mt-1.5 empty:hidden">
        <MensajeDeForm estado={estado} />
        {error && (
          <p role="alert" className="text-xs font-semibold text-red-600">
            {error}
          </p>
        )}
      </div>
    </li>
  );
}

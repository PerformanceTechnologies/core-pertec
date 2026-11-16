"use client";

import { useState } from "react";
import { guardarProyectoAction } from "@/app/(protegido)/gestion-financiera/acciones-config";
import type { Proyecto } from "@/lib/fin/datos";
import { ETIQUETA_TIPO_PROYECTO, claveTipoProyecto, etiquetaTipoProyecto } from "@/lib/fin/modelo";
import { CAMPO, Campo, ComboContacto, FormAccion, type OpcionContacto } from "./ui";

/** Un contacto elegible, con los mandantes con que trabaja (ya en texto: «[AAS] Anglo American Sur S.A.»). */
export type ContactoProyecto = OpcionContacto & { mandantes: string[] };

export default function FormProyecto({ p, clientes, tipos = [], alOk }: { p?: Proyecto; clientes: ContactoProyecto[]; tipos?: string[]; alOk?: () => void }) {
  const [contactoId, setContactoId] = useState<string | null>(p?.mandanteId ?? null);
  const mandantes = clientes.find((c) => c.id === contactoId)?.mandantes ?? [];
  const todos = [...new Set([...Object.keys(ETIQUETA_TIPO_PROYECTO), ...tipos, ...(p?.tipo ? [p.tipo] : [])])];
  const [tipo, setTipo] = useState<string>(p?.tipo ?? "contrato");
  const [nuevoTipo, setNuevoTipo] = useState<string | null>(null);

  return (
    <FormAccion accion={guardarProyectoAction.bind(null, p?.id ?? null)} textoBoton={p ? "Guardar" : "Crear proyecto"} alOk={alOk}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Campo etiqueta="Contacto *" className="sm:col-span-2">
          <ComboContacto name="mandanteId" opciones={clientes} inicial={p?.mandanteId} requerido alCambiar={setContactoId} />
          {/* El mandante sale solo del contacto (se marca en su ficha de Contactos). */}
          {contactoId && (
            <p className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-gris">
              <span className="font-semibold">Mandante:</span>
              {mandantes.length ? (
                mandantes.map((m) => (
                  <span key={m} className="rounded-full bg-violet-500/12 px-2 py-0.5 font-semibold text-tinta">{m}</span>
                ))
              ) : (
                <span className="text-gris-suave">sin mandante en su ficha</span>
              )}
            </p>
          )}
        </Campo>
        <Campo etiqueta="Tipo">
          <input type="hidden" name="tipo" value={nuevoTipo !== null ? claveTipoProyecto(nuevoTipo) || "contrato" : tipo} />
          {nuevoTipo === null ? (
            <select
              value={tipo}
              onChange={(e) => (e.target.value === "__nuevo" ? setNuevoTipo("") : setTipo(e.target.value))}
              className={CAMPO}
            >
              {todos.map((t) => (
                <option key={t} value={t}>{etiquetaTipoProyecto(t)}</option>
              ))}
              <option value="__nuevo">+ Agregar otro tipo…</option>
            </select>
          ) : (
            <div className="flex gap-2">
              <input value={nuevoTipo} onChange={(e) => setNuevoTipo(e.target.value)} placeholder="Ej: Obra civil" maxLength={30} autoFocus className={CAMPO} />
              <button type="button" onClick={() => setNuevoTipo(null)} className="shrink-0 text-xs font-semibold text-gris hover:text-tinta">Cancelar</button>
            </div>
          )}
        </Campo>
        <Campo etiqueta="Presupuesto de costos" ayuda="Vacío = sin presupuesto (no se controla el saldo)"><input name="presupuestoCostos" defaultValue={p?.presupuestoCostos ?? ""} inputMode="numeric" className={CAMPO} /></Campo>
        <Campo etiqueta="Inicio"><input name="fechaInicio" type="date" defaultValue={p?.fechaInicio ?? ""} className={CAMPO} /></Campo>
        <Campo etiqueta="Término"><input name="fechaTermino" type="date" defaultValue={p?.fechaTermino ?? ""} className={CAMPO} /></Campo>
        <Campo etiqueta="Estado"><select name="estado" defaultValue={p?.estado ?? "activo"} className={CAMPO}><option value="activo">Activo</option><option value="cerrado">Cerrado</option></select></Campo>
        <Campo etiqueta="Descripción" className="sm:col-span-2"><input name="descripcion" defaultValue={p?.descripcion ?? ""} className={CAMPO} /></Campo>
      </div>
    </FormAccion>
  );
}

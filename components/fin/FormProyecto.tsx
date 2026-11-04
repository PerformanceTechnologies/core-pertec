"use client";

import { guardarProyectoAction } from "@/app/(protegido)/gestion-financiera/acciones-config";
import type { Proyecto } from "@/lib/fin/datos";
import { CAMPO, Campo, ComboContacto, FormAccion, type OpcionContacto } from "./ui";

export default function FormProyecto({ p, clientes, alOk }: { p?: Proyecto; clientes: OpcionContacto[]; alOk?: () => void }) {
  return (
    <FormAccion accion={guardarProyectoAction.bind(null, p?.id ?? null)} textoBoton={p ? "Guardar" : "Crear proyecto"} alOk={alOk}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Campo etiqueta="Nombre *" ayuda="Un spot se nombra «Spot - nombre»" className="sm:col-span-2"><input name="nombre" required defaultValue={p?.nombre} className={CAMPO} /></Campo>
        <Campo etiqueta="Mandante"><ComboContacto name="mandanteId" opciones={clientes} inicial={p?.mandanteId} /></Campo>
        <Campo etiqueta="Tipo"><select name="tipo" defaultValue={p?.tipo ?? "contrato"} className={CAMPO}><option value="contrato">Contrato</option><option value="spot">Spot</option><option value="arriendo">Arriendo</option><option value="interno">Interno</option></select></Campo>
        <Campo etiqueta="Jefe de proyecto"><input name="jefeProyecto" defaultValue={p?.jefeProyecto ?? ""} className={CAMPO} /></Campo>
        <Campo etiqueta="Presupuesto de costos" ayuda="Vacío = sin presupuesto (no se controla el saldo)"><input name="presupuestoCostos" defaultValue={p?.presupuestoCostos ?? ""} inputMode="numeric" className={CAMPO} /></Campo>
        <Campo etiqueta="Inicio"><input name="fechaInicio" type="date" defaultValue={p?.fechaInicio ?? ""} className={CAMPO} /></Campo>
        <Campo etiqueta="Término"><input name="fechaTermino" type="date" defaultValue={p?.fechaTermino ?? ""} className={CAMPO} /></Campo>
        <Campo etiqueta="Estado"><select name="estado" defaultValue={p?.estado ?? "activo"} className={CAMPO}><option value="activo">Activo</option><option value="cerrado">Cerrado</option></select></Campo>
        <Campo etiqueta="Descripción" className="sm:col-span-2"><input name="descripcion" defaultValue={p?.descripcion ?? ""} className={CAMPO} /></Campo>
      </div>
    </FormAccion>
  );
}

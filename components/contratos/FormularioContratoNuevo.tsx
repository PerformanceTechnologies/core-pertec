"use client";

import BotonGuardar from "./BotonGuardar";
import MensajeDeForm from "./MensajeDeForm";
import { useFormulario } from "./useFormulario";
import { CAMPO } from "@/lib/contratos/estilos";
import { crearContratoAction } from "@/app/(protegido)/contratos/acciones-contratos";

const ETIQUETA = "mb-1 block text-[11px] font-bold uppercase tracking-wide text-gris";

/**
 * Lo mínimo para abrir un contrato: el nombre, y lo que lo identifica.
 *
 * El nombre es también el de su carpeta en SharePoint (CONTRATOS/<nombre>), por eso es lo único
 * obligatorio. Lo demás se puede completar después desde la configuración del contrato.
 */
export default function FormularioContratoNuevo() {
  const { estado, enviar, pendiente } = useFormulario(crearContratoAction);

  return (
    <form onSubmit={enviar} className="grid gap-4 sm:grid-cols-2">
      <label className="sm:col-span-2">
        <span className={ETIQUETA}>Nombre del contrato</span>
        <input
          name="nombre"
          required
          maxLength={120}
          placeholder="Ej.: Servicio de mantención Planta Ventanas"
          className={CAMPO}
        />
        <span className="mt-1 block text-[11px] text-gris">
          Es también el nombre de su carpeta en SharePoint. No puede llevar &quot; * : &lt; &gt; ? | / \
        </span>
      </label>

      <label>
        <span className={ETIQUETA}>Cliente / mandante</span>
        <input name="cliente" maxLength={120} placeholder="Ej.: CODELCO DCH" className={CAMPO} />
      </label>

      <label>
        <span className={ETIQUETA}>N.º de contrato</span>
        <input name="numero" maxLength={60} placeholder="Ej.: 4600032681" className={CAMPO} />
      </label>

      <label>
        <span className={ETIQUETA}>Fecha de inicio</span>
        <input name="fecha_inicio" type="date" className={CAMPO} />
      </label>

      <label>
        <span className={ETIQUETA}>Administrador de contrato</span>
        <input name="administrador" maxLength={120} className={CAMPO} />
      </label>

      <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
        <BotonGuardar pendiente={pendiente} cargando="Creando el contrato y sus carpetas…">
          Crear contrato
        </BotonGuardar>
        <MensajeDeForm estado={estado} />
      </div>
    </form>
  );
}

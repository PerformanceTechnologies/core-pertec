"use client";

import { IconTrash } from "@tabler/icons-react";
import { BOTON_SUAVE_C } from "@/components/contactos/Visual";

/** «Eliminar» de la cabecera de la ficha, con confirmación (como «Archivar» en un contacto). */
export default function EliminarUsuario({ accion, id, correo }: { accion: (form: FormData) => void; id: string; correo: string }) {
  return (
    <form
      action={accion}
      onSubmit={(e) => {
        if (!window.confirm(`¿Eliminar a ${correo}? Pierde el acceso de inmediato y no se puede deshacer.\n\nSi solo quieres que no entre, apaga «Puede entrar al Core» y guarda.`)) e.preventDefault();
      }}
    >
      <input type="hidden" name="id" value={id} />
      <button type="submit" className={`${BOTON_SUAVE_C} hover:text-rose-600`}>
        <IconTrash size={16} /> Eliminar
      </button>
    </form>
  );
}

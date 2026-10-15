"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { IconPencil } from "@tabler/icons-react";
import RuedaCarga from "./RuedaCarga";
import { usePuede } from "./PermisosDelUsuario";
import { renombrarCarpetaAction } from "@/app/(protegido)/contratos/[contrato]/acciones";

/**
 * Cambiar el nombre de una carpeta de Contrato DCH.
 *
 * `window.prompt` y no un formulario propio, por lo mismo que eliminar usa
 * `window.confirm`: es una acción ocasional, y lo que hace falta es un campo con el
 * nombre actual ya escrito para corregirlo. Funciona igual en el teléfono.
 *
 * Solo aparece para quien puede configurar (el mismo permiso que crear carpetas), y la
 * página no lo pone en las carpetas cuyo nombre usa el sistema. La acción del servidor
 * vuelve a comprobar las dos cosas.
 */
export default function BotonRenombrarCarpeta({
  seccion,
  itemId,
  nombre,
  rutaPadre,
}: {
  seccion: string;
  itemId: string;
  nombre: string;
  /** La carpeta donde está: es la lista que hay que volver a pintar. */
  rutaPadre: string;
}) {
  const router = useRouter();
  const [renombrando, iniciar] = useTransition();
  const puede = usePuede("configurar");
  if (!puede) return null;

  function renombrar() {
    const nuevo = window.prompt(`Nuevo nombre para «${nombre}»:`, nombre)?.trim();
    // Cancelar, dejarlo vacío o no cambiar nada no es un error: simplemente no se hace nada.
    if (!nuevo || nuevo === nombre) return;

    iniciar(async () => {
      const resultado = await renombrarCarpetaAction(seccion, itemId, rutaPadre, nuevo);
      if (resultado.error) window.alert(resultado.error);
      else router.refresh();
    });
  }

  return (
    <button
      type="button"
      onClick={renombrar}
      disabled={renombrando}
      title="Renombrar carpeta"
      aria-label={`Renombrar ${nombre}`}
      aria-busy={renombrando}
      className="relative z-10 inline-flex transition hover:text-azul disabled:cursor-progress"
    >
      {renombrando ? <RuedaCarga className="h-[15px] w-[15px] text-cian" /> : <IconPencil size={15} />}
    </button>
  );
}

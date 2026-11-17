"use client";

import { IconX } from "@tabler/icons-react";

/**
 * Cierra la pestaña que abrió la ventana de envío para conectar el correo. El navegador
 * solo deja cerrarla si la abrió un script (así la abre RemitenteCorreo); si no, el texto
 * de al lado ya dice que se puede cerrar a mano.
 */
export default function CerrarPestana({ className }: { className: string }) {
  return (
    <button type="button" onClick={() => window.close()} className={className}>
      <IconX size={15} /> Cerrar esta pestaña
    </button>
  );
}

// Por qué no se puede emitir todavía (texto para la persona). Sin "use client": lo usan las páginas de servidor.

export function avisoBloqueo(cfg: { configurado: boolean; emisionHabilitada?: boolean; activo: boolean; faltantesEmisor: string[]; emisorDemo?: boolean }): string | null {
  if (!cfg.configurado) return "La facturación electrónica aún no está conectada: el administrador del Core carga la cuenta de SimpleFactura en Administración › Integraciones. Puedes preparar y guardar borradores mientras tanto.";
  if (!cfg.emisionHabilitada) return "La emisión aún no está habilitada: el administrador del Core la habilita en Administración › Integraciones. Puedes preparar y guardar borradores mientras tanto.";
  if (!cfg.activo) return "La facturación electrónica está apagada para esta empresa: el administrador la enciende en Facturación › Configuración.";
  // Con la cuenta demo se emite como la empresa demo: los datos propios del emisor no se usan todavía.
  if (cfg.faltantesEmisor.length && !cfg.emisorDemo) return `Faltan datos de la empresa para emitir: ${cfg.faltantesEmisor.join(", ")} (Facturación › Configuración).`;
  return null;
}

/** Si se puede emitir (la misma regla que el servidor, para habilitar el botón). */
export function puedeEmitir(cfg: Parameters<typeof avisoBloqueo>[0]): boolean {
  return avisoBloqueo(cfg) === null;
}

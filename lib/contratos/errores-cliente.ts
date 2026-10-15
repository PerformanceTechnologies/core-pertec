/**
 * El motivo de un fallo, en algo que una persona pueda leer.
 *
 * Existe por una regla de Next que no se puede desactivar: TODO error lanzado
 * desde una Server Action se sanea en producción. El cliente no recibe el
 * mensaje que escribió quien programó la acción —"La persona ya no existe", "Tu
 * cuenta no tiene acceso a esta carpeta en SharePoint"— sino siempre el mismo
 * texto de React, que en su forma minificada es:
 *
 *   Minified React error #441; visit https://react.dev/errors/441 …
 *
 * Imprimirlo tal cual es lo que estaba pasando: la pantalla mostraba una URL de
 * la documentación de React a alguien que solo quería subir un contrato.
 *
 * Lo que sí sobrevive es `digest`, un identificador que Next pone en el error
 * saneado Y en la línea del registro del servidor con el error de verdad. Es el
 * único hilo entre lo que vio la persona y lo que pasó, así que se muestra: no
 * le dice nada a quien lo lee, pero convierte "falló algo" en algo que se puede
 * buscar.
 *
 * La solución de fondo es que las acciones DEVUELVAN sus errores en vez de
 * lanzarlos —así el mensaje llega entero— y esto es la red para lo que se
 * escape: un fallo de red, una sesión caducada, un error que nadie previó.
 */
export function mensajeDeError(e: unknown, respaldo: string): string {
  if (!(e instanceof Error)) return respaldo;

  // `digest` es la marca de un error saneado por el servidor. Se mira antes que
  // el texto porque no depende de cómo React redacte el mensaje, que cambia
  // entre versiones.
  const digest = (e as Error & { digest?: unknown }).digest;
  const saneado = typeof digest === "string" || /react\.dev\/errors|Server Components render/.test(e.message);

  if (!saneado) return e.message;

  return typeof digest === "string"
    ? `${respaldo} El servidor no entregó el motivo; el código para buscarlo en los registros es ${digest}.`
    : `${respaldo} El servidor no entregó el motivo.`;
}

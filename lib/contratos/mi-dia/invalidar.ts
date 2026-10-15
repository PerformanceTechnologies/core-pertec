/**
 * En core-ih esto descartaba el Mi Día guardado de quienes se vieran afectados por un cambio de
 * plazos o responsables. Mi Día de core-pertec todavía no lee los pendientes de Contratos, así que
 * no hay nada que descartar: queda como punto de enganche para cuando los lea.
 */
export async function invalidarMiDia(_usuarioIds: string[]): Promise<void> {}

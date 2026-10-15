import "server-only";
import { revalidatePath } from "next/cache";

/**
 * Después de un cambio, que las pantallas del contrato se vuelvan a pedir.
 *
 * core-ih refrescaba ruta por ruta («/contratos/acreditacion», la ficha de una persona…). Acá esas
 * rutas llevan el contrato, y armarlas exige esperarlo; pero todas las pantallas de Contratos son
 * dinámicas, así que basta con refrescar el layout de los contratos: el patrón no necesita saber
 * cuál es, y alcanza a todas las de adentro. Refrescar de más los demás contratos no cuesta nada:
 * igual se vuelven a leer de la base al abrirlos.
 */
export function refrescarContrato(): void {
  revalidatePath("/contratos/[contrato]", "layout");
}

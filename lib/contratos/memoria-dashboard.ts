import { idDelContrato } from "./contrato-actual";

// La memoria corta del dashboard.
//
// Es la pantalla de entrada: se carga en CADA ingreso y cada vez que alguien vuelve al
// panel, y arma el resumen de los cuatro módulos (una lectura de la nómina entera, dos de
// partidas y un recorrido por SharePoint). Sin recordar nada, volver al panel repetiría todo
// eso cada vez.
//
// Se guarda la PROMESA y no el resultado, por lo mismo que la estructura de SharePoint (ver
// listarEstructura): el tablero pide el mismo módulo desde varios widgets a la vez, y con el
// resultado solamente todos saldrían a la base antes de que el primero terminara.
//
// Es memoria de cada instancia del servidor, no compartida: otra instancia puede tener su propia
// copia de hasta `ms` de antigüedad. Para un tablero de resumen está bien; las pantallas de cada
// módulo, en cambio, leen siempre de la base. Y quien cambia algo desde el core la descarta con
// olvidarDashboard(), así que lo que uno acaba de guardar se ve al volver al panel.

const MAXIMO_DE_ENTRADAS = 200;
const memoria = new Map<string, { valor: Promise<unknown>; hasta: number }>();

export async function recordar<T>(claveDelModulo: string, ms: number, calcular: () => Promise<T>): Promise<T> {
  // La clave lleva el contrato: el tablero de un contrato no puede mostrar lo recordado de otro.
  const clave = `${await idDelContrato()}|${claveDelModulo}`;
  const ahora = Date.now();
  const guardada = memoria.get(clave);
  if (guardada && guardada.hasta > ahora) return guardada.valor as Promise<T>;

  // Sin tope, una instancia de larga vida acumularía una entrada por persona y por módulo.
  if (memoria.size >= MAXIMO_DE_ENTRADAS) memoria.clear();

  const valor = calcular();
  memoria.set(clave, { valor, hasta: ahora + ms });
  // Un fallo NO se recuerda: una caída pasajera no puede dejar el tablero roto un minuto.
  valor.catch(() => {
    if (memoria.get(clave)?.valor === valor) memoria.delete(clave);
  });
  return await valor;
}

/** Descarta todo lo recordado: la próxima vez que se abra el panel se lee de nuevo. */
export function olvidarDashboard(): void {
  memoria.clear();
}

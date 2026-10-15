// La validación de los datos de un vehículo. Pura y sin "server-only": la usan el formulario, para
// avisar al salir de cada campo, y el servidor, para hacerla cumplir. El servidor nunca le cree
// al navegador.
//
// Los controles y las reglas de cada tipo de campo (texto, número, fecha, lista) son los de
// acreditacion-validacion.ts; acá solo está lo propio de un vehículo: la patente y el chasis.

import { hoyEnChile } from "./acreditacion-modelo";
import { analizarCampo, limpiarTexto, type ErrorDeCampo, type Resultado } from "./acreditacion-validacion";
import { CAMPOS_DE_VEHICULO, normalizarPatente, patenteEsValida, formatearPatente } from "./vehiculos-modelo";

const bien = (valor: string | null): Resultado => ({ valor, error: null });
const mal = (error: string): Resultado => ({ valor: null, error });

/**
 * La patente: la llave de la ficha, que se guarda normalizada («ABCD12»).
 *
 * Es la llave igual que el RUT lo es de una persona: una mal tipeada crea un vehículo que nadie
 * encuentra después ni sabe que está duplicado. Por eso se valida la FORMA antes de guardarla.
 */
export function analizarPatente(crudo: string): Resultado {
  const texto = crudo.trim();
  if (!texto) return mal("Falta la patente.");

  // Solo letras, números y los separadores que se escriben a mano. Otra cosa no es una patente.
  if (!/^[A-Za-z0-9\s.\-]+$/.test(texto)) {
    return mal("La patente solo lleva letras y números (por ejemplo BCDF-12).");
  }

  const patente = normalizarPatente(texto);
  if (!patenteEsValida(patente)) {
    return mal("No parece una patente chilena: son 4 letras y 2 números (BCDF-12), o 2 letras y 4 números (AB-1234).");
  }
  // Una patente con la «O» o la «I» donde va un cero o un uno es lo que más se cuela. En la
  // parte de números no hay letras posibles, así que si llegó hasta acá la forma ya es correcta.
  return bien(patente);
}

/** El número de chasis (VIN): opcional, pero si se escribe tiene que parecerlo. */
export function analizarVin(crudo: string): Resultado {
  const texto = limpiarTexto(crudo).toUpperCase().replace(/\s+/g, "");
  if (!texto) return bien(null);
  if (!/^[A-Z0-9]+$/.test(texto)) return mal("N.º de chasis (VIN): solo letras y números.");
  if (texto.length < 10 || texto.length > 20) {
    return mal("N.º de chasis (VIN): suele tener 17 caracteres (revisa que esté completo).");
  }
  return bien(texto);
}

/**
 * Valida todos los datos de un vehículo y devuelve los normalizados.
 *
 * Un valor que NO cambió respecto de lo guardado se acepta tal cual, aunque ya no cumpla la regla:
 * una ficha cargada antes de una regla nueva no puede quedar bloqueada por algo que alguien
 * escribió hace meses. Se exige lo nuevo, no lo viejo.
 */
export function analizarDatosDeVehiculo(
  crudos: Record<string, string | null | undefined>,
  anteriores: Record<string, string | null | undefined>,
  hoy: string = hoyEnChile(),
): { datos: Record<string, string | null>; errores: ErrorDeCampo[] } {
  const datos: Record<string, string | null> = {};
  const errores: ErrorDeCampo[] = [];

  const cambio = (campo: string) => limpiarTexto(crudos[campo] ?? "") !== limpiarTexto(anteriores[campo] ?? "");

  for (const c of CAMPOS_DE_VEHICULO) {
    if (!(c.campo in crudos)) continue;

    if (!cambio(c.campo)) {
      datos[c.campo] = limpiarTexto(anteriores[c.campo] ?? "") || null;
      continue;
    }

    const crudo = crudos[c.campo] ?? "";
    const r = c.campo === "vin" ? analizarVin(crudo) : analizarCampo(c, crudo, { hoy, valores: datos });
    if (r.error) errores.push({ campo: c.campo, etiqueta: c.etiqueta, mensaje: r.error });
    datos[c.campo] = r.valor;
  }

  return { datos, errores };
}

export { formatearPatente };

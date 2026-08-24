import type { OfertaCanonica } from "./tipos";

/**
 * De las dos lecturas planas a la oferta canónica.
 *
 * Este archivo existe por una restricción del esquema de salida, y esa restricción
 * terminó dictando la forma de la lectura entera. Un esquema se compila a una
 * gramática, y la API la rechaza cuando se pasa de grande. El camino hasta acá
 * fueron tres rechazos, cada uno arreglando el anterior:
 *
 *  1. Cada campo ausente como `["string","null"]` y cada sección como `anyOf`
 *     contra null: 35 tipos unión, y el tope son 16.
 *  2. Cambiar eso por propiedades opcionales: 19 claves que pueden estar o no,
 *     así que la gramática tiene que admitir todas sus combinaciones — "Schema is
 *     too complex".
 *  3. Todo obligatorio y de un solo tipo, pero un único esquema anidado de 18
 *     objetos y 67 propiedades: "The compiled grammar is too large".
 *
 * La conclusión, y el motivo de este archivo: **el esquema tiene que ser chico y
 * plano, y armar la estructura es trabajo del servidor.** La lectura se parte en
 * dos —la letra y los números— con un esquema plano cada una, y acá se juntan en
 * la forma que el resto del módulo ya sabe tratar.
 *
 * Es la misma línea que gobierna todo el módulo, un paso más allá: el modelo
 * transcribe, el servidor calcula. Ahora también el servidor estructura.
 *
 * Sin "server-only": es una transformación pura y se prueba con tsx.
 */

/** La parte narrativa del borrador, tal como la devuelve el modelo: plana. */
export interface LecturaLetra {
  titulo: string;
  numeroOferta: string;
  fecha: string;
  validez: string;
  cliente: string;
  atencion: string;
  copia: string;
  referencia: string;
  faena: string;
  alcanceIntroduccion: string;
  alcanceActividades: string[];
  alcanceTrabajosPrevios: string[];
  metodologiaAntes: string[];
  metodologiaDurante: string[];
  especificaciones: { parametro: string; especificacion: string }[];
  condicionesComerciales: string[];
  aportesPertec: string[];
  aportesCliente: string[];
  cierreTexto: string;
  firmantes: { nombre: string; cargo: string; empresa: string }[];
  cierreCc: string;
  anexoRespaldos: string[];
  anexoMandantes: string[];
  anexoNotaEquipo: string;
  porConfirmar: string[];
  omitidas: string[];
}

/** Los cuadros con cifras: lo único sobre lo que el servidor calcula. */
export interface LecturaNumeros {
  personalEspecialista: { cargo: string; dotacion: number }[];
  cuadroPersonal: { cargo: string; dotacion: number; regimen: string }[];
  responsabilidades: { cargo: string; descripcion: string }[];
  organizacionNota: string;
  programaIntroduccion: string;
  turnos: { turno: string; jornada: string; horas: number }[];
  programaNota: string;
  lineasPrecio: {
    cantidad: number;
    cargo: string;
    unidad: string;
    valorUnitario: number;
    valorTotalImpreso: number;
  }[];
  totalNetoImpreso: number;
  precioNota: string;
  porConfirmar: string[];
}

/** El texto, o null si vino en blanco. El esquema no admite nullables. */
const texto = (valor: unknown): string | null => {
  const s = typeof valor === "string" ? valor.trim() : "";
  return s === "" ? null : s;
};

/**
 * La cantidad de una línea de precio.
 *
 * Muchas tablas de precio no traen columna de cantidad —"Ítem | Cargo | Unidad |
 * Precio"— y ahí cada línea es una unidad de lo que dice: el total de la línea es
 * su precio. El modelo, con la instrucción de no inventar, devolvía 0, y el
 * servidor multiplicaba 0 × precio: una oferta de cien millones daba un total
 * calculado de $ 0.
 *
 * Una cantidad de 0 no significa nada en una oferta —una línea que no se cobra no
 * es una línea— así que tomarla como 1 es la lectura correcta, no un parche. Y se
 * anota en "porConfirmar", porque quien revisa tiene que poder verlo.
 */
const cantidadDe = (valor: unknown): number => (typeof valor === "number" && valor > 0 ? valor : 1);

/** El número, o null si vino en 0: así dice el esquema "no está impreso". */
const numero = (valor: unknown): number | null => (typeof valor === "number" && valor !== 0 ? valor : null);

const lista = (valor: unknown): string[] =>
  Array.isArray(valor) ? valor.filter((x): x is string => typeof x === "string" && x.trim() !== "") : [];

const filas = <T>(valor: unknown): T[] => (Array.isArray(valor) ? (valor as T[]) : []);

/**
 * ¿La sección tiene algún dato, o vino vacía porque no aplica?
 *
 * Un 0 no cuenta: es el valor con que el modelo dice "no viene", y una sección real
 * siempre trae además una lista o un texto.
 */
function tieneContenido(valor: unknown): boolean {
  if (valor === null || valor === undefined) return false;
  if (typeof valor === "string") return valor.trim() !== "";
  if (typeof valor === "number") return valor !== 0;
  if (typeof valor === "boolean") return valor;
  if (Array.isArray(valor)) return valor.some(tieneContenido);
  if (typeof valor === "object") return Object.values(valor).some(tieneContenido);
  return true;
}

/** Devuelve la sección, o null si está vacía: una sección vacía no aplica. */
function seccion<T>(armada: T): T | null {
  return tieneContenido(armada) ? armada : null;
}

/** ¿Ninguna línea trajo cantidad? Entonces la tabla no tenía esa columna. */
function sinCantidad(numeros: LecturaNumeros): boolean {
  const lineas = filas<LecturaNumeros["lineasPrecio"][number]>(numeros.lineasPrecio);
  return lineas.length > 0 && lineas.every((l) => !(typeof l.cantidad === "number" && l.cantidad > 0));
}

export function armarOferta(letra: LecturaLetra, numeros: LecturaNumeros): OfertaCanonica {
  const especificaciones = filas<{ parametro: string; especificacion: string }>(
    letra.especificaciones,
  ).filter((e) => (e?.parametro ?? "").trim() !== "");

  const condiciones = lista(letra.condicionesComerciales);

  return {
    titulo: texto(letra.titulo) ?? "OFERTA SIN TÍTULO",
    identificacion: {
      numeroOferta: texto(letra.numeroOferta),
      fecha: texto(letra.fecha),
      validez: texto(letra.validez),
      cliente: texto(letra.cliente),
      atencion: texto(letra.atencion),
      copia: texto(letra.copia),
      referencia: texto(letra.referencia),
      faena: texto(letra.faena),
    },

    alcance: seccion({
      introduccion: texto(letra.alcanceIntroduccion),
      actividades: lista(letra.alcanceActividades),
      trabajosPrevios: lista(letra.alcanceTrabajosPrevios),
      // El personal especialista de la sección 2.3 se lee con los números, no con
      // la letra: es un cuadro con dotaciones y el servidor lo suma.
      personalEspecialista: filas<{ cargo: string; dotacion: number }>(numeros.personalEspecialista),
    }),

    metodologia: seccion({
      antesDeLaDetencion: lista(letra.metodologiaAntes),
      duranteLaDetencion: lista(letra.metodologiaDurante),
    }),

    especificaciones: especificaciones.length > 0 ? especificaciones : null,

    organizacion: seccion({
      cuadroPersonal: filas<{ cargo: string; dotacion: number; regimen: string }>(numeros.cuadroPersonal),
      responsabilidades: filas<{ cargo: string; descripcion: string }>(numeros.responsabilidades).filter(
        (r) => (r?.cargo ?? "").trim() !== "",
      ),
      nota: texto(numeros.organizacionNota),
    }),

    programa: seccion({
      introduccion: texto(numeros.programaIntroduccion),
      turnos: filas<{ turno: string; jornada: string; horas: number }>(numeros.turnos),
      nota: texto(numeros.programaNota),
    }),

    precio: seccion({
      lineas: filas<LecturaNumeros["lineasPrecio"][number]>(numeros.lineasPrecio).map((l) => ({
        cantidad: cantidadDe(l.cantidad),
        cargo: l.cargo,
        unidad: l.unidad,
        valorUnitario: l.valorUnitario,
        // Un total en 0 es "no está impreso", no un total de cero pesos. Tratarlo
        // como impreso daría el aviso falso "el documento imprime $ 0 pero
        // 1 × $ 15.885.200 da $ 15.885.200".
        valorTotalImpreso: numero(l.valorTotalImpreso),
      })),
      totalNetoImpreso: numero(numeros.totalNetoImpreso),
      nota: texto(numeros.precioNota),
    }),

    condicionesComerciales: condiciones.length > 0 ? condiciones : null,

    aportes: seccion({
      pertec: lista(letra.aportesPertec),
      cliente: lista(letra.aportesCliente),
    }),

    cierre: seccion({
      texto: texto(letra.cierreTexto),
      firmantes: filas<{ nombre: string; cargo: string; empresa: string }>(letra.firmantes)
        .filter((f) => (f?.nombre ?? "").trim() !== "")
        .map((f) => ({ nombre: f.nombre, cargo: f.cargo, empresa: texto(f.empresa) })),
      cc: texto(letra.cierreCc),
    }),

    anexo: seccion({
      respaldoInstitucional: lista(letra.anexoRespaldos),
      mandantes: lista(letra.anexoMandantes),
      notaEquipo: texto(letra.anexoNotaEquipo),
    }),

    // Las dos lecturas ven el mismo documento y cada una nombra lo que le faltó:
    // van juntas y sin repetidos. Y se suma lo que el servidor tuvo que asumir,
    // que es tan revisable como lo que faltó.
    porConfirmar: [
      ...new Set([
        ...lista(letra.porConfirmar),
        ...lista(numeros.porConfirmar),
        ...(sinCantidad(numeros)
          ? [
              "La tabla de precios no trae columna de cantidad: se tomó 1 por línea, " +
                "así que el total de cada línea es su precio.",
            ]
          : []),
      ]),
    ],

    // El motivo viene como una frase sola ("Precio: el borrador no trae tabla"),
    // porque un objeto más en el esquema es gramática que no hace falta.
    omitidas: lista(letra.omitidas).map((linea) => {
      const corte = linea.indexOf(":");
      return corte > 0
        ? { seccion: linea.slice(0, corte).trim(), motivo: linea.slice(corte + 1).trim() }
        : { seccion: linea.trim(), motivo: "" };
    }),
  };
}

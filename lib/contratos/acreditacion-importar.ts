// Lee la tabla que alguien copia desde Excel (o un CSV) para dar de alta varias
// personas de una vez. Sin "server-only": el formulario lo usa para mostrar cuántas
// filas detectó, y el servidor lo vuelve a correr — el servidor no le cree al
// navegador lo que leyó.

export interface FilaImportada {
  /** El número de línea en lo pegado, para decir "la línea 7 tiene un problema". */
  linea: number;
  nombre: string;
  rut: string;
  cargo: string;
  faena: string;
  turno: string;
}

/** El máximo por importación. Una lista más larga casi seguro es un error de pegado. */
export const MAXIMO_IMPORTACION = 300;

type Columna = keyof Omit<FilaImportada, "linea">;

const ORDEN_SIN_ENCABEZADO: Columna[] = ["nombre", "rut", "cargo", "faena", "turno"];

/** Sin acentos, mayúsculas ni signos: "Nombre Completo" y "nombre_completo" coinciden. */
export function comparable(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const ENCABEZADOS: Record<string, Columna> = {
  nombre: "nombre",
  "nombre completo": "nombre",
  trabajador: "nombre",
  rut: "rut",
  cargo: "cargo",
  faena: "faena",
  turno: "turno",
};

/**
 * El separador, mirando la primera línea con contenido.
 *
 * Excel copia con tabulaciones; un CSV chileno suele venir con punto y coma
 * (porque la coma es el separador decimal); uno internacional, con coma. Se elige
 * el que más aparece, y la tabulación gana los empates porque es lo más común.
 */
function detectarSeparador(linea: string): string {
  const cuentas: [string, number][] = [
    ["\t", linea.split("\t").length - 1],
    [";", linea.split(";").length - 1],
    [",", linea.split(",").length - 1],
  ];
  cuentas.sort((a, b) => b[1] - a[1]);
  return cuentas[0][1] > 0 ? cuentas[0][0] : "\t";
}

/** Parte una línea respetando las comillas ("Pérez, Juan" no se parte por la coma). */
function partirLinea(linea: string, separador: string): string[] {
  const celdas: string[] = [];
  let actual = "";
  let entreComillas = false;

  for (let i = 0; i < linea.length; i++) {
    const c = linea[i];
    if (c === '"') {
      if (entreComillas && linea[i + 1] === '"') {
        actual += '"';
        i++;
      } else {
        entreComillas = !entreComillas;
      }
    } else if (c === separador && !entreComillas) {
      celdas.push(actual);
      actual = "";
    } else {
      actual += c;
    }
  }
  celdas.push(actual);
  return celdas.map((c) => c.trim());
}

export function leerTabla(texto: string): { filas: FilaImportada[]; aviso: string | null } {
  const lineas = texto
    .replace(/^﻿/, "")
    .split(/\r?\n/)
    .map((contenido, i) => ({ contenido, linea: i + 1 }))
    .filter((l) => l.contenido.trim() !== "");

  if (lineas.length === 0) return { filas: [], aviso: null };

  const separador = detectarSeparador(lineas[0].contenido);
  const tabla = lineas.map((l) => ({ linea: l.linea, celdas: partirLinea(l.contenido, separador) }));

  // ¿La primera fila es un encabezado? Si al menos "nombre" o "rut" aparece como
  // título de columna, se usa para saber qué es cada columna: así importa igual si
  // alguien las tiene en otro orden o con columnas de más.
  const primera = tabla[0].celdas.map((c) => ENCABEZADOS[comparable(c)]);
  const tieneEncabezado = primera.includes("nombre") || primera.includes("rut");

  let orden: (Columna | undefined)[];
  let cuerpo = tabla;
  let aviso: string | null = null;

  if (tieneEncabezado) {
    orden = primera;
    cuerpo = tabla.slice(1);
  } else {
    orden = ORDEN_SIN_ENCABEZADO;
    aviso = "No encontré fila de títulos: asumí el orden Nombre, RUT, Cargo, Faena, Turno.";
  }

  const filas = cuerpo.map(({ linea, celdas }) => {
    const fila: FilaImportada = { linea, nombre: "", rut: "", cargo: "", faena: "", turno: "" };
    orden.forEach((columna, i) => {
      if (columna) fila[columna] = (celdas[i] ?? "").trim();
    });
    return fila;
  });

  return { filas, aviso };
}

// -----------------------------------------------------------------------------
//  Lo que devuelve la revisión: vive acá y no en el archivo de las acciones,
//  porque un archivo "use server" solo puede exportar funciones asíncronas.
// -----------------------------------------------------------------------------

export interface FilaRevisada extends FilaImportada {
  estado: "ok" | "error";
  mensaje: string | null;
  /** El cargo ya resuelto, si coincidió con uno existente. */
  cargoId: string | null;
  /** El RUT normalizado, si es válido. */
  rutNormalizado: string | null;
}

export interface RevisionDeImportacion {
  filas: FilaRevisada[];
  aviso: string | null;
  /** Un problema que impide revisar todo (lista vacía, demasiado larga). */
  error: string | null;
}

export interface ResultadoDeImportacion {
  creadas: number;
  /** Las que no se pudieron crear, con el motivo. */
  fallidas: { linea: number; nombre: string; mensaje: string }[];
  /** Personas creadas cuya carpeta en SharePoint todavía no existe (se crea al subir su primer documento). */
  carpetasPendientes: number;
  error: string | null;
}

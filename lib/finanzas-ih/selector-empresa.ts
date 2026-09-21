// Elegir una empresa en el selector del portal MIPYME del SII.
//
// Sin "server-only" y sin Playwright: es la parte del asunto que se puede
// decidir mirando datos, así que vive acá y scripts/probar-selector-empresa.mts
// la mide sin levantar un navegador. Lo que queda en sii-guias-ih.ts es el IO:
// abrir la página, esperar el combo, hacer el submit.
//
// ── Por qué existe ──────────────────────────────────────────────────────────
//
// El 21-09-2026 la sincronización de Facturas IH murió con:
//
//   No se encontro la empresa 77031094-6 en el selector del SII.
//
// y era mentira: la empresa estaba. Lo que pasó es que la página del SII
// todavía no había pintado el <select>, el código leyó una lista vacía, y el
// único error que sabía lanzar era ese. Dos situaciones muy distintas —el SII
// lento, que se arregla solo, y una cuenta que de verdad no representa a esa
// empresa, que hay que ir a arreglar— daban el mismo mensaje, y el equivocado.

export interface OpcionDeEmpresa {
  value: string;
  text: string;
}

export type ResultadoSeleccion =
  | { estado: "elegida"; opcion: OpcionDeEmpresa }
  /** La página no trajo el combo. Transitorio: la corrida siguiente suele andar. */
  | { estado: "sin_selector"; mensaje: string }
  /** El combo vino, pero esa empresa no está. Es configuración, no el SII. */
  | { estado: "no_esta"; mensaje: string };

/** Solo dígitos y el verificador, para comparar "77.031.094-6" con "770310946". */
function soloIdentificador(texto: string): string {
  return texto.toUpperCase().replace(/[^0-9K]/g, "");
}

/**
 * Cuál de las opciones del selector es la empresa que se busca.
 *
 * El match es por RUT y no por nombre: los nombres del selector del SII vienen
 * con la razón social completa y a veces abreviada, y ya hubo dos empresas del
 * grupo con nombres parecidos. El RUT es único y no se abrevia.
 *
 * Con UNA sola opción se toma esa aunque no calce el RUT: el SII a veces
 * devuelve el selector con la única empresa que la cuenta representa y sin el
 * RUT en el rótulo. Es el comportamiento que ya tenía y se conserva a
 * propósito — pero solo cuando hay una, nunca eligiendo la primera de varias.
 */
export function elegirEmpresa(opciones: OpcionDeEmpresa[], rutEmpresa: string): ResultadoSeleccion {
  if (opciones.length === 0) {
    return {
      estado: "sin_selector",
      mensaje:
        "El SII no mostró el selector de empresa (la página respondió sin el combo). " +
        "Es intermitente: suele resolverse en la corrida siguiente.",
    };
  }

  const buscado = soloIdentificador(rutEmpresa);
  const porRut = opciones.find((o) => soloIdentificador(o.text).includes(buscado));
  if (porRut) return { estado: "elegida", opcion: porRut };

  if (opciones.length === 1) return { estado: "elegida", opcion: opciones[0] };

  return {
    estado: "no_esta",
    mensaje:
      `La empresa ${rutEmpresa} no está entre las que puede representar esta cuenta del SII. ` +
      // Se listan las que SÍ ofreció: sin esto, diagnosticar esto obliga a
      // entrar al SII a mano para ver qué había del otro lado.
      `El selector ofreció: ${opciones.map((o) => o.text).join(" | ")}.`,
  };
}

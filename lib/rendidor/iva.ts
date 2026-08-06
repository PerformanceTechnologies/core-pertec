// Reglas de determinación del IVA — portadas literal del PASO 2 de la skill
// rendidor-gastos, donde son "el corazón de la corrección".
//
// Sin "server-only": la UI las usa para mostrar el desglose en vivo mientras el
// rendidor corrige, con exactamente el mismo resultado que al cargar a Odoo.

import { TRATAMIENTO_DOCUMENTO, type GastoRendicion, type TipoDocumento } from "./tipos";

// El impuesto IVA 19% de compra depende de la EMPRESA: el id 2 pertenece a la
// company 1 (PERFORMANCE TECHNOLOGIES SPA). Para PERFORMANCE SERVICE SPA
// (company 2) el IVA 19% es el impuesto 29, no el 2. Cargar el id equivocado
// deja el gasto con el impuesto de otra empresa.
const IVA_19_POR_COMPANY: Record<number, number> = {
  1: 2,
  2: 29,
};

export function idImpuestoIva19(companyId: number): number {
  const id = IVA_19_POR_COMPANY[companyId];
  if (!id) {
    throw new Error(
      `No se conoce el id del IVA 19% de compra para la company ${companyId}. ` +
        "Verificar en Odoo (account.tax, type_tax_use: purchase) antes de cargar.",
    );
  }
  return id;
}

// tax_ids va con sintaxis de comando many2many [[6, 0, [ids]]], no como lista
// plana. El comando 6 (replace) es explícito y deja el campo exactamente como
// se quiere, incluido el caso vacío de los exentos.
export function taxIdsParaGasto(afecto: boolean, companyId: number): [[number, number, number[]]] {
  return [[6, 0, afecto ? [idImpuestoIva19(companyId)] : []]];
}

export interface DesgloseIva {
  neto: number;
  iva: number;
  total: number;
  afecto: boolean;
  // Se llena cuando el desglose impreso no cuadra con el total impreso, o
  // cuando hubo que asumir el default del tipo de documento.
  advertencias: string[];
}

/**
 * Deriva neto e IVA para un gasto, en el orden de prioridad de la skill.
 *
 * @param total        El TOTAL A PAGAR impreso. Es el valor que manda siempre.
 * @param tipo         Tipo de documento (define el default de afectación).
 * @param netoLeido    Neto desglosado en el comprobante, si lo trae.
 * @param ivaLeido     IVA desglosado en el comprobante, si lo trae.
 * @param afectoForzado Para los casos que el tipo no resuelve (pasaje aéreo:
 *                     nacional afecto / internacional exento), una vez que el
 *                     usuario confirmó el tramo.
 */
export function calcularDesglose(
  total: number,
  tipo: TipoDocumento,
  netoLeido: number | null,
  ivaLeido: number | null,
  afectoForzado?: boolean,
): DesgloseIva {
  const advertencias: string[] = [];
  const tratamiento = TRATAMIENTO_DOCUMENTO[tipo];

  // Regla 4 y 7: si el tipo no define la afectación (pasaje aéreo) hace falta
  // que alguien confirme. No se adivina.
  let afecto: boolean;
  if (afectoForzado !== undefined) {
    afecto = afectoForzado;
  } else if (tratamiento.afecto === null) {
    throw new Error(
      `El tipo "${tipo}" no define la afectación por sí solo (${tratamiento.nota}). ` +
        "Hay que confirmarlo antes de calcular el IVA.",
    );
  } else {
    afecto = tratamiento.afecto;
  }

  // Regla 1: el documento impreso siempre manda. Si trae desglose explícito,
  // ese desglose gana sobre el default de la tabla.
  const traeDesglose = netoLeido !== null && ivaLeido !== null;

  if (traeDesglose) {
    // Un desglose con IVA > 0 prueba que el documento es afecto, aunque la
    // tabla dijera lo contrario. Y un IVA en 0 —una línea "VALOR EXENTO" / "NO
    // AFECTO"— prueba lo inverso: es la regla 1 de la skill, el documento manda.
    const afectoSegunDocumento = ivaLeido > 0;

    if (afectoSegunDocumento !== afecto) {
      // Única excepción: los tipos donde el criterio de la casa reconoce el IVA
      // pase lo que diga el documento. Un pasaje aéreo viene en factura exenta y
      // aun así se le reconoce el IVA incluido, así que la leyenda no lo puede
      // dejar sin IVA — se avisa y se sigue con el criterio de la casa.
      if (!afectoSegunDocumento && tratamiento.ivaSiempre) {
        advertencias.push(
          `El comprobante se declara exento, pero un ${tratamiento.etiqueta.toLowerCase()} se reconoce ` +
            "afecto igual: el IVA se calcula desde el total impreso.",
        );
        // El desglose leído no sirve: el IVA se saca del total más abajo.
        const neto = Math.round(total / 1.19);
        return { neto, iva: total - neto, total, afecto: true, advertencias };
      }

      advertencias.push(
        afectoSegunDocumento
          ? "El comprobante desglosa IVA pero el tipo de documento se trata como exento por defecto: se respeta el documento."
          : "El comprobante se declara exento o no afecto, aunque el tipo se trate como afecto por defecto: se respeta el documento.",
      );
      afecto = afectoSegunDocumento;
    }

    // Regla 2: verificar que neto + IVA = total impreso. Si no calzan, el TOTAL
    // IMPRESO es el valor de carga.
    //
    // El neto absorbe SIEMPRE la diferencia (se conserva el IVA leído, que es
    // el dato que el SII exige exacto), para que neto + IVA sume el total
    // impreso en todos los casos. Lo que cambia según el tamaño de la
    // diferencia es solo si se avisa: hasta 2 pesos es el redondeo normal del
    // documento y no vale la pena molestar a nadie; por encima de eso suele ser
    // una propina o un cargo no afecto y hay que revisarlo.
    const suma = netoLeido + ivaLeido;
    const diferencia = total - suma;
    const TOLERANCIA_REDONDEO = 2;

    if (Math.abs(diferencia) > TOLERANCIA_REDONDEO) {
      advertencias.push(
        `El desglose leído (neto ${netoLeido} + IVA ${ivaLeido} = ${suma}) no cuadra con el total impreso ${total}; ` +
          `diferencia de ${diferencia}. Se usa el total impreso. Puede ser propina o un cargo no afecto.`,
      );
    }

    return { neto: total - ivaLeido, iva: ivaLeido, total, afecto, advertencias };
  }

  // Regla 3: sin desglose, se aplica el default del tipo.
  if (!afecto) {
    return { neto: total, iva: 0, total, afecto: false, advertencias };
  }

  // El total impreso YA incluye el IVA, así que el neto se saca HACIA ATRÁS y el
  // IVA solo se separa para mostrarlo. Nunca hacia arriba: agregar el 19% sobre
  // un monto que ya lo trae inflaría la rendición y el reembolso.
  //
  // Vale también para el pasaje aéreo, aunque LATAM lo emita como factura exenta:
  // el criterio es reconocer el IVA que ya viene dentro del monto pagado.
  const neto = Math.round(total / 1.19);
  return { neto, iva: total - neto, total, afecto: true, advertencias };
}

/**
 * El desglose de un gasto de la rendición, con los argumentos ya armados.
 *
 * ÚNICA puerta de entrada a calcularDesglose desde la aplicación. Existe porque
 * las tres piezas que necesitan el desglose —la tabla de revisión, el preview de
 * Odoo y la planilla Excel— repetían este mismo armado, y una se quedó atrás: la
 * planilla escribía `gasto.neto` y `gasto.iva` crudos, que en el caso normal (una
 * boleta que no desglosa nada) son 0. El resultado era un resumen tributario en
 * cero y toda la rendición contada como exenta.
 *
 * Devuelve null si todavía no hay con qué calcular (sin tipo de documento o sin
 * total), que es el estado normal de una fila recién leída y a medio corregir.
 * Puede lanzar si el tipo no define la afectación por sí solo; quien llama decide
 * si eso es un error o una advertencia en pantalla.
 */
export function desgloseDeGasto(
  gasto: Pick<GastoRendicion, "total" | "tipoDocumento" | "neto" | "iva" | "ivaDesglosado">,
): DesgloseIva | null {
  if (!gasto.tipoDocumento || gasto.total <= 0) return null;

  const tratamiento = TRATAMIENTO_DOCUMENTO[gasto.tipoDocumento];

  // ¿El DOCUMENTO declaró el desglose? Es la pregunta que activa la regla 1, y
  // no es lo mismo que "el IVA es mayor que cero": un comprobante con una línea
  // "VALOR EXENTO" declara un desglose cuyo IVA es 0, y eso es evidencia de que
  // es exento — muy distinto de una boleta que no dice nada, donde recién ahí se
  // aplica el default del tipo.
  //
  // Los gastos guardados antes de que existiera la bandera caen al criterio
  // viejo, que es lo mejor que se puede inferir de un iva sin contexto.
  const traeDesglose = gasto.ivaDesglosado ?? gasto.iva > 0;

  return calcularDesglose(
    gasto.total,
    gasto.tipoDocumento,
    traeDesglose ? gasto.neto : null,
    traeDesglose ? gasto.iva : null,
    tratamiento.afecto === null ? gasto.iva > 0 : undefined,
  );
}

/**
 * Valida un RUT chileno con el dígito verificador (módulo 11).
 *
 * Odoo tiene esta misma validación en su localización chilena, pero del otro
 * lado: crear un res.partner con un RUT malo devuelve un ValidationError con
 * traceback completo, después de que ya se crearon los gastos anteriores de la
 * tanda. Validar acá convierte eso en un aviso de una línea antes de escribir
 * nada.
 *
 * Acepta con o sin puntos, con guion o sin él, y K o k como verificador.
 */
export function rutValido(rut: string): boolean {
  const limpio = rut.replace(/[.\s-]/g, "").toUpperCase();
  // 7 dígitos + verificador es el mínimo razonable (RUTs de empresa y de
  // persona adulta); por debajo casi siempre es un folio mal leído.
  if (!/^\d{7,8}[\dK]$/.test(limpio)) return false;

  const cuerpo = limpio.slice(0, -1);
  const verificador = limpio.slice(-1);

  // Módulo 11: se recorre el cuerpo de derecha a izquierda con multiplicadores
  // ciclicos 2..7.
  let suma = 0;
  let multiplicador = 2;
  for (let i = cuerpo.length - 1; i >= 0; i--) {
    suma += Number(cuerpo[i]) * multiplicador;
    multiplicador = multiplicador === 7 ? 2 : multiplicador + 1;
  }

  const resto = 11 - (suma % 11);
  const esperado = resto === 11 ? "0" : resto === 10 ? "K" : String(resto);

  return verificador === esperado;
}

// Normaliza un RUT a 12345678-9 (sin puntos ni espacios) para poder buscarlo en
// Odoo, que lo guarda con formato inconsistente. Devuelve ambas formas porque
// hay registros como "77768291-1" y otros como "83.547.100-4".
export function formasDeRut(rut: string): { sinPuntos: string; conPuntos: string; cuerpo: string } {
  const limpio = rut.replace(/[.\s]/g, "").toUpperCase();
  const [cuerpo, dv] = limpio.includes("-") ? limpio.split("-") : [limpio.slice(0, -1), limpio.slice(-1)];

  // Formato con puntos, agrupando de 3 en 3 desde la derecha
  const conPuntos = cuerpo.replace(/\B(?=(\d{3})+(?!\d))/g, ".");

  return {
    sinPuntos: `${cuerpo}-${dv}`,
    conPuntos: `${conPuntos}-${dv}`,
    cuerpo,
  };
}

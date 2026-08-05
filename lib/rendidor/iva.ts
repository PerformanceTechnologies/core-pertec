// Reglas de determinación del IVA — portadas literal del PASO 2 de la skill
// rendidor-gastos, donde son "el corazón de la corrección".
//
// Sin "server-only": la UI las usa para mostrar el desglose en vivo mientras el
// rendidor corrige, con exactamente el mismo resultado que al cargar a Odoo.

import { TRATAMIENTO_DOCUMENTO, type TipoDocumento } from "./tipos";

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
    // tabla dijera lo contrario (y viceversa).
    const afectoSegunDocumento = ivaLeido > 0;
    if (afectoSegunDocumento !== afecto) {
      advertencias.push(
        afectoSegunDocumento
          ? "El comprobante desglosa IVA pero el tipo de documento se trata como exento por defecto: se respeta el documento."
          : "El comprobante no desglosa IVA pero el tipo se trata como afecto por defecto: se respeta el documento.",
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

  // Regla 3: sin desglose (boleta electrónica de consumo típica), se aplica el
  // default del tipo. Si es afecto se calcula HACIA ATRÁS desde el total:
  // nunca hacia arriba desde el neto, porque eso infla la rendición.
  if (!afecto) {
    return { neto: total, iva: 0, total, afecto: false, advertencias };
  }

  const neto = Math.round(total / 1.19);
  return { neto, iva: total - neto, total, afecto: true, advertencias };
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

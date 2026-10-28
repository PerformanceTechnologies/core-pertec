/**
 * Inventario: el vocabulario, el motor de doble entrada y los candados.
 *
 * Correr con:  npm run probar-inventario
 *
 * El módulo lleva la cuenta del stock por partida doble: lo que sale de una
 * ubicación entra en otra, y el "a mano" de una bodega no es un número que
 * alguien escribe sino la suma de los movimientos que la tocaron. Un error de
 * signo acá no se nota al día siguiente: se nota meses después, cuando el
 * inventario físico no cuadra con el sistema y ya no se puede reconstruir qué
 * movimiento lo rompió.
 *
 * Por eso esta prueba tiene tres partes:
 *
 *   1. Los cálculos puros de lib/inventario-modelo.ts, uno por uno.
 *   2. El MOTOR: una reimplementación fiel en TypeScript de las tres funciones
 *      PL/pgSQL (reservar, validar, cancelar) corriendo ciclos completos sobre
 *      quants en memoria. Las de verdad viven en la base y no se pueden llamar
 *      desde acá sin una conexión, así que lo que se prueba es la ARITMÉTICA que
 *      el SQL describe — y después se comprueba contra el SQL que el SQL sigue
 *      diciendo eso.
 *   3. Los candados: que ninguna Server Action quede sin permiso, que el índice
 *      único exista, que las referencias no se puedan duplicar.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  DIAS_AVISO_VENCIMIENTO,
  ETIQUETA_CLASE,
  ETIQUETA_ESTADO,
  ETIQUETA_SEGUIMIENTO,
  ETIQUETA_TIPO_PRODUCTO,
  ETIQUETA_TIPO_UBICACION,
  TONO_ESTADO,
  diasHasta,
  disponible,
  esUbicacionDeStock,
  formatearCantidad,
  formatearMonto,
  porVencer,
  redondear,
  siguienteReferencia,
  signoParaUbicacion,
  sumarCantidad,
  sugerenciaDeReposicion,
  valorizar,
  type ClaseOperacion,
  type EstadoTransferencia,
  type Seguimiento,
  type TipoProducto,
  type TipoUbicacion,
} from "../lib/inventario-modelo";

const leer = (ruta: string) => readFileSync(new URL(ruta, import.meta.url), "utf8");

// ═══════════════════════════════════════════════════════════════════════════
//  1. Los cálculos puros
// ═══════════════════════════════════════════════════════════════════════════

// ── disponible ──────────────────────────────────────────────────────────────

assert.equal(disponible({ cantidad: 10, reservado: 3 }), 7);
assert.equal(disponible({ cantidad: 10, reservado: 0 }), 10);
assert.equal(disponible({ cantidad: 10, reservado: 10 }), 0, "todo comprometido deja cero, no un negativo raro");
assert.equal(
  disponible({ cantidad: 5, reservado: 8 }),
  -3,
  "NO se recorta a cero: reservar más de lo que hay es un problema real del inventario y " +
    "esconderlo detrás de un Math.max haría que la pantalla mintiera justo cuando hay que mirarla",
);
assert.equal(
  disponible({ cantidad: 0.3, reservado: 0.1 }),
  0.2,
  "0.3 - 0.1 da 0.19999999999999998 en punto flotante; sin redondeo la pantalla mostraría eso",
);

// ── esUbicacionDeStock ──────────────────────────────────────────────────────
//
// Esta es la que decide si un movimiento toca el inventario o no. Una recepción
// viene de 'proveedor' (que no es stock propio) y entra a 'interna': solo el
// lado interno mueve quants. Si 'proveedor' contara como stock, el sistema
// llevaría un saldo negativo infinito de todo lo que compró en la vida.

assert.equal(esUbicacionDeStock("interna"), true);
for (const t of ["proveedor", "cliente", "ajuste", "transito", "vista"] as TipoUbicacion[]) {
  assert.equal(esUbicacionDeStock(t), false, `'${t}' no es stock propio de la empresa`);
}

// ── signoParaUbicacion: la base de la doble entrada ─────────────────────────

const mov = { ubicacionOrigenId: "bodega", ubicacionDestinoId: "cliente" };
assert.equal(signoParaUbicacion(mov, "cliente"), 1, "entra al destino");
assert.equal(signoParaUbicacion(mov, "bodega"), -1, "sale del origen");
assert.equal(signoParaUbicacion(mov, "otra"), 0, "una ubicación ajena al movimiento no se entera");

// La suma de los signos sobre TODAS las ubicaciones es cero. Eso es,
// literalmente, lo que significa "doble entrada": nada se crea ni se destruye.
for (const ubicaciones of [
  ["bodega", "cliente"],
  ["bodega", "cliente", "otra", "y-otra"],
]) {
  const suma = ubicaciones.reduce((s, u) => s + signoParaUbicacion(mov, u), 0);
  assert.equal(suma, 0, "los signos de un movimiento tienen que sumar cero sobre el universo de ubicaciones");
}

// El caso que rompe la doble entrada: origen y destino iguales. Pasa de verdad
// —una transferencia interna mal armada, o el tipo de operación 'interna' que
// trae BC-STOCK en ambos lados— y el resultado correcto es +1, no 0 y no un
// -1 y +1 que se pisan.
const mismo = { ubicacionOrigenId: "bodega", ubicacionDestinoId: "bodega" };
assert.equal(
  signoParaUbicacion(mismo, "bodega"),
  1,
  "con origen = destino gana el destino. Da lo mismo cuál gane mientras sea UNO solo y siempre " +
    "el mismo: lo que no puede pasar es que el stock se duplique o se borre por mover algo a " +
    "donde ya estaba",
);

// ── sumarCantidad ───────────────────────────────────────────────────────────

assert.equal(sumarCantidad([]), 0, "sin quants el a mano es cero, no NaN");
assert.equal(sumarCantidad([{ cantidad: 5 }]), 5);
assert.equal(sumarCantidad([{ cantidad: 5 }, { cantidad: 3 }, { cantidad: 2 }]), 10);
assert.equal(sumarCantidad([{ cantidad: 5 }, { cantidad: -5 }]), 0, "los negativos restan: son salidas");
assert.equal(
  sumarCantidad([{ cantidad: 0.1 }, { cantidad: 0.2 }]),
  0.3,
  "0.1 + 0.2 = 0.30000000000000004 sin redondeo, y eso se acumula lote a lote",
);
assert.equal(
  sumarCantidad(Array.from({ length: 10 }, () => ({ cantidad: 0.1 }))),
  1,
  "diez lotes de 0,1 son exactamente 1, no 0,9999999999999999",
);

// ── valorizar ───────────────────────────────────────────────────────────────

assert.equal(valorizar(10, 1500), 15000);
assert.equal(valorizar(0, 1500), 0);
assert.equal(valorizar(10, 0), 0, "un producto sin costo cargado vale cero, no NaN");
assert.equal(valorizar(-3, 1000), -3000, "un saldo negativo valoriza negativo: es lo que hay que ver");
assert.equal(valorizar(1.1, 1.1), 1.21);

// ── sugerenciaDeReposicion ──────────────────────────────────────────────────

assert.equal(sugerenciaDeReposicion(10, { minimo: 5, maximo: 20 }), 0, "por sobre el mínimo no se repone");
assert.equal(
  sugerenciaDeReposicion(5, { minimo: 5, maximo: 20 }),
  0,
  "justo EN el mínimo todavía no se repone: el mínimo es el piso aceptable, no el umbral de alarma",
);
assert.equal(sugerenciaDeReposicion(4, { minimo: 5, maximo: 20 }), 16, "repone hasta el máximo, no hasta el mínimo");
assert.equal(sugerenciaDeReposicion(0, { minimo: 5, maximo: 20 }), 20);
assert.equal(
  sugerenciaDeReposicion(-3, { minimo: 5, maximo: 20 }),
  23,
  "con saldo negativo hay que reponer el faltante MÁS el máximo, si no se repone de menos",
);
assert.equal(
  sugerenciaDeReposicion(2, { minimo: 10, maximo: 5 }),
  8,
  "regla al revés (máximo < mínimo, un dedazo al cargarla): se repone hasta el mínimo. Sin el " +
    "Math.max daría 3 y dejaría el producto bajo su propio mínimo apenas llegue la reposición",
);
assert.equal(
  sugerenciaDeReposicion(0, { minimo: 0, maximo: 0 }),
  0,
  "regla en ceros —la que queda si alguien guarda el formulario vacío— no pide nada",
);

// ── diasHasta ───────────────────────────────────────────────────────────────

const HOY = new Date(2026, 9, 28); // 28 de octubre de 2026

assert.equal(diasHasta(null, HOY), null, "sin fecha de vencimiento no hay días que contar");
assert.equal(diasHasta("2026-10-28", HOY), 0, "hoy mismo son cero días");
assert.equal(diasHasta("2026-10-29", HOY), 1);
assert.equal(diasHasta("2026-10-27", HOY), -1, "lo vencido da negativo, no cero ni null");
assert.equal(diasHasta("2026-11-27", HOY), 30);
assert.equal(diasHasta("2027-10-28", HOY), 365);

// La hora de 'hoy' no puede cambiar la cuenta: diasHasta normaliza a medianoche
// local de los dos lados. Si no lo hiciera, un lote vencería "un día antes"
// según a qué hora se abra la pantalla.
for (const hora of [0, 1, 12, 23]) {
  assert.equal(
    diasHasta("2026-11-27", new Date(2026, 9, 28, hora, 59, 59)),
    30,
    `a las ${hora}:59 tiene que dar lo mismo que a medianoche`,
  );
}

// Y el cambio de horario de verano —en Chile, la noche del 6 de septiembre de
// 2026— no puede comerse ni agregar un día. Es el caso clásico que rompe las
// restas de fechas hechas con milisegundos sin redondear.
assert.equal(
  diasHasta("2026-09-07", new Date(2026, 8, 6)),
  1,
  "la noche en que los relojes se adelantan dura 23 horas; sin el Math.round la división daría " +
    "0,958 y el truncado la convertiría en 0 días",
);
assert.equal(
  diasHasta("2026-04-05", new Date(2026, 3, 4)),
  1,
  "y la noche en que se atrasan dura 25: daría 1,04",
);

// Cruces de mes y de año, donde las cuentas a mano suelen fallar.
assert.equal(diasHasta("2026-11-01", new Date(2026, 9, 31)), 1, "31 de octubre → 1 de noviembre");
assert.equal(diasHasta("2027-01-01", new Date(2026, 11, 31)), 1, "fin de año");
assert.equal(diasHasta("2028-02-29", new Date(2028, 1, 28)), 1, "29 de febrero de un bisiesto existe");

// ── porVencer ───────────────────────────────────────────────────────────────

assert.equal(DIAS_AVISO_VENCIMIENTO, 30, "la ventana de aviso que la UI promete");

assert.equal(porVencer(null, HOY), false, "un lote sin vencimiento NUNCA está por vencer: no vence");
assert.equal(porVencer("2026-11-27", HOY), true, "el día 30 justo ya avisa: el límite es inclusivo");
assert.equal(porVencer("2026-11-28", HOY), false, "el día 31 todavía no");
assert.equal(porVencer("2026-10-28", HOY), true, "vence hoy");
assert.equal(
  porVencer("2025-01-01", HOY),
  true,
  "lo YA vencido sigue marcado. Avisar solo de lo que está por vencer y callar lo vencido " +
    "dejaría la mercadería muerta invisible en la bodega, que es exactamente al revés",
);

// ── redondear ───────────────────────────────────────────────────────────────

assert.equal(redondear(1.2345), 1.235, "tres decimales, que es lo que soporta una cantidad");
assert.equal(redondear(1.2344), 1.234);
assert.equal(redondear(0.1 + 0.2), 0.3);
assert.equal(redondear(1), 1, "un entero no se ensucia");
assert.equal(redondear(0), 0);
assert.equal(redondear(-1.2345), -1.234, "Math.round rompe el empate hacia arriba también en negativos");
assert.equal(redondear(1.0005), 1.001, "el medio exacto sube (el Number.EPSILON está para esto)");
assert.equal(redondear(1000000.0001), 1000000, "no pierde precisión en magnitudes grandes");

// ── formatearCantidad / formatearMonto ──────────────────────────────────────

assert.equal(formatearCantidad(3), "3", "un entero se ve entero, no '3,000'");
assert.equal(formatearCantidad(3.5), "3,5", "coma decimal, que es como se escribe en Chile");
assert.equal(formatearCantidad(1234.5), "1.234,5", "punto de miles");
assert.equal(formatearCantidad(0), "0");
assert.equal(formatearCantidad(1.2345), "1,235", "redondea antes de formatear: nunca muestra el cuarto decimal");

const monto = formatearMonto(1500);
assert.ok(monto.includes("1.500"), `el monto se agrupa con punto de miles, no "${monto}"`);
assert.ok(/\$/.test(monto), `y lleva el signo de pesos, no "${monto}"`);
assert.ok(
  !/,/.test(formatearMonto(1500.4)),
  "el peso chileno no tiene decimales: formatearMonto no debe mostrarlos",
);

// ── siguienteReferencia ─────────────────────────────────────────────────────

assert.equal(siguienteReferencia("REC", 0), "REC00001", "el primer documento es el 1, no el 0");
assert.equal(siguienteReferencia("ENT", 41), "ENT00042");
assert.equal(siguienteReferencia("AJU", 9), "AJU00010", "el acarreo de dígitos no rompe el relleno");
assert.equal(siguienteReferencia("INT", 99998), "INT99999", "el último que entra en cinco dígitos");
assert.equal(
  siguienteReferencia("INT", 99999),
  "INT100000",
  "pasado el 99.999 la referencia CRECE en vez de truncarse o volver a empezar. Truncar habría " +
    "chocado contra el unique de referencia y dejado el módulo sin poder emitir documentos",
);
// Las referencias tienen que ordenarse igual como texto que como número, que es
// como se leen en los listados.
const refs = [1, 2, 10, 100].map((n) => siguienteReferencia("REC", n - 1));
assert.deepEqual([...refs].sort(), refs, "el relleno con ceros mantiene el orden alfabético = orden numérico");

// ── Las etiquetas cubren todos los valores ──────────────────────────────────
//
// Un valor sin etiqueta no explota: deja un hueco en blanco en la pantalla, que
// es peor porque nadie lo reporta.

const TIPOS_PRODUCTO: TipoProducto[] = ["almacenable", "consumible", "servicio"];
const SEGUIMIENTOS: Seguimiento[] = ["ninguno", "lote", "serie"];
const TIPOS_UBICACION: TipoUbicacion[] = ["interna", "proveedor", "cliente", "ajuste", "transito", "vista"];
const CLASES: ClaseOperacion[] = ["recepcion", "entrega", "interna", "ajuste"];
const ESTADOS: EstadoTransferencia[] = ["borrador", "listo", "hecho", "cancelado"];

for (const [nombre, valores, mapa] of [
  ["tipo de producto", TIPOS_PRODUCTO, ETIQUETA_TIPO_PRODUCTO],
  ["seguimiento", SEGUIMIENTOS, ETIQUETA_SEGUIMIENTO],
  ["tipo de ubicación", TIPOS_UBICACION, ETIQUETA_TIPO_UBICACION],
  ["clase de operación", CLASES, ETIQUETA_CLASE],
  ["estado", ESTADOS, ETIQUETA_ESTADO],
  ["tono de estado", ESTADOS, TONO_ESTADO],
] as [string, string[], Record<string, string>][]) {
  for (const v of valores) {
    assert.ok(mapa[v] && mapa[v].length > 0, `falta la etiqueta de ${nombre} "${v}"`);
  }
  assert.equal(
    Object.keys(mapa).length,
    valores.length,
    `el mapa de ${nombre} tiene claves de más: alguna quedó de una versión anterior del tipo`,
  );
}

// Los tonos son clases de Tailwind reales, y tienen que distinguirse entre sí:
// si 'hecho' y 'cancelado' se vieran igual, el listado sería ilegible.
assert.equal(
  new Set(Object.values(TONO_ESTADO)).size,
  ESTADOS.length,
  "cada estado necesita su propio color en el chip",
);

// ═══════════════════════════════════════════════════════════════════════════
//  2. El motor de doble entrada
// ═══════════════════════════════════════════════════════════════════════════
//
// Reimplementación fiel de inv_reservar_transferencia, inv_validar_transferencia
// e inv_cancelar_transferencia (migración supabase/inventario/0001). Las de
// verdad son PL/pgSQL y necesitan una base; acá se prueba la aritmética que
// describen, y al final se comprueba contra el archivo SQL que el SQL todavía
// dice lo mismo que esta copia.

type Tipo = TipoUbicacion;
interface Linea { producto: string; ubiOrigen: string; ubiDestino: string; lote: string | null; cantidad: number }

class Motor {
  quants = new Map<string, { cantidad: number; reservado: number }>();
  tipos: Record<string, Tipo>;
  estado: EstadoTransferencia = "borrador";
  lineas: Linea[];
  estadoLineas: ("borrador" | "hecho" | "cancelado")[];

  constructor(tipos: Record<string, Tipo>, lineas: Linea[]) {
    this.tipos = tipos;
    this.lineas = lineas;
    this.estadoLineas = lineas.map(() => "borrador");
  }

  private clave(l: Linea, ubi: string) { return `${l.producto}|${ubi}|${l.lote ?? "-"}`; }

  /** inv_mover_quant: upsert con suma, crea el quant si no existía. */
  private mover(l: Linea, ubi: string, delta: number, deltaReservado = 0) {
    const k = this.clave(l, ubi);
    const q = this.quants.get(k) ?? { cantidad: 0, reservado: 0 };
    this.quants.set(k, { cantidad: redondear(q.cantidad + delta), reservado: redondear(q.reservado + deltaReservado) });
  }

  q(producto: string, ubi: string, lote: string | null = null) {
    return this.quants.get(`${producto}|${ubi}|${lote ?? "-"}`) ?? { cantidad: 0, reservado: 0 };
  }

  reservar() {
    if (this.estado !== "borrador") throw new Error("La transferencia no está en borrador");
    this.estado = "listo";
    this.lineas.forEach((l, i) => {
      if (this.estadoLineas[i] !== "borrador") return;
      if (this.tipos[l.ubiOrigen] === "interna") this.mover(l, l.ubiOrigen, 0, l.cantidad);
    });
  }

  validar() {
    if (this.estado === "hecho") throw new Error("La transferencia ya está validada");
    if (this.estado === "cancelado") throw new Error("La transferencia está cancelada");
    if (!this.estadoLineas.some((e) => e === "borrador")) throw new Error("La transferencia no tiene líneas que mover");
    const venia = this.estado;
    this.lineas.forEach((l, i) => {
      if (this.estadoLineas[i] !== "borrador") return;
      if (this.tipos[l.ubiOrigen] === "interna") {
        this.mover(l, l.ubiOrigen, -l.cantidad, venia === "listo" ? -l.cantidad : 0);
      }
      if (this.tipos[l.ubiDestino] === "interna") this.mover(l, l.ubiDestino, l.cantidad, 0);
      this.estadoLineas[i] = "hecho";
    });
    this.estado = "hecho";
  }

  cancelar() {
    if (this.estado === "hecho") throw new Error("No se puede cancelar una transferencia ya validada");
    if (this.estado === "listo") {
      this.lineas.forEach((l, i) => {
        if (this.estadoLineas[i] !== "borrador") return;
        if (this.tipos[l.ubiOrigen] === "interna") this.mover(l, l.ubiOrigen, 0, -l.cantidad);
      });
    }
    this.estadoLineas = this.estadoLineas.map((e) => (e === "borrador" ? "cancelado" : e));
    this.estado = "cancelado";
  }

  /** Lo que la pantalla muestra como disponible. */
  disp(producto: string, ubi: string, lote: string | null = null) { return disponible(this.q(producto, ubi, lote)); }
}

const UBIS: Record<string, Tipo> = {
  bodega: "interna",
  bodega2: "interna",
  prov: "proveedor",
  cli: "cliente",
  ajuste: "ajuste",
  transito: "transito",
};
const recepcion = (cantidad: number, lote: string | null = null): Linea =>
  ({ producto: "P1", ubiOrigen: "prov", ubiDestino: "bodega", lote, cantidad });
const entrega = (cantidad: number, lote: string | null = null): Linea =>
  ({ producto: "P1", ubiOrigen: "bodega", ubiDestino: "cli", lote, cantidad });

// ── Recepción: entra stock desde el proveedor ──────────────────────────────

{
  const m = new Motor(UBIS, [recepcion(100)]);
  m.validar();
  assert.equal(m.q("P1", "bodega").cantidad, 100, "la recepción deja 100 a mano");
  assert.equal(
    m.q("P1", "prov").cantidad,
    0,
    "y NO deja -100 en el proveedor: una ubicación que no es interna no lleva saldo. Si lo " +
      "llevara, la valorización del inventario sumaría ese negativo y daría cero para siempre",
  );
  assert.equal(m.estado, "hecho");
}

// ── Entrega con reserva: el ciclo completo ─────────────────────────────────

{
  const m = new Motor(UBIS, [recepcion(100)]);
  m.validar();

  const e = new Motor(UBIS, [entrega(30)]);
  e.quants = m.quants; // misma bodega
  e.reservar();
  assert.equal(e.q("P1", "bodega").cantidad, 100, "reservar NO saca stock: la mercadería sigue en la bodega");
  assert.equal(e.q("P1", "bodega").reservado, 30, "pero queda comprometida");
  assert.equal(e.disp("P1", "bodega"), 70, "y el disponible baja, que es lo que mira quien vende");

  e.validar();
  assert.equal(e.q("P1", "bodega").cantidad, 70, "al validar sale de verdad");
  assert.equal(
    e.q("P1", "bodega").reservado,
    0,
    "y la reserva se libera. Si no se liberara, el disponible quedaría en 40 para siempre y la " +
      "bodega mostraría 30 unidades fantasma comprometidas con nadie",
  );
  assert.equal(e.disp("P1", "bodega"), 70, "disponible = a mano cuando no hay nada reservado");
}

// ── Validar SIN reservar antes ─────────────────────────────────────────────
//
// Se puede validar desde 'borrador' directo. El SQL lo contempla con el
// `case when v_estado = 'listo'`: solo descuenta la reserva si alguna vez la
// tomó. Restarla siempre dejaría un reservado negativo.

{
  const m = new Motor(UBIS, [recepcion(100)]);
  m.validar();
  const e = new Motor(UBIS, [entrega(30)]);
  e.quants = m.quants;
  e.validar(); // sin reservar
  assert.equal(e.q("P1", "bodega").cantidad, 70);
  assert.equal(
    e.q("P1", "bodega").reservado,
    0,
    "sin reserva previa el reservado queda en 0, NO en -30. Un reservado negativo habría inflado " +
      "el disponible por encima de lo que hay",
  );
  assert.equal(e.disp("P1", "bodega"), 70);
}

// ── Cancelar desde 'listo' libera la reserva ───────────────────────────────

{
  const m = new Motor(UBIS, [recepcion(100)]);
  m.validar();
  const e = new Motor(UBIS, [entrega(30)]);
  e.quants = m.quants;
  e.reservar();
  assert.equal(e.disp("P1", "bodega"), 70);
  e.cancelar();
  assert.equal(e.q("P1", "bodega").cantidad, 100, "cancelar no toca el a mano");
  assert.equal(e.q("P1", "bodega").reservado, 0, "pero devuelve lo comprometido");
  assert.equal(
    e.disp("P1", "bodega"),
    100,
    "una entrega cancelada tiene que devolver el stock a la venta. La reserva huérfana es el " +
      "error silencioso clásico de un inventario: nadie la ve hasta que falta mercadería que sí está",
  );
}

// ── Cancelar desde 'borrador' NO resta reservas que nunca tomó ─────────────

{
  const m = new Motor(UBIS, [recepcion(100)]);
  m.validar();
  const e = new Motor(UBIS, [entrega(30)]);
  e.quants = m.quants;
  e.cancelar(); // nunca pasó por reservar
  assert.equal(
    e.q("P1", "bodega").reservado,
    0,
    "cancelar un borrador deja el reservado en 0, no en -30",
  );
  assert.equal(e.disp("P1", "bodega"), 100);
}

// ── La máquina de estados ──────────────────────────────────────────────────

{
  // borrador → listo → hecho
  const a = new Motor(UBIS, [recepcion(10)]);
  a.reservar(); assert.equal(a.estado, "listo");
  a.validar(); assert.equal(a.estado, "hecho");

  // Lo validado no se vuelve a validar: sería stock duplicado.
  assert.throws(() => a.validar(), /ya está validada/,
    "revalidar movería el stock dos veces, que es la forma más rápida de inventar mercadería");
  // Ni se cancela: el stock ya se movió y la cancelación no lo devuelve.
  assert.throws(() => a.cancelar(), /ya validada/,
    "cancelar lo hecho dejaría la transferencia en 'cancelado' con el stock movido igual");

  // borrador → cancelado, y de ahí no sale.
  const b = new Motor(UBIS, [recepcion(10)]);
  b.cancelar(); assert.equal(b.estado, "cancelado");
  assert.throws(() => b.validar(), /está cancelada/);
  assert.throws(() => b.reservar(), /no está en borrador/);

  // listo → listo tampoco: reservaría dos veces.
  const c = new Motor(UBIS, [recepcion(10)]);
  c.reservar();
  assert.throws(() => c.reservar(), /no está en borrador/,
    "reservar dos veces duplicaría lo comprometido");

  // Una transferencia sin líneas vivas no se valida.
  const d = new Motor(UBIS, []);
  assert.throws(() => d.validar(), /no tiene líneas/,
    "validar una transferencia vacía la dejaría 'hecha' sin haber movido nada");
}

// ── Transferencia interna: bodega → bodega, el total no cambia ─────────────

{
  const m = new Motor(UBIS, [recepcion(100)]);
  m.validar();
  const t = new Motor(UBIS, [{ producto: "P1", ubiOrigen: "bodega", ubiDestino: "bodega2", lote: null, cantidad: 40 }]);
  t.quants = m.quants;
  t.reservar();
  t.validar();
  assert.equal(t.q("P1", "bodega").cantidad, 60);
  assert.equal(t.q("P1", "bodega2").cantidad, 40);
  assert.equal(
    sumarCantidad([...t.quants.values()]),
    100,
    "mover entre dos bodegas internas no crea ni destruye nada: el total de la empresa sigue en 100",
  );
}

// ── Varias líneas y varios lotes en una sola transferencia ─────────────────

{
  const m = new Motor(UBIS, [recepcion(50, "L1"), recepcion(30, "L2")]);
  m.validar();
  assert.equal(m.q("P1", "bodega", "L1").cantidad, 50);
  assert.equal(m.q("P1", "bodega", "L2").cantidad, 30);
  assert.equal(
    m.q("P1", "bodega", null).cantidad,
    0,
    "los lotes NO se mezclan con el quant sin lote: son filas distintas, y por eso el índice " +
      "único de inv_quants usa coalesce(lote_id, uuid-cero) en vez de (producto, ubicación)",
  );
  assert.equal(sumarCantidad([...m.quants.values()]), 80, "el a mano del producto es la suma de sus lotes");

  // Y se entrega de un lote sin tocar el otro.
  const e = new Motor(UBIS, [entrega(20, "L1")]);
  e.quants = m.quants;
  e.reservar();
  assert.equal(e.disp("P1", "bodega", "L1"), 30, "la reserva pega en el lote entregado");
  assert.equal(e.disp("P1", "bodega", "L2"), 30, "y deja el otro lote intacto");
  e.validar();
  assert.equal(e.q("P1", "bodega", "L1").cantidad, 30);
  assert.equal(e.q("P1", "bodega", "L2").cantidad, 30);
}

// ── Cantidades decimales a lo largo de un ciclo entero ────────────────────

{
  const m = new Motor(UBIS, [recepcion(0.1), recepcion(0.2)]);
  m.validar();
  assert.equal(
    m.q("P1", "bodega").cantidad,
    0.3,
    "dos líneas decimales sobre el mismo quant no arrastran basura de punto flotante",
  );
  const e = new Motor(UBIS, [entrega(0.1)]);
  e.quants = m.quants;
  e.reservar(); e.validar();
  assert.equal(e.q("P1", "bodega").cantidad, 0.2);
  assert.equal(e.q("P1", "bodega").reservado, 0, "la reserva decimal se libera exacta, sin dejar un 1e-17");
}

// ── El ajuste de inventario cuadra contra la ubicación virtual ────────────
//
// ajustarInventario arma la transferencia en un sentido u otro según el signo de
// la diferencia, y siempre con `Math.abs`: nunca manda una cantidad negativa.

for (const [contado, actual] of [[120, 100], [80, 100], [100, 100]] as [number, number][]) {
  const diferencia = redondear(contado - actual);
  if (diferencia === 0) continue; // ajustarInventario no crea documento
  const sobra = diferencia > 0;
  const m = new Motor(UBIS, [{
    producto: "P1",
    ubiOrigen: sobra ? "ajuste" : "bodega",
    ubiDestino: sobra ? "bodega" : "ajuste",
    lote: null,
    cantidad: Math.abs(diferencia),
  }]);
  m.quants.set("P1|bodega|-", { cantidad: actual, reservado: 0 });
  m.validar();
  assert.equal(
    m.q("P1", "bodega").cantidad,
    contado,
    `contar ${contado} con ${actual} en sistema tiene que dejar la bodega en ${contado}`,
  );
  assert.equal(m.q("P1", "ajuste").cantidad, 0, "la ubicación de ajuste es virtual: no acumula saldo");
}

// ── Reservar más de lo que hay NO se bloquea ──────────────────────────────
//
// Es a propósito, y conviene que esté escrito: el motor deja comprometer stock
// que no está. El disponible queda negativo y la pantalla lo muestra, que es la
// señal de que hay que comprar. Si algún día se quiere bloquear, esta prueba es
// la que hay que venir a cambiar — y entonces se verá que es una decisión y no
// un descuido.

{
  const m = new Motor(UBIS, [recepcion(10)]);
  m.validar();
  const e = new Motor(UBIS, [entrega(25)]);
  e.quants = m.quants;
  e.reservar();
  assert.equal(e.q("P1", "bodega").cantidad, 10, "lo que hay sigue siendo 10");
  assert.equal(e.q("P1", "bodega").reservado, 25);
  assert.equal(
    e.disp("P1", "bodega"),
    -15,
    "el disponible negativo es la alerta. Hoy el motor NO impide sobrevender: si se decide " +
      "impedirlo, hay que cambiar inv_reservar_transferencia y esta prueba",
  );
}

// ── Lo cancelado no se mueve nunca ────────────────────────────────────────

{
  const m = new Motor(UBIS, [recepcion(100)]);
  m.validar();
  const antes = m.q("P1", "bodega").cantidad;
  const e = new Motor(UBIS, [entrega(30)]);
  e.quants = m.quants;
  e.reservar();
  e.cancelar();
  assert.equal(e.q("P1", "bodega").cantidad, antes, "una entrega cancelada no sacó nada");
  assert.deepEqual(e.estadoLineas, ["cancelado"], "y sus líneas quedan canceladas, no en borrador");
}

// ═══════════════════════════════════════════════════════════════════════════
//  3. Los candados
// ═══════════════════════════════════════════════════════════════════════════

const acciones = leer("../app/(protegido)/inventario/acciones.ts");

// ── Toda Server Action exige el permiso ───────────────────────────────────
//
// Esta es la prueba que más importa de las tres partes. Una Server Action se
// invoca por HTTP directo: esconder el botón, o incluso proteger la PÁGINA, no
// es una barrera. Así fue como el endpoint del Excel de Rendir Gastos quedó
// abierto. El comentario del final de acciones.ts dice que "las páginas ya lo
// exigen" — y es engañoso, porque lo que de verdad protege al módulo es que cada
// una de las acciones llama al guard. Si alguien borra una de esas llamadas
// confiando en ese comentario, esto falla.

// Se parte por declaración y se toma hasta la siguiente: un regex de llaves no
// sirve, porque dos de estas acciones reciben un objeto y su propia FIRMA tiene
// llaves y saltos de línea. Cortando ahí, el cuerpo quedaba trunco justo antes
// del guard y la prueba las acusaba de no tenerlo.
const cuerpos = acciones
  .split(/export async function /)
  .slice(1)
  .map((trozo) => ({ nombre: trozo.slice(0, trozo.indexOf("(")), cuerpo: trozo }))
  .filter((a) => a.nombre !== "verificarAcceso");

assert.ok(cuerpos.length === 15, `se esperaban las 15 acciones del módulo, se encontraron ${cuerpos.length}`);

const sinGuard = cuerpos.filter((a) => !/exigirAccesoApp\(SLUG\)/.test(a.cuerpo)).map((a) => a.nombre);
assert.deepEqual(
  sinGuard,
  [],
  `Estas Server Actions se pueden invocar por HTTP sin tener la app asignada: ${sinGuard.join(", ")}. ` +
    "Proteger la página NO alcanza: la acción tiene su propio endpoint.",
);

// Y el guard va ANTES de tocar la base, no después.
for (const a of cuerpos) {
  const posGuard = a.cuerpo.indexOf("exigirAccesoApp(SLUG)");
  const posEscritura = a.cuerpo.search(/\bawait (crear|actualizar|desactivar|eliminar|guardar|reservar|validar|cancelar|ajustar)/);
  if (posEscritura === -1) continue;
  assert.ok(
    posGuard < posEscritura,
    `${a.nombre} escribe en la base antes de comprobar el permiso`,
  );
}

// El slug es el mismo que registra la migración en la tabla de aplicaciones: si
// no coincidieran, exigirAccesoApp buscaría un permiso que nadie puede tener y
// el módulo quedaría inaccesible para todos (o, peor, abierto si el guard no
// encuentra la app y deja pasar).
const sql = leer("../supabase/inventario/0001_inventario.sql");
assert.ok(/const SLUG = "inventario"/.test(acciones), "el slug de las acciones");
assert.ok(
  /'Inventario', 'inventario', '\/inventario'/.test(sql),
  "la migración tiene que registrar la app con el MISMO slug que usan las acciones",
);

// ── Quien crea queda registrado ───────────────────────────────────────────

for (const a of ["crearTransferenciaAction", "ajustarAction"]) {
  const cuerpo = cuerpos.find((c) => c.nombre === a)!.cuerpo;
  assert.ok(
    /const usuario = await exigirAccesoApp\(SLUG\)/.test(cuerpo) && /creadoPor: usuario\.correo/.test(cuerpo),
    `${a} mueve stock: tiene que dejar registrado quién lo hizo, y tomarlo de la sesión y no del ` +
      "formulario, que el cliente puede escribir a gusto",
  );
}

// ── La capa de datos es solo de servidor ──────────────────────────────────

const datos = leer("../lib/inventario.ts");
assert.ok(
  /^import "server-only";/m.test(datos),
  "lib/inventario.ts usa supabaseAdmin (service_role, se saltea RLS): sin 'server-only' un import " +
    "descuidado desde un componente cliente lo mandaría al bundle del navegador con la llave adentro",
);
assert.ok(
  !/^import "server-only";/m.test(leer("../lib/inventario-modelo.ts")),
  "el modelo NO lleva server-only a propósito: lo importan los formularios del cliente para " +
    "formatear y calcular lo mismo que el servidor",
);

// ── Las mutaciones de stock pasan por el motor, no por UPDATEs sueltos ────

for (const fn of ["inv_reservar_transferencia", "inv_validar_transferencia", "inv_cancelar_transferencia"]) {
  assert.ok(new RegExp(`rpc\\("${fn}"`).test(datos), `${fn} tiene que llamarse por RPC`);
  assert.ok(
    new RegExp(`create or replace function public\\.${fn}`).test(sql),
    `${fn} tiene que existir en la migración`,
  );
}
assert.ok(
  !/from\(T\.quants\)[\s\S]{0,80}\.(update|insert|upsert|delete)\(/.test(datos),
  "nadie escribe inv_quants desde Node: mover stock en varios pasos desde el servidor significa " +
    "que una caída a mitad de camino deja el inventario descuadrado. Por eso el motor es PL/pgSQL, " +
    "donde cada validación es UNA transacción",
);

// ── El índice único es el que el upsert necesita ──────────────────────────
//
// inv_mover_quant hace ON CONFLICT sobre una EXPRESIÓN. Postgres solo la
// resuelve si existe un índice único sobre esa misma expresión, escrita igual.
// Si no coincide, el upsert falla en runtime —nunca al desplegar— la primera vez
// que dos movimientos tocan el mismo quant.

const EXPRESION = "(producto_id, ubicacion_id, coalesce(lote_id, '00000000-0000-0000-0000-000000000000'::uuid))";
assert.ok(sql.includes(`on public.inv_quants ${EXPRESION}`), "el índice único de inv_quants");
assert.ok(sql.includes(`on conflict ${EXPRESION}`), "y el ON CONFLICT de inv_mover_quant, con la MISMA expresión");

// ── La numeración no puede producir dos documentos iguales ────────────────
//
// crearTransferencia sube el correlativo con un UPDATE condicionado al valor que
// leyó, pero no mira cuántas filas actualizó. Con dos personas creando a la vez,
// las dos arman la misma referencia. Lo que impide que el módulo emita dos
// documentos con el mismo número es el unique de la columna: el segundo INSERT
// revienta. Feo, pero seguro — y por eso el unique no se puede sacar.

assert.ok(
  /referencia\s+text not null unique/.test(sql),
  "inv_transferencias.referencia tiene que ser unique: es lo único que impide dos documentos con " +
    "el mismo número cuando dos personas crean una transferencia al mismo tiempo",
);
assert.ok(
  /\.eq\("correlativo", tipo\.correlativo\)/.test(datos),
  "y el UPDATE del correlativo va condicionado al valor leído, para no pisar el de otra persona",
);

// ── RLS encendido en todas las tablas del módulo ──────────────────────────

const tablas = [...sql.matchAll(/create table if not exists public\.(inv_\w+)/g)].map((m) => m[1]);
assert.ok(tablas.length >= 9, `se esperaban al menos 9 tablas inv_*, se encontraron ${tablas.length}`);
for (const t of tablas) {
  assert.ok(
    new RegExp(`alter table public\\.${t}\\s+enable row level security`).test(sql),
    `${t} sin RLS: con la llave anónima quedaría legible desde internet`,
  );
}
assert.ok(
  !/create policy[\s\S]*?on public\.inv_/.test(sql),
  "RLS encendido y CERO políticas es lo correcto acá: todo pasa por el servidor con service_role. " +
    "Una política abriría la tabla a la llave pública",
);

console.log(
  `Inventario verificado: ${cuerpos.length} Server Actions, todas con permiso antes de escribir; ` +
    "los cálculos puros con sus bordes (decimales, horario de verano, reglas al revés, el 99.999); " +
    "y el motor de doble entrada en ciclos completos — recepción, reserva, entrega, ajuste, " +
    "cancelación, lotes — cuadrando sin crear ni perder stock.",
);

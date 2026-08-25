/**
 * Cómo se arman las filas de Bodega a partir de lo que devuelve Odoo.
 *
 * Separado del sincronizador a propósito. Todo lo demás de este módulo es leer y
 * escribir —y eso no se puede probar sin las credenciales de Odoo— pero acá vive lo
 * único que decide algo: sumar el mismo producto que está en dos estanterías de la
 * misma bodega, repartir las transferencias por bodega, contar las atrasadas y
 * valorizar. Eso sí se puede probar, y se prueba (scripts/probar-bodega.mts).
 *
 * Sin "server-only": es una función de datos y la usan las pruebas con tsx.
 */

export type TuplaOdoo = [number, string] | false;

export function nombreDeTupla(t: TuplaOdoo): string | null {
  return Array.isArray(t) ? t[1] : null;
}
export function idDeTupla(t: TuplaOdoo): number | null {
  return Array.isArray(t) ? t[0] : null;
}

export interface BodegaOdoo {
  id: number;
  name: string;
  code: string | false;
  company_id: TuplaOdoo;
  view_location_id: TuplaOdoo;
}

export interface QuantOdoo {
  product_id: TuplaOdoo;
  location_id: TuplaOdoo;
  quantity: number;
  reserved_quantity: number;
}

export interface ProductoOdoo {
  id: number;
  name: string;
  default_code: string | false;
  uom_id: TuplaOdoo;
  categ_id: TuplaOdoo;
  standard_price: number;
}

export interface TipoTransferenciaOdoo {
  id: number;
  warehouse_id: TuplaOdoo;
}

export interface TransferenciaOdoo {
  picking_type_id: TuplaOdoo;
  scheduled_date: string | false;
}

/** Lo que se leyó de una bodega: la bodega, sus quants y la ficha de sus productos. */
export interface LecturaDeBodega {
  bodega: BodegaOdoo;
  quants: QuantOdoo[];
  productos: ProductoOdoo[];
}

export interface FilaBodegaCache {
  odoo_id: number;
  company_id: number;
  company_nombre: string;
  nombre: string;
  codigo: string | null;
  productos_distintos: number;
  unidades: number;
  unidades_reservadas: number;
  valor_inventario: number;
  transferencias_pendientes: number;
  transferencias_atrasadas: number;
  actualizado_en: string;
}

export interface FilaStockCache {
  bodega_odoo_id: number;
  producto_odoo_id: number;
  company_id: number;
  producto_nombre: string;
  codigo: string | null;
  categoria: string | null;
  unidad: string | null;
  cantidad: number;
  reservada: number;
  costo_unitario: number;
  valor: number;
  actualizado_en: string;
}

/**
 * Cuántas transferencias sin terminar tiene cada bodega, y cuántas van con retraso.
 *
 * Una transferencia no dice a qué bodega pertenece: lo dice su TIPO de operación
 * ("PT/Recepciones", "PT/Entregas"), que sí tiene bodega. Por eso hacen falta las
 * dos listas.
 */
export function pendientesPorBodega(
  tipos: TipoTransferenciaOdoo[],
  transferencias: TransferenciaOdoo[],
  hoy: string,
): Map<number, { total: number; atrasadas: number }> {
  const bodegaDelTipo = new Map(tipos.map((t) => [t.id, idDeTupla(t.warehouse_id)]));
  const cuentas = new Map<number, { total: number; atrasadas: number }>();

  for (const transferencia of transferencias) {
    const bodega = bodegaDelTipo.get(idDeTupla(transferencia.picking_type_id) ?? -1);
    // Un tipo de operación sin bodega existe (los tipos internos de una compañía sin
    // almacén), y contarlo en alguna bodega sería inventar.
    if (bodega == null) continue;

    const cuenta = cuentas.get(bodega) ?? { total: 0, atrasadas: 0 };
    cuenta.total += 1;
    // La fecha programada llega como "2026-08-20 13:00:00": los diez primeros
    // caracteres alcanzan para compararla con hoy sin construir fechas ni pensar en
    // zonas horarias, porque las dos son ISO y se comparan como texto.
    if (transferencia.scheduled_date && transferencia.scheduled_date.slice(0, 10) < hoy) {
      cuenta.atrasadas += 1;
    }
    cuentas.set(bodega, cuenta);
  }

  return cuentas;
}

/**
 * Las filas de caché de una lectura completa.
 *
 * `nombreDeCompania` se inyecta en vez de importar `obtenerCompania` para que esto
 * no dependa de nada del servidor y la prueba pueda usar nombres cualquiera.
 */
export function armarFilasDeBodega(
  lecturas: LecturaDeBodega[],
  tipos: TipoTransferenciaOdoo[],
  transferencias: TransferenciaOdoo[],
  opciones: { hoy: string; marca: string; nombreDeCompania: (id: number) => string },
): { filasBodega: FilaBodegaCache[]; filasStock: FilaStockCache[] } {
  const pendientes = pendientesPorBodega(tipos, transferencias, opciones.hoy);
  const filasBodega: FilaBodegaCache[] = [];
  const filasStock: FilaStockCache[] = [];

  for (const { bodega, quants, productos } of lecturas) {
    const companyId = idDeTupla(bodega.company_id) ?? 1;
    const ficha = new Map(productos.map((p) => [p.id, p]));

    // Un producto puede estar en varias ubicaciones de la misma bodega: se suma,
    // porque lo que interesa de una bodega es cuánto hay, no en qué estante.
    const porProducto = new Map<number, { nombre: string; cantidad: number; reservada: number }>();
    for (const quant of quants) {
      const productoId = idDeTupla(quant.product_id);
      if (productoId == null) continue;
      const acumulado = porProducto.get(productoId) ?? {
        nombre: nombreDeTupla(quant.product_id) ?? `#${productoId}`,
        cantidad: 0,
        reservada: 0,
      };
      acumulado.cantidad += quant.quantity;
      acumulado.reservada += quant.reserved_quantity;
      porProducto.set(productoId, acumulado);
    }

    let unidades = 0;
    let reservadas = 0;
    let valor = 0;
    for (const [productoId, acumulado] of porProducto) {
      const p = ficha.get(productoId);
      // Sin ficha del producto el costo es 0 y no se descarta la fila: que haya 40
      // unidades de algo es un dato aunque no se sepa cuánto vale.
      const costo = p?.standard_price ?? 0;
      const valorFila = acumulado.cantidad * costo;
      unidades += acumulado.cantidad;
      reservadas += acumulado.reservada;
      valor += valorFila;

      filasStock.push({
        bodega_odoo_id: bodega.id,
        producto_odoo_id: productoId,
        company_id: companyId,
        producto_nombre: p?.name ?? acumulado.nombre,
        codigo: p?.default_code || null,
        categoria: p ? nombreDeTupla(p.categ_id) : null,
        unidad: p ? nombreDeTupla(p.uom_id) : null,
        cantidad: acumulado.cantidad,
        reservada: acumulado.reservada,
        costo_unitario: costo,
        valor: valorFila,
        actualizado_en: opciones.marca,
      });
    }

    const cuenta = pendientes.get(bodega.id) ?? { total: 0, atrasadas: 0 };
    filasBodega.push({
      odoo_id: bodega.id,
      company_id: companyId,
      company_nombre: opciones.nombreDeCompania(companyId),
      nombre: bodega.name,
      codigo: bodega.code || null,
      productos_distintos: porProducto.size,
      unidades,
      unidades_reservadas: reservadas,
      valor_inventario: valor,
      transferencias_pendientes: cuenta.total,
      transferencias_atrasadas: cuenta.atrasadas,
      actualizado_en: opciones.marca,
    });
  }

  return { filasBodega, filasStock };
}

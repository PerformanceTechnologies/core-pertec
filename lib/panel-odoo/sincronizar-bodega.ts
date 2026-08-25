import "server-only";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { odooSearchRead } from "./odoo-cliente";
import { eliminarNoVigentes } from "./limpieza";
import { obtenerCompania } from "./companias";
import {
  armarFilasDeBodega,
  idDeTupla,
  type BodegaOdoo,
  type LecturaDeBodega,
  type ProductoOdoo,
  type QuantOdoo,
  type TipoTransferenciaOdoo,
  type TransferenciaOdoo,
} from "./bodega-filas";

/**
 * Bodega: el stock de Odoo, por bodega.
 *
 * A diferencia de los otros módulos, acá el "registro" que se lista no es un
 * documento sino un LUGAR: una bodega, con sus totales, y adentro el detalle de qué
 * hay. Por eso son dos tablas — `panel_odoo_bodegas` con una fila por bodega y
 * `panel_odoo_bodega_stock` con una fila por bodega y producto.
 *
 * Este archivo solo lee de Odoo y escribe en Supabase. Las cuentas —sumar el mismo
 * producto de dos estanterías, repartir las transferencias, valorizar— están en
 * ./bodega-filas.ts, que no depende de nada del servidor y tiene pruebas.
 *
 * ── Qué se le pide a Odoo, y por qué justo eso ─────────────────────────────
 *
 * Solo campos del módulo `stock` estándar, de los que existen desde hace muchas
 * versiones. Esta instancia tiene campos y modelos propios (`x_has_rental_lines` en
 * las ventas, `pertec.fleet.vehicle.document` en la flota), así que la tentación es
 * buscar los del inventario; pero un nombre de campo equivocado no falla a medias:
 * la lectura entera devuelve error y el módulo queda sin datos.
 *
 * Dos cosas que se evitan a propósito:
 *
 *  - `stock.quant.warehouse_id` y `stock.location.warehouse_id` son campos
 *    calculados y no en todas las versiones se pueden filtrar. En su lugar se pide
 *    la bodega, se mira su ubicación raíz y se piden los quants con
 *    `location_id child_of` esa raíz, que es un operador de dominio de siempre.
 *  - `stock.quant.value` solo existe con la valorización contable instalada. El
 *    valor se calcula acá: cantidad × `standard_price` del producto, que es como
 *    valoriza Odoo con costeo estándar. No es el saldo de la cuenta de existencias,
 *    y la tabla y la pantalla lo dicen.
 *
 * El `standard_price` se lee sin contexto de compañía —el cliente RPC no lo manda—
 * así que llega el de la compañía del usuario que sincroniza. Con costos distintos
 * por compañía, una bodega de otra compañía se valoriza con el costo de esa. Vale
 * como magnitud, no como cifra contable.
 */

/**
 * Tope de quants por bodega.
 *
 * Un quant es una combinación de producto y ubicación, así que una bodega con
 * estanterías tiene bastantes más quants que productos. Si se alcanza, la limpieza
 * del detalle se salta: mejor una caché con filas viejas que una a la mitad.
 */
const TOPE_QUANTS = 8000;
const TOPE_TRANSFERENCIAS = 2000;

export async function sincronizarBodega(): Promise<number> {
  const bodegas = await odooSearchRead<BodegaOdoo>(
    "stock.warehouse",
    [],
    ["name", "code", "company_id", "view_location_id"],
    { order: "name asc", limit: 100 },
  );

  // Sin bodegas en Odoo no hay nada que cachear, y vaciar la caché acá dejaría el
  // módulo en blanco por una lectura que volvió vacía por cualquier razón.
  if (bodegas.length === 0) return 0;

  // Las transferencias sin terminar, una sola vez para todas las bodegas: se
  // reparten después por el tipo de operación, que es lo que sabe de qué bodega es.
  const [tipos, transferencias] = await Promise.all([
    odooSearchRead<TipoTransferenciaOdoo>("stock.picking.type", [], ["warehouse_id"], { limit: 200 }),
    odooSearchRead<TransferenciaOdoo>(
      "stock.picking",
      [["state", "not in", ["done", "cancel", "draft"]]],
      ["picking_type_id", "scheduled_date"],
      { order: "scheduled_date asc", limit: TOPE_TRANSFERENCIAS },
    ),
  ]);

  let topeAlcanzado = false;
  const lecturas: LecturaDeBodega[] = [];

  for (const bodega of bodegas) {
    const raiz = idDeTupla(bodega.view_location_id);

    // Los quants de ESTA bodega: todo lo que cuelgue de su ubicación raíz y esté en
    // una ubicación interna —así no se cuentan las de tránsito ni las virtuales de
    // ajuste—. Sin raíz no se puede acotar, y contar los de otra bodega sería peor
    // que no contar.
    const quants = raiz
      ? await odooSearchRead<QuantOdoo>(
          "stock.quant",
          [
            ["location_id", "child_of", raiz],
            ["location_id.usage", "=", "internal"],
          ],
          ["product_id", "location_id", "quantity", "reserved_quantity"],
          { limit: TOPE_QUANTS },
        )
      : [];
    if (quants.length >= TOPE_QUANTS) topeAlcanzado = true;

    const ids = [...new Set(quants.map((q) => idDeTupla(q.product_id)).filter((id): id is number => id != null))];
    const productos =
      ids.length > 0
        ? await odooSearchRead<ProductoOdoo>(
            "product.product",
            [["id", "in", ids]],
            ["name", "default_code", "uom_id", "categ_id", "standard_price"],
            { limit: ids.length },
          )
        : [];

    lecturas.push({ bodega, quants, productos });
  }

  const marca = new Date().toISOString();
  const { filasBodega, filasStock } = armarFilasDeBodega(lecturas, tipos, transferencias, {
    hoy: marca.slice(0, 10),
    marca,
    nombreDeCompania: (id) => obtenerCompania(id).nombre,
  });

  const { error: errorBodegas, count } = await supabaseAdmin
    .from("panel_odoo_bodegas")
    .upsert(filasBodega, { onConflict: "odoo_id", count: "exact" });
  if (errorBodegas) throw new Error(errorBodegas.message);

  if (filasStock.length > 0) {
    const { error } = await supabaseAdmin
      .from("panel_odoo_bodega_stock")
      .upsert(filasStock, { onConflict: "bodega_odoo_id,producto_odoo_id" });
    if (error) throw new Error(error.message);
  }

  // Lo que Odoo ya no devuelve sale de la caché. Las bodegas por su odoo_id, como el
  // resto del panel; el stock por la marca de esta corrida, porque su clave es
  // compuesta y no hay un id único que comparar. Los dos barridos van DESPUÉS de
  // escribir: si el upsert falla, no se borra nada.
  await eliminarNoVigentes(
    "panel_odoo_bodegas",
    filasBodega.map((f) => f.odoo_id),
  );

  if (!topeAlcanzado) {
    const { error } = await supabaseAdmin.from("panel_odoo_bodega_stock").delete().lt("actualizado_en", marca);
    if (error) throw new Error(error.message);
  }

  return count ?? filasBodega.length;
}

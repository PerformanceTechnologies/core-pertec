import "server-only";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { odooCampos, odooSearchRead } from "./odoo-cliente";
import { eliminarNoVigentes } from "./limpieza";
import { obtenerCompania } from "./companias";

function nombreDeTupla(t: unknown): string | null {
  return Array.isArray(t) && typeof t[1] === "string" ? t[1] : null;
}
function idDeTupla(t: unknown): number | null {
  return Array.isArray(t) && typeof t[0] === "number" ? t[0] : null;
}
function comoTexto(valor: unknown): string | null {
  if (Array.isArray(valor)) return nombreDeTupla(valor);
  if (typeof valor === "string") return valor || null;
  return null;
}
function comoNumero(valor: unknown): number {
  return typeof valor === "number" ? valor : 0;
}
function comoEntero(valor: unknown): number | null {
  return typeof valor === "number" ? Math.round(valor) : null;
}
function comoBooleano(valor: unknown): boolean {
  return valor === true;
}

interface VentaOdoo {
  id: number;
  [campo: string]: unknown;
}

// Ventas y Arriendo unificados en sale.order (mismo modelo Odoo): se distinguen por
// x_has_rental_lines, un campo custom de este Odoo mas confiable que el is_rental_order
// estandar (en la practica, ordenes que segun x_rental_state SI son arriendo tienen
// is_rental_order=false).
//
// Los campos NO se piden por nombre fijo: se le pregunta a Odoo cuales tiene (fields_get)
// y se usa el primero de cada lista que exista. La mitad de lo que se lee aca son campos
// CUSTOM de este Odoo (todo el x_* del arriendo: checklists, danos, atrasos, garantia) y
// los tocan del otro lado; un nombre que no esta tumba la sincronizacion entera con
// "Invalid field", que es lo que le paso a Flota tres dias seguidos.
const CAMPOS_VENTA = {
  numero: ["name"],
  cliente: ["partner_id"],
  fechaOrden: ["date_order"],
  montoTotal: ["amount_total"],
  montoNeto: ["amount_untaxed"],
  montoImpuesto: ["amount_tax"],
  montoFacturado: ["amount_invoiced"],
  montoPorFacturar: ["amount_to_invoice"],
  facturas: ["invoice_count"],
  estado: ["state"],
  estadoFacturacion: ["invoice_status"],
  empresa: ["company_id"],
  vendedor: ["user_id"],
  equipo: ["team_id"],
  referenciaCliente: ["client_order_ref"],
  origen: ["origin"],
  oportunidad: ["opportunity_id"],
  condicionPago: ["payment_term_id"],
  validez: ["validity_date"],
  compromiso: ["commitment_date"],
  margen: ["margin"],
  margenPorcentaje: ["margin_percent"],
  margenBajo: ["x_margin_has_violation"],
  margenAprobado: ["x_margin_approved"],
  estadoEntrega: ["delivery_status"],
  etiquetas: ["tag_ids"],
  // Arriendo. Los x_* son de este Odoo; los otros, del módulo Rental estándar.
  esArriendo: ["x_has_rental_lines", "has_rented_products", "is_rental_order"],
  estadoArriendo: ["x_rental_state", "rental_status"],
  inicioArriendo: ["x_rental_start_date", "rental_start_date"],
  finArriendo: ["x_rental_end_date", "rental_return_date"],
  devolucion: ["x_return_date"],
  diasArriendo: ["x_rental_days", "duration_days"],
  diasAtraso: ["x_late_days"],
  tieneDanos: ["x_has_damages"],
  costoDanos: ["x_total_damage_cost"],
  totalLiquidacion: ["x_settlement_total"],
  productoDevuelto: ["x_is_product_returned"],
  garantiaEstado: ["x_warranty_status"],
  garantiaDocumento: ["x_warranty_doc"],
} as const;

type CamposDeVenta = Record<keyof typeof CAMPOS_VENTA, string | null>;

const TOPE = 2000;

export function resolverCamposVenta(camposQueTiene: Record<string, { type: string }>): CamposDeVenta {
  const campo = Object.fromEntries(
    Object.entries(CAMPOS_VENTA).map(([que, posibles]) => [
      que,
      posibles.find((nombre) => camposQueTiene[nombre] !== undefined) ?? null,
    ]),
  ) as CamposDeVenta;

  // Sin el número no hay nada que listar; sin el monto, nada que sumar.
  for (const imprescindible of ["numero", "montoTotal"] as const) {
    if (campo[imprescindible] === null) {
      throw new Error(
        `sale.order ya no tiene ninguno de los campos de ${imprescindible} ` +
          `(${CAMPOS_VENTA[imprescindible].join(", ")}). Los que tiene hoy: ` +
          `${Object.keys(camposQueTiene).sort().join(", ")}`,
      );
    }
  }
  if (campo.esArriendo === null) {
    console.warn(
      "[panel-odoo] sale.order no tiene ninguno de los campos que distinguen un arriendo " +
        `(${CAMPOS_VENTA.esArriendo.join(", ")}): todo va a contarse como venta.`,
    );
  }
  return campo;
}

export function camposAPedirDeVenta(campo: CamposDeVenta): string[] {
  return [...new Set(Object.values(campo).filter((n): n is string => n !== null))];
}

export async function sincronizarVentas(): Promise<number> {
  const campo = resolverCamposVenta(await odooCampos("sale.order"));
  const ventas = await odooSearchRead<VentaOdoo>(
    "sale.order",
    [["state", "!=", "cancel"]],
    camposAPedirDeVenta(campo),
    { order: "date_order desc", limit: TOPE },
  );

  if (ventas.length === 0) return 0;

  // Las etiquetas llegan como ids: sus nombres se piden de una sola vez.
  const idsDeEtiquetas = new Set<number>();
  if (campo.etiquetas) {
    for (const v of ventas) {
      const ids = v[campo.etiquetas];
      if (Array.isArray(ids)) for (const id of ids) if (typeof id === "number") idsDeEtiquetas.add(id);
    }
  }
  const nombreDeEtiqueta = new Map<number, string>();
  if (idsDeEtiquetas.size > 0) {
    const etiquetas = await odooSearchRead<{ id: number; name: string }>(
      "crm.tag",
      [["id", "in", [...idsDeEtiquetas]]],
      ["name"],
      { limit: 500 },
    );
    for (const e of etiquetas) nombreDeEtiqueta.set(e.id, e.name);
  }

  const leer = (v: VentaOdoo, que: keyof typeof CAMPOS_VENTA): unknown =>
    campo[que] === null ? undefined : v[campo[que] as string];

  const filas = ventas.map((v) => {
    const companyId = idDeTupla(leer(v, "empresa")) ?? 1;
    const idsEtiquetas = leer(v, "etiquetas");
    return {
      odoo_id: v.id,
      company_id: companyId,
      company_nombre: obtenerCompania(companyId).nombre,
      numero: comoTexto(leer(v, "numero")),
      partner_nombre: comoTexto(leer(v, "cliente")),
      fecha_orden: comoTexto(leer(v, "fechaOrden")),
      monto_total: comoNumero(leer(v, "montoTotal")),
      monto_neto: comoNumero(leer(v, "montoNeto")),
      monto_impuesto: comoNumero(leer(v, "montoImpuesto")),
      monto_facturado: comoNumero(leer(v, "montoFacturado")),
      monto_por_facturar: comoNumero(leer(v, "montoPorFacturar")),
      facturas: comoEntero(leer(v, "facturas")),
      estado: comoTexto(leer(v, "estado")) ?? "draft",
      estado_facturacion: comoTexto(leer(v, "estadoFacturacion")) ?? "no",
      vendedor: comoTexto(leer(v, "vendedor")),
      equipo: comoTexto(leer(v, "equipo")),
      referencia_cliente: comoTexto(leer(v, "referenciaCliente")),
      origen: comoTexto(leer(v, "origen")),
      oportunidad: comoTexto(leer(v, "oportunidad")),
      condicion_pago: comoTexto(leer(v, "condicionPago")),
      validez_hasta: comoTexto(leer(v, "validez")),
      fecha_compromiso: comoTexto(leer(v, "compromiso")),
      margen: comoNumero(leer(v, "margen")),
      margen_porcentaje: comoNumero(leer(v, "margenPorcentaje")),
      margen_bajo: comoBooleano(leer(v, "margenBajo")),
      margen_aprobado: comoBooleano(leer(v, "margenAprobado")),
      estado_entrega: comoTexto(leer(v, "estadoEntrega")),
      etiquetas: Array.isArray(idsEtiquetas)
        ? idsEtiquetas.map((id) => nombreDeEtiqueta.get(id as number)).filter((n): n is string => !!n)
        : null,
      es_arriendo: comoBooleano(leer(v, "esArriendo")),
      estado_arriendo: comoTexto(leer(v, "estadoArriendo")),
      fecha_inicio_arriendo: comoTexto(leer(v, "inicioArriendo")),
      fecha_fin_arriendo: comoTexto(leer(v, "finArriendo")),
      fecha_devolucion: comoTexto(leer(v, "devolucion")),
      dias_arriendo: comoEntero(leer(v, "diasArriendo")),
      dias_atraso: comoEntero(leer(v, "diasAtraso")),
      tiene_danos: comoBooleano(leer(v, "tieneDanos")),
      costo_danos: comoNumero(leer(v, "costoDanos")),
      total_liquidacion: comoNumero(leer(v, "totalLiquidacion")),
      producto_devuelto: comoBooleano(leer(v, "productoDevuelto")),
      garantia_estado: comoTexto(leer(v, "garantiaEstado")),
      garantia_documento: comoTexto(leer(v, "garantiaDocumento")),
      actualizado_en: new Date().toISOString(),
    };
  });

  const { error, count } = await supabaseAdmin
    .from("panel_odoo_ventas")
    .upsert(filas, { onConflict: "odoo_id", count: "exact" });

  if (error) throw new Error(error.message);

  // Lo que Odoo ya no devuelve sale de la cache. Va DESPUES del upsert: si el
  // upsert falla, la tabla no queda vaciada.
  await eliminarNoVigentes(
    "panel_odoo_ventas",
    filas.map((f) => f.odoo_id),
    {
      topeAlcanzado: ventas.length >= TOPE,
    },
  );

  return count ?? filas.length;
}

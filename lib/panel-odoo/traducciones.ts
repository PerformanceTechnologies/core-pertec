// Diccionarios de traduccion para los codigos/nombres en ingles que Odoo
// devuelve tal cual (stage_id.name, campos "selection", etc.). Centralizados
// aca para que Tarjetas, Listas y Modales usen siempre el mismo mapeo en vez
// de duplicar diccionarios locales que se desincronizan entre si.
//
// Los valores de cada selection se verificaron contra el Odoo real via
// odoo_describe_model (crm.lead.stage_id, account.move, sale.order,
// purchase.order, hr.expense) -- no son una adivinanza. fleet.vehicle y
// project.task no estan en la lista de modelos permitidos por el MCP de
// Odoo, asi que sus diccionarios son mejor esfuerzo con los nombres
// default de Odoo; si el valor real no calza, el fallback deja ver el
// texto crudo en vez de romper la UI.

// Si un valor no esta en el diccionario se muestra tal cual -- nunca se
// rompe la UI por un valor nuevo o no contemplado.
export function traducir(diccionario: Record<string, string>, valor: string | null | undefined): string {
  if (!valor) return "-";
  return diccionario[valor] ?? valor;
}

// crm.lead.stage_id.name -- etapas default de Odoo CRM.
export const ETAPAS_CRM: Record<string, string> = {
  New: "Nuevo",
  Qualified: "Calificado",
  Proposition: "Propuesta",
  Won: "Ganado",
  Lost: "Perdido",
};

// account.move.state (solo 3 valores posibles: draft/posted/cancel).
export const ESTADOS_FACTURA: Record<string, string> = {
  draft: "Borrador",
  posted: "Contabilizada",
  cancel: "Anulada",
};

// account.move.move_type -- el sync solo trae estos 4 (ver sincronizar-facturas.ts).
export const TIPOS_FACTURA: Record<string, string> = {
  out_invoice: "Factura de venta",
  out_refund: "Nota de crédito de venta",
  in_invoice: "Factura de compra",
  in_refund: "Nota de crédito de compra",
};

// account.move.payment_state.
export const ESTADOS_PAGO_FACTURA: Record<string, string> = {
  not_paid: "No pagada",
  in_payment: "En proceso de pago",
  paid: "Pagada",
  partial: "Pago parcial",
  reversed: "Reversada",
  blocked: "Bloqueada",
  invoicing_legacy: "Facturación antigua",
};

// hr.expense.state.
export const ESTADOS_GASTO: Record<string, string> = {
  draft: "Borrador",
  submitted: "Presentado",
  approved: "Aprobado",
  posted: "Contabilizado",
  in_payment: "En proceso de pago",
  paid: "Pagado",
  refused: "Rechazado",
  in_report: "En rendición",
};

// hr.expense.payment_mode.
export const FORMAS_PAGO_GASTO: Record<string, string> = {
  own_account: "Pagado por el empleado",
  company_account: "Pagado por la empresa",
};

// sale.order.state.
export const ESTADOS_VENTA: Record<string, string> = {
  draft: "Cotización",
  sent: "Enviada",
  sale: "Confirmada",
  cancel: "Cancelada",
};

// sale.order.x_rental_state ("Estado de Arriendo").
export const ESTADOS_ARRIENDO: Record<string, string> = {
  draft: "Borrador",
  quotation: "Cotización",
  to_approve: "Por aprobar",
  confirmed: "Confirmado",
  reserved: "Reservado",
  preparation: "En preparación",
  delivered: "Entregado",
  returned: "Devuelto",
  available: "Disponible",
  repair: "En reparación",
  dispute: "En disputa",
  invoiced: "Facturado",
};

// purchase.order.state.
export const ESTADOS_COMPRA: Record<string, string> = {
  draft: "Borrador",
  sent: "Enviada",
  "to approve": "Por aprobar",
  purchase: "Confirmada",
  cancel: "Cancelada",
};

// purchase.order.invoice_status.
export const ESTADOS_FACTURACION_COMPRA: Record<string, string> = {
  no: "Nada que facturar",
  "to invoice": "Por facturar",
  invoiced: "Facturada",
};

// project.task.state (kanban state custom de este Odoo).
export const ESTADOS_TAREA: Record<string, string> = {
  "01_in_progress": "En progreso",
  "02_changes_requested": "Cambios solicitados",
  "03_approved": "Aprobada",
  "1_done": "Hecha",
  "1_canceled": "Cancelada",
  "04_waiting_normal": "En espera",
};

// fleet.vehicle.state_id.name -- nombres default de Odoo Fleet; mejor
// esfuerzo (modelo no consultable via el MCP de Odoo para confirmar).
export const ESTADOS_FLOTA: Record<string, string> = {
  "New Request": "Nueva solicitud",
  "To Approve": "Por aprobar",
  Confirmed: "Confirmado",
  Registered: "Registrado",
  "To Renew": "Por renovar",
  Downgraded: "Dado de baja",
  Reserve: "Reserva",
  "Waiting List": "Lista de espera",
};

// fleet.vehicle.model_id.category_id.name -- categorias default de Odoo Fleet.
export const CATEGORIAS_FLOTA: Record<string, string> = {
  Sedan: "Sedán",
  Break: "Station wagon",
  Coupe: "Coupé",
  Convertible: "Convertible",
  Van: "Furgón",
  Utility: "Utilitario",
  Minivan: "Minivan",
};

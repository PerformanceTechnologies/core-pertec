import CargaPertec from "@/components/CargaPertec";

/**
 * Lo que se ve mientras la página busca los proveedores en Odoo.
 *
 * Son hasta tres consultas XML-RPC por gasto, así que una rendición de dieciséis
 * comprobantes tarda unos segundos antes de poder pintar nada. Sin esto, apretar
 * "Continuar a Odoo" deja la pantalla anterior quieta y parece que no pasó nada — que es
 * exactamente lo que hacía la versión con botón: se apretaba de nuevo.
 */
export default function CargandoPasoOdoo() {
  return <CargaPertec modulo="los proveedores en Odoo" />;
}

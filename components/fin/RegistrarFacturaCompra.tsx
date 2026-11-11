"use client";

import { registrarFacturaCompraAction } from "@/app/(protegido)/gestion-financiera/acciones-compras";
import { BOTON, BOTON_SEC, CAMPO, Campo, ConVentana, FormAccion } from "./ui";

/** «Registrar factura» de una compra: la ventana con el formulario de la factura del proveedor. La usan la tabla de compras, Recepción y Facturas recibidas. */
export default function RegistrarFacturaCompra({ id, codigo, netoCotizado, hoy, principal = false }: { id: string; codigo: string; netoCotizado: number | null; hoy: string; principal?: boolean }) {
  return (
    <ConVentana boton="Registrar factura" titulo={`Factura del proveedor · ${codigo}`} className={principal ? BOTON : BOTON_SEC}>
      {(cerrar) => (
        <FormAccion accion={registrarFacturaCompraAction} textoBoton="Registrar factura" alOk={cerrar}>
          <input type="hidden" name="compraId" value={id} />
          <div className="grid gap-3 sm:grid-cols-3">
            <Campo etiqueta="Tipo"><select name="tipoDte" className={CAMPO}><option value="33">33 · Factura</option><option value="34">34 · Exenta</option><option value="46">46 · Factura de compra</option></select></Campo>
            <Campo etiqueta="Folio *"><input name="folio" required className={CAMPO} /></Campo>
            <Campo etiqueta="Emisión *"><input name="fechaEmision" type="date" required defaultValue={hoy} className={CAMPO} /></Campo>
            <Campo etiqueta="Neto"><input name="neto" defaultValue={netoCotizado ?? ""} className={CAMPO} /></Campo>
            <Campo etiqueta="IVA" ayuda="Vacío = se calcula"><input name="iva" className={CAMPO} /></Campo>
            <Campo etiqueta="Recepción en el SII"><input name="fechaRecepcion" type="date" defaultValue={hoy} className={CAMPO} /></Campo>
          </div>
          <p className="text-[11px] text-gris">El vencimiento se calcula con la condición de pago del proveedor. Diferencias con la OC sobre la tolerancia quedan para revisar.</p>
        </FormAccion>
      )}
    </ConVentana>
  );
}

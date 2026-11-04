"use client";

import { useMemo, useState } from "react";
import { registrarCobroAction } from "@/app/(protegido)/gestion-financiera/acciones-ventas";
import { clp, fechaCl } from "@/lib/fin/reglas";
import { CAMPO, Campo, FormAccion } from "./ui";

export interface FacturaAbierta {
  id: string;
  folio: string;
  clienteId: string | null;
  clienteNombre: string | null;
  fechaEmision: string;
  vence: string | null;
  saldo: number;
}

/**
 * Registrar un cobro: se elige el cliente, aparecen sus facturas con saldo y se reparte el monto
 * (abonos parciales permitidos). Desde el banco llega con el movimiento y el monto ya puestos.
 */
export default function FormCobro({ facturas, cuentas, hoy, alOk, movimiento }: {
  facturas: FacturaAbierta[];
  cuentas: { id: string; nombre: string }[];
  hoy: string;
  alOk?: () => void;
  movimiento?: { id: string; fecha: string; monto: number; cuentaId: string };
}) {
  const clientes = useMemo(() => [...new Map(facturas.map((f) => [f.clienteId ?? "-", f.clienteNombre ?? "Sin cliente"])).entries()], [facturas]);
  // Desde el banco: se sugiere la factura cuyo saldo calza exacto con el abono.
  const exacta = movimiento ? facturas.find((f) => f.saldo === movimiento.monto) : undefined;
  const [cliente, setCliente] = useState<string>(exacta?.clienteId ?? clientes[0]?.[0] ?? "");
  const propias = facturas.filter((f) => (f.clienteId ?? "-") === cliente);
  const [montos, setMontos] = useState<Record<string, string>>(() => (exacta ? { [exacta.id]: String(exacta.saldo) } : {}));
  const aplicaciones = propias.map((f) => ({ documentoId: f.id, monto: Math.round(Number(String(montos[f.id] ?? "").replace(/\./g, "")) || 0) })).filter((a) => a.monto > 0);
  const total = aplicaciones.reduce((s, a) => s + a.monto, 0);

  if (facturas.length === 0) return <p className="text-sm text-gris">No hay facturas emitidas con saldo por cobrar.</p>;
  return (
    <FormAccion accion={registrarCobroAction} textoBoton={`Registrar cobro ${clp(total)}`} alOk={alOk}>
      <input type="hidden" name="aplicaciones" value={JSON.stringify(aplicaciones)} />
      {movimiento && <input type="hidden" name="movimientoId" value={movimiento.id} />}
      <div className="grid gap-3 sm:grid-cols-2">
        <Campo etiqueta="Cliente">
          <select value={cliente} onChange={(e) => (setCliente(e.target.value), setMontos({}))} className={CAMPO}>
            {clientes.map(([id, nombre]) => <option key={id} value={id}>{nombre}</option>)}
          </select>
        </Campo>
        <Campo etiqueta="Fecha del cobro"><input name="fecha" type="date" defaultValue={movimiento?.fecha ?? hoy} className={CAMPO} /></Campo>
        <Campo etiqueta="Cuenta">
          <select name="cuentaId" defaultValue={movimiento?.cuentaId ?? cuentas[0]?.id ?? ""} className={CAMPO}>
            <option value="">—</option>
            {cuentas.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select>
        </Campo>
        <Campo etiqueta="Medio">
          <select name="medio" className={CAMPO} defaultValue="transferencia">
            {["transferencia", "cheque", "vale vista", "factor", "otro"].map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </Campo>
      </div>
      <div>
        <p className="mb-1.5 text-xs font-semibold text-gris">Facturas del cliente (escribe cuánto se aplica a cada una)</p>
        <ul className="divide-y divide-borde rounded-xl border border-borde">
          {propias.map((f) => (
            <li key={f.id} className="flex items-center gap-3 px-3 py-2 text-sm">
              <span className="min-w-0 flex-1">
                <span className="font-semibold text-tinta">N° {f.folio}</span>
                <span className="ml-2 text-[11px] text-gris">{fechaCl(f.fechaEmision)} · vence {fechaCl(f.vence)}</span>
              </span>
              <span className="text-xs tabular-nums text-gris">saldo {clp(f.saldo)}</span>
              <button type="button" onClick={() => setMontos((m) => ({ ...m, [f.id]: String(f.saldo) }))} className="text-[11px] font-semibold text-naranjo hover:underline">Todo</button>
              <input value={montos[f.id] ?? ""} onChange={(e) => setMontos((m) => ({ ...m, [f.id]: e.target.value }))} placeholder="0" inputMode="numeric" className="w-32 rounded-lg border border-borde bg-superficie px-2 py-1 text-right text-sm tabular-nums outline-none focus:border-naranjo/60" />
            </li>
          ))}
        </ul>
        {movimiento && total !== movimiento.monto && <p className="mt-1 text-[11px] text-aviso">El abono del banco es {clp(movimiento.monto)} y estás aplicando {clp(total)}.</p>}
      </div>
      <Campo etiqueta="Referencia (opcional)"><input name="referencia" className={CAMPO} placeholder="N° transferencia, cheque…" /></Campo>
    </FormAccion>
  );
}

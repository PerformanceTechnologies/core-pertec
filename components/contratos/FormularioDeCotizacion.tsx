"use client";

import { useState } from "react";
import BotonGuardar from "./BotonGuardar";
import MensajeDeForm from "./MensajeDeForm";
import { useFormulario } from "./useFormulario";
import { CAMPO } from "@/lib/contratos/estilos";
import {
  ETIQUETAS_DE_MONEDA,
  MONEDAS,
  calcularTotalClp,
  formatearMoneda,
  leerDecimal,
  montoEnCampo,
  type Cotizacion,
  type Moneda,
} from "@/lib/contratos/gastos-modelo";
import { formatearPesos } from "@/lib/contratos/arranque-modelo";
import { guardarCotizacionAction } from "@/app/(protegido)/contratos/[contrato]/acciones-gastos";

const ETIQUETA = "mb-1 block text-[11px] font-bold uppercase tracking-wide text-gris";
const OPCIONAL = <span className="font-normal normal-case text-gris-suave">(opcional)</span>;

/**
 * Alta y edición de una cotización.
 *
 * El total se calcula acá mientras se escribe —precio × cantidad × tipo de cambio— para que quien
 * lo carga vea al instante lo mismo que va a quedar guardado, y no lo descubra en la lista. El
 * servidor lo vuelve a calcular: esta cifra es una vista previa, no la que se guarda.
 *
 * Los montos son campos de texto y no `type="number"`, por lo mismo que en la partida: el selector
 * numérico del navegador no admite los puntos de miles que se pegan desde un correo.
 */
export default function FormularioDeCotizacion({
  partidaId,
  cotizacion,
  cantidadDeLaLinea,
  tiposDeCambio,
  alTerminar,
}: {
  partidaId: string;
  /** Sin cotización es un alta. */
  cotizacion?: Cotizacion;
  cantidadDeLaLinea: number;
  /** El último tipo de cambio usado de cada moneda: se ofrece como valor inicial. */
  tiposDeCambio: { UF?: number; USD?: number };
  alTerminar: () => void;
}) {
  const { estado, enviar, pendiente } = useFormulario(async (previo, datos) => {
    const resultado = await guardarCotizacionAction(partidaId, cotizacion?.id ?? null, previo, datos);
    if (resultado.ok) alTerminar();
    return resultado;
  });

  const [moneda, setMoneda] = useState<Moneda>(cotizacion?.moneda ?? "CLP");
  const [precio, setPrecio] = useState(montoEnCampo(cotizacion?.precioUnitario ?? null));
  const [cantidad, setCantidad] = useState(String(cotizacion?.cantidad ?? cantidadDeLaLinea));
  const [cambio, setCambio] = useState(() => {
    if (cotizacion && cotizacion.moneda !== "CLP") return montoEnCampo(cotizacion.tipoCambio);
    return "";
  });

  // El tipo de cambio sugerido se ofrece al elegir la moneda, sin pisar lo que ya se escribió.
  function elegirMoneda(m: Moneda) {
    setMoneda(m);
    if (m !== "CLP" && cambio === "" && tiposDeCambio[m]) setCambio(montoEnCampo(tiposDeCambio[m] ?? null));
  }

  // La vista previa del total: si algo no se puede leer todavía, simplemente no se muestra.
  let vista: { total: number; unitarioClp: number } | null = null;
  try {
    const p = leerDecimal(precio, "");
    const q = Number(cantidad);
    const c = moneda === "CLP" ? 1 : leerDecimal(cambio, "");
    if (p !== null && c !== null && Number.isInteger(q) && q >= 1) {
      vista = { total: calcularTotalClp(p, q, c), unitarioClp: Math.round(p * c) };
    }
  } catch {
    vista = null;
  }

  const editando = Boolean(cotizacion);

  return (
    <form onSubmit={enviar} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <label className="sm:col-span-2">
        <span className={ETIQUETA}>Proveedor</span>
        <input
          name="proveedor"
          required
          maxLength={120}
          autoComplete="off"
          defaultValue={cotizacion?.proveedor ?? ""}
          placeholder="Ej.: Arquimed"
          className={CAMPO}
        />
      </label>

      <label className="sm:col-span-2">
        <span className={ETIQUETA}>Qué cotizó {OPCIONAL}</span>
        <input
          name="descripcion"
          maxLength={200}
          autoComplete="off"
          defaultValue={cotizacion?.descripcion ?? ""}
          placeholder="Ej.: Seca mBCA Alpha, con instalación"
          className={CAMPO}
        />
      </label>

      <label>
        <span className={ETIQUETA}>Estado</span>
        <select name="estado" defaultValue={cotizacion?.estado === "descartada" ? "descartada" : (cotizacion?.estado ?? "solicitada")} className={CAMPO}>
          <option value="solicitada">Solicitada (esperando precio)</option>
          <option value="recibida">Recibida (con precio)</option>
          <option value="descartada">Descartada</option>
        </select>
      </label>

      <label>
        <span className={ETIQUETA}>Cantidad</span>
        <input
          name="cantidad"
          inputMode="numeric"
          autoComplete="off"
          value={cantidad}
          onChange={(e) => setCantidad(e.target.value)}
          className={CAMPO}
        />
      </label>

      <label>
        <span className={ETIQUETA}>Moneda</span>
        <select name="moneda" value={moneda} onChange={(e) => elegirMoneda(e.target.value as Moneda)} className={CAMPO}>
          {MONEDAS.map((m) => (
            <option key={m} value={m}>
              {ETIQUETAS_DE_MONEDA[m]}
            </option>
          ))}
        </select>
      </label>

      <label>
        <span className={ETIQUETA}>
          Precio unitario <span className="font-normal normal-case text-gris-suave">(neto)</span>
        </span>
        <input
          name="precio_unitario"
          inputMode="decimal"
          autoComplete="off"
          value={precio}
          onChange={(e) => setPrecio(e.target.value)}
          placeholder={moneda === "CLP" ? "8.390.000" : "1.250,50"}
          className={CAMPO}
        />
      </label>

      {moneda !== "CLP" && (
        <label className="sm:col-span-2">
          <span className={ETIQUETA}>
            Tipo de cambio <span className="font-normal normal-case text-gris-suave">(pesos por {moneda === "UF" ? "UF" : "dólar"})</span>
          </span>
          <input
            name="tipo_cambio"
            inputMode="decimal"
            autoComplete="off"
            value={cambio}
            onChange={(e) => setCambio(e.target.value)}
            placeholder={moneda === "UF" ? "39.500,25" : "945,50"}
            className={CAMPO}
          />
          <span className="mt-1 block text-[11px] text-gris-suave">
            Escríbelo del día en que se cotizó: queda guardado con la cotización, para que el total en pesos no
            cambie después.
          </span>
        </label>
      )}

      {vista && (
        <div className="rounded-lg bg-cian-lavado/60 px-3 py-2.5 sm:col-span-2" role="status">
          <p className="text-[11px] font-bold uppercase tracking-wide text-gris">Total en pesos, neto</p>
          <p className="text-xl font-extrabold tabular-nums text-azul">{formatearPesos(vista.total)}</p>
          <p className="text-[11px] text-gris">
            {cantidad} × {moneda === "CLP" ? formatearPesos(vista.unitarioClp) : `${formatearMoneda(leerDecimalSeguro(precio), moneda)} ≈ ${formatearPesos(vista.unitarioClp)}`}
          </p>
        </div>
      )}

      <label>
        <span className={ETIQUETA}>Plazo de entrega (días) {OPCIONAL}</span>
        <input
          name="plazo_entrega_dias"
          inputMode="numeric"
          autoComplete="off"
          defaultValue={cotizacion?.plazoEntregaDias ?? ""}
          placeholder="8"
          className={CAMPO}
        />
      </label>

      <label>
        <span className={ETIQUETA}>Garantía {OPCIONAL}</span>
        <input name="garantia" maxLength={120} defaultValue={cotizacion?.garantia ?? ""} placeholder="12 meses" className={CAMPO} />
      </label>

      <label className="sm:col-span-2">
        <span className={ETIQUETA}>Condiciones de pago {OPCIONAL}</span>
        <input
          name="condiciones_pago"
          maxLength={200}
          defaultValue={cotizacion?.condicionesPago ?? ""}
          placeholder="50% anticipo, 50% contra entrega"
          className={CAMPO}
        />
      </label>

      <label>
        <span className={ETIQUETA}>Precio vigente hasta {OPCIONAL}</span>
        <input type="date" name="vigencia_hasta" defaultValue={cotizacion?.vigenciaHasta ?? ""} className={CAMPO} />
      </label>

      <label>
        <span className={ETIQUETA}>Respuesta esperada para {OPCIONAL}</span>
        <input type="date" name="respuesta_esperada" defaultValue={cotizacion?.respuestaEsperada ?? ""} className={CAMPO} />
      </label>

      <label className="sm:col-span-2">
        <span className={ETIQUETA}>Por confirmar antes de la orden de compra {OPCIONAL}</span>
        <textarea
          name="por_confirmar"
          rows={2}
          maxLength={1000}
          defaultValue={cotizacion?.porConfirmar ?? ""}
          placeholder="Costo de la licencia del 3er año, dónde se guardan los datos, mantención en el norte…"
          className={`${CAMPO} resize-y`}
        />
      </label>

      <label className="sm:col-span-2">
        <span className={ETIQUETA}>Notas {OPCIONAL}</span>
        <textarea name="notas" rows={2} maxLength={1000} defaultValue={cotizacion?.notas ?? ""} className={`${CAMPO} resize-y`} />
      </label>

      <div className="flex flex-wrap items-center gap-3 border-t border-borde pt-4 sm:col-span-2">
        <BotonGuardar pendiente={pendiente}>{editando ? "Guardar cambios" : "Agregar cotización"}</BotonGuardar>
        <button
          type="button"
          onClick={alTerminar}
          className="min-h-11 px-2 text-xs font-bold uppercase tracking-wide text-gris transition hover:text-azul"
        >
          Cancelar
        </button>
        <MensajeDeForm estado={estado} />
      </div>
    </form>
  );
}

/** Para la línea de «cantidad × precio»: el precio que se escribió, o null si todavía no se lee. */
function leerDecimalSeguro(valor: string): number | null {
  try {
    return leerDecimal(valor, "");
  } catch {
    return null;
  }
}

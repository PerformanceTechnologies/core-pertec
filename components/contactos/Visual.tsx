import { IconAlertTriangle, IconBuilding, IconCircleCheck, IconUser } from "@tabler/icons-react";
import { formatearRut } from "@/lib/contratos/rut";
import { bloqueReceptor, iniciales, type DatosContacto, type DatosPersona, type Faltante } from "@/lib/contactos-modelo";

// El vocabulario visual de Contactos: avatar, rol (cliente/proveedor), si está listo para
// facturar y el bloque del receptor tal como sale impreso en la factura.

/** Un tono estable por nombre, para que cada contacto tenga siempre el mismo color de avatar. */
const TONOS = ["bg-naranjo/12 text-naranjo", "bg-cian/12 text-cian", "bg-sky-500/12 text-sky-500", "bg-violet-500/12 text-violet-500", "bg-amber-500/14 text-amber-500"];

export function Avatar({ nombre, tipo, grande = false }: { nombre: string; tipo: DatosContacto["tipoPersona"]; grande?: boolean }) {
  let h = 0;
  for (const ch of nombre) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return (
    <span
      className={`relative grid shrink-0 place-items-center rounded-2xl font-bold ${TONOS[h % TONOS.length]} ${grande ? "h-16 w-16 text-xl" : "h-10 w-10 text-sm"}`}
      aria-hidden
    >
      {iniciales(nombre)}
      <span className={`absolute -bottom-1 -right-1 grid place-items-center rounded-full border-2 border-superficie bg-superficie text-gris ${grande ? "h-6 w-6" : "h-5 w-5"}`}>
        {tipo === "empresa" ? <IconBuilding size={grande ? 13 : 11} /> : <IconUser size={grande ? 13 : 11} />}
      </span>
    </span>
  );
}

export function Rut({ rut, claro = false }: { rut: string | null; claro?: boolean }) {
  if (!rut) return <span className={`text-xs italic ${claro ? "texto-banda-65" : "text-gris-suave"}`}>Sin RUT</span>;
  return <span className={`font-mono text-xs tabular-nums ${claro ? "texto-banda-65" : "text-gris"}`}>{formatearRut(rut)}</span>;
}

/** Cliente / Proveedor. `enBanda`: sobre la cabecera de contraste, donde el tinte no se lee. */
export function ChipsRol({ cliente, proveedor, enBanda = false }: { cliente: boolean; proveedor: boolean; enBanda?: boolean }) {
  if (!cliente && !proveedor) return enBanda ? null : <span className="text-xs text-gris-suave">—</span>;
  const chip = "rounded-full px-2 py-0.5 text-[11px] font-semibold";
  return (
    <span className="inline-flex flex-wrap gap-1">
      {cliente && <span className={`${chip} ${enBanda ? "borde-banda texto-banda border" : "bg-cian/12 text-cian-texto"}`}>Cliente</span>}
      {proveedor && <span className={`${chip} ${enBanda ? "borde-banda texto-banda border" : "bg-naranjo/12 text-naranjo"}`}>Proveedor</span>}
    </span>
  );
}

/** «Listo para facturar» o cuántos datos le faltan, con el detalle en el title. */
export function EstadoFactura({ faltantes, compacto = false }: { faltantes: Faltante[]; compacto?: boolean }) {
  const bloquean = faltantes.filter((f) => f.bloquea);
  if (bloquean.length === 0) {
    return (
      <span className="tono-ok fondo-tono inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold">
        <IconCircleCheck size={13} stroke={2} /> {compacto ? "Listo" : "Listo para facturar"}
      </span>
    );
  }
  return (
    <span
      title={bloquean.map((f) => f.texto).join("\n")}
      className="tono-aviso fondo-tono inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold"
    >
      <IconAlertTriangle size={13} stroke={2} /> {bloquean.length === 1 && !compacto ? bloquean[0].texto : `Faltan ${bloquean.length} dato${bloquean.length > 1 ? "s" : ""}`}
    </span>
  );
}

/**
 * El bloque del receptor como lo imprime la factura electrónica: lo que el SII va a leer.
 * Un dato que falta se muestra marcado en vez de vacío, para que se vea qué completar.
 */
export function VistaReceptor({
  contacto,
  atencion,
}: {
  contacto: DatosContacto;
  atencion?: Pick<DatosPersona, "nombre" | "telefono" | "correo"> | null;
}) {
  const r = bloqueReceptor(contacto, atencion);
  const falta = (v: string | null | undefined, texto = "Falta") =>
    v ? v : <span className="tono-aviso rounded bg-amber-500/10 px-1 text-[11px] font-semibold">{texto}</span>;
  return (
    <div className="overflow-hidden rounded-xl border border-borde bg-superficie text-[12px] leading-snug text-tinta">
      <div className="flex items-center justify-between border-b border-borde bg-tinta/[0.03] px-3 py-1.5">
        <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-gris">Señor(es)</span>
        <span className="text-[10px] font-semibold text-gris-suave">Así se verá en la factura</span>
      </div>
      <dl className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-x-2 gap-y-1 px-3 py-2.5">
        <dt className="font-semibold text-gris">R.U.T.</dt>
        <dd className="font-mono">{falta(r.rut ? formatearRut(r.rut) : null)}</dd>
        <dt className="font-semibold text-gris">Razón social</dt>
        <dd className="break-words font-semibold">{falta(r.razonSocial)}</dd>
        <dt className="font-semibold text-gris">Giro</dt>
        <dd className="break-words">{falta(r.giro)}</dd>
        <dt className="font-semibold text-gris">Dirección</dt>
        <dd className="break-words">{falta(r.direccion)}</dd>
        <dt className="font-semibold text-gris">Comuna</dt>
        <dd>
          {falta(r.comuna)}
          {r.ciudad ? <span className="text-gris"> · {r.ciudad}</span> : null}
        </dd>
        {r.contacto && (
          <>
            <dt className="font-semibold text-gris">Atención</dt>
            <dd className="break-words">{r.contacto}</dd>
          </>
        )}
      </dl>
    </div>
  );
}

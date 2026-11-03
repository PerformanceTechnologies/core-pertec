import { fechaCorta, monto, montoCorto, type LineaCompra } from "@/lib/valorizacion-historica-modelo";
import { COLORES } from "./Piezas";

/**
 * Cómo cambió el costo unitario real de un ítem en el tiempo: un punto por compra (con cantidad
 * positiva), del color de su proveedor. Con una sola compra no hay nada que dibujar.
 */
export default function GraficoCostos({ lineas }: { lineas: LineaCompra[] }) {
  const compras = lineas
    .filter((l) => (l.cantidad ?? 0) > 0 && l.costoUnitario !== null)
    .sort((a, b) => a.fecha.localeCompare(b.fecha) || a.n - b.n);
  if (compras.length < 2) return null;

  const W = 720, H = 230, M = { izq: 64, der: 16, arr: 16, aba: 34 };
  const t = (iso: string) => new Date(`${iso}T00:00:00Z`).getTime();
  const t0 = t(compras[0].fecha), t1 = t(compras[compras.length - 1].fecha);
  const costos = compras.map((l) => l.costoUnitario!);
  const cMax = Math.max(...costos), cMin = Math.min(...costos);
  // Un margen arriba y abajo para que los puntos no toquen el borde; si todos cuestan lo mismo, se abre.
  const pad = (cMax - cMin) * 0.12 || cMax * 0.2 || 1;
  const yMin = Math.max(0, cMin - pad), yMax = cMax + pad;
  const x = (iso: string) => (t1 === t0 ? (W + M.izq - M.der) / 2 : M.izq + ((t(iso) - t0) / (t1 - t0)) * (W - M.izq - M.der));
  const y = (c: number) => M.arr + (1 - (c - yMin) / (yMax - yMin)) * (H - M.arr - M.aba);

  const proveedores = [...new Set(compras.map((l) => l.proveedor))];
  const color = new Map(proveedores.map((p, i) => [p, COLORES[i % COLORES.length]]));
  const marcas = [yMin, (yMin + yMax) / 2, yMax];
  const ruta = compras.map((l, i) => `${i ? "L" : "M"}${x(l.fecha).toFixed(1)},${y(l.costoUnitario!).toFixed(1)}`).join(" ");

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Costo unitario por compra">
        {marcas.map((m) => (
          <g key={m}>
            <line x1={M.izq} x2={W - M.der} y1={y(m)} y2={y(m)} className="stroke-borde" strokeDasharray="3 4" />
            <text x={M.izq - 8} y={y(m) + 4} textAnchor="end" className="fill-gris text-[11px] tabular-nums">
              {montoCorto(m)}
            </text>
          </g>
        ))}
        <text x={M.izq} y={H - 10} className="fill-gris text-[11px]">{fechaCorta(compras[0].fecha)}</text>
        <text x={W - M.der} y={H - 10} textAnchor="end" className="fill-gris text-[11px]">{fechaCorta(compras[compras.length - 1].fecha)}</text>
        <path d={ruta} fill="none" className="stroke-tinta/25" strokeWidth={1.5} />
        {compras.map((l) => (
          <circle key={l.n} cx={x(l.fecha)} cy={y(l.costoUnitario!)} r={5} fill={color.get(l.proveedor)} className="stroke-superficie" strokeWidth={2}>
            <title>{`${fechaCorta(l.fecha)} · ${l.proveedor}\n${monto(l.costoUnitario!)} c/u × ${l.cantidad}`}</title>
          </circle>
        ))}
      </svg>
      {proveedores.length > 1 && (
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 px-1">
          {proveedores.map((p) => (
            <span key={p} className="inline-flex items-center gap-1.5 text-[11px] text-gris">
              <span className="h-2 w-2 rounded-full" style={{ background: color.get(p) }} /> {p}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

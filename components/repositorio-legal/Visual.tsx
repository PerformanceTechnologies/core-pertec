import { PASTILLA_ESTADO } from "@/lib/estilos";
import { ETIQUETA_ESTADO, type Estado, type EstadoClave } from "@/lib/repositorio-legal/modelo";

const TONO: Record<Estado, string> = {
  vencido: "bg-alerta/12 text-alerta",
  por_vencer: "bg-aviso/15 text-aviso",
  vigente: "bg-ok/12 text-ok",
  no_vence: "bg-tinta/[0.06] text-gris",
  sin_fecha: "bg-naranjo/12 text-naranjo",
  historico: "bg-tinta/[0.04] text-gris-suave",
};

export function ChipEstado({ estado }: { estado: Estado }) {
  return <span className={`${PASTILLA_ESTADO} ${TONO[estado]}`}>{ETIQUETA_ESTADO[estado]}</span>;
}

const TONO_CLAVE: Record<EstadoClave, string> = {
  ok: "border-ok/30 bg-ok/[0.06] text-ok",
  por_vencer: "border-aviso/40 bg-aviso/[0.08] text-aviso",
  vencido: "border-alerta/40 bg-alerta/[0.07] text-alerta",
  falta: "border-borde bg-tinta/[0.03] text-gris",
};

export const ETIQUETA_CLAVE: Record<EstadoClave, string> = { ok: "Al día", por_vencer: "Por vencer", vencido: "Vencido", falta: "Falta" };

export function claseClave(estado: EstadoClave): string {
  return TONO_CLAVE[estado];
}

export function Cifra({ valor, etiqueta, tono }: { valor: number | string; etiqueta: string; tono?: "alerta" | "aviso" | "ok" | "naranjo" }) {
  const color = tono === "alerta" ? "text-alerta" : tono === "aviso" ? "text-aviso" : tono === "ok" ? "text-ok" : tono === "naranjo" ? "text-naranjo" : "text-tinta";
  return (
    <div className="rounded-xl border border-borde bg-superficie px-4 py-3 shadow-[0_1px_2px_rgba(23,20,17,0.04)]">
      <p className={`font-condensed text-2xl font-bold ${color}`}>{valor}</p>
      <p className="text-xs text-gris">{etiqueta}</p>
    </div>
  );
}

export function pesoLegible(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

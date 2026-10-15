import { ETIQUETAS_ETAPA, type Etapa } from "@/lib/contratos/acreditacion-modelo";

const CLASES: Record<Etapa, string> = {
  documentacion: "border-amber-200 bg-amber-50 text-amber-700",
  web_control: "border-cian/50 bg-cian-lavado text-azul",
  buk: "border-cian/50 bg-cian-lavado text-azul",
  acreditada: "border-emerald-200 bg-emerald-50 text-emerald-700",
};

/** En qué punto del camino a la acreditación está una persona. */
export default function ChipDeEtapa({ etapa }: { etapa: Etapa }) {
  return (
    <span
      className={`inline-flex items-center rounded-lg border px-2 py-1 text-[11px] font-bold uppercase tracking-wide ${CLASES[etapa]}`}
    >
      {ETIQUETAS_ETAPA[etapa]}
    </span>
  );
}

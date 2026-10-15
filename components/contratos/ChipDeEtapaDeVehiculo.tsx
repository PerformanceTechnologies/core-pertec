import { ETIQUETAS_ETAPA_VEHICULO, type EtapaVehiculo } from "@/lib/contratos/vehiculos-modelo";

const CLASES: Record<EtapaVehiculo, string> = {
  documentacion: "border-amber-200 bg-amber-50 text-amber-700",
  web_control: "border-cian/50 bg-cian-lavado text-azul",
  acreditado: "border-emerald-200 bg-emerald-50 text-emerald-700",
};

/** En qué punto del camino a la acreditación está un vehículo. */
export default function ChipDeEtapaDeVehiculo({ etapa }: { etapa: EtapaVehiculo }) {
  return (
    <span
      className={`inline-flex items-center rounded-lg border px-2 py-1 text-[11px] font-bold uppercase tracking-wide ${CLASES[etapa]}`}
    >
      {ETIQUETAS_ETAPA_VEHICULO[etapa]}
    </span>
  );
}

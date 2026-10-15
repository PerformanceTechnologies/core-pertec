import {
  ETAPAS_DE_REQUISITO,
  ETIQUETAS_DE_ETAPA,
  totalDeEtapas,
  type EtapaDeRequisito,
  type EtapasDeRequisitos,
} from "@/lib/contratos/documento-estado";

/** «3 validados», «1 en revisión»…: el plural de cada etapa, para el texto de ayuda. */
const PLURAL: Record<EtapaDeRequisito, [string, string]> = {
  validado: ["validado", "validados"],
  en_revision: ["en revisión", "en revisión"],
  borrador: ["borrador", "borradores"],
  pendiente: ["pendiente", "pendientes"],
};

/** «1 validado», «3 borradores». */
export function cantidadDeEtapa(etapa: EtapaDeRequisito, n: number): string {
  return `${n} ${PLURAL[etapa][n === 1 ? 0 : 1]}`;
}

export function textoDeEtapas(etapas: EtapasDeRequisitos): string {
  return ETAPAS_DE_REQUISITO.filter((e) => etapas[e] > 0)
    .map((e) => cantidadDeEtapa(e, etapas[e]))
    .join(", ");
}

/**
 * Una barra partida por etapa: cuánto va validado, en revisión, en borrador y cuánto falta.
 *
 * Reemplaza a la barra de un solo color donde importa saber no solo CUÁNTOS requisitos
 * tienen algo subido, sino en qué estado está lo subido: un 60% «subido» hecho de borradores
 * es muy distinto de uno hecho de documentos validados. Los tramos van del más avanzado al
 * más atrás, así que el verde se acumula a la izquierda y lo pendiente queda como el fondo.
 *
 * El texto lo dice también (aria-label): la barra sola no la lee un lector de pantalla, y los
 * colores no los distingue quien no los ve bien.
 */
export default function BarraDeEtapas({
  etapas,
  fina = false,
}: {
  etapas: EtapasDeRequisitos;
  fina?: boolean;
}) {
  const total = totalDeEtapas(etapas);
  if (total === 0) return null;

  return (
    <div
      className={`barra-etapas ${fina ? "barra-etapas--fina" : ""}`}
      role="img"
      aria-label={`De ${total} requisitos: ${textoDeEtapas(etapas)}`}
    >
      {ETAPAS_DE_REQUISITO.filter((e) => etapas[e] > 0).map((e) => (
        // flex: n 1 0% reparte el ancho en proporción sin desbordar por las rendijas.
        <i key={e} data-etapa={e} style={{ flex: `${etapas[e]} 1 0%` }} title={`${ETIQUETAS_DE_ETAPA[e]}: ${etapas[e]}`} />
      ))}
    </div>
  );
}

/** La leyenda de la barra: un punto de color y la cantidad, solo de las etapas que tienen algo. */
export function LeyendaDeEtapas({ etapas }: { etapas: EtapasDeRequisitos }) {
  const presentes = ETAPAS_DE_REQUISITO.filter((e) => etapas[e] > 0);
  if (presentes.length === 0) return null;

  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-gris" aria-hidden>
      {presentes.map((e) => (
        <li key={e} className="inline-flex items-center gap-1.5">
          <span className="punto-etapa" data-etapa={e} />
          <strong className="font-extrabold tabular-nums text-tinta">{etapas[e]}</strong>
          {ETIQUETAS_DE_ETAPA[e].toLowerCase()}
        </li>
      ))}
    </ul>
  );
}

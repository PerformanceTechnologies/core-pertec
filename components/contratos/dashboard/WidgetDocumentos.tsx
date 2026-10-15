import Link from "@/components/contratos/Enlace";
import { IconFolder, IconPlugConnected } from "@tabler/icons-react";
import CajaDeWidget, { VacioDeWidget, WidgetNoDisponible } from "./CajaDeWidget";
import { BarraPartida, Dona, Leyenda, Pastilla, type Tramo } from "./graficos";
import { ETAPAS_DE_REQUISITO, ETIQUETAS_DE_ETAPA, type EtapasDeRequisitos } from "@/lib/contratos/documento-estado";
import { tonoDePlazo, type DocumentosDelTablero } from "@/lib/contratos/dashboard-modelo";
import { textoDePlazo, type LecturaDePlazo } from "@/lib/contratos/plazos-modelo";

/** Los colores de las etapas: los mismos de las barras de la lista de documentos. */
const COLOR_DE_ETAPA: Record<string, string> = {
  validado: "var(--etapa-validado)",
  en_revision: "var(--etapa-revision)",
  borrador: "var(--etapa-borrador)",
  pendiente: "var(--color-borde)",
};

export function tramosDeEtapas(etapas: EtapasDeRequisitos): Tramo[] {
  return ETAPAS_DE_REQUISITO.map((e) => ({
    clave: e,
    etiqueta: ETIQUETAS_DE_ETAPA[e],
    valor: etapas[e],
    color: COLOR_DE_ETAPA[e],
  }));
}

/** «1.1 Carpeta de Arranque v2 2023 Codelco» → el nombre sin el número, y el número aparte. */
function partirNumero(nombre: string): { numero: string | null; texto: string } {
  const m = nombre.match(/^\s*(\d+(?:\.\d+)*)[.\s-]+(.*)$/);
  return m ? { numero: m[1], texto: m[2] || nombre } : { numero: null, texto: nombre };
}

/**
 * Documentos generales: en qué etapa de revisión están los requisitos del contrato.
 *
 * La dona responde «¿cuánto está realmente listo?»: no es lo mismo un requisito entregado como
 * borrador que uno validado, y la dona lo separa. Debajo, cada grupo (1.1, 1.2…) con su propia
 * barra partida, para ver cuál es el que frena.
 *
 * Documentos vive en SharePoint, así que este widget es el que puede no tener datos: sin
 * conexión ofrece conectar, y si falla dice por qué sin tumbar el resto del tablero.
 */
export default function WidgetDocumentos({
  datos,
  plazo,
}: {
  datos: DocumentosDelTablero;
  plazo: LecturaDePlazo | null;
}) {
  const href = "/contratos/DOCUMENTOS%20GENERALES";

  if (datos.estado === "sin_conexion") {
    return (
      <CajaDeWidget titulo="Documentos generales" subtitulo="Requisitos del contrato" icono={<IconFolder size={18} stroke={1.8} />}>
        <VacioDeWidget
          icono={<IconPlugConnected size={22} />}
          titulo="Falta conectar SharePoint"
          texto="Los documentos viven en SharePoint. Conéctalo una vez y acá verás en qué etapa va cada requisito."
          accion={
            <Link
              href="/contratos"
              className="inline-flex min-h-10 items-center rounded-lg bg-azul px-4 text-xs font-bold uppercase tracking-wide text-white transition hover:bg-azul-suave"
            >
              Conectar SharePoint
            </Link>
          }
        />
      </CajaDeWidget>
    );
  }

  if (datos.estado === "error") {
    return <WidgetNoDisponible titulo="Documentos generales" mensaje={`No se pudo leer SharePoint: ${datos.mensaje}`} />;
  }

  const tramos = tramosDeEtapas(datos.etapas);
  const entregados = datos.total.subidos;

  return (
    <CajaDeWidget
      titulo="Documentos generales"
      subtitulo={
        datos.total.total === 0
          ? "Sin requisitos todavía"
          : `${entregados} de ${datos.total.total} requisitos entregados`
      }
      icono={<IconFolder size={18} stroke={1.8} />}
      href={href}
      derecha={plazo && <Pastilla tono={tonoDePlazo(plazo)}>{textoDePlazo(plazo)}</Pastilla>}
    >
      {datos.total.total === 0 ? (
        <VacioDeWidget
          icono={<IconFolder size={22} />}
          titulo="Todavía no hay requisitos"
          texto="Cada carpeta de DOCUMENTOS GENERALES en SharePoint es un requisito que se sigue desde acá."
        />
      ) : (
        <div className="space-y-5">
          <div className="flex flex-col items-center gap-5 sm:flex-row">
            <Dona tramos={tramos} titulo="Requisitos por etapa de revisión">
              <span className="text-[26px] font-extrabold leading-none tabular-nums text-tinta">
                {datos.total.porcentaje}
                <span className="text-sm font-bold text-gris">%</span>
              </span>
              <span className="mt-0.5 text-[10px] font-bold uppercase tracking-wide text-gris">entregado</span>
            </Dona>
            <div className="w-full min-w-0 flex-1">
              <Leyenda tramos={tramos} />
              {datos.etapas.validado > 0 && (
                <p className="mt-3 text-[11px] text-gris">
                  <strong className="text-tinta">{Math.round((datos.etapas.validado / datos.total.total) * 100)}%</strong>{" "}
                  está validado de punta a punta.
                </p>
              )}
            </div>
          </div>

          {datos.grupos.length > 0 && (
            <div>
              <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-gris">Por carpeta</p>
              <ul className="space-y-2">
                {datos.grupos.map((g) => {
                  const { numero, texto } = partirNumero(g.nombre);
                  return (
                    <li key={g.nombre}>
                      <Link href={g.href} className="dash-fila-enlace -mx-2 block rounded-lg px-2 py-1.5 transition">
                        <span className="flex items-baseline justify-between gap-3 text-xs">
                          <span className="min-w-0 truncate">
                            {numero && <span className="mr-1.5 font-bold tabular-nums text-cian-texto">{numero}</span>}
                            <span className="font-semibold text-tinta">{texto}</span>
                          </span>
                          <span className="shrink-0 tabular-nums text-gris">
                            {g.avance.subidos}/{g.avance.total}
                          </span>
                        </span>
                        <span className="mt-1.5 block">
                          <BarraPartida tramos={tramosDeEtapas(g.etapas)} alto={7} titulo={`Etapas de ${g.nombre}`} />
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>
      )}
    </CajaDeWidget>
  );
}

import Link from "@/components/contratos/Enlace";
import type { CeldaDeDocumento, EstadoVisible, TipoDocumento } from "@/lib/contratos/acreditacion-modelo";
import { ETIQUETAS_DOCUMENTO } from "@/lib/contratos/acreditacion-modelo";
import { TARJETA } from "@/lib/contratos/estilos";

/** Cómo se llama lo que se acredita, en los textos de la matriz. */
export interface TerminosDeMatriz {
  /** El encabezado de la primera columna. */
  sujeto: string;
  noLoPide: string;
  sinFilas: string;
  sinFilasAyuda: string;
  pieDeTabla: string;
}

export const TERMINOS_DE_MATRIZ_DE_PERSONAS: TerminosDeMatriz = {
  sujeto: "Persona",
  noLoPide: "No lo pide el cargo",
  sinFilas: "No hay personas que mostrar",
  sinFilasAyuda: "Da de alta a alguien o cambia el filtro de cargo.",
  pieDeTabla: "Desliza de lado para ver todos los documentos. Toca el nombre de una persona para abrir su ficha.",
};

export const TERMINOS_DE_MATRIZ_DE_VEHICULOS: TerminosDeMatriz = {
  sujeto: "Vehículo",
  noLoPide: "No lo pide el tipo de vehículo",
  sinFilas: "No hay vehículos que mostrar",
  sinFilasAyuda: "Da de alta un vehículo o cambia el filtro de tipo.",
  pieDeTabla: "Desliza de lado para ver todos los documentos. Toca la patente de un vehículo para abrir su ficha.",
};

export interface FilaDeMatriz {
  id: string;
  numero: number;
  nombre: string;
  /** La segunda línea: el cargo de la persona o el tipo de vehículo. */
  cargo: string;
  porcentaje: number;
  activo: boolean;
  celdas: ReadonlyMap<string, CeldaDeDocumento>;
}

/** Una marca por celda: el estado se lee por color y por forma, no solo por color. */
function Marca({ celda }: { celda: CeldaDeDocumento | undefined }) {
  if (!celda || !celda.requerido) {
    // Un punto tenue: está en el catálogo pero este cargo no lo pide. Distinguirlo
    // de "no aplica" importa — uno es una decisión sobre la persona, el otro es la
    // regla del cargo.
    return <span className="block h-1 w-1 rounded-full bg-borde" aria-hidden />;
  }

  const estado: EstadoVisible = celda.estado;
  switch (estado) {
    case "cargado":
      return <span className="block h-4 w-4 rounded-full bg-emerald-500" aria-hidden />;
    case "no_aplica":
      return <span className="block h-0.5 w-3 rounded-full bg-gris-suave" aria-hidden />;
    case "vencido":
    case "observado":
      return (
        <span
          className="flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-extrabold leading-none text-white"
          aria-hidden
        >
          !
        </span>
      );
    default:
      return <span className="block h-4 w-4 rounded-full border-2 border-amber-400" aria-hidden />;
  }
}

function textoAccesible(celda: CeldaDeDocumento | undefined, noLoPide: string): string {
  if (!celda || !celda.requerido) return noLoPide.toLowerCase();
  return ETIQUETAS_DOCUMENTO[celda.estado].toLowerCase();
}

/**
 * La matriz: una fila por persona, una columna por documento.
 *
 * Es la forma de la hoja Consolidado, para lo único en que una tabla le gana a
 * una ficha: ver de un vistazo QUÉ falta en TODO el equipo. La columna del nombre
 * queda fija al desplazar de lado, y los títulos van en vertical como en el
 * Excel — 25 nombres de documento en horizontal no caben en ninguna pantalla.
 */
export default function MatrizDeAcreditacion({
  tipos,
  filas,
  hrefBase = "/contratos/acreditacion",
  terminos = TERMINOS_DE_MATRIZ_DE_PERSONAS,
}: {
  tipos: TipoDocumento[];
  filas: FilaDeMatriz[];
  /** La ruta del submódulo, para enlazar a la ficha de cada fila. */
  hrefBase?: string;
  terminos?: TerminosDeMatriz;
}) {
  const grupos: { grupo: string; cantidad: number }[] = [];
  for (const t of tipos) {
    const ultimo = grupos[grupos.length - 1];
    if (ultimo?.grupo === t.grupo) ultimo.cantidad++;
    else grupos.push({ grupo: t.grupo, cantidad: 1 });
  }

  if (filas.length === 0) {
    return (
      <div className={`${TARJETA} mt-6 p-10 text-center`}>
        <p className="text-sm font-semibold text-tinta">{terminos.sinFilas}</p>
        <p className="mt-1 text-xs text-gris">{terminos.sinFilasAyuda}</p>
      </div>
    );
  }

  return (
    <>
      <ul className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-xs text-gris" aria-label="Leyenda">
        <li className="flex items-center gap-2"><span className="block h-4 w-4 rounded-full bg-emerald-500" />Cargado</li>
        <li className="flex items-center gap-2"><span className="block h-4 w-4 rounded-full border-2 border-amber-400" />Pendiente</li>
        <li className="flex items-center gap-2">
          <span className="flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-extrabold leading-none text-white">!</span>
          Vencido u observado
        </li>
        <li className="flex items-center gap-2"><span className="block h-0.5 w-3 rounded-full bg-gris-suave" />No aplica</li>
        <li className="flex items-center gap-2"><span className="block h-1 w-1 rounded-full bg-borde" />{terminos.noLoPide}</li>
      </ul>

      <div className={`${TARJETA} mt-3 overflow-x-auto`}>
        <table className="w-full border-separate border-spacing-0 text-sm">
          <thead>
            <tr>
              <th
                rowSpan={2}
                className="sticky left-0 z-20 min-w-44 border-b border-borde bg-superficie px-3 py-2 text-left align-bottom text-[11px] font-bold uppercase tracking-wide text-gris sm:min-w-56"
              >
                {terminos.sujeto}
              </th>
              <th
                rowSpan={2}
                className="border-b border-borde bg-superficie px-2 py-2 text-right align-bottom text-[11px] font-bold uppercase tracking-wide text-gris"
              >
                %
              </th>
              {grupos.map((g) => (
                <th
                  key={g.grupo}
                  colSpan={g.cantidad}
                  className="border-b border-l border-borde bg-cian-lavado/60 px-1 py-1.5 text-center text-[10px] font-bold uppercase tracking-wide text-azul"
                >
                  {/* En un grupo de una sola columna el nombre no cabe: queda
                      completo en el tooltip. */}
                  <span title={g.grupo} className="block truncate">
                    {g.cantidad > 1 ? g.grupo : ""}
                  </span>
                </th>
              ))}
            </tr>
            <tr>
              {tipos.map((t, i) => (
                <th
                  key={t.id}
                  title={t.nombre}
                  className={`h-40 w-9 min-w-9 border-b border-borde px-0 pb-2 align-bottom ${
                    i === 0 || tipos[i - 1].grupo !== t.grupo ? "border-l" : ""
                  }`}
                >
                  <span className="mx-auto block rotate-180 whitespace-nowrap text-left text-[11px] font-semibold text-gris [writing-mode:vertical-rl]">
                    {t.nombre}
                  </span>
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {filas.map((f) => (
              <tr key={f.id} className={`group ${f.activo ? "" : "opacity-50"}`}>
                <th
                  scope="row"
                  className="sticky left-0 z-10 border-b border-borde bg-superficie px-3 py-2 text-left font-normal group-hover:bg-cian-lavado"
                >
                  <Link href={`${hrefBase}/${f.id}`} className="block min-w-0">
                    <span className="block truncate text-[13px] font-bold text-azul hover:underline">
                      <span className="mr-1.5 text-[11px] font-bold tabular-nums text-gris-suave">#{f.numero}</span>
                      {f.nombre}
                    </span>
                    <span className="block truncate text-[11px] text-gris">{f.cargo}</span>
                  </Link>
                </th>
                <td className="border-b border-borde px-2 py-2 text-right text-xs font-extrabold tabular-nums text-tinta group-hover:bg-cian-lavado">
                  {f.porcentaje}%
                </td>
                {tipos.map((t, i) => {
                  const celda = f.celdas.get(t.id);
                  return (
                    <td
                      key={t.id}
                      title={`${f.nombre} — ${t.nombre}: ${textoAccesible(celda, terminos.noLoPide)}`}
                      className={`border-b border-borde p-0 text-center group-hover:bg-cian-lavado ${
                        i === 0 || tipos[i - 1].grupo !== t.grupo ? "border-l" : ""
                      }`}
                    >
                      <span className="flex h-11 items-center justify-center">
                        <Marca celda={celda} />
                        <span className="sr-only">{textoAccesible(celda, terminos.noLoPide)}</span>
                      </span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-2 text-[11px] text-gris-suave">
        {terminos.pieDeTabla}
      </p>
    </>
  );
}

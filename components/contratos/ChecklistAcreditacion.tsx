import FilaDeDocumento from "./FilaDeDocumento";
import {
  TERMINOS_DE_PERSONA,
  type AccionesDeDocumento,
  type TerminosDeDocumento,
} from "@/lib/contratos/acciones-de-documento";
import {
  esRequerido,
  estadoVisible,
  type DocumentoPersona,
  type TipoDocumento,
} from "@/lib/contratos/acreditacion-modelo";

/**
 * El checklist de una persona o de un vehículo: sus documentos agrupados por tema.
 *
 * Primero los que pide su cargo, agrupados, y aparte —plegados— los que no. Son
 * los 25 del catálogo, pero a un Activador le piden 11: mostrarle 25 filas
 * donde 14 no cuentan es el defecto del Excel (una fila casi vacía) trasladado a
 * la pantalla.
 *
 * Es un componente de servidor: arma las filas con datos ya resueltos, y solo
 * cada fila —que sube archivos y cambia estados— es de cliente.
 */
export default function ChecklistAcreditacion({
  personaId,
  acciones,
  terminos = TERMINOS_DE_PERSONA,
  tipos,
  tiposDelCargo,
  documentos,
  hoy,
  soloPendientes,
}: {
  /** El id de lo que se acredita: la persona o el vehículo. */
  personaId: string;
  acciones: AccionesDeDocumento;
  terminos?: TerminosDeDocumento;
  tipos: TipoDocumento[];
  tiposDelCargo: ReadonlySet<string>;
  documentos: ReadonlyMap<string, DocumentoPersona>;
  hoy: string;
  soloPendientes: boolean;
}) {
  const filas = tipos.map((tipo) => {
    const doc = documentos.get(tipo.id);
    return {
      tipo,
      doc: doc ?? null,
      requerido: esRequerido(tipo.id, tiposDelCargo, doc),
      delCargo: tiposDelCargo.has(tipo.id),
      visible: estadoVisible(doc, hoy),
    };
  });

  const requeridas = filas.filter((f) => f.requerido);
  const opcionales = filas.filter((f) => !f.requerido);

  // Los grupos, en el orden en que aparecen en el catálogo.
  const grupos = new Map<string, typeof filas>();
  for (const f of requeridas) {
    if (soloPendientes && (f.visible === "cargado" || f.visible === "no_aplica")) continue;
    const lista = grupos.get(f.tipo.grupo) ?? [];
    lista.push(f);
    grupos.set(f.tipo.grupo, lista);
  }

  return (
    <div className="space-y-6">
      {grupos.size === 0 && (
        <p className="rounded-xl border border-borde bg-superficie p-6 text-center text-sm text-gris">
          {soloPendientes
            ? "No queda nada pendiente. Todos los documentos requeridos están al día."
            : terminos.sinRequeridos}
        </p>
      )}

      {[...grupos.entries()].map(([grupo, lista]) => {
        const hechos = requeridas.filter(
          (f) => f.tipo.grupo === grupo && (f.visible === "cargado" || f.visible === "no_aplica"),
        ).length;
        const total = requeridas.filter((f) => f.tipo.grupo === grupo).length;

        return (
          <section key={grupo}>
            <h3 className="mb-2 flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-gris">
              <span className="h-[2px] w-3 rounded-full bg-cian" />
              {grupo}
              <span className="font-semibold normal-case tracking-normal text-gris-suave">
                {hechos} de {total}
              </span>
            </h3>
            <ul className="space-y-2">
              {lista.map((f) => (
                <FilaDeDocumento
                  key={f.tipo.id}
                  personaId={personaId}
                  acciones={acciones}
                  terminos={terminos}
                  tipo={{
                    id: f.tipo.id,
                    nombre: f.tipo.nombre,
                    tieneVencimiento: f.tipo.tieneVencimiento,
                  }}
                  doc={f.doc}
                  requerido={f.requerido}
                  delCargo={f.delCargo}
                  hoy={hoy}
                />
              ))}
            </ul>
          </section>
        );
      })}

      {opcionales.length > 0 && !soloPendientes && (
        <details className="group rounded-xl border border-dashed border-borde">
          <summary className="cursor-pointer list-none px-4 py-3 text-xs font-bold uppercase tracking-wide text-gris transition hover:text-azul">
            {terminos.otrosQueNoPide} ({opcionales.length})
            <span className="ml-1 font-normal normal-case tracking-normal text-gris-suave">
              — no cuentan para el avance
            </span>
          </summary>
          <ul className="space-y-2 p-3 pt-0">
            {opcionales.map((f) => (
              <FilaDeDocumento
                key={f.tipo.id}
                personaId={personaId}
                acciones={acciones}
                terminos={terminos}
                tipo={{
                  id: f.tipo.id,
                  nombre: f.tipo.nombre,
                  tieneVencimiento: f.tipo.tieneVencimiento,
                }}
                doc={f.doc}
                requerido={false}
                delCargo={false}
                hoy={hoy}
              />
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

import { IconAlertTriangle } from "@tabler/icons-react";
import { TARJETA } from "@/lib/contratos/estilos";
import type { DocumentoFaltante, FilaDeReporte } from "@/lib/contratos/acreditacion-reporte";

function Barra({ porcentaje }: { porcentaje: number }) {
  return (
    <div className="h-1.5 overflow-hidden rounded-full bg-borde">
      <div
        className={`h-full rounded-full ${porcentaje === 100 ? "bg-emerald-500" : "bg-cian"}`}
        style={{ width: `${porcentaje}%` }}
      />
    </div>
  );
}

/**
 * Una tabla de resumen: por cargo o por faena.
 *
 * En el celular cada fila es una tarjeta con sus cifras debajo del nombre; en
 * pantalla ancha, columnas. Es el mismo marcado con otro `grid`, no dos listas.
 */
/** Cómo se llama lo que se acredita, en los textos del reporte. */
export interface TerminosDeReporte {
  porCategoria: string;
  /** «Personas» o «Vehículos»: el encabezado de la cifra y el vacío. */
  sujetos: string;
  sinSujetos: string;
  faltantes: string;
}

export const TERMINOS_DE_REPORTE_DE_PERSONAS: TerminosDeReporte = {
  porCategoria: "Por cargo",
  sujetos: "Personas",
  sinSujetos: "Todavía no hay personas.",
  faltantes:
    "Personas que todavía no cumplen cada documento, entre las que se lo deben. Sirve para decidir qué pedirle a todo el equipo esta semana.",
};

export const TERMINOS_DE_REPORTE_DE_VEHICULOS: TerminosDeReporte = {
  porCategoria: "Por tipo de vehículo",
  sujetos: "Vehículos",
  sinSujetos: "Todavía no hay vehículos.",
  faltantes:
    "Vehículos que todavía no cumplen cada documento, entre los que se lo deben. Sirve para decidir qué pedirle a toda la flota esta semana.",
};

function Tabla({
  titulo,
  filas,
  terminos,
}: {
  titulo: string;
  filas: FilaDeReporte[];
  terminos: TerminosDeReporte;
}) {
  return (
    <section>
      <h2 className="mb-3 flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-gris">
        <span className="h-[2px] w-3 rounded-full bg-cian" />
        {titulo}
      </h2>

      {filas.length === 0 ? (
        <p className={`${TARJETA} p-6 text-center text-sm text-gris`}>{terminos.sinSujetos}</p>
      ) : (
        <ul className="space-y-2">
          {filas.map((f) => (
            <li
              key={f.nombre}
              className={`${TARJETA} grid grid-cols-2 items-center gap-x-4 gap-y-2 p-4 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_repeat(3,5.5rem)]`}
            >
              <p className="col-span-2 min-w-0 truncate text-sm font-bold text-azul md:col-span-1">{f.nombre}</p>

              <div className="col-span-2 md:col-span-1">
                <div className="flex items-baseline justify-between text-xs">
                  <span className="text-gris">
                    {f.cargados} de {f.exigidos} documentos
                  </span>
                  <span className="font-extrabold tabular-nums text-tinta">{f.porcentaje}%</span>
                </div>
                <div className="mt-1.5">
                  <Barra porcentaje={f.porcentaje} />
                </div>
              </div>

              {/* En el celular las tres cifras van en una fila propia; desde md el
                  contenedor desaparece (`contents`) y cada una es una columna de la
                  fila, junto al nombre y la barra. */}
              <div className="col-span-2 grid grid-cols-3 gap-2 md:contents">
                <Cifra
                  etiqueta={terminos.sujetos}
                  valor={f.personas}
                  nota={f.contratadas < f.personas ? `${f.contratadas} con contrato` : undefined}
                />
                <Cifra etiqueta="Acreditadas" valor={f.acreditadas} tono={f.acreditadas === f.personas && f.personas > 0 ? "ok" : undefined} />
                <Cifra etiqueta="Vencidos" valor={f.vencidos} tono={f.vencidos > 0 ? "alerta" : undefined} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Cifra({ etiqueta, valor, tono, nota }: { etiqueta: string; valor: number; tono?: "ok" | "alerta"; nota?: string }) {
  // El color solo cuando hay algo que mirar: un cero en rojo es una alarma que
  // dice "todo bien".
  const color = tono === "ok" ? "text-emerald-600" : tono === "alerta" ? "text-red-600" : "text-tinta";
  return (
    <div className="md:text-center">
      <p className={`text-lg font-extrabold tabular-nums ${color}`}>{valor}</p>
      <p className="text-[10px] font-bold uppercase tracking-wide text-gris-suave">{etiqueta}</p>
      {nota && <p className="text-[10px] font-semibold text-amber-700">{nota}</p>}
    </div>
  );
}

export default function ReporteDeAcreditacion({
  porCargo,
  porFaena,
  faltantes,
  terminos = TERMINOS_DE_REPORTE_DE_PERSONAS,
}: {
  porCargo: FilaDeReporte[];
  porFaena: FilaDeReporte[];
  faltantes: DocumentoFaltante[];
  terminos?: TerminosDeReporte;
}) {
  const maximo = Math.max(1, ...faltantes.map((f) => f.faltan));

  return (
    <div className="mt-6 space-y-10">
      <Tabla titulo={terminos.porCategoria} filas={porCargo} terminos={terminos} />
      <Tabla titulo="Por faena" filas={porFaena} terminos={terminos} />

      <section>
        <h2 className="mb-1 flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-gris">
          <span className="h-[2px] w-3 rounded-full bg-cian" />
          Qué documentos faltan más
        </h2>
        <p className="mb-3 text-xs text-gris-suave">{terminos.faltantes}</p>

        {faltantes.length === 0 ? (
          <p className={`${TARJETA} p-6 text-center text-sm text-gris`}>
            No falta ningún documento. Todo lo exigido está al día.
          </p>
        ) : (
          <ul className={`${TARJETA} divide-y divide-borde`}>
            {faltantes.map((f) => (
              <li key={f.tipo.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1.5 px-4 py-3 sm:grid-cols-[minmax(0,14rem)_1fr_auto]">
                <p className="min-w-0 text-sm text-tinta">
                  {f.tipo.nombre}
                  <span className="ml-2 text-[11px] text-gris-suave">{f.tipo.grupo}</span>
                </p>
                <div className="order-3 col-span-2 sm:order-none sm:col-span-1">
                  <div className="h-2 overflow-hidden rounded-full bg-borde">
                    <div
                      className="h-full rounded-full bg-amber-400"
                      style={{ width: `${(f.faltan / maximo) * 100}%` }}
                    />
                  </div>
                </div>
                <p className="flex items-center gap-1.5 text-sm font-extrabold tabular-nums text-tinta">
                  {f.faltan === f.exigido && f.exigido > 1 && <IconAlertTriangle size={14} className="text-amber-600" aria-label="Falta en todos" />}
                  {f.faltan}
                  <span className="text-xs font-semibold text-gris-suave">de {f.exigido}</span>
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

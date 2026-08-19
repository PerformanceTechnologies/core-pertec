import Link from "next/link";
import { exigirAccesoOfertas } from "@/lib/ofertas/datos";
import { listarMaestros } from "@/lib/ofertas/maestros";
import { ESTILO_PERTEC } from "@/lib/ofertas/estilo";
import SubirMaestro from "@/components/ofertas/SubirMaestro";
import { TARJETA } from "@/lib/estilos";
import { eliminarMaestroAction, guardarMaestroAction, predeterminarMaestroAction } from "./acciones";

export const dynamic = "force-dynamic";

/** Los tokens agrupados como se piensan, no como están en el tipo. */
const GRUPOS: { titulo: string; campos: (keyof typeof ESTILO_PERTEC)[] }[] = [
  { titulo: "Colores", campos: ["colorTinta", "colorAcento", "colorAcentoAlterno", "colorSuave"] },
  {
    titulo: "Tablas",
    campos: ["colorCabecera", "colorCabeceraTexto", "colorFondoSuave", "colorFondoTotal", "colorBorde"],
  },
  { titulo: "Tipografía", campos: ["fuenteCuerpo", "fuenteTitulos"] },
  { titulo: "Tamaños", campos: ["tamanoCuerpo", "tamanoTitulo", "tamanoPortada"] },
  {
    titulo: "Página",
    campos: ["altoHeader", "anchoCeldaLateral", "margenLateral", "rotuloLogoCliente"],
  },
];

const ROTULOS: Record<string, string> = {
  colorTinta: "Texto principal",
  colorAcento: "Acento",
  colorAcentoAlterno: "Acento alterno",
  colorSuave: "Texto secundario",
  colorCabecera: "Fondo de cabecera",
  colorCabeceraTexto: "Texto de cabecera",
  colorFondoSuave: "Filas alternadas",
  colorFondoTotal: "Filas de total",
  colorBorde: "Bordes",
  fuenteCuerpo: "Cuerpo",
  fuenteTitulos: "Títulos",
  tamanoCuerpo: "Cuerpo (px)",
  tamanoTitulo: "Título de sección (px)",
  tamanoPortada: "Título de portada (px)",
  altoHeader: "Alto del encabezado (mm)",
  anchoCeldaLateral: "Celdas laterales (mm)",
  margenLateral: "Margen lateral (mm)",
  rotuloLogoCliente: "Rótulo del logo del cliente",
};

export default async function MaestrosPage() {
  await exigirAccesoOfertas();
  const maestros = await listarMaestros();

  return (
    <div className="animar-entrada max-w-[1200px]">
      <Link
        href="/ofertas"
        className="text-xs font-medium text-tinta/50 transition-colors hover:text-naranjo focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-naranjo"
      >
        ← Ofertas
      </Link>

      <div className="mt-3">
        <span className="etiqueta-seccion">Ofertas técnicas</span>
        <h1 className="mt-2 max-w-[24ch] font-condensed text-3xl font-bold uppercase leading-[0.95] tracking-tight text-tinta sm:text-4xl">
          Maestros de formato
          <span className="block text-tinta/40">La piel de los documentos</span>
        </h1>
      </div>

      <SubirMaestro />

      {maestros.length === 0 ? (
        <p className="mt-8 text-sm text-pretty text-tinta/50">
          Todavía no hay maestros subidos. Sin ninguno, las ofertas se imprimen con el formato de PERTEC que
          ya trae el sistema, así que esto es opcional: sirve para tener más de un formato o para ajustar el
          que hay.
        </p>
      ) : (
        <div className="mt-8 flex flex-col gap-5">
          {maestros.map((m) => (
            <section key={m.id} className={`${TARJETA} p-5`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="font-condensed text-lg font-bold uppercase tracking-wide text-tinta">
                    {m.nombre}
                    {m.predeterminado && (
                      <span className="ml-2 rounded-md bg-teal/10 px-2 py-0.5 text-[11px] font-semibold normal-case tracking-normal text-teal">
                        Predeterminado
                      </span>
                    )}
                  </h2>
                  <p className="mt-0.5 text-[11px] text-tinta/45">
                    {m.empresa ?? "Sirve para todas las empresas"}
                    {m.archivoNombre && ` · desde ${m.archivoNombre}`}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  {!m.predeterminado && (
                    <>
                      <form action={predeterminarMaestroAction}>
                        <input type="hidden" name="id" value={m.id} />
                        <button
                          type="submit"
                          className="text-[11px] font-semibold uppercase tracking-wide text-tinta/55 transition-colors hover:text-teal focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal"
                        >
                          Usar por defecto
                        </button>
                      </form>
                      <form action={eliminarMaestroAction}>
                        <input type="hidden" name="id" value={m.id} />
                        <button
                          type="submit"
                          className="text-[11px] font-medium text-tinta/40 transition-colors hover:text-red-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600"
                        >
                          Eliminar
                        </button>
                      </form>
                    </>
                  )}
                </div>
              </div>

              {/* La muestra de color: es lo que de verdad se revisa de un maestro. */}
              <div className="mt-3 flex flex-wrap gap-2">
                {(
                  [
                    "colorTinta",
                    "colorAcento",
                    "colorAcentoAlterno",
                    "colorCabecera",
                    "colorFondoSuave",
                    "colorFondoTotal",
                  ] as const
                ).map((campo) => (
                  <span
                    key={campo}
                    className="flex items-center gap-1.5 rounded-md border border-borde px-2 py-1 text-[10px] tabular-nums text-tinta/60"
                  >
                    <span
                      className="h-3.5 w-3.5 rounded-sm border border-borde"
                      style={{ background: m.estilo[campo] }}
                    />
                    {m.estilo[campo]}
                  </span>
                ))}
              </div>

              {m.descartados.length > 0 && (
                <p className="mt-3 text-[11px] text-pretty text-naranjo">
                  Quedó con el valor de PERTEC en: {m.descartados.join(" · ")}
                </p>
              )}

              <form action={guardarMaestroAction} className="mt-4 border-t border-borde pt-4">
                <input type="hidden" name="id" value={m.id} />
                <label className="block max-w-md">
                  <span className="block text-[10px] font-semibold uppercase tracking-wide text-tinta/45">
                    Nombre
                  </span>
                  <input
                    name="nombre"
                    defaultValue={m.nombre}
                    className="mt-1 w-full rounded-lg border border-borde bg-superficie px-2.5 py-1.5 text-sm text-tinta outline-none focus:border-naranjo/50"
                  />
                </label>

                {GRUPOS.map((grupo) => (
                  <div key={grupo.titulo} className="mt-4">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-tinta/45">
                      {grupo.titulo}
                    </p>
                    <div className="mt-1.5 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                      {grupo.campos.map((campo) => (
                        <label key={campo} className="block">
                          <span className="block text-[10px] text-tinta/50">{ROTULOS[campo] ?? campo}</span>
                          <input
                            name={campo}
                            defaultValue={String(m.estilo[campo])}
                            className="mt-0.5 w-full rounded-lg border border-borde bg-superficie px-2.5 py-1.5 text-sm tabular-nums text-tinta outline-none focus:border-naranjo/50"
                          />
                        </label>
                      ))}
                    </div>
                  </div>
                ))}

                <button
                  type="submit"
                  className="mt-4 rounded-lg border border-borde px-4 py-2 text-xs font-semibold uppercase tracking-wide text-tinta transition hover:border-naranjo/50 hover:text-naranjo focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-naranjo"
                >
                  Guardar cambios
                </button>
                <p className="mt-2 text-[11px] text-pretty text-tinta/45">
                  Un valor que no sea un hex de 6 dígitos, o un tamaño fuera de rango, se descarta y queda el
                  de PERTEC: el documento no se puede romper desde acá.
                </p>
              </form>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

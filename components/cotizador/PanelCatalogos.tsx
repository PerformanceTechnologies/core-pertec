import Link from "next/link";

// Catálogo de referencia — igual que en la app standalone, es contenido de
// demostración (no hay todavía una tabla en Supabase que respalde precios
// reutilizables); sirve como biblioteca de valores típicos al cotizar.
const CARDS = [
  { n: 8, label: "Cargos" },
  { n: 34, label: "Insumos y materiales" },
  { n: 19, label: "EPP" },
  { n: 12, label: "Equipos y herramientas" },
  { n: 5, label: "Vehículos" },
  { n: 4, label: "Baterías de exámenes" },
];

const CARGOS = [
  { cargo: "Jefe de Operaciones", clasif: "INDIRECTO", ref: "$3.000.000", bonos: "$650.000" },
  { cargo: "Supervisor Mecánico", clasif: "INDIRECTO", ref: "$2.400.000", bonos: "$450.000" },
  { cargo: "Asesor Prev. de Riesgos", clasif: "INDIRECTO", ref: "$2.200.000", bonos: "$150.000" },
  { cargo: "Electricista", clasif: "DIRECTO", ref: "$1.650.000", bonos: "$200.000" },
  { cargo: "Maestro Mayor", clasif: "DIRECTO", ref: "$1.500.000", bonos: "$120.000" },
  { cargo: "Maestro Primera", clasif: "DIRECTO", ref: "$1.250.000", bonos: "$100.000" },
  { cargo: "Maestro Segunda", clasif: "DIRECTO", ref: "$1.050.000", bonos: "$90.000" },
  { cargo: "Ayudante", clasif: "DIRECTO", ref: "$850.000", bonos: "$70.000" },
];

const LOCACIONES = [
  { nombre: "Minera Antucoya", cliente: "Antofagasta Minerals", dias: 20, racion: "$9.850", examenes: "GES + altura física", casino: "Compass" },
  { nombre: "Centinela", cliente: "Antofagasta Minerals", dias: 20, racion: "$10.240", examenes: "GES + MES", casino: "Sodexo" },
];

export default function PanelCatalogos() {
  return (
    <div>
      <Link href="/cotizador" className="text-xs font-medium text-tinta/50 hover:text-naranjo">
        ← Cotizaciones
      </Link>

      <div className="mt-2">
        <span className="etiqueta-seccion">Cotizador</span>
      </div>
      <h1 className="mt-2 font-condensed text-2xl font-bold uppercase text-tinta">Catálogos de precios</h1>
      <p className="mt-1 max-w-2xl text-sm text-tinta/60">
        Biblioteca de referencia — valores típicos que se copian a una cotización nueva y admiten override por
        proyecto. Contenido ilustrativo por ahora; se puede conectar a una tabla propia si se necesita mantenerlo
        centralizado.
      </p>

      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {CARDS.map((c) => (
          <div key={c.label} className="rounded-xl border border-borde bg-white p-3.5">
            <div className="font-condensed text-2xl font-bold tabular-nums text-naranjo">{c.n}</div>
            <div className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-tinta/60">{c.label}</div>
          </div>
        ))}
      </div>

      <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-[1.15fr_.85fr] lg:items-start">
        <div className="overflow-hidden rounded-xl border border-borde bg-white">
          <div className="border-b border-borde px-4 py-3 text-xs font-semibold uppercase tracking-wide text-tinta/50">
            Cargos — sueldos referenciales
          </div>
          <div className="grid grid-cols-[minmax(170px,1.6fr)_110px_130px_120px] gap-x-3 border-b-2 border-tinta px-4 py-2 text-[10px] font-bold uppercase tracking-wide text-tinta/40">
            <span>Cargo</span>
            <span>Clasificación</span>
            <span className="text-right">Base referencial</span>
            <span className="text-right">Bonos default</span>
          </div>
          {CARGOS.map((c) => (
            <div key={c.cargo} className="grid grid-cols-[minmax(170px,1.6fr)_110px_130px_120px] items-center gap-x-3 border-b border-borde px-4 py-2 text-sm">
              <span className="text-tinta">{c.cargo}</span>
              <span>
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                    c.clasif === "DIRECTO" ? "bg-teal/10 text-teal" : "bg-gris/10 text-gris"
                  }`}
                >
                  {c.clasif}
                </span>
              </span>
              <span className="text-right tabular-nums text-tinta">{c.ref}</span>
              <span className="text-right tabular-nums text-tinta/60">{c.bonos}</span>
            </div>
          ))}
          <div className="px-4 py-2.5 text-xs text-tinta/40">
            clasificación directo/indirecto definida una sola vez aquí
          </div>
        </div>

        <div className="flex flex-col gap-3.5">
          {LOCACIONES.map((l) => (
            <div key={l.nombre} className="rounded-xl border border-borde bg-white p-4">
              <div className="flex items-baseline gap-2.5">
                <span className="text-sm font-semibold uppercase tracking-wide text-tinta">{l.nombre}</span>
                <span className="text-xs text-tinta/50">{l.cliente}</span>
                <div className="flex-1" />
                <span className="rounded-full bg-crema px-2 py-0.5 text-[10px] font-semibold text-tinta/60">
                  {l.dias} días alim./mes
                </span>
              </div>
              <div className="mt-2.5 flex flex-wrap gap-4 text-xs text-tinta/60">
                <span>
                  Ración día persona <b className="font-semibold text-tinta">{l.racion}</b>
                </span>
                <span>
                  Batería exámenes <b className="font-semibold text-tinta">{l.examenes}</b>
                </span>
                <span>
                  Casino <b className="font-semibold text-tinta">{l.casino}</b>
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

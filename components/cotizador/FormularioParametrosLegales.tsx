import type { ParametrosLegalesSet } from "@/lib/parametros-legales";

const CAMPOS_TASA: { campo: string; etiqueta: string; ayuda?: string }[] = [
  { campo: "tasaAfp", etiqueta: "Tasa AFP (promedio)", ayuda: "decimal, ej. 0.1144 = 11,44%" },
  { campo: "tasaSaludLegal", etiqueta: "Tasa salud legal" },
  { campo: "tasaSisEmpleador", etiqueta: "Tasa SIS empleador" },
  { campo: "tasaCesantiaTrabIndefinido", etiqueta: "Cesantía trabajador · indefinido" },
  { campo: "tasaCesantiaEmpIndefinido", etiqueta: "Cesantía empleador · indefinido" },
  { campo: "tasaCesantiaTrabPlazoFijo", etiqueta: "Cesantía trabajador · plazo fijo" },
  { campo: "tasaCesantiaEmpPlazoFijo", etiqueta: "Cesantía empleador · plazo fijo" },
  { campo: "tasaMutualBase", etiqueta: "Tasa mutual base" },
  { campo: "aporteReformaPrevisionalEmp", etiqueta: "Aporte reforma previsional (Ley 21.735)" },
];

export default function FormularioParametrosLegales({
  accion,
  valoresPorDefecto,
  textoBoton,
}: {
  accion: (form: FormData) => void;
  valoresPorDefecto?: ParametrosLegalesSet;
  textoBoton: string;
}) {
  const v = valoresPorDefecto?.valores;

  return (
    <form action={accion} className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <div className="sm:col-span-2 lg:col-span-3">
        <label className="block text-xs font-medium text-tinta/70">Nombre del set</label>
        <input
          name="nombre"
          required
          defaultValue={valoresPorDefecto?.nombre}
          placeholder="2027 vigente"
          className="mt-1 w-full rounded-lg border border-borde px-3 py-2 text-sm outline-none focus:border-naranjo/50"
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-tinta/70">Vigente desde</label>
        <input
          type="date"
          name="vigenteDesde"
          required
          defaultValue={valoresPorDefecto?.vigenteDesde?.slice(0, 10)}
          className="mt-1 w-full rounded-lg border border-borde bg-white px-3 py-2 text-sm outline-none focus:border-naranjo/50"
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-tinta/70">UF</label>
        <input
          type="number"
          step="0.01"
          name="uf"
          required
          defaultValue={v?.uf}
          className="mt-1 w-full rounded-lg border border-borde px-3 py-2 text-sm outline-none focus:border-naranjo/50"
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-tinta/70">UTM</label>
        <input
          type="number"
          step="1"
          name="utm"
          required
          defaultValue={v?.utm}
          className="mt-1 w-full rounded-lg border border-borde px-3 py-2 text-sm outline-none focus:border-naranjo/50"
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-tinta/70">Ingreso mínimo</label>
        <input
          type="number"
          step="1"
          name="ingresoMinimo"
          required
          defaultValue={v?.ingresoMinimo}
          className="mt-1 w-full rounded-lg border border-borde px-3 py-2 text-sm outline-none focus:border-naranjo/50"
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-tinta/70">Tope imponible AFP (UF)</label>
        <input
          type="number"
          step="0.1"
          name="topeImponibleAfpUF"
          required
          defaultValue={v?.topeImponibleAfpUF}
          className="mt-1 w-full rounded-lg border border-borde px-3 py-2 text-sm outline-none focus:border-naranjo/50"
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-tinta/70">Tope imponible cesantía (UF)</label>
        <input
          type="number"
          step="0.1"
          name="topeImponibleCesantiaUF"
          required
          defaultValue={v?.topeImponibleCesantiaUF}
          className="mt-1 w-full rounded-lg border border-borde px-3 py-2 text-sm outline-none focus:border-naranjo/50"
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-tinta/70">
          Tope gratificación IMM anual
          <span className="block font-normal normal-case text-tinta/40">ej. 4.75 (múltiplos de IMM/año)</span>
        </label>
        <input
          type="number"
          step="0.01"
          name="topeGratificacionImmAnual"
          required
          defaultValue={v?.topeGratificacionImmAnual}
          className="mt-1 w-full rounded-lg border border-borde px-3 py-2 text-sm outline-none focus:border-naranjo/50"
        />
      </div>

      {CAMPOS_TASA.map((c) => (
        <div key={c.campo}>
          <label className="block text-xs font-medium text-tinta/70">
            {c.etiqueta}
            {c.ayuda && <span className="block font-normal normal-case text-tinta/40">{c.ayuda}</span>}
          </label>
          <input
            type="number"
            step="0.0001"
            name={c.campo}
            required
            defaultValue={v ? (v as unknown as Record<string, number>)[c.campo] : undefined}
            className="mt-1 w-full rounded-lg border border-borde px-3 py-2 text-sm outline-none focus:border-naranjo/50"
          />
        </div>
      ))}

      <div className="sm:col-span-2 lg:col-span-3">
        <label className="block text-xs font-medium text-tinta/70">
          Tramos de impuesto único de 2ª categoría
          <span className="block font-normal normal-case text-tinta/40">
            JSON: array de {"{ tramoN, desde, hasta, factor, rebaja }"} — hasta: null en el último tramo
          </span>
        </label>
        <textarea
          name="tramos"
          required
          rows={8}
          defaultValue={v ? JSON.stringify(v.taxBrackets, null, 2) : "[]"}
          className="mt-1 w-full rounded-lg border border-borde px-3 py-2 font-mono text-xs outline-none focus:border-naranjo/50"
        />
      </div>

      <div className="sm:col-span-2 lg:col-span-3">
        <button
          type="submit"
          className="rounded-lg bg-naranjo px-4 py-2 text-sm font-semibold uppercase tracking-wide text-white transition hover:bg-naranjo-suave"
        >
          {textoBoton}
        </button>
      </div>
    </form>
  );
}

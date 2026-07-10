import { exigirAccesoApp } from "@/lib/autorizacion";
import { listarFacturasSii, obtenerUltimaEjecucion } from "@/lib/finanzas";

const SLUG_APP = "finanzas";

const ETIQUETAS_ESTADO: Record<string, string> = {
  registro: "Registro",
  pendiente: "Pendiente",
  no_incluir: "No incluir",
  reclamado: "Reclamado",
};

const CLASES_ESTADO: Record<string, string> = {
  registro: "bg-teal/10 text-teal",
  pendiente: "bg-naranjo-suave/15 text-naranjo",
  no_incluir: "bg-gris/15 text-gris",
  reclamado: "bg-red-500/10 text-red-600",
};

const ETIQUETAS_DTE: Record<number, string> = {
  33: "Factura",
  34: "Factura exenta",
};

function formatearMonto(valor: number | null): string {
  if (valor === null) return "-";
  return valor.toLocaleString("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 });
}

function formatearFecha(valor: string | null): string {
  if (!valor) return "-";
  const [anio, mes, dia] = valor.split("-");
  return `${dia}-${mes}-${anio}`;
}

export default async function FinanzasPage() {
  await exigirAccesoApp(SLUG_APP);
  const [facturas, ultimaEjecucion] = await Promise.all([
    listarFacturasSii(),
    obtenerUltimaEjecucion(),
  ]);

  const totalCompra = facturas
    .filter((f) => f.tipo_documento === "compra")
    .reduce((acc, f) => acc + (f.monto_total ?? 0), 0);
  const totalVenta = facturas
    .filter((f) => f.tipo_documento === "venta")
    .reduce((acc, f) => acc + (f.monto_total ?? 0), 0);

  return (
    <div>
      <span className="etiqueta-seccion">Panel Finanzas</span>
      <h1 className="mt-2 font-condensed text-2xl font-bold uppercase text-tinta">
        Facturas SII
      </h1>

      <div className="mt-2 text-xs text-tinta/50">
        {ultimaEjecucion ? (
          ultimaEjecucion.exito ? (
            <span>
              Última actualización exitosa:{" "}
              {new Date(ultimaEjecucion.ejecutado_en).toLocaleString("es-CL")}
            </span>
          ) : (
            <span className="text-red-600">
              La última corrida ({new Date(ultimaEjecucion.ejecutado_en).toLocaleString("es-CL")}) falló:{" "}
              {ultimaEjecucion.mensaje_error}
            </span>
          )
        ) : (
          <span>Todavía no se ha ejecutado la actualización automática.</span>
        )}
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-borde bg-white p-4">
          <div className="text-xs uppercase text-tinta/50">Total compras (cargadas)</div>
          <div className="mt-1 font-condensed text-xl font-bold text-tinta">{formatearMonto(totalCompra)}</div>
        </div>
        <div className="rounded-xl border border-borde bg-white p-4">
          <div className="text-xs uppercase text-tinta/50">Total ventas (cargadas)</div>
          <div className="mt-1 font-condensed text-xl font-bold text-tinta">{formatearMonto(totalVenta)}</div>
        </div>
      </div>

      <div className="mt-6 overflow-x-auto rounded-xl border border-borde bg-white">
        <table className="w-full min-w-[820px] text-left text-sm">
          <thead className="border-b border-borde bg-crema/60 text-xs uppercase text-tinta/50">
            <tr>
              <th className="px-4 py-3">Tipo</th>
              <th className="px-4 py-3">Documento</th>
              <th className="px-4 py-3">RUT</th>
              <th className="px-4 py-3">Razón social</th>
              <th className="px-4 py-3">Folio</th>
              <th className="px-4 py-3">Fecha docto.</th>
              <th className="px-4 py-3 text-right">Monto total</th>
              <th className="px-4 py-3">Estado</th>
            </tr>
          </thead>
          <tbody>
            {facturas.map((f) => (
              <tr key={f.id} className="border-b border-borde last:border-0">
                <td className="px-4 py-3">
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase ${
                      f.tipo_documento === "compra" ? "bg-naranjo/10 text-naranjo" : "bg-teal/10 text-teal"
                    }`}
                  >
                    {f.tipo_documento}
                  </span>
                </td>
                <td className="px-4 py-3 text-tinta/60">{ETIQUETAS_DTE[f.codigo_dte] ?? f.codigo_dte}</td>
                <td className="px-4 py-3 text-tinta/60">{f.rut_contraparte}</td>
                <td className="px-4 py-3 font-medium text-tinta">{f.razon_social ?? "-"}</td>
                <td className="px-4 py-3 text-tinta/60">{f.folio}</td>
                <td className="px-4 py-3 text-tinta/60">{formatearFecha(f.fecha_docto)}</td>
                <td className="px-4 py-3 text-right text-tinta">{formatearMonto(f.monto_total)}</td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${CLASES_ESTADO[f.estado]}`}
                  >
                    {ETIQUETAS_ESTADO[f.estado] ?? f.estado}
                  </span>
                </td>
              </tr>
            ))}
            {facturas.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-6 text-center text-tinta/50">
                  Todavía no hay facturas cargadas.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

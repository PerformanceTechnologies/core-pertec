"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { IconArrowLeft, IconSearch, IconChevronUp, IconChevronDown } from "@tabler/icons-react";
import type { FacturaVentaFila, ResultadoBusquedaCompra } from "@/lib/facturas-historicas";
import ModalFacturaVenta from "./ModalFacturaVenta";
import ModalFacturaCompra from "./ModalFacturaCompra";

const ETIQUETAS_DTE: Record<number, string> = {
  33: "Factura",
  34: "Factura exenta",
  39: "Boleta",
  41: "Boleta exenta",
  52: "Guía de despacho",
  56: "Nota de débito",
  61: "Nota de crédito",
  110: "Factura exportación",
};

const GRUPOS_TIPO_DTE: Record<string, { etiqueta: string; tipos: number[] | null }> = {
  todos: { etiqueta: "Todos los documentos", tipos: null },
  facturas: { etiqueta: "Facturas", tipos: [33, 34, 39, 41, 110] },
  notas_credito: { etiqueta: "Notas de crédito", tipos: [61] },
  notas_debito: { etiqueta: "Notas de débito", tipos: [56] },
  guias: { etiqueta: "Guías de despacho", tipos: [52] },
};

type ClaveGrupoTipoDte = keyof typeof GRUPOS_TIPO_DTE;

function formatearMonto(valor: number | null): string {
  if (valor === null) return "-";
  return valor.toLocaleString("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 });
}

function formatearFecha(valor: string | null): string {
  if (!valor) return "-";
  const [anio, mes, dia] = valor.split("-");
  return `${dia}-${mes}-${anio}`;
}

type OrdenFecha = "desc" | "asc";

function compararFechas(a: string | null, b: string | null, orden: OrdenFecha): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1; // sin fecha siempre al final
  if (b === null) return -1;
  return orden === "desc" ? (a < b ? 1 : a > b ? -1 : 0) : a < b ? -1 : a > b ? 1 : 0;
}

function EncabezadoFecha({ orden, onToggle }: { orden: OrdenFecha; onToggle: () => void }) {
  return (
    <th className="px-4 py-3">
      <button
        onClick={onToggle}
        className="inline-flex items-center gap-1 uppercase text-tinta/50 hover:text-naranjo"
      >
        Fecha
        {orden === "desc" ? <IconChevronDown size={13} stroke={2.5} /> : <IconChevronUp size={13} stroke={2.5} />}
      </button>
    </th>
  );
}

function TablaVentas({
  ventas,
  ordenFecha,
  onToggleOrden,
  onSeleccionar,
}: {
  ventas: FacturaVentaFila[];
  ordenFecha: OrdenFecha;
  onToggleOrden: () => void;
  onSeleccionar: (f: FacturaVentaFila) => void;
}) {
  return (
    <div className="mt-4 overflow-x-auto rounded-xl border border-borde bg-white">
      <table className="w-full min-w-[760px] text-left text-sm">
        <thead className="border-b border-borde bg-crema/60 text-xs uppercase text-tinta/50">
          <tr>
            <th className="px-4 py-3">Documento</th>
            <th className="px-4 py-3">Folio</th>
            <th className="px-4 py-3">RUT receptor</th>
            <th className="px-4 py-3">Razón social</th>
            <EncabezadoFecha orden={ordenFecha} onToggle={onToggleOrden} />
            <th className="px-4 py-3 text-right">Monto total</th>
          </tr>
        </thead>
        <tbody>
          {ventas.map((f) => (
            <tr
              key={f.id}
              onClick={() => onSeleccionar(f)}
              className="cursor-pointer border-b border-borde last:border-0 hover:bg-crema/40"
            >
              <td className="px-4 py-3 text-tinta/60">{f.tipo_dte ? ETIQUETAS_DTE[f.tipo_dte] ?? f.tipo_dte : "-"}</td>
              <td className="px-4 py-3 text-tinta/60">{f.folio ?? "-"}</td>
              <td className="px-4 py-3 text-tinta/60">{f.rut_receptor ?? "-"}</td>
              <td className="px-4 py-3 font-medium text-tinta">{f.razon_social_receptor ?? "-"}</td>
              <td className="px-4 py-3 text-tinta/60">{formatearFecha(f.fecha_emision)}</td>
              <td className="px-4 py-3 text-right text-tinta">{formatearMonto(f.monto_total)}</td>
            </tr>
          ))}
          {ventas.length === 0 && (
            <tr>
              <td colSpan={6} className="px-4 py-6 text-center text-tinta/50">
                No hay facturas de venta que coincidan con el filtro.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function TablaCompras({
  resultados,
  cargando,
  error,
  buscado,
  ordenFecha,
  onToggleOrden,
  onSeleccionar,
}: {
  resultados: ResultadoBusquedaCompra[];
  cargando: boolean;
  error: string | null;
  buscado: boolean;
  ordenFecha: OrdenFecha;
  onToggleOrden: () => void;
  onSeleccionar: (a: ResultadoBusquedaCompra) => void;
}) {
  return (
    <div className="mt-4 overflow-x-auto rounded-xl border border-borde bg-white">
      <table className="w-full min-w-[820px] text-left text-sm">
        <thead className="border-b border-borde bg-crema/60 text-xs uppercase text-tinta/50">
          <tr>
            <th className="px-4 py-3">Documento</th>
            <th className="px-4 py-3">Folio</th>
            <th className="px-4 py-3">RUT proveedor</th>
            <th className="px-4 py-3">Razón social</th>
            <EncabezadoFecha orden={ordenFecha} onToggle={onToggleOrden} />
            <th className="px-4 py-3 text-right">Monto total</th>
          </tr>
        </thead>
        <tbody>
          {resultados.map((a) => (
            <tr
              key={a.id}
              onClick={() => onSeleccionar(a)}
              className="cursor-pointer border-b border-borde last:border-0 hover:bg-crema/40"
            >
              <td className="px-4 py-3 text-tinta/60">{a.tipoDocumentoDetectado ?? "-"}</td>
              <td className="px-4 py-3 text-tinta/60">{a.folio ?? "-"}</td>
              <td className="px-4 py-3 text-tinta/60">{a.rutEmisor ?? "-"}</td>
              <td className="px-4 py-3 font-medium text-tinta">{a.razonSocialEmisor ?? "-"}</td>
              <td className="px-4 py-3 text-tinta/60">{formatearFecha(a.fechaEmision)}</td>
              <td className="px-4 py-3 text-right text-tinta">{formatearMonto(a.montoTotal)}</td>
            </tr>
          ))}
          {!cargando && !error && buscado && resultados.length === 0 && (
            <tr>
              <td colSpan={6} className="px-4 py-6 text-center text-tinta/50">
                No se encontraron facturas de compra para esa búsqueda.
              </td>
            </tr>
          )}
          {!buscado && !cargando && (
            <tr>
              <td colSpan={6} className="px-4 py-6 text-center text-tinta/50">
                Escribe un RUT, proveedor o folio para buscar en las facturas de compra.
              </td>
            </tr>
          )}
        </tbody>
      </table>
      {cargando && <div className="border-t border-borde px-4 py-3 text-xs text-tinta/50">Buscando...</div>}
      {error && <div className="border-t border-borde px-4 py-3 text-xs text-red-600">{error}</div>}
      <div className="border-t border-borde px-4 py-2 text-[11px] text-tinta/40">
        Folio, RUT, fecha y monto se extraen automáticamente del PDF y pueden fallar en algunos proveedores — el archivo
        siempre se puede abrir igual.
      </div>
    </div>
  );
}

export default function PanelFacturasHistoricas({
  ventas,
  ultimaEjecucionExitosa,
}: {
  ventas: FacturaVentaFila[];
  ultimaEjecucionExitosa: { ejecutado_en: string } | null;
}) {
  const [tipo, setTipo] = useState<"venta" | "compra">("venta");
  const [busqueda, setBusqueda] = useState("");
  const [grupoTipoDte, setGrupoTipoDte] = useState<ClaveGrupoTipoDte>("todos");
  const [ordenFecha, setOrdenFecha] = useState<OrdenFecha>("desc");
  const alternarOrden = () => setOrdenFecha((o) => (o === "desc" ? "asc" : "desc"));

  const ventasFiltradas = useMemo(() => {
    const termino = busqueda.trim().toLowerCase();
    const tiposPermitidos = GRUPOS_TIPO_DTE[grupoTipoDte].tipos;

    const filtradas = ventas.filter((f) => {
      if (tiposPermitidos && (f.tipo_dte === null || !tiposPermitidos.includes(f.tipo_dte))) return false;
      if (!termino) return true;
      const enRut = (f.rut_receptor ?? "").toLowerCase().includes(termino);
      const enRazon = (f.razon_social_receptor ?? "").toLowerCase().includes(termino);
      const enFolio = String(f.folio ?? "").includes(termino);
      return enRut || enRazon || enFolio;
    });

    return [...filtradas].sort((a, b) => compararFechas(a.fecha_emision, b.fecha_emision, ordenFecha));
  }, [ventas, busqueda, grupoTipoDte, ordenFecha]);

  const [resultadosCompra, setResultadosCompra] = useState<ResultadoBusquedaCompra[]>([]);
  const [cargandoCompra, setCargandoCompra] = useState(false);
  const [errorCompra, setErrorCompra] = useState<string | null>(null);
  const [buscadoCompra, setBuscadoCompra] = useState(false);

  const terminoValidoCompra = busqueda.trim().length >= 2;

  useEffect(() => {
    if (tipo !== "compra" || !terminoValidoCompra) return;
    const termino = busqueda.trim();

    const idTimeout = setTimeout(async () => {
      setCargandoCompra(true);
      setErrorCompra(null);
      try {
        const resp = await fetch(`/api/finanzas/facturas-compra/buscar?q=${encodeURIComponent(termino)}`);
        const json = await resp.json();
        if (!resp.ok) throw new Error(json.error ?? "Error al buscar");
        setResultadosCompra(json.resultados ?? []);
      } catch (err) {
        setErrorCompra(err instanceof Error ? err.message : "Error desconocido");
      } finally {
        setCargandoCompra(false);
        setBuscadoCompra(true);
      }
    }, 400);

    return () => clearTimeout(idTimeout);
  }, [tipo, busqueda, terminoValidoCompra]);

  const resultadosCompraOrdenados = useMemo(
    () => [...resultadosCompra].sort((a, b) => compararFechas(a.fechaEmision, b.fechaEmision, ordenFecha)),
    [resultadosCompra, ordenFecha]
  );

  const [ventaSeleccionada, setVentaSeleccionada] = useState<FacturaVentaFila | null>(null);
  const [compraSeleccionada, setCompraSeleccionada] = useState<ResultadoBusquedaCompra | null>(null);

  return (
    <div>
      <Link
        href="/finanzas"
        className="inline-flex items-center gap-1.5 text-xs font-medium text-tinta/60 hover:text-naranjo"
      >
        <IconArrowLeft size={14} stroke={2} aria-hidden />
        Volver a Finanzas
      </Link>

      <span className="mt-3 block etiqueta-seccion">Panel Finanzas</span>
      <h1 className="mt-2 font-condensed text-2xl font-bold uppercase text-tinta">Facturas Históricas</h1>
      <p className="mt-1 text-sm text-tinta/60">
        Busca el documento original (PDF o XML) archivado en SharePoint, desde 2022 en adelante.
      </p>

      {tipo === "venta" && (
        <div className="mt-2 text-xs text-tinta/50">
          {ultimaEjecucionExitosa ? (
            <span>Índice actualizado: {new Date(ultimaEjecucionExitosa.ejecutado_en).toLocaleString("es-CL")}</span>
          ) : (
            <span>Todavía no se ha ejecutado la indexación automática.</span>
          )}
        </div>
      )}

      <div className="mt-6 flex gap-2">
        <button
          onClick={() => setTipo("venta")}
          className={`rounded-lg px-4 py-2 text-sm font-semibold uppercase ${
            tipo === "venta" ? "bg-naranjo text-white" : "border border-borde bg-white text-tinta/60"
          }`}
        >
          Venta
        </button>
        <button
          onClick={() => setTipo("compra")}
          className={`rounded-lg px-4 py-2 text-sm font-semibold uppercase ${
            tipo === "compra" ? "bg-naranjo text-white" : "border border-borde bg-white text-tinta/60"
          }`}
        >
          Compra
        </button>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px] max-w-md">
          <IconSearch size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-tinta/40" />
          <input
            type="text"
            placeholder={
              tipo === "venta"
                ? "Buscar por folio, RUT o razón social..."
                : "Buscar por RUT, proveedor o folio dentro del contenido del PDF..."
            }
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            className="w-full rounded-lg border border-borde bg-white py-2 pl-9 pr-3 text-sm text-tinta placeholder:text-tinta/40 focus:border-naranjo focus:outline-none"
          />
        </div>

        {tipo === "venta" && (
          <select
            value={grupoTipoDte}
            onChange={(e) => setGrupoTipoDte(e.target.value as ClaveGrupoTipoDte)}
            className="rounded-lg border border-borde bg-white px-3 py-2 text-sm text-tinta focus:border-naranjo focus:outline-none"
          >
            {Object.entries(GRUPOS_TIPO_DTE).map(([clave, { etiqueta }]) => (
              <option key={clave} value={clave}>
                {etiqueta}
              </option>
            ))}
          </select>
        )}
      </div>

      {tipo === "venta" ? (
        <TablaVentas
          ventas={ventasFiltradas}
          ordenFecha={ordenFecha}
          onToggleOrden={alternarOrden}
          onSeleccionar={setVentaSeleccionada}
        />
      ) : (
        <TablaCompras
          resultados={terminoValidoCompra ? resultadosCompraOrdenados : []}
          cargando={terminoValidoCompra && cargandoCompra}
          error={terminoValidoCompra ? errorCompra : null}
          buscado={terminoValidoCompra && buscadoCompra}
          ordenFecha={ordenFecha}
          onToggleOrden={alternarOrden}
          onSeleccionar={setCompraSeleccionada}
        />
      )}

      {ventaSeleccionada && <ModalFacturaVenta factura={ventaSeleccionada} onCerrar={() => setVentaSeleccionada(null)} />}
      {compraSeleccionada && <ModalFacturaCompra archivo={compraSeleccionada} onCerrar={() => setCompraSeleccionada(null)} />}
    </div>
  );
}

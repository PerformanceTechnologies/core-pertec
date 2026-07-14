"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { IconArrowLeft } from "@tabler/icons-react";
import type { FacturaSiiFila } from "@/lib/finanzas";
import TarjetaHoy from "./TarjetaHoy";
import ModalFactura from "./ModalFactura";

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

const OPCIONES_ORDEN = {
  fecha_desc: { etiqueta: "Fecha (recientes primero)", campo: "fecha_docto", dir: -1 },
  fecha_asc: { etiqueta: "Fecha (antiguas primero)", campo: "fecha_docto", dir: 1 },
  monto_desc: { etiqueta: "Monto (mayor a menor)", campo: "monto_total", dir: -1 },
  monto_asc: { etiqueta: "Monto (menor a mayor)", campo: "monto_total", dir: 1 },
  razon_asc: { etiqueta: "Razón social (A-Z)", campo: "razon_social", dir: 1 },
  razon_desc: { etiqueta: "Razón social (Z-A)", campo: "razon_social", dir: -1 },
} as const;

type ClaveOrden = keyof typeof OPCIONES_ORDEN;

function formatearMonto(valor: number | null): string {
  if (valor === null) return "-";
  return valor.toLocaleString("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 });
}

function formatearFecha(valor: string | null): string {
  if (!valor) return "-";
  const [anio, mes, dia] = valor.split("-");
  return `${dia}-${mes}-${anio}`;
}

function hoyIso(): string {
  const ahora = new Date();
  return `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, "0")}-${String(ahora.getDate()).padStart(2, "0")}`;
}

function exportarCsv(facturas: FacturaSiiFila[]) {
  const encabezados = [
    "Tipo", "Documento", "RUT", "Razon Social", "Folio", "Fecha Docto",
    "Monto Neto", "Monto IVA", "Monto Total", "Estado",
  ];
  const filas = facturas.map((f) => [
    f.tipo_documento,
    ETIQUETAS_DTE[f.codigo_dte] ?? f.codigo_dte,
    f.rut_contraparte,
    f.razon_social ?? "",
    f.folio,
    f.fecha_docto ?? "",
    f.monto_neto ?? 0,
    f.monto_iva_recuperable ?? 0,
    f.monto_total ?? 0,
    ETIQUETAS_ESTADO[f.estado] ?? f.estado,
  ]);
  const csv = [encabezados, ...filas]
    .map((fila) => fila.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(";"))
    .join("\n");
  const blob = new Blob([`﻿${csv}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `facturas-sii-${hoyIso()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function PanelFinanzas({
  facturas,
  ultimaEjecucionExitosa,
}: {
  facturas: FacturaSiiFila[];
  ultimaEjecucionExitosa: { ejecutado_en: string } | null;
}) {
  const [filtroTipo, setFiltroTipo] = useState<"todos" | "compra" | "venta">("todos");
  const [filtroEstado, setFiltroEstado] = useState<string>("todos");
  const [busqueda, setBusqueda] = useState("");
  const [orden, setOrden] = useState<ClaveOrden>("fecha_desc");
  const [facturaSeleccionada, setFacturaSeleccionada] = useState<FacturaSiiFila | null>(null);

  const facturasFiltradas = useMemo(() => {
    const termino = busqueda.trim().toLowerCase();
    const filtradas = facturas.filter((f) => {
      if (filtroTipo !== "todos" && f.tipo_documento !== filtroTipo) return false;
      if (filtroEstado !== "todos" && f.estado !== filtroEstado) return false;
      if (termino) {
        const enRut = f.rut_contraparte.toLowerCase().includes(termino);
        const enNombre = (f.razon_social ?? "").toLowerCase().includes(termino);
        if (!enRut && !enNombre) return false;
      }
      return true;
    });

    const { campo, dir } = OPCIONES_ORDEN[orden];
    return [...filtradas].sort((a, b) => {
      const va = a[campo as keyof FacturaSiiFila];
      const vb = b[campo as keyof FacturaSiiFila];
      if (va === null || va === undefined) return 1;
      if (vb === null || vb === undefined) return -1;
      if (va < vb) return -1 * dir;
      if (va > vb) return 1 * dir;
      return 0;
    });
  }, [facturas, filtroTipo, filtroEstado, busqueda, orden]);

  const totalCompra = facturasFiltradas
    .filter((f) => f.tipo_documento === "compra")
    .reduce((acc, f) => acc + (f.monto_total ?? 0), 0);
  const totalVenta = facturasFiltradas
    .filter((f) => f.tipo_documento === "venta")
    .reduce((acc, f) => acc + (f.monto_total ?? 0), 0);

  const facturasHoy = useMemo(() => {
    const hoy = hoyIso();
    return facturas.filter((f) => f.fecha_docto === hoy);
  }, [facturas]);

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
      <h1 className="mt-2 font-condensed text-2xl font-bold uppercase text-tinta">
        Facturas SII
      </h1>

      <div className="mt-2 text-xs text-tinta/50">
        {ultimaEjecucionExitosa ? (
          <span>
            Última actualización: {new Date(ultimaEjecucionExitosa.ejecutado_en).toLocaleString("es-CL")}
          </span>
        ) : (
          <span>Todavía no se ha ejecutado la actualización automática.</span>
        )}
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-borde bg-white p-4">
          <div className="text-xs uppercase text-tinta/50">Total compras (filtro actual)</div>
          <div className="mt-1 font-condensed text-xl font-bold text-tinta">{formatearMonto(totalCompra)}</div>
        </div>
        <div className="rounded-xl border border-borde bg-white p-4">
          <div className="text-xs uppercase text-tinta/50">Total ventas (filtro actual)</div>
          <div className="mt-1 font-condensed text-xl font-bold text-tinta">{formatearMonto(totalVenta)}</div>
        </div>
        <TarjetaHoy facturasHoy={facturasHoy} />
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <input
          type="text"
          placeholder="Buscar por RUT o razón social..."
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          className="min-w-[220px] flex-1 rounded-lg border border-borde bg-white px-3 py-2 text-sm text-tinta placeholder:text-tinta/40 focus:border-naranjo focus:outline-none"
        />
        <select
          value={filtroTipo}
          onChange={(e) => setFiltroTipo(e.target.value as typeof filtroTipo)}
          className="rounded-lg border border-borde bg-white px-3 py-2 text-sm text-tinta focus:border-naranjo focus:outline-none"
        >
          <option value="todos">Todos los tipos</option>
          <option value="compra">Compra</option>
          <option value="venta">Venta</option>
        </select>
        <select
          value={filtroEstado}
          onChange={(e) => setFiltroEstado(e.target.value)}
          className="rounded-lg border border-borde bg-white px-3 py-2 text-sm text-tinta focus:border-naranjo focus:outline-none"
        >
          <option value="todos">Todos los estados</option>
          {Object.entries(ETIQUETAS_ESTADO).map(([valor, etiqueta]) => (
            <option key={valor} value={valor}>{etiqueta}</option>
          ))}
        </select>
        <select
          value={orden}
          onChange={(e) => setOrden(e.target.value as ClaveOrden)}
          className="rounded-lg border border-borde bg-white px-3 py-2 text-sm text-tinta focus:border-naranjo focus:outline-none"
        >
          {Object.entries(OPCIONES_ORDEN).map(([valor, { etiqueta }]) => (
            <option key={valor} value={valor}>{etiqueta}</option>
          ))}
        </select>
        <button
          onClick={() => exportarCsv(facturasFiltradas)}
          className="ml-auto text-xs font-medium text-tinta/60 hover:text-naranjo"
        >
          Exportar CSV
        </button>
      </div>

      <div className="mt-4 overflow-x-auto rounded-xl border border-borde bg-white">
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
            {facturasFiltradas.map((f) => (
              <tr
                key={f.id}
                onClick={() => setFacturaSeleccionada(f)}
                className="cursor-pointer border-b border-borde last:border-0 hover:bg-crema/40"
              >
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
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${CLASES_ESTADO[f.estado]}`}>
                    {ETIQUETAS_ESTADO[f.estado] ?? f.estado}
                  </span>
                </td>
              </tr>
            ))}
            {facturasFiltradas.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-6 text-center text-tinta/50">
                  No hay facturas que coincidan con el filtro.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {facturaSeleccionada && (
        <ModalFactura factura={facturaSeleccionada} onCerrar={() => setFacturaSeleccionada(null)} />
      )}
    </div>
  );
}

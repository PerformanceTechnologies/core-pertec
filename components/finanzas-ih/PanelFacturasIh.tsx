"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { IconArrowLeft, IconRefresh, IconSearch, IconChevronUp, IconChevronDown, IconInfoCircle } from "@tabler/icons-react";
import type { FinanzasIhDocumentoFila } from "@/lib/finanzas-ih/finanzas-ih";
import ModalFacturaIhVenta from "./ModalFacturaIhVenta";
import ModalFacturaIhCompra from "./ModalFacturaIhCompra";

const ETIQUETAS_TIPO_DOCUMENTO: Record<string, string> = {
  factura_afecta: "Factura",
  factura_exenta: "Factura exenta",
  nota_credito: "Nota de crédito",
  nota_debito: "Nota de débito",
  guia_despacho: "Guía de despacho",
  boleta: "Boleta",
  boleta_honorarios: "Boleta de honorarios",
};

// Mismo estado que usa el Registro de Compras y Ventas del SII para un
// documento (solo aplica a los que vienen del RCV -- fuente "rcv"; los que
// vienen de la carga historica o del Portal MIPYME no tienen este dato).
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

const DEFINICIONES_ESTADO: Record<string, string> = {
  registro: "El documento quedó registrado en el Registro de Compras y Ventas del SII sin observaciones.",
  pendiente: "El documento está pendiente de que el receptor lo acepte, reclame o venza el plazo (8 días desde su recepción).",
  no_incluir: "El receptor marcó el documento para no incluirlo en su Registro de Compras.",
  reclamado: "El receptor reclamó (rechazó) el documento ante el SII.",
};

const TITULO_LEYENDA_ESTADO = Object.entries(DEFINICIONES_ESTADO)
  .map(([clave, definicion]) => `${ETIQUETAS_ESTADO[clave]}: ${definicion}`)
  .join("\n\n");

// Mismo agrupamiento que GRUPOS_TIPO_DTE en Facturas Historicas (facturas
// afecta/exenta bajo un solo filtro "Facturas").
const GRUPOS_TIPO: Record<string, { etiqueta: string; tipos: string[] | null }> = {
  todos: { etiqueta: "Todos los documentos", tipos: null },
  facturas: { etiqueta: "Facturas", tipos: ["factura_afecta", "factura_exenta"] },
  notas_credito: { etiqueta: "Notas de crédito", tipos: ["nota_credito"] },
  notas_debito: { etiqueta: "Notas de débito", tipos: ["nota_debito"] },
  guias: { etiqueta: "Guías de despacho", tipos: ["guia_despacho"] },
  boletas: { etiqueta: "Boletas", tipos: ["boleta"] },
  boletas_honorarios: { etiqueta: "Boletas de honorarios", tipos: ["boleta_honorarios"] },
};

type ClaveGrupoTipo = keyof typeof GRUPOS_TIPO;

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

function exportarCsv(documentos: FinanzasIhDocumentoFila[]) {
  const encabezados = [
    "Empresa", "Tipo documento", "Dirección", "RUT", "Razón social", "Folio",
    "Fecha emisión", "Monto Neto", "Monto Exento", "Monto IVA", "Monto Total", "Estado SII",
  ];
  const filas = documentos.map((d) => [
    d.empresa,
    ETIQUETAS_TIPO_DOCUMENTO[d.tipo_documento] ?? d.tipo_documento,
    d.direccion ?? "",
    d.rut_contraparte,
    d.razon_social_contraparte ?? "",
    d.folio,
    d.fecha_emision ?? "",
    d.monto_neto ?? 0,
    d.monto_exento ?? 0,
    d.monto_iva ?? 0,
    d.monto_total ?? 0,
    d.estado_sii ? (ETIQUETAS_ESTADO[d.estado_sii] ?? d.estado_sii) : "",
  ]);
  const csv = [encabezados, ...filas]
    .map((fila) => fila.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(";"))
    .join("\n");
  const blob = new Blob([`﻿${csv}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `facturas-ih-${hoyIso()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function PanelFacturasIh({
  documentos,
  ultimaEjecucionExitosa,
}: {
  documentos: FinanzasIhDocumentoFila[];
  ultimaEjecucionExitosa: { ejecutado_en: string } | null;
}) {
  const router = useRouter();
  const [filtroEmpresa, setFiltroEmpresa] = useState<"todas" | "IH" | "IL">("todas");
  const [direccion, setDireccion] = useState<"venta" | "compra">("venta");
  const [grupoTipo, setGrupoTipo] = useState<ClaveGrupoTipo>("todos");
  const [busqueda, setBusqueda] = useState("");
  const [ordenFecha, setOrdenFecha] = useState<"desc" | "asc">("desc");
  const [actualizando, setActualizando] = useState(false);
  const [errorActualizar, setErrorActualizar] = useState<string | null>(null);
  const [seleccionado, setSeleccionado] = useState<FinanzasIhDocumentoFila | null>(null);

  const documentosFiltrados = useMemo(() => {
    const termino = busqueda.trim().toLowerCase();
    const tiposPermitidos = GRUPOS_TIPO[grupoTipo].tipos;

    return documentos
      .filter((d) => {
        if (filtroEmpresa !== "todas" && d.empresa !== filtroEmpresa) return false;
        if (d.direccion !== direccion) return false;
        if (tiposPermitidos && !tiposPermitidos.includes(d.tipo_documento)) return false;
        if (termino) {
          const enRut = d.rut_contraparte.toLowerCase().includes(termino);
          const enNombre = (d.razon_social_contraparte ?? "").toLowerCase().includes(termino);
          const enFolio = String(d.folio).includes(termino);
          if (!enRut && !enNombre && !enFolio) return false;
        }
        return true;
      })
      .sort((a, b) => {
        const fa = a.fecha_emision ?? "";
        const fb = b.fecha_emision ?? "";
        if (fa === fb) return 0;
        if (fa === "") return 1;
        if (fb === "") return -1;
        return ordenFecha === "desc" ? (fa < fb ? 1 : -1) : fa < fb ? -1 : 1;
      });
  }, [documentos, filtroEmpresa, direccion, grupoTipo, busqueda, ordenFecha]);

  // Resumenes de las tarjetas: siguen la pestana Venta/Compra siempre; los
  // de tipo y afecta/exenta ademas siguen la empresa elegida arriba (Todas/
  // IH/IL) -- el de "por empresa" a proposito NO la sigue, esa tarjeta
  // existe justamente para comparar IH contra IL.
  const universoDireccion = useMemo(() => documentos.filter((d) => d.direccion === direccion), [documentos, direccion]);
  const universoEmpresaDireccion = useMemo(
    () => universoDireccion.filter((d) => filtroEmpresa === "todas" || d.empresa === filtroEmpresa),
    [universoDireccion, filtroEmpresa]
  );

  const conteoPorTipo = useMemo(() => {
    const conteo: Record<string, number> = {};
    for (const d of universoEmpresaDireccion) conteo[d.tipo_documento] = (conteo[d.tipo_documento] ?? 0) + 1;
    return conteo;
  }, [universoEmpresaDireccion]);

  const conteoAfectaExenta = useMemo(
    () => ({
      afecta: universoEmpresaDireccion.filter((d) => d.tipo_documento === "factura_afecta").length,
      exenta: universoEmpresaDireccion.filter((d) => d.tipo_documento === "factura_exenta").length,
    }),
    [universoEmpresaDireccion]
  );

  const conteoPorEmpresa = useMemo(
    () => ({
      IH: universoDireccion.filter((d) => d.empresa === "IH").length,
      IL: universoDireccion.filter((d) => d.empresa === "IL").length,
    }),
    [universoDireccion]
  );

  // Dos llamadas separadas, no una: cada una es su propia invocacion de
  // funcion en Vercel, con su propio limite de 60s (Hobby) -- juntarlas en
  // una sola hacia que la corrida completa (SII representante + login
  // propio de BHE) se pasara del limite y tirara FUNCTION_INVOCATION_TIMEOUT.
  async function actualizarAhora() {
    setActualizando(true);
    setErrorActualizar(null);
    const errores: string[] = [];
    for (const ruta of ["/api/finanzas-ih/actualizar", "/api/finanzas-ih/actualizar-bhe"]) {
      try {
        const resp = await fetch(ruta, { method: "POST" });
        const data = await resp.json();
        if (!resp.ok) throw new Error(data.error ?? "No se pudo actualizar.");
      } catch (err) {
        errores.push(err instanceof Error ? err.message : "Error desconocido");
      }
    }
    setErrorActualizar(errores.length > 0 ? errores.join(" · ") : null);
    router.refresh();
    setActualizando(false);
  }

  return (
    <div>
      <Link
        href="/finanzas"
        className="inline-flex items-center gap-1.5 text-xs font-medium text-tinta/60 hover:text-naranjo"
      >
        <IconArrowLeft size={14} stroke={2} aria-hidden />
        Volver a Finanzas
      </Link>

      <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <span className="block etiqueta-seccion">Panel Finanzas</span>
          <h1 className="mt-2 font-condensed text-2xl font-bold uppercase text-tinta">SII Documentos IH - IL</h1>
          <p className="mt-1 max-w-2xl text-xs text-tinta/50">
            Factura afecta/exenta, notas de crédito/débito y guías de despacho de IH e IL, con su XML o PDF
            respaldado en SharePoint.
          </p>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <button
            onClick={actualizarAhora}
            disabled={actualizando}
            className="inline-flex items-center gap-1.5 rounded-lg border border-borde bg-white px-3 py-1.5 text-xs font-medium text-tinta/70 hover:border-naranjo/40 hover:text-naranjo disabled:opacity-50"
          >
            <IconRefresh size={13} stroke={2} className={actualizando ? "animate-spin" : ""} aria-hidden />
            {actualizando ? "Actualizando con el SII..." : "Actualizar con SII ahora"}
          </button>
          <span className="text-[11px] text-tinta/45">
            {ultimaEjecucionExitosa
              ? `Última actualización: ${new Date(ultimaEjecucionExitosa.ejecutado_en).toLocaleString("es-CL")}`
              : "Todavía no se ha ejecutado la actualización automática."}
          </span>
          {errorActualizar && <span className="text-[11px] text-red-600">{errorActualizar}</span>}
        </div>
      </div>

      <div className="mt-6 inline-flex gap-1 rounded-lg border border-borde bg-crema/50 p-1">
        {(["todas", "IH", "IL"] as const).map((valor) => (
          <button
            key={valor}
            onClick={() => setFiltroEmpresa(valor)}
            className={`rounded-md px-4 py-1.5 text-sm font-semibold transition-colors ${
              filtroEmpresa === valor
                ? "bg-tinta text-white shadow-sm"
                : "text-tinta/55 hover:bg-white hover:text-tinta"
            }`}
          >
            {valor === "todas" ? "Todas" : valor}
          </button>
        ))}
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-borde bg-white p-4">
          <div className="text-xs uppercase text-tinta/50">
            Documentos por tipo · {direccion === "venta" ? "Venta" : "Compra"}
            {filtroEmpresa !== "todas" ? ` · ${filtroEmpresa}` : ""}
          </div>
          <dl className="mt-2 divide-y divide-borde text-sm">
            {Object.entries(GRUPOS_TIPO)
              .filter(([clave]) => clave !== "todos")
              .map(([clave, grupo]) => {
                const total = (grupo.tipos ?? []).reduce((acc, t) => acc + (conteoPorTipo[t] ?? 0), 0);
                return (
                  <div key={clave} className="flex items-center justify-between py-1">
                    <dt className="text-tinta/60">{grupo.etiqueta}</dt>
                    <dd className="font-semibold text-tinta">{total}</dd>
                  </div>
                );
              })}
          </dl>
        </div>

        <div className="rounded-xl border border-borde bg-white p-4">
          <div className="text-xs uppercase text-tinta/50">
            Facturas afectas vs. exentas · {direccion === "venta" ? "Venta" : "Compra"}
            {filtroEmpresa !== "todas" ? ` · ${filtroEmpresa}` : ""}
          </div>
          <dl className="mt-2 divide-y divide-borde text-sm">
            <div className="flex items-center justify-between py-1">
              <dt className="text-tinta/60">Afectas</dt>
              <dd className="font-semibold text-tinta">{conteoAfectaExenta.afecta}</dd>
            </div>
            <div className="flex items-center justify-between py-1">
              <dt className="text-tinta/60">Exentas</dt>
              <dd className="font-semibold text-tinta">{conteoAfectaExenta.exenta}</dd>
            </div>
          </dl>
        </div>

        <div className="rounded-xl border border-borde bg-white p-4">
          <div className="text-xs uppercase text-tinta/50">
            Documentos por empresa · {direccion === "venta" ? "Venta" : "Compra"}
          </div>
          <dl className="mt-2 divide-y divide-borde text-sm">
            <div className="flex items-center justify-between py-1">
              <dt className="text-tinta/60">IH</dt>
              <dd className="font-semibold text-tinta">{conteoPorEmpresa.IH}</dd>
            </div>
            <div className="flex items-center justify-between py-1">
              <dt className="text-tinta/60">IL</dt>
              <dd className="font-semibold text-tinta">{conteoPorEmpresa.IL}</dd>
            </div>
          </dl>
        </div>
      </div>

      <div className="mt-6 flex gap-2">
        <button
          onClick={() => setDireccion("venta")}
          className={`rounded-lg px-4 py-2 text-sm font-semibold uppercase ${
            direccion === "venta" ? "bg-naranjo text-white" : "border border-borde bg-white text-tinta/60"
          }`}
        >
          Venta
        </button>
        <button
          onClick={() => setDireccion("compra")}
          className={`rounded-lg px-4 py-2 text-sm font-semibold uppercase ${
            direccion === "compra" ? "bg-naranjo text-white" : "border border-borde bg-white text-tinta/60"
          }`}
        >
          Compra
        </button>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <div className="relative min-w-[220px] flex-1 max-w-md">
          <IconSearch size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-tinta/40" />
          <input
            type="text"
            placeholder="Buscar por folio, RUT o razón social..."
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            className="w-full rounded-lg border border-borde bg-white py-2 pl-9 pr-3 text-sm text-tinta placeholder:text-tinta/40 focus:border-naranjo focus:outline-none"
          />
        </div>
        <select
          value={grupoTipo}
          onChange={(e) => setGrupoTipo(e.target.value as ClaveGrupoTipo)}
          className="rounded-lg border border-borde bg-white px-3 py-2 text-sm text-tinta focus:border-naranjo focus:outline-none"
        >
          {Object.entries(GRUPOS_TIPO).map(([clave, { etiqueta }]) => (
            <option key={clave} value={clave}>
              {etiqueta}
            </option>
          ))}
        </select>
        <button
          onClick={() => exportarCsv(documentosFiltrados)}
          className="ml-auto text-xs font-medium text-tinta/60 hover:text-naranjo"
        >
          Exportar CSV
        </button>
      </div>

      <div className="mt-4 overflow-x-auto rounded-xl border border-borde bg-white">
        <table className="w-full min-w-[900px] text-left text-sm">
          <thead className="border-b border-borde bg-crema/60 text-xs uppercase text-tinta/50">
            <tr>
              {filtroEmpresa === "todas" && <th className="px-4 py-3">Empresa</th>}
              <th className="px-4 py-3">Documento</th>
              <th className="px-4 py-3">Folio</th>
              <th className="px-4 py-3">{direccion === "venta" ? "RUT receptor" : "RUT proveedor"}</th>
              <th className="px-4 py-3">Razón social</th>
              <th className="px-4 py-3">
                <button
                  onClick={() => setOrdenFecha((o) => (o === "desc" ? "asc" : "desc"))}
                  className="inline-flex items-center gap-1 uppercase text-tinta/50 hover:text-naranjo"
                >
                  Fecha
                  {ordenFecha === "desc" ? <IconChevronDown size={13} stroke={2.5} /> : <IconChevronUp size={13} stroke={2.5} />}
                </button>
              </th>
              <th className="px-4 py-3 text-right">Monto total</th>
              <th className="px-4 py-3">
                <span className="inline-flex items-center gap-1">
                  Estado
                  <IconInfoCircle size={13} stroke={2} className="text-tinta/40" title={TITULO_LEYENDA_ESTADO} />
                </span>
              </th>
            </tr>
          </thead>
          <tbody>
            {documentosFiltrados.map((d) => (
              <tr
                key={d.id}
                onClick={() => setSeleccionado(d)}
                className="cursor-pointer border-b border-borde last:border-0 hover:bg-crema/40"
              >
                {filtroEmpresa === "todas" && (
                  <td className="px-4 py-3">
                    <span className="rounded-full bg-tinta/5 px-2 py-0.5 text-[11px] font-semibold uppercase text-tinta/70">
                      {d.empresa}
                    </span>
                  </td>
                )}
                <td className="px-4 py-3 text-tinta/60">{ETIQUETAS_TIPO_DOCUMENTO[d.tipo_documento] ?? d.tipo_documento}</td>
                <td className="px-4 py-3 text-tinta/60">{d.folio}</td>
                <td className="px-4 py-3 text-tinta/60">{d.rut_contraparte}</td>
                <td className="px-4 py-3 font-medium text-tinta">{d.razon_social_contraparte ?? "-"}</td>
                <td className="px-4 py-3 text-tinta/60">{formatearFecha(d.fecha_emision)}</td>
                <td className="px-4 py-3 text-right text-tinta">{formatearMonto(d.monto_total)}</td>
                <td className="px-4 py-3">
                  {d.estado_sii ? (
                    <span
                      title={DEFINICIONES_ESTADO[d.estado_sii]}
                      className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${CLASES_ESTADO[d.estado_sii]}`}
                    >
                      {ETIQUETAS_ESTADO[d.estado_sii] ?? d.estado_sii}
                    </span>
                  ) : (
                    <span className="text-[11px] text-tinta/35">-</span>
                  )}
                </td>
              </tr>
            ))}
            {documentosFiltrados.length === 0 && (
              <tr>
                <td colSpan={filtroEmpresa === "todas" ? 8 : 7} className="px-4 py-6 text-center text-tinta/50">
                  No hay documentos de {direccion === "venta" ? "venta" : "compra"} que coincidan con el filtro.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {seleccionado && seleccionado.direccion === "venta" && (
        <ModalFacturaIhVenta documento={seleccionado} onCerrar={() => setSeleccionado(null)} />
      )}
      {seleccionado && seleccionado.direccion === "compra" && (
        <ModalFacturaIhCompra documento={seleccionado} onCerrar={() => setSeleccionado(null)} />
      )}
    </div>
  );
}

"use client";

import { useMemo, useState } from "react";
import {
  CATEGORIAS_GASTO,
  TIPOS_DOCUMENTO,
  TRATAMIENTO_DOCUMENTO,
  type CategoriaGasto,
  type GastoRendicion,
  type Rendicion,
  type TipoDocumento,
} from "@/lib/rendidor/tipos";
import { calcularDesglose } from "@/lib/rendidor/iva";
import { TextInput, NumInput, SelectInput, DeleteButton } from "@/components/cotizador/campos/Campos";

// Los archivos viven en memoria del navegador durante la sesión: se envían al
// análisis y otra vez al adjuntar. En esta primera versión no hay bucket, así
// que un borrador recuperado más tarde conserva los DATOS pero no los archivos
// (hay que volver a subirlos para adjuntarlos a Odoo). Se avisa en la UI.
interface ArchivoEnMemoria {
  gastoId: string;
  archivo: File;
}

const money = (n: number) =>
  new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 }).format(n);

type Paso = "subir" | "revisar" | "cargar";

interface CandidatoProveedor {
  id: number;
  name: string;
  vat: string | false;
}

interface EstadoProveedor {
  candidatos: CandidatoProveedor[];
  elegido: number | null;
  crear: boolean;
  esPersonaNatural: boolean;
}

export default function PanelRendicion({ rendicionInicial }: { rendicionInicial: Rendicion }) {
  const [rendicion, setRendicion] = useState(rendicionInicial);
  const [paso, setPaso] = useState<Paso>(rendicion.gastos.length > 0 ? "revisar" : "subir");
  const [archivos, setArchivos] = useState<ArchivoEnMemoria[]>([]);
  const [analizando, setAnalizando] = useState<{ actual: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  // Empleado de Odoo
  const [empleados, setEmpleados] = useState<{ id: number; name: string }[]>([]);
  const [employeeId, setEmployeeId] = useState<number | null>(rendicion.odooEmployeeId);
  const [buscandoEmpleado, setBuscandoEmpleado] = useState(false);

  // Proveedores por gasto
  const [proveedores, setProveedores] = useState<Record<string, EstadoProveedor>>({});
  const [resolviendo, setResolviendo] = useState(false);

  const [resultado, setResultado] = useState<{
    creados: number;
    proveedoresCreados: number;
    problemas: string[];
  } | null>(null);

  const yaCargada = rendicion.estado === "cargada_odoo";

  // El desglose se recalcula acá con las MISMAS reglas que usa la carga a Odoo,
  // así que lo que se ve en pantalla es exactamente lo que se va a cargar.
  const filas = useMemo(
    () =>
      rendicion.gastos.map((g) => {
        let neto = g.neto;
        let iva = g.iva;
        const advertencias: string[] = [];

        if (g.tipoDocumento && g.total > 0) {
          const tratamiento = TRATAMIENTO_DOCUMENTO[g.tipoDocumento];
          try {
            const d = calcularDesglose(
              g.total,
              g.tipoDocumento,
              g.iva > 0 ? g.neto : null,
              g.iva > 0 ? g.iva : null,
              tratamiento.afecto === null ? g.iva > 0 : undefined,
            );
            neto = d.neto;
            iva = d.iva;
            advertencias.push(...d.advertencias);
          } catch (e) {
            advertencias.push(e instanceof Error ? e.message : "No se pudo calcular el IVA.");
          }
        }

        return { gasto: g, neto, iva, advertencias };
      }),
    [rendicion.gastos],
  );

  const totales = useMemo(() => {
    const total = filas.reduce((a, f) => a + f.gasto.total, 0);
    const neto = filas.reduce((a, f) => a + f.neto, 0);
    const iva = filas.reduce((a, f) => a + f.iva, 0);
    return { total, neto, iva, saldo: total - rendicion.montoAsignado };
  }, [filas, rendicion.montoAsignado]);

  const pendientes = useMemo(
    () =>
      filas.filter(
        (f) =>
          !f.gasto.tipoDocumento ||
          !f.gasto.categoria ||
          !f.gasto.fecha ||
          f.gasto.total <= 0 ||
          f.gasto.pendientes.length > 0 ||
          f.advertencias.length > 0,
      ),
    [filas],
  );

  const actualizarGasto = (id: string, patch: Partial<GastoRendicion>) =>
    setRendicion((prev) => ({
      ...prev,
      gastos: prev.gastos.map((g) => (g.id === id ? { ...g, ...patch } : g)),
    }));

  const quitarGasto = (id: string) => {
    setRendicion((prev) => ({ ...prev, gastos: prev.gastos.filter((g) => g.id !== id) }));
    setArchivos((prev) => prev.filter((a) => a.gastoId !== id));
  };

  // PASO 1 y 2: subir y analizar, de a un comprobante (límite de 60s de Vercel).
  const subirYAnalizar = async (lista: FileList) => {
    setError(null);
    const nuevos = Array.from(lista);
    setAnalizando({ actual: 0, total: nuevos.length });

    const gastosNuevos: GastoRendicion[] = [];
    const archivosNuevos: ArchivoEnMemoria[] = [];
    const fallos: string[] = [];

    for (let i = 0; i < nuevos.length; i++) {
      const archivo = nuevos[i];
      setAnalizando({ actual: i + 1, total: nuevos.length });

      const fd = new FormData();
      fd.append("archivo", archivo);

      try {
        const resp = await fetch("/api/rendidor/analizar", { method: "POST", body: fd });
        const json = await resp.json();
        if (!resp.ok) throw new Error(json.error ?? "Error al analizar");

        const l = json.leido;
        const id = crypto.randomUUID();
        gastosNuevos.push({
          id,
          orden: rendicion.gastos.length + gastosNuevos.length + 1,
          fecha: l.fecha,
          proveedor: l.proveedor ?? "",
          rutProveedor: l.rutProveedor,
          numeroDocumento: l.numeroDocumento,
          tipoDocumento: l.tipoDocumento,
          detalle: l.detalle ?? "",
          categoria: l.categoria,
          neto: l.neto ?? 0,
          iva: l.iva ?? 0,
          total: l.total ?? 0,
          pendientes: l.ilegibles ?? [],
          archivoNombre: archivo.name,
          archivoPath: "",
          archivoTipo: archivo.type,
          odooExpenseId: null,
          odooPartnerId: null,
        });
        archivosNuevos.push({ gastoId: id, archivo });
      } catch (e) {
        fallos.push(`${archivo.name}: ${e instanceof Error ? e.message : "error"}`);
      }
    }

    setAnalizando(null);
    if (gastosNuevos.length > 0) {
      setRendicion((prev) => ({ ...prev, gastos: [...prev.gastos, ...gastosNuevos] }));
      setArchivos((prev) => [...prev, ...archivosNuevos]);
      setPaso("revisar");
    }
    if (fallos.length > 0) {
      setError(
        `No se pudieron analizar ${fallos.length} archivo(s). Podés agregarlos a mano.\n` + fallos.join("\n"),
      );
    }
  };

  const guardar = async () => {
    setGuardando(true);
    setError(null);
    setAviso(null);
    try {
      const resp = await fetch(`/api/rendidor/${rendicion.id}/gastos`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gastos: rendicion.gastos }),
      });
      if (!resp.ok) throw new Error((await resp.json()).error ?? "Error al guardar");
      setAviso("Borrador guardado.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar.");
    } finally {
      setGuardando(false);
    }
  };

  const buscarEmpleado = async () => {
    setBuscandoEmpleado(true);
    setError(null);
    try {
      const resp = await fetch(`/api/rendidor/empleados?nombre=${encodeURIComponent(rendicion.nombreQuienRinde)}`);
      const json = await resp.json();
      if (!resp.ok) throw new Error(json.error);
      setEmpleados(json.empleados);
      if (json.empleados.length === 1) setEmployeeId(json.empleados[0].id);
      if (json.empleados.length === 0) {
        setError(
          `No hay ningún empleado en Odoo que coincida con "${rendicion.nombreQuienRinde}". ` +
            "Revisá el nombre — no se puede cargar un gasto sin empleado.",
        );
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo buscar el empleado.");
    } finally {
      setBuscandoEmpleado(false);
    }
  };

  const resolverProveedores = async () => {
    setResolviendo(true);
    setError(null);
    try {
      const resp = await fetch("/api/rendidor/proveedores", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gastos: rendicion.gastos.map((g) => ({
            gastoId: g.id,
            rut: g.rutProveedor,
            proveedor: g.proveedor,
          })),
        }),
      });
      const json = await resp.json();
      if (!resp.ok) throw new Error(json.error);

      const estado: Record<string, EstadoProveedor> = {};
      for (const r of json.resultados) {
        estado[r.gastoId] = {
          candidatos: r.candidatos,
          // Un solo candidato se autoselecciona; varios los elige quien rinde.
          elegido: r.candidatos.length === 1 ? r.candidatos[0].id : null,
          crear: r.candidatos.length === 0,
          esPersonaNatural: false,
        };
      }
      setProveedores(estado);
      setPaso("cargar");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudieron resolver los proveedores.");
    } finally {
      setResolviendo(false);
    }
  };

  const cargarAOdoo = async () => {
    if (!employeeId) {
      setError("Falta elegir el empleado de Odoo.");
      return;
    }
    const sinResolver = rendicion.gastos.filter((g) => {
      const p = proveedores[g.id];
      return !p || (!p.elegido && !p.crear);
    });
    if (sinResolver.length > 0) {
      setError(`Hay ${sinResolver.length} gasto(s) sin proveedor resuelto. Es obligatorio.`);
      return;
    }

    setGuardando(true);
    setError(null);
    try {
      const decisiones = rendicion.gastos.map((g) => {
        const p = proveedores[g.id];
        return p.elegido
          ? { gastoId: g.id, partnerId: p.elegido }
          : {
              gastoId: g.id,
              crear: {
                nombre: g.proveedor,
                rut: g.rutProveedor,
                esPersonaNatural: p.esPersonaNatural,
              },
            };
      });

      const resp = await fetch(`/api/rendidor/${rendicion.id}/cargar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employeeId, proveedores: decisiones }),
      });
      const json = await resp.json();
      if (!resp.ok) throw new Error(json.error);

      // Adjuntar los respaldos de a uno (el body de Vercel no aguanta todos).
      const problemas: string[] = [];
      for (const c of json.creados as { gastoId: string; expenseId: number }[]) {
        const enMemoria = archivos.find((a) => a.gastoId === c.gastoId);
        if (!enMemoria) {
          problemas.push(
            `El gasto ${c.expenseId} quedó sin respaldo: el archivo no está en esta sesión. Subilo a mano en Odoo.`,
          );
          continue;
        }
        const gasto = rendicion.gastos.find((g) => g.id === c.gastoId);
        const fd = new FormData();
        fd.append("archivo", enMemoria.archivo);
        fd.append("expenseId", String(c.expenseId));
        fd.append("totalEsperado", String(gasto?.total ?? 0));

        try {
          const r = await fetch("/api/rendidor/adjuntar", { method: "POST", body: fd });
          const j = await r.json();
          if (!r.ok) problemas.push(`Gasto ${c.expenseId}: ${j.error}`);
          else if (j.problemas?.length) problemas.push(...j.problemas.map((p: string) => `Gasto ${c.expenseId}: ${p}`));
        } catch {
          problemas.push(`Gasto ${c.expenseId}: falló el adjunto.`);
        }
      }

      setRendicion((prev) => ({ ...prev, estado: "cargada_odoo", odooEmployeeId: employeeId }));
      setResultado({
        creados: json.creados.length,
        proveedoresCreados: json.proveedoresCreados.length,
        problemas,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cargar a Odoo.");
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div>
      <span className="etiqueta-seccion">Rendir Gastos</span>
      <h1 className="mt-2 font-condensed text-2xl font-bold uppercase text-tinta">
        {rendicion.tituloRendicion}
      </h1>
      <p className="mt-1 text-sm text-tinta/60">
        {rendicion.nombreQuienRinde} · Fondo entregado {money(rendicion.montoAsignado)}
        {yaCargada && " · Ya cargada a Odoo"}
      </p>

      {error && (
        <div className="mt-3 whitespace-pre-line rounded-lg border border-red-600/20 bg-red-50 px-3 py-2 text-xs text-red-700">
          {error}
        </div>
      )}
      {aviso && (
        <div className="mt-3 rounded-lg border border-teal/20 bg-teal/5 px-3 py-2 text-xs text-teal">{aviso}</div>
      )}

      {resultado && (
        <div className="mt-4 rounded-2xl border border-teal/30 bg-teal/5 p-5">
          <p className="font-condensed text-base font-bold uppercase text-teal">Cargado a Odoo</p>
          <p className="mt-1 text-sm text-tinta/70">
            {resultado.creados} gasto(s) creados
            {resultado.proveedoresCreados > 0 && ` · ${resultado.proveedoresCreados} proveedor(es) nuevos`}
          </p>
          {resultado.problemas.length > 0 && (
            <div className="mt-3 rounded-lg border border-naranjo/25 bg-naranjo/5 px-3 py-2">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-naranjo">
                Revisar en Odoo ({resultado.problemas.length})
              </p>
              <ul className="mt-1 list-inside list-disc text-xs text-tinta/70">
                {resultado.problemas.map((p, i) => (
                  <li key={i}>{p}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* PASO 1 — subir comprobantes */}
      {!yaCargada && (
        <div className="mt-5 rounded-2xl border border-borde bg-white p-5 shadow-sm">
          <p className="font-condensed text-base font-bold uppercase tracking-wide text-tinta">
            1 · Subir comprobantes
          </p>
          <p className="mt-1 text-xs text-tinta/55">
            PDF o imagen. Se analizan de a uno y podés corregir todo después. Los archivos quedan en esta
            pestaña: si cerrás la página antes de cargar a Odoo, los datos se guardan pero hay que volver a
            subir los archivos para adjuntarlos.
          </p>
          <input
            type="file"
            multiple
            accept="application/pdf,image/jpeg,image/png,image/gif,image/webp"
            disabled={analizando !== null}
            onChange={(e) => e.target.files && subirYAnalizar(e.target.files)}
            className="mt-3 block w-full text-xs text-tinta/70 file:mr-3 file:rounded-md file:border file:border-borde file:bg-crema/60 file:px-3 file:py-2 file:text-xs file:font-semibold file:uppercase file:tracking-wide file:text-tinta"
          />
          {analizando && (
            <p className="mt-2 text-xs font-medium text-naranjo">
              Analizando comprobante {analizando.actual} de {analizando.total}...
            </p>
          )}
        </div>
      )}

      {/* PASO 2 — revisar y corregir */}
      {rendicion.gastos.length > 0 && (
        <div className="mt-4 rounded-2xl border border-borde bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-condensed text-base font-bold uppercase tracking-wide text-tinta">
              2 · Revisar y corregir
            </p>
            {pendientes.length > 0 && (
              <span className="rounded-full bg-naranjo/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-naranjo">
                {pendientes.length} por confirmar
              </span>
            )}
          </div>
          <p className="mt-1 text-xs text-tinta/55">
            El neto y el IVA se calculan solos desde el total impreso según el tipo de documento. Lo que
            corrijas acá es exactamente lo que se carga a Odoo.
          </p>

          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[1100px] text-xs">
              <thead>
                <tr className="border-b border-tinta text-left text-[9px] uppercase tracking-wide text-tinta/45">
                  <th className="px-2 py-2">N°</th>
                  <th className="px-2 py-2">Fecha</th>
                  <th className="px-2 py-2">Proveedor</th>
                  <th className="px-2 py-2">RUT</th>
                  <th className="px-2 py-2">N° Doc</th>
                  <th className="px-2 py-2">Tipo documento</th>
                  <th className="px-2 py-2">Detalle</th>
                  <th className="px-2 py-2">Categoría</th>
                  <th className="px-2 py-2 text-right">Neto</th>
                  <th className="px-2 py-2 text-right">IVA</th>
                  <th className="px-2 py-2 text-right">Total</th>
                  {!yaCargada && <th className="px-2 py-2" />}
                </tr>
              </thead>
              <tbody>
                {filas.map(({ gasto: g, neto, iva, advertencias }, i) => (
                  <tr key={g.id} className={i % 2 === 0 ? "bg-crema/30" : ""}>
                    <td className="px-2 py-1.5 font-semibold">{i + 1}</td>
                    <td className="px-2 py-1.5">
                      <input
                        type="date"
                        value={g.fecha ?? ""}
                        disabled={yaCargada}
                        onChange={(e) => actualizarGasto(g.id, { fecha: e.target.value || null })}
                        className="w-32 rounded border border-borde bg-white px-1.5 py-1 text-xs"
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <TextInput
                        value={g.proveedor}
                        disabled={yaCargada}
                        onChange={(v) => actualizarGasto(g.id, { proveedor: v })}
                        className="w-40"
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <TextInput
                        value={g.rutProveedor ?? ""}
                        disabled={yaCargada}
                        onChange={(v) => actualizarGasto(g.id, { rutProveedor: v || null })}
                        className="w-28"
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <TextInput
                        value={g.numeroDocumento ?? ""}
                        disabled={yaCargada}
                        onChange={(v) => actualizarGasto(g.id, { numeroDocumento: v || null })}
                        className="w-24"
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <SelectInput
                        value={(g.tipoDocumento ?? "") as TipoDocumento | ""}
                        disabled={yaCargada}
                        onChange={(v) =>
                          actualizarGasto(g.id, { tipoDocumento: (v || null) as TipoDocumento | null })
                        }
                        options={[
                          { value: "" as TipoDocumento | "", label: "— elegir —" },
                          ...TIPOS_DOCUMENTO.map((t) => ({
                            value: t as TipoDocumento | "",
                            label: TRATAMIENTO_DOCUMENTO[t].etiqueta,
                          })),
                        ]}
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <TextInput
                        value={g.detalle}
                        disabled={yaCargada}
                        onChange={(v) => actualizarGasto(g.id, { detalle: v })}
                        className="w-52"
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <SelectInput
                        value={(g.categoria ?? "") as CategoriaGasto | ""}
                        disabled={yaCargada}
                        onChange={(v) =>
                          actualizarGasto(g.id, { categoria: (v || null) as CategoriaGasto | null })
                        }
                        options={[
                          { value: "" as CategoriaGasto | "", label: "— elegir —" },
                          ...CATEGORIAS_GASTO.map((c) => ({
                            value: c as CategoriaGasto | "",
                            label: c,
                          })),
                        ]}
                      />
                    </td>
                    <td className="px-2 py-1.5 text-right text-tinta/60">{money(neto)}</td>
                    <td className="px-2 py-1.5 text-right text-tinta/60">{money(iva)}</td>
                    <td className="px-2 py-1.5 text-right">
                      <NumInput
                        value={g.total}
                        disabled={yaCargada}
                        onChange={(v) => actualizarGasto(g.id, { total: v })}
                        className="w-24"
                      />
                      {(advertencias.length > 0 || g.pendientes.length > 0) && (
                        <p className="mt-0.5 max-w-[14rem] text-[10px] leading-tight text-naranjo">
                          {[...g.pendientes.map((p) => `Ilegible: ${p}`), ...advertencias].join(" · ")}
                        </p>
                      )}
                    </td>
                    {!yaCargada && (
                      <td className="px-2 py-1.5">
                        <DeleteButton onClick={() => quitarGasto(g.id)} />
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-tinta font-bold">
                  <td className="px-2 py-2" colSpan={8}>
                    TOTALES
                  </td>
                  <td className="px-2 py-2 text-right">{money(totales.neto)}</td>
                  <td className="px-2 py-2 text-right">{money(totales.iva)}</td>
                  <td className="px-2 py-2 text-right">{money(totales.total)}</td>
                  {!yaCargada && <td />}
                </tr>
              </tfoot>
            </table>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-4 rounded-lg bg-crema/60 px-4 py-3">
            <div>
              <p className="text-[10px] uppercase tracking-wide text-tinta/45">Fondo entregado</p>
              <p className="font-condensed text-sm font-bold">{money(rendicion.montoAsignado)}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wide text-tinta/45">Total rendido</p>
              <p className="font-condensed text-sm font-bold">{money(totales.total)}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wide text-tinta/45">
                {totales.saldo >= 0 ? `A reembolsar a ${rendicion.nombreQuienRinde}` : "A reintegrar a la empresa"}
              </p>
              <p className={`font-condensed text-sm font-bold ${totales.saldo >= 0 ? "text-teal" : "text-naranjo"}`}>
                {money(Math.abs(totales.saldo))}
              </p>
            </div>
          </div>

          {!yaCargada && (
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={guardar}
                disabled={guardando}
                className="rounded-md border border-borde bg-white px-4 py-2 text-xs font-semibold uppercase tracking-wide text-tinta transition hover:border-naranjo/50 disabled:opacity-40"
              >
                {guardando ? "Guardando..." : "Guardar borrador"}
              </button>
              <button
                type="button"
                onClick={resolverProveedores}
                disabled={resolviendo || rendicion.gastos.length === 0}
                className="rounded-md bg-tinta px-4 py-2 text-xs font-semibold uppercase tracking-wide text-crema transition hover:bg-tinta/85 disabled:opacity-40"
              >
                {resolviendo ? "Buscando proveedores..." : "Continuar a Odoo →"}
              </button>
            </div>
          )}
        </div>
      )}

      {/* PASO 3 — confirmar y cargar */}
      {paso === "cargar" && !yaCargada && (
        <div className="mt-4 rounded-2xl border border-borde bg-white p-5 shadow-sm">
          <p className="font-condensed text-base font-bold uppercase tracking-wide text-tinta">
            3 · Confirmar y cargar a Odoo
          </p>

          <div className="mt-3">
            <label className="block text-[10px] font-semibold uppercase tracking-wide text-tinta/45">
              Empleado en Odoo
            </label>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={buscarEmpleado}
                disabled={buscandoEmpleado}
                className="rounded-md border border-borde bg-white px-3 py-1.5 text-xs font-medium text-tinta hover:border-naranjo/50 disabled:opacity-40"
              >
                {buscandoEmpleado ? "Buscando..." : `Buscar "${rendicion.nombreQuienRinde}"`}
              </button>
              {empleados.length > 0 && (
                <select
                  value={employeeId ?? ""}
                  onChange={(e) => setEmployeeId(Number(e.target.value) || null)}
                  className="rounded border border-borde bg-white px-2 py-1.5 text-xs"
                >
                  <option value="">— elegir empleado —</option>
                  {empleados.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.name} (id {e.id})
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>

          <p className="mt-4 text-[10px] font-semibold uppercase tracking-wide text-tinta/45">
            Proveedor por gasto (obligatorio)
          </p>
          <div className="mt-2 space-y-2">
            {rendicion.gastos.map((g) => {
              const p = proveedores[g.id];
              if (!p) return null;
              return (
                <div key={g.id} className="rounded-lg border border-borde bg-crema/30 px-3 py-2">
                  <p className="text-xs font-medium text-tinta">
                    {g.orden}. {g.proveedor || "(sin proveedor)"}{" "}
                    <span className="text-tinta/45">{g.rutProveedor ?? "sin RUT"}</span>
                  </p>
                  {p.candidatos.length > 0 ? (
                    <select
                      value={p.elegido ?? ""}
                      onChange={(e) =>
                        setProveedores((prev) => ({
                          ...prev,
                          [g.id]: { ...prev[g.id], elegido: Number(e.target.value) || null, crear: false },
                        }))
                      }
                      className="mt-1 w-full rounded border border-borde bg-white px-2 py-1 text-xs"
                    >
                      <option value="">— elegir proveedor —</option>
                      {p.candidatos.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name} {c.vat ? `· ${c.vat}` : ""} (id {c.id})
                        </option>
                      ))}
                    </select>
                  ) : (
                    <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-tinta/70">
                      <span className="text-naranjo">No existe en Odoo: se creará.</span>
                      <label className="flex items-center gap-1.5">
                        <input
                          type="checkbox"
                          checked={p.esPersonaNatural}
                          onChange={(e) =>
                            setProveedores((prev) => ({
                              ...prev,
                              [g.id]: { ...prev[g.id], esPersonaNatural: e.target.checked },
                            }))
                          }
                        />
                        Es persona natural
                      </label>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {pendientes.length > 0 && (
            <div className="mt-4 rounded-lg border border-naranjo/25 bg-naranjo/5 px-3 py-2 text-xs text-naranjo">
              Hay {pendientes.length} gasto(s) con datos por confirmar. Revisalos antes de cargar: los que no
              tengan tipo de documento, categoría o fecha van a rechazar la carga.
            </div>
          )}

          <button
            type="button"
            onClick={cargarAOdoo}
            disabled={guardando || !employeeId}
            className="mt-4 rounded-md bg-teal px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white transition hover:bg-teal/85 disabled:opacity-40"
          >
            {guardando
              ? "Cargando a Odoo..."
              : `Confirmar y crear ${rendicion.gastos.length} gasto(s) en Odoo`}
          </button>
        </div>
      )}
    </div>
  );
}

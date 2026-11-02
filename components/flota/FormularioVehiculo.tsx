"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { IconPencil, IconPlus } from "@tabler/icons-react";
import VentanaModal from "@/components/inventario/VentanaModal";
import BotonGuardar from "@/components/inventario/BotonGuardar";
import { Campo, Pesos, Seccion, TarjetaAccion } from "@/components/flota/Campos";
import { Patente } from "@/components/flota/Visual";
import { CAMPO } from "@/lib/estilos";
import {
  ETIQUETA_CATEGORIA,
  ETIQUETA_COMBUSTIBLE,
  ETIQUETA_PROPIEDAD,
  type Combustible,
  type Marca,
  type Modelo,
  type Propiedad,
  type Vehiculo,
} from "@/lib/flota-modelo";
import { actualizarVehiculoAction, crearVehiculoAction } from "@/app/(protegido)/flota/acciones";

export default function FormularioVehiculo({
  marcas,
  modelos,
  vehiculo,
  comoTarjeta = false,
}: {
  marcas: Marca[];
  modelos: Modelo[];
  vehiculo?: Vehiculo;
  /** Se abre desde un acceso rápido del tablero en vez del botón. */
  comoTarjeta?: boolean;
}) {
  const editar = Boolean(vehiculo);
  const [abierta, setAbierta] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();
  const [patente, setPatente] = useState(vehiculo?.patente ?? "");
  const [modeloId, setModeloId] = useState(vehiculo?.modeloId ?? "");
  const [anio, setAnio] = useState(vehiculo?.anio ? String(vehiculo.anio) : "");
  const router = useRouter();

  const nombreMarca = new Map(marcas.map((m) => [m.id, m.nombre]));
  const modelo = modelos.find((m) => m.id === modeloId);
  const titulo = modelo ? `${nombreMarca.get(modelo.marcaId) ?? ""} ${modelo.nombre}` : "Marca y modelo";

  function abrir() {
    setPatente(vehiculo?.patente ?? "");
    setModeloId(vehiculo?.modeloId ?? "");
    setAnio(vehiculo?.anio ? String(vehiculo.anio) : "");
    setError(null);
    setAbierta(true);
  }

  function enviar(fd: FormData) {
    setError(null);
    iniciar(async () => {
      const r = editar ? await actualizarVehiculoAction(vehiculo!.id, fd) : await crearVehiculoAction(fd);
      if (!r.ok) return setError(r.error);
      setAbierta(false);
      if (!editar && r.id) router.push(`/flota/vehiculos/${r.id}`);
      else router.refresh();
    });
  }

  return (
    <>
      {comoTarjeta ? (
        <TarjetaAccion titulo="Nuevo vehículo" detalle="Agregar a la flota" Icono={IconPlus} tono="bg-naranjo/10 text-naranjo" onClick={abrir} />
      ) : (
      <button
        onClick={abrir}
        className={
          editar
            ? "inline-flex items-center gap-1.5 rounded-lg border border-borde px-3 py-2 text-sm font-semibold text-azul transition hover:border-cian"
            : "inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-naranjo px-4 text-xs font-bold uppercase tracking-wide text-white shadow-sm transition hover:bg-naranjo-suave"
        }
      >
        {editar ? <IconPencil size={16} /> : <IconPlus size={16} />}
        {editar ? "Editar" : "Nuevo vehículo"}
      </button>
      )}

      <VentanaModal
        abierta={abierta}
        alCerrar={() => setAbierta(false)}
        titulo={editar ? "Editar vehículo" : "Nuevo vehículo"}
        descripcion="Solo la patente es obligatoria. Los vencimientos activan los avisos del tablero."
        ancho="max-w-4xl"
      >
        <form action={enviar} className="grid gap-6 lg:grid-cols-[minmax(0,15rem)_minmax(0,1fr)]">
          <aside className="space-y-4 lg:sticky lg:top-0 lg:self-start">
            <div className="banda-contraste rounded-2xl p-5">
              <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-naranjo">Vista previa</span>
              <div className="mt-4">
                <Patente patente={patente || "AABB10"} />
              </div>
              <p className="texto-banda mt-3 text-sm font-bold">{titulo}</p>
              <p className="texto-banda-65 text-xs">
                {[modelo ? ETIQUETA_CATEGORIA[modelo.categoria] : null, anio || null].filter(Boolean).join(" · ") || "Categoría · año"}
              </p>
            </div>
            <ol className="hidden space-y-2 text-xs text-gris lg:block">
              {["Identificación", "Uso", "Documentos", "Compra y notas"].map((t, i) => (
                <li key={t} className="flex items-center gap-2">
                  <span className="grid h-5 w-5 place-items-center rounded-full bg-naranjo/12 text-[10px] font-bold text-naranjo">{i + 1}</span>
                  {t}
                </li>
              ))}
            </ol>
          </aside>

          <div className="space-y-6">
            <Seccion n={1} titulo="Identificación">
              <div className="grid gap-4 sm:grid-cols-2">
                <Campo etiqueta="Patente" obligatorio>
                  <input name="patente" required value={patente} onChange={(e) => setPatente(e.target.value.toUpperCase().replace(/[^A-Z0-9·.\s-]/g, ""))} maxLength={10} className={`${CAMPO} font-mono uppercase`} placeholder="Ej: ABCD12" autoFocus />
                </Campo>
                <Campo etiqueta="Marca y modelo" ayuda={modelos.length === 0 ? "Créalos en Configuración" : undefined}>
                  <select name="modeloId" value={modeloId} onChange={(e) => setModeloId(e.target.value)} className={CAMPO}>
                    <option value="">— Sin modelo —</option>
                    {marcas.map((ma) => {
                      const deLaMarca = modelos.filter((mo) => mo.marcaId === ma.id);
                      return deLaMarca.length === 0 ? null : (
                        <optgroup key={ma.id} label={ma.nombre}>
                          {deLaMarca.map((mo) => <option key={mo.id} value={mo.id}>{ma.nombre} {mo.nombre}</option>)}
                        </optgroup>
                      );
                    })}
                  </select>
                </Campo>
                <Campo etiqueta="Año">
                  <input name="anio" type="number" min="1950" max="2100" value={anio} onChange={(e) => setAnio(e.target.value)} className={CAMPO} placeholder="2024" />
                </Campo>
                <Campo etiqueta="Color">
                  <input name="color" defaultValue={vehiculo?.color ?? ""} className={CAMPO} placeholder="Blanco" />
                </Campo>
                <Campo etiqueta="N° de chasis (VIN)" ayuda="Opcional">
                  <input name="numeroChasis" defaultValue={vehiculo?.numeroChasis ?? ""} className={`${CAMPO} font-mono`} />
                </Campo>
                <Campo etiqueta="N° de motor" ayuda="Opcional">
                  <input name="numeroMotor" defaultValue={vehiculo?.numeroMotor ?? ""} className={`${CAMPO} font-mono`} />
                </Campo>
              </div>
            </Seccion>

            <Seccion n={2} titulo="Uso">
              <div className="grid gap-4 sm:grid-cols-2">
                <Campo etiqueta="Combustible">
                  <select name="combustible" defaultValue={vehiculo?.combustible ?? "diesel"} className={CAMPO}>
                    {(Object.keys(ETIQUETA_COMBUSTIBLE) as Combustible[]).map((c) => <option key={c} value={c}>{ETIQUETA_COMBUSTIBLE[c]}</option>)}
                  </select>
                </Campo>
                <Campo etiqueta="Se mide en" ayuda="Horas para maquinaria">
                  <select name="unidadOdometro" defaultValue={vehiculo?.unidadOdometro ?? "km"} className={CAMPO}>
                    <option value="km">Kilómetros</option>
                    <option value="horas">Horas de uso</option>
                  </select>
                </Campo>
                {!editar && (
                  <>
                    <Campo etiqueta="Conductor" ayuda="Opcional">
                      <input name="conductor" className={CAMPO} placeholder="Nombre del conductor" />
                    </Campo>
                    <Campo etiqueta="Faena / ubicación" ayuda="Opcional">
                      <input name="faena" className={CAMPO} placeholder="Ej: Calama" />
                    </Campo>
                    <Campo etiqueta="Odómetro actual" ayuda="Opcional">
                      <input name="odometroInicial" type="number" min="0" step="0.1" className={CAMPO} placeholder="0" />
                    </Campo>
                  </>
                )}
                {editar && <input type="hidden" name="faena" value={vehiculo?.faena ?? ""} />}
              </div>
            </Seccion>

            <Seccion n={3} titulo="Documentos">
              <div className="grid gap-4 sm:grid-cols-3">
                <Campo etiqueta="Revisión técnica vence">
                  <input name="revisionTecnicaVence" type="date" defaultValue={vehiculo?.revisionTecnicaVence ?? ""} className={CAMPO} />
                </Campo>
                <Campo etiqueta="Permiso de circulación vence">
                  <input name="permisoCirculacionVence" type="date" defaultValue={vehiculo?.permisoCirculacionVence ?? ""} className={CAMPO} />
                </Campo>
                <Campo etiqueta="SOAP vence">
                  <input name="soapVence" type="date" defaultValue={vehiculo?.soapVence ?? ""} className={CAMPO} />
                </Campo>
              </div>
            </Seccion>

            <Seccion n={4} titulo="Compra y notas">
              <div className="grid gap-4 sm:grid-cols-3">
                <Campo etiqueta="Propiedad">
                  <select name="propiedad" defaultValue={vehiculo?.propiedad ?? "propio"} className={CAMPO}>
                    {(Object.keys(ETIQUETA_PROPIEDAD) as Propiedad[]).map((p) => <option key={p} value={p}>{ETIQUETA_PROPIEDAD[p]}</option>)}
                  </select>
                </Campo>
                <Campo etiqueta="Fecha de adquisición">
                  <input name="fechaAdquisicion" type="date" defaultValue={vehiculo?.fechaAdquisicion ?? ""} className={CAMPO} />
                </Campo>
                <Campo etiqueta="Valor de compra">
                  <Pesos name="valorCompra" valor={vehiculo?.valorCompra ?? 0} />
                </Campo>
              </div>
              <Campo etiqueta="Notas" ayuda="Opcional">
                <textarea name="notas" rows={2} defaultValue={vehiculo?.notas ?? ""} className={CAMPO} placeholder="Accesorios, GPS, observaciones…" />
              </Campo>
            </Seccion>

            {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">{error}</p>}

            <div className="flex items-center justify-end gap-2 border-t border-borde pt-4">
              <button type="button" onClick={() => setAbierta(false)} className="rounded-lg border border-borde px-4 py-2.5 text-xs font-bold uppercase tracking-wide text-gris transition hover:text-tinta">
                Cancelar
              </button>
              <BotonGuardar pendiente={pendiente}>{editar ? "Guardar cambios" : "Crear vehículo"}</BotonGuardar>
            </div>
          </div>
        </form>
      </VentanaModal>
    </>
  );
}

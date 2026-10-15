"use client";

import { useState } from "react";
import { IconPencil } from "@tabler/icons-react";
import BotonGuardar from "./BotonGuardar";
import MensajeDeForm from "./MensajeDeForm";
import { useFormulario } from "./useFormulario";
import { CAMPO } from "@/lib/contratos/estilos";
import type { ResumenDeDotacion } from "@/lib/contratos/acreditacion-modelo";
import { TERMINOS_DE_CONFIGURACION, type Dominio } from "@/lib/contratos/dominio-de-acreditacion";
import { guardarDotacionAction } from "@/app/(protegido)/contratos/[contrato]/acreditacion/acciones";
import { guardarDotacionAction as guardarDotacionDeFlotaAction } from "@/app/(protegido)/contratos/[contrato]/acreditacion-vehiculos/acciones";
import { Protegido } from "./PermisosDelUsuario";

export interface CargoParaDotacion {
  id: string;
  nombre: string;
  cantidadRequerida: number | null;
}

/**
 * El detalle de la dotación —cuántas hay, cuántas faltan, y por cargo— para la ventana de su
 * tarjeta en la nómina. Con un botón para editar la meta.
 */
export function DetalleDeDotacion({
  dominio = "personas",
  resumen,
  alEditar,
}: {
  dominio?: Dominio;
  resumen: ResumenDeDotacion;
  alEditar: () => void;
}) {
  const { meta, contratadas, faltan, sobran, porcentaje, porCargo } = resumen;
  const t = TERMINOS_DE_CONFIGURACION[dominio];
  const completa = meta !== null && meta > 0 && faltan === 0;

  return (
    <div>
      {meta === null ? (
        <p className="text-sm text-gris">{t.dotacionSinMeta}</p>
      ) : (
        <>
          <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-1">
            <p>
              <span className="text-3xl font-extrabold tabular-nums text-tinta">{contratadas}</span>
              <span className="text-lg font-bold text-gris"> de {meta}</span>
              <span className="ml-1.5 text-sm text-gris">{t.contratadas}</span>
            </p>
            <p className={`text-sm font-bold ${completa ? "text-emerald-700" : "text-amber-700"}`}>
              {completa ? t.metaCumplida(sobran) : t.faltan(faltan)}
            </p>
          </div>

          <div
            className="barra-estado relative mt-2.5"
            role="img"
            aria-label={t.barraDeDotacion(contratadas, meta)}
          >
            {resumen.sinContrato > 0 && (
              <i className="absolute inset-y-0 left-0 opacity-35" style={{ width: `${resumen.porcentajeRegistradas}%` }} />
            )}
            <i className="relative" style={{ width: `${porcentaje}%` }} />
          </div>

          {resumen.sinContrato > 0 && (
            <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
              <div className="rounded-lg bg-fondo px-2 py-1.5">
                <dd className="text-lg font-extrabold leading-none tabular-nums text-tinta">{resumen.registradas}</dd>
                <dt className="mt-1 text-[10px] font-bold uppercase tracking-wide text-gris">Registradas</dt>
              </div>
              <div className="rounded-lg bg-fondo px-2 py-1.5">
                <dd className="text-lg font-extrabold leading-none tabular-nums text-emerald-700">{contratadas}</dd>
                <dt className="mt-1 text-[10px] font-bold uppercase tracking-wide text-gris">Con contrato</dt>
              </div>
              <div className="rounded-lg bg-fondo px-2 py-1.5">
                <dd className="text-lg font-extrabold leading-none tabular-nums text-amber-700">{resumen.sinContrato}</dd>
                <dt className="mt-1 text-[10px] font-bold uppercase tracking-wide text-gris">Sin contrato aún</dt>
              </div>
            </dl>
          )}

          {porCargo.length > 0 && (
            <ul className="mt-4 space-y-3 border-t border-borde pt-4">
              {porCargo.map((c) => {
                const pct = c.sinMeta
                  ? 0
                  : c.requeridas === 0
                    ? 100
                    : Math.min(100, Math.round((c.contratadas / c.requeridas) * 100));
                const pctRegistradas = c.sinMeta || c.requeridas === 0 ? 0 : Math.min(100, Math.round((c.registradas / c.requeridas) * 100));
                return (
                  <li key={c.cargoId}>
                    <div className="flex items-baseline justify-between gap-3 text-xs">
                      <span className="min-w-0 truncate font-semibold text-tinta">{c.nombre}</span>
                      <span className="shrink-0 tabular-nums text-gris">
                        <strong className="font-extrabold text-tinta">{c.contratadas}</strong>
                        {c.sinMeta ? (
                          <span className="ml-1.5 font-bold text-gris-suave">· sin cantidad definida</span>
                        ) : (
                          <> de {c.requeridas}</>
                        )}
                        {c.sinContrato > 0 && (
                          <span className="ml-1.5 font-bold text-amber-700">· +{c.sinContrato} sin contrato</span>
                        )}
                        {!c.sinMeta && c.faltan > 0 && (
                          <span className="ml-1.5 font-bold text-amber-700">· faltan {c.faltan}</span>
                        )}
                        {!c.sinMeta && c.faltan === 0 && c.requeridas > 0 && (
                          <span className="ml-1.5 font-bold text-emerald-700">· completo</span>
                        )}
                        {c.sobran > 0 && <span className="ml-1.5 font-bold text-gris">· {c.sobran} de más</span>}
                      </span>
                    </div>
                    {!c.sinMeta && (
                      <div className="barra-estado relative mt-1.5" aria-hidden>
                        {c.sinContrato > 0 && (
                          <i className="absolute inset-y-0 left-0 opacity-35" style={{ width: `${pctRegistradas}%` }} />
                        )}
                        <i className="relative" style={{ width: `${pct}%` }} />
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          {resumen.origen === "cargos" && (
            <p className="mt-3 text-[11px] text-gris-suave">
              {t.totalDesdeCategorias}
            </p>
          )}
        </>
      )}

      <div className="mt-5 border-t border-borde pt-4">
        <button
          type="button"
          onClick={alEditar}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-borde px-3 py-2 text-[11px] font-bold uppercase tracking-wide text-azul transition hover:border-cian"
        >
          <IconPencil size={14} />
          {meta === null ? "Definir dotación" : "Editar dotación"}
        </button>
      </div>
    </div>
  );
}

/** El formulario para definir la meta: el total del contrato y la cantidad de cada cargo. */
export function FormularioDeDotacion({
  dominio = "personas",
  totalDelContrato,
  cargos,
  alTerminar,
}: {
  dominio?: Dominio;
  totalDelContrato: number | null;
  cargos: CargoParaDotacion[];
  alTerminar: () => void;
}) {
  const t = TERMINOS_DE_CONFIGURACION[dominio];
  const { estado, enviar, pendiente } = useFormulario(async (previo, datos) => {
    const guardar = dominio === "vehiculos" ? guardarDotacionDeFlotaAction : guardarDotacionAction;
    const resultado = await guardar(previo, datos);
    if (resultado.ok) alTerminar();
    return resultado;
  });

  // La suma de los cargos, en vivo, para ver de un vistazo si cuadra con el total.
  const [cantidades, setCantidades] = useState<Record<string, string>>(
    Object.fromEntries(cargos.map((c) => [c.id, c.cantidadRequerida === null ? "" : String(c.cantidadRequerida)])),
  );
  const suma = Object.values(cantidades).reduce((n, v) => n + (Number.parseInt(v, 10) || 0), 0);
  const hayCantidades = Object.values(cantidades).some((v) => v !== "");

  return (
    <form onSubmit={enviar} className="space-y-5">
<Protegido capacidad="configurar">
      <label className="block">
        <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-gris">
          Total a contratar
        </span>
        <input
          name="total"
          type="number"
          inputMode="numeric"
          min={0}
          step={1}
          defaultValue={totalDelContrato ?? ""}
          placeholder="Por ejemplo: 25"
          className={`${CAMPO} sm:max-w-[12rem]`}
        />
        <span className="mt-1 block text-[11px] text-gris-suave">
          {t.ayudaDelTotal}
        </span>
      </label>

      {cargos.length > 0 && (
        <fieldset>
          <legend className="mb-1 flex w-full items-center justify-between text-[11px] font-bold uppercase tracking-wide text-gris">
            <span>{t.porCategoria}</span>
            {hayCantidades && <span className="tabular-nums text-cian-texto">Suman {suma}</span>}
          </legend>
          <ul className="divide-y divide-borde overflow-hidden rounded-xl border border-borde">
            {cargos.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-3 px-3 py-1.5">
                <label htmlFor={`cargo_${c.id}`} className="min-w-0 flex-1 truncate text-sm text-tinta">
                  {c.nombre}
                </label>
                {/* El ancho va en el contenedor: CAMPO trae `w-full`, que le gana a cualquier `w-*`
                    puesto en el propio input y dejaba al nombre del cargo sin sitio. */}
                <div className="w-24 shrink-0">
                  <input
                    id={`cargo_${c.id}`}
                    name={`cargo_${c.id}`}
                    type="number"
                    inputMode="numeric"
                    min={0}
                    step={1}
                    value={cantidades[c.id]}
                    onChange={(e) => setCantidades((x) => ({ ...x, [c.id]: e.target.value }))}
                    placeholder="—"
                    aria-label={t.cantidadDe(c.nombre)}
                    className={`${CAMPO} text-right tabular-nums`}
                  />
                </div>
              </li>
            ))}
          </ul>
          <p className="mt-1.5 text-[11px] text-gris-suave">
            {t.ayudaPorCategoria}
          </p>
        </fieldset>
      )}

      <div className="flex flex-wrap items-center gap-3 border-t border-borde pt-4">
        <BotonGuardar pendiente={pendiente}>Guardar</BotonGuardar>
        <button
          type="button"
          onClick={alTerminar}
          className="min-h-11 px-2 text-xs font-bold uppercase tracking-wide text-gris transition hover:text-azul"
        >
          Cancelar
        </button>
        <MensajeDeForm estado={estado} />
      </div>
    </Protegido>
</form>
  );
}

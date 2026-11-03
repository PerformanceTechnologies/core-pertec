"use client";

import { useState } from "react";
import { IconPlus, IconReceipt2 } from "@tabler/icons-react";
import VentanaModal from "@/components/inventario/VentanaModal";
import BotonEnviar from "@/components/BotonEnviar";
import { Campo, Seccion, TarjetaAccion } from "@/components/flota/Campos";
import { CAMPO } from "@/lib/estilos";
import { crearRendicionAction } from "@/app/(protegido)/rendir-gastos/acciones";
import { money } from "@/components/rendidor/Visual";

const EMPRESAS = [
  { id: 1, nombre: "Performance Technologies SpA" },
  { id: 2, nombre: "Performance Service SpA" },
];

/**
 * Crear una rendición: título, quién rinde, fondo entregado y empresa. Al crear se va
 * directo a subir comprobantes.
 */
export default function NuevaRendicion({
  yo,
  personas,
  comoTarjeta = false,
}: {
  yo: { correo: string; nombre: string };
  /** Solo para quien administra gastos: puede crearla a nombre de otra persona. */
  personas?: { correo: string; nombre: string }[];
  comoTarjeta?: boolean;
}) {
  const [abierta, setAbierta] = useState(false);
  const [titulo, setTitulo] = useState("");
  const [monto, setMonto] = useState("");
  const [rinde, setRinde] = useState(yo.correo);
  const [empresa, setEmpresa] = useState(1);
  const nombreRinde = personas?.find((p) => p.correo === rinde)?.nombre ?? yo.nombre;

  function abrir() {
    setTitulo("");
    setMonto("");
    setRinde(yo.correo);
    setEmpresa(1);
    setAbierta(true);
  }

  return (
    <>
      {comoTarjeta ? (
        <TarjetaAccion titulo="Nueva rendición" detalle="Sube boletas y facturas" Icono={IconPlus} tono="bg-naranjo/10 text-naranjo" onClick={abrir} />
      ) : (
        <button onClick={abrir} className="inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-naranjo px-4 text-xs font-bold uppercase tracking-wide text-white shadow-sm transition hover:bg-naranjo-suave">
          <IconPlus size={16} /> Nueva rendición
        </button>
      )}

      <VentanaModal abierta={abierta} alCerrar={() => setAbierta(false)} titulo="Nueva rendición" descripcion="Después de crearla subes los comprobantes y el Core los lee solo." ancho="max-w-3xl">
        <form action={crearRendicionAction} className="grid gap-6 lg:grid-cols-[minmax(0,14rem)_minmax(0,1fr)]">
          <aside className="lg:sticky lg:top-0 lg:self-start">
            <div className="banda-contraste space-y-4 rounded-2xl p-5">
              <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-naranjo">Resumen</span>
              <span className="grid h-11 w-11 place-items-center rounded-xl bg-naranjo/20 text-naranjo">
                <IconReceipt2 size={22} stroke={1.75} />
              </span>
              <div>
                <p className="texto-banda text-sm font-bold leading-snug">{titulo || "Título de la rendición"}</p>
                <p className="texto-banda-65 mt-1 text-xs">{nombreRinde}</p>
              </div>
              <div className="borde-banda border-t pt-3">
                <p className="texto-banda-45 text-[10px] font-semibold uppercase tracking-[0.14em]">Fondo entregado</p>
                <p className="texto-banda font-condensed text-3xl font-bold tabular-nums">{money(Number(monto) || 0)}</p>
              </div>
            </div>
          </aside>

          <div className="space-y-6">
            <Seccion n={1} titulo="¿De qué es la rendición?">
              <Campo etiqueta="Título" obligatorio>
                <input name="tituloRendicion" required value={titulo} onChange={(e) => setTitulo(e.target.value)} autoFocus className={CAMPO} placeholder="Ej: Operación Antucoya — marzo" />
              </Campo>
              {personas && personas.length > 1 && (
                <Campo etiqueta="¿Quién rinde?" ayuda="Puedes crearla a nombre de otra persona">
                  <select name="rindeCorreo" value={rinde} onChange={(e) => setRinde(e.target.value)} className={CAMPO}>
                    {personas.map((p) => (
                      <option key={p.correo} value={p.correo}>{p.nombre}{p.correo === yo.correo ? " (yo)" : ""}</option>
                    ))}
                  </select>
                </Campo>
              )}
            </Seccion>

            <Seccion n={2} titulo="¿Te entregaron un fondo?">
              <Campo etiqueta="Monto entregado" ayuda="0 si pagaste de tu bolsillo">
                <span className="relative block">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gris">$</span>
                  <input name="montoAsignado" type="number" min="0" step="1" value={monto} onChange={(e) => setMonto(e.target.value)} placeholder="0" className={`${CAMPO} pl-7`} />
                </span>
              </Campo>
              <p className="text-xs text-gris">Al final se compara con lo rendido: si gastaste más, la empresa te devuelve la diferencia; si sobró, la reintegras.</p>
            </Seccion>

            <Seccion n={3} titulo="¿A qué empresa?">
              <input type="hidden" name="empresaCompanyId" value={empresa} />
              <div className="grid gap-2 sm:grid-cols-2">
                {EMPRESAS.map((e) => (
                  <button
                    key={e.id}
                    type="button"
                    onClick={() => setEmpresa(e.id)}
                    className={`rounded-xl border p-3 text-left text-sm font-semibold transition ${empresa === e.id ? "border-naranjo bg-naranjo/[0.06] text-tinta ring-2 ring-naranjo/15" : "border-borde text-gris hover:border-naranjo/40"}`}
                  >
                    {e.nombre}
                  </button>
                ))}
              </div>
            </Seccion>

            <div className="flex justify-end gap-2 border-t border-borde pt-4">
              <button type="button" onClick={() => setAbierta(false)} className="rounded-lg border border-borde px-4 py-2.5 text-xs font-bold uppercase tracking-wide text-gris transition hover:text-tinta">
                Cancelar
              </button>
              <BotonEnviar cargando="Creando…" className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-azul px-4 py-2.5 text-xs font-bold uppercase tracking-wide text-white transition hover:bg-azul-suave">
                Crear y subir comprobantes →
              </BotonEnviar>
            </div>
          </div>
        </form>
      </VentanaModal>
    </>
  );
}

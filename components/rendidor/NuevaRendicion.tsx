"use client";

import { useState } from "react";
import { IconPlus, IconWallet } from "@tabler/icons-react";
import VentanaModal from "@/components/inventario/VentanaModal";
import BotonEnviar from "@/components/BotonEnviar";
import { Campo, TarjetaAccion } from "@/components/flota/Campos";
import { CAMPO } from "@/lib/estilos";
import { crearRendicionAction } from "@/app/(protegido)/rendir-gastos/acciones";
import { pesos } from "@/lib/rendidor/fondos-modelo";

const EMPRESAS = [
  { id: 1, nombre: "Performance Technologies SpA" },
  { id: 2, nombre: "Performance Service SpA" },
];

export interface FondoElegible {
  id: string;
  codigo: string;
  rendidorNombre: string;
  saldo: number;
  motivo: string | null;
  esMio: boolean;
}

/**
 * Crear un informe de rendición: siempre contra un fondo ACTIVO (el propio, o —si administra
 * gastos— el de otra persona). Al crear se va directo a subir las boletas.
 */
export default function NuevaRendicion({ fondos, comoTarjeta = false }: { fondos: FondoElegible[]; comoTarjeta?: boolean }) {
  const [abierta, setAbierta] = useState(false);
  const [fondoId, setFondoId] = useState("");
  const [titulo, setTitulo] = useState("");
  const [empresa, setEmpresa] = useState(1);
  const elegido = fondos.find((f) => f.id === fondoId);

  function abrir() {
    setFondoId(fondos.length === 1 ? fondos[0].id : "");
    setTitulo("");
    setEmpresa(1);
    setAbierta(true);
  }

  return (
    <>
      {comoTarjeta ? (
        <TarjetaAccion titulo="Nuevo informe" detalle="Rinde boletas contra un fondo" Icono={IconPlus} tono="bg-naranjo/10 text-naranjo" onClick={abrir} />
      ) : (
        <button onClick={abrir} className="inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-naranjo px-4 text-xs font-bold uppercase tracking-wide text-white shadow-sm transition hover:bg-naranjo-suave">
          <IconPlus size={16} /> Nuevo informe
        </button>
      )}

      <VentanaModal abierta={abierta} alCerrar={() => setAbierta(false)} titulo="Nuevo informe de rendición" descripcion="Elige el fondo y después subes las boletas: el Core las lee solo." ancho="max-w-xl">
        {fondos.length === 0 ? (
          <div className="space-y-3 py-4 text-center">
            <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-naranjo/10 text-naranjo">
              <IconWallet size={24} />
            </span>
            <p className="font-bold text-tinta">No tienes un fondo activo</p>
            <p className="text-sm text-gris">Para rendir necesitas un fondo. Pídelo con «Solicitar fondo»; cuando Tesorería lo transfiera, quedará activo.</p>
          </div>
        ) : (
          <form action={crearRendicionAction} className="space-y-4">
            <Campo etiqueta="Fondo *">
              <select name="fondoId" required value={fondoId} onChange={(e) => setFondoId(e.target.value)} className={CAMPO}>
                <option value="">Elige un fondo…</option>
                {fondos.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.codigo} · {f.esMio ? "mío" : f.rendidorNombre} · saldo {pesos(f.saldo)}
                  </option>
                ))}
              </select>
            </Campo>
            {elegido && (
              <p className="rounded-xl bg-emerald-500/[0.07] px-3 py-2 text-xs text-emerald-800">
                Tienes <b>{pesos(elegido.saldo)}</b> disponibles en {elegido.codigo}
                {elegido.motivo ? ` · ${elegido.motivo}` : ""}.
              </p>
            )}
            <Campo etiqueta="Título del informe *">
              <input name="tituloRendicion" required maxLength={200} value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Ej: Operación Antucoya — semana 1" className={CAMPO} />
            </Campo>
            <Campo etiqueta="Empresa que reembolsa">
              <input type="hidden" name="empresaCompanyId" value={empresa} />
              <div className="grid gap-2 sm:grid-cols-2">
                {EMPRESAS.map((e) => (
                  <button
                    key={e.id}
                    type="button"
                    onClick={() => setEmpresa(e.id)}
                    className={`rounded-lg border px-3 py-2 text-left text-xs font-semibold transition ${empresa === e.id ? "border-naranjo bg-naranjo/[0.07] text-tinta" : "border-borde text-gris hover:text-tinta"}`}
                  >
                    {e.nombre}
                  </button>
                ))}
              </div>
            </Campo>
            <div className="flex justify-end">
              <BotonEnviar cargando="Creando…">Crear y subir boletas →</BotonEnviar>
            </div>
          </form>
        )}
      </VentanaModal>
    </>
  );
}

"use client";

import { useState } from "react";
import { IconPlus, IconWallet } from "@tabler/icons-react";
import VentanaModal from "@/components/inventario/VentanaModal";
import BotonEnviar from "@/components/BotonEnviar";
import { Campo, TarjetaAccion } from "@/components/flota/Campos";
import { CAMPO } from "@/lib/estilos";
import { crearRendicionAction } from "@/app/(protegido)/rendir-gastos/acciones";
import { pesos } from "@/lib/rendidor/fondos-modelo";

export interface FondoElegible {
  id: string;
  codigo: string;
  rendidorNombre: string;
  saldo: number;
  motivo: string | null;
  esMio: boolean;
}

/**
 * Crear un informe de rendición: con un fondo ACTIVO (el propio, o —si administra gastos— el de otra
 * persona), o sin fondo (queda en borrador hasta asociarlo a uno).
 */
export default function NuevaRendicion({ fondos, comoTarjeta = false, empresa }: { fondos: FondoElegible[]; comoTarjeta?: boolean; /** La empresa activa: es la que reembolsa. */ empresa?: string }) {
  const [abierta, setAbierta] = useState(false);
  const [fondoId, setFondoId] = useState("");
  const [titulo, setTitulo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const elegido = fondos.find((f) => f.id === fondoId);

  function abrir() {
    setFondoId(fondos.length === 1 ? fondos[0].id : "");
    setTitulo("");
    setError(null);
    setAbierta(true);
  }

  return (
    <>
      {comoTarjeta ? (
        <TarjetaAccion titulo="Nuevo informe" detalle="Con fondo o sin fondo (borrador)" Icono={IconPlus} tono="bg-naranjo/10 text-naranjo" onClick={abrir} />
      ) : (
        <button onClick={abrir} className="inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-naranjo px-4 text-xs font-bold uppercase tracking-wide text-white shadow-sm transition hover:bg-naranjo-suave">
          <IconPlus size={16} /> Nuevo informe
        </button>
      )}

      <VentanaModal abierta={abierta} alCerrar={() => setAbierta(false)} titulo="Nuevo informe de rendición" descripcion="Puedes crearlo con un fondo, o sin fondo: sin fondo queda en borrador hasta que lo asocies a uno." ancho="max-w-xl">
        <form
          action={async (fd) => {
            setError(null);
            const r = await crearRendicionAction(fd);
            if (r && !r.ok) setError(r.error);
          }}
          className="space-y-4"
        >
          <Campo etiqueta="Fondo">
            <select name="fondoId" value={fondoId} onChange={(e) => setFondoId(e.target.value)} className={CAMPO}>
              <option value="">Sin fondo (queda en borrador)</option>
              {fondos.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.codigo} · {f.esMio ? "mío" : f.rendidorNombre} · saldo {pesos(f.saldo)}
                </option>
              ))}
            </select>
          </Campo>
          {elegido ? (
            <p className="rounded-xl bg-emerald-500/[0.07] px-3 py-2 text-xs text-emerald-800">
              Tienes <b>{pesos(elegido.saldo)}</b> disponibles en {elegido.codigo}
              {elegido.motivo ? ` · ${elegido.motivo}` : ""}.
            </p>
          ) : (
            <p className="flex items-start gap-2 rounded-xl bg-sky-500/[0.07] px-3 py-2 text-xs text-sky-800">
              <IconWallet size={15} className="mt-px shrink-0" />
              {fondos.length === 0
                ? "No tienes un fondo activo. Puedes crear el informe sin fondo y enviarlo igual: lo que gastes se te reembolsa al aprobarlo."
                : "Sin fondo: se envía igual a revisión y, al aprobarlo, se te reembolsa todo lo rendido."}
            </p>
          )}
          <Campo etiqueta="Título del informe *">
            <input name="tituloRendicion" required maxLength={200} value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Ej: Operación Antucoya — semana 1" className={CAMPO} />
          </Campo>
          {empresa && (
            <p className="text-xs text-gris">Reembolsa: <span className="font-semibold text-tinta">{empresa}</span> (la empresa en la que estás)</p>
          )}
          {error && <p className="rounded-lg bg-rose-500/10 px-3 py-2 text-sm text-rose-600">{error}</p>}
          <div className="flex justify-end">
            <BotonEnviar cargando="Creando…">Crear informe →</BotonEnviar>
          </div>
        </form>
      </VentanaModal>
    </>
  );
}

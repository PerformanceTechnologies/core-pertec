"use client";

import { useState } from "react";
import { IconCheck, IconClock, IconMinus } from "@tabler/icons-react";
import RuedaCarga from "./RuedaCarga";
import { ETIQUETAS, type EstadoRequisito } from "@/lib/contratos/contratos-estado";
import { mensajeDeError } from "@/lib/contratos/errores-cliente";
import { usePuede } from "./PermisosDelUsuario";

const OPCIONES: { valor: EstadoRequisito; icono: React.ReactNode; clases: string }[] = [
  {
    valor: "pendiente",
    icono: <IconClock size={15} />,
    clases: "border-amber-200 bg-amber-50 text-amber-700",
  },
  {
    valor: "subido",
    icono: <IconCheck size={15} />,
    clases: "border-emerald-200 bg-emerald-50 text-emerald-700",
  },
  {
    valor: "no_aplica",
    icono: <IconMinus size={15} />,
    clases: "border-borde bg-fondo text-gris",
  },
];

/**
 * El estado de un requisito, en tres botones.
 *
 * Tres botones y no un desplegable: son tres opciones, se ven todas a la vez, y
 * cambiar el estado pasa a ser un clic en vez de tres. En una carpeta con ocho
 * requisitos eso es la diferencia entre ocho clics y veinticuatro.
 *
 * El cambio se aplica al instante y sin confirmar. Es reversible con otro clic y
 * no destruye nada: pedir confirmación para algo así solo agrega un paso.
 */
export default function SelectorDeEstado({
  seccion,
  itemId,
  ruta,
  estadoInicial,
  cambiar,
}: {
  seccion: string;
  itemId: string;
  ruta: string;
  estadoInicial: EstadoRequisito;
  cambiar: (
    seccion: string,
    itemId: string,
    ruta: string,
    estado: EstadoRequisito,
  ) => Promise<void>;
}) {
  const puedeEditar = usePuede("editar");
  const [estado, setEstado] = useState<EstadoRequisito>(estadoInicial);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function elegir(nuevo: EstadoRequisito) {
    if (nuevo === estado || guardando) return;

    const anterior = estado;
    // Se pinta antes de que responda el servidor: el botón tiene que sentirse
    // inmediato. Si falla, vuelve al valor anterior y lo dice — mentir sobre un
    // estado que no se guardó es peor que tardar.
    setEstado(nuevo);
    setGuardando(true);
    setError(null);

    try {
      await cambiar(seccion, itemId, ruta, nuevo);
    } catch (e) {
      setEstado(anterior);
      setError(mensajeDeError(e, "No se pudo guardar"));
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-1.5">
        {OPCIONES.map((opcion) => {
          const activo = estado === opcion.valor;
          return (
            <button
              key={opcion.valor}
              onClick={() => void elegir(opcion.valor)}
              disabled={guardando || !puedeEditar}
              aria-pressed={activo}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide transition disabled:opacity-60 ${
                activo
                  ? opcion.clases
                  : "border-borde text-gris-suave hover:border-cian hover:text-azul"
              }`}
            >
              {guardando && activo ? <RuedaCarga className="h-3.5 w-3.5" /> : opcion.icono}
              {ETIQUETAS[opcion.valor]}
            </button>
          );
        })}
      </div>
      {error && <p className="mt-1.5 text-[11px] font-semibold text-red-600">{error}</p>}
    </div>
  );
}

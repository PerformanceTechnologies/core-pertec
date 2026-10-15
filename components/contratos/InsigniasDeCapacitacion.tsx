import {
  ETIQUETAS_RESULTADO,
  ETIQUETAS_TIPO_CAPACITACION,
  type ResultadoDeCurso,
  type TipoDeCapacitacion,
} from "@/lib/contratos/acreditacion-modelo";
import { textoDeSituacion, type SituacionDeCapacitacion } from "@/lib/contratos/capacitaciones-modelo";

// Los mismos tonos que el resto de Acreditación: ámbar = falta, rojo = pasó, verde = listo.
const BASE =
  "inline-flex shrink-0 items-center rounded-md border px-1.5 py-0.5 text-[10px] font-bold uppercase leading-none tracking-wide";

/** Curso o examen: dos colores distintos para leer la lista sin leer cada fila. */
export function InsigniaDeTipo({ tipo }: { tipo: TipoDeCapacitacion }) {
  return (
    <span
      className={`${BASE} ${
        tipo === "examen"
          ? "border-cian/50 bg-cian-lavado text-azul"
          : "border-indigo-200 bg-indigo-50 text-indigo-700"
      }`}
    >
      {ETIQUETAS_TIPO_CAPACITACION[tipo]}
    </span>
  );
}

/** Para lo que sigue reservado: cuánto falta, o cuánto se atrasó. */
export function InsigniaDeSituacion({ situacion }: { situacion: SituacionDeCapacitacion }) {
  const clases: Record<SituacionDeCapacitacion["situacion"], string> = {
    atrasada: "border-red-200 bg-red-50 text-red-700",
    hoy: "border-amber-300 bg-amber-100 text-amber-800",
    proxima: "border-amber-200 bg-amber-50 text-amber-700",
    agendada: "border-borde bg-fondo text-gris",
    sin_fecha: "border-borde bg-fondo text-gris-suave",
    realizada: "border-emerald-200 bg-emerald-50 text-emerald-700",
    cancelada: "border-borde bg-fondo text-gris-suave line-through",
  };
  return <span className={`${BASE} ${clases[situacion.situacion]}`}>{textoDeSituacion(situacion)}</span>;
}

/** Aprobado o reprobado; sin resultado, «Sin resultado» en gris. */
export function InsigniaDeResultado({ resultado }: { resultado: ResultadoDeCurso | null }) {
  if (!resultado) {
    return <span className={`${BASE} border-borde bg-fondo text-gris-suave`}>Sin resultado</span>;
  }
  return (
    <span
      className={`${BASE} ${
        resultado === "aprobado"
          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
          : "border-red-200 bg-red-50 text-red-700"
      }`}
    >
      {ETIQUETAS_RESULTADO[resultado]}
    </span>
  );
}

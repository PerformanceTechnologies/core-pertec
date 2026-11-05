"use client";

import { useEffect, useSyncExternalStore } from "react";
import { nuevosEnMuroAction } from "@/app/(protegido)/muro/acciones";

// El aviso de mensajes nuevos del Muro en el menú de la izquierda. Una sola consulta cada 30 s
// para todas las burbujas (la del módulo y la del submódulo). La última visita al Muro se
// recuerda en este navegador, por empresa; abrir el Muro la pone al día.

const CLAVE = "muro-visto";
const CADA_MS = 30_000;

let cuantos = 0;
const oyentes = new Set<() => void>();
let reloj: ReturnType<typeof setInterval> | null = null;

function avisar() {
  for (const o of oyentes) o();
}

function leerVistos(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(CLAVE) ?? "{}") as Record<string, string>;
  } catch {
    return {};
  }
}

function guardarVisto(empresaId: string, cuando = new Date().toISOString()) {
  try {
    localStorage.setItem(CLAVE, JSON.stringify({ ...leerVistos(), [empresaId]: cuando }));
  } catch {
    /* sin almacenamiento: el aviso no se recuerda, nada más */
  }
}

async function consultar() {
  if (typeof document !== "undefined" && document.hidden) return;
  const vistos = leerVistos();
  const r = await nuevosEnMuroAction(vistos).catch(() => null);
  if (!r) return;
  if (!vistos[r.empresaId]) guardarVisto(r.empresaId); // primera vez en esta empresa: se parte de ahora
  if (window.location.pathname === "/muro") {
    guardarVisto(r.empresaId);
    if (cuantos !== 0) {
      cuantos = 0;
      avisar();
    }
    return;
  }
  if (r.cuantos !== cuantos) {
    cuantos = r.cuantos;
    avisar();
  }
}

function suscribir(o: () => void) {
  oyentes.add(o);
  if (!reloj) {
    consultar();
    reloj = setInterval(consultar, CADA_MS);
  }
  return () => {
    oyentes.delete(o);
    if (oyentes.size === 0 && reloj) {
      clearInterval(reloj);
      reloj = null;
    }
  };
}

/** Lo llama el Muro mientras está abierto: lo que se ve ya está visto. */
export function marcarMuroVisto(empresaId: string) {
  guardarVisto(empresaId);
  if (cuantos !== 0) {
    cuantos = 0;
    avisar();
  }
}

export function useNuevosMuro(): number {
  return useSyncExternalStore(suscribir, () => cuantos, () => 0);
}

/** La burbuja naranja con el número. No se dibuja si no hay nada nuevo. */
export function InsigniaMuro({ chica = false }: { chica?: boolean }) {
  const n = useNuevosMuro();
  if (n <= 0) return null;
  const texto = n > 9 && chica ? "9+" : String(n);
  return (
    <span
      className={`animar-aviso grid shrink-0 place-items-center rounded-full bg-naranjo font-bold text-white shadow-sm ${
        chica ? "absolute -right-1 -top-1 h-4 min-w-4 px-1 text-[9px]" : "h-5 min-w-5 px-1.5 text-[11px]"
      }`}
      title={n === 1 ? "1 mensaje nuevo en el Muro" : `${n} mensajes nuevos en el Muro`}
      aria-label={n === 1 ? "1 mensaje nuevo" : `${n} mensajes nuevos`}
    >
      {texto}
    </span>
  );
}

/** Para usar dentro del Muro: lo marca visto al abrir y cada vez que cambia lo que hay. */
export function useMarcarMuroVisto(empresaId: string, señal: unknown) {
  useEffect(() => {
    marcarMuroVisto(empresaId);
  }, [empresaId, señal]);
}


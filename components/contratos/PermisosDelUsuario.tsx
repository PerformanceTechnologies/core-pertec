"use client";

import { createContext, useContext } from "react";
import { puede, type Capacidad } from "@/lib/contratos/permisos";
import type { Rol } from "@/lib/contratos/tipos";

// El rol de quien mira, disponible para cualquier componente cliente sin pasarlo de padre a hijo
// por veinte niveles. Es SOLO para esconder lo que no se puede hacer: el que lo niega de verdad es
// el servidor (exigirCapacidad), porque una acción se puede invocar sin pasar por la pantalla.

const RolContext = createContext<Rol>("usuario");

export function PermisosDelUsuario({ rol, children }: { rol: Rol; children: React.ReactNode }) {
  return <RolContext.Provider value={rol}>{children}</RolContext.Provider>;
}

/** `const puedeEditar = usePuede("editar")`. Sin proveedor, el más restringido: el rol normal. */
export function usePuede(capacidad: Capacidad): boolean {
  return puede(useContext(RolContext), capacidad);
}

/**
 * Deja a sus hijos tal cual si el rol permite la capacidad; si no, los muestra DESHABILITADOS
 * (un <fieldset disabled> apaga todos los campos y botones de adentro) con un aviso corto.
 *
 * Para los formularios y selectores que un rol puede ver pero no modificar: sirve más que
 * esconderlos, porque se ve el dato. El que lo niega de verdad es el servidor.
 */
export function Protegido({
  capacidad,
  children,
  aviso = true,
}: {
  capacidad: Capacidad;
  children: React.ReactNode;
  /** Si dice «tu rol solo permite ver esto». Los selectores sueltos no lo necesitan. */
  aviso?: boolean;
}) {
  if (usePuede(capacidad)) return <>{children}</>;
  return (
    <fieldset disabled className="contents">
      {children}
      {aviso && (
        <p className="text-[11px] italic text-gris-suave sm:col-span-2">
          Tu rol permite ver esto, no modificarlo.
        </p>
      )}
    </fieldset>
  );
}

/** Muestra a sus hijos solo si el rol permite la capacidad. */
export function SoloSi({
  capacidad,
  children,
  alternativa = null,
}: {
  capacidad: Capacidad;
  children: React.ReactNode;
  alternativa?: React.ReactNode;
}) {
  return usePuede(capacidad) ? <>{children}</> : <>{alternativa}</>;
}

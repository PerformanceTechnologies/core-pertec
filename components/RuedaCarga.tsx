/**
 * La rueda que gira mientras algo está en curso.
 *
 * No es un componente cliente: es SVG y una clase de animación, así que puede
 * renderizarse desde el servidor igual que desde un botón cliente. Eso importa,
 * porque si llevara "use client" cada pantalla que la usa arrastraría un bundle
 * extra para mostrar un círculo.
 *
 * El tamaño va en `em` y el color en `currentColor` a propósito: puesta dentro de
 * un botón hereda el tamaño de letra y el color del texto, así que no hay que
 * pasarle nada para que combine.
 */
export default function RuedaCarga({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      // aria-hidden porque el estado ya lo dice el texto del botón
      // ("Creando..."), y un lector de pantalla no gana nada anunciando el
      // dibujo dos veces.
      aria-hidden="true"
      className={`h-[1em] w-[1em] animate-spin ${className}`}
    >
      {/* El anillo completo, tenue: es la pista por la que corre el arco. */}
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="3" opacity="0.25" />
      {/* Un cuarto de vuelta opaco. Es lo que hace visible el giro: un anillo
          entero girando se ve idéntico a un anillo quieto. */}
      <path
        d="M21 12a9 9 0 0 0-9-9"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}

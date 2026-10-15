/**
 * La rueda de espera. Es un SVG y no un borde girado con CSS porque el arco
 * tiene que verse igual sobre el azul del botón primario y sobre la superficie
 * blanca de una tarjeta, y un borde con `border-t-transparent` deja ver el color
 * de atrás en un cuarto de la vuelta.
 */
export default function RuedaCarga({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={`animate-spin ${className}`} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path
        d="M22 12a10 10 0 0 0-10-10"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}

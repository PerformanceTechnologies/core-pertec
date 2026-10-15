import Link from "@/components/contratos/Enlace";

const VISTAS = [
  { clave: "nomina", etiqueta: "Nómina", ruta: "" },
  { clave: "matriz", etiqueta: "Matriz", ruta: "/matriz" },
  { clave: "reporte", etiqueta: "Reporte", ruta: "/reporte" },
] as const;

export type VistaDeAcreditacion = (typeof VISTAS)[number]["clave"];

/**
 * Las tres formas de mirar la misma nómina: una lista, una matriz y un resumen.
 *
 * Son pestañas y no tres entradas de la barra lateral: son el mismo submódulo
 * visto de distinta forma, y con tres enlaces de menú se leerían como tres
 * módulos distintos.
 */
export default function NavegacionAcreditacion({
  actual,
  base = "/contratos/acreditacion",
  etiquetaDeLaLista = "Nómina",
}: {
  actual: VistaDeAcreditacion;
  /** La ruta del submódulo: Acreditación Personas o Acreditación Vehículos tienen las mismas tres vistas. */
  base?: string;
  /** Cómo se llama la lista: «Nómina» (personas) o «Flota» (vehículos). */
  etiquetaDeLaLista?: string;
}) {
  return (
    // Sin borde ni margen propios: la cabecera la pone en una fila con la fecha límite y es ella
    // quien dibuja la línea de abajo. overflow-y-hidden porque un contenedor con overflow-x
    // pasa a tener también scroll vertical, y cualquier desborde de un píxel muestra una barra.
    <nav
      aria-label="Vistas de la nómina"
      className="flex gap-0.5 overflow-x-auto overflow-y-hidden border-b border-borde [scrollbar-width:none] sm:border-b-0 [&::-webkit-scrollbar]:hidden"
    >
      {VISTAS.map((v) => (
        <Link
          key={v.clave}
          href={`${base}${v.ruta}`}
          aria-current={actual === v.clave ? "page" : undefined}
          className={`flex min-h-11 shrink-0 items-center border-b-2 px-4 text-xs font-bold uppercase tracking-wide transition ${
            actual === v.clave
              ? "border-cian text-azul"
              : "border-transparent text-gris hover:text-azul"
          }`}
        >
          {v.clave === "nomina" ? etiquetaDeLaLista : v.etiqueta}
        </Link>
      ))}
    </nav>
  );
}

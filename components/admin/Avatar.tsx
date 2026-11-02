import { iniciales } from "@/lib/administracion-modelo";

/**
 * El círculo con las iniciales de una persona. Decorativo (aria-hidden): el nombre siempre está al
 * lado en texto. Naranjo para los administradores y teal para el resto, como la insignia del rol.
 */
export default function Avatar({
  nombre,
  correo,
  admin,
  tamano = "md",
}: {
  nombre: string | null;
  correo: string;
  admin: boolean;
  tamano?: "md" | "lg";
}) {
  return (
    <span
      aria-hidden
      className={`grid shrink-0 place-items-center rounded-full font-condensed font-bold tracking-wide ${
        tamano === "lg" ? "h-12 w-12 text-lg" : "h-10 w-10 text-sm"
      } ${admin ? "bg-naranjo/12 text-naranjo" : "bg-teal/12 text-teal"}`}
    >
      {iniciales(nombre, correo)}
    </span>
  );
}

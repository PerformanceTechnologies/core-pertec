import Link from "@/components/contratos/Enlace";
import { IconBooks, IconChevronRight } from "@tabler/icons-react";
import { NOMBRE_DEL_REPOSITORIO, RUTA_DEL_REPOSITORIO } from "@/lib/contratos/repositorio-modelo";

/**
 * La fila del repositorio de apoyo, al final de la lista de Documentos generales.
 *
 * Es una carpeta de consulta, no un requisito: no tiene estado, avance ni responsable, y por eso
 * no lleva chip ni barra, y su franja es azul y no uno de los colores del estado. Solo el nombre
 * y el camino para entrar, con la misma forma que las demás filas (ver FilaDeCarpeta) para que
 * la lista se lea como una sola.
 *
 * Va siempre, exista o no ya la carpeta en SharePoint: la crea la primera subida.
 */
export default function FilaDeRepositorio() {
  return (
    <li data-estado="repositorio" className="fila-estado group flex items-center gap-3 py-3 pl-5 pr-4">
      <span className="tarjeta-icono" aria-hidden>
        <IconBooks size={19} stroke={1.75} />
      </span>
      <Link
        href={`/contratos/${RUTA_DEL_REPOSITORIO}`}
        // Sin precarga, igual que las filas de requisitos: la página lee SharePoint, y la lista no
        // tiene por qué pedirla hasta que alguien entra.
        prefetch={false}
        className="titular block min-w-0 flex-1 text-sm leading-snug text-azul [overflow-wrap:anywhere] after:absolute after:inset-0 after:content-['']"
      >
        {NOMBRE_DEL_REPOSITORIO}
      </Link>
      <IconChevronRight
        size={18}
        className="hidden shrink-0 text-gris-suave transition group-hover:translate-x-0.5 group-hover:text-azul lg:block"
        aria-hidden
      />
    </li>
  );
}

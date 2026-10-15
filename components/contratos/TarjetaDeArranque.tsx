import { IconReceipt2, IconTruck } from "@tabler/icons-react";
import TarjetaDeCarpeta from "./TarjetaDeCarpeta";
import { resumenDelModulo } from "@/lib/contratos/arranque";
import { MODULOS, formatearPesos, type ModuloArranque } from "@/lib/contratos/arranque-modelo";
import { exigirSesion, tieneAccesoAApp } from "@/lib/contratos/autorizacion";
import { hoyEnChile } from "@/lib/contratos/acreditacion-modelo";
import { listarPlazos } from "@/lib/contratos/plazos";
import { leerPlazo } from "@/lib/contratos/plazos-modelo";

const ICONOS = {
  logistica: IconTruck,
  gastos: IconReceipt2,
} as const;

/**
 * La tarjeta de Logística o de Gastos de arranque en la portada de Contrato DCH.
 *
 * Es la misma tarjeta que usan las demás —anillo, franja de color— para que se lea como
 * un módulo más del contrato. Aparece solo para quien lo tiene asignado, y no rompe la
 * portada si falla: Contrato DCH funciona sin ella, y una tarjeta de más no justifica
 * tumbar la pantalla donde se sigue el resto.
 *
 * Lee un resumen recordado por 30 segundos (ver resumenDelModulo), no las partidas.
 */
export default async function TarjetaDeArranque({ modulo }: { modulo: ModuloArranque }) {
  const config = MODULOS[modulo];

  const usuario = await exigirSesion();
  if (!(await tieneAccesoAApp(usuario, config.appSlug))) return null;

  let resumen;
  try {
    resumen = await resumenDelModulo(modulo);
  } catch (e) {
    console.error(
      `[${config.appSlug}] La tarjeta de la portada no pudo leer el resumen: ${e instanceof Error ? e.message : e}`,
    );
    return null;
  }

  const { avance } = resumen;
  const plazo = leerPlazo((await listarPlazos())[modulo], hoyEnChile());
  const Icono = ICONOS[modulo];

  const descripcion =
    avance.total === 0
      ? `Todavía no hay ${config.plural} registrados`
      : modulo === "gastos"
        ? `${formatearPesos(resumen.presupuestado)} presupuestado`
        : `${avance.total} ${avance.total === 1 ? config.singular : config.plural}`;

  return (
    <li>
      <TarjetaDeCarpeta
        nombre={config.tituloTarjeta}
        href={config.ruta}
        avance={avance}
        descripcion={descripcion}
        icono={<Icono size={20} stroke={1.75} />}
        alertas={resumen.alertas}
        unidad={config.unidad}
        plazo={plazo}
      />
    </li>
  );
}

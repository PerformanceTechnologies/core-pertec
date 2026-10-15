import { IconCar } from "@tabler/icons-react";
import TarjetaDeCarpeta from "./TarjetaDeCarpeta";
import { cargarVehiculos } from "@/lib/contratos/dashboard";
import { hoyEnChile } from "@/lib/contratos/acreditacion-modelo";
import { listarPlazos } from "@/lib/contratos/plazos";
import { leerPlazo } from "@/lib/contratos/plazos-modelo";
import { exigirSesion, tieneAccesoAApp } from "@/lib/contratos/autorizacion";

/**
 * La tarjeta de Acreditación Vehículos en la portada de Contratos, hermana de la de Personas.
 *
 * Los números salen del mismo resumen que el tablero (cargarVehiculos, que ya se recuerda unos
 * segundos), así que la tarjeta y el widget no pueden contradecirse. Como la de Personas, no
 * aparece sin el submódulo asignado y no rompe la portada si falla: Contratos funciona sin ella.
 */
export default async function TarjetaDeVehiculos() {
  const usuario = await exigirSesion();
  if (!(await tieneAccesoAApp(usuario, "acreditacion-vehiculos"))) return null;

  let resumen;
  try {
    resumen = await cargarVehiculos();
  } catch (e) {
    console.error(
      `[vehiculos] La tarjeta de la portada no pudo leer la flota: ${e instanceof Error ? e.message : e}`,
    );
    return null;
  }

  const { avance, vehiculos, dotacion, etapas } = resumen;
  const acreditados = etapas.acreditado;
  const plazo = leerPlazo((await listarPlazos())["acreditacion-vehiculos"], hoyEnChile());
  const descripcion =
    vehiculos === 0 && dotacion.meta === null
      ? "Todavía no hay vehículos en la flota"
      : `${dotacion.meta !== null ? `${vehiculos} de ${dotacion.meta} contratados` : `${vehiculos} ${vehiculos === 1 ? "vehículo" : "vehículos"}`} · ${acreditados} ${
          acreditados === 1 ? "acreditado" : "acreditados"
        }`;

  return (
    <li>
      <TarjetaDeCarpeta
        nombre="ACREDITACIÓN VEHÍCULOS"
        href="/contratos/acreditacion-vehiculos"
        avance={avance}
        descripcion={descripcion}
        icono={<IconCar size={20} stroke={1.75} />}
        alertas={resumen.alertas.length}
        plazo={plazo}
      />
    </li>
  );
}

import { IconId } from "@tabler/icons-react";
import TarjetaDeCarpeta from "./TarjetaDeCarpeta";
import { cargarNomina } from "@/lib/contratos/acreditacion";
import { alertasDePersona, estaContratada, hoyEnChile, resumirDotacion } from "@/lib/contratos/acreditacion-modelo";
import { resumenDeTarjeta } from "@/lib/contratos/acreditacion-alertas";
import { listarPlazos } from "@/lib/contratos/plazos";
import { leerPlazo } from "@/lib/contratos/plazos-modelo";
import { exigirSesion, tieneAccesoAApp } from "@/lib/contratos/autorizacion";
import type { Avance } from "@/lib/contratos/contratos-estado";

async function calcularResumen() {
  const nomina = await cargarNomina();
  const activas = nomina.personas.filter((p) => p.persona.activo);

  const suma = activas.reduce(
    (acc, p) => ({
      total: acc.total + p.analisis.avance.total,
      subidos: acc.subidos + p.analisis.avance.subidos,
      noAplican: acc.noAplican + p.analisis.avance.noAplican,
    }),
    { total: 0, subidos: 0, noAplican: 0 },
  );

  const avance: Avance = {
    total: suma.total,
    subidos: suma.subidos,
    pendientes: suma.total - suma.subidos,
    noAplican: suma.noAplican,
    porcentaje: suma.total === 0 ? 0 : Math.round((suma.subidos / suma.total) * 100),
  };

  return {
    avance,
    alertas: activas.reduce(
      (n, p) => n + alertasDePersona(p.persona, p.analisis, nomina.tipos).length,
      0,
    ),
    personas: activas.length,
    acreditadas: activas.filter((p) => p.analisis.etapa === "acreditada").length,
    // La meta de dotación y cuántas CONTRATADAS hay (activas con fecha de ingreso y sin «sin contrato
    // aún»), para decir «1 de 10 contratadas» y no contar a quien aún no firma.
    ...(({ meta, contratadas, registradas }) => ({ meta, contratadas, registradas }))(
      resumirDotacion(
        nomina.contrato.dotacionRequerida,
        nomina.cargos,
        activas.filter((p) => estaContratada(p.persona)).map((p) => ({ cargoId: p.persona.cargoId })),
        activas.map((p) => ({ cargoId: p.persona.cargoId })),
      ),
    ),
  };
}

/**
 * La tarjeta de Acreditación en la portada de Contratos, junto a las carpetas.
 *
 * Es la misma tarjeta que usan las carpetas —anillo, franja de color, contadores—
 * para que se lea como un requisito más del contrato y no como un módulo aparte,
 * aunque viva en su propio submódulo.
 *
 * Los números son de DOCUMENTOS de las personas activas, sumados y no promediados:
 * promediar le daría el mismo peso a alguien con 11 requisitos que a alguien con 23.
 * Las alertas son las mismas del panel «Requiere atención» de la nómina —documentos
 * vencidos o por vencer y contratos que terminan—, para que el número de acá y el de
 * allá no se contradigan.
 *
 * No aparece si quien mira no tiene el submódulo asignado, y no rompe la portada si
 * falla: Contratos funciona sin Acreditación, y una tarjeta de más no justifica
 * tumbar la pantalla donde se sigue el resto.
 */
export default async function TarjetaDeAcreditacion() {
  const usuario = await exigirSesion();
  if (!(await tieneAccesoAApp(usuario, "acreditacion"))) return null;

  // Lo que la tarjeta necesita son cinco números, no la nómina: se calculan UNA vez y
  // se recuerdan 30 s (ver resumenDeTarjeta). Leer la nómina entera —personas,
  // documentos, cursos— en cada regreso a la portada era lo más caro de esa pantalla
  // después de SharePoint.
  let resumen;
  try {
    resumen = await resumenDeTarjeta(calcularResumen);
  } catch (e) {
    console.error(
      `[acreditacion] La tarjeta de la portada no pudo leer la nómina: ${e instanceof Error ? e.message : e}`,
    );
    return null;
  }

  const { avance, alertas, personas, acreditadas, meta, contratadas, registradas } = resumen;
  const plazo = leerPlazo((await listarPlazos()).acreditacion, hoyEnChile());
  const descripcion =
    personas === 0 && meta === null
      ? "Todavía no hay personas en la nómina"
      : `${meta !== null ? `${contratadas} de ${meta} contratadas${registradas > contratadas ? ` (${registradas} registradas)` : ""}` : `${personas} ${personas === 1 ? "persona" : "personas"}`} · ${acreditadas} ${
          acreditadas === 1 ? "acreditada" : "acreditadas"
        }`;

  return (
    <li>
      <TarjetaDeCarpeta
        nombre="ACREDITACIÓN PERSONAS"
        href="/contratos/acreditacion"
        avance={avance}
        descripcion={descripcion}
        icono={<IconId size={20} stroke={1.75} />}
        alertas={alertas}
        plazo={plazo}
      />
    </li>
  );
}

import { IconId, IconUsers } from "@tabler/icons-react";
import CajaDeWidget, { VacioDeWidget } from "./CajaDeWidget";
import { BarrasHorizontales, Embudo, Pastilla, type FilaDeBarra } from "./graficos";
import { tonoDePlazo, type ResumenDeAcreditacion } from "@/lib/contratos/dashboard-modelo";
import { textoDePlazo, type LecturaDePlazo } from "@/lib/contratos/plazos-modelo";

/** Una cifra con su rótulo, para la fila de arriba del widget. */
export function Dato({ valor, etiqueta, tono }: { valor: number; etiqueta: string; tono?: "aviso" | "critico" | "ok" }) {
  return (
    <div data-tono={tono ?? "neutro"} className="min-w-0 rounded-lg bg-fondo px-3 py-2">
      <span
        className="block text-xl font-extrabold leading-none tabular-nums"
        style={{ color: tono && valor > 0 ? "var(--tono-texto)" : "var(--color-tinta)" }}
      >
        {valor}
      </span>
      <span className="mt-1 block truncate text-[10px] font-bold uppercase tracking-wide text-gris">{etiqueta}</span>
    </div>
  );
}

/**
 * Acreditación Personas: el recorrido de la gente, la dotación y lo que falta pedir.
 *
 * Tres miradas distintas de la misma nómina, lado a lado:
 *  · el embudo, que dice dónde se queda la gente en el camino (documentos → Web Control → BUK);
 *  · la dotación por cargo, contra la meta de cuántas personas hay que contratar;
 *  · los documentos que más faltan, que es lo que hay que pedirle a todos esta semana.
 */
export default function WidgetAcreditacion({
  datos,
  plazo,
}: {
  datos: ResumenDeAcreditacion;
  plazo: LecturaDePlazo | null;
}) {
  const { etapas, personas } = datos;

  const pasos = [
    { clave: "nomina", etiqueta: "En la nómina", valor: personas },
    { clave: "docs", etiqueta: "Documentos al 100%", valor: personas - etapas.documentacion },
    { clave: "wc", etiqueta: "Acreditadas en Web Control", valor: etapas.buk + etapas.acreditada },
    { clave: "buk", etiqueta: "Creadas en BUK · completas", valor: etapas.acreditada },
  ];

  const d = datos.dotacion;
  const filasDeDotacion: FilaDeBarra[] =
    d.porCargo.length > 0
      ? d.porCargo
          .slice()
          .sort((a, b) => b.requeridas - a.requeridas)
          .map((c) => ({
            clave: c.cargoId,
            etiqueta: c.nombre,
            detalle:
              (c.sinMeta
                ? "sin cantidad definida"
                : c.faltan > 0
                  ? `faltan ${c.faltan}`
                  : c.sobran > 0
                    ? `${c.sobran} sobre la meta`
                    : "meta cumplida") +
              // Registradas que todavía no cuentan: sin esto, un cargo con gente en proceso parece vacío.
              (c.sinContrato > 0 ? ` · +${c.sinContrato} sin contrato` : ""),
            valor: c.contratadas,
            referencia: c.sinMeta ? undefined : c.requeridas,
            texto: c.sinMeta ? String(c.contratadas) : `${c.contratadas}/${c.requeridas}`,
            tono: c.sinMeta || c.faltan > 0 ? "curso" : "ok",
          }))
      : datos.porCargo.map((c) => ({
          clave: c.nombre,
          etiqueta: c.nombre,
          detalle: `${c.personas} ${c.personas === 1 ? "persona" : "personas"}${c.contratadas < c.personas ? ` (${c.contratadas} con contrato)` : ""} · ${c.acreditadas} acreditadas`,
          valor: c.porcentaje,
          texto: `${c.porcentaje}%`,
          tono: c.porcentaje >= 100 ? "ok" : "curso",
        }));

  const filasDeFaltantes: FilaDeBarra[] = datos.faltantes.map((f) => ({
    clave: f.nombre,
    etiqueta: f.nombre,
    valor: f.faltan,
    referencia: undefined,
    texto: `${f.faltan} de ${f.exigido}`,
    tono: f.faltan === f.exigido ? "critico" : "aviso",
  }));

  return (
    <CajaDeWidget
      titulo="Acreditación Personas"
      subtitulo={
        d.meta === null
          ? `${personas} ${personas === 1 ? "persona" : "personas"} en la nómina`
          : `${d.contratadas} de ${d.meta} contratadas${d.sinContrato > 0 ? ` (${d.registradas} registradas)` : ""} · ${etapas.acreditada} ${etapas.acreditada === 1 ? "acreditada" : "acreditadas"}`
      }
      icono={<IconId size={18} stroke={1.8} />}
      href="/contratos/acreditacion"
      derecha={plazo && <Pastilla tono={tonoDePlazo(plazo)}>{textoDePlazo(plazo)}</Pastilla>}
    >
      {personas === 0 && d.meta === null ? (
        <VacioDeWidget
          icono={<IconUsers size={22} />}
          titulo="Todavía no hay personas"
          texto="Da de alta a la primera persona o importa la nómina, y acá verás su recorrido de acreditación."
        />
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-4 xl:grid-cols-8">
            <Dato valor={personas} etiqueta="Activas" />
            <Dato valor={etapas.acreditada} etiqueta="Acreditadas" tono="ok" />
            <Dato valor={datos.bajas} etiqueta="De baja" />
            <Dato valor={datos.vencidos} etiqueta="Docs vencidos" tono="critico" />
            <Dato valor={datos.porVencer} etiqueta="Por vencer" tono="aviso" />
            <Dato valor={datos.contratosPorTerminar} etiqueta="Contratos a terminar" tono="aviso" />
            <Dato valor={datos.capacitaciones.enCurso} etiqueta="Cursos y exám." />
            <Dato valor={datos.capacitaciones.atrasadas} etiqueta="Cursos atrasados" tono="critico" />
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.25fr_1fr_1fr]">
            <div>
              <h3 className="mb-3 text-[11px] font-bold uppercase tracking-wide text-gris">Recorrido de acreditación</h3>
              {personas === 0 ? (
                <p className="rounded-lg bg-fondo px-3 py-6 text-center text-xs text-gris">Sin personas activas.</p>
              ) : (
                <Embudo pasos={pasos} total={personas} />
              )}
            </div>

            <div>
              <h3 className="mb-3 text-[11px] font-bold uppercase tracking-wide text-gris">
                {d.porCargo.length > 0 ? "Dotación por cargo" : "Avance por cargo"}
              </h3>
              {filasDeDotacion.length === 0 ? (
                <p className="rounded-lg bg-fondo px-3 py-6 text-center text-xs text-gris">
                  Define cuántas personas hay que contratar por cargo para ver lo que falta.
                </p>
              ) : (
                <BarrasHorizontales filas={filasDeDotacion} escalaPorFila={d.porCargo.length > 0} />
              )}
            </div>

            <div>
              <h3 className="mb-3 text-[11px] font-bold uppercase tracking-wide text-gris">Lo que más falta</h3>
              {filasDeFaltantes.length === 0 ? (
                <p className="rounded-lg bg-fondo px-3 py-6 text-center text-xs text-gris">
                  No falta ningún documento exigido.
                </p>
              ) : (
                <BarrasHorizontales filas={filasDeFaltantes} />
              )}
            </div>
          </div>
        </div>
      )}
    </CajaDeWidget>
  );
}

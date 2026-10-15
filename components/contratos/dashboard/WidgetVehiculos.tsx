import { IconCar } from "@tabler/icons-react";
import CajaDeWidget, { VacioDeWidget } from "./CajaDeWidget";
import { BarrasHorizontales, Embudo, Pastilla, type FilaDeBarra } from "./graficos";
import { Dato } from "./WidgetAcreditacion";
import { tonoDePlazo, type ResumenDeVehiculos } from "@/lib/contratos/dashboard-modelo";
import { textoDePlazo, type LecturaDePlazo } from "@/lib/contratos/plazos-modelo";

/**
 * Acreditación Vehículos: el mismo recorrido que el de las personas, sin BUK.
 *
 *  · el embudo dice dónde se queda la flota (documentos → Web Control);
 *  · la dotación, contra la meta de cuántos vehículos hay que tener por tipo;
 *  · los documentos que más faltan, que es lo que hay que pedirle a los proveedores esta semana.
 */
export default function WidgetVehiculos({
  datos,
  plazo,
}: {
  datos: ResumenDeVehiculos;
  plazo: LecturaDePlazo | null;
}) {
  const { etapas, vehiculos } = datos;

  const pasos = [
    { clave: "flota", etiqueta: "En la flota", valor: vehiculos },
    { clave: "docs", etiqueta: "Documentos al 100%", valor: vehiculos - etapas.documentacion },
    { clave: "wc", etiqueta: "Acreditados en Web Control", valor: etapas.acreditado },
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
            detalle: c.sinMeta ? "sin cantidad definida" : c.faltan > 0 ? `faltan ${c.faltan}` : c.sobran > 0 ? `${c.sobran} sobre la meta` : "meta cumplida",
            valor: c.contratadas,
            referencia: c.sinMeta ? undefined : c.requeridas,
            texto: c.sinMeta ? String(c.contratadas) : `${c.contratadas}/${c.requeridas}`,
            tono: c.sinMeta || c.faltan > 0 ? "curso" : "ok",
          }))
      : datos.porCategoria.map((c) => ({
          clave: c.nombre,
          etiqueta: c.nombre,
          detalle: `${c.vehiculos} ${c.vehiculos === 1 ? "vehículo" : "vehículos"} · ${c.acreditados} acreditados`,
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
      titulo="Acreditación Vehículos"
      subtitulo={
        d.meta === null
          ? `${vehiculos} ${vehiculos === 1 ? "vehículo" : "vehículos"} en la flota`
          : `${d.contratadas} de ${d.meta} contratados · ${etapas.acreditado} ${etapas.acreditado === 1 ? "acreditado" : "acreditados"}`
      }
      icono={<IconCar size={18} stroke={1.8} />}
      href="/contratos/acreditacion-vehiculos"
      derecha={plazo && <Pastilla tono={tonoDePlazo(plazo)}>{textoDePlazo(plazo)}</Pastilla>}
    >
      {vehiculos === 0 && d.meta === null ? (
        <VacioDeWidget
          icono={<IconCar size={22} />}
          titulo="Todavía no hay vehículos"
          texto="Da de alta el primer vehículo y acá verás su recorrido de acreditación."
        />
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Dato valor={vehiculos} etiqueta="Activos" />
            <Dato valor={etapas.acreditado} etiqueta="Acreditados" tono="ok" />
            <Dato valor={datos.vencidos} etiqueta="Docs vencidos" tono="critico" />
            <Dato valor={datos.porVencer} etiqueta="Por vencer" tono="aviso" />
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.25fr_1fr_1fr]">
            <div>
              <h3 className="mb-3 text-[11px] font-bold uppercase tracking-wide text-gris">Recorrido de acreditación</h3>
              {vehiculos === 0 ? (
                <p className="rounded-lg bg-fondo px-3 py-6 text-center text-xs text-gris">Sin vehículos activos.</p>
              ) : (
                <Embudo pasos={pasos} total={vehiculos} />
              )}
            </div>

            <div>
              <h3 className="mb-3 text-[11px] font-bold uppercase tracking-wide text-gris">
                {d.porCargo.length > 0 ? "Dotación por tipo" : "Avance por tipo"}
              </h3>
              {filasDeDotacion.length === 0 ? (
                <p className="rounded-lg bg-fondo px-3 py-6 text-center text-xs text-gris">
                  Define cuántos vehículos hay que tener por tipo para ver lo que falta.
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

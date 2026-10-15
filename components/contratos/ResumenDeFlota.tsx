import Link from "@/components/contratos/Enlace";
import { IconAlertTriangle, IconCalendarDue } from "@tabler/icons-react";
import ChipDeEtapaDeVehiculo from "./ChipDeEtapaDeVehiculo";
import TarjetasDeResumen, { type TarjetaDeResumen } from "./TarjetasDeResumen";
import type { VehiculoAnalizado } from "@/lib/contratos/vehiculos";
import {
  ETIQUETAS_ETAPA_VEHICULO,
  alertasDeVehiculo,
  formatearPatente,
  ordenarAlertasDeVehiculos,
  textoDeAlertaDeVehiculo,
  type EtapaVehiculo,
} from "@/lib/contratos/vehiculos-modelo";
import type { CategoriaDeVehiculo } from "@/lib/contratos/vehiculos-modelo";
import type { ResumenDeDotacion, TipoDocumento } from "@/lib/contratos/acreditacion-modelo";

const LISTA = "max-h-[min(60vh,28rem)] divide-y divide-borde overflow-y-auto rounded-xl border border-borde";
const FILA = "flex items-center justify-between gap-3 px-3 py-2.5 text-sm";

function Vacio({ children }: { children: React.ReactNode }) {
  return <p className="rounded-xl border border-dashed border-borde bg-fondo/50 p-5 text-center text-sm text-gris">{children}</p>;
}

function Barra({ porcentaje }: { porcentaje: number }) {
  return (
    <div className="barra-estado mt-1.5" aria-hidden>
      <i style={{ width: `${porcentaje}%` }} />
    </div>
  );
}

/**
 * Las cinco tarjetas del resumen de la flota, con el detalle de cada una armado acá, en el
 * servidor, donde ya están todos los datos.
 *
 * Es el hermano de ResumenDeNomina: cada detalle responde lo que uno se pregunta al ver el número
 * —«¿cuáles son?», «¿cuáles faltan?»— y se calcula con los mismos datos que las tarjetas, así que
 * no puede discrepar de ellas. La quinta, la dotación, se arma dentro de TarjetasDeResumen.
 */
export default function ResumenDeFlota({
  vehiculos,
  categorias,
  tipos,
  dotacion,
  totalDelContrato,
}: {
  vehiculos: VehiculoAnalizado[];
  categorias: CategoriaDeVehiculo[];
  tipos: TipoDocumento[];
  dotacion: ResumenDeDotacion;
  totalDelContrato: number | null;
}) {
  const activos = vehiculos.filter((v) => v.vehiculo.activo);
  const bajas = vehiculos.length - activos.length;
  const nombreDeCategoria = new Map(categorias.map((c) => [c.id, c.nombre]));

  const enLink = (v: VehiculoAnalizado) => `/contratos/acreditacion-vehiculos/${v.vehiculo.id}`;

  // ── Vehículos: cuántos por tipo ──────────────────────────────────────────────
  const porCategoria = new Map<string, number>();
  for (const v of activos) {
    const nombre = nombreDeCategoria.get(v.vehiculo.categoriaId) ?? "Sin tipo";
    porCategoria.set(nombre, (porCategoria.get(nombre) ?? 0) + 1);
  }
  const categoriasOrdenadas = [...porCategoria.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "es"));

  // ── Acreditados: en qué etapa está cada uno ─────────────────────────────────
  const etapas = new Map<EtapaVehiculo, number>();
  for (const v of activos) etapas.set(v.analisis.etapa, (etapas.get(v.analisis.etapa) ?? 0) + 1);
  const acreditados = activos.filter((v) => v.analisis.etapa === "acreditado");

  // ── Avance global: documentos subidos de los requeridos, por vehículo ───────
  const totalDocs = activos.reduce((s, v) => s + v.analisis.avance.total, 0);
  const subidosDocs = activos.reduce((s, v) => s + v.analisis.avance.subidos, 0);
  const global = totalDocs === 0 ? 0 : Math.round((subidosDocs / totalDocs) * 100);
  const porAvance = [...activos].sort(
    (a, b) =>
      a.analisis.avance.porcentaje - b.analisis.avance.porcentaje ||
      a.vehiculo.patente.localeCompare(b.vehiculo.patente, "es"),
  );

  // ── Alertas de documentos ──────────────────────────────────────────────────
  const alertas = ordenarAlertasDeVehiculos(
    activos.flatMap((v) => alertasDeVehiculo(v.vehiculo, v.analisis, tipos)),
  );
  const conAlertas = new Set(alertas.map((a) => a.vehiculoId)).size;

  const tarjetas: TarjetaDeResumen[] = [
    {
      clave: "vehiculos",
      etiqueta: "Vehículos",
      valor: String(activos.length),
      ayuda: bajas > 0 ? `${bajas} de baja` : "en la flota",
      titulo: "Vehículos en la flota",
      descripcion: `${activos.length} ${activos.length === 1 ? "activo" : "activos"}${
        bajas > 0 ? ` · ${bajas} dado${bajas === 1 ? "" : "s"} de baja` : ""
      }.`,
      detalle:
        activos.length === 0 ? (
          <Vacio>Todavía no hay vehículos en la flota.</Vacio>
        ) : (
          <ul className={LISTA}>
            {categoriasOrdenadas.map(([nombre, n]) => (
              <li key={nombre} className="px-3 py-2.5">
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="min-w-0 truncate font-semibold text-tinta">{nombre}</span>
                  <span className="shrink-0 tabular-nums text-gris">
                    <strong className="font-extrabold text-tinta">{n}</strong> {n === 1 ? "vehículo" : "vehículos"}
                  </span>
                </div>
                <Barra porcentaje={Math.round((n / activos.length) * 100)} />
              </li>
            ))}
          </ul>
        ),
    },
    {
      clave: "acreditados",
      etiqueta: "Acreditados",
      valor: String(acreditados.length),
      ayuda: `de ${activos.length}`,
      tono: acreditados.length > 0 ? "ok" : undefined,
      titulo: "Acreditación",
      descripcion: "Acreditado = documentos al 100% y acreditado en Web Control.",
      detalle:
        activos.length === 0 ? (
          <Vacio>Todavía no hay vehículos en la flota.</Vacio>
        ) : (
          <div className="space-y-4">
            <ul className={LISTA}>
              {(Object.keys(ETIQUETAS_ETAPA_VEHICULO) as EtapaVehiculo[]).map((e) => (
                <li key={e} className={FILA}>
                  <ChipDeEtapaDeVehiculo etapa={e} />
                  <span className="tabular-nums text-gris">
                    <strong className="font-extrabold text-tinta">{etapas.get(e) ?? 0}</strong>{" "}
                    {(etapas.get(e) ?? 0) === 1 ? "vehículo" : "vehículos"}
                  </span>
                </li>
              ))}
            </ul>
            {acreditados.length > 0 && (
              <div>
                <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-gris">Acreditados</p>
                <ul className={LISTA}>
                  {acreditados.map((v) => (
                    <li key={v.vehiculo.id}>
                      <Link href={enLink(v)} className={`${FILA} transition hover:bg-cian-lavado/50`}>
                        <span className="min-w-0 truncate font-semibold text-azul">
                          {formatearPatente(v.vehiculo.patente)}
                        </span>
                        <span className="shrink-0 text-xs text-gris">{v.categoria?.nombre ?? "—"}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ),
    },
    {
      clave: "avance",
      etiqueta: "Avance global",
      valor: `${global}%`,
      ayuda: `${subidosDocs} de ${totalDocs} documentos`,
      progreso: global,
      titulo: "Avance global de la documentación",
      descripcion: `${subidosDocs} de ${totalDocs} documentos requeridos están cargados. Suma documentos, no promedia porcentajes.`,
      detalle:
        activos.length === 0 ? (
          <Vacio>Todavía no hay vehículos en la flota.</Vacio>
        ) : (
          <ul className={LISTA}>
            {porAvance.map((v) => (
              <li key={v.vehiculo.id}>
                <Link href={enLink(v)} className="block px-3 py-2.5 transition hover:bg-cian-lavado/50">
                  <div className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="min-w-0 truncate font-semibold text-azul">
                      {formatearPatente(v.vehiculo.patente)}
                    </span>
                    <span className="shrink-0 tabular-nums text-gris">
                      {v.analisis.avance.subidos} de {v.analisis.avance.total} ·{" "}
                      <strong className="font-extrabold text-tinta">{v.analisis.avance.porcentaje}%</strong>
                    </span>
                  </div>
                  <Barra porcentaje={v.analisis.avance.porcentaje} />
                </Link>
              </li>
            ))}
          </ul>
        ),
    },
    {
      clave: "alertas",
      etiqueta: "Con alertas",
      valor: String(conAlertas),
      ayuda: "documentos vencidos o por vencer",
      tono: conAlertas > 0 ? "aviso" : undefined,
      titulo: "Documentos vencidos o por vencer",
      descripcion: `${alertas.length} ${alertas.length === 1 ? "aviso" : "avisos"} en ${conAlertas} ${
        conAlertas === 1 ? "vehículo" : "vehículos"
      }. Lo más urgente primero.`,
      detalle:
        alertas.length === 0 ? (
          <Vacio>No hay documentos vencidos ni por vencer.</Vacio>
        ) : (
          <ul className={LISTA}>
            {alertas.map((a, i) => (
              <li key={`${a.vehiculoId}-${a.asunto}-${i}`}>
                <Link
                  href={`/contratos/acreditacion-vehiculos/${a.vehiculoId}`}
                  className="flex items-start gap-2.5 px-3 py-2.5 transition hover:bg-cian-lavado/50"
                >
                  {a.dias < 0 ? (
                    <IconAlertTriangle size={16} className="mt-0.5 shrink-0 text-red-600" aria-hidden />
                  ) : (
                    <IconCalendarDue size={16} className="mt-0.5 shrink-0 text-amber-600" aria-hidden />
                  )}
                  <span className="min-w-0 flex-1 text-sm text-tinta">
                    <strong className="font-semibold">{formatearPatente(a.patente)}</strong>
                    <span className="text-gris"> · {a.asunto} </span>
                    <span className={a.dias < 0 ? "font-semibold text-red-600" : "text-amber-600"}>
                      {textoDeAlertaDeVehiculo(a)}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ),
    },
  ];

  return (
    <TarjetasDeResumen
      dominio="vehiculos"
      tarjetas={tarjetas}
      dotacion={{
        resumen: dotacion,
        totalDelContrato,
        cargos: categorias
          .filter((c) => c.activo)
          .map((c) => ({ id: c.id, nombre: c.nombre, cantidadRequerida: c.cantidadRequerida })),
      }}
    />
  );
}

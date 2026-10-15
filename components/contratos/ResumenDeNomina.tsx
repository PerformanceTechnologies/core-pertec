import Link from "@/components/contratos/Enlace";
import { IconAlertTriangle, IconCalendarDue } from "@tabler/icons-react";
import ChipDeEtapa from "./ChipDeEtapa";
import ListaDeCapacitaciones from "./ListaDeCapacitaciones";
import TarjetasDeResumen, { type TarjetaDeResumen } from "./TarjetasDeResumen";
import type { PersonaAnalizada } from "@/lib/contratos/acreditacion";
import type { ResumenDeCapacitaciones } from "@/lib/contratos/capacitaciones-modelo";
import {
  ETIQUETAS_ETAPA,
  alertasDePersona,
  estaContratada,
  ordenarAlertas,
  resumirDotacion,
  textoDeAlerta,
  type Cargo,
  type Etapa,
  type TipoDocumento,
} from "@/lib/contratos/acreditacion-modelo";

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
 * Las cinco tarjetas del resumen de la nómina, con el detalle de cada una armado acá, en el
 * servidor, donde ya están todos los datos.
 *
 * Cada detalle responde lo que uno se pregunta al ver el número: «¿quiénes son?», «¿cuáles
 * faltan?», «¿por qué 3?». Se calcula con los mismos datos que las tarjetas, así que no puede
 * discrepar de ellas.
 */
export default function ResumenDeNomina({
  personas,
  cargos,
  tipos,
  dotacion,
  totalDelContrato,
  capacitaciones,
}: {
  personas: PersonaAnalizada[];
  cargos: Cargo[];
  tipos: TipoDocumento[];
  dotacion: ReturnType<typeof resumirDotacion>;
  totalDelContrato: number | null;
  /** Los cursos y exámenes de las personas activas: la tarjeta «Cursos y exámenes». */
  capacitaciones: ResumenDeCapacitaciones;
}) {
  const activas = personas.filter((p) => p.persona.activo);
  const bajas = personas.length - activas.length;
  // Activas que todavía no cuentan como contratadas: sin fecha de ingreso, o marcadas «sin contrato aún».
  const sinContrato = activas.filter((p) => !estaContratada(p.persona)).length;
  const nombreDeCargo = new Map(cargos.map((c) => [c.id, c.nombre]));

  const enLink = (p: PersonaAnalizada) => `/contratos/acreditacion/${p.persona.id}`;

  // ── Personas: cuántas por cargo ─────────────────────────────────────────────
  const porCargo = new Map<string, number>();
  for (const p of activas) {
    const nombre = nombreDeCargo.get(p.persona.cargoId) ?? "Sin cargo";
    porCargo.set(nombre, (porCargo.get(nombre) ?? 0) + 1);
  }
  const cargosOrdenados = [...porCargo.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "es"));

  // ── Acreditadas: en qué etapa está cada una ────────────────────────────────
  const etapas = new Map<Etapa, number>();
  for (const p of activas) etapas.set(p.analisis.etapa, (etapas.get(p.analisis.etapa) ?? 0) + 1);
  const acreditadas = activas.filter((p) => p.analisis.etapa === "acreditada");

  // ── Avance global: documentos subidos de los requeridos, por persona ───────
  const totalDocs = activas.reduce((s, p) => s + p.analisis.avance.total, 0);
  const subidosDocs = activas.reduce((s, p) => s + p.analisis.avance.subidos, 0);
  const global = totalDocs === 0 ? 0 : Math.round((subidosDocs / totalDocs) * 100);
  const porAvance = [...activas].sort(
    (a, b) => a.analisis.avance.porcentaje - b.analisis.avance.porcentaje || a.persona.nombre.localeCompare(b.persona.nombre, "es"),
  );

  // ── Alertas de documentos ──────────────────────────────────────────────────
  const alertas = ordenarAlertas(
    activas.flatMap((p) => alertasDePersona(p.persona, p.analisis, tipos)).filter((a) => a.tipo !== "contrato"),
  );
  const conAlertas = new Set(alertas.map((a) => a.personaId)).size;

  const tarjetas: TarjetaDeResumen[] = [
    {
      clave: "personas",
      etiqueta: "Personas",
      valor: String(activas.length),
      ayuda:
        sinContrato > 0
          ? `${sinContrato} sin contrato aún`
          : bajas > 0
            ? `${bajas} de baja`
            : "en la nómina",
      titulo: "Personas en la nómina",
      descripcion: `${activas.length} ${activas.length === 1 ? "activa" : "activas"}${
        sinContrato > 0 ? ` · ${sinContrato} sin contrato aún (no cuentan en la dotación)` : ""
      }${bajas > 0 ? ` · ${bajas} dada${bajas === 1 ? "" : "s"} de baja` : ""}.`,
      detalle:
        activas.length === 0 ? (
          <Vacio>Todavía no hay personas en la nómina.</Vacio>
        ) : (
          <ul className={LISTA}>
            {cargosOrdenados.map(([nombre, n]) => (
              <li key={nombre} className="px-3 py-2.5">
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="min-w-0 truncate font-semibold text-tinta">{nombre}</span>
                  <span className="shrink-0 tabular-nums text-gris">
                    <strong className="font-extrabold text-tinta">{n}</strong> {n === 1 ? "persona" : "personas"}
                  </span>
                </div>
                <Barra porcentaje={Math.round((n / activas.length) * 100)} />
              </li>
            ))}
          </ul>
        ),
    },
    {
      clave: "acreditadas",
      etiqueta: "Acreditadas",
      valor: String(acreditadas.length),
      ayuda: `de ${activas.length}`,
      tono: acreditadas.length > 0 ? "ok" : undefined,
      titulo: "Acreditación",
      descripcion: "Acreditada = documentos al 100%, acreditada en Web Control y creada en BUK.",
      detalle:
        activas.length === 0 ? (
          <Vacio>Todavía no hay personas en la nómina.</Vacio>
        ) : (
          <div className="space-y-4">
            <ul className={LISTA}>
              {(Object.keys(ETIQUETAS_ETAPA) as Etapa[]).map((e) => (
                <li key={e} className={FILA}>
                  <ChipDeEtapa etapa={e} />
                  <span className="tabular-nums text-gris">
                    <strong className="font-extrabold text-tinta">{etapas.get(e) ?? 0}</strong>{" "}
                    {(etapas.get(e) ?? 0) === 1 ? "persona" : "personas"}
                  </span>
                </li>
              ))}
            </ul>
            {acreditadas.length > 0 && (
              <div>
                <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-gris">Acreditadas</p>
                <ul className={LISTA}>
                  {acreditadas.map((p) => (
                    <li key={p.persona.id}>
                      <Link href={enLink(p)} className={`${FILA} transition hover:bg-cian-lavado/50`}>
                        <span className="min-w-0 truncate font-semibold text-azul">{p.persona.nombre}</span>
                        <span className="shrink-0 text-xs text-gris">{nombreDeCargo.get(p.persona.cargoId) ?? "—"}</span>
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
        activas.length === 0 ? (
          <Vacio>Todavía no hay personas en la nómina.</Vacio>
        ) : (
          <ul className={LISTA}>
            {porAvance.map((p) => (
              <li key={p.persona.id}>
                <Link href={enLink(p)} className="block px-3 py-2.5 transition hover:bg-cian-lavado/50">
                  <div className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="min-w-0 truncate font-semibold text-azul">{p.persona.nombre}</span>
                    <span className="shrink-0 tabular-nums text-gris">
                      {p.analisis.avance.subidos} de {p.analisis.avance.total} ·{" "}
                      <strong className="font-extrabold text-tinta">{p.analisis.avance.porcentaje}%</strong>
                    </span>
                  </div>
                  <Barra porcentaje={p.analisis.avance.porcentaje} />
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
        conAlertas === 1 ? "persona" : "personas"
      }. Lo más urgente primero.`,
      detalle:
        alertas.length === 0 ? (
          <Vacio>No hay documentos vencidos ni por vencer.</Vacio>
        ) : (
          <ul className={LISTA}>
            {alertas.map((a, i) => (
              <li key={`${a.personaId}-${a.asunto}-${i}`}>
                <Link
                  href={`/contratos/acreditacion/${a.personaId}`}
                  className="flex items-start gap-2.5 px-3 py-2.5 transition hover:bg-cian-lavado/50"
                >
                  {a.dias < 0 ? (
                    <IconAlertTriangle size={16} className="mt-0.5 shrink-0 text-red-600" aria-hidden />
                  ) : (
                    <IconCalendarDue size={16} className="mt-0.5 shrink-0 text-amber-600" aria-hidden />
                  )}
                  <span className="min-w-0 flex-1 text-sm text-tinta">
                    <strong className="font-semibold">{a.persona}</strong>
                    <span className="text-gris"> · {a.asunto} </span>
                    <span className={a.dias < 0 ? "font-semibold text-red-600" : "text-amber-600"}>
                      {textoDeAlerta(a)}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ),
    },
    {
      clave: "cursos",
      etiqueta: "Cursos y exámenes",
      valor: String(capacitaciones.enCurso),
      ayuda:
        capacitaciones.atrasadas > 0
          ? `${capacitaciones.atrasadas} ${capacitaciones.atrasadas === 1 ? "atrasado" : "atrasados"}`
          : capacitaciones.estaSemana > 0
            ? `${capacitaciones.estaSemana} esta semana`
            : "reservados",
      tono: capacitaciones.atrasadas > 0 ? "aviso" : undefined,
      titulo: "Cursos y exámenes",
      descripcion: `${capacitaciones.examenesEnCurso} ${capacitaciones.examenesEnCurso === 1 ? "examen" : "exámenes"} y ${
        capacitaciones.cursosEnCurso
      } ${capacitaciones.cursosEnCurso === 1 ? "curso" : "cursos"} reservados. Lo atrasado y lo más cercano primero.`,
      detalle: (
        <ListaDeCapacitaciones
          registros={capacitaciones.lista}
          realizadas={capacitaciones.realizadas}
          reprobadas={capacitaciones.reprobadas}
        />
      ),
    },
  ];

  return (
    <TarjetasDeResumen
      tarjetas={tarjetas}
      dotacion={{
        resumen: dotacion,
        totalDelContrato,
        cargos: cargos
          .filter((c) => c.activo)
          .map((c) => ({ id: c.id, nombre: c.nombre, cantidadRequerida: c.cantidadRequerida })),
      }}
    />
  );
}

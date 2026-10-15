import Link from "@/components/contratos/Enlace";
import EncabezadoDeAcreditacion from "@/components/contratos/EncabezadoDeAcreditacion";
import MatrizDeAcreditacion from "@/components/contratos/MatrizDeAcreditacion";
import { exigirAccesoApp } from "@/lib/contratos/autorizacion";
import { cargarNomina } from "@/lib/contratos/acreditacion";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function MatrizPage({
  searchParams,
}: {
  searchParams: Promise<{ [clave: string]: string | string[] | undefined }>;
}) {
  const usuario = await exigirAccesoApp("acreditacion");
  const consulta = await searchParams;

  // El filtro viaja en la URL y no en estado del navegador: así la vista filtrada
  // se puede mandar por enlace ("mira cómo van los Activadores").
  const cargoPedido = typeof consulta.cargo === "string" && UUID.test(consulta.cargo) ? consulta.cargo : null;
  const conBajas = consulta.bajas === "1";

  const { tipos, cargos, personas } = await cargarNomina();

  const visibles = personas.filter(
    (p) => (conBajas || p.persona.activo) && (!cargoPedido || p.persona.cargoId === cargoPedido),
  );

  // Los documentos que ningún cargo del filtro pide no tienen nada que mostrar:
  // una columna entera de puntos grises. Con "todos los cargos" salen los 25.
  const tiposVisibles = tipos.filter((t) =>
    visibles.some((p) => p.analisis.celdas.get(t.id)?.requerido),
  );

  const enlace = (cargo: string | null, bajas: boolean) => {
    const q = new URLSearchParams();
    if (cargo) q.set("cargo", cargo);
    if (bajas) q.set("bajas", "1");
    const texto = q.toString();
    return texto ? `?${texto}` : "?";
  };

  const chip = (activo: boolean) =>
    `rounded-lg border px-3 py-1.5 text-xs font-bold transition ${
      activo
        ? "border-cian bg-cian-lavado text-azul"
        : "border-borde text-gris hover:border-cian hover:text-azul"
    }`;

  return (
    <div className="animar-entrada">
      <EncabezadoDeAcreditacion actual="matriz" esAdmin={usuario.rol === "admin"} />

      <p className="mt-4 max-w-3xl text-sm text-gris">
        Qué falta en todo el equipo, de un vistazo. Cada columna es un documento y cada fila una
        persona.
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Link href={enlace(null, conBajas)} className={chip(!cargoPedido)}>
          Todos los cargos
        </Link>
        {cargos
          .filter((c) => c.activo || c.id === cargoPedido)
          .map((c) => (
            <Link key={c.id} href={enlace(c.id, conBajas)} className={chip(cargoPedido === c.id)}>
              {c.nombre}
            </Link>
          ))}
        <Link href={enlace(cargoPedido, !conBajas)} className={`ml-auto ${chip(conBajas)}`}>
          {conBajas ? "Ocultar bajas" : "Incluir bajas"}
        </Link>
      </div>

      <MatrizDeAcreditacion
        tipos={tiposVisibles}
        filas={visibles.map((p) => ({
          id: p.persona.id,
          numero: p.persona.numero,
          nombre: p.persona.nombre,
          cargo: p.cargo?.nombre ?? "—",
          porcentaje: p.analisis.avance.porcentaje,
          activo: p.persona.activo,
          celdas: p.analisis.celdas,
        }))}
      />
    </div>
  );
}

import Link from "next/link";
import { IconArrowLeft, IconReceipt } from "@tabler/icons-react";
import { exigirAccesoRendidor } from "@/lib/rendidor/permisos";
import { repetidosDe } from "@/lib/rendidor/duplicados";
import { gastosEnInformesDe, informesAbiertosDe, obtenerOCrearBolsa } from "@/lib/rendidor/datos";
import { urlFirmadaDeRespaldo } from "@/lib/rendidor/almacenamiento";
import { listarProveedores, listarProyectos } from "@/lib/rendidor/proveedores";
import { empresaActivaRG } from "@/lib/rendidor/empresa";
import ConmutadorTodos from "@/components/rendidor/ConmutadorTodos";
import { rolesDe } from "@/lib/rendidor/fondos";
import type { RolFondos } from "@/lib/rendidor/fondos-modelo";
import MisGastos from "@/components/rendidor/MisGastos";

export const dynamic = "force-dynamic";

/** «Mis gastos»: boletas sueltas que se suben y se leen solas, y después se pasan a un informe. */
export default async function MisGastosPage() {
  const { usuario, rol } = await exigirAccesoRendidor();
  const yo = { correo: usuario.correo.toLowerCase(), nombre: usuario.nombre || usuario.correo.split("@")[0] };
  // Todo es de la empresa activa: sus gastos sueltos, sus informes y sus proyectos (cada empresa es independiente).
  const empresa = await empresaActivaRG(usuario).catch(() => null);
  const empresaId = empresa?.id;
  const lectura = empresa
    ? await obtenerOCrearBolsa(yo, usuario.id, empresa).then(
        (b) => ({ bolsa: b, error: null as string | null }),
        (e: unknown) => ({ bolsa: null, error: e instanceof Error ? e.message : "No se pudo abrir «Mis gastos»." }),
      )
    : { bolsa: null, error: "No tienes una empresa activa." };
  const { bolsa, error } = lectura;
  const informes = bolsa && empresa ? await informesAbiertosDe(yo.correo, empresa) : [];
  const enInformes = bolsa && empresa ? await gastosEnInformesDe(yo.correo, empresa) : [];
  // Quien administra gastos ve el botón «Todos los gastos» junto al título.
  const esAdmin = rol === "admin" || (empresaId ? (await rolesDe(usuario, false, empresaId).catch((): RolFondos[] => [])).includes("administrador") : false);
  const proyectos = bolsa && empresaId ? await listarProyectos(empresaId) : [];
  const repetidos = bolsa && empresa ? await repetidosDe([bolsa.id, ...new Set(enInformes.map((f) => f.informeId).filter((x): x is string => Boolean(x)))], empresa) : {};
  const proveedores = bolsa ? await listarProveedores().catch(() => []) : [];
  const urlsRespaldo: Record<string, string> = {};
  if (bolsa) {
    const con = bolsa.gastos.filter((g) => g.archivoPath);
    const firmadas = await Promise.all(con.map((g) => urlFirmadaDeRespaldo(g.archivoPath)));
    con.forEach((g, i) => { if (firmadas[i]) urlsRespaldo[g.id] = firmadas[i]!; });
  }

  return (
    <div className="animar-entrada space-y-5">
      <Link href="/rendir-gastos" className="inline-flex items-center gap-1 text-sm font-semibold text-gris transition hover:text-tinta">
        <IconArrowLeft size={16} /> Volver a Rendir gastos
      </Link>
      <header className="flex flex-wrap items-center gap-3">
        <span className="grid h-11 w-11 place-items-center rounded-2xl bg-naranjo text-white shadow-sm"><IconReceipt size={23} stroke={1.75} /></span>
        <div className="min-w-[13rem] flex-1">
          <h1 className="font-condensed text-2xl font-bold uppercase tracking-tight text-tinta">Mis gastos</h1>
          <p className="text-sm text-gris">Ingresa tus gastos cuando quieras (quedan en borrador) y después los asignas a un informe.</p>
        </div>
        {esAdmin && <ConmutadorTodos activa="mias" mias={{ href: "/rendir-gastos/gastos", texto: "Mis gastos" }} todas={{ href: "/rendir-gastos?ver=todos-gastos", texto: "Todos los gastos" }} />}
      </header>
      {error && <p className="rounded-xl border border-rose-300/60 bg-rose-500/[0.06] px-4 py-3 text-sm text-rose-700">{error}</p>}
      {bolsa && <MisGastos repetidosIniciales={repetidos} proyectos={proyectos} enInformes={enInformes} proveedores={proveedores} bolsa={bolsa} urlsRespaldo={urlsRespaldo} informes={informes.map((i) => ({ id: i.id, titulo: i.titulo }))} />}
    </div>
  );
}

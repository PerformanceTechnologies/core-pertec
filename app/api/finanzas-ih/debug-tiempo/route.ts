import { NextRequest, NextResponse } from "next/server";
import { extraerDocumentosIhRcv, type EmpresaIhConfig } from "@/lib/finanzas-ih/sii-rcv-ih";
import { extraerGuiasYCodigosIh } from "@/lib/finanzas-ih/sii-guias-ih";
import { listarClavesYaRespaldadasIh } from "@/lib/finanzas-ih/finanzas-ih";

export const maxDuration = 60;

// TEMPORAL: para diagnosticar donde se va el tiempo del
// FUNCTION_INVOCATION_TIMEOUT de /api/cron/finanzas-ih en produccion.
// Borrar una vez resuelto. Protegido con CRON_SECRET, no con sesion.
function autorizado(request: NextRequest): boolean {
  const secreto = process.env.CRON_SECRET;
  if (!secreto) return false;
  return request.headers.get("authorization") === `Bearer ${secreto}`;
}

export async function GET(request: NextRequest) {
  if (!autorizado(request)) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const paso = request.nextUrl.searchParams.get("paso");
  const creds = {
    rutRepresentante: process.env.SII_RUT_REPRESENTANTE ?? "",
    claveTributaria: process.env.SII_CLAVE_TRIBUTARIA ?? "",
  };
  const empresas: EmpresaIhConfig[] = [
    { empresa: "IH", rutEmpresa: process.env.SII_RUT_EMPRESA_IH ?? "" },
    { empresa: "IL", rutEmpresa: process.env.SII_RUT_EMPRESA_IL ?? "" },
  ];

  const t0 = Date.now();
  try {
    if (paso === "rcv") {
      const docs = await extraerDocumentosIhRcv(creds, empresas, { cargaInicial: false, ventanaDias: 7 });
      return NextResponse.json({ paso, ms: Date.now() - t0, docs: docs.length });
    }
    if (paso === "guias") {
      const yaRespaldados = await listarClavesYaRespaldadasIh();
      const tRespaldados = Date.now() - t0;
      const r = await extraerGuiasYCodigosIh(creds, empresas, { cargaInicial: false, ventanaDias: 7, yaRespaldados, limiteRespaldo: 5 });
      return NextResponse.json({ paso, msTotal: Date.now() - t0, msYaRespaldados: tRespaldados, docs: r.documentos.length });
    }
    if (paso === "yarespaldados") {
      const yaRespaldados = await listarClavesYaRespaldadasIh();
      return NextResponse.json({ paso, ms: Date.now() - t0, size: yaRespaldados.size });
    }
    return NextResponse.json({ error: "usa ?paso=rcv|guias|yarespaldados" }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ paso, ms: Date.now() - t0, error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

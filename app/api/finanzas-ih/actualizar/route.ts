import { NextResponse } from "next/server";
import { verificarAccesoFinanzasIhApi } from "@/lib/finanzas-ih/autorizacion";

const REPO = "PerformanceTechnologies/core-pertec";
const WORKFLOW = "finanzas-ih-cron.yml";

// Boton "Actualizar con SII ahora" de la UI: la sincronizacion real corre en
// GitHub Actions (.github/workflows/finanzas-ih-cron.yml), no aca -- pasaba
// los 60s de maxDuration del plan Hobby de Vercel (FUNCTION_INVOCATION_TIMEOUT
// en produccion, 2026-08-13). Este endpoint solo le pide a GitHub que dispare
// el workflow ya (workflow_dispatch) -- es "fire and forget": no espera a que
// termine, por eso la UI avisa que puede tardar 1-2 minutos en verse.
export async function POST() {
  const acceso = await verificarAccesoFinanzasIhApi();
  if (!acceso.usuario) {
    return NextResponse.json({ error: acceso.error }, { status: acceso.status });
  }

  const token = process.env.GITHUB_ACTIONS_TOKEN;
  if (!token) {
    return NextResponse.json({ error: "Falta GITHUB_ACTIONS_TOKEN en el entorno." }, { status: 500 });
  }

  try {
    const resp = await fetch(`https://api.github.com/repos/${REPO}/actions/workflows/${WORKFLOW}/dispatches`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ref: "main" }),
    });
    if (!resp.ok) {
      const texto = await resp.text().catch(() => "");
      throw new Error(`GitHub respondio ${resp.status}: ${texto.slice(0, 200)}`);
    }
    return NextResponse.json({ ok: true, mensaje: "Sincronizacion encolada en GitHub Actions." });
  } catch (err) {
    const mensaje = err instanceof Error ? err.message : "Error desconocido";
    return NextResponse.json({ error: mensaje }, { status: 500 });
  }
}

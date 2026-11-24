import { NextRequest, NextResponse } from "next/server";
import { verificarAccesoAppApi } from "@/lib/autorizacion";
import { verificarMigracionOdoo, type ResultadoVerificacion } from "@/lib/verificacion-odoo-facturas";
import type { TipoMigracion } from "@/lib/migracion-odoo-facturas";

export const runtime = "nodejs";
export const maxDuration = 120;

const esc = (t: unknown) => String(t ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const peso = (n: number) => `$${Math.round(n).toLocaleString("es-CL")}`;

const ESTILO = `body{font:14px/1.45 system-ui,sans-serif;margin:24px;color:#1f1f1f;background:#fafafa;max-width:1100px}h1{font-size:20px;margin:0}h2{font-size:15px;margin:24px 0 8px}
.r{padding:14px 16px;border-radius:12px;margin:14px 0;font-weight:600}.ok{background:#e7f6ec;color:#0a6b35}.mal{background:#fdecec;color:#a61b1b}
table{border-collapse:collapse;width:100%;background:#fff;border:1px solid #e3e3e3;font-size:13px}th,td{padding:7px 10px;text-align:left;border-bottom:1px solid #eee}th{background:#f4f4f4;font-size:11px;text-transform:uppercase;color:#666}
.n{text-align:right;font-variant-numeric:tabular-nums}.chip{display:inline-block;padding:1px 8px;border-radius:99px;font-size:11px;font-weight:600;background:#fdecec;color:#a61b1b}.g{color:#777;font-size:12px}a{color:#c2501a}`;

/**
 * Revisa que la migración desde Odoo haya quedado bien (solo lee, no cambia nada). Solo administradores:
 *   /api/finanzas/verificar-odoo?tipo=ventas&desde=2026-07-01
 *   /api/finanzas/verificar-odoo?tipo=compras&desde=2026-07-01
 * Con «&formato=json» devuelve el resultado en JSON.
 */
export async function GET(request: NextRequest) {
  const acceso = await verificarAccesoAppApi("finanzas");
  if (!acceso.usuario || acceso.usuario.rol !== "admin") return NextResponse.json({ error: "Solo administradores." }, { status: 403 });

  const q = request.nextUrl.searchParams;
  const tipo: TipoMigracion = q.get("tipo") === "compras" ? "compras" : "ventas";
  const desde = /^\d{4}-\d{2}-\d{2}$/.test(q.get("desde") ?? "") ? q.get("desde")! : "2026-07-01";

  let r: ResultadoVerificacion;
  try {
    r = await verificarMigracionOdoo(tipo, desde);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
  if (q.get("formato") === "json") return NextResponse.json(r);

  const bien = r.problemas.length === 0;
  const otro = tipo === "ventas" ? "compras" : "ventas";
  const suma = (f: (m: (typeof r.porMes)[number]) => number) => r.porMes.reduce((s, m) => s + f(m), 0);

  const resumen = bien
    ? `✅ Todo correcto: los ${r.enOdoo} documentos de Odoo están en SharePoint y en el Core con los mismos datos.`
    : `⚠️ ${r.problemas.length} de ${r.enOdoo} documentos con problemas · ${r.ok} correctos.`;

  const filasMes = r.porMes
    .map((m) => `<tr><td>${esc(m.mes)}</td><td class="n">${m.odoo}</td><td class="n">${m.sharepoint}</td><td class="n">${m.core}</td><td class="n">${peso(m.montoOdoo)}</td><td class="n">${peso(m.montoCore)}</td></tr>`)
    .join("");
  const totalMes = `<tr><th>Total</th><th class="n">${suma((m) => m.odoo)}</th><th class="n">${suma((m) => m.sharepoint)}</th><th class="n">${suma((m) => m.core)}</th><th class="n">${peso(suma((m) => m.montoOdoo))}</th><th class="n">${peso(suma((m) => m.montoCore))}</th></tr>`;

  const problemas = bien
    ? ""
    : `<h2>Documentos con problemas</h2><table><tr><th>Documento</th><th>${tipo === "ventas" ? "Cliente" : "Proveedor"}</th><th>Fecha</th><th class="n">Monto</th><th>Problema</th></tr>${r.problemas
        .map(
          (p) =>
            `<tr><td>${esc(p.documento)}<div class="g">${esc(p.archivo)}</div></td><td>${esc(p.socio)}</td><td>${esc(p.fecha)}</td><td class="n">${peso(p.monto)}</td><td><span class="chip">${esc(p.estado)}</span>${p.diferencias
              .map((d) => `<div class="g">${esc(d.campo)}: Odoo ${esc(d.odoo)} · Core ${esc(d.core)}</div>`)
              .join("")}</td></tr>`,
        )
        .join("")}</table>`;

  const extras = r.extrasEnSharepoint.length
    ? `<h2>Otros archivos en esas carpetas (${r.extrasEnSharepoint.length})</h2><p class="g">No vienen de esta migración: ya estaban o se subieron a mano. Es solo informativo.</p><p class="g">${r.extrasEnSharepoint.map(esc).join(" · ")}</p>`
    : "";

  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Verificación ${tipo}</title><style>${ESTILO}</style></head><body>
<h1>Verificación de ${tipo} traídas desde Odoo</h1>
<p class="g">Desde ${esc(desde)} · solo lectura, no cambia nada · <a href="?tipo=${otro}&desde=${esc(desde)}">ver ${otro}</a></p>
<div class="r ${bien ? "ok" : "mal"}">${resumen}</div>
${r.odooSinXml ? `<p class="g">Además hay ${r.odooSinXml} documentos en Odoo sin XML adjunto: esos no se pueden copiar.</p>` : ""}
<h2>Por mes</h2><table><tr><th>Mes</th><th class="n">En Odoo</th><th class="n">En SharePoint</th><th class="n">En el Core</th><th class="n">Monto Odoo</th><th class="n">Monto Core</th></tr>${filasMes}${totalMes}</table>
${problemas}${extras}
</body></html>`;
  return new NextResponse(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}

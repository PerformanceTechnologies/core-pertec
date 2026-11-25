import { NextResponse } from "next/server";
import { contextoFinApi } from "@/lib/fin/datos";
import { completarPdfs, contarSinPdf } from "@/lib/fin/dte/completar-pdf";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * Completa el PDF de los documentos de Facturación (Emitidos, Guías, Recibidos) que tienen XML pero
 * no PDF, de la empresa activa. Solo administradores.
 *   GET  → una página que cuenta lo pendiente y lo va completando por tandas (no cerrar la pestaña).
 *   GET ?formato=json → solo el conteo.
 *   POST { clase, cursor } → una tanda.
 * No reemplaza ni borra nada: solo agrega el PDF que falta.
 */
async function admin() {
  const ctx = await contextoFinApi();
  if (!ctx || ctx.usuario.rol !== "admin") return null;
  return ctx;
}

export async function POST(req: Request) {
  const ctx = await admin();
  if (!ctx) return NextResponse.json({ error: "Solo administradores." }, { status: 403 });
  const body = (await req.json().catch(() => ({}))) as { clase?: string; cursor?: string | null };
  const clase = body.clase === "recibido" ? "recibido" : "emitido";
  try {
    const r = await completarPdfs(ctx.empresa, { clase, cursor: body.cursor ?? null, lote: 20, hasta: Date.now() + 90_000 });
    return NextResponse.json(r);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

export async function GET(req: Request) {
  const ctx = await admin();
  if (!ctx) return NextResponse.json({ error: "Solo administradores." }, { status: 403 });
  const pendientes = await contarSinPdf(ctx.empresa.id);
  if (new URL(req.url).searchParams.get("formato") === "json") return NextResponse.json({ empresa: ctx.empresa.nombre, ...pendientes });

  const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Completar PDFs</title>
<style>body{font:14px/1.45 system-ui,sans-serif;margin:24px;color:#1f1f1f;background:#fafafa;max-width:900px}h1{font-size:20px;margin:0}.g{color:#777;font-size:12.5px}
table{border-collapse:collapse;width:100%;background:#fff;border:1px solid #e3e3e3;margin-top:16px}th,td{padding:9px 12px;text-align:left;border-bottom:1px solid #eee}th{background:#f4f4f4;font-size:11px;text-transform:uppercase;color:#666}
.n{text-align:right;font-variant-numeric:tabular-nums}button{font:inherit;font-weight:600;border:0;border-radius:99px;padding:8px 16px;cursor:pointer;background:#c2501a;color:#fff}button:disabled{opacity:.45;cursor:default}
.ok{color:#0a6b35;font-weight:600}#log{margin-top:16px;font:12px/1.5 ui-monospace,monospace;white-space:pre-wrap;background:#fff;border:1px solid #e3e3e3;padding:10px;max-height:300px;overflow:auto}</style></head><body>
<h1>Completar los PDF de Facturación · ${esc(ctx.empresa.nombre)}</h1>
<p class="g">Documentos que tienen XML pero no PDF. A los emitidos que Odoo ya tiene en PDF se les copia ese PDF oficial; al resto se les arma el PDF desde su XML. Se guardan en la misma carpeta de SharePoint de cada documento. No se reemplaza ni se borra nada. No cierres la pestaña mientras corre.</p>
<button id="b">Completar</button>
<table><thead><tr><th>Documentos</th><th class="n">Sin PDF</th><th class="n">De Odoo</th><th class="n">Armados</th><th class="n">Con error</th><th>Estado</th></tr></thead><tbody id="t"></tbody></table>
<div id="log" hidden></div>
<script>
const filas = [
  { clase: "emitido", nombre: "Emitidos y guías", pendientes: ${pendientes.emitidos}, odoo: 0, armados: 0, errores: 0, estado: "" },
  { clase: "recibido", nombre: "Recibidos", pendientes: ${pendientes.recibidos}, odoo: 0, armados: 0, errores: 0, estado: "" },
];
const t = document.getElementById("t"), b = document.getElementById("b"), log = document.getElementById("log");
const esc = (x) => String(x).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]);
function anotar(x) { log.hidden = false; log.textContent += x + "\\n"; log.scrollTop = log.scrollHeight; }
function pintar() {
  t.innerHTML = filas.map((f) => "<tr><td>" + f.nombre + '</td><td class="n">' + f.pendientes + '</td><td class="n">' + f.odoo + '</td><td class="n">' + f.armados + '</td><td class="n">' + f.errores + "</td><td>" + (f.estado ? esc(f.estado) : f.pendientes === 0 ? '<span class="ok">✓ Todos con PDF</span>' : "") + "</td></tr>").join("");
  const total = filas.reduce((s, f) => s + f.pendientes, 0);
  if (!b.dataset.corriendo) { b.textContent = total ? "Completar los " + total + " PDF" : "✓ Todo tiene PDF"; b.disabled = !total; }
}
b.onclick = async () => {
  b.dataset.corriendo = "1"; b.disabled = true; b.textContent = "Completando…";
  for (const f of filas.filter((x) => x.pendientes)) {
    let cursor = null;
    do {
      f.estado = "Completando…"; pintar();
      const r = await fetch(location.pathname, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clase: f.clase, cursor }) });
      const j = await r.json().catch(() => ({ error: "Respuesta inválida (HTTP " + r.status + ")" }));
      if (!r.ok) { f.estado = "Error: " + j.error; anotar(f.nombre + ": " + j.error); break; }
      f.odoo += j.deOdoo; f.armados += j.armados; f.pendientes = Math.max(0, f.pendientes - j.completados);
      for (const e of j.errores) { f.errores++; anotar(f.nombre + " · " + e); }
      cursor = j.cursor;
    } while (cursor);
    if (!f.estado.startsWith("Error")) f.estado = f.errores ? "Listo, " + f.errores + " con error (ver abajo)" : "Listo";
    pintar();
  }
  delete b.dataset.corriendo; b.textContent = "Listo · recarga la página para volver a contar";
};
pintar();
</script></body></html>`;
  return new NextResponse(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}

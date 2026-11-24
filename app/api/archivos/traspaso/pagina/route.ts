import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { obtenerUsuarioActivo } from "@/lib/usuarios";

export const runtime = "nodejs";

/**
 * Una página simple para correr el traspaso a SharePoint de los archivos antiguos que siguen en
 * Supabase (o guardados en la base), módulo por módulo, sin tener que llamar a la API a mano.
 * Solo administradores. Usa /api/archivos/traspaso: GET para contar, POST para pasar tandas.
 * No borra nada en Supabase.
 */
export async function GET() {
  const usuario = await obtenerUsuarioActivo((await auth())?.user?.email);
  if (usuario?.rol !== "admin") return NextResponse.json({ error: "Solo administradores." }, { status: 403 });

  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Traspaso a SharePoint</title>
<style>body{font:14px/1.45 system-ui,sans-serif;margin:24px;color:#1f1f1f;background:#fafafa;max-width:900px}h1{font-size:20px;margin:0}.g{color:#777;font-size:12.5px}
table{border-collapse:collapse;width:100%;background:#fff;border:1px solid #e3e3e3;margin-top:16px}th,td{padding:9px 12px;text-align:left;border-bottom:1px solid #eee}th{background:#f4f4f4;font-size:11px;text-transform:uppercase;color:#666}
.n{text-align:right;font-variant-numeric:tabular-nums}button{font:inherit;font-weight:600;border:0;border-radius:99px;padding:8px 16px;cursor:pointer;background:#c2501a;color:#fff}button:disabled{opacity:.45;cursor:default}
.ok{color:#0a6b35;font-weight:600}.err{color:#a61b1b;font-size:12px}#log{margin-top:16px;font:12px/1.5 ui-monospace,monospace;white-space:pre-wrap;background:#fff;border:1px solid #e3e3e3;padding:10px;max-height:260px;overflow:auto}</style></head><body>
<h1>Traspaso de archivos antiguos a SharePoint</h1>
<p class="g">Archivos que todavía están en Supabase (o guardados dentro de la base) y se pueden pasar a «ARCHIVOS CORE» en SharePoint. Se suben con tu cuenta. No se borra nada en Supabase: el original queda donde estaba. No cierres la pestaña mientras corre.</p>
<button id="todo" disabled>Contando…</button>
<table><thead><tr><th>Módulo</th><th class="n">Pendientes</th><th class="n">Pasados ahora</th><th>Estado</th></tr></thead><tbody id="filas"></tbody></table>
<div id="log" hidden></div>
<script>
const filas = document.getElementById("filas"), boton = document.getElementById("todo"), log = document.getElementById("log");
const esc = (t) => String(t ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]);
let modulos = [];
function anotar(t) { log.hidden = false; log.textContent += t + "\\n"; log.scrollTop = log.scrollHeight; }
function pintar() {
  filas.innerHTML = modulos.map((m) => '<tr><td>' + esc(m.nombre) + '</td><td class="n">' + (m.pendientes ?? "?") + '</td><td class="n">' + (m.pasados || 0) + '</td><td>' +
    (m.error ? '<span class="err">' + esc(m.error) + '</span>' : m.estado ? esc(m.estado) : m.pendientes === 0 ? '<span class="ok">✓ Nada en Supabase</span>' : "") + '</td></tr>').join("");
  const total = modulos.reduce((s, m) => s + (m.pendientes || 0), 0);
  boton.textContent = total ? "Traspasar los " + total + " archivos" : "✓ Todo está en SharePoint";
  boton.disabled = !total;
}
async function contar() {
  const r = await fetch("/api/archivos/traspaso", { cache: "no-store" });
  const j = await r.json();
  if (!r.ok) { boton.textContent = j.error || "Error"; return; }
  const previos = Object.fromEntries(modulos.map((m) => [m.clave, m.pasados || 0]));
  modulos = j.modulos.map((m) => ({ ...m, pasados: previos[m.clave] || 0 }));
  pintar();
}
boton.onclick = async () => {
  boton.disabled = true;
  for (const m of modulos.filter((x) => x.pendientes)) {
    let cursor = null, errores = 0;
    do {
      m.estado = "Pasando…"; pintar();
      const r = await fetch("/api/archivos/traspaso", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ modulo: m.clave, cursor }) });
      const j = await r.json().catch(() => ({ error: "Respuesta inválida (HTTP " + r.status + ")" }));
      if (!r.ok) { m.error = j.error; anotar(m.nombre + ": " + j.error); break; }
      m.pasados += j.migrados;
      for (const e of j.errores || []) { errores++; anotar(m.nombre + " · " + e); }
      cursor = j.cursor;
    } while (cursor);
    m.estado = errores ? errores + " con error (ver abajo)" : "Listo";
    pintar();
  }
  boton.textContent = "Volviendo a contar…";
  await contar();
};
contar();
</script></body></html>`;
  return new NextResponse(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}

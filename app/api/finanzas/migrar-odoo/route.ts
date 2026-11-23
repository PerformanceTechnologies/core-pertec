import { NextRequest, NextResponse } from "next/server";
import { verificarAccesoAppApi } from "@/lib/autorizacion";
import { migrarDesdeOdoo, type AvanceMigracion, type TipoMigracion } from "@/lib/migracion-odoo-facturas";
import { indexarFacturasVenta } from "@/lib/indexador-facturas-venta";
import { indexarFacturasCompra } from "@/lib/indexador-facturas-compra";
import { credencialesGraphFacturasConfiguradas } from "@/lib/sharepoint-facturas";

export const runtime = "nodejs";
export const maxDuration = 300;

/** Se deja de subir a los 4 minutos, para alcanzar a indexar lo subido antes del límite de 5. */
const PRESUPUESTO_SUBIDA_MS = 240_000;

const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const ESTILO = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Migración desde Odoo</title>
<style>body{font:14px/1.45 system-ui,sans-serif;margin:24px;color:#1f1f1f;background:#fafafa}h1{font-size:18px;margin:0 0 4px}
.l{font:12px/1.5 ui-monospace,monospace;padding:1px 0}.subido{color:#0a7a3d}.ya{color:#777}.error{color:#c0262d}.sin{color:#b26b00}
.c{position:sticky;top:0;background:#fafafa;padding:8px 0;border-bottom:1px solid #ddd;margin-bottom:8px;font-weight:600}
.fin{margin-top:16px;padding:14px;border-radius:10px;background:#fff;border:1px solid #ddd}pre{white-space:pre-wrap;font-size:12px}</style></head><body>`;

/**
 * Trae de Odoo a Facturas Históricas (SharePoint + índice del Core) las ventas o compras desde una
 * fecha. Solo administradores. Se llama a mano, una vez por tipo:
 *   /api/finanzas/migrar-odoo?tipo=ventas&desde=2026-07-01
 *   /api/finanzas/migrar-odoo?tipo=compras&desde=2026-07-01
 * Se puede repetir: lo que ya está en la carpeta no se vuelve a subir ni a indexar.
 *
 * Responde una página que se va escribiendo mientras avanza (una línea por documento), para que no
 * quede en blanco varios minutos. Con «&formato=json» devuelve solo el resultado final en JSON.
 */
export async function GET(request: NextRequest) {
  const acceso = await verificarAccesoAppApi("finanzas");
  if (!acceso.usuario || acceso.usuario.rol !== "admin") return NextResponse.json({ error: "Solo administradores." }, { status: 403 });
  if (!credencialesGraphFacturasConfiguradas()) return NextResponse.json({ error: "Faltan las credenciales del sitio de Finanzas." }, { status: 500 });

  const q = request.nextUrl.searchParams;
  const tipo: TipoMigracion = q.get("tipo") === "compras" ? "compras" : "ventas";
  const desde = /^\d{4}-\d{2}-\d{2}$/.test(q.get("desde") ?? "") ? q.get("desde")! : "2026-07-01";
  const limite = q.get("limite") ? Math.max(1, Number(q.get("limite"))) : undefined;
  const correo = acceso.usuario.correo;
  const hasta = Date.now() + PRESUPUESTO_SUBIDA_MS;

  const correr = async (alAvanzar?: (a: AvanceMigracion) => void, alIndexar?: (anio: number, mes: number) => void) => {
    const r = await migrarDesdeOdoo({ tipo, desde, correo, limite, alAvanzar, hasta });
    // Después de subir, el indexador de siempre carga cada mes en el Core.
    const indexados: { anio: number; mes: number; nuevos: number }[] = [];
    for (const m of r.meses) {
      alIndexar?.(m.anio, m.mes);
      const { nuevos } = tipo === "ventas" ? await indexarFacturasVenta(m) : await indexarFacturasCompra(m);
      indexados.push({ ...m, nuevos });
    }
    return { ok: r.errores.length === 0 && r.pendientes === 0, ...r, indexados };
  };

  if (q.get("formato") === "json") {
    try {
      return NextResponse.json(await correr());
    } catch (e) {
      return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
    }
  }

  const cod = new TextEncoder();
  const flujo = new ReadableStream<Uint8Array>({
    async start(ctrl) {
      const escribir = (html: string) => ctrl.enqueue(cod.encode(html));
      // El relleno hace que el navegador empiece a mostrar de inmediato y no espere a juntar más.
      escribir(`${ESTILO}<!-- ${" ".repeat(2048)} -->`);
      escribir(`<h1>Migración de ${tipo} desde Odoo</h1><p>Desde ${esc(desde)}. No cierres esta pestaña hasta que aparezca el resumen al final.</p>`);
      escribir(`<div class="l">Buscando los documentos en Odoo…</div>`);
      const t0 = Date.now();
      let primero = true;
      try {
        const r = await correr(
          (a) => {
            if (primero) {
              escribir(`<div class="l">${a.total} documentos encontrados. Subiendo a SharePoint…</div>`);
              primero = false;
            }
            const clase = a.estado === "subido" ? "subido" : a.estado === "ya estaba" ? "ya" : a.estado === "error" ? "error" : "sin";
            const seg = Math.round((Date.now() - t0) / 1000);
            escribir(
              `<div class="l ${clase}">[${a.n}/${a.total} · ${seg}s] ${esc(a.nombre)} — ${a.estado}${a.detalle ? `: ${esc(a.detalle)}` : ""}</div>`,
            );
          },
          (anio, mes) => escribir(`<div class="l">Indexando ${String(mes).padStart(2, "0")}/${anio} en el Core…</div>`),
        );
        const titulo = r.pendientes > 0
          ? `⏳ Faltan ${r.pendientes}: se acabó el tiempo. Recarga esta página para seguir (lo ya subido no se repite).`
          : r.errores.length > 0
            ? `⚠️ Terminó con ${r.errores.length} errores.`
            : "✅ Listo, todo copiado e indexado.";
        escribir(
          `<div class="fin"><b>${esc(titulo)}</b><p>Encontrados ${r.encontrados} · subidos ${r.subidos} · ya estaban ${r.yaEstaban} · sin XML ${r.sinXml} · errores ${r.errores.length}</p><pre>${esc(JSON.stringify(r, null, 2))}</pre></div>`,
        );
      } catch (e) {
        escribir(`<div class="fin error"><b>Falló:</b> ${esc(e instanceof Error ? e.message : String(e))}</div>`);
      }
      escribir("</body></html>");
      ctrl.close();
    },
  });

  return new Response(flujo, {
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Accel-Buffering": "no" },
  });
}

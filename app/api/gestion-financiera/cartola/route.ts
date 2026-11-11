import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import ExcelJS from "exceljs";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { RUTA_FIN, auditar, cargarVistaDe, contextoFinApi } from "@/lib/fin/datos";
import { leerCartola } from "@/lib/fin/cartola";
import { huellaMovimiento, reglaQueCalza } from "@/lib/fin/reglas";
import { sinComentarios } from "@/lib/excel-sin-comentarios";
import { LIMITE_SUBIDA } from "@/lib/subidas";

export const runtime = "nodejs";

/** Lee un CSV con «;» o «,» respetando comillas. */
function leerCsv(texto: string): string[][] {
  const limpio = texto.replace(/^﻿/, "");
  const primera = limpio.split(/\r?\n/, 1)[0] ?? "";
  const sep = (primera.match(/;/g)?.length ?? 0) >= (primera.match(/,/g)?.length ?? 0) ? ";" : ",";
  const filas: string[][] = [];
  let fila: string[] = [], celda = "", comillas = false;
  for (let i = 0; i < limpio.length; i++) {
    const c = limpio[i];
    if (comillas) {
      if (c === '"' && limpio[i + 1] === '"') { celda += '"'; i++; }
      else if (c === '"') comillas = false;
      else celda += c;
    } else if (c === '"') comillas = true;
    else if (c === sep) { fila.push(celda); celda = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && limpio[i + 1] === "\n") i++;
      fila.push(celda); filas.push(fila); fila = []; celda = "";
    } else celda += c;
  }
  if (celda || fila.length) { fila.push(celda); filas.push(fila); }
  return filas;
}

async function leerExcel(buf: Buffer): Promise<string[][]> {
  const libro = new ExcelJS.Workbook();
  await libro.xlsx.load((await sinComentarios(buf)) as unknown as ArrayBuffer);
  const hoja = libro.worksheets[0];
  const filas: string[][] = [];
  hoja?.eachRow({ includeEmpty: false }, (fila) => {
    filas.push((fila.values as ExcelJS.CellValue[]).slice(1).map((v) => {
      if (v instanceof Date) return v.toISOString().slice(0, 10);
      if (v && typeof v === "object") return "result" in v ? String(v.result ?? "") : "text" in v ? String(v.text) : "richText" in v ? v.richText.map((t) => t.text).join("") : "";
      return v === null || v === undefined ? "" : String(v);
    }));
  });
  return filas;
}

/**
 * Importa la cartola de una cuenta: detecta las columnas, descarta lo ya cargado (huella de
 * cuenta + fecha + monto + glosa + N°) y aplica las reglas de categorización como sugerencia.
 */
export async function POST(request: Request) {
  const ctx = await contextoFinApi();
  if (!ctx) return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  const fd = await request.formData().catch(() => null);
  const archivo = fd?.get("archivo");
  const cuentaId = String(fd?.get("cuentaId") ?? "");
  if (!(archivo instanceof File) || archivo.size === 0) return NextResponse.json({ error: "Falta el archivo." }, { status: 400 });
  if (archivo.size > LIMITE_SUBIDA) return NextResponse.json({ error: "El archivo pasa el tope de 4 MB." }, { status: 413 });
  const { data: cuenta } = await supabaseAdmin.from("fin_cuentas").select("id, nombre").eq("id", cuentaId).eq("empresa_id", ctx.empresa.id).maybeSingle();
  if (!cuenta) return NextResponse.json({ error: "Elige la cuenta de la cartola." }, { status: 400 });

  const buf = Buffer.from(await archivo.arrayBuffer());
  let filas: string[][];
  try {
    filas = /\.xlsx$/i.test(archivo.name) ? await leerExcel(buf) : leerCsv(buf.toString("utf8").includes("�") ? buf.toString("latin1") : buf.toString("utf8"));
  } catch {
    return NextResponse.json({ error: "No se pudo leer el archivo: tiene que ser CSV o Excel (.xlsx)." }, { status: 400 });
  }
  const leida = leerCartola(filas);
  if (leida.error) return NextResponse.json({ error: leida.error }, { status: 400 });

  const vista = await cargarVistaDe(ctx);
  const { data: imp, error: eImp } = await supabaseAdmin
    .from("fin_importaciones")
    .insert({ empresa_id: ctx.empresa.id, cuenta_id: cuenta.id, archivo: archivo.name.slice(0, 200), filas_total: leida.filas.length, importado_por: ctx.usuario.correo })
    .select("id")
    .single();
  if (eImp) return NextResponse.json({ error: eImp.message }, { status: 500 });

  const nuevas = leida.filas.map((f) => {
    const regla = reglaQueCalza({ glosa: f.glosa, monto: f.monto, cuentaId: cuenta.id }, vista.reglas);
    // Una regla de categoría que no pide respaldo (comisiones) deja el movimiento conciliado de una.
    const directa = regla && !vista.categorias.find((c) => c.id === regla.categoriaId)?.requiereProyecto ? regla : null;
    // Todas las filas con las mismas columnas: en un insert de varias filas, una columna que falta
    // en alguna llega como null (no como su valor por omisión) y rompe las que son «not null».
    return {
      empresa_id: ctx.empresa.id, cuenta_id: cuenta.id, fecha: f.fecha, glosa: f.glosa, monto: f.monto, numero_documento: f.documento,
      huella: huellaMovimiento(cuenta.id, f.fecha, f.monto, f.glosa, f.documento), importacion_id: imp!.id, creado_por: ctx.usuario.correo,
      categoria_id: directa?.categoriaId ?? null, proyecto_id: directa?.proyectoId ?? null, regla_id: directa?.id ?? null, tiene_respaldo: Boolean(directa),
    };
  });
  // Dentro del mismo archivo también puede repetirse una línea: se queda la primera.
  const unicas = [...new Map(nuevas.map((x) => [x.huella, x])).values()];
  const { data: insertadas, error } = await supabaseAdmin.from("fin_movimientos").upsert(unicas, { onConflict: "empresa_id,huella", ignoreDuplicates: true }).select("id");
  if (error) {
    // Si no entró ningún movimiento, la importación no cuenta (si no, el resumen diría «banco actualizado»).
    await supabaseAdmin.from("fin_importaciones").delete().eq("id", imp!.id).eq("empresa_id", ctx.empresa.id);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  const n = insertadas?.length ?? 0;
  await supabaseAdmin.from("fin_importaciones").update({ filas_nuevas: n, filas_duplicadas: leida.filas.length - n }).eq("id", imp!.id);
  await auditar(ctx, "fin_importaciones", imp!.id, "importar", `${cuenta.nombre}: ${n} nuevos de ${leida.filas.length} (${leida.omitidas} filas omitidas)`);
  revalidatePath(RUTA_FIN, "layout");
  return NextResponse.json({ ok: true, nuevas: n, duplicadas: leida.filas.length - n, omitidas: leida.omitidas });
}

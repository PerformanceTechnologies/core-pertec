import { NextResponse } from "next/server";
import { contextoFinApi } from "@/lib/fin/datos";
import { subirDocumento } from "@/lib/fin/dte/subir-documento";

export const runtime = "nodejs";

/** Sube un DTE (XML y/o PDF) al archivo: ver lib/fin/dte/subir-documento.ts. */
export async function POST(req: Request) {
  const ctx = await contextoFinApi();
  if (!ctx) return NextResponse.json({ ok: false, error: "No autorizado." }, { status: 403 });
  const fd = await req.formData().catch(() => null);
  if (!fd) return NextResponse.json({ ok: false, error: "No llegó el formulario." }, { status: 400 });
  const r = await subirDocumento(ctx, fd);
  return NextResponse.json(r, { status: r.ok ? 200 : 400 });
}

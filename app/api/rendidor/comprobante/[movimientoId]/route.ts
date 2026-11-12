import { NextResponse } from "next/server";
import { verificarAccesoRendidorApi } from "@/lib/rendidor/permisos";
import { contextoDeEmpresa } from "@/lib/empresas";
import { obtenerFondo, rolesDe } from "@/lib/rendidor/fondos";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { enlaceTemporal } from "@/lib/archivos/almacen";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Abre el comprobante de un movimiento del libro: lo ve quien rinde ese fondo y quien tiene
// algún rol de Fondos en la empresa. Redirige a un enlace temporal.
export async function GET(_: Request, { params }: { params: Promise<{ movimientoId: string }> }) {
  const acceso = await verificarAccesoRendidorApi();
  if (!acceso.usuario) return NextResponse.json({ error: acceso.error }, { status: acceso.status });
  const { movimientoId } = await params;
  const { data: m } = await supabaseAdmin.from("rg_movimientos").select("fondo_id, comprobante").eq("id", movimientoId).maybeSingle();
  if (!m?.comprobante) return NextResponse.json({ error: "Este movimiento no tiene comprobante." }, { status: 404 });
  const fondo = await obtenerFondo(m.fondo_id as string);
  if (!fondo) return NextResponse.json({ error: "No encontramos el fondo." }, { status: 404 });
  const esDuenio = fondo.rendidorCorreo?.toLowerCase() === acceso.usuario.correo.toLowerCase();
  if (!esDuenio) {
    const { activa } = await contextoDeEmpresa(acceso.usuario.id, acceso.usuario.rol);
    const roles = activa && activa.id === fondo.empresaId ? await rolesDe(acceso.usuario, acceso.rol === "admin", activa.id) : [];
    if (!roles.length) return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }
  const url = await enlaceTemporal("rendiciones-respaldos", m.comprobante as string, { segundos: 300 });
  if (!url) return NextResponse.json({ error: "No pudimos abrir el comprobante." }, { status: 500 });
  return NextResponse.redirect(url);
}

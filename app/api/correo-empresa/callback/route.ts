import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { obtenerUsuarioActivo } from "@/lib/usuarios";
import { contextoDeEmpresa } from "@/lib/empresas";
import { descifrar } from "@/lib/cifrado";
import { guardarConexion } from "@/lib/correo-empresa";
import {
  COOKIE_FLUJO,
  canjearCodigo,
  codigoErrorMicrosoft,
  origenPublico,
  type CodigoErrorConexion,
  type PaqueteFlujo,
} from "@/lib/correo-empresa-oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function dominioDe(correo: string): string {
  return correo.split("@")[1]?.toLowerCase() ?? "";
}

/**
 * Una página mínima, sin el Core alrededor, para quien aprueba la app como administrador de
 * la otra empresa: esa persona normalmente no tiene cuenta en el Core, así que mandarla a
 * /correo-empresa la dejaría en la pantalla de ingreso. Solo textos fijos: nada de lo que
 * llega en la URL se escribe en la página.
 */
function paginaSimple(titulo: string, texto: string, ok: boolean): Response {
  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${titulo}</title></head>
<body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#f7f4ef;font-family:Segoe UI,Arial,sans-serif;color:#2a2622">
<main style="max-width:440px;margin:24px;padding:28px;border-radius:20px;background:#fff;box-shadow:0 14px 36px -18px rgba(23,20,17,.25)">
<p style="margin:0 0 8px;font-size:28px">${ok ? "✅" : "⚠️"}</p>
<h1 style="margin:0 0 8px;font-size:20px">${titulo}</h1>
<p style="margin:0;font-size:14px;line-height:1.55;color:#5c564f">${texto}</p>
</main></body></html>`;
  return new Response(html, { status: ok ? 200 : 400, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}

/** Vuelta de Microsoft: canjea el código, revisa que la cuenta sea la correcta y la guarda. */
export async function GET(request: NextRequest) {
  const origen = origenPublico(request);
  const q = request.nextUrl.searchParams;

  // Vuelta del enlace de aprobación del administrador (/adminconsent): no hay código que
  // canjear ni cuenta que guardar, solo avisarle cómo le fue.
  // El enlace se arma con state=aprobacion-admin, que Microsoft devuelve también cuando falla.
  if (q.has("admin_consent") || q.get("state") === "aprobacion-admin") {
    if (q.get("admin_consent") === "True" && !q.get("error")) {
      return paginaSimple("App aprobada", "La app del Core PERTEC quedó aprobada en tu organización, solo para enviar correos. Cada persona ya puede conectar su correo desde el Core. Puedes cerrar esta ventana.", true);
    }
    console.warn(`[correo-empresa] la aprobación del administrador no se completó: ${q.get("error") ?? ""} ${(q.get("error_description") ?? "").split("\n")[0]}`);
    return paginaSimple("No se aprobó la app", "La aprobación no se completó. Si fue sin querer, vuelve a abrir el enlace; si sigue fallando, avísale a quien te lo mandó.", false);
  }

  let paquete: PaqueteFlujo | null = null;
  try {
    const crudo = request.cookies.get(COOKIE_FLUJO)?.value;
    paquete = crudo ? (JSON.parse(descifrar(crudo)) as PaqueteFlujo) : null;
  } catch {
    paquete = null;
  }

  const salir = (parametros: Record<string, string>) => {
    if (paquete?.pestana) parametros.pestana = "1";
    const r = NextResponse.redirect(`${origen}/correo-empresa?${new URLSearchParams(parametros)}`);
    r.cookies.set(COOKIE_FLUJO, "", { path: "/api/correo-empresa", maxAge: 0 });
    return r;
  };
  const fallar = (error: CodigoErrorConexion) => salir({ error, ...(paquete?.empresaId ? { empresa: paquete.empresaId } : {}) });

  if (!paquete || paquete.vence < Date.now() || q.get("state") !== paquete.estado) return fallar("vencio");

  const errorMs = q.get("error");
  if (errorMs) {
    const descripcion = q.get("error_description") ?? "";
    console.warn(`[correo-empresa] Microsoft devolvió ${errorMs}: ${descripcion.split("\n")[0]}`);
    return fallar(codigoErrorMicrosoft(errorMs, descripcion));
  }

  const usuario = await obtenerUsuarioActivo((await auth())?.user?.email);
  if (!usuario || usuario.id !== paquete.usuarioId) return fallar("sesion");

  const { permitidas } = await contextoDeEmpresa(usuario.id, usuario.rol);
  const empresa = permitidas.find((e) => e.id === paquete!.empresaId);
  if (!empresa?.correoPropio) return fallar("empresa");

  const codigo = q.get("code");
  if (!codigo) return fallar("microsoft");

  let cuenta;
  try {
    cuenta = await canjearCodigo(codigo, paquete.verificador, paquete.redirectUri);
  } catch (e) {
    const motivo = e instanceof Error ? e.message : String(e);
    console.error("[correo-empresa] no se pudo canjear el código:", motivo);
    return fallar(/Falta configurar/.test(motivo) ? "config" : codigoErrorMicrosoft("", motivo));
  }

  // La cuenta tiene que ser de la empresa. Con dominio configurado, se exige ese; sin él,
  // al menos que no sea la misma cuenta con la que se entra al Core: conectar la de PERTEC
  // haría que el correo de Zeus saliera de @pertec.cl, que es lo que esto evita.
  const dominio = dominioDe(cuenta.cuenta);
  if (empresa.correoDominio ? dominio !== empresa.correoDominio : dominio === dominioDe(usuario.correo)) {
    return fallar(empresa.correoDominio ? "dominio" : "misma");
  }

  try {
    await guardarConexion(usuario.id, empresa.id, cuenta);
  } catch (e) {
    console.error("[correo-empresa] no se pudo guardar la conexión:", e instanceof Error ? e.message : e);
    return fallar("guardar");
  }
  console.info(`[correo-empresa] ${usuario.correo} conectó su correo de ${empresa.slug}.`);
  return salir({ conectada: empresa.id });
}

import { signIn } from "@/auth";
import { SCOPES_SHAREPOINT } from "@/lib/contratos/graph-token";

export const runtime = "nodejs";

// Pide los permisos de SharePoint, igual que el botón «Conectar SharePoint» de Contratos: el
// mismo proveedor de Entra con un `scope` más ancho. Microsoft reconoce la sesión y solo
// pregunta por lo que falta; después vuelve a `volver` (solo rutas del Core).
export async function GET(request: Request) {
  const volver = new URL(request.url).searchParams.get("volver") ?? "/";
  const destino = volver.startsWith("/") && !volver.startsWith("//") && !volver.startsWith("/\\") ? volver : "/";
  await signIn("microsoft-entra-id", { redirectTo: destino }, { scope: SCOPES_SHAREPOINT });
}

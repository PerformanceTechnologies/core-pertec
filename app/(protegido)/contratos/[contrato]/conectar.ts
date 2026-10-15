"use server";


import { enEsteContrato } from "@/lib/contratos/contrato-actual";
import { signIn } from "@/auth";
import { exigirAccesoApp } from "@/lib/contratos/autorizacion";
import { SCOPES_SHAREPOINT } from "@/lib/contratos/graph-token";

/**
 * Pide los permisos de SharePoint, aparte del login.
 *
 * Es el MISMO proveedor de Entra, con un `scope` más ancho: por eso no hace
 * falta registrar otra URL de retorno ni otra aplicación. Microsoft reconoce que
 * ya hay sesión y solo pregunta por lo que falta.
 *
 * Existe porque pedirlos en el login bloqueaba a cualquiera de otra empresa:
 * `Sites.ReadWrite.All` lo tiene que aprobar un administrador de SU directorio,
 * y sin eso ni siquiera podía entrar al panel. Separado, entrar y abrir los
 * documentos dejan de depender el uno del otro.
 */
export async function conectarSharePointAction(): Promise<void> {
  await exigirAccesoApp("contratos");
  await signIn("microsoft-entra-id", { redirectTo: await enEsteContrato("/contratos") }, { scope: SCOPES_SHAREPOINT });
}

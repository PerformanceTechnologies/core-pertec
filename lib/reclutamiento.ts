import "server-only";
import { Client } from "@microsoft/microsoft-graph-client";
import { ClientSecretCredential } from "@azure/identity";

const GRAPH_SCOPE = "https://graph.microsoft.com/.default";

// Misma lista de SharePoint que usa el formulario público de postular.pertec.cl.
const ID_LISTA = "f9f9ce5d-99ba-433e-8316-f1ca8a22d945";
const MAX_PAGINAS = 10;

export function credencialesGraphConfiguradas(): boolean {
  return Boolean(
    process.env.AZURE_TENANT_ID &&
      process.env.AZURE_CLIENT_ID &&
      process.env.AZURE_CLIENT_SECRET &&
      process.env.SHAREPOINT_SITE_ID
  );
}

let credencial: ClientSecretCredential | null = null;

function obtenerCredencial(): ClientSecretCredential {
  if (!credencial) {
    credencial = new ClientSecretCredential(
      process.env.AZURE_TENANT_ID!,
      process.env.AZURE_CLIENT_ID!,
      process.env.AZURE_CLIENT_SECRET!
    );
  }
  return credencial;
}

async function clienteGraph(): Promise<Client> {
  const token = await obtenerCredencial().getToken(GRAPH_SCOPE);
  if (!token) throw new Error("No fue posible autenticar contra Microsoft Graph");
  return Client.init({
    authProvider: (done) => done(null, token.token),
  });
}

const SITE_ID = () => process.env.SHAREPOINT_SITE_ID!;

export interface PostulacionGuardada {
  id: string;
  creadaEn: string;
  nombreCompleto: string;
  rut: string;
  fechaNacimiento: string;
  telefono: string;
  correo: string;
  region: string;
  comuna: string;
  cargo: string;
  experiencia: string;
  turno: string;
  disponibilidadFaena: string;
  licencias: string;
  examenesVigentes: string;
  institucionExamenes: string;
  linkedin: string;
  comoSeEntero: string;
  cvUrl: string;
  otrosDocumentosUrl: string;
}

export async function listarPostulaciones(): Promise<PostulacionGuardada[]> {
  const graph = await clienteGraph();
  const items: Record<string, unknown>[] = [];

  let siguiente: string | undefined = `/sites/${SITE_ID()}/lists/${ID_LISTA}/items?$expand=fields&$top=200`;
  let paginas = 0;

  while (siguiente && paginas < MAX_PAGINAS) {
    const respuesta = await graph.api(siguiente).get();
    items.push(...(respuesta?.value ?? []));
    siguiente = respuesta?.["@odata.nextLink"];
    paginas++;
  }

  return items
    .map((item) => {
      const f = (item.fields ?? {}) as Record<string, string>;
      return {
        id: String(item.id ?? ""),
        creadaEn: String(item.createdDateTime ?? ""),
        nombreCompleto: f.Title ?? "",
        rut: f.RUT ?? "",
        fechaNacimiento: f.FechaNacimiento ?? "",
        telefono: f.Telefono ?? "",
        correo: f.Correo ?? "",
        region: f.Region ?? "",
        comuna: f.Comuna ?? "",
        cargo: f.Cargo ?? "",
        experiencia: f.Experiencia ?? "",
        turno: f.Turno ?? "",
        disponibilidadFaena: f.DisponibilidadFaena ?? "",
        licencias: f.Licencias ?? "",
        examenesVigentes: f.ExamenesVigentes ?? "",
        institucionExamenes: f.InstitucionExamenes ?? "",
        linkedin: f.LinkedIn ?? "",
        comoSeEntero: f.ComoSeEntero ?? "",
        cvUrl: f.CVUrl ?? "",
        otrosDocumentosUrl: f.OtrosDocumentosUrl ?? "",
      };
    })
    .sort((a, b) => (a.creadaEn < b.creadaEn ? 1 : -1));
}

export async function eliminarPostulacion(id: string): Promise<void> {
  const graph = await clienteGraph();
  await graph.api(`/sites/${SITE_ID()}/lists/${ID_LISTA}/items/${id}`).delete();
}

import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import type { LecturaCotizacion } from "./oc-ia-datos";

// Leer la cotización de un proveedor (PDF o foto) con IA, para llenar la solicitud de compra (solo servidor).
// Lo que se hace con lo leído (neto, verificación de totales) vive en oc-ia-datos.ts: acá solo está la llamada.

const MODELO = "claude-sonnet-5-5";

function cliente(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("La IA no está configurada (falta ANTHROPIC_API_KEY). Llena la solicitud a mano.");
  return new Anthropic();
}

const nullable = (type: "string" | "number") => ({ type: [type, "null"] });

const ESQUEMA = {
  type: "object",
  properties: {
    numeroCotizacion: { ...nullable("string"), description: "N° de cotización o presupuesto del proveedor, tal como está impreso." },
    fecha: { ...nullable("string"), description: "Fecha del documento en formato YYYY-MM-DD." },
    titulo: { ...nullable("string"), description: "Qué se está comprando, en una línea corta (menos de 80 caracteres), p. ej. «Repuestos para chancador». Sin el nombre del proveedor." },
    proveedor: {
      type: "object",
      properties: {
        razonSocial: { ...nullable("string"), description: "Razón social de quien EMITE la cotización (el proveedor), no de quien la recibe." },
        rut: { ...nullable("string"), description: "RUT del proveedor tal como aparece (ej. 76.123.456-7)." },
        atencion: { ...nullable("string"), description: "Nombre de la persona de contacto o vendedor del proveedor." },
        correo: { ...nullable("string"), description: "Correo del proveedor o de su vendedor." },
        telefono: { ...nullable("string") },
        direccion: { ...nullable("string") },
      },
      required: ["razonSocial", "rut", "atencion", "correo", "telefono", "direccion"],
      additionalProperties: false,
    },
    moneda: { anyOf: [{ type: "string", enum: ["CLP", "UF", "USD"] }, { type: "null" }], description: "Moneda de los precios: CLP (pesos), UF o USD (dólares). null si no se indica (se asume pesos)." },
    preciosIncluyenIva: {
      type: "boolean",
      description: "true SOLO si el documento muestra los precios unitarios ya con IVA incluido y no entrega el neto. false si los precios son netos (el documento suma el IVA aparte) o si no hay certeza.",
    },
    lineas: {
      type: "array",
      description: "Un elemento por ítem de la tabla de productos o servicios, en el orden del documento.",
      items: {
        type: "object",
        properties: {
          descripcion: { type: "string", description: "Descripción del ítem, con su código o marca si lo trae." },
          cantidad: nullable("number"),
          unidad: { ...nullable("string"), description: "Unidad impresa (un, kg, m, mes, global…). null si no hay." },
          precioUnitario: { ...nullable("number"), description: "Precio unitario IMPRESO, sin puntos ni símbolo. No lo calcules: si el documento solo trae el total de la línea, déjalo en null." },
          descuentoPct: { ...nullable("number"), description: "Descuento de la línea en porcentaje (10 = 10 %), solo si está impreso." },
          exento: { type: "boolean", description: "true si el ítem está declarado exento de IVA." },
        },
        required: ["descripcion", "cantidad", "unidad", "precioUnitario", "descuentoPct", "exento"],
        additionalProperties: false,
      },
    },
    totalDeclarado: { ...nullable("number"), description: "El TOTAL final impreso (a pagar). Se usa para verificar la suma; no lo calcules." },
    plazoEntrega: { ...nullable("string"), description: "Plazo de entrega o disponibilidad, p. ej. «5 días hábiles»." },
    formaPago: { ...nullable("string"), description: "Forma de pago impresa, p. ej. «Transferencia», «50% anticipo»." },
    condicionPagoDias: { ...nullable("number"), description: "Días de crédito si dice «30 días»; 0 si es contado. null si no lo dice." },
    lugarEntrega: { ...nullable("string"), description: "Lugar de entrega o despacho, si lo dice." },
    observaciones: { ...nullable("string"), description: "Condiciones o notas importantes del proveedor (garantía, validez, exclusiones), resumidas en pocas líneas." },
    ilegibles: { type: "array", items: { type: "string" }, description: "Datos que no se pudieron leer con certeza. Nunca adivinar." },
  },
  required: ["numeroCotizacion", "fecha", "titulo", "proveedor", "moneda", "preciosIncluyenIva", "lineas", "totalDeclarado", "plazoEntrega", "formaPago", "condicionPagoDias", "lugarEntrega", "observaciones", "ilegibles"],
  additionalProperties: false,
} as const;

const INSTRUCCIONES = `Eres un asistente que TRANSCRIBE cotizaciones de proveedores para cargarlas como solicitud de compra en el sistema de una empresa chilena.

REGLA PRINCIPAL: transcribes, no calculas.
- Copia los montos y cantidades EXACTAMENTE como están impresos. No sumes, no promedies, no conviertas monedas.
- Si un dato no está en el documento, déjalo en null. Nunca lo inventes ni lo deduzcas.
- Lo que no puedas leer con certeza va nombrado en "ilegibles".

El proveedor es quien EMITE la cotización (su logo y datos suelen ir arriba). La empresa que compra es el destinatario: no la confundas con el proveedor.

Precios: copia el precio UNITARIO de cada ítem. Si la tabla solo muestra el total de la línea y la cantidad, deja el precio unitario en null (el sistema lo calcula). Marca preciosIncluyenIva en true únicamente si los precios impresos ya incluyen IVA y el documento no muestra un neto aparte; en una cotización con «Neto», «IVA» y «Total» al pie, los precios de la tabla son netos y preciosIncluyenIva es false.

El documento puede ser un PDF o una foto. Puede traer varias páginas; transcribe todos los ítems de la tabla.`;

type MediaImagen = "image/jpeg" | "image/png" | "image/webp" | "image/gif";
const imagen = (mime: string): mime is MediaImagen => ["image/jpeg", "image/png", "image/webp", "image/gif"].includes(mime);

/** Lee una cotización (PDF o imagen) y devuelve lo transcrito. Lanza con un mensaje claro si no se pudo. */
export async function leerCotizacionProveedor(archivo: Buffer, mime: string, nombre: string): Promise<LecturaCotizacion> {
  const contenido: Anthropic.ContentBlockParam =
    mime === "application/pdf"
      ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: archivo.toString("base64") } }
      : imagen(mime)
        ? { type: "image", source: { type: "base64", media_type: mime, data: archivo.toString("base64") } }
        : (() => {
            throw new Error(`«${nombre}» no se puede leer: sube un PDF o una foto (JPG, PNG o WebP).`);
          })();

  const respuesta = await cliente().messages.create({
    model: MODELO,
    max_tokens: 8192,
    system: [{ type: "text", text: INSTRUCCIONES, cache_control: { type: "ephemeral" } }],
    output_config: { format: { type: "json_schema", schema: ESQUEMA } },
    messages: [{ role: "user", content: [contenido, { type: "text", text: `Transcribe esta cotización de proveedor (archivo: ${nombre}).` }] }],
  });

  if (respuesta.stop_reason === "refusal") throw new Error(`La IA no pudo leer «${nombre}». Llena la solicitud a mano.`);
  if (respuesta.stop_reason === "max_tokens") throw new Error(`La lectura de «${nombre}» quedó incompleta. Llena la solicitud a mano.`);
  const bloque = respuesta.content.find((b) => b.type === "text");
  if (!bloque || bloque.type !== "text") throw new Error(`La lectura de «${nombre}» no devolvió datos.`);
  try {
    return JSON.parse(bloque.text) as LecturaCotizacion;
  } catch {
    throw new Error(`La IA devolvió un formato inesperado al leer «${nombre}». Inténtalo de nuevo.`);
  }
}

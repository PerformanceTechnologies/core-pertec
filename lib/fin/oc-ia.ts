import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { aLectura, type LecturaCotizacion, type LecturaCruda } from "./oc-ia-datos";

// Leer la cotización de un proveedor (PDF o foto) con IA, para llenar la solicitud de compra (solo servidor).
// Lo que se hace con lo leído (neto, verificación de totales) vive en oc-ia-datos.ts: acá solo está la llamada.

const MODELO = "claude-sonnet-5-5";

function cliente(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("La IA no está configurada (falta ANTHROPIC_API_KEY). Llena la solicitud a mano.");
  return new Anthropic();
}

// La API de salida estructurada acepta como máximo 16 campos que admitan «vacío» (null o varios tipos): este documento
// necesita más, así que NINGUNO es null. Lo que no está impreso se devuelve como texto vacío o con un valor centinela
// (-1 en los números donde 0 es un dato válido) y `aLectura` (oc-ia-datos.ts) lo traduce a null.
const ESQUEMA = {
  type: "object",
  properties: {
    numeroCotizacion: { type: "string", description: "N° de cotización o presupuesto del proveedor, tal como está impreso. Texto vacío si no hay." },
    fecha: { type: "string", description: "Fecha del documento en formato YYYY-MM-DD. Texto vacío si no hay." },
    titulo: { type: "string", description: "Qué se está comprando, en una línea corta (menos de 80 caracteres), p. ej. «Repuestos para chancador». Sin el nombre del proveedor. Texto vacío si no se puede decir." },
    proveedor: {
      type: "object",
      properties: {
        razonSocial: { type: "string", description: "Razón social de quien EMITE la cotización (el proveedor), no de quien la recibe. Texto vacío si no se lee." },
        rut: { type: "string", description: "RUT del proveedor tal como aparece (ej. 76.123.456-7). Texto vacío si no aparece." },
        atencion: { type: "string", description: "Nombre de la persona de contacto o vendedor del proveedor. Texto vacío si no hay." },
        correo: { type: "string", description: "Correo del proveedor o de su vendedor. Texto vacío si no hay." },
        telefono: { type: "string", description: "Texto vacío si no hay." },
        direccion: { type: "string", description: "Texto vacío si no hay." },
      },
      required: ["razonSocial", "rut", "atencion", "correo", "telefono", "direccion"],
      additionalProperties: false,
    },
    moneda: { type: "string", enum: ["CLP", "UF", "USD", "no_indica"], description: "Moneda de los precios: CLP (pesos), UF o USD (dólares). «no_indica» si el documento no la señala (se asume pesos)." },
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
          cantidad: { type: "number", description: "Cantidad impresa. 0 si no se lee." },
          unidad: { type: "string", description: "Unidad impresa (un, kg, m, mes, global…). Texto vacío si no hay." },
          precioUnitario: { type: "number", description: "Precio unitario IMPRESO, sin puntos ni símbolo. No lo calcules: si el documento solo trae el total de la línea, o no se lee, devuelve -1." },
          descuentoPct: { type: "number", description: "Descuento de la línea en porcentaje (10 = 10 %), solo si está impreso. 0 si no hay." },
          exento: { type: "boolean", description: "true si el ítem está declarado exento de IVA." },
        },
        required: ["descripcion", "cantidad", "unidad", "precioUnitario", "descuentoPct", "exento"],
        additionalProperties: false,
      },
    },
    totalDeclarado: { type: "number", description: "El TOTAL final impreso (a pagar). Se usa para verificar la suma; no lo calcules. 0 si no está impreso." },
    plazoEntrega: { type: "string", description: "Plazo de entrega o disponibilidad, p. ej. «5 días hábiles». Texto vacío si no hay." },
    formaPago: { type: "string", description: "Forma de pago impresa, p. ej. «Transferencia», «50% anticipo». Texto vacío si no hay." },
    condicionPagoDias: { type: "number", description: "Días de crédito si dice «30 días»; 0 si es contado. -1 si el documento no lo dice." },
    lugarEntrega: { type: "string", description: "Lugar de entrega o despacho, si lo dice. Texto vacío si no." },
    observaciones: { type: "string", description: "Condiciones o notas importantes del proveedor (garantía, validez, exclusiones), resumidas en pocas líneas. Texto vacío si no hay." },
    ilegibles: { type: "array", items: { type: "string" }, description: "Datos que no se pudieron leer con certeza. Nunca adivinar." },
  },
  required: ["numeroCotizacion", "fecha", "titulo", "proveedor", "moneda", "preciosIncluyenIva", "lineas", "totalDeclarado", "plazoEntrega", "formaPago", "condicionPagoDias", "lugarEntrega", "observaciones", "ilegibles"],
  additionalProperties: false,
} as const;

const INSTRUCCIONES = `Eres un asistente que TRANSCRIBE cotizaciones de proveedores para cargarlas como solicitud de compra en el sistema de una empresa chilena.

REGLA PRINCIPAL: transcribes, no calculas.
- Copia los montos y cantidades EXACTAMENTE como están impresos. No sumes, no promedies, no conviertas monedas.
- Si un dato no está en el documento, déjalo vacío (texto vacío, 0 o -1 según el campo). Nunca lo inventes ni lo deduzcas.
- Lo que no puedas leer con certeza va nombrado en "ilegibles".

El proveedor es quien EMITE la cotización (su logo y datos suelen ir arriba). La empresa que compra es el destinatario: no la confundas con el proveedor.

Precios: copia el precio UNITARIO de cada ítem. Si la tabla solo muestra el total de la línea y la cantidad, deja el precio unitario en -1 (el sistema lo calcula). Marca preciosIncluyenIva en true únicamente si los precios impresos ya incluyen IVA y el documento no muestra un neto aparte; en una cotización con «Neto», «IVA» y «Total» al pie, los precios de la tabla son netos y preciosIncluyenIva es false.

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
    return aLectura(JSON.parse(bloque.text) as LecturaCruda);
  } catch {
    throw new Error(`La IA devolvió un formato inesperado al leer «${nombre}». Inténtalo de nuevo.`);
  }
}

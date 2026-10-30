// Página web (pertec.cl) administrada desde el Core: el vocabulario y las reglas.
//
// Sin "server-only": lo usan los formularios (cliente), el servidor y las pruebas.
// La base es la del sitio (el Supabase de pertec-web, ver lib/pertec-web-supabase.ts),
// no la del Core: el sitio lee esas tablas en vivo desde el navegador, así que lo que
// se guarda acá se ve en pertec.cl en la próxima carga, sin publicar nada.
//
// Es lo mismo que se podía hacer en pertec.cl/admin —catálogo, casos, solicitudes y
// la configuración de contacto—, con los mismos campos y los mismos valores, para que
// el sitio siga entendiendo todo lo que se guarda. Las listas de valores (tipos, colores,
// estados) son COPIA de las del sitio (admin.jsx, pages.jsx): si el sitio agrega uno,
// hay que agregarlo acá también.

export const SLUG_APP_PAGINA_WEB = "pagina-web";

/** Los buckets públicos del sitio donde van las imágenes. */
export const BUCKETS_WEB = ["equipos", "casos"] as const;
export type BucketWeb = (typeof BUCKETS_WEB)[number];

// ─── Catálogo (tabla equipos) ────────────────────────────────────────────────

export const CATEGORIAS_EQUIPO = [
  { valor: "producto", etiqueta: "Producto (arriendo)" },
  { valor: "servicio", etiqueta: "Servicio" },
] as const;
export type CategoriaEquipo = (typeof CATEGORIAS_EQUIPO)[number]["valor"];

/** Los tipos que ofrece el selector (los mismos del admin del sitio). Vacío = sin tipo. */
export const TIPOS_EQUIPO = ["Vulcanizador", "Complementario", "Inspección", "Mantenimiento", "Otro"] as const;

export interface Especificacion {
  k: string;
  v: string;
}
export interface DescripcionExtra {
  titulo: string;
  contenido: string;
}

export interface Equipo {
  id: string;
  categoria: CategoriaEquipo;
  tipo: string;
  nombre: string;
  ancho_correa_max: string;
  descripcion_corta: string;
  descripcion_larga: string;
  imagen_url: string;
  imagenes: { url: string }[];
  descripciones_extra: DescripcionExtra[];
  especificaciones: Especificacion[];
  destacado: boolean;
  disponible: boolean;
  orden: number;
}

/** El largo máximo de la descripción corta: el admin del sitio lo limita a 120. */
export const MAX_DESCRIPCION_CORTA = 120;

export function equipoVacio(categoria: CategoriaEquipo = "producto"): Omit<Equipo, "id"> {
  return {
    categoria,
    tipo: "",
    nombre: "",
    ancho_correa_max: "",
    descripcion_corta: "",
    descripcion_larga: "",
    imagen_url: "",
    imagenes: [],
    descripciones_extra: [],
    especificaciones: [],
    destacado: false,
    disponible: true,
    orden: 0,
  };
}

const texto = (v: unknown) => (typeof v === "string" ? v : v == null ? "" : String(v));
const lista = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const entero = (v: unknown) => {
  const n = Math.trunc(Number(v));
  return Number.isFinite(n) ? n : 0;
};

/** Normaliza una fila leída de la base: columnas nulas a sus valores vacíos. */
export function equipoDesdeFila(f: Record<string, unknown>): Equipo {
  return {
    id: texto(f.id),
    categoria: f.categoria === "servicio" ? "servicio" : "producto", // nula cuenta como producto, igual que en el sitio
    tipo: texto(f.tipo),
    nombre: texto(f.nombre),
    ancho_correa_max: texto(f.ancho_correa_max),
    descripcion_corta: texto(f.descripcion_corta),
    descripcion_larga: texto(f.descripcion_larga),
    imagen_url: texto(f.imagen_url),
    imagenes: lista(f.imagenes)
      .map((i) => ({ url: texto((i as { url?: unknown })?.url) }))
      .filter((i) => i.url),
    descripciones_extra: lista(f.descripciones_extra).map((d) => ({
      titulo: texto((d as DescripcionExtra)?.titulo),
      contenido: texto((d as DescripcionExtra)?.contenido),
    })),
    especificaciones: lista(f.especificaciones).map((e) => ({
      k: texto((e as Especificacion)?.k),
      v: texto((e as Especificacion)?.v),
    })),
    destacado: f.destacado === true,
    disponible: f.disponible !== false,
    orden: entero(f.orden),
  };
}

export type Validacion<T> = { ok: true; datos: T } | { ok: false; error: string };

/**
 * Lo que se escribe en la tabla, y nada más.
 *
 * El admin del sitio mandaba el objeto entero a la base, así que cualquier columna se
 * podía escribir. Acá se arma la fila columna por columna desde lo que llega del
 * formulario, que es tan poco de fiar como cualquier dato de un navegador.
 */
export function sanearEquipo(entrada: unknown): Validacion<Omit<Equipo, "id">> {
  const e = (entrada ?? {}) as Record<string, unknown>;
  const nombre = texto(e.nombre).trim();
  if (!nombre) return { ok: false, error: "El nombre es obligatorio." };

  const corta = texto(e.descripcion_corta).trim();
  if (corta.length > MAX_DESCRIPCION_CORTA) {
    return { ok: false, error: `La descripción corta tiene ${corta.length} caracteres; el máximo es ${MAX_DESCRIPCION_CORTA}.` };
  }

  // El tipo NO se restringe a TIPOS_EQUIPO: los equipos sembrados en el sitio traen
  // tipos que el selector no ofrece ("Traccionador", "Variable"), y rechazarlos dejaría
  // esos equipos imposibles de editar. Es texto libre en la base y el sitio lo muestra tal cual.
  const tipo = texto(e.tipo).trim().slice(0, 60);

  return {
    ok: true,
    datos: {
      categoria: e.categoria === "servicio" ? "servicio" : "producto",
      tipo,
      nombre,
      ancho_correa_max: texto(e.ancho_correa_max).trim(),
      descripcion_corta: corta,
      descripcion_larga: texto(e.descripcion_larga).trim(),
      imagen_url: texto(e.imagen_url).trim(),
      imagenes: lista(e.imagenes)
        .map((i) => ({ url: texto((i as { url?: unknown })?.url).trim() }))
        .filter((i) => i.url),
      // Igual que el sitio: una fila sin título NI contenido (o sin etiqueta NI valor) se descarta.
      descripciones_extra: lista(e.descripciones_extra)
        .map((d) => ({
          titulo: texto((d as DescripcionExtra)?.titulo).trim(),
          contenido: texto((d as DescripcionExtra)?.contenido).trim(),
        }))
        .filter((d) => d.titulo || d.contenido),
      especificaciones: lista(e.especificaciones)
        .map((s) => ({ k: texto((s as Especificacion)?.k).trim(), v: texto((s as Especificacion)?.v).trim() }))
        .filter((s) => s.k || s.v),
      destacado: e.destacado === true,
      disponible: e.disponible !== false,
      orden: entero(e.orden),
    },
  };
}

/** Todas las imágenes de un equipo: la principal y la galería. */
export function imagenesDeEquipo(e: Pick<Equipo, "imagen_url" | "imagenes">): string[] {
  return [e.imagen_url, ...e.imagenes.map((i) => i.url)].filter(Boolean);
}

// ─── Casos de éxito (tabla casos) ────────────────────────────────────────────

/** Los fondos de la tarjeta de un caso. Mismos valores y degradados que el sitio. */
export const COLORES_CASO = [
  { valor: "cobre", etiqueta: "Cobre · negro", degradado: "linear-gradient(135deg,#7a3010,#171411)" },
  { valor: "teal", etiqueta: "Teal · negro", degradado: "linear-gradient(135deg,#00594a,#171411)" },
  { valor: "cobre-bright", etiqueta: "Cobre brillante", degradado: "linear-gradient(135deg,#C85217,#2b2927)" },
  { valor: "negro", etiqueta: "Negro suave", degradado: "linear-gradient(135deg,#3f3c39,#171411)" },
  { valor: "teal-deep", etiqueta: "Teal profundo", degradado: "linear-gradient(135deg,#004d3e,#171411)" },
] as const;

export function degradadoDe(color: string): string {
  return (COLORES_CASO.find((c) => c.valor === color) ?? COLORES_CASO[0]).degradado;
}

export interface Caso {
  id: string;
  titulo: string;
  cliente: string;
  ano: string;
  metricas: string;
  tag: string;
  color: string;
  orden: number;
  destacado: boolean;
  visible_en_home: boolean;
  imagen_url: string;
}

export function casoVacio(): Omit<Caso, "id"> {
  return {
    titulo: "",
    cliente: "",
    ano: "",
    metricas: "",
    tag: "",
    color: "cobre",
    orden: 0,
    destacado: false,
    visible_en_home: true,
    imagen_url: "",
  };
}

export function casoDesdeFila(f: Record<string, unknown>): Caso {
  return {
    id: texto(f.id),
    titulo: texto(f.titulo),
    cliente: texto(f.cliente),
    ano: texto(f.ano),
    metricas: texto(f.metricas),
    tag: texto(f.tag),
    color: texto(f.color) || "cobre",
    orden: entero(f.orden),
    destacado: f.destacado === true,
    visible_en_home: f.visible_en_home !== false,
    imagen_url: texto(f.imagen_url),
  };
}

export function sanearCaso(entrada: unknown): Validacion<Omit<Caso, "id">> {
  const c = (entrada ?? {}) as Record<string, unknown>;
  const titulo = texto(c.titulo).trim();
  if (!titulo) return { ok: false, error: "El título es obligatorio." };
  const color = texto(c.color);
  if (!COLORES_CASO.some((x) => x.valor === color)) return { ok: false, error: `Color desconocido: ${color}.` };
  return {
    ok: true,
    datos: {
      titulo,
      cliente: texto(c.cliente).trim(),
      ano: texto(c.ano).trim(), // es texto en la base: "2024" o "Continuo"
      metricas: texto(c.metricas).trim(),
      tag: texto(c.tag).trim(),
      color,
      orden: entero(c.orden),
      destacado: c.destacado === true,
      visible_en_home: c.visible_en_home !== false,
      imagen_url: texto(c.imagen_url).trim(),
    },
  };
}

// ─── Solicitudes (tabla solicitudes, las que llegan del formulario del sitio) ─

export const ESTADOS_SOLICITUD = [
  { valor: "nuevo", etiqueta: "Nuevo", clase: "bg-naranjo/15 text-naranjo" },
  { valor: "en_proceso", etiqueta: "En proceso", clase: "bg-cian/15 text-cian-texto" },
  { valor: "ganado", etiqueta: "Ganado", clase: "bg-teal/15 text-teal" },
  { valor: "perdido", etiqueta: "Perdido", clase: "bg-red-500/10 text-red-700 dark:text-red-400" },
  { valor: "cerrado", etiqueta: "Cerrado", clase: "bg-tinta/10 text-gris" },
] as const;
export type EstadoSolicitud = (typeof ESTADOS_SOLICITUD)[number]["valor"];

export const TIPOS_SOLICITUD = [
  { valor: "servicios", etiqueta: "Cotización de servicios" },
  { valor: "arriendo", etiqueta: "Cotización de arriendo" },
  { valor: "general", etiqueta: "Contacto general" },
  { valor: "corporativo", etiqueta: "Contacto corporativo" },
] as const;

export function esEstadoSolicitud(v: unknown): v is EstadoSolicitud {
  return ESTADOS_SOLICITUD.some((e) => e.valor === v);
}

export interface Solicitud {
  id: string;
  tipo: string;
  nombre: string;
  empresa: string;
  email: string;
  telefono: string;
  servicio: string;
  tipo_equipo: string;
  ancho_correa: string;
  mensaje: string;
  estado: EstadoSolicitud;
  notas_internas: string;
  created_at: string;
}

export function solicitudDesdeFila(f: Record<string, unknown>): Solicitud {
  return {
    id: texto(f.id),
    tipo: texto(f.tipo),
    nombre: texto(f.nombre),
    empresa: texto(f.empresa),
    email: texto(f.email),
    telefono: texto(f.telefono),
    servicio: texto(f.servicio),
    tipo_equipo: texto(f.tipo_equipo),
    ancho_correa: texto(f.ancho_correa),
    mensaje: texto(f.mensaje),
    estado: esEstadoSolicitud(f.estado) ? f.estado : "nuevo",
    notas_internas: texto(f.notas_internas),
    created_at: texto(f.created_at),
  };
}

/** El enlace a WhatsApp con el resumen de la solicitud, como en el admin del sitio. */
export function enlaceWhatsAppSolicitud(s: Solicitud): string | null {
  const numero = s.telefono.replace(/\D/g, "");
  if (!numero) return null;
  const tipo = TIPOS_SOLICITUD.find((t) => t.valor === s.tipo)?.etiqueta ?? s.tipo;
  const lineas = [
    `Hola ${s.nombre}, le escribimos de PERTEC por su solicitud (${tipo}).`,
    s.servicio && `Servicio: ${s.servicio}`,
    s.tipo_equipo && `Equipo: ${s.tipo_equipo}`,
    s.ancho_correa && `Ancho de correa: ${s.ancho_correa}`,
  ].filter(Boolean);
  return `https://wa.me/${numero}?text=${encodeURIComponent(lineas.join("\n"))}`;
}

// ─── Configuración de contacto (tabla config, clave → valor) ─────────────────

export interface CampoConfig {
  clave: string;
  etiqueta: string;
  grupo: "WhatsApp" | "Correo";
  formato: "telefono" | "correos" | "texto";
  largo?: boolean;
  ayuda: string;
  porOmision: string;
}

/**
 * Las 9 claves que el sitio lee de la tabla config (shared.jsx, loadWaConfig).
 *
 * `porOmision` es lo que el sitio usa cuando la clave está vacía: dejar un campo
 * en blanco NO lo apaga, vuelve a ese valor.
 */
export const CAMPOS_CONFIG: CampoConfig[] = [
  { clave: "wa_servicios", etiqueta: "WhatsApp · Servicios", grupo: "WhatsApp", formato: "telefono", ayuda: "Recibe las consultas del formulario de contacto en la pestaña Servicios.", porOmision: "56900000000" },
  { clave: "wa_arriendo", etiqueta: "WhatsApp · Arriendo", grupo: "WhatsApp", formato: "telefono", ayuda: "Recibe las consultas de la pestaña Arriendo.", porOmision: "56900000000" },
  { clave: "wa_general", etiqueta: "WhatsApp · General", grupo: "WhatsApp", formato: "telefono", ayuda: "Recibe las consultas de la pestaña General.", porOmision: "56900000000" },
  { clave: "wa_corporativo", etiqueta: "WhatsApp · Corporativo", grupo: "WhatsApp", formato: "telefono", ayuda: "Hoy el sitio no tiene pestaña Corporativo: se guarda pero no se usa.", porOmision: "56900000000" },
  { clave: "wa_fab", etiqueta: "WhatsApp · Botón flotante", grupo: "WhatsApp", formato: "telefono", ayuda: "El botón verde de abajo a la derecha, y el teléfono del pie de página y del bloque de contacto.", porOmision: "56900000000" },
  { clave: "wa_fab_message", etiqueta: "Mensaje del botón WhatsApp", grupo: "WhatsApp", formato: "texto", largo: true, ayuda: "El texto que aparece escrito al abrir el chat desde el botón flotante.", porOmision: "Hola, me gustaría consultar sobre los servicios de PERTEC." },
  { clave: "email_to", etiqueta: "Correo · Destinatarios", grupo: "Correo", formato: "correos", ayuda: "Reciben cada solicitud del formulario web, y es el correo que muestra el sitio. Varios: separados por coma.", porOmision: "comercial@pertec.cl" },
  { clave: "email_subject", etiqueta: "Correo · Asunto pre-llenado", grupo: "Correo", formato: "texto", ayuda: "Hoy el sitio no lo usa.", porOmision: "Consulta desde el sitio web PERTEC" },
  { clave: "email_body", etiqueta: "Correo · Cuerpo pre-llenado", grupo: "Correo", formato: "texto", largo: true, ayuda: "Hoy el sitio no lo usa.", porOmision: "Hola, me gustaría consultar sobre los servicios de PERTEC." },
];

const CORREO = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/;

/**
 * Valida y normaliza los valores de la configuración.
 *
 * Solo se aceptan las 9 claves que el sitio conoce: el admin del sitio guardaba
 * cualquier clave que le llegara. Un teléfono queda en solo dígitos (el sitio arma
 * wa.me/<dígitos> y "+56 9 1234 5678" no sirve tal cual); los correos se revisan uno
 * por uno, porque uno mal escrito deja de recibir las solicitudes sin que nadie se entere.
 */
export function sanearConfig(entrada: Record<string, unknown>): Validacion<Record<string, string>> {
  const salida: Record<string, string> = {};
  for (const campo of CAMPOS_CONFIG) {
    let valor = texto(entrada[campo.clave]).trim();
    if (campo.formato === "telefono" && valor) {
      valor = valor.replace(/\D/g, "");
      if (valor.length < 8 || valor.length > 15) {
        return { ok: false, error: `${campo.etiqueta}: "${texto(entrada[campo.clave]).trim()}" no parece un número. Va con código de país, por ejemplo 56912345678.` };
      }
    }
    if (campo.formato === "correos" && valor) {
      const correos = valor.split(/[,;\s]+/).filter(Boolean);
      const malos = correos.filter((c) => !CORREO.test(c));
      if (malos.length) return { ok: false, error: `${campo.etiqueta}: ${malos.join(", ")} no es un correo válido.` };
      valor = correos.join(", ");
    }
    salida[campo.clave] = valor;
  }
  return { ok: true, datos: salida };
}

// ─── Imágenes ────────────────────────────────────────────────────────────────

/**
 * La ruta dentro del bucket de una URL pública de ese bucket, o null si la URL no
 * es de ese bucket (una imagen externa, o de otro bucket): esas no se borran nunca.
 */
export function rutaEnBucket(url: string, bucket: BucketWeb, baseUrl: string): string | null {
  const prefijo = `${baseUrl.replace(/\/$/, "")}/storage/v1/object/public/${bucket}/`;
  if (!url.startsWith(prefijo)) return null;
  const ruta = decodeURIComponent(url.slice(prefijo.length));
  // Las subidas del sitio y del Core son nombres planos: algo con "/" o ".." no es nuestro.
  return ruta && !ruta.includes("/") && !ruta.includes("..") ? ruta : null;
}

/** Las imágenes que estaban antes y ya no están: las que hay que borrar al guardar. */
export function imagenesQueSobran(antes: string[], despues: string[]): string[] {
  const quedan = new Set(despues);
  return [...new Set(antes)].filter((u) => u && !quedan.has(u));
}

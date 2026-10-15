// Validar y normalizar los datos de una persona: RUT, nombre, correo, teléfono, fechas,
// cuenta bancaria y listas.
//
// Sin "server-only": el formulario la usa para avisar mientras se escribe, y el servidor para
// hacerla cumplir. El servidor no le cree al navegador —una Server Action es un endpoint—, así
// que las mismas funciones corren en los dos lados y lo que el navegador deja pasar, el
// servidor lo vuelve a comprobar.
//
// Cada función devuelve el valor YA NORMALIZADO (teléfono con formato, correo en minúsculas,
// lista con la grafía oficial) o el motivo por el que no sirve, escrito para quien lo tiene que
// corregir: «Faltan dígitos: un número chileno tiene 9», no «formato inválido».

import { CAMPOS_DE_PERSONA, hoyEnChile, type CampoBase, type CampoDePersona } from "./acreditacion-modelo";
import { COMUNAS_POR_REGION, regionDeComuna } from "./chile-comunas";
import { normalizarRut, rutEsValido } from "./rut";

export interface Resultado {
  /** El valor normalizado; null si el campo está vacío o si hay error. */
  valor: string | null;
  error: string | null;
}

const bien = (valor: string | null): Resultado => ({ valor, error: null });
const mal = (error: string): Resultado => ({ valor: null, error });

/** Espacios repetidos y de los bordes, y sin caracteres de control. */
export function limpiarTexto(texto: string): string {
  return texto.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
}

// -----------------------------------------------------------------------------
//  Identidad
// -----------------------------------------------------------------------------

/**
 * El nombre de una persona: al menos nombre y apellido, solo letras.
 *
 * No se cambia la capitalización: «MARCELO MONTES» y «Ana de la Fuente» son ambos legítimos,
 * y una regla de «Title Case» rompe apellidos como «McDonald» o partículas como «de la».
 * Los dígitos sí se rechazan: un nombre con un número casi siempre es un RUT o un teléfono
 * pegado en la columna equivocada.
 */
export function analizarNombre(crudo: string): Resultado {
  const nombre = limpiarTexto(crudo);
  if (!nombre) return mal("Falta el nombre.");
  if (nombre.length > 120) return mal("El nombre es demasiado largo (máximo 120 caracteres).");
  if (!/^[A-Za-zÀ-ÖØ-öø-ÿ][A-Za-zÀ-ÖØ-öø-ÿ\s'’.-]*$/.test(nombre)) {
    return mal("El nombre solo puede llevar letras, espacios, apóstrofes, puntos y guiones (sin números).");
  }
  if (nombre.split(" ").length < 2) return mal("Escribe el nombre y el apellido.");
  return bien(nombre);
}

/**
 * El RUT de una PERSONA, normalizado («12.345.678-5» → «12345678-5»).
 *
 * Además del dígito verificador (rutEsValido), rechaza lo que pasa ese control pero no es de
 * una persona: todos los dígitos iguales (11.111.111-1 es «válido» por módulo 11) y los RUT de
 * 50 millones en adelante, que el SII asigna a empresas.
 */
export function analizarRutDePersona(crudo: string): Resultado {
  if (!crudo.trim()) return mal("Falta el RUT.");
  const rut = normalizarRut(crudo);

  if (!/^\d{7,8}-[0-9K]$/.test(rut)) {
    return mal("El RUT debe tener 7 u 8 dígitos y su dígito verificador (por ejemplo 12.345.678-5).");
  }
  if (!rutEsValido(rut)) {
    return mal("El dígito verificador no corresponde a ese RUT: revisa que esté bien escrito.");
  }
  const cuerpo = rut.split("-")[0];
  if (/^(\d)\1+$/.test(cuerpo)) return mal("Ese RUT no parece real: tiene todos los dígitos iguales.");
  if (Number(cuerpo) >= 50_000_000) return mal("Ese RUT es de una empresa, no de una persona.");
  return bien(rut);
}

// -----------------------------------------------------------------------------
//  Contacto
// -----------------------------------------------------------------------------

/** Dominios mal escritos que se ven a diario. Se corrigen sugiriendo el bueno, no adivinando. */
const DOMINIOS_CON_ERRATA: Record<string, string> = {
  "gmial.com": "gmail.com",
  "gamil.com": "gmail.com",
  "gmai.com": "gmail.com",
  "gmail.cl": "gmail.com",
  "gmail.co": "gmail.com",
  "gmail.con": "gmail.com",
  "hotmial.com": "hotmail.com",
  "hotmal.com": "hotmail.com",
  "hotmail.con": "hotmail.com",
  "outlok.com": "outlook.com",
  "outlook.con": "outlook.com",
  "yaho.com": "yahoo.com",
  "yahooo.com": "yahoo.com",
  "yahoo.con": "yahoo.com",
};

const ETIQUETA_DNS = "[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?";
const CORREO = new RegExp(
  `^[a-z0-9!#$%&'*+/=?^_\`{|}~-]+(?:\\.[a-z0-9!#$%&'*+/=?^_\`{|}~-]+)*@${ETIQUETA_DNS}(?:\\.${ETIQUETA_DNS})+$`,
);

/** Un correo, en minúsculas y sin espacios. */
export function analizarCorreo(crudo: string): Resultado {
  const correo = crudo.trim().toLowerCase();
  if (!correo) return bien(null);

  if (correo.length > 254) return mal("El correo es demasiado largo.");
  if (/\s/.test(correo)) return mal("El correo no puede llevar espacios.");
  if (!correo.includes("@")) return mal("Al correo le falta la @ (por ejemplo nombre@dominio.cl).");
  if (correo.split("@").length !== 2) return mal("El correo solo puede llevar una @.");

  const [local, dominio] = correo.split("@");
  if (!local) return mal("Falta lo que va antes de la @.");
  if (!dominio.includes(".")) return mal("Al dominio le falta el punto (por ejemplo @empresa.cl).");
  if (!CORREO.test(correo) || local.length > 64) {
    return mal("El correo no tiene un formato válido: revisa que no haya puntos seguidos ni caracteres raros.");
  }
  if (!/[a-z]{2,}$/.test(dominio)) return mal("La terminación del dominio no es válida (.cl, .com…).");

  const sugerido = DOMINIOS_CON_ERRATA[dominio];
  if (sugerido) return mal(`«${dominio}» parece un error de tipeo: ¿quisiste escribir ${local}@${sugerido}?`);

  return bien(correo);
}

/**
 * Un teléfono, con el formato de siempre.
 *
 * Chilenos: 9 dígitos que parten con 9 (celular), 2 (Santiago) o el código de zona (32, 41,
 * 55…), con o sin +56. Se guardan como «+56 9 1234 5678». Extranjeros: con + y el código de
 * país, de 8 a 15 dígitos. Sin el +, un número largo es ambiguo y se rechaza en vez de
 * adivinar de qué país es.
 */
export function analizarTelefono(crudo: string): Resultado {
  const texto = crudo.trim();
  if (!texto) return bien(null);

  if (!/^\+?[\d\s().-]+$/.test(texto)) {
    return mal("El teléfono solo puede llevar números, espacios y el + del principio (por ejemplo +56 9 1234 5678).");
  }
  const conMas = texto.startsWith("+");
  const digitos = texto.replace(/\D/g, "");

  // Con + y otro código de país: extranjero.
  if (conMas && !digitos.startsWith("56")) {
    if (digitos.length < 8 || digitos.length > 15) {
      return mal("Un número extranjero lleva entre 8 y 15 dígitos contando el código de país.");
    }
    return bien(`+${digitos}`);
  }

  // Con el 56 delante (con + o escrito de largo completo) se saca para quedar con el nacional.
  let nacional = digitos;
  if (digitos.startsWith("56") && (conMas || digitos.length >= 11)) nacional = digitos.slice(2);

  if (nacional.length < 9) {
    return mal("Faltan dígitos: un número chileno tiene 9 (por ejemplo 9 1234 5678).");
  }
  if (nacional.length > 9) {
    return mal("Sobran dígitos: un número chileno tiene 9. Para uno extranjero, empieza con + y el código de país.");
  }
  if (/^(\d)\1+$/.test(nacional)) return mal("Ese número no parece real: tiene todos los dígitos iguales.");

  const primero = nacional[0];
  if (primero === "9") return bien(`+56 9 ${nacional.slice(1, 5)} ${nacional.slice(5)}`);
  if (primero === "2") return bien(`+56 2 ${nacional.slice(1, 5)} ${nacional.slice(5)}`);
  if (/[3-7]/.test(primero)) {
    return bien(`+56 ${nacional.slice(0, 2)} ${nacional.slice(2, 5)} ${nacional.slice(5)}`);
  }
  return mal("Un número chileno parte con 9 (celular), 2 (Santiago) o el código de zona (32, 41, 55…).");
}

// -----------------------------------------------------------------------------
//  Números
// -----------------------------------------------------------------------------

/** Un número de cuenta: solo dígitos, de 5 a 20 (la Cuenta RUT usa el RUT, de 7 a 9). */
export function analizarCuenta(crudo: string): Resultado {
  const texto = crudo.trim();
  if (!texto) return bien(null);
  if (!/^[\d\s.-]+$/.test(texto)) return mal("El número de cuenta solo puede llevar dígitos.");
  const digitos = texto.replace(/\D/g, "");
  if (digitos.length < 5) return mal("El número de cuenta es muy corto (mínimo 5 dígitos).");
  if (digitos.length > 20) return mal("El número de cuenta es muy largo (máximo 20 dígitos).");
  return bien(digitos);
}

/** Un número dentro de un rango y de a `paso` (el N.º de zapato: 30 a 52, de a media talla). */
export function analizarNumero(campo: CampoBase, crudo: string): Resultado {
  const texto = crudo.trim().replace(",", ".");
  if (!texto) return bien(null);

  const n = Number(texto);
  if (!/^\d+(\.\d+)?$/.test(texto) || !Number.isFinite(n)) return mal(`${campo.etiqueta}: escribe un número.`);

  const { min, max, paso } = campo;
  if (min !== undefined && n < min) return mal(`${campo.etiqueta}: el mínimo es ${min}.`);
  if (max !== undefined && n > max) return mal(`${campo.etiqueta}: el máximo es ${max}.`);
  if (paso !== undefined && Math.abs(n / paso - Math.round(n / paso)) > 1e-9) {
    return mal(`${campo.etiqueta}: va de a ${String(paso).replace(".", ",")} (por ejemplo ${min ?? 0} o ${(min ?? 0) + paso}).`);
  }
  return bien(String(n));
}

// -----------------------------------------------------------------------------
//  Fechas
// -----------------------------------------------------------------------------

/** «AAAA-MM-DD» real (rechaza 2026-02-31). */
export function fechaEsReal(texto: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(texto);
  if (!m) return false;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.toISOString().slice(0, 10) === texto;
}

function sumarAnios(iso: string, anios: number): string {
  const [a, m, d] = iso.split("-").map(Number);
  const f = new Date(Date.UTC(a + anios, m - 1, d));
  // El 29 de febrero de un año que no es bisiesto cae en marzo: se vuelve al último de febrero.
  if (f.getUTCMonth() !== m - 1) f.setUTCDate(0);
  return f.toISOString().slice(0, 10);
}

/** Los años cumplidos de alguien nacido en `nacimiento`, a la fecha `hoy`. */
export function edadEn(nacimiento: string, hoy: string): number {
  const [an, mn, dn] = nacimiento.split("-").map(Number);
  const [ah, mh, dh] = hoy.split("-").map(Number);
  return ah - an - (mh < mn || (mh === mn && dh < dn) ? 1 : 0);
}

const EDAD_MINIMA = 16;
const EDAD_MAXIMA = 85;

/**
 * El rango en que una fecha es creíble, para validar y para que el selector de fecha del
 * navegador ni siquiera deje elegir lo imposible.
 *
 *  · nacimiento: de 16 a 85 años (el trabajo minero parte de los 18, pero un contrato con un
 *    menor entre 16 y 17 con autorización existe, y no es esta pantalla quien lo prohíbe);
 *  · ingreso: desde el 2000 hasta tres años hacia adelante (contratos que parten pronto);
 *  · términos: hasta diez años hacia adelante.
 */
export function rangoDeFecha(campo: string, hoy: string): { min?: string; max?: string } {
  if (campo === "fecha_nacimiento") {
    return { min: sumarAnios(hoy, -EDAD_MAXIMA), max: sumarAnios(hoy, -EDAD_MINIMA) };
  }
  if (campo === "fecha_ingreso") return { min: "2000-01-01", max: sumarAnios(hoy, 3) };
  if (campo === "fecha_termino_1" || campo === "fecha_termino_2") {
    return { min: "2000-01-01", max: sumarAnios(hoy, 10) };
  }
  return {};
}

function analizarFecha(campo: CampoBase, crudo: string, hoy: string): Resultado {
  const texto = crudo.trim();
  if (!texto) return bien(null);
  if (!fechaEsReal(texto)) return mal(`${campo.etiqueta}: la fecha no es válida.`);

  const { min, max } = rangoDeFecha(campo.campo, hoy);
  if (campo.campo === "fecha_nacimiento") {
    const edad = edadEn(texto, hoy);
    if (texto > hoy) return mal("La fecha de nacimiento no puede ser futura.");
    if (edad < EDAD_MINIMA || edad > EDAD_MAXIMA) {
      return mal(`Con esa fecha de nacimiento la persona tendría ${edad} años: debe estar entre ${EDAD_MINIMA} y ${EDAD_MAXIMA}.`);
    }
    return bien(texto);
  }
  if ((min && texto < min) || (max && texto > max)) {
    return mal(`${campo.etiqueta}: la fecha está fuera de lo razonable (entre ${min} y ${max}).`);
  }
  return bien(texto);
}

// -----------------------------------------------------------------------------
//  Listas
// -----------------------------------------------------------------------------

/** Las opciones de una lista, resolviendo las que dependen de otro campo (comuna ← región). */
export function opcionesDeLista(
  campo: CampoBase,
  valores: Record<string, string | null | undefined>,
): readonly string[] {
  if (campo.dependeDe) {
    const padre = valores[campo.dependeDe];
    return (padre && COMUNAS_POR_REGION[padre]) || [];
  }
  return campo.opciones ?? [];
}

/** La grafía oficial de una opción, sin distinguir mayúsculas ni tildes de más: «casado(a)» → «Casado(a)». */
function canonica(opciones: readonly string[], valor: string): string | undefined {
  const quitar = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const buscada = quitar(valor);
  return opciones.find((o) => quitar(o) === buscada);
}

function analizarLista(
  campo: CampoBase,
  crudo: string,
  valores: Record<string, string | null | undefined>,
): Resultado {
  const texto = limpiarTexto(crudo);
  if (!texto) return bien(null);

  if (campo.dependeDe) {
    const padre = CAMPOS_DE_PERSONA.find((c) => c.campo === campo.dependeDe);
    const valorPadre = valores[campo.dependeDe];
    if (!valorPadre) return mal(`${campo.etiqueta}: elige primero ${padre ? padre.etiqueta.toLowerCase() : "el campo anterior"}.`);
    const comunas = COMUNAS_POR_REGION[valorPadre] ?? [];
    const elegida = canonica(comunas, texto);
    if (elegida) return bien(elegida);

    const deOtra = regionDeComuna(texto);
    return mal(
      deOtra
        ? `«${texto}» es una comuna de la región ${deOtra}, no de ${valorPadre}.`
        : `${campo.etiqueta}: «${texto}» no es una comuna de ${valorPadre}. Elige una de la lista.`,
    );
  }

  const elegida = canonica(campo.opciones ?? [], texto);
  if (elegida) return bien(elegida);
  if (campo.permiteOtro) {
    if (texto.length > 80) return mal(`${campo.etiqueta}: el texto es demasiado largo (máximo 80 caracteres).`);
    return bien(texto);
  }
  return mal(`${campo.etiqueta}: «${texto}» no está en la lista. Elige una de las opciones.`);
}

// -----------------------------------------------------------------------------
//  Un campo, y todos los de una persona
// -----------------------------------------------------------------------------

/** Analiza UN campo según su tipo. `valores` trae los demás (la comuna necesita la región). */
export function analizarCampo(
  campo: CampoBase,
  crudo: string,
  contexto: { hoy: string; valores?: Record<string, string | null | undefined> },
): Resultado {
  switch (campo.tipo) {
    case "correo":
      return analizarCorreo(crudo);
    case "telefono":
      return analizarTelefono(crudo);
    case "cuenta":
      return analizarCuenta(crudo);
    case "numero":
      return analizarNumero(campo, crudo);
    case "fecha":
      return analizarFecha(campo, crudo, contexto.hoy);
    case "lista":
      return analizarLista(campo, crudo, contexto.valores ?? {});
    default: {
      const texto = limpiarTexto(crudo);
      if (texto.length > 200) return mal(`${campo.etiqueta}: el texto es demasiado largo (máximo 200 caracteres).`);
      return bien(texto || null);
    }
  }
}

export interface ErrorDeCampo {
  campo: string;
  etiqueta: string;
  mensaje: string;
}

/**
 * Valida todos los datos de una persona y devuelve los normalizados.
 *
 * Un valor que NO cambió respecto de lo guardado se acepta tal cual aunque ya no cumpla la
 * regla: una ficha cargada antes de que existieran las listas dice «Casado» o «Stgo» y no se
 * puede bloquear el guardado de otro dato por algo que alguien escribió hace meses. Se exige
 * lo nuevo, no lo viejo.
 *
 * Las reglas entre campos (la comuna es de la región; los términos no antes del ingreso) se
 * comprueban solo si alguno de los campos involucrados cambió.
 */
export function analizarDatos(
  crudos: Record<string, string | null | undefined>,
  anteriores: Record<string, string | null | undefined>,
  hoy: string = hoyEnChile(),
): { datos: Record<string, string | null>; errores: ErrorDeCampo[] } {
  const datos: Record<string, string | null> = {};
  const errores: ErrorDeCampo[] = [];

  const cambio = (campo: string) => limpiarTexto(crudos[campo] ?? "") !== limpiarTexto(anteriores[campo] ?? "");
  const falla = (c: CampoDePersona, mensaje: string) => errores.push({ campo: c.campo, etiqueta: c.etiqueta, mensaje });

  // Primero los que no dependen de otro, para que la comuna ya encuentre la región normalizada.
  const ordenados = [...CAMPOS_DE_PERSONA].sort((a, b) => Number(Boolean(a.dependeDe)) - Number(Boolean(b.dependeDe)));

  for (const c of ordenados) {
    if (!(c.campo in crudos)) continue;
    const crudo = crudos[c.campo] ?? "";

    // La comuna también se revisa si cambió la región, aunque ella no haya cambiado.
    const sinCambios = c.dependeDe ? !cambio(c.campo) && !cambio(c.dependeDe) : !cambio(c.campo);
    if (sinCambios) {
      datos[c.campo] = limpiarTexto(anteriores[c.campo] ?? "") || null;
      continue;
    }

    const r = analizarCampo(c, crudo, { hoy, valores: datos });
    if (r.error) falla(c, r.error);
    datos[c.campo] = r.valor;
  }

  // Las fechas del contrato, en orden.
  const campoDe = (nombre: string) => CAMPOS_DE_PERSONA.find((c) => c.campo === nombre) as CampoDePersona;
  const hayCambioDeFechas = ["fecha_ingreso", "fecha_termino_1", "fecha_termino_2"].some((f) => cambio(f));
  if (hayCambioDeFechas) {
    const { fecha_ingreso: ing, fecha_termino_1: t1, fecha_termino_2: t2 } = datos;
    if (ing && t1 && t1 < ing) falla(campoDe("fecha_termino_1"), "El término del contrato no puede ser anterior al ingreso.");
    if (t1 && t2 && t2 <= t1) falla(campoDe("fecha_termino_2"), "El término del 2.º contrato tiene que ser posterior al del 1.º.");
    if (ing && !t1 && t2) falla(campoDe("fecha_termino_2"), "Hay un 2.º término sin el del 1.er contrato.");
  }

  return { datos, errores };
}

/** Los errores de varios campos, en una línea legible para el mensaje del formulario. */
export function resumirErrores(errores: ErrorDeCampo[], maximo = 3): string {
  const mostrados = errores.slice(0, maximo).map((e) => (e.mensaje.startsWith(e.etiqueta) ? e.mensaje : `${e.etiqueta}: ${e.mensaje}`));
  const resto = errores.length - mostrados.length;
  return resto > 0 ? `${mostrados.join(" · ")} · y ${resto} más.` : mostrados.join(" · ");
}

// -----------------------------------------------------------------------------
//  Seguimiento
// -----------------------------------------------------------------------------

export function analizarNumeroDePase(crudo: string): Resultado {
  const texto = limpiarTexto(crudo);
  if (!texto) return bien(null);
  if (texto.length > 60) return mal("El número de pase es demasiado largo (máximo 60 caracteres).");
  if (!/^[A-Za-z0-9][A-Za-z0-9\s./-]*$/.test(texto)) {
    return mal("El número de pase solo puede llevar letras, números, espacios, puntos, guiones y barras.");
  }
  return bien(texto);
}

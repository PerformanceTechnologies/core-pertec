// Las listas de opciones de los datos de una persona.
//
// Una lista cerrada existe para que dos personas distintas no escriban lo mismo de dos formas
// —«Casado», «casada», «CASADO(A)»— y para que nadie tenga que INTERPRETAR después qué quiso
// decir «Bco. Estado». Donde el mundo real no cabe en una lista (un banco poco común, una
// nacionalidad que falta) el campo lleva «Otro»: se elige y se escribe, en vez de forzar una
// opción equivocada.
//
// Sin "server-only": las usan el formulario y el servidor, que es quien las hace cumplir.

export const ESTADOS_CIVILES = [
  "Soltero(a)",
  "Casado(a)",
  "Conviviente civil",
  "Separado(a)",
  "Divorciado(a)",
  "Viudo(a)",
] as const;

export const NACIONALIDADES = [
  "Chilena",
  "Argentina",
  "Boliviana",
  "Brasileña",
  "Colombiana",
  "Cubana",
  "Ecuatoriana",
  "Española",
  "Haitiana",
  "Paraguaya",
  "Peruana",
  "Uruguaya",
  "Venezolana",
] as const;

/** Los bancos y emisores de cuentas más usados en Chile, para el pago de remuneraciones. */
export const BANCOS = [
  "Banco de Chile",
  "BancoEstado",
  "Banco Santander",
  "Banco BCI",
  "Banco Itaú",
  "Scotiabank",
  "Banco Security",
  "Banco BICE",
  "Banco Falabella",
  "Banco Ripley",
  "Banco Consorcio",
  "Banco Internacional",
  "Banco BTG Pactual",
  "Coopeuch",
  "Tenpo",
  "Mercado Pago",
  "Mach",
] as const;

export const TIPOS_DE_CUENTA = ["Cuenta Corriente", "Cuenta Vista", "Cuenta RUT", "Cuenta de Ahorro"] as const;

/**
 * Las isapres: las abiertas y las cerradas (de empresa) que aparecen en una faena minera.
 *
 * Los nombres son los que ya se venían guardando —«Isalud» y no «Isalud Isapre de Codelco»—,
 * para que las fichas cargadas sigan coincidiendo con la lista. Lo que ayuda a encontrarlas
 * va aparte, en DETALLE_DE_ISAPRE.
 */
export const ISAPRES = [
  "Banmédica",
  "Colmena",
  "Consalud",
  "Cruz Blanca",
  "Cruz del Norte",
  "Esencial",
  "Fundación BancoEstado",
  "Isalud",
  "Nueva Masvida",
  "Vida Tres",
] as const;

/** Lo que se lee debajo del nombre en el buscador, y por lo que también se puede buscar. */
export const DETALLE_DE_ISAPRE: Partial<Record<(typeof ISAPRES)[number], string>> = {
  Isalud: "Isapre de Codelco",
  "Cruz del Norte": "Isapre cerrada",
  "Fundación BancoEstado": "Isapre cerrada",
};

/** El primer paso del campo: a qué sistema cotiza. «Isapre» abre la lista de arriba. */
export const SISTEMAS_DE_SALUD = ["Fonasa", "Isapre", "Capredena / Dipreca", "No cotiza salud"] as const;

/**
 * Lo que se guarda en la columna: el sistema o, si es isapre, cuál. Una sola columna a
 * propósito: la exportación a Excel y la importación la leen tal cual, y «Banmédica» ya dice
 * que es isapre.
 */
export const PREVISIONES_DE_SALUD = [
  "Fonasa",
  ...ISAPRES,
  "Capredena / Dipreca",
  "No cotiza salud",
] as const;

/** Las siete AFP vigentes, más IPS para quien sigue en el sistema antiguo. */
export const AFP = ["Capital", "Cuprum", "Habitat", "Modelo", "PlanVital", "ProVida", "Uno", "IPS (sistema antiguo)"] as const;

/**
 * El vínculo con el contacto de emergencia. Con «otro» escribible: la lista cubre lo común, no
 * todas las familias.
 */
export const PARENTESCOS = [
  "Cónyuge",
  "Conviviente",
  "Pareja",
  "Madre",
  "Padre",
  "Hijo(a)",
  "Hermano(a)",
  "Abuelo(a)",
  "Tío(a)",
  "Primo(a)",
  "Amigo(a)",
] as const;

export const TALLAS_DE_POLERA = ["XS", "S", "M", "L", "XL", "XXL", "XXXL", "4XL"] as const;

/** Tallas numéricas de pantalón de trabajo, de a dos. */
export const TALLAS_DE_PANTALON = [
  "36",
  "38",
  "40",
  "42",
  "44",
  "46",
  "48",
  "50",
  "52",
  "54",
  "56",
  "58",
  "60",
] as const;

export const FAENAS = ["CCH"] as const;

export const TURNOS = ["4x3", "5x2", "7x7", "10x10", "14x14", "Art. 22"] as const;

export const ESTADOS_DE_PASE = ["Sin solicitar", "Solicitado", "Vigente", "Vencido", "Rechazado"] as const;

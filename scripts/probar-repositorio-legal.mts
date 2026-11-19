// Pruebas de las reglas puras del Repositorio Legal (lib/repositorio-legal/modelo.ts).
// Nombres de ejemplo inventados: el repo es público.
import assert from "node:assert/strict";
import {
  armarDocumentos,
  calcularEstado,
  cifrasDe,
  ocultoEnElCore,
  requierenAtencion,
  documentosClave,
  fechasDelNombre,
  nombreAlSubir,
  nombreDeSociedad,
  puedeEnRepositorio,
  puedeVerDocumento,
  reconocerTipo,
  sociedadesDe,
  TIPO_POR_ID,
  tituloSinFechas,
  type ArchivoCrudo,
} from "../lib/repositorio-legal/modelo";
import { cortarEnPalabra, limpiarNombre, planDeOrden, resumirPlan } from "../lib/repositorio-legal/orden";

const hoy = new Date("2026-11-19T12:00:00");

// Fechas leídas del nombre
assert.deepEqual(fechasDelNombre("Certificado E-RUT Empresa - Emitido 26-09-2024.pdf"), { emision: "2024-09-26", vence: null });
assert.equal(fechasDelNombre("Copia Inscripcion Registro de Comercio - Vigente al 19-05-2025.pdf").emision, "2025-05-19");
assert.equal(fechasDelNombre("Balance General - Ejercicio Comercial 2024.pdf").emision, "2024-12-31");
assert.equal(fechasDelNombre("Formulario 22 Renta - Año Tributario 2025.pdf").emision, "2025-04-30");
assert.equal(fechasDelNombre("Formulario 29 IVA - Agosto 2025.pdf").emision, "2025-08-31");
assert.equal(fechasDelNombre("Vigencia Sociedad RES 16102024.pdf").emision, "2024-10-16");
assert.equal(fechasDelNombre("1. Constitución Ejemplo SpA (8.5.25).pdf").emision, "2025-05-08");
assert.equal(fechasDelNombre("PATENTE PROVISORIA (vence julio 2025).pdf").vence, "2025-07-31");
assert.deepEqual(fechasDelNombre("Patente - Emitido 01-08-2025 - Vence 31-07-2026.pdf"), { emision: "2025-08-01", vence: "2026-07-31" });
assert.equal(fechasDelNombre("Constitucion Sociedad.pdf").emision, null);

// Tipos
assert.equal(reconocerTipo("Escritura Saneamiento Constitucion Sociedad - Otorgada 05-07-2022.pdf").id, "saneamiento");
assert.equal(reconocerTipo("Certificado de Vigencia Sociedad (No Disolucion).pdf").id, "certificado-vigencia");
assert.equal(reconocerTipo("Copia Inscripcion Registro de Comercio - Vigente al 19-05-2025.pdf").id, "inscripcion-vigente");
assert.equal(reconocerTipo("Escritura Constitucion Sociedad por Acciones.pdf").id, "constitucion");
assert.equal(reconocerTipo("Carta Poder SII - 2022.pdf").id, "poder");
assert.equal(reconocerTipo("Contrato de Trabajo - Persona - 16-06-2023.pdf").id, "laboral");
assert.equal(reconocerTipo("RUT y Claves de Acceso SII.xlsx").restringido, true);

// Sociedades por carpeta
assert.equal(nombreDeSociedad("Legales EJEMPLO UNO SPA"), "Ejemplo Uno SpA");
assert.equal(nombreDeSociedad("CONSTITUCION OTRA"), "Otra");

// Vigencia
assert.equal(calcularEstado(TIPO_POR_ID["certificado-vigencia"], "2026-10-01", "2026-11-30", hoy), "por_vencer");
assert.equal(calcularEstado(TIPO_POR_ID["certificado-vigencia"], "2025-01-01", "2025-03-02", hoy), "vencido");
assert.equal(calcularEstado(TIPO_POR_ID["constitucion"], "2022-05-19", null, hoy), "no_vence");
assert.equal(calcularEstado(TIPO_POR_ID["constitucion"], null, null, hoy), "sin_fecha");

// Armado: copias, histórico y documentos clave
const a = (id: string, ruta: string, hash: string | null = null): ArchivoCrudo => ({ id, nombre: ruta.split("/").pop()!, ruta, tamano: 1, modificado: "", modificadoPor: null, webUrl: null, hash });
const soc = sociedadesDe(["Legales EJEMPLO UNO SPA", "Legales OTRA COSA LIMITADA"]);
const docs = armarDocumentos(
  [
    a("1", "SOCIEDADES/Legales EJEMPLO UNO SPA/Certificado de Vigencia Sociedad - Emitido 01-01-2025.pdf"),
    a("2", "SOCIEDADES/Legales EJEMPLO UNO SPA/Certificado de Vigencia Sociedad - Emitido 01-11-2026.pdf", "h1"),
    a("3", "SOLICITUDES DE ANTECEDENTES/BANCO/Certificado de Vigencia Sociedad - Emitido 01-11-2026.pdf", "h1"),
    a("4", "SOLICITUDES DE ANTECEDENTES/BANCO/Estatutos EU - Otorgada 01-01-2020.pdf"),
    a("5", "SOCIEDADES/Legales OTRA COSA LIMITADA/Escritura Constitucion - Otorgada 01-02-2021.pdf"),
  ],
  soc,
  hoy,
);
const porId = Object.fromEntries(docs.map((d) => [d.id, d]));
assert.equal(porId["1"].estado, "historico");
assert.equal(porId["2"].estado, "vigente");
assert.equal(porId["3"].copiaDe, "2");
assert.equal(porId["3"].area, "solicitudes");
assert.equal(porId["3"].paquete, "BANCO");
assert.equal(porId["4"].sociedad, "ejemplo-uno-spa"); // por la sigla «EU»
assert.equal(porId["5"].sociedad, "otra-cosa-limitada");
const clave = documentosClave(docs, "ejemplo-uno-spa");
assert.equal(clave.find((c) => c.tipo.id === "certificado-vigencia")?.estado, "ok");
assert.equal(clave.find((c) => c.tipo.id === "erut")?.estado, "falta");

// Nombre al subir
assert.equal(nombreAlSubir({ titulo: "Certificado de vigencia", emision: "2026-11-19", extension: "PDF" }), "Certificado de vigencia - Emitido 19-11-2026.pdf");
assert.equal(tituloSinFechas("Certificado de vigencia - Emitido 19-11-2026 (copia).pdf"), "Certificado de vigencia");

// Permisos
assert.equal(puedeEnRepositorio("usuario", "visualizador", "subir"), false);
assert.equal(puedeEnRepositorio("usuario", "usuario", "subir"), true);
assert.equal(puedeEnRepositorio("usuario", "usuario", "editar"), false);
assert.equal(puedeEnRepositorio("usuario", "especial", "editar"), true);
assert.equal(puedeEnRepositorio("admin", "visualizador", "confidencial"), true);
assert.equal(puedeVerDocumento({ confidencial: true, restringido: false }, "usuario", "especial"), false);
assert.equal(puedeVerDocumento({ confidencial: true, restringido: false }, "usuario", "admin"), true);
assert.equal(puedeVerDocumento({ confidencial: false, restringido: true }, "usuario", "admin"), false);

// Cifras con la misma regla que las alertas: sin copias, con sociedad y sin reemplazados.
const conHuerfano = armarDocumentos(
  [
    a("10", "SOCIEDADES/Legales EJEMPLO UNO SPA/Certificado de Vigencia Sociedad - Emitido 01-01-2025.pdf", "x1"),
    a("11", "SOLICITUDES DE ANTECEDENTES/BANCO/Certificado de Vigencia Sociedad - Emitido 01-01-2025.pdf", "x1"),
    a("12", "SOLICITUDES DE ANTECEDENTES/OTRO/Formulario 29 IVA - Enero 2023.pdf"),
    a("13", "SOLICITUDES DE ANTECEDENTES/OTRO/Formulario 29 IVA - Febrero 2023.pdf"),
  ],
  soc,
  hoy,
);
const c = cifrasDe(conHuerfano);
assert.equal(c.vencidos, 1, "los F29 sin sociedad y la copia no cuentan");
assert.equal(c.vencidos, requierenAtencion(conHuerfano).filter((d) => d.estado === "vencido").length, "la cifra calza con la lista de alertas");

// La malla societaria no se muestra en el Core.
assert.equal(ocultoEnElCore({ tipo: "malla", ruta: "Malla Societaria/Malla.png" }), true);
assert.equal(ocultoEnElCore({ tipo: "otro", ruta: "SOLICITUDES DE ANTECEDENTES/X/Malla Societaria/Estructura.docx" }), true);
assert.equal(ocultoEnElCore({ tipo: "constitucion", ruta: "SOCIEDADES/Legales X/Estatutos.pdf" }), false);

// Fecha ISO (no se lee «25-10-08» como 2008)
assert.equal(fechasDelNombre("Imagen de WhatsApp 2025-10-08 a las 16.33.33.jpg").emision, "2025-10-08");

// Ordenar: copias, vacíos, no legal, nombre desde la copia mejor descrita, renombrar sociedad y estabilidad
const crudos: ArchivoCrudo[] = [
  a("o1", "SOCIEDADES/Legales EJEMPLO UNO SPA/MOD. Inscripcion. EU.pdf", "m1"),
  a("o2", "SOLICITUDES DE ANTECEDENTES/ABOGADO/Copia Inscripcion Registro de Comercio - Modificacion Estatutos - 15-06-2022.pdf", "m1"),
  a("o3", "SOLICITUDES DE ANTECEDENTES/BANCO/Formulario 29 IVA - Agosto 2025.pdf", "f1"),
  a("o4", "SOCIEDADES/Legales EJEMPLO UNO SPA/vacio.txt", "e"),
  a("o5", "SOCIEDADES/Legales OTRA COSA LIMITADA/vacio.txt", "e"),
  a("o6", "SOLICITUDES DE ANTECEDENTES/BANCO/Cotizacion 123 Cliente.pdf", "c1"),
  a("o7", "Malla Societaria/Malla.png", "mm"),
  a("o8", "SOLICITUDES DE ANTECEDENTES/X/Malla Societaria/Organigrama.png", "mm"),
];
crudos.find((x) => x.id === "o4")!.tamano = 0;
crudos.find((x) => x.id === "o5")!.tamano = 0;
const docsOrden = armarDocumentos(crudos, soc, hoy, "ejemplo-uno-spa");
const plan = planDeOrden(docsOrden, soc, { carpetas: { "ejemplo-uno-spa": "Ejemplo Nuevo SpA" } });
const op = Object.fromEntries(plan.map((o) => [o.id, o]));
assert.equal(op.o2.accion, "eliminar");
assert.equal(op.o1.accion, "mover");
assert.equal(op.o1.destino, "SOCIEDADES/Ejemplo Nuevo SpA/Constitución y estatutos", "renombrar la sociedad = otra carpeta");
assert.match(op.o1.nombre!, /Emitido 15-06-2022\.pdf$/, "la fecha sale de la copia mejor descrita");
assert.equal(op.o3.nombre, "F29 IVA - Agosto 2025.pdf");
assert.equal(op.o3.destino, "SOCIEDADES/Ejemplo Nuevo SpA/SII y tributario");
assert.equal(op.o4.accion, "eliminar");
assert.match(op.o4.motivo, /vacío/);
assert.equal(op.o6.accion, "revisar");
assert.equal(op.o7.accion, "mantener");
assert.equal(op.o8.accion, "eliminar", "la copia de la malla se va");
assert.equal(resumirPlan(plan).eliminar, 4);
assert.equal(cortarEnPalabra("Liquidaciones de Remuneracion - Persona - Marzo 2024 a Marzo 2025", 60), "Liquidaciones de Remuneracion - Persona - Marzo 2024 a Marzo");
assert.equal(limpiarNombre("Certificado E-RUT EJEMPLO UNO SPA - Emitido 26-09-2024 (copia 2)", soc[0]), "Certificado E-RUT");

console.log("probar-repositorio-legal: todo OK");

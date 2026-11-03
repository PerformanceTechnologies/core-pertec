// Pruebas puras de Contactos: qué falta para facturar (reglas del SII), comunas, RUT y la
// traducción desde Odoo (exclusiones, fusión de duplicados, personas de contacto).
import assert from "node:assert/strict";
import {
  bloqueReceptor,
  coincideBusqueda,
  comunaOficial,
  contactosDesdeOdoo,
  faltantesParaFacturar,
  correoMinuscula,
  iniciales,
  listoParaFacturar,
  nombrePropio,
  pasaFiltro,
  rutUsable,
  type Contacto,
  type DatosContacto,
  type FilaOdoo,
} from "../lib/contactos-modelo";

const base: DatosContacto = {
  rut: "76086428-5",
  tipoPersona: "empresa",
  razonSocial: "Minera de Prueba SpA",
  giro: "Extracción de minerales",
  direccion: "Av. Apoquindo 3000, of. 501",
  comuna: "Las Condes",
  ciudad: "Santiago",
  pais: "Chile",
  tipoContribuyente: "primera_categoria",
  correoDte: "dte@minera.cl",
  correo: null,
  telefono: null,
  esCliente: true,
  esProveedor: false,
  plazoPagoDias: 30,
  notas: null,
};

// RUT: dígito verificador y rango del SII (100.000 a 99 millones).
assert.ok(rutUsable("76.086.428-5"));
assert.ok(!rutUsable("76.086.428-4"), "dígito verificador malo");
assert.ok(!rutUsable("00000000-0"), "el relleno de Odoo cuadra el DV pero no es un RUT");

// Listo para facturar: los cinco obligatorios del SII (factura 33/34).
assert.deepEqual(faltantesParaFacturar(base), []);
assert.ok(listoParaFacturar(base));
const sinNada = { ...base, rut: null, giro: null, direccion: null, comuna: null, correoDte: null };
assert.deepEqual(
  faltantesParaFacturar(sinNada).map((f) => [f.campo, f.bloquea]),
  [["rut", true], ["giro", true], ["direccion", true], ["comuna", true], ["correoDte", false]],
);
assert.ok(!listoParaFacturar(sinNada));
// El correo DTE es recomendación, no bloquea.
assert.ok(listoParaFacturar({ ...base, correoDte: null }));
// Giro de más de 40 (límite del XML) y comuna que no existe.
assert.match(faltantesParaFacturar({ ...base, giro: "x".repeat(41) })[0].texto, /40/);
assert.match(faltantesParaFacturar({ ...base, comuna: "PProvidencia" })[0].texto, /no es una comuna/);
// Un extranjero no lleva RUT chileno ni comuna oficial; en la factura va 55555555-5.
const extranjero = { ...base, rut: null, tipoContribuyente: "extranjero" as const, comuna: "Lima", pais: "Perú" };
assert.ok(listoParaFacturar(extranjero));
assert.equal(bloqueReceptor(extranjero).rut, "55555555-5");

// El bloque del receptor respeta los largos del SII y arma el «Atención A:».
const r = bloqueReceptor({ ...base, giro: "y".repeat(60) }, { nombre: "Ana Pérez", telefono: "+56 9 1111 2222", correo: null });
assert.equal(r.giro?.length, 40);
assert.equal(r.contacto, "Ana Pérez · +56 9 1111 2222");

// Comunas: sin tildes ni mayúsculas, al nombre oficial.
assert.equal(comunaOficial("estacion central"), "Estación Central");
assert.equal(comunaOficial("MAIPU"), "Maipú");
assert.equal(comunaOficial("Valparaiso"), "Valparaíso");
assert.equal(comunaOficial("Miami"), null);

assert.equal(iniciales("Compañía Minera Mantos de Oro"), "CM");
assert.equal(iniciales("ARELEKTRIC SPA"), "A");

// Búsqueda por RUT con o sin puntos, y por comuna sin tildes.
const c: Contacto = { ...base, id: "x", activo: true, odooId: null, odooIds: [], creadoPor: null, actualizadoPor: null, creadoEn: "", actualizadoEn: "" };
assert.ok(coincideBusqueda(c, "76.086.428"));
assert.ok(coincideBusqueda(c, "las condes"));
assert.ok(!coincideBusqueda(c, "antofagasta"));
assert.ok(pasaFiltro(c, "clientes") && !pasaFiltro(c, "proveedores") && !pasaFiltro(c, "por_completar"));
assert.ok(pasaFiltro({ ...c, activo: false }, "archivados") && !pasaFiltro({ ...c, activo: false }, "todos"));

// ---------- Nombre Propio ---------------------------------------------------------

const np = (x: string) => nombrePropio(x, { siempre: true });
// La sociedad y las siglas conocidas, los conectores en minúscula y la primera palabra siempre con mayúscula.
assert.equal(np("ADMINISTRADORA DE COMBUSTIBLE CANTAGALLO"), "Administradora de Combustible Cantagallo");
assert.equal(np("MINERA DE LOS ANDES SPA"), "Minera de los Andes SpA");
assert.equal(np("MINERA LOS ANDES SPA"), "Minera Los Andes SpA", "el artículo es parte del nombre");
assert.equal(np("VILLAR HERMANOS S.A."), "Villar Hermanos S.A.");
assert.equal(np("COMERCIAL XYZ LTDA."), "Comercial Xyz Ltda.");
assert.equal(np("comercial xyz ltda"), "Comercial Xyz Ltda.");
assert.equal(np("ARELEKTRIC SPA."), "Arelektric SpA.");
assert.equal(np("EDUARDO CHACON E.I.R.L."), "Eduardo Chacon E.I.R.L.");
assert.equal(np("DE LA PAZ Y COMPAÑIA"), "De la Paz y Compañia");
assert.equal(np("MINERA LAS CENIZAS S.A."), "Minera Las Cenizas S.A.");
assert.equal(np("GPS CHILE"), "GPS Chile");
assert.equal(np("BCI SEGUROS"), "BCI Seguros");
assert.equal(np("D&C INGENIERIA"), "D&C Ingenieria");
// Direcciones: números y códigos en mayúscula, abreviaturas con su inicial, «O'Higgins».
assert.equal(np("AV. LIBERTADOR BERNARDO O'HIGGINS 2259 OF. 501"), "Av. Libertador Bernardo O'Higgins 2259 Of. 501");
assert.equal(np("RUTA E-30-F S/N°"), "Ruta E-30-F S/N°");
assert.equal(np("PARCELA 5 13 LOTE YALQUINCHA P5-L36"), "Parcela 5 13 Lote Yalquincha P5-L36");
assert.equal(np("AV VENTISQUERO 1204 MOD 55 WORK CENTER VESPUCIO"), "Av Ventisquero 1204 Mod 55 Work Center Vespucio");
assert.equal(np("LOS CARRERA N°6651"), "Los Carrera N°6651");
assert.equal(np("SOC CONCESIONARIA AUTOPISTA CENTRAL S A"), "Soc Concesionaria Autopista Central S.A.");
assert.equal(np("SQM INDUSTRIAL S. A."), "SQM Industrial S.A.");
assert.equal(np("D&C SERVICIOS A LA MINERIA SPA"), "D&C Servicios a la Mineria SpA");
assert.equal(np("Grafica24 Limitada"), "Grafica24 Limitada");
assert.equal(np("Import and Export Specialized Equipment and Services Inc."), "Import and Export Specialized Equipment and Services Inc.");
// En un texto que ya mezcla, una sigla corta es a propósito (MLA, CHM); en uno todo en mayúscula no hay forma de saberlo.
assert.equal(np("Ingeniero en Confiabilidad – MLA"), "Ingeniero en Confiabilidad – MLA");
assert.equal(np("Sociedad de Servicios e Inversiones CHM SPA"), "Sociedad de Servicios e Inversiones CHM SpA");
assert.equal(np("INGENIERO EN CONFIABILIDAD MLA"), "Ingeniero en Confiabilidad Mla");
// Un correo (Odoo lo usa de nombre) sigue siendo un correo; no se inventan tildes.
assert.equal(np("Javier.M.Palma@FluorSalfa.com"), "javier.m.palma@fluorsalfa.com");
assert.equal(np("JOSÉ PEREZ"), "José Perez");
assert.equal(correoMinuscula(" Cvalderrama@Loval.cl; "), "cvalderrama@loval.cl");
// Sin `siempre` solo se toca lo que está TODO en mayúscula o TODO en minúscula: lo mezclado se respeta.
assert.equal(nombrePropio("MINERA DE LOS ANDES SPA"), "Minera de los Andes SpA");
assert.equal(nombrePropio("juan pérez soto"), "Juan Pérez Soto");
assert.equal(nombrePropio("Minera de los Andes SpA"), "Minera de los Andes SpA");
assert.equal(nombrePropio("McKenzie y Asociados"), "McKenzie y Asociados");
assert.equal(nombrePropio("  Compañía   Minera  "), "Compañía Minera");
assert.equal(nombrePropio(""), "");
// En una dirección, «AV» y «OF» son abreviaturas aunque el resto ya esté bien escrito.
assert.equal(nombrePropio("AV Los Leones N°927, Santiago", { siempre: true, direccion: true }), "Av Los Leones N°927, Santiago");
assert.equal(nombrePropio("14 de Febrero N°2065 OF 103", { siempre: true, direccion: true }), "14 de Febrero N°2065 Of 103");
assert.equal(nombrePropio("Ingeniero en Confiabilidad – MLA", { siempre: true, direccion: true }), "Ingeniero en Confiabilidad – Mla");
// Es estable: pasarlo dos veces da lo mismo.
// Más direcciones reales: números al comienzo, «Of.» de oficina, artículos de calle, comas pegadas y romanos.
assert.equal(np("14 DE FEBRERO N°2065 OF 103"), "14 de Febrero N°2065 Of 103");
assert.equal(np("AV LA DEHESA 1201 O- 814"), "Av La Dehesa 1201 O- 814");
assert.equal(np("AV. LOS CONQUISTADORES N°1700, PISO 13 OF. A"), "Av. Los Conquistadores N°1700, Piso 13 Of. A");
assert.equal(np("De La Foresta 3556,La Florida"), "De la Foresta 3556,La Florida");
assert.equal(np("AVENIDA JUAN DE LA FUENTE 455"), "Avenida Juan de la Fuente 455");
assert.equal(np("ROGER DE FLOR 2725 OF 1001 PS 10"), "Roger de Flor 2725 Of 1001 Ps 10");
assert.equal(np("PJ ALUMINIO 4129 LA ARBOLEDA II"), "Pj Aluminio 4129 La Arboleda II");
assert.equal(np("AV.E.PEREZ ZUJOVIC 5030"), "Av.E.Perez Zujovic 5030");
for (const x of ["MINERA LOS ANDES SPA", "AV. LAS CONDES 123 OF. 4", "pedro@x.cl", "D.M.G. SERVICIOS"]) assert.equal(np(np(x)), np(x));

// ---------- Desde Odoo ----------------------------------------------------------

const fila = (x: Partial<FilaOdoo> & { id: number; name: string }): FilaOdoo => ({
  active: true, is_company: true, parent_id: false, type: "contact", vat: false, l10n_cl_sii_taxpayer_type: false,
  l10n_cl_activity_description: false, l10n_cl_dte_email: false, street: false, street2: false, city: false,
  country_id: [46, "Chile"], email: false, phone: false, function: false, customer_rank: 0, supplier_rank: 0,
  property_payment_term_id: false, employee_ids: [], ...x,
});

const { contactos, omitidos } = contactosDesdeOdoo(
  [
    fila({ id: 1, name: "PERFORMANCE TECHNOLOGIES SPA", vat: "77590967-6" }),
    fila({ id: 2, name: "OdooBot", active: false, is_company: false }),
    fila({ id: 3, name: "Hugo", is_company: false, email: "hugo@pertec.cl" }),
    // Tres fichas del mismo RUT: manda la más completa, las otras quedan en notas.
    fila({ id: 10, name: "ELECTRICA SPA", vat: "96814370-0", city: "Puchuncavi", customer_rank: 1 }),
    fila({ id: 11, name: "Eléctrica SpA", vat: "96.814.370-0", street: "Presidente Riesco 5711", city: "Las Condes", l10n_cl_activity_description: "Energía eléctrica", l10n_cl_sii_taxpayer_type: "1" }),
    fila({ id: 12, name: "ELECTRICA SPA", vat: "968143700", supplier_rank: 1, property_payment_term_id: [4, "30 Days"] }),
    fila({ id: 20, name: "Ana Soto", is_company: false, parent_id: [12, "ELECTRICA SPA"], email: "ana@electrica.cl", function: "Compras" }),
    fila({ id: 21, name: "96.814.370-0", is_company: false, parent_id: [11, "Eléctrica SpA"] }),
    // Persona suelta: se cuelga por el dominio del correo.
    fila({ id: 30, name: "pedro@electrica.cl", is_company: false, email: "pedro@electrica.cl" }),
    fila({ id: 31, name: "alguien@gmail.com", is_company: false, email: "alguien@gmail.com" }),
    // RUT de relleno: queda sin RUT y con la nota.
    fila({ id: 40, name: "Municipalidad", vat: "000000000", supplier_rank: 1 }),
    fila({ id: 41, name: "prueba", supplier_rank: 1 }),
  ],
  [1],
);

assert.deepEqual(contactos.map((x) => x.razonSocial), ["Eléctrica SpA", "Municipalidad"]);
assert.equal(
  contactosDesdeOdoo([fila({ id: 90, name: "ASESORIAS LOS ROBLES LTDA.", vat: "76.000.001-K", street: "AV. APOQUINDO 3000", city: "LAS CONDES", l10n_cl_activity_description: "VENTA DE ARTICULOS", email: "Ventas@Robles.CL" })], []).contactos[0].direccion,
  "Av. Apoquindo 3000",
);
const e = contactos[0];
assert.equal(e.rut, "96814370-0");
assert.deepEqual(e.odooIds, [10, 11, 12]);
assert.equal(e.odooId, 11, "manda la ficha más completa");
assert.equal(e.comuna, "Las Condes");
assert.equal(e.direccion, "Presidente Riesco 5711");
assert.equal(e.giro, "Energía Eléctrica");
assert.ok(e.esCliente && e.esProveedor, "cliente en una ficha y proveedor en otra");
assert.equal(e.plazoPagoDias, 30);
assert.match(e.notas ?? "", /Otra dirección en Odoo: Puchuncavi/);
assert.deepEqual(e.personas.map((p) => [p.nombre, p.principal]), [["Ana Soto", true], ["pedro@electrica.cl", false]]);
assert.ok(listoParaFacturar(e));

const m = contactos[1];
assert.equal(m.rut, null);
assert.match(m.notas ?? "", /no válido/);

const motivos = Object.fromEntries(omitidos.map((o) => [o.odooId, o.motivo]));
assert.equal(motivos[1], "Empresa propia");
assert.equal(motivos[2], "Usuario de sistema de Odoo");
assert.equal(motivos[3], "Personal de PERTEC");
assert.equal(motivos[41], "Ficha de prueba");
assert.match(motivos[31], /sin RUT ni empresa/);
assert.match(motivos[21], /Duplicado o sin datos/);

console.log("Todas las verificaciones de Contactos pasaron.");

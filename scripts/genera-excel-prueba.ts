/**
 * Genera una planilla de rendición de prueba para validarla con LibreOffice.
 *
 *   NODE_OPTIONS="--conditions=react-server" npx tsx scripts/genera-excel-prueba.ts <dir> <salida.xlsx>
 *
 * La condición react-server es necesaria porque lib/rendidor/excel.ts importa
 * "server-only", que fuera de Next lanza al cargarse; con esa condición resuelve
 * al módulo vacío que el propio paquete provee para el runtime de servidor.
 *
 * No toca la base ni Odoo: arma una Rendición sintética en memoria. Sirve para
 * comprobar que el libro abre sin errores de fórmula y que los cuadros cuadran,
 * que es lo que el skill de xlsx exige antes de entregar cualquier .xlsx.
 */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { construirLibroRendicion, type RespaldoParaExcel } from "../lib/rendidor/excel";
import type { GastoRendicion, Rendicion } from "../lib/rendidor/tipos";

const [dirBoletas, salida] = process.argv.slice(2);
if (!dirBoletas || !salida) {
  console.error("Uso: npx tsx scripts/genera-excel-prueba.ts <dir-con-boletas> <salida.xlsx>");
  process.exit(1);
}

const imagenes = readdirSync(dirBoletas)
  .filter((n) => /\.(jpe?g|png)$/i.test(n))
  .sort();

// Casos que importan: un afecto con desglose, un exento, y uno con campos
// ilegibles — los tres caminos distintos de la tabla tributaria.
const base: Omit<GastoRendicion, "id" | "orden">[] = [
  {
    fecha: "2026-08-01",
    proveedor: "Copec S.A.",
    rutProveedor: "99.520.000-7",
    numeroDocumento: "1234567",
    tipoDocumento: "boleta_electronica",
    detalle: "Combustible 42,5 litros, camioneta PPU ABCD-12",
    categoria: "Combustible",
    neto: 42017,
    iva: 7983,
    total: 50000,
    pendientes: [],
    archivoNombre: "copec.jpg",
    archivoPath: "",
    archivoTipo: "image/jpeg",
    odooExpenseId: null,
    odooPartnerId: null,
  },
  {
    fecha: "2026-08-02",
    proveedor: "Pullman Bus",
    rutProveedor: "96.678.560-8",
    numeroDocumento: "A-889",
    tipoDocumento: "pasaje_terrestre",
    detalle: "Pasaje Calama - Antofagasta, 1 persona",
    categoria: "Transporte",
    neto: 18000,
    iva: 0,
    total: 18000,
    pendientes: [],
    archivoNombre: "pullman.jpg",
    archivoPath: "",
    archivoTipo: "image/jpeg",
    odooExpenseId: null,
    odooPartnerId: null,
  },
  {
    fecha: null,
    proveedor: "Uber",
    rutProveedor: null,
    numeroDocumento: null,
    tipoDocumento: "comprobante_transporte_app",
    detalle: "Viaje en Uber",
    categoria: "Transporte",
    neto: 4116,
    iva: 782,
    total: 4898,
    pendientes: ["fecha", "rutProveedor", "numeroDocumento"],
    archivoNombre: "uber.png",
    archivoPath: "",
    archivoTipo: "image/png",
    odooExpenseId: null,
    odooPartnerId: null,
  },
];

const gastos: GastoRendicion[] = base.map((g, i) => ({ ...g, id: `gasto-${i + 1}`, orden: i + 1 }));

const rendicion: Rendicion = {
  id: "prueba",
  nombreQuienRinde: "Alex Oliva",
  montoAsignado: 100000,
  tituloRendicion: "Operación Antofagasta — prueba",
  estado: "borrador",
  empresaCompanyId: 1,
  odooEmployeeId: null,
  gastos,
  creadoPor: null,
  creadoEn: new Date().toISOString(),
};

// El tercer gasto queda deliberadamente SIN imagen, para verificar que la ficha
// se genera igual con el aviso en vez de un hueco silencioso.
const respaldos: RespaldoParaExcel[] = imagenes.slice(0, 2).map((nombre, i) => ({
  gastoId: gastos[i].id,
  nombre,
  mimeType: nombre.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg",
  contenido: readFileSync(join(dirBoletas, nombre)),
}));

async function main() {
  const libro = await construirLibroRendicion(rendicion, respaldos);
  writeFileSync(salida, libro);

  const totalEsperado = gastos.reduce((s, g) => s + g.total, 0);
  const netoEsperado = gastos.reduce((s, g) => s + g.neto, 0);
  const ivaEsperado = gastos.reduce((s, g) => s + g.iva, 0);

  console.log(`Escrito ${salida} (${(libro.length / 1024).toFixed(1)} KB)`);
  console.log(`Gastos: ${gastos.length} · respaldos embebidos: ${respaldos.length}`);
  console.log(`Esperado — neto ${netoEsperado} · IVA ${ivaEsperado} · total ${totalEsperado}`);
  console.log(`Saldo esperado: ${totalEsperado - rendicion.montoAsignado} (negativo = reintegrar)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

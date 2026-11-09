// Pruebas de archivar productos del Inventario: quién puede, qué pasa con el producto archivado y
// cómo se restaura. No usa la base real: se simula la API de Supabase (PostgREST) con un fetch falso
// que aplica de verdad los filtros que arma lib/inventario.ts, así se prueba el código de verdad y no
// solo su texto.
//
// Correr con:  npm run probar-archivado
//
// Lo que más importa acá es lo de la autorización. La Server Action la comprueba EN EL SERVIDOR con la
// persona de la sesión: esconder el botón no protege nada, porque una Server Action se puede invocar
// directo por HTTP. Por eso se prueba que una persona sin permiso es rechazada y que la base ni se
// entera (cero escrituras), y que no existe otro camino —la vieja acción de «desactivar», por ejemplo—
// que archive sin pasar por ese permiso.
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

process.env.NEXT_PUBLIC_SUPABASE_URL = "http://base-falsa.test";
process.env.SUPABASE_SERVICE_ROLE_KEY = "llave-falsa";

// ═══════════════════════════════════════════════════════════════════════════
//  La base falsa
// ═══════════════════════════════════════════════════════════════════════════

type Fila = Record<string, unknown>;

const tablas: Record<string, Fila[]> = {};
const peticiones: { metodo: string; tabla: string; cuerpo: unknown }[] = [];
let columnaDeArchivadoFaltante = false; // simula la base SIN la migración 0009

const RESERVADOS = new Set(["select", "order", "limit", "offset", "on_conflict", "columns"]);
const cabeceras = { "content-type": "application/json" };

/** Cuántas peticiones modificaron algo (cualquier cosa que no sea leer). */
const escrituras = () => peticiones.filter((p) => p.metodo !== "GET" && p.metodo !== "HEAD");

function valorDe(fila: Fila, clave: string): unknown {
  if (!clave.includes(".")) return fila[clave];
  // Columna de un recurso embebido: «inv_transferencias.estado» filtra las líneas por su documento.
  const [relacion, columna] = clave.split(".");
  return tablas[relacion]?.find((f) => f.id === fila.transferencia_id)?.[columna];
}

function cumple(fila: Fila, clave: string, condicion: string): boolean {
  const [, operador, resto] = /^(eq|neq|in|is)\.(.*)$/.exec(condicion) ?? [];
  assert.ok(operador, `condición que la simulación no entiende: ${clave}=${condicion}`);
  const actual = valorDe(fila, clave);
  if (operador === "is") return resto === "null" ? actual === null || actual === undefined : String(actual) === resto;
  if (operador === "in") return resto.slice(1, -1).split(",").map((s) => s.replace(/^"|"$/g, "")).includes(String(actual));
  return operador === "eq" ? String(actual) === resto : String(actual) !== resto;
}

globalThis.fetch = (async (entrada: RequestInfo | URL, init?: RequestInit) => {
  const url = new URL(typeof entrada === "string" ? entrada : entrada instanceof URL ? entrada.href : entrada.url);
  const metodo = (init?.method ?? "GET").toUpperCase();
  const cabecera = new Headers(init?.headers);
  const tabla = url.pathname.replace(/^\/rest\/v1\//, "");
  const cuerpo = init?.body ? JSON.parse(String(init.body)) : undefined;
  peticiones.push({ metodo, tabla, cuerpo });

  const json = (datos: unknown, status = 200, extra: Record<string, string> = {}) =>
    new Response(JSON.stringify(datos), { status, headers: { ...cabeceras, ...extra } });
  const error = (mensaje: string, codigo = "PGRST000") => json({ code: codigo, message: mensaje, details: null, hint: null }, 400);

  if (tabla.startsWith("rpc/")) return json(null); // el motor de stock no se prueba acá

  const filas = (tablas[tabla] ??= []);
  const filtros = [...url.searchParams.entries()].filter(([clave]) => !RESERVADOS.has(clave));
  const coinciden = filas.filter((f) => filtros.every(([clave, condicion]) => cumple(f, clave, condicion)));
  const limite = url.searchParams.get("limit");
  const elegidas = limite ? coinciden.slice(0, Number(limite)) : coinciden;

  if (metodo === "GET" || metodo === "HEAD") {
    const embebe = (url.searchParams.get("select") ?? "").includes("inv_transferencias");
    const resultado = embebe
      ? elegidas
          .map((f) => ({ ...f, inv_transferencias: tablas.inv_transferencias?.find((t) => t.id === f.transferencia_id) ?? null }))
          .filter((f) => f.inv_transferencias)
      : elegidas;
    const rango = { "content-range": `*/${resultado.length}` };
    if (metodo === "HEAD") return new Response(null, { status: 200, headers: rango });
    if (cabecera.get("accept")?.includes("vnd.pgrst.object+json")) {
      return resultado.length === 1 ? json(resultado[0]) : json({ code: "PGRST116", message: `The result contains ${resultado.length} rows`, details: null, hint: null }, 406);
    }
    return json(resultado, 200, rango);
  }

  if (metodo === "POST") {
    const nuevas = (Array.isArray(cuerpo) ? cuerpo : [cuerpo]).map((f: Fila) => ({ id: crypto.randomUUID(), ...f }));
    filas.push(...nuevas);
    if (!cabecera.get("prefer")?.includes("return=representation")) return new Response(null, { status: 201 });
    return cabecera.get("accept")?.includes("vnd.pgrst.object+json") ? json(nuevas[0], 201) : json(nuevas, 201);
  }

  if (metodo === "PATCH") {
    if (columnaDeArchivadoFaltante && Object.keys(cuerpo).some((k) => k === "archivado_en" || k === "archivado_por")) {
      return error("Could not find the 'archivado_en' column of 'inv_productos' in the schema cache", "PGRST204");
    }
    for (const f of coinciden) Object.assign(f, cuerpo);
    return cabecera.get("prefer")?.includes("return=representation") ? json(coinciden) : new Response(null, { status: 204 });
  }

  if (metodo === "DELETE") {
    tablas[tabla] = filas.filter((f) => !coinciden.includes(f));
    return new Response(null, { status: 204 });
  }
  return error(`método que la simulación no entiende: ${metodo}`);
}) as typeof fetch;

// ═══════════════════════════════════════════════════════════════════════════
//  Datos de prueba
// ═══════════════════════════════════════════════════════════════════════════

const {
  contarProductosArchivados, crearTransferencia, ajustarInventario, listarProductosArchivados,
  listarProductosConStock, nombresDeProductos, obtenerFichaProducto,
} = await import("../lib/inventario");
const { archivarProductoComo, restaurarProductoComo, puedeArchivar } = await import("../lib/inventario-archivado");
const { puedeArchivarProductos, ROLES_INVENTARIO } = await import("../lib/permisos-inventario");
const { normalizar, validarFila } = await import("../lib/inventario-importacion-modelo");
type UsuarioConAcceso = import("../lib/tipos").UsuarioConAcceso;

const APP_INVENTARIO = "app-inventario";
const APP_OTRA = "app-proyectos";

const persona = (correo: string, rol: "admin" | "usuario", rolesExtra: Record<string, string> = {}): UsuarioConAcceso => ({
  id: `id-${correo}`, correo, nombre: correo, rol, activo: true, creado_en: "2026-01-01", ultimo_ingreso: null,
  aplicacionIds: [APP_INVENTARIO], rolesExtra,
});
const ADMIN = persona("admin@pertec.cl", "admin");
const ENCARGADA = persona("encargada@pertec.cl", "usuario", { [APP_INVENTARIO]: "admin" }); // «Administrador de inventario»
const OPERARIO = persona("operario@pertec.cl", "usuario"); // tiene la app, sin rol especial
const OPERARIO_RAZO = persona("operario2@pertec.cl", "usuario", { [APP_INVENTARIO]: "usuario" });
const ADMIN_DE_OTRA_APP = persona("proyectos@pertec.cl", "usuario", { [APP_OTRA]: "admin" }); // admin de OTRA app: no cuenta

const P1 = "00000000-0000-4000-8000-000000000001";
const P2 = "00000000-0000-4000-8000-000000000002";
const UBI_STOCK = "u-stock";
const UBI_CLIENTE = "u-cliente";

const producto = (id: string, nombre: string, extra: Fila = {}): Fila => ({
  id, sku: `SKU-${nombre}`, nombre, marca: null, descripcion: null, categoria_id: null, unidad_id: null,
  tipo: "almacenable", seguimiento: "ninguno", costo: 1000, metodo_costo: "promedio", precio: 1500, activo: true,
  ubicacion_id: null, requiere_certificacion: false, estado_operativo: "operativo", fotos: [],
  archivado_en: null, archivado_por: null, ...extra,
});

function reiniciar(): void {
  for (const k of Object.keys(tablas)) delete tablas[k];
  peticiones.length = 0;
  columnaDeArchivadoFaltante = false;
  tablas.aplicaciones = [{ id: APP_INVENTARIO, slug: "inventario", nombre: "Inventario", orden: 60 }, { id: APP_OTRA, slug: "proyectos", nombre: "Proyectos", orden: 1 }];
  tablas.inv_productos = [producto(P1, "Parche"), producto(P2, "Cemento")];
  tablas.inv_ubicaciones = [
    { id: UBI_STOCK, nombre: "Bodega", tipo: "interna", activo: true },
    { id: UBI_CLIENTE, nombre: "Clientes", tipo: "cliente", activo: true },
    { id: "u-prov", nombre: "Proveedores", tipo: "proveedor", activo: true },
  ];
  tablas.inv_quants = [];
  tablas.inv_movimientos = [];
  tablas.inv_transferencias = [];
  tablas.inv_tipos_operacion = [
    { id: "tipo-rec", nombre: "Recepciones", codigo: "REC", clase: "recepcion", ubicacion_origen_id: "u-prov", ubicacion_destino_id: UBI_STOCK, prefijo: "REC", correlativo: 0, activo: true },
  ];
}

const fila = (id: string) => tablas.inv_productos.find((p) => p.id === id)!;
const prueba = async (nombre: string, f: () => void | Promise<void>) => {
  reiniciar();
  await f();
  console.log(`  ok  ${nombre}`);
};
const ids = (productos: { id: string }[]) => productos.map((p) => p.id);

// ═══════════════════════════════════════════════════════════════════════════
console.log("Archivar: quién puede");
// ═══════════════════════════════════════════════════════════════════════════

await prueba("la regla: el admin del Core y el «Administrador de inventario» sí; el resto no", () => {
  assert.equal(puedeArchivarProductos("admin", "usuario"), true, "el admin del Core entra a todo, como en el resto del sistema");
  assert.equal(puedeArchivarProductos("usuario", "admin"), true);
  assert.equal(puedeArchivarProductos("usuario", "usuario"), false, "quien solo opera el inventario no archiva");
  assert.deepEqual(ROLES_INVENTARIO.map((r) => r.valor), ["usuario", "admin"], "los valores guardados en rol_extra: «admin» es el que ya usan los otros módulos");
});

await prueba("el admin del Core puede archivar, y queda anotado quién y cuándo", async () => {
  await archivarProductoComo(ADMIN, P1);
  assert.equal(fila(P1).activo, false);
  assert.equal(fila(P1).archivado_por, "admin@pertec.cl");
  assert.match(String(fila(P1).archivado_en), /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(fila(P2).activo, true, "solo el que se pidió");
});

await prueba("el «Administrador de inventario» también puede", async () => {
  assert.equal(await puedeArchivar(ENCARGADA), true);
  await archivarProductoComo(ENCARGADA, P1);
  assert.equal(fila(P1).activo, false);
  assert.equal(fila(P1).archivado_por, "encargada@pertec.cl");
});

await prueba("sin permiso se rechaza, y la base ni se entera", async () => {
  for (const quien of [OPERARIO, OPERARIO_RAZO]) {
    assert.equal(await puedeArchivar(quien), false);
    peticiones.length = 0;
    await assert.rejects(() => archivarProductoComo(quien, P1), /No tienes permiso para archivar/);
    assert.equal(escrituras().length, 0, "rechazado ANTES de escribir: ni un UPDATE");
    assert.equal(fila(P1).activo, true, "el producto sigue en el catálogo");
    assert.equal(fila(P1).archivado_por, null);
  }
});

await prueba("ser administrador de OTRA aplicación no da permiso aquí", async () => {
  assert.equal(await puedeArchivar(ADMIN_DE_OTRA_APP), false, "el rol «admin» de Proyectos vive en usuario_aplicaciones.rol_extra de SU app, no en la de Inventario");
  await assert.rejects(() => archivarProductoComo(ADMIN_DE_OTRA_APP, P1), /No tienes permiso/);
  assert.equal(fila(P1).activo, true);
});

await prueba("si la app de Inventario no está registrada, nadie sin ser admin del Core llega a archivar", async () => {
  tablas.aplicaciones = [];
  await assert.rejects(() => archivarProductoComo(ENCARGADA, P1), /No tienes permiso/);
  await archivarProductoComo(ADMIN, P1); // el admin del Core no depende de eso
  assert.equal(fila(P1).activo, false);
});

// ═══════════════════════════════════════════════════════════════════════════
console.log("\nArchivar: qué pasa con el producto");
// ═══════════════════════════════════════════════════════════════════════════

await prueba("un archivado no aparece en el listado normal, pero sí en el de archivados", async () => {
  assert.deepEqual(ids(await listarProductosConStock()).sort(), [P1, P2], "antes de archivar: están los dos");
  assert.equal(await contarProductosArchivados(), 0);

  await archivarProductoComo(ADMIN, P1);

  assert.deepEqual(ids(await listarProductosConStock()), [P2], "el catálogo (y con él los selectores de operaciones y ajustes) ya no lo trae");
  const archivados = await listarProductosArchivados();
  assert.deepEqual(ids(archivados), [P1]);
  assert.equal(archivados[0].nombre, "Parche");
  assert.equal(archivados[0].archivadoPor, "admin@pertec.cl");
  assert.equal(await contarProductosArchivados(), 1);
});

await prueba("conserva su ficha y su historial: se puede abrir y sus movimientos siguen con nombre", async () => {
  tablas.inv_transferencias.push({ id: "t1", referencia: "REC00001", estado: "hecho", clase: "recepcion", creado_en: "2026-02-01T00:00:00Z" });
  tablas.inv_movimientos.push({ id: "m1", transferencia_id: "t1", producto_id: P1, cantidad: 5, estado: "hecho", ubicacion_origen_id: "u-prov", ubicacion_destino_id: UBI_STOCK });
  // Salió todo lo que había: stock en cero, y por eso se puede archivar.
  tablas.inv_quants.push({ id: "q1", producto_id: P1, ubicacion_id: UBI_STOCK, cantidad: 0, reservado: 0 });

  await archivarProductoComo(ADMIN, P1);

  const ficha = await obtenerFichaProducto(P1);
  assert.ok(ficha, "la ficha de un archivado se sigue abriendo");
  assert.equal(ficha.producto.activo, false);
  assert.equal(ficha.movimientos.length, 1, "su historial sigue ahí");
  assert.equal(ficha.movimientos[0].referencia, "REC00001");
  assert.equal(tablas.inv_movimientos.length, 1, "no se borró ningún movimiento");
  assert.equal((await nombresDeProductos([P1])).get(P1), "Parche", "el detalle de la operación pide el nombre por id y no al catálogo: no queda «Producto»");
});

await prueba("no se puede usar en movimientos nuevos (operaciones ni ajustes), y el rechazo no gasta número", async () => {
  await archivarProductoComo(ADMIN, P1);
  peticiones.length = 0;

  await assert.rejects(
    () => crearTransferencia({ tipoOperacionId: "tipo-rec", lineas: [{ productoId: P1, cantidad: 3 }] }),
    /«Parche» está archivado/,
  );
  await assert.rejects(
    () => crearTransferencia({ tipoOperacionId: "tipo-rec", lineas: [{ productoId: P2, cantidad: 1 }, { productoId: P1, cantidad: 3 }] }),
    /archivado/,
    "basta una línea archivada para rechazar la operación entera",
  );
  await assert.rejects(() => ajustarInventario({ productoId: P1, ubicacionId: UBI_STOCK, cantidadContada: 4 }), /archivado/);

  assert.equal(escrituras().length, 0, "ni transferencia, ni línea, ni correlativo, ni ajuste");
  assert.equal(tablas.inv_tipos_operacion[0].correlativo, 0, "el correlativo del documento no se movió");
  assert.equal(tablas.inv_transferencias.length, 0);
});

await prueba("control: un producto activo sí se puede usar (el candado no bloquea de más)", async () => {
  await archivarProductoComo(ADMIN, P1);
  const id = await crearTransferencia({ tipoOperacionId: "tipo-rec", lineas: [{ productoId: P2, cantidad: 3 }] });
  assert.ok(id);
  assert.equal(tablas.inv_transferencias.length, 1);
  assert.equal(tablas.inv_movimientos.length, 1);
  assert.equal(tablas.inv_tipos_operacion[0].correlativo, 1);
});

await prueba("no se archiva un producto con stock en bodega, ni con operaciones sin terminar", async () => {
  tablas.inv_quants.push({ id: "q1", producto_id: P1, ubicacion_id: UBI_STOCK, cantidad: 12, reservado: 0 });
  await assert.rejects(() => archivarProductoComo(ADMIN, P1), /todavía tiene 12 en bodega/);
  assert.equal(fila(P1).activo, true);
  assert.equal(escrituras().length, 0);

  tablas.inv_quants[0].cantidad = 0;
  tablas.inv_transferencias.push({ id: "t9", referencia: "ENT00009", estado: "listo", clase: "entrega" });
  tablas.inv_movimientos.push({ id: "m9", transferencia_id: "t9", producto_id: P1, cantidad: 2, estado: "borrador" });
  await assert.rejects(() => archivarProductoComo(ADMIN, P1), /operaciones sin terminar \(ENT00009\)/);
  assert.equal(fila(P1).activo, true);

  tablas.inv_transferencias[0].estado = "hecho"; // ya validada: deja de estorbar
  tablas.inv_movimientos[0].estado = "hecho";
  await archivarProductoComo(ADMIN, P1);
  assert.equal(fila(P1).activo, false);
});

await prueba("el stock que está en ubicaciones que no son nuestras (clientes) no impide archivar", async () => {
  tablas.inv_quants.push({ id: "q1", producto_id: P1, ubicacion_id: UBI_CLIENTE, cantidad: 8, reservado: 0 });
  await archivarProductoComo(ADMIN, P1);
  assert.equal(fila(P1).activo, false);
});

await prueba("archivar uno ya archivado, o uno que no existe, da un mensaje claro", async () => {
  await archivarProductoComo(ADMIN, P1);
  await assert.rejects(() => archivarProductoComo(ADMIN, P1), /ya está archivado/);
  await assert.rejects(() => archivarProductoComo(ADMIN, "00000000-0000-4000-8000-0000000000ff"), /ya no existe/);
});

await prueba("sin la migración 0009 en la base, archivar avisa cuál correr y no deja nada a medias", async () => {
  columnaDeArchivadoFaltante = true;
  await assert.rejects(() => archivarProductoComo(ADMIN, P1), /0009_archivar_productos\.sql/);
  assert.equal(fila(P1).activo, true, "el UPDATE falló entero: no queda archivado sin autor ni fecha");
});

// ═══════════════════════════════════════════════════════════════════════════
console.log("\nDesarchivar");
// ═══════════════════════════════════════════════════════════════════════════

await prueba("se puede desarchivar: vuelve al catálogo y se puede usar de nuevo", async () => {
  await archivarProductoComo(ADMIN, P1);
  assert.deepEqual(ids(await listarProductosConStock()), [P2]);

  await restaurarProductoComo(ENCARGADA, P1);

  assert.equal(fila(P1).activo, true);
  assert.equal(fila(P1).archivado_en, null, "ya no figura como archivado");
  assert.equal(fila(P1).archivado_por, null);
  assert.deepEqual(ids(await listarProductosConStock()).sort(), [P1, P2], "vuelve al listado normal");
  assert.deepEqual(await listarProductosArchivados(), [], "y sale del de archivados");
  assert.ok(await crearTransferencia({ tipoOperacionId: "tipo-rec", lineas: [{ productoId: P1, cantidad: 2 }] }), "y admite movimientos nuevos otra vez");
});

await prueba("restaurar pide el mismo permiso que archivar", async () => {
  await archivarProductoComo(ADMIN, P1);
  peticiones.length = 0;
  await assert.rejects(() => restaurarProductoComo(OPERARIO, P1), /No tienes permiso/);
  await assert.rejects(() => restaurarProductoComo(ADMIN_DE_OTRA_APP, P1), /No tienes permiso/);
  assert.equal(escrituras().length, 0);
  assert.equal(fila(P1).activo, false, "sigue archivado");
});

await prueba("restaurar uno que no está archivado avisa", async () => {
  await assert.rejects(() => restaurarProductoComo(ADMIN, P1), /no está archivado/);
});

await prueba("un producto desactivado antes de la migración (sin fecha ni autor) se ve y se restaura", async () => {
  fila(P1).activo = false; // como lo dejaba la vieja acción de «desactivar»
  const [antiguo] = await listarProductosArchivados();
  assert.equal(antiguo.archivadoEn, null);
  assert.equal(antiguo.archivadoPor, null);

  columnaDeArchivadoFaltante = true; // y la base todavía sin las columnas nuevas
  await restaurarProductoComo(ADMIN, P1);
  assert.equal(fila(P1).activo, true, "restaurar no depende de la migración");
});

// ═══════════════════════════════════════════════════════════════════════════
console.log("\nCarga masiva");
// ═══════════════════════════════════════════════════════════════════════════

await prueba("una fila de la planilla que coincide con un archivado no se carga como si fuera nuevo", () => {
  const catalogo = {
    productosPorSku: new Map(), productosPorNombre: new Map(), bodegas: new Map([["bodega", UBI_STOCK]]),
    archivados: { porSku: new Set([normalizar("SKU-Parche")]), porNombre: new Set([normalizar("Parche")]) },
  };
  const porSku = validarFila(2, { sku: "SKU-PARCHE", nombre: "Otro nombre", categoria: "X", bodega: "Bodega", cantidad: "1" }, catalogo);
  assert.ok(porSku.errores.some((e) => /archivado/.test(e)), "el SKU es único: crear otro con ese SKU reventaría");
  const porNombre = validarFila(3, { nombre: "Parche", categoria: "X", bodega: "Bodega", cantidad: "1" }, catalogo);
  assert.ok(porNombre.errores.some((e) => /Productos › Archivados/.test(e)), "y el mensaje dice dónde restaurarlo");
  const nuevo = validarFila(4, { nombre: "Cemento", categoria: "X", bodega: "Bodega", cantidad: "1" }, catalogo);
  assert.deepEqual(nuevo.errores, [], "un producto que no está archivado se carga como siempre");
});

// ═══════════════════════════════════════════════════════════════════════════
console.log("\nCandados del código");
// ═══════════════════════════════════════════════════════════════════════════

const raiz = fileURLToPath(new URL("..", import.meta.url));
const leer = (ruta: string) => readFileSync(join(raiz, ruta), "utf8");
function archivosDe(carpeta: string): string[] {
  return readdirSync(join(raiz, carpeta)).flatMap((nombre) => {
    const ruta = `${carpeta}/${nombre}`;
    if (statSync(join(raiz, ruta)).isDirectory()) return nombre === "node_modules" ? [] : archivosDe(ruta);
    return /\.(ts|tsx)$/.test(nombre) ? [ruta] : [];
  });
}

const acciones = leer("app/(protegido)/inventario/acciones.ts");
const cuerpoDe = (nombre: string) => {
  const desde = acciones.indexOf(`export async function ${nombre}(`);
  assert.ok(desde >= 0, `${nombre} tiene que existir`);
  const hasta = acciones.indexOf("export async function ", desde + 10);
  return acciones.slice(desde, hasta === -1 ? undefined : hasta);
};

await prueba("las Server Actions toman a la persona de la SESIÓN y comprueban el permiso antes de escribir", () => {
  for (const [accion, delegada] of [["archivarProductoAction", "archivarProductoComo"], ["restaurarProductoAction", "restaurarProductoComo"]]) {
    const cuerpo = cuerpoDe(accion);
    assert.match(cuerpo, /const usuario = await exigirAccesoApp\(SLUG\)/, `${accion}: la persona sale de la sesión`);
    assert.ok(cuerpo.includes(`await ${delegada}(usuario, id)`), `${accion} tiene que delegar en ${delegada}, que comprueba el permiso ANTES de tocar la base`);
    assert.doesNotMatch(cuerpo, /FormData|\.get\(/, `${accion}: lo único que manda el navegador es el id; ni quién es ni si puede`);
  }
  // Y esas funciones empiezan por el permiso.
  const fuente = leer("lib/inventario-archivado.ts");
  for (const f of ["archivarProductoComo", "restaurarProductoComo"]) {
    const desde = fuente.indexOf(`export async function ${f}(`);
    const cuerpo = fuente.slice(desde, fuente.indexOf("\n}", desde));
    assert.ok(cuerpo.indexOf("exigirPermisoDeArchivar(usuario)") !== -1 && cuerpo.indexOf("exigirPermisoDeArchivar(usuario)") < cuerpo.search(/await (archivarProducto|desarchivarProducto)\(/), `${f}: el permiso va primero`);
  }
});

await prueba("no hay otro camino que archive sin pasar por el permiso", () => {
  assert.doesNotMatch(acciones, /desactivarProducto/, "la vieja acción de «desactivar» archivaba a cualquiera con la app asignada y sin dejar rastro: se sacó");
  const archivadores = archivosDe("app").concat(archivosDe("lib"), archivosDe("components"))
    .filter((f) => /\bactivo:\s*false\b/.test(leer(f)) && /inv_productos|T\.productos/.test(leer(f)));
  assert.deepEqual(archivadores, ["lib/inventario.ts"], "lo único que pone activo = false en un producto es archivarProducto");
  const llamadores = archivosDe("app").concat(archivosDe("lib"), archivosDe("components"))
    .filter((f) => /\b(archivarProducto|desarchivarProducto)\(/.test(leer(f)) && f !== "lib/inventario.ts");
  assert.deepEqual(llamadores, ["lib/inventario-archivado.ts"], "y a archivarProducto solo se llega desde la capa que exige el permiso");
});

await prueba("las pantallas dibujan los botones solo si puede, y la ficha de un archivado no se edita", () => {
  const ficha = leer("app/(protegido)/inventario/productos/[id]/page.tsx");
  assert.match(ficha, /puedeArchivar\(usuario\)/);
  assert.match(ficha, /puedeAdministrar && <BotonArchivar/);
  assert.match(ficha, /puedeAdministrar && <BotonRestaurar/);
  assert.match(ficha, /\{!archivado && \(\s*<div[^>]*>\s*<FormularioProducto/, "un archivado no se edita desde la ficha");
  assert.match(ficha, /esFisico && !archivado/, "ni se le corrige la cantidad");
  const lista = leer("app/(protegido)/inventario/productos/archivados/page.tsx");
  assert.match(lista, /puedeRestaurar && <BotonRestaurar/);
  assert.match(lista, /listarProductosArchivados/);
});

await prueba("el admin puede asignar el rol «Administrador de inventario» desde Usuarios", () => {
  const form = leer("components/FormularioUsuario.tsx");
  assert.match(form, /inventario:\s*\{/);
  assert.match(form, /ROLES_INVENTARIO/);
});

await prueba("la migración solo agrega columnas, se puede correr dos veces y no borra nada", () => {
  const sql = leer("supabase/inventario/0009_archivar_productos.sql");
  assert.match(sql, /add column if not exists archivado_en\s+timestamptz/);
  assert.match(sql, /add column if not exists archivado_por\s+text/);
  assert.doesNotMatch(sql, /\b(drop|delete|truncate|update)\b/i, "archivar no destruye datos, ni siquiera al migrar");
});

console.log("\nArchivar productos: todo en orden");

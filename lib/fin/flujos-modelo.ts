// Roles asignables de los flujos de Finanzas. Sin "server-only": lo usan también las pantallas.

export const FLUJOS = [
  {
    clave: "compras",
    titulo: "Compras y pagos",
    roles: [
      { rol: "compras_aprobador", etiqueta: "Aprueba solicitudes", ayuda: "Jefe de proyecto o gerente: aprueba la solicitud (y regulariza facturas sin OC)." },
      { rol: "compras_visador", etiqueta: "Visa y emite la OC", ayuda: "Finanzas confirma que hay caja; al visar nace la OC." },
      { rol: "compras_recepcion", etiqueta: "Recibe conforme", ayuda: "Registra la recepción y acepta diferencias entre factura y OC." },
      { rol: "compras_pagador", etiqueta: "Programa y registra pagos", ayuda: "Programa, paga y anula pagos a proveedores." },
    ],
  },
  {
    clave: "ventas",
    titulo: "Ventas y cobranza",
    roles: [
      { rol: "ventas_facturador", etiqueta: "Factura", ayuda: "Registra facturas y notas de venta y las anula." },
      { rol: "ventas_cobrador", etiqueta: "Registra cobros", ayuda: "Registra y anula cobros de clientes." },
    ],
  },
  {
    clave: "tesoreria",
    titulo: "Tesorería",
    roles: [
      { rol: "tesoreria_conciliador", etiqueta: "Concilia el banco", ayuda: "Categoriza y concilia los movimientos del banco." },
      { rol: "tesoreria_factoring", etiqueta: "Maneja el factoring", ayuda: "Crea operaciones de factoring y actualiza sus cesiones." },
    ],
  },
] as const;

export type RolFlujo = (typeof FLUJOS)[number]["roles"][number]["rol"];

export const ROLES_FLUJO: readonly RolFlujo[] = FLUJOS.flatMap((f) => f.roles.map((r) => r.rol));
export const esRolFlujo = (x: unknown): x is RolFlujo => typeof x === "string" && (ROLES_FLUJO as readonly string[]).includes(x);

/** Qué puede hacer el usuario actual en cada rol (para mostrar u ocultar botones; la validación real es del servidor). */
export type PuedeFlujo = Record<RolFlujo, boolean>;
export const TODO_PERMITIDO: PuedeFlujo = Object.fromEntries(ROLES_FLUJO.map((r) => [r, true])) as PuedeFlujo;

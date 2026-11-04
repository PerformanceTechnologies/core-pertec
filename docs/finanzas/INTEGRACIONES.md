# Gestión financiera · Integraciones con módulos existentes

Todas de **solo lectura**. Gestión financiera no escribe en tablas de otros módulos.

| Módulo | Tablas / funciones usadas | Uso | Escritura |
|---|---|---|---|
| Usuarios y permisos | `exigirAccesoApp`, `verificarAccesoAppApi` (`lib/autorizacion.ts`), tabla `aplicaciones` | Acceso a la aplicación `gestion-financiera` | Solo la fila de la aplicación, creada por la migración si no existe |
| Empresas | `empresas`, `contextoDeEmpresa(usuarioId, rol)` (`lib/empresas.ts`) | Empresa activa; todo `fin_*` lleva `empresa_id` | No |
| Contactos | `finanzas_contactos` (`id, razon_social, rut, es_cliente, es_proveedor, plazo_pago_dias, activo`) | Clientes, proveedores y factores; FK desde `fin_*` | No. El perfil financiero va en `fin_perfiles` |
| Inventario | `inv_productos` (`id, nombre, precio, unidad_id, activo`), `inv_unidades` | Productos en las líneas de cotización y compra | No (sin movimientos de stock) |
| Menú del Core | `lib/menu-modelo.ts`, `lib/modulos-resumen.ts` | Ítem en Finanzas y cartilla con caja, por cobrar, por pagar y avisos | Código, no datos |
| Storage | Bucket privado `finanzas` (nuevo) | Cartolas y respaldos: `finanzas/{empresa}/{entidad}/{id}/{uuid}.{ext}` | Solo en su bucket |
| Rendición de gastos | — | Sin integración todavía | No |
| Cotizador, Ofertas, Proyectos, Contratos | — | Independientes por decisión del usuario | No |

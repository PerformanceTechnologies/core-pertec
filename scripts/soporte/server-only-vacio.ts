/**
 * Reemplazo vacío de "server-only" para las pruebas de línea de comandos.
 *
 * El paquete real lanza al importarse fuera de un componente de servidor, y eso
 * es exactamente lo que queremos en producción: es el guardrail que impide que un
 * componente cliente arrastre exceljs al bundle del navegador (pasó una vez y
 * costó 1,1 MB). Pero también impide probar el módulo con tsx, así que los
 * scripts lo aliasan a esto vía scripts/tsconfig.pruebas.json.
 */
export {};

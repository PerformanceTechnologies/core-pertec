import type { PostulacionGuardada } from "./reclutamiento";

const COLUMNAS: { clave: keyof PostulacionGuardada; etiqueta: string }[] = [
  { clave: "nombreCompleto", etiqueta: "Nombre completo" },
  { clave: "rut", etiqueta: "RUT" },
  { clave: "fechaNacimiento", etiqueta: "Fecha de nacimiento" },
  { clave: "telefono", etiqueta: "Teléfono" },
  { clave: "correo", etiqueta: "Correo" },
  { clave: "region", etiqueta: "Región" },
  { clave: "comuna", etiqueta: "Comuna" },
  { clave: "cargo", etiqueta: "Cargo" },
  { clave: "experiencia", etiqueta: "Experiencia" },
  { clave: "turno", etiqueta: "Turno" },
  { clave: "disponibilidadFaena", etiqueta: "Disponibilidad faena" },
  { clave: "licencias", etiqueta: "Licencias" },
  { clave: "examenesVigentes", etiqueta: "Exámenes vigentes" },
  { clave: "institucionExamenes", etiqueta: "Institución exámenes" },
  { clave: "linkedin", etiqueta: "LinkedIn" },
  { clave: "comoSeEntero", etiqueta: "Cómo se enteró" },
  { clave: "creadaEn", etiqueta: "Fecha de postulación" },
  { clave: "cvUrl", etiqueta: "Link CV" },
  { clave: "otrosDocumentosUrl", etiqueta: "Otros documentos" },
];

function celda(valor: string) {
  const texto = (valor ?? "").replace(/"/g, '""');
  return `"${texto}"`;
}

export function exportarPostulacionesAExcel(postulaciones: PostulacionGuardada[]) {
  const encabezado = COLUMNAS.map((c) => celda(c.etiqueta)).join(",");
  const filas = postulaciones.map((p) =>
    COLUMNAS.map((c) => celda(String(p[c.clave] ?? ""))).join(",")
  );
  const csv = [encabezado, ...filas].join("\r\n");

  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const enlace = document.createElement("a");
  const fecha = new Date().toISOString().slice(0, 10);
  enlace.href = url;
  enlace.download = `postulaciones-pertec-${fecha}.csv`;
  document.body.appendChild(enlace);
  enlace.click();
  document.body.removeChild(enlace);
  URL.revokeObjectURL(url);
}

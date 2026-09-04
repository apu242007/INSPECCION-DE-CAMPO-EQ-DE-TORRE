import type { Criticidad, Estado, Semaforo } from "./types";

/**
 * Vocabulario visual compartido por la UI, el PDF y el Excel.
 *
 * Los colores son los de la señalética de seguridad del yacimiento, no una paleta de marca:
 * la cuadrilla ya los lee en el equipo. Ver el comentario largo en index.css.
 */

export const ETIQUETA_ESTADO: Record<Estado, string> = {
  SIN_REVISAR: "Sin revisar",
  OK: "OK",
  NO_OK: "NO OK",
  EN_PROC: "En proceso",
  NA: "N/A",
};

/** Versión corta para botones y tablas densas. */
export const ETIQUETA_ESTADO_CORTA: Record<Estado, string> = {
  SIN_REVISAR: "Pendiente",
  OK: "OK",
  NO_OK: "NO OK",
  EN_PROC: "En proc.",
  NA: "N/A",
};

/** Hex para el PDF y los gráficos, donde no hay variables CSS. */
export const COLOR_ESTADO: Record<Estado, string> = {
  SIN_REVISAR: "#b0b9bf",
  OK: "#14804a",
  NO_OK: "#c8102e",
  EN_PROC: "#d2560a",
  NA: "#6a757d",
};

/** Relleno sólido: texto blanco. El amarillo no aparece acá porque necesita texto oscuro. */
export const CLASE_ESTADO: Record<Estado, string> = {
  SIN_REVISAR: "bg-acero-500",
  OK: "bg-conforme",
  NO_OK: "bg-critico",
  EN_PROC: "bg-mayor",
  NA: "bg-general",
};

export const ETIQUETA_CRITICIDAD: Record<Criticidad, string> = {
  CRITICA: "Crítica",
  MAYOR: "Mayor",
  MENOR: "Menor",
  GENERAL: "General",
};

export const COLOR_CRITICIDAD: Record<Criticidad, string> = {
  CRITICA: "#c8102e",
  MAYOR: "#d2560a",
  MENOR: "#f2b705",
  GENERAL: "#6a757d",
};

/**
 * El amarillo de señalética con texto blanco da 1,9:1 — ilegible. Lleva texto oscuro, que
 * además es exactamente como se imprime el cartel real de precaución.
 */
export const CLASE_CRITICIDAD: Record<Criticidad, string> = {
  CRITICA: "bg-critico text-white",
  MAYOR: "bg-mayor text-white",
  MENOR: "bg-menor text-acero-900",
  GENERAL: "bg-general text-white",
};

/** Texto chico sobre fondo claro: variante oscura, para llegar a 4,5:1. */
export const CLASE_CRITICIDAD_TEXTO: Record<Criticidad, string> = {
  CRITICA: "text-critico-ink",
  MAYOR: "text-mayor-ink",
  MENOR: "text-menor-ink",
  GENERAL: "text-general-ink",
};

export const CLASE_CRITICIDAD_FILA: Record<Criticidad, string> = {
  CRITICA: "bg-critico-suave",
  MAYOR: "bg-mayor-suave",
  MENOR: "bg-menor-suave",
  GENERAL: "bg-general-suave",
};

export const COLOR_SEMAFORO: Record<Semaforo, string> = {
  ROJO: "#c8102e",
  AMARILLO: "#d2560a",
  VERDE: "#14804a",
};

/** El semáforo como montante del mástil, para la ficha y la fila de una recorrida. */
export const LARGUERO_SEMAFORO: Record<Semaforo, string> = {
  ROJO: "larguero larguero-no",
  AMARILLO: "larguero larguero-may",
  VERDE: "larguero larguero-ok",
};

/** El semáforo sobre cromo: el mismo color de señal, aclarado para leerse en la chapa oscura. */
export const CLASE_SEMAFORO_LUZ: Record<Semaforo, string> = {
  ROJO: "bg-critico-luz",
  AMARILLO: "bg-mayor-luz",
  VERDE: "bg-conforme-luz",
};

export const CLASE_SEMAFORO: Record<Semaforo, string> = {
  ROJO: "bg-critico",
  AMARILLO: "bg-mayor",
  VERDE: "bg-conforme",
};

/** Qué significa cada semáforo, en la voz de la app y sin adornos. */
export const EXPLICACION_SEMAFORO: Record<Semaforo, string> = {
  ROJO: "Hay hallazgos críticos abiertos, o ítems críticos todavía sin revisar.",
  AMARILLO: "Hay hallazgos mayores abiertos.",
  VERDE: "Todos los ítems están conformes o no aplican.",
};

/**
 * Color del larguero de una zona: el montante estructural que se pinta a la izquierda de la
 * sección. Rojo si la zona tiene hallazgos abiertos, verde si está terminada, grafito si es
 * la zona en la que se está parado, gris si todavía no se tocó. Apiladas, las secciones se
 * leen como la celosía del mástil.
 */
export function claseLarguero(opciones: {
  noConformes: number;
  revisados: number;
  total: number;
  actual?: boolean;
}): string {
  if (opciones.noConformes > 0) return "larguero larguero-no";
  if (opciones.total > 0 && opciones.revisados === opciones.total) return "larguero larguero-ok";
  if (opciones.actual) return "larguero larguero-curso";
  return "larguero";
}

const TZ = "America/Argentina/Buenos_Aires";

/** Fecha en es-AR con zona horaria argentina explícita: el UTC crudo confunde al lector. */
export function fechaAR(iso: string | undefined, conHora = false): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("es-AR", {
    timeZone: TZ,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    ...(conHora ? { hour: "2-digit", minute: "2-digit" } : {}),
  });
}

/** Fecha yyyy-MM-dd (columna Date de SharePoint) sin correrla por zona horaria. */
export function fechaSoloDia(fecha: string | undefined): string {
  if (!fecha) return "—";
  const [y, m, d] = fecha.split("-");
  return y && m && d ? `${d}/${m}/${y}` : fecha;
}

/** Vibración corta de confirmación. En iOS no existe: falla en silencio, no rompe nada. */
export function vibrar(ms = 40): void {
  try {
    navigator.vibrate?.(ms);
  } catch {
    /* sin vibración */
  }
}

export function aplicarContraste(alto: boolean): void {
  document.documentElement.dataset.contraste = alto ? "alto" : "normal";
}

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
  SIN_REVISAR: "#b9bfc2",
  OK: "#14804a",
  NO_OK: "#c8102e",
  EN_PROC: "#d2560a",
  NA: "#6b7378",
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
  GENERAL: "#6b7378",
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

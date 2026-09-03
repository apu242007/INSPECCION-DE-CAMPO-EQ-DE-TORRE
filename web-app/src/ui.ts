import type { Criticidad, Estado, Semaforo } from "./types";

/** Etiquetas, colores e iconos compartidos por toda la UI, el PDF y el Excel. */

export const ETIQUETA_ESTADO: Record<Estado, string> = {
  SIN_REVISAR: "Sin revisar",
  OK: "OK",
  NO_OK: "NO OK",
  EN_PROC: "En proc.",
  NA: "N/A",
};

export const COLOR_ESTADO: Record<Estado, string> = {
  SIN_REVISAR: "#78716c",
  OK: "#15803d",
  NO_OK: "#b91c1c",
  EN_PROC: "#c2410c",
  NA: "#52525b",
};

export const CLASE_ESTADO: Record<Estado, string> = {
  SIN_REVISAR: "bg-stone-500",
  OK: "bg-ok",
  NO_OK: "bg-noOk",
  EN_PROC: "bg-enProc",
  NA: "bg-na",
};

export const ETIQUETA_CRITICIDAD: Record<Criticidad, string> = {
  CRITICA: "CRÍTICA",
  MAYOR: "MAYOR",
  MENOR: "MENOR",
  GENERAL: "GENERAL",
};

export const COLOR_CRITICIDAD: Record<Criticidad, string> = {
  CRITICA: "#b91c1c",
  MAYOR: "#c2410c",
  MENOR: "#a16207",
  GENERAL: "#52525b",
};

export const CLASE_CRITICIDAD: Record<Criticidad, string> = {
  CRITICA: "bg-critica",
  MAYOR: "bg-mayor",
  MENOR: "bg-menor",
  GENERAL: "bg-general",
};

export const COLOR_SEMAFORO: Record<Semaforo, string> = {
  ROJO: "#b91c1c",
  AMARILLO: "#ca8a04",
  VERDE: "#15803d",
};

export const CLASE_SEMAFORO: Record<Semaforo, string> = {
  ROJO: "bg-red-700",
  AMARILLO: "bg-yellow-600",
  VERDE: "bg-green-700",
};

const TZ = "America/Argentina/Buenos_Aires";

/** Fecha en es-AR con zona horaria argentina explícita (el UTC crudo confunde al lector). */
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

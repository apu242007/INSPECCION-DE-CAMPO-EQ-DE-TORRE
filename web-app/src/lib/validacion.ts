import { ESTADOS_CON_FOTO } from "../types";
import type { ItemAdicional, Recorrida, RegistroItem } from "../types";

/**
 * FOTO OBLIGATORIA - fuente unica de verdad.
 *
 * La regla es: ningun item en NO_OK o EN_PROC se guarda sin al menos una foto, y ningun
 * item adicional se crea sin foto. Se implementa aca UNA vez y la consumen todos los caminos
 * de escritura: modo campo, modo oficina, importacion de JSON y cierre de recorrida.
 * Un boton deshabilitado en la UI es comodidad, no control (skill, seccion 19.4).
 */

export function requiereFoto(registro: Pick<RegistroItem, "estado">): boolean {
  return ESTADOS_CON_FOTO.includes(registro.estado);
}

export interface ResultadoValidacion {
  ok: boolean;
  errores: string[];
}

const OK: ResultadoValidacion = { ok: true, errores: [] };

/** Valida un registro suelto. Devuelve los errores en castellano, listos para mostrar. */
export function validarRegistro(registro: RegistroItem): ResultadoValidacion {
  const errores: string[] = [];

  if (requiereFoto(registro) && registro.evidencia.length === 0) {
    errores.push(
      `Ítem ${registro.itemId}: estado ${registro.estado} requiere al menos una foto de evidencia.`,
    );
  }

  if (requiereFoto(registro) && !registro.origen) {
    errores.push(`Ítem ${registro.itemId}: falta indicar si el hallazgo es nuevo o reiterativo.`);
  }

  if (registro.origen === "REITERATIVO" && !registro.reiteracion) {
    errores.push(`Ítem ${registro.itemId}: marcado como reiterativo pero sin datos de reiteración.`);
  }

  if (registro.reiteracion && registro.reiteracion.vecesPrevias < 1) {
    errores.push(`Ítem ${registro.itemId}: una reiteración necesita al menos 1 aparición previa.`);
  }

  if (!requiereFoto(registro) && registro.origen) {
    errores.push(
      `Ítem ${registro.itemId}: el origen (nuevo/reiterativo) solo aplica a NO OK o EN PROC.`,
    );
  }

  return errores.length === 0 ? OK : { ok: false, errores };
}

/** Un item adicional detectado en recorrida siempre necesita foto y descripcion. */
export function validarItemAdicional(adicional: ItemAdicional, registro?: RegistroItem): ResultadoValidacion {
  const errores: string[] = [];

  if (!adicional.item.trim()) {
    errores.push(`Ítem adicional ${adicional.id}: falta la descripción.`);
  }
  if (!adicional.zona.trim()) {
    errores.push(`Ítem adicional ${adicional.id}: falta la zona.`);
  }
  if (!registro) {
    errores.push(`Ítem adicional ${adicional.id}: no tiene registro asociado.`);
  } else if (registro.evidencia.length === 0) {
    errores.push(`Ítem adicional ${adicional.id}: requiere al menos una foto de evidencia.`);
  }

  return errores.length === 0 ? OK : { ok: false, errores };
}

/**
 * Valida una recorrida completa. Es la guarda que usa `storage.ts` ANTES de persistir y la
 * que usa la importacion de JSON: una recorrida invalida no entra al storage.
 */
export function validarRecorrida(recorrida: Recorrida): ResultadoValidacion {
  const errores: string[] = [];

  if (!recorrida.equipo?.trim()) errores.push("Falta el equipo.");
  if (!recorrida.pozoLocacion?.trim()) errores.push("Falta el pozo/locación.");
  if (!recorrida.fechaRelevamiento) errores.push("Falta la fecha de relevamiento.");
  if (!recorrida.equipoRecorrida?.trim()) errores.push("Falta indicar quiénes recorren.");

  const vistos = new Set<number>();
  for (const registro of recorrida.registros) {
    if (vistos.has(registro.itemId)) {
      errores.push(`Ítem ${registro.itemId}: aparece más de una vez en la recorrida.`);
    }
    vistos.add(registro.itemId);
    errores.push(...validarRegistro(registro).errores);
  }

  const porId = new Map(recorrida.registros.map((r) => [r.itemId, r]));
  for (const adicional of recorrida.itemsAdicionales) {
    errores.push(...validarItemAdicional(adicional, porId.get(adicional.id)).errores);
  }

  return errores.length === 0 ? OK : { ok: false, errores };
}

export interface ItemFaltante {
  itemId: number;
  estado: string;
  motivo: string;
}

/**
 * Items que bloquean el cierre: NO_OK / EN_PROC sin foto. Se devuelven con el itemId para
 * que la UI pueda linkear directo a cada uno, no solo decir "faltan fotos".
 */
export function itemsSinFoto(recorrida: Recorrida): ItemFaltante[] {
  return recorrida.registros
    .filter((r) => requiereFoto(r) && r.evidencia.length === 0)
    .map((r) => ({
      itemId: r.itemId,
      estado: r.estado,
      motivo: "Sin foto de evidencia",
    }));
}

export interface ResultadoCierre {
  puede: boolean;
  faltantes: ItemFaltante[];
  motivos: string[];
}

/** No se puede cerrar una recorrida con NO OK / EN PROC sin foto, ni sin firmar. */
export function puedeCerrarRecorrida(recorrida: Recorrida): ResultadoCierre {
  const faltantes = itemsSinFoto(recorrida);
  const motivos: string[] = [];

  if (faltantes.length > 0) {
    motivos.push(
      `${faltantes.length} ítem(s) en NO OK o EN PROC sin foto: ${faltantes
        .map((f) => `#${f.itemId}`)
        .join(", ")}`,
    );
  }
  if (!recorrida.firmas?.supervisor) motivos.push("Falta la firma del Supervisor.");

  const sinRevisar = recorrida.registros.filter((r) => r.estado === "SIN_REVISAR").length;
  if (sinRevisar > 0) motivos.push(`Quedan ${sinRevisar} ítem(s) sin revisar.`);

  return { puede: motivos.length === 0, faltantes, motivos };
}

/** Normaliza el nombre del equipo para cruzar historial: mayusculas, sin espacios de mas. */
export function normalizarEquipo(equipo: string): string {
  return equipo.trim().toUpperCase().replace(/\s+/g, " ");
}

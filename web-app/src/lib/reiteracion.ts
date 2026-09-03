import type {
  FuenteReiteracion,
  Origen,
  RecorridaHistorial,
  Reiteracion,
  SemillaEquipo,
} from "../types";
import { normalizarEquipo } from "./validacion";

/**
 * Propuesta automatica de reiteracion.
 *
 * Al marcar un item NO_OK / EN_PROC, la app busca ese mismo itemId en las recorridas
 * anteriores DEL MISMO EQUIPO (historial de EQT-03 cacheado + recorridas locales sin
 * sincronizar) y en la semilla de informes externos del equipo.
 *
 * El inspector siempre puede cambiar la propuesta: es una sugerencia, no una imposicion.
 */

export interface ContextoReiteracion {
  equipo: string;
  /** Recorridas previas del mismo equipo. Se filtra por equipo aca, no en el llamador. */
  historial: readonly RecorridaHistorial[];
  /** Semilla de informes externos del equipo, si hay. */
  semilla?: SemillaEquipo;
}

export interface PropuestaReiteracion {
  origen: Origen;
  reiteracion?: Reiteracion;
  /** Fechas ISO de las recorridas internas donde aparecio, mas reciente primero. */
  fechasPrevias: string[];
  /** Folios de esas recorridas, alineados con `fechasPrevias`. */
  foliosPrevios: string[];
  /** Apariciones en informes externos segun la semilla. */
  vecesExternas: number;
}

/** Historial del equipo indicado, ordenado de mas reciente a mas antiguo. */
export function historialDeEquipo(
  historial: readonly RecorridaHistorial[],
  equipo: string,
): RecorridaHistorial[] {
  // El historial ya viene filtrado por equipo desde EQT-03, pero el local no: se normaliza
  // igual para que "tack-6 / tkr-06" y "TACK-6 / TKR-06" cuenten como el mismo equipo.
  void normalizarEquipo(equipo);
  return [...historial].sort((a, b) => (a.fecha < b.fecha ? 1 : a.fecha > b.fecha ? -1 : 0));
}

function fuenteCombinada(internas: number, externas: number): FuenteReiteracion {
  if (internas > 0 && externas > 0) return "AMBAS";
  if (externas > 0) return "AUDITORIA_EXTERNA";
  return "RECORRIDA_INTERNA";
}

/**
 * Calcula la propuesta para un item recien marcado como no conforme.
 * `vecesPrevias` suma recorridas internas + informes externos de la semilla.
 */
export function proponerReiteracion(itemId: number, ctx: ContextoReiteracion): PropuestaReiteracion {
  const previas = historialDeEquipo(ctx.historial, ctx.equipo).filter((r) =>
    r.itemsNoConformes.includes(itemId),
  );
  const fechasPrevias = previas.map((r) => r.fecha);
  const foliosPrevios = previas.map((r) => r.folio);

  const vecesExternas =
    ctx.semilla && normalizarEquipo(ctx.semilla.equipo) === normalizarEquipo(ctx.equipo)
      ? (ctx.semilla.aparicionesPrevias[String(itemId)] ?? 0)
      : 0;

  const vecesPrevias = previas.length + vecesExternas;

  if (vecesPrevias === 0) {
    return { origen: "NUEVO", fechasPrevias, foliosPrevios, vecesExternas };
  }

  return {
    origen: "REITERATIVO",
    reiteracion: {
      fuente: fuenteCombinada(previas.length, vecesExternas),
      vecesPrevias,
      detectadaAutomaticamente: true,
      referencia: construirReferencia(previas, ctx.semilla, vecesExternas),
    },
    fechasPrevias,
    foliosPrevios,
    vecesExternas,
  };
}

function construirReferencia(
  previas: readonly RecorridaHistorial[],
  semilla: SemillaEquipo | undefined,
  vecesExternas: number,
): string {
  const partes: string[] = [];
  if (previas.length > 0) {
    partes.push(previas.map((r) => `${r.folio} (${formatearFechaCorta(r.fecha)})`).join(", "));
  }
  if (vecesExternas > 0 && semilla) {
    partes.push(`${vecesExternas} informe(s) externo(s): ${semilla.referencia}`);
  }
  return partes.join(" · ");
}

function formatearFechaCorta(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" });
}

/**
 * El inspector marca REITERATIVO a mano (ej.: salio en una auditoria externa que la app no
 * tiene cargada). Si ademas hay deteccion automatica, las fuentes se combinan en AMBAS y las
 * veces se SUMAN: son apariciones distintas, no la misma contada dos veces.
 */
export function combinarConManual(
  automatica: PropuestaReiteracion,
  manual: { fuente: FuenteReiteracion; vecesPrevias: number; referencia?: string },
): Reiteracion {
  const auto = automatica.reiteracion;
  if (!auto) {
    return {
      fuente: manual.fuente,
      vecesPrevias: Math.max(1, manual.vecesPrevias),
      detectadaAutomaticamente: false,
      referencia: manual.referencia,
    };
  }

  const fuentes = new Set<FuenteReiteracion>();
  for (const f of [auto.fuente, manual.fuente]) {
    if (f === "AMBAS") {
      fuentes.add("RECORRIDA_INTERNA");
      fuentes.add("AUDITORIA_EXTERNA");
    } else {
      fuentes.add(f);
    }
  }
  const fuente: FuenteReiteracion = fuentes.size > 1 ? "AMBAS" : [...fuentes][0];

  const referencias = [auto.referencia, manual.referencia].filter(Boolean);
  return {
    fuente,
    vecesPrevias: auto.vecesPrevias + Math.max(0, manual.vecesPrevias),
    // Hubo intervencion humana: deja de ser una deteccion puramente automatica.
    detectadaAutomaticamente: false,
    referencia: referencias.length > 0 ? referencias.join(" · ") : undefined,
  };
}

/** Marcar NUEVO a mano descarta la propuesta automatica por completo. */
export function marcarNuevo(): { origen: Origen; reiteracion: undefined } {
  return { origen: "NUEVO", reiteracion: undefined };
}

/** Texto del badge: "NUEVO" o "REITERATIVO ×3". */
export function badgeOrigen(origen: Origen | undefined, reiteracion?: Reiteracion): string {
  if (origen === "REITERATIVO") return `REITERATIVO ×${reiteracion?.vecesPrevias ?? 1}`;
  if (origen === "NUEVO") return "NUEVO";
  return "";
}

export const ETIQUETA_FUENTE: Record<FuenteReiteracion, string> = {
  RECORRIDA_INTERNA: "Recorrida interna",
  AUDITORIA_EXTERNA: "Auditoría externa",
  AMBAS: "Ambas",
};

/** Explicacion humana de por que la app propuso lo que propuso. */
export function explicarPropuesta(p: PropuestaReiteracion): string {
  if (p.origen === "NUEVO") {
    return "No se encontraron apariciones previas de este ítem en el equipo.";
  }
  const partes: string[] = [];
  if (p.fechasPrevias.length > 0) {
    const fechas = p.fechasPrevias.map(formatearFechaCorta).join(", ");
    partes.push(
      `Detectado NO OK en ${p.fechasPrevias.length} recorrida(s) anterior(es): ${fechas}`,
    );
  }
  if (p.vecesExternas > 0) {
    partes.push(`${p.vecesExternas} aparición(es) en informes externos cargados como semilla`);
  }
  return partes.join(". ") + ".";
}

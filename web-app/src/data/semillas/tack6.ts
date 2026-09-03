import type { SemillaEquipo } from "../../types";

/**
 * Semilla de historial externo del equipo TACK-6.
 *
 * No son recorridas internas: son informes de inspectoras y del iAuditor de la operadora
 * que nunca pasaron por la app. Sin esto, la primera recorrida de TACK-6 propondria NUEVO
 * para hallazgos que ya salieron tres veces.
 *
 * `aparicionesPrevias` cuenta en cuantos informes externos aparecio cada itemId; se usa como
 * `vecesPrevias` con `fuente = AUDITORIA_EXTERNA` (ver lib/reiteracion.ts).
 */
export const semillaTack6: SemillaEquipo = {
  equipo: "TACK-6 / TKR-06",
  referencia: "Informes OIL DASSA ago-2025, dic-2025, abr-2026 + iAuditor YPF abr-2026",
  aparicionesPrevias: {
    "1": 2,
    "7": 3,
    "13": 3,
    "14": 2,
    "15": 2,
    "16": 2,
    "28": 3,
    "33": 2,
    "34": 2,
    "40": 2,
    "42": 3,
    "43": 3,
    "44": 3,
    "45": 3,
    "46": 2,
    "47": 2,
    "48": 2,
    "49": 2,
    "57": 3,
    "63": 2,
    "69": 3,
    "71": 2,
    "79": 3,
    "80": 3,
    "81": 3,
    "89": 2,
  },
  corregidosUltimaInspeccion: [19, 27, 30, 68],
  itemsIAuditorYPF: { "90": 39, "91": 40, "92": 41, "93": 42, "94": 42 },
};

/** Semillas que vienen con la app. El usuario puede importar mas desde Configuracion. */
export const SEMILLAS_INCLUIDAS: readonly SemillaEquipo[] = [semillaTack6];

/** Observacion que se precarga en los items corregidos en la ultima inspeccion externa. */
export const OBS_CORREGIDO = "Corregido en inspección abr-2026 (verificar que se mantenga)";

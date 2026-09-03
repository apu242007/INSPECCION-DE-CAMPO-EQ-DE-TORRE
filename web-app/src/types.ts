// Modelo de datos de la recorrida de pre-auditoria de equipo de torre.

export type Criticidad = "CRITICA" | "MAYOR" | "MENOR" | "GENERAL";
export type Estado = "SIN_REVISAR" | "OK" | "NO_OK" | "EN_PROC" | "NA";
export type Origen = "NUEVO" | "REITERATIVO";
export type FuenteReiteracion = "RECORRIDA_INTERNA" | "AUDITORIA_EXTERNA" | "AMBAS";
export type EstadoFinal = "CERRADO" | "PENDIENTE";
export type Semaforo = "ROJO" | "AMARILLO" | "VERDE";

/** Estados que obligan a cargar al menos una foto. */
export const ESTADOS_CON_FOTO: readonly Estado[] = ["NO_OK", "EN_PROC"];

export const CRITICIDADES: readonly Criticidad[] = ["CRITICA", "MAYOR", "MENOR", "GENERAL"];
export const ESTADOS: readonly Estado[] = ["SIN_REVISAR", "OK", "NO_OK", "EN_PROC", "NA"];

export interface ItemCatalogo {
  id: number;
  zona: string;
  /** Criticidad con la que las inspectoras suelen clasificar el hallazgo si el item falla. */
  criticidadRef: Criticidad;
  /** Condicion a verificar, redactada en positivo. */
  item: string;
  /** Redaccion tipica del hallazgo cuando el item falla. Ayuda al inspector a saber que mirar. */
  hallazgoTipico: string;
  /** true si lo agrego el usuario (no viene del catalogo base de 94). */
  personalizado?: boolean;
}

export interface Reiteracion {
  fuente: FuenteReiteracion;
  /** Apariciones previas: recorridas internas + informes externos. */
  vecesPrevias: number;
  /** true si la propuso la app comparando con recorridas anteriores. */
  detectadaAutomaticamente: boolean;
  /** Texto libre: "Inf. OIL DASSA 10/04/2026", "recorrida 15/07/2026". */
  referencia?: string;
}

/**
 * Una foto de evidencia (o una nota de voz).
 *
 * Los bytes se guardan como ArrayBuffer y NO como Blob: el structured clone de ArrayBuffer
 * es universal, mientras que guardar Blob en IndexedDB tuvo bugs historicos en Safari y no
 * lo soportan todos los entornos. `blobDeFoto()` reconstruye el Blob cuando hace falta.
 */
export interface Foto {
  id: string;
  nombre: string;
  /** JPEG comprimido en cliente (<= 1280px, q 0.7), o webm en el caso de la nota de voz. */
  bytes: ArrayBuffer;
  tipo: string;
  tomadaEn: string;
}

export type EstadoSync = "PENDIENTE" | "SINCRONIZADO" | "ERROR";

export interface RegistroItem {
  itemId: number;
  estado: Estado;
  /** Por defecto = criticidadRef del catalogo; editable por el inspector en modo oficina. */
  criticidad?: Criticidad;
  /** Solo aplica si estado es NO_OK o EN_PROC. */
  origen?: Origen;
  /** Solo si origen = REITERATIVO. */
  reiteracion?: Reiteracion;
  fechaVerif?: string;
  responsable?: string;
  plazo?: string;
  accionCorrectiva?: string;
  /** OBLIGATORIO >= 1 si estado es NO_OK o EN_PROC. Ver lib/validacion.ts. */
  evidencia: Foto[];
  /** Nota de voz opcional (MediaRecorder). Alternativa al tipeo en altura. */
  notaVoz?: Foto;
  estadoFinal?: EstadoFinal;
  /** MAYOR con plazo vencido sin cerrar (regla YPF). Se recalcula, no se persiste como verdad. */
  escaladoACritica?: boolean;
  observaciones?: string;
  /** Estado de subida de las fotos de este item a SharePoint (EQT-02). */
  sync?: EstadoSync;
  syncError?: string;
}

export interface ItemAdicional extends ItemCatalogo {
  recorridaId: string;
  promovidoACatalogo: boolean;
}

export interface Firmas {
  supervisor?: string;
  cr?: string;
  fecha?: string;
}

export interface Recorrida {
  id: string;
  /** Libre: "TACK-6 / TKR-06", "TACK-3". Se normaliza para cruzar historial. */
  equipo: string;
  empresa: string;
  operadora?: string;
  contrato?: string;
  /** ISO-8601 UTC. */
  fechaRelevamiento: string;
  pozoLocacion: string;
  /** Fecha (yyyy-MM-dd) de la proxima auditoria externa. */
  auditoriaProgramada?: string;
  equipoRecorrida: string;
  companyRepresentative?: string;
  /** Limitaciones de la recorrida, ej: "no se accedio a corona". */
  notas?: string;
  registros: RegistroItem[];
  itemsAdicionales: ItemAdicional[];
  firmas?: Firmas;
  cerrada: boolean;
  creadaEn: string;
  actualizadaEn: string;
  /** Indice del item en el que quedo el modo paso a paso. */
  indiceActual?: number;
  /** ID del item padre en SharePoint, una vez que EQT-01 respondio. */
  sharepointId?: number;
  folio?: string;
  /** URL del item en SharePoint devuelta por el flujo. Nunca hardcodear (skill seccion 9). */
  sharepointUrl?: string;
}

export const OPERADORAS: readonly string[] = ["YPF", "TotalEnergies", "Vista", "PAE", "Otra"];

export const EMPRESA_DEFAULT = "TACKER SRL";

/** Semilla de historial externo por equipo (informes de inspectoras no cargados en la app). */
export interface SemillaEquipo {
  equipo: string;
  referencia: string;
  /** itemId (como string) -> cantidad de informes externos previos donde aparecio. */
  aparicionesPrevias: Record<string, number>;
  /** Items corregidos en la ultima inspeccion: se precargan en OK con observacion. */
  corregidosUltimaInspeccion: number[];
  /** itemId -> nro de hallazgo en el iAuditor de la operadora. Solo informativo. */
  itemsIAuditorYPF?: Record<string, number>;
}

/** Una recorrida previa del mismo equipo, tal como la devuelve EQT-03 o el storage local. */
export interface RecorridaHistorial {
  folio: string;
  /** ISO-8601. */
  fecha: string;
  pozo: string;
  /** itemIds que estuvieron en NO_OK o EN_PROC en esa recorrida. */
  itemsNoConformes: number[];
}

export interface ConfiguracionApp {
  responsablesFrecuentes: string[];
  /** Orden de zonas por equipo normalizado, para que coincida con el recorrido fisico. */
  ordenZonasPorEquipo: Record<string, string[]>;
  altoContraste: boolean;
  semillas: SemillaEquipo[];
}

export const CONFIG_DEFAULT: ConfiguracionApp = {
  responsablesFrecuentes: [],
  ordenZonasPorEquipo: {},
  altoContraste: false,
  semillas: [],
};

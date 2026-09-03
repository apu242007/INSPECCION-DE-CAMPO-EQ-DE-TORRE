/**
 * Cliente de los 5 flujos de Power Automate.
 *
 * MODELO DE SEGURIDAD (ver README): estos endpoints son publicos y sin login. Las variables
 * VITE_* se inlinean en el bundle y son visibles para cualquiera que abra DevTools. La
 * `x-tacker-key` es un badén contra bots, NO autenticacion. Toda guarda con consecuencia
 * real se valida del lado del flujo.
 *
 * La config NO se lee de globals (skill, seccion 19.1): `import.meta.env` lo resuelve Vite en
 * build, y ademas `configurarApi()` permite inyectarla en los tests sin tocar el entorno.
 */

export type Endpoint = "EQT01" | "EQT02" | "EQT03" | "EQT04" | "EQT05";

interface ConfigApi {
  urls: Record<Endpoint, string>;
  key: string;
}

const env = import.meta.env as Record<string, string | undefined>;

let config: ConfigApi = {
  urls: {
    EQT01: env.VITE_EQT01_URL ?? "",
    EQT02: env.VITE_EQT02_URL ?? "",
    EQT03: env.VITE_EQT03_URL ?? "",
    EQT04: env.VITE_EQT04_URL ?? "",
    EQT05: env.VITE_EQT05_URL ?? "",
  },
  key: env.VITE_TACKER_KEY ?? "",
};

export function configurarApi(parcial: Partial<ConfigApi>): void {
  config = {
    urls: { ...config.urls, ...(parcial.urls ?? {}) },
    key: parcial.key ?? config.key,
  };
}

/** Sin URL de flujo configurada, la app corre en modo demo y no manda nada a la red. */
export function esModoDemo(endpoint: Endpoint = "EQT01"): boolean {
  const url = config.urls[endpoint];
  return !url || url.trim() === "" || url.startsWith("__");
}

export function urlDe(endpoint: Endpoint): string {
  return config.urls[endpoint];
}

export class ErrorApi extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly cuerpo?: string,
    /** Un 5xx o una falla de red se reintentan; un 4xx no (el payload no va a mejorar solo). */
    public readonly reintentable = true,
  ) {
    super(message);
    this.name = "ErrorApi";
  }
}

export interface RespuestaDemo {
  demo: true;
  endpoint: Endpoint;
  payload: unknown;
}

const TIMEOUT_MS = 100_000; // por debajo del gateway de Power Automate (~110 s)

/**
 * POST a un flujo. Content-Type application/json SIEMPRE: con text/plain el flujo recibe el
 * body como String y `triggerBody()?['x']` falla con "Property selection is not supported".
 */
export async function postFlujo<T>(
  endpoint: Endpoint,
  payload: unknown,
  opciones: { señal?: AbortSignal } = {},
): Promise<T | RespuestaDemo> {
  if (esModoDemo(endpoint)) {
    console.warn(`[demo] ${endpoint} sin URL configurada. Payload que se enviaría:`, payload);
    return { demo: true, endpoint, payload };
  }

  const controlador = new AbortController();
  const timeout = setTimeout(() => controlador.abort(), TIMEOUT_MS);
  opciones.señal?.addEventListener("abort", () => controlador.abort());

  try {
    const res = await fetch(config.urls[endpoint], {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(config.key ? { "x-tacker-key": config.key } : {}),
      },
      body: JSON.stringify(payload),
      signal: controlador.signal,
    });

    const texto = await res.text();
    if (!res.ok) {
      // 4xx = el payload esta mal; reintentarlo solo gasta cuota. 5xx / 408 / 429 si.
      const reintentable = res.status >= 500 || res.status === 408 || res.status === 429;
      throw new ErrorApi(
        `${endpoint} respondió ${res.status}`,
        res.status,
        texto.slice(0, 500),
        reintentable,
      );
    }

    // Un flujo con una rama sin accion Respuesta devuelve 202 sin cuerpo: es exito aparente
    // con datos vacios, el modo de falla mas caro de diagnosticar (skill, seccion 20.4).
    if (!texto.trim()) {
      throw new ErrorApi(`${endpoint} respondió ${res.status} sin cuerpo`, res.status, "", false);
    }

    try {
      return JSON.parse(texto) as T;
    } catch {
      throw new ErrorApi(`${endpoint} devolvió un cuerpo que no es JSON`, res.status, texto.slice(0, 500), false);
    }
  } catch (e) {
    if (e instanceof ErrorApi) throw e;
    const msg = e instanceof Error ? e.message : String(e);
    // Falla de red o timeout: reintentable, es exactamente el caso del campo sin señal.
    throw new ErrorApi(`${endpoint}: ${msg}`, 0, undefined, true);
  } finally {
    clearTimeout(timeout);
  }
}

export function esRespuestaDemo(r: unknown): r is RespuestaDemo {
  return typeof r === "object" && r !== null && (r as RespuestaDemo).demo === true;
}

// ------------------------------------------------------- contratos de cada flujo

export interface Adjunto {
  name: string;
  contentBase64: string;
}

export interface PayloadEQT01 {
  folio: string;
  equipo: string;
  empresa: string;
  operadora?: string;
  contrato?: string;
  fechaRelevamiento: string;
  pozo: string;
  auditoriaProgramada?: string;
  equipoRecorrida: string;
  companyRepresentative?: string;
  notas?: string;
  totalItems: number;
  itemsOK: number;
  itemsNoOK: number;
  itemsEnProc: number;
  itemsNA: number;
  itemsSinRevisar: number;
  reiterativos: number;
  nuevos: number;
  adicionales: number;
  pctAvance: number;
  semaforo: string;
  appVersion: string;
  items: ItemEQT01[];
  itemsAdicionales: ItemEQT01[];
  /** attachments[0] es SIEMPRE el PDF; despues las firmas. Las fotos NO van aca. */
  attachments: Adjunto[];
}

export interface ItemEQT01 {
  itemId: number;
  zona: string;
  itemTexto: string;
  criticidadRef: string;
  criticidad: string;
  estado: string;
  origen?: string;
  fuenteReiteracion?: string;
  vecesPrevias?: number;
  reiteracionAuto?: boolean;
  referenciaReiteracion?: string;
  fechaVerif?: string;
  responsable?: string;
  plazo?: string;
  accionCorrectiva?: string;
  estadoFinal?: string;
  escalado?: boolean;
  observaciones?: string;
  adicional: boolean;
  fotosCount: number;
  equipo: string;
}

export interface RespuestaEQT01 {
  recorridaId: number;
  folio: string;
  url?: string;
}

export interface PayloadEQT02 {
  recorridaId: number;
  itemId: number;
  fotos: Adjunto[];
  notaVoz?: Adjunto;
}

export interface PayloadEQT03 {
  equipo: string;
}

/**
 * El flujo devuelve los items NO conformes PLANOS, con su `recorridaId`, en vez de anidados
 * dentro de cada recorrida: anidarlos obligaria a un loop dentro de otro en Logic Apps, que es
 * fragil y lento. Agrupar del lado del cliente es una linea de JavaScript.
 */
export interface RespuestaEQT03 {
  recorridas: { folio: string; fecha: string; pozo: string; id: number }[];
  itemsNoConformes: { recorridaId: number; itemId: number }[];
  catalogoExtra?: {
    itemId: number;
    zona: string;
    criticidadRef: string;
    itemTexto: string;
    hallazgoTipico: string;
  }[];
}

export interface PayloadEQT04 {
  recorridaId: number;
  itemId: number;
  criticidad?: string;
  responsable?: string;
  plazo?: string;
  accionCorrectiva?: string;
  estadoFinal?: string;
  observaciones?: string;
  fotos?: Adjunto[];
}

export interface PayloadEQT05 {
  recorridaId: number;
  firmaSupervisor?: string;
  firmaCR?: string;
  firmas: Adjunto[];
  /** PDF final: reemplaza al de EQT-01 (delete + add attachment). */
  pdf?: Adjunto;
  itemsOK: number;
  itemsNoOK: number;
  itemsEnProc: number;
  itemsNA: number;
  pctAvance: number;
  semaforo: string;
}

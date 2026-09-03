import { clear, del, get, keys, set } from "idb-keyval";
import { CATALOGO, ID_BASE_PERSONALIZADOS } from "./data/catalogo";
import { SEMILLAS_INCLUIDAS } from "./data/semillas/tack6";
import { CONFIG_DEFAULT } from "./types";
import type {
  ConfiguracionApp,
  Foto,
  ItemCatalogo,
  Recorrida,
  RecorridaHistorial,
  SemillaEquipo,
} from "./types";
import { blobADataUrl, blobDeFoto } from "./lib/imageUtils";
import { itemsNoConformes } from "./lib/recorrida";
import { normalizarEquipo, validarRecorrida } from "./lib/validacion";

/**
 * Persistencia local (IndexedDB via idb-keyval).
 *
 * SharePoint es la fuente de verdad; esto es borrador + cola de envio + cache de historial,
 * para que la recorrida se haga sin señal y no se pierda nada.
 *
 * Las fotos viven como ArrayBuffer, no como base64: en un celular, duplicar cada foto en
 * memoria como string es la diferencia entre andar y que el navegador mate la pestaña.
 * Ver el comentario de `Foto` en types.ts para por que ArrayBuffer y no Blob.
 */

const V = "v1";
const K_RECORRIDA = (id: string) => `eqt:${V}:recorrida:${id}`;
const K_INDICE = `eqt:${V}:indice`;
const K_CONFIG = `eqt:${V}:config`;
const K_CATALOGO_EXTRA = `eqt:${V}:catalogoExtra`;
const K_HISTORIAL = (equipo: string) => `eqt:${V}:historial:${normalizarEquipo(equipo)}`;
const K_COLA = `eqt:${V}:cola`;

/**
 * Claves de versiones anteriores. Al cambiar la forma de la recorrida, se bumpea `V` y la
 * clave vieja se agrega aca: un borrador con la forma anterior restaurado en silencio es
 * peor que no tener borrador.
 */
const CLAVES_LEGACY: string[] = [];

async function purgarLegacy(): Promise<void> {
  if (CLAVES_LEGACY.length === 0) return;
  const todas = await keys();
  await Promise.all(
    todas
      .map(String)
      .filter((k) => CLAVES_LEGACY.some((p) => k.startsWith(p)))
      .map((k) => del(k)),
  );
}

export class ErrorValidacion extends Error {
  constructor(public readonly errores: string[]) {
    super(`Recorrida inválida:\n${errores.join("\n")}`);
    this.name = "ErrorValidacion";
  }
}

// ---------------------------------------------------------------- recorridas

export interface EntradaIndice {
  id: string;
  folio?: string;
  equipo: string;
  fechaRelevamiento: string;
  pozoLocacion: string;
  cerrada: boolean;
  actualizadaEn: string;
  sharepointId?: number;
}

async function leerIndice(): Promise<EntradaIndice[]> {
  return (await get<EntradaIndice[]>(K_INDICE)) ?? [];
}

async function escribirIndice(entradas: EntradaIndice[]): Promise<void> {
  await set(K_INDICE, entradas);
}

function aEntrada(r: Recorrida): EntradaIndice {
  return {
    id: r.id,
    folio: r.folio,
    equipo: r.equipo,
    fechaRelevamiento: r.fechaRelevamiento,
    pozoLocacion: r.pozoLocacion,
    cerrada: r.cerrada,
    actualizadaEn: r.actualizadaEn,
    sharepointId: r.sharepointId,
  };
}

/**
 * Guarda la recorrida. VALIDA antes de escribir: una recorrida con un NO_OK sin foto no
 * entra al storage, venga de la UI o de una importacion de JSON.
 */
export async function guardarRecorrida(recorrida: Recorrida): Promise<void> {
  const resultado = validarRecorrida(recorrida);
  if (!resultado.ok) throw new ErrorValidacion(resultado.errores);

  const conFecha: Recorrida = { ...recorrida, actualizadaEn: new Date().toISOString() };
  await set(K_RECORRIDA(conFecha.id), conFecha);

  const indice = await leerIndice();
  const i = indice.findIndex((e) => e.id === conFecha.id);
  if (i >= 0) indice[i] = aEntrada(conFecha);
  else indice.push(aEntrada(conFecha));
  await escribirIndice(indice);
}

/**
 * Guardado de borrador en curso, SIN validar. Es lo que usa el autoguardado con debounce
 * mientras el inspector todavia no saco la foto: si validara, no podria persistir el estado
 * intermedio y un cierre de pestaña se llevaria el trabajo.
 *
 * Nunca se usa para cerrar ni para enviar: para eso esta `guardarRecorrida`.
 */
export async function guardarBorrador(recorrida: Recorrida): Promise<void> {
  const conFecha: Recorrida = { ...recorrida, actualizadaEn: new Date().toISOString() };
  await set(K_RECORRIDA(conFecha.id), conFecha);
  const indice = await leerIndice();
  const i = indice.findIndex((e) => e.id === conFecha.id);
  if (i >= 0) indice[i] = aEntrada(conFecha);
  else indice.push(aEntrada(conFecha));
  await escribirIndice(indice);
}

export async function leerRecorrida(id: string): Promise<Recorrida | undefined> {
  await purgarLegacy();
  return get<Recorrida>(K_RECORRIDA(id));
}

export async function listarRecorridas(): Promise<EntradaIndice[]> {
  await purgarLegacy();
  const indice = await leerIndice();
  return indice.sort((a, b) => (a.actualizadaEn < b.actualizadaEn ? 1 : -1));
}

export async function borrarRecorrida(id: string): Promise<void> {
  await del(K_RECORRIDA(id));
  await escribirIndice((await leerIndice()).filter((e) => e.id !== id));
}

/** Equipos ya usados, para el autocompletar de la cabecera. */
export async function equiposConocidos(): Promise<string[]> {
  const indice = await leerIndice();
  return [...new Set(indice.map((e) => e.equipo))].sort((a, b) => a.localeCompare(b, "es"));
}

// ---------------------------------------------------------------- historial

/**
 * Historial que alimenta la propuesta de reiteracion: lo que devolvio EQT-03 (cacheado para
 * funcionar sin señal) UNIDO con las recorridas locales que todavia no se sincronizaron.
 * Sin esa union, dos recorridas seguidas offline no se ven entre si.
 */
export async function historialDeEquipo(
  equipo: string,
  excluirId?: string,
): Promise<RecorridaHistorial[]> {
  const remoto = (await get<RecorridaHistorial[]>(K_HISTORIAL(equipo))) ?? [];

  const indice = await leerIndice();
  const localesDelEquipo = indice.filter(
    (e) => normalizarEquipo(e.equipo) === normalizarEquipo(equipo) && e.id !== excluirId,
  );

  const locales: RecorridaHistorial[] = [];
  for (const entrada of localesDelEquipo) {
    const r = await get<Recorrida>(K_RECORRIDA(entrada.id));
    if (!r) continue;
    locales.push({
      folio: r.folio ?? r.id,
      fecha: r.fechaRelevamiento,
      pozo: r.pozoLocacion,
      itemsNoConformes: itemsNoConformes(r),
    });
  }

  // El remoto puede traer la misma recorrida que ya esta local (se sincronizo y quedo el
  // borrador). Se deduplica por folio, quedandose con la version local.
  const porFolio = new Map<string, RecorridaHistorial>();
  for (const h of remoto) porFolio.set(h.folio, h);
  for (const h of locales) porFolio.set(h.folio, h);
  return [...porFolio.values()].sort((a, b) => (a.fecha < b.fecha ? 1 : -1));
}

export async function guardarHistorialRemoto(
  equipo: string,
  historial: RecorridaHistorial[],
): Promise<void> {
  await set(K_HISTORIAL(equipo), historial);
}

// ---------------------------------------------------------------- catalogo extra

export async function leerCatalogoExtra(): Promise<ItemCatalogo[]> {
  return (await get<ItemCatalogo[]>(K_CATALOGO_EXTRA)) ?? [];
}

/** Catalogo base + items promovidos por el usuario, fusionados en runtime. */
export async function catalogoCompleto(): Promise<ItemCatalogo[]> {
  return [...CATALOGO, ...(await leerCatalogoExtra())];
}

export async function promoverACatalogo(item: Omit<ItemCatalogo, "id">): Promise<ItemCatalogo> {
  const extra = await leerCatalogoExtra();
  const siguienteId = Math.max(ID_BASE_PERSONALIZADOS - 1, ...extra.map((e) => e.id)) + 1;
  const nuevo: ItemCatalogo = { ...item, id: siguienteId, personalizado: true };
  await set(K_CATALOGO_EXTRA, [...extra, nuevo]);
  return nuevo;
}

export async function guardarCatalogoExtra(items: ItemCatalogo[]): Promise<void> {
  await set(K_CATALOGO_EXTRA, items);
}

// ---------------------------------------------------------------- configuracion

export async function leerConfig(): Promise<ConfiguracionApp> {
  const guardada = await get<ConfiguracionApp>(K_CONFIG);
  if (!guardada) return { ...CONFIG_DEFAULT, semillas: [...SEMILLAS_INCLUIDAS] };
  return {
    ...CONFIG_DEFAULT,
    ...guardada,
    // Las semillas incluidas en la app siempre estan; las importadas pisan por equipo.
    semillas: fusionarSemillas(SEMILLAS_INCLUIDAS, guardada.semillas ?? []),
  };
}

function fusionarSemillas(
  base: readonly SemillaEquipo[],
  extra: readonly SemillaEquipo[],
): SemillaEquipo[] {
  const porEquipo = new Map<string, SemillaEquipo>();
  for (const s of base) porEquipo.set(normalizarEquipo(s.equipo), s);
  for (const s of extra) porEquipo.set(normalizarEquipo(s.equipo), s);
  return [...porEquipo.values()];
}

export async function guardarConfig(config: ConfiguracionApp): Promise<void> {
  await set(K_CONFIG, config);
}

export async function semillaDeEquipo(equipo: string): Promise<SemillaEquipo | undefined> {
  const config = await leerConfig();
  return config.semillas.find((s) => normalizarEquipo(s.equipo) === normalizarEquipo(equipo));
}

// ---------------------------------------------------------------- cola de envio

export interface TareaCola {
  id: string;
  recorridaId: string;
  /** EQT-01 crea la recorrida; EQT-02 sube las fotos de UN item. */
  tipo: "CREAR" | "FOTOS";
  itemId?: number;
  intentos: number;
  ultimoError?: string;
  creadaEn: string;
}

export async function leerCola(): Promise<TareaCola[]> {
  return (await get<TareaCola[]>(K_COLA)) ?? [];
}

export async function guardarCola(cola: TareaCola[]): Promise<void> {
  await set(K_COLA, cola);
}

export async function encolar(tareas: TareaCola[]): Promise<void> {
  const cola = await leerCola();
  const existentes = new Set(cola.map((t) => t.id));
  await guardarCola([...cola, ...tareas.filter((t) => !existentes.has(t.id))]);
}

export async function quitarDeCola(idTarea: string): Promise<void> {
  await guardarCola((await leerCola()).filter((t) => t.id !== idTarea));
}

// ---------------------------------------------------------------- export / import

/**
 * Importa una recorrida desde JSON. Valida con las MISMAS reglas que la UI: un JSON con un
 * NO_OK sin foto se rechaza con el detalle de que items fallan.
 *
 * Las fotos viajan como dataURL en el JSON (un Blob no sobrevive JSON.stringify) y se
 * rehidratan a Blob aca.
 */
export async function importarRecorridaJSON(json: string): Promise<Recorrida> {
  let cruda: unknown;
  try {
    cruda = JSON.parse(json);
  } catch {
    throw new ErrorValidacion(["El archivo no es un JSON válido."]);
  }
  const recorrida = rehidratar(cruda as Recorrida);
  const resultado = validarRecorrida(recorrida);
  if (!resultado.ok) throw new ErrorValidacion(resultado.errores);
  await guardarRecorrida(recorrida);
  return recorrida;
}

interface FotoSerializada {
  id: string;
  nombre: string;
  dataUrl: string;
  tomadaEn: string;
}

/** dataURL -> ArrayBuffer, sin pasar por Blob (evita un await en la rehidratacion). */
function bytesDeDataUrl(dataUrl: string): ArrayBuffer {
  const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

function rehidratar(cruda: Recorrida): Recorrida {
  const fotos = (lista: unknown): Foto[] =>
    ((lista as FotoSerializada[] | undefined) ?? []).map((f) => ({
      id: f.id,
      nombre: f.nombre,
      bytes: bytesDeDataUrl(f.dataUrl),
      tipo: /data:([^;]+)/.exec(f.dataUrl)?.[1] ?? "image/jpeg",
      tomadaEn: f.tomadaEn,
    }));

  return {
    ...cruda,
    registros: (cruda.registros ?? []).map((r) => ({ ...r, evidencia: fotos(r.evidencia) })),
    itemsAdicionales: cruda.itemsAdicionales ?? [],
  };
}

/** Serializa la recorrida a JSON con las fotos como dataURL (un Blob no sobrevive stringify). */
export async function exportarRecorridaJSON(recorrida: Recorrida): Promise<string> {
  const serializarFoto = async (f: Foto): Promise<FotoSerializada> => ({
    id: f.id,
    nombre: f.nombre,
    dataUrl: await blobADataUrl(blobDeFoto(f)),
    tomadaEn: f.tomadaEn,
  });

  const registros = [];
  for (const r of recorrida.registros) {
    registros.push({
      ...r,
      evidencia: await Promise.all(r.evidencia.map(serializarFoto)),
      notaVoz: r.notaVoz ? await serializarFoto(r.notaVoz) : undefined,
    });
  }
  return JSON.stringify({ ...recorrida, registros }, null, 2);
}

/** Backup completo del storage local. El respaldo real es SharePoint; esto es conveniencia. */
export async function exportarTodoJSON(): Promise<string> {
  const indice = await listarRecorridas();
  const recorridas: unknown[] = [];
  for (const e of indice) {
    const r = await leerRecorrida(e.id);
    if (r) recorridas.push(JSON.parse(await exportarRecorridaJSON(r)));
  }
  return JSON.stringify(
    {
      version: V,
      exportadoEn: new Date().toISOString(),
      config: await leerConfig(),
      catalogoExtra: await leerCatalogoExtra(),
      recorridas,
    },
    null,
    2,
  );
}

export async function borrarTodo(): Promise<void> {
  await clear();
}

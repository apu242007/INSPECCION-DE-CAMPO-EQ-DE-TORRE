import { CATALOGO_POR_ID } from "../data/catalogo";
import { blobABase64, blobDeFoto, bytesDeBase64, comprimirImagen, nombreFoto } from "../lib/imageUtils";
import { calcularKPIs, calcularSemaforo, criticidadEfectiva, estaEscalado } from "../lib/metrics";
import type { Foto, ItemCatalogo, Recorrida, RegistroItem } from "../types";
import * as storage from "../storage";
import type { TareaCola } from "../storage";
import {
  ErrorApi,
  type Adjunto,
  type ItemEQT01,
  type PayloadEQT01,
  type PayloadEQT02,
  type PayloadEQT05,
  type RespuestaEQT01,
  type RespuestaEQT03,
  esModoDemo,
  esRespuestaDemo,
  postFlujo,
} from "./api";

/**
 * Sincronizacion con SharePoint.
 *
 * Contrato con el resto de la app:
 *   1. Durante la recorrida todo vive en IndexedDB. Nada toca la red.
 *   2. "Enviar a SharePoint" genera el PDF, hace EQT-01 (cabecera + items SIN fotos) y encola
 *      un EQT-02 por cada item con fotos. Una llamada por item mantiene cada POST bien por
 *      debajo del limite de payload y del gateway de ~110 s.
 *   3. La cola se procesa en serie con 3 reintentos y backoff. Si se corta la señal, se
 *      retoma sola al volver la conexion o al abrir la app.
 *   4. El borrador se borra SOLO cuando EQT-01 y toda la cola terminaron OK. Nunca antes:
 *      perder una recorrida de 94 items por un 502 no es una opcion.
 */

export const APP_VERSION = "1.0.0";

/** Cap del PDF en base64. Por encima, se re-comprimen las fotos que van dentro del PDF. */
export const MAX_PDF_BYTES = 4 * 1024 * 1024;

/**
 * Ritmo de reintento. Configurable porque el valor bueno depende del contexto: en campo
 * conviene esperar (la señal vuelve sola), en los tests no tiene sentido dormir 5 segundos.
 */
let reintentosMax = 3;
let backoffMs = [1_000, 4_000, 10_000];

/**
 * Escala de espera aparte para el 404 de EQT-02.
 *
 * Ese 404 no dice "el payload está mal": dice "la fila hija todavía no existe". EQT-01
 * devuelve 200 apenas crea la cabecera —su acción `Respuesta` va ANTES de los bucles, para no
 * morir en el gateway de ~110 s— y la SPA arranca la cola con ese 200. La primera llamada de
 * un ítem puede llegar segundos antes que su fila.
 *
 * Medido en producción el 4/9/2026: cabecera creada 15:03:45, primer EQT-02 con 404 a las
 * 15:03:48, la MISMA llamada OK a las 15:04:35. Por eso los tramos son largos y suman ~65 s.
 *
 * El reintento con espera ES el sondeo: desde el cliente no hay forma de preguntarle a
 * SharePoint si la fila ya está. Y lo paga solo el PRIMER ítem de la tanda — cuando aparece
 * su fila, ya están todas, así que el resto de la cola pasa de largo.
 */
let backoffFilaPendienteMs = [5_000, 10_000, 20_000, 30_000];

export function configurarSync(opts: {
  reintentosMax?: number;
  backoffMs?: number[];
  backoffFilaPendienteMs?: number[];
}): void {
  if (opts.reintentosMax !== undefined) reintentosMax = opts.reintentosMax;
  if (opts.backoffMs !== undefined) backoffMs = opts.backoffMs;
  if (opts.backoffFilaPendienteMs !== undefined) {
    backoffFilaPendienteMs = opts.backoffFilaPendienteMs;
  }
}

export interface EstadoSincronizacion {
  recorridaId: string;
  enviando: boolean;
  itemsConFotos: number;
  itemsSubidos: number;
  itemsEnError: number;
  bytesEnviados: number;
  ultimoError?: string;
  terminada: boolean;
}

type Escucha = (estado: EstadoSincronizacion) => void;
const escuchas = new Set<Escucha>();

export function suscribirSync(fn: Escucha): () => void {
  escuchas.add(fn);
  return () => escuchas.delete(fn);
}

function emitir(estado: EstadoSincronizacion): void {
  for (const fn of escuchas) fn(estado);
}

// ------------------------------------------------------------------ payload

async function adjuntoDeFoto(foto: Foto, nombre: string): Promise<Adjunto> {
  // Capa 2 de compresion: red de seguridad por si algun camino salteo la del file picker.
  const comprimida = await comprimirImagen(blobDeFoto(foto));
  return { name: nombre, contentBase64: await blobABase64(comprimida) };
}

function itemAPayload(
  registro: RegistroItem,
  info: ItemCatalogo | undefined,
  equipo: string,
  adicional: boolean,
  hoy: Date,
): ItemEQT01 {
  const criticidad = criticidadEfectiva(registro, CATALOGO_POR_ID);
  return {
    itemId: registro.itemId,
    zona: info?.zona ?? "Sin zona",
    itemTexto: info?.item ?? `Ítem ${registro.itemId}`,
    criticidadRef: info?.criticidadRef ?? "GENERAL",
    criticidad,
    estado: registro.estado,
    origen: registro.origen,
    fuenteReiteracion: registro.reiteracion?.fuente,
    vecesPrevias: registro.reiteracion?.vecesPrevias,
    reiteracionAuto: registro.reiteracion?.detectadaAutomaticamente,
    referenciaReiteracion: registro.reiteracion?.referencia,
    fechaVerif: registro.fechaVerif,
    responsable: registro.responsable,
    plazo: registro.plazo,
    accionCorrectiva: registro.accionCorrectiva,
    estadoFinal: registro.estadoFinal,
    escalado: estaEscalado(registro, CATALOGO_POR_ID, hoy),
    observaciones: registro.observaciones,
    adicional,
    fotosCount: registro.evidencia.length,
    equipo,
  };
}

/**
 * Arma el payload de EQT-01. Se guardan TODAS las filas de items, tambien las OK: estas
 * listas alimentan despues Power BI y un dashboard sin los OK no puede calcular avance.
 */
export async function construirPayloadEQT01(
  recorrida: Recorrida,
  pdf: Blob,
  catalogo: ReadonlyMap<number, ItemCatalogo> = CATALOGO_POR_ID,
  hoy: Date = new Date(),
): Promise<PayloadEQT01> {
  const kpis = calcularKPIs(recorrida, catalogo, hoy);
  const folio = recorrida.folio ?? recorrida.id;

  const attachments: Adjunto[] = [
    { name: `Recorrida-${folio}.pdf`, contentBase64: await blobABase64(pdf) },
  ];
  if (recorrida.firmas?.supervisor) {
    attachments.push({
      name: "firma-supervisor.png",
      contentBase64: recorrida.firmas.supervisor.split(",")[1] ?? "",
    });
  }
  if (recorrida.firmas?.cr) {
    attachments.push({
      name: "firma-cr.png",
      contentBase64: recorrida.firmas.cr.split(",")[1] ?? "",
    });
  }

  const idsAdicionales = new Set(recorrida.itemsAdicionales.map((a) => a.id));
  const items: ItemEQT01[] = [];
  const itemsAdicionales: ItemEQT01[] = [];

  for (const registro of recorrida.registros) {
    const esAdicional = idsAdicionales.has(registro.itemId);
    const info = esAdicional
      ? recorrida.itemsAdicionales.find((a) => a.id === registro.itemId)
      : catalogo.get(registro.itemId);
    const fila = itemAPayload(registro, info, recorrida.equipo, esAdicional, hoy);
    if (esAdicional) itemsAdicionales.push(fila);
    else items.push(fila);
  }

  return {
    folio,
    equipo: recorrida.equipo,
    empresa: recorrida.empresa,
    operadora: recorrida.operadora,
    contrato: recorrida.contrato,
    fechaRelevamiento: recorrida.fechaRelevamiento,
    pozo: recorrida.pozoLocacion,
    auditoriaProgramada: recorrida.auditoriaProgramada,
    equipoRecorrida: recorrida.equipoRecorrida,
    companyRepresentative: recorrida.companyRepresentative,
    notas: recorrida.notas,
    totalItems: kpis.total,
    itemsOK: kpis.ok,
    itemsNoOK: kpis.noOk,
    itemsEnProc: kpis.enProc,
    itemsNA: kpis.na,
    itemsSinRevisar: kpis.sinRevisar,
    reiterativos: kpis.noOkReiterativos,
    nuevos: kpis.noOkNuevos,
    adicionales: kpis.adicionales,
    pctAvance: kpis.pctAvance,
    semaforo: calcularSemaforo(recorrida, catalogo, hoy),
    appVersion: APP_VERSION,
    items,
    itemsAdicionales,
    attachments,
  };
}

export async function construirPayloadEQT02(
  recorridaId: number,
  registro: RegistroItem,
): Promise<PayloadEQT02> {
  const fotos: Adjunto[] = [];
  for (let i = 0; i < registro.evidencia.length; i += 1) {
    fotos.push(await adjuntoDeFoto(registro.evidencia[i], nombreFoto(registro.itemId, i)));
  }
  const payload: PayloadEQT02 = { recorridaId, itemId: registro.itemId, fotos };
  if (registro.notaVoz) {
    payload.notaVoz = {
      name: `item-${registro.itemId}-nota.webm`,
      contentBase64: await blobABase64(blobDeFoto(registro.notaVoz)),
    };
  }
  return payload;
}

// ------------------------------------------------------------------ envio

function idTarea(recorridaId: string, tipo: string, itemId?: number): string {
  return `${recorridaId}:${tipo}${itemId !== undefined ? `:${itemId}` : ""}`;
}

async function esperar(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Envia la recorrida completa: EQT-01 y despues la cola de EQT-02.
 * Devuelve el estado final. El borrador NO se toca aca: lo decide el llamador con
 * `puedeLimpiarBorrador`, y solo si todo termino OK.
 */
export async function enviarRecorrida(
  recorrida: Recorrida,
  pdf: Blob,
): Promise<EstadoSincronizacion> {
  const conFotos = recorrida.registros.filter((r) => r.evidencia.length > 0);
  const estado: EstadoSincronizacion = {
    recorridaId: recorrida.id,
    enviando: true,
    itemsConFotos: conFotos.length,
    itemsSubidos: 0,
    itemsEnError: 0,
    bytesEnviados: 0,
    terminada: false,
  };
  emitir(estado);

  try {
    // --- EQT-01 -------------------------------------------------------------
    let sharepointId = recorrida.sharepointId;
    if (sharepointId === undefined) {
      const payload = await construirPayloadEQT01(recorrida, pdf);

      const bytesPdf = bytesDeBase64(payload.attachments[0]?.contentBase64 ?? "");
      estado.bytesEnviados += bytesPdf;
      if (bytesPdf > MAX_PDF_BYTES) {
        // Las fotos originales viajan igual por EQT-02; lo que se recorta es el PDF.
        throw new Error(
          `El PDF pesa ${(bytesPdf / 1024 / 1024).toFixed(1)} MB (máximo ${
            MAX_PDF_BYTES / 1024 / 1024
          } MB). Volvé a generarlo con menos calidad de fotos.`,
        );
      }

      const respuesta = await postFlujo<RespuestaEQT01>("EQT01", payload);
      if (esRespuestaDemo(respuesta)) {
        estado.enviando = false;
        estado.terminada = true;
        emitir(estado);
        return estado;
      }
      sharepointId = respuesta.recorridaId;

      await storage.guardarBorrador({
        ...recorrida,
        sharepointId,
        folio: respuesta.folio ?? recorrida.folio,
        sharepointUrl: respuesta.url,
      });
    }

    // --- cola de EQT-02 -----------------------------------------------------
    await storage.encolar(
      conFotos.map((r) => ({
        id: idTarea(recorrida.id, "FOTOS", r.itemId),
        recorridaId: recorrida.id,
        tipo: "FOTOS" as const,
        itemId: r.itemId,
        intentos: 0,
        creadaEn: new Date().toISOString(),
      })),
    );

    return await procesarCola(recorrida.id, estado);
  } catch (e) {
    estado.enviando = false;
    estado.ultimoError = e instanceof Error ? e.message : String(e);
    emitir(estado);
    return estado;
  }
}

/**
 * Procesa la cola en serie. Cada tarea reintenta hasta 3 veces con backoff; si agota los
 * intentos queda en la cola marcada como error, con boton de reintento en la UI.
 */
export async function procesarCola(
  recorridaId?: string,
  estadoInicial?: EstadoSincronizacion,
): Promise<EstadoSincronizacion> {
  const cola = (await storage.leerCola()).filter(
    (t) => !recorridaId || t.recorridaId === recorridaId,
  );

  const estado: EstadoSincronizacion = estadoInicial ?? {
    recorridaId: recorridaId ?? "",
    enviando: true,
    itemsConFotos: cola.length,
    itemsSubidos: 0,
    itemsEnError: 0,
    bytesEnviados: 0,
    terminada: false,
  };
  estado.enviando = true;

  for (const tarea of cola) {
    const recorrida = await storage.leerRecorrida(tarea.recorridaId);
    if (!recorrida?.sharepointId) {
      // Sin id de SharePoint no hay a que adjuntar: la tarea espera al EQT-01.
      continue;
    }
    const registro = recorrida.registros.find((r) => r.itemId === tarea.itemId);
    if (!registro || registro.evidencia.length === 0) {
      await storage.quitarDeCola(tarea.id);
      continue;
    }

    const resultado = await subirFotosConReintento(recorrida, registro, tarea);
    if (resultado.ok) {
      estado.itemsSubidos += 1;
      estado.bytesEnviados += resultado.bytes;
      await storage.quitarDeCola(tarea.id);
      await marcarSync(tarea.recorridaId, tarea.itemId as number, "SINCRONIZADO");
    } else {
      estado.itemsEnError += 1;
      estado.ultimoError = resultado.error;
      await marcarSync(tarea.recorridaId, tarea.itemId as number, "ERROR", resultado.error);
    }
    emitir({ ...estado });
  }

  estado.enviando = false;
  estado.terminada = estado.itemsEnError === 0;
  emitir({ ...estado });
  return estado;
}

async function subirFotosConReintento(
  recorrida: Recorrida,
  registro: RegistroItem,
  tarea: TareaCola,
): Promise<{ ok: true; bytes: number } | { ok: false; error: string }> {
  const payload = await construirPayloadEQT02(recorrida.sharepointId as number, registro);
  const bytes = payload.fotos.reduce((a, f) => a + bytesDeBase64(f.contentBase64), 0);

  let ultimoError = "";
  let ultimoStatus = 0;
  // Dos contadores, porque son dos fallas distintas: la red que se cortó, y la fila que
  // todavía no está. Sondear por lo segundo no puede gastar los reintentos de lo primero.
  let intentos = tarea.intentos;
  let esperasFila = 0;

  for (;;) {
    try {
      const r = await postFlujo("EQT02", payload);
      if (esRespuestaDemo(r)) return { ok: true, bytes: 0 };
      return { ok: true, bytes };
    } catch (e) {
      ultimoError = e instanceof Error ? e.message : String(e);
      const status = e instanceof ErrorApi ? e.status : 0;
      ultimoStatus = status;
      await registrarIntento(tarea.id, intentos + esperasFila + 1, ultimoError);

      // 404 = la fila hija todavía no existe. Se sondea con su propia escala, acotada.
      if (status === 404 && esperasFila < backoffFilaPendienteMs.length) {
        await esperar(backoffFilaPendienteMs[esperasFila]);
        esperasFila += 1;
        continue;
      }

      const reintentable = e instanceof ErrorApi ? e.reintentable : true;
      intentos += 1;
      if (!reintentable || intentos >= reintentosMax) break;
      await esperar(backoffMs[intentos - 1] ?? 10_000);
    }
  }

  // "EQT02 respondió 404" no le dice nada a nadie parado abajo del mástil. Lo que pasó tiene
  // nombre y tiene salida: la fila del ítem todavía no estaba, y se reintenta.
  if (ultimoStatus === 404) {
    return {
      ok: false,
      error:
        "SharePoint todavía no había terminado de crear la fila de este ítem. " +
        "Las fotos siguen guardadas: tocá «Reintentar» en un minuto.",
    };
  }

  return { ok: false, error: ultimoError };
}

async function registrarIntento(id: string, intentos: number, error: string): Promise<void> {
  const cola = await storage.leerCola();
  const i = cola.findIndex((t) => t.id === id);
  if (i >= 0) {
    cola[i] = { ...cola[i], intentos, ultimoError: error };
    await storage.guardarCola(cola);
  }
}

async function marcarSync(
  recorridaId: string,
  itemId: number,
  sync: RegistroItem["sync"],
  syncError?: string,
): Promise<void> {
  const r = await storage.leerRecorrida(recorridaId);
  if (!r) return;
  await storage.guardarBorrador({
    ...r,
    registros: r.registros.map((reg) =>
      reg.itemId === itemId ? { ...reg, sync, syncError } : reg,
    ),
  });
}

/** Solo se limpia el borrador si EQT-01 respondio y no queda nada en la cola. */
export async function puedeLimpiarBorrador(recorridaId: string): Promise<boolean> {
  const r = await storage.leerRecorrida(recorridaId);
  if (!r?.sharepointId) return false;
  const cola = await storage.leerCola();
  return cola.filter((t) => t.recorridaId === recorridaId).length === 0;
}

/** Reintenta las tareas que quedaron en error, reseteando el contador de intentos. */
export async function reintentarPendientes(recorridaId: string): Promise<EstadoSincronizacion> {
  const cola = await storage.leerCola();
  await storage.guardarCola(
    cola.map((t) => (t.recorridaId === recorridaId ? { ...t, intentos: 0 } : t)),
  );
  return procesarCola(recorridaId);
}

// ------------------------------------------------------------------ historial

/** Refresca el historial del equipo desde EQT-03 y lo cachea para funcionar sin señal. */
export async function refrescarHistorial(equipo: string): Promise<boolean> {
  if (esModoDemo("EQT03")) return false;
  try {
    const r = await postFlujo<RespuestaEQT03>("EQT03", { equipo });
    if (esRespuestaDemo(r)) return false;

    // Los items vienen planos: se agrupan por recorrida aca (ver Flow-EQT-03.md).
    const porRecorrida = new Map<number, number[]>();
    for (const it of r.itemsNoConformes ?? []) {
      const lista = porRecorrida.get(it.recorridaId);
      if (lista) lista.push(it.itemId);
      else porRecorrida.set(it.recorridaId, [it.itemId]);
    }

    await storage.guardarHistorialRemoto(
      equipo,
      (r.recorridas ?? []).map((rec) => ({
        folio: rec.folio,
        fecha: rec.fecha,
        pozo: rec.pozo,
        itemsNoConformes: porRecorrida.get(rec.id) ?? [],
      })),
    );

    if (r.catalogoExtra?.length) {
      await storage.guardarCatalogoExtra(
        r.catalogoExtra.map((c) => ({
          id: c.itemId,
          zona: c.zona,
          criticidadRef: c.criticidadRef as ItemCatalogo["criticidadRef"],
          item: c.itemTexto,
          hallazgoTipico: c.hallazgoTipico,
          personalizado: true,
        })),
      );
    }
    return true;
  } catch (e) {
    console.warn("[sync] no se pudo refrescar el historial:", e);
    return false;
  }
}

// ------------------------------------------------------------------ cierre

export async function cerrarEnSharePoint(
  recorrida: Recorrida,
  pdfFinal: Blob,
): Promise<boolean> {
  if (!recorrida.sharepointId) return false;
  const kpis = calcularKPIs(recorrida, CATALOGO_POR_ID);

  const firmas: Adjunto[] = [];
  if (recorrida.firmas?.supervisor) {
    firmas.push({
      name: "firma-supervisor.png",
      contentBase64: recorrida.firmas.supervisor.split(",")[1] ?? "",
    });
  }
  if (recorrida.firmas?.cr) {
    firmas.push({ name: "firma-cr.png", contentBase64: recorrida.firmas.cr.split(",")[1] ?? "" });
  }

  const payload: PayloadEQT05 = {
    recorridaId: recorrida.sharepointId,
    firmaSupervisor: recorrida.firmas?.supervisor ? "Firmado" : undefined,
    firmaCR: recorrida.firmas?.cr ? "Firmado" : undefined,
    firmas,
    pdf: {
      name: `Recorrida-${recorrida.folio ?? recorrida.id}.pdf`,
      contentBase64: await blobABase64(pdfFinal),
    },
    itemsOK: kpis.ok,
    itemsNoOK: kpis.noOk,
    itemsEnProc: kpis.enProc,
    itemsNA: kpis.na,
    pctAvance: kpis.pctAvance,
    semaforo: calcularSemaforo(recorrida, CATALOGO_POR_ID),
  };

  const r = await postFlujo("EQT05", payload);
  return !esRespuestaDemo(r);
}

// ------------------------------------------------------------------ auto-retoma

let arrancado = false;

/** Retoma la cola al volver la conexion y al abrir la app. */
export function iniciarAutoSync(): void {
  if (arrancado || typeof window === "undefined") return;
  arrancado = true;

  const intentar = () => {
    if (!navigator.onLine) return;
    void procesarCola().catch((e) => console.warn("[sync] cola:", e));
  };

  window.addEventListener("online", intentar);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") intentar();
  });
  intentar();
}

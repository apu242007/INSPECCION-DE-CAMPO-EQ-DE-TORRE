import type { Criticidad, Estado, ItemCatalogo, Recorrida, RegistroItem, Semaforo } from "../types";

/**
 * KPIs, tabla por zona, semaforo y escalado.
 *
 * Reglas de negocio que vienen del formulario de verificacion de hallazgos de YPF:
 *  - CRITICO: resolucion el mismo dia. Semaforo ROJO mientras haya uno abierto.
 *  - MAYOR:   <= 15 dias. Vencido sin cerrar PASA A CRITICO (escalado).
 *  - MENOR:   plazo acordado, sugerido +30 dias.
 *  - GENERAL: sin plazo obligatorio.
 */

export interface KPIs {
  total: number;
  ok: number;
  noOk: number;
  enProc: number;
  na: number;
  sinRevisar: number;
  /** % avance = OK / (total - N/A). Excluye N/A del denominador. */
  pctAvance: number;
  noOkNuevos: number;
  noOkReiterativos: number;
  adicionales: number;
  /** No conformes (NO_OK + EN_PROC) por criticidad efectiva, ya con escalado aplicado. */
  porCriticidad: Record<Criticidad, number>;
  escalados: number;
}

/** Criticidad efectiva del registro: la editada por el inspector, o la de referencia. */
export function criticidadEfectiva(
  registro: RegistroItem,
  catalogo: ReadonlyMap<number, ItemCatalogo>,
): Criticidad {
  return registro.criticidad ?? catalogo.get(registro.itemId)?.criticidadRef ?? "GENERAL";
}

function esNoConforme(estado: Estado): boolean {
  return estado === "NO_OK" || estado === "EN_PROC";
}

/**
 * MAYOR con plazo vencido y sin cerrar escala a CRITICA. Se calcula, no se persiste como
 * verdad: el mismo registro cambia de estado con solo pasar el tiempo.
 */
export function estaEscalado(
  registro: RegistroItem,
  catalogo: ReadonlyMap<number, ItemCatalogo>,
  hoy: Date = new Date(),
): boolean {
  if (criticidadEfectiva(registro, catalogo) !== "MAYOR") return false;
  if (!esNoConforme(registro.estado)) return false;
  if (registro.estadoFinal === "CERRADO") return false;
  if (!registro.plazo) return false;
  return diasHasta(registro.plazo, hoy) < 0;
}

/** Criticidad para priorizar y para el semaforo: MAYOR escalado cuenta como CRITICA. */
export function criticidadConEscalado(
  registro: RegistroItem,
  catalogo: ReadonlyMap<number, ItemCatalogo>,
  hoy: Date = new Date(),
): Criticidad {
  return estaEscalado(registro, catalogo, hoy) ? "CRITICA" : criticidadEfectiva(registro, catalogo);
}

/** Dias desde hoy hasta la fecha yyyy-MM-dd. Negativo = vencido. */
export function diasHasta(fecha: string, hoy: Date = new Date()): number {
  const objetivo = new Date(`${fecha}T00:00:00`);
  if (Number.isNaN(objetivo.getTime())) return Number.POSITIVE_INFINITY;
  const base = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
  return Math.round((objetivo.getTime() - base.getTime()) / 86_400_000);
}

export function calcularKPIs(
  recorrida: Recorrida,
  catalogo: ReadonlyMap<number, ItemCatalogo>,
  hoy: Date = new Date(),
): KPIs {
  const registros = recorrida.registros;
  const conteo = (e: Estado) => registros.filter((r) => r.estado === e).length;

  const ok = conteo("OK");
  const noOk = conteo("NO_OK");
  const enProc = conteo("EN_PROC");
  const na = conteo("NA");
  const sinRevisar = conteo("SIN_REVISAR");
  const total = registros.length;

  const denominador = total - na;
  const pctAvance = denominador <= 0 ? 100 : Math.round((ok / denominador) * 1000) / 10;

  const noConformes = registros.filter((r) => esNoConforme(r.estado));
  const porCriticidad: Record<Criticidad, number> = { CRITICA: 0, MAYOR: 0, MENOR: 0, GENERAL: 0 };
  let escalados = 0;
  for (const r of noConformes) {
    porCriticidad[criticidadConEscalado(r, catalogo, hoy)] += 1;
    if (estaEscalado(r, catalogo, hoy)) escalados += 1;
  }

  return {
    total,
    ok,
    noOk,
    enProc,
    na,
    sinRevisar,
    pctAvance,
    noOkNuevos: noConformes.filter((r) => r.origen === "NUEVO").length,
    noOkReiterativos: noConformes.filter((r) => r.origen === "REITERATIVO").length,
    adicionales: recorrida.itemsAdicionales.length,
    porCriticidad,
    escalados,
  };
}

export interface FilaZona {
  zona: string;
  total: number;
  ok: number;
  noOk: number;
  enProc: number;
  na: number;
  sinRevisar: number;
  reiterativos: number;
  /** % OK sobre el total de la zona menos N/A. */
  pctOk: number;
}

export function resumenPorZona(
  recorrida: Recorrida,
  catalogo: ReadonlyMap<number, ItemCatalogo>,
): FilaZona[] {
  const porZona = new Map<string, RegistroItem[]>();
  for (const r of recorrida.registros) {
    const zona = catalogo.get(r.itemId)?.zona ?? "Sin zona";
    const lista = porZona.get(zona);
    if (lista) lista.push(r);
    else porZona.set(zona, [r]);
  }

  const filas: FilaZona[] = [];
  for (const [zona, registros] of porZona) {
    const c = (e: Estado) => registros.filter((r) => r.estado === e).length;
    const na = c("NA");
    const ok = c("OK");
    const denominador = registros.length - na;
    filas.push({
      zona,
      total: registros.length,
      ok,
      noOk: c("NO_OK"),
      enProc: c("EN_PROC"),
      na,
      sinRevisar: c("SIN_REVISAR"),
      reiterativos: registros.filter((r) => esNoConforme(r.estado) && r.origen === "REITERATIVO")
        .length,
      pctOk: denominador <= 0 ? 100 : Math.round((ok / denominador) * 1000) / 10,
    });
  }

  return filas.sort((a, b) => a.zona.localeCompare(b.zona, "es"));
}

/**
 * ROJO    si hay alguna CRITICA (o MAYOR escalada) en NO_OK, EN_PROC o SIN_REVISAR.
 * AMARILLO si hay MAYORES en NO_OK / EN_PROC.
 * VERDE   si todo esta en OK o N/A.
 *
 * Un item CRITICO sin revisar cuenta como rojo: no saber es tan malo como saber que falla.
 */
export function calcularSemaforo(
  recorrida: Recorrida,
  catalogo: ReadonlyMap<number, ItemCatalogo>,
  hoy: Date = new Date(),
): Semaforo {
  let hayMayor = false;

  for (const r of recorrida.registros) {
    const critica = criticidadEfectiva(r, catalogo) === "CRITICA";

    if (r.estado === "SIN_REVISAR") {
      if (critica) return "ROJO";
      continue;
    }
    if (!esNoConforme(r.estado)) continue;

    if (criticidadConEscalado(r, catalogo, hoy) === "CRITICA") return "ROJO";
    if (criticidadEfectiva(r, catalogo) === "MAYOR") hayMayor = true;
  }

  return hayMayor ? "AMARILLO" : "VERDE";
}

export interface Vencimiento {
  itemId: number;
  criticidad: Criticidad;
  plazo: string;
  dias: number;
  vencido: boolean;
  escalado: boolean;
  responsable?: string;
}

/** Vencidos y proximos a vencer (<= 7 dias), ordenados por urgencia. */
export function vencimientos(
  recorrida: Recorrida,
  catalogo: ReadonlyMap<number, ItemCatalogo>,
  hoy: Date = new Date(),
  ventanaDias = 7,
): Vencimiento[] {
  return recorrida.registros
    .filter((r) => esNoConforme(r.estado) && r.estadoFinal !== "CERRADO" && Boolean(r.plazo))
    .map((r) => {
      const dias = diasHasta(r.plazo as string, hoy);
      return {
        itemId: r.itemId,
        criticidad: criticidadConEscalado(r, catalogo, hoy),
        plazo: r.plazo as string,
        dias,
        vencido: dias < 0,
        escalado: estaEscalado(r, catalogo, hoy),
        responsable: r.responsable,
      };
    })
    .filter((v) => v.dias <= ventanaDias)
    .sort((a, b) => a.dias - b.dias);
}

/** Dias hasta la auditoria externa programada. `null` si no hay fecha cargada. */
export function diasHastaAuditoria(recorrida: Recorrida, hoy: Date = new Date()): number | null {
  if (!recorrida.auditoriaProgramada) return null;
  return diasHasta(recorrida.auditoriaProgramada, hoy);
}

export interface EvolucionEquipo {
  folio: string;
  fecha: string;
  noConformes: number;
}

export interface ItemReiterado {
  itemId: number;
  zona: string;
  item: string;
  apariciones: number;
}

/** Vista historica por equipo: evolucion de no conformes y top de items mas reiterados. */
export function analisisEquipo(
  historial: readonly { folio: string; fecha: string; itemsNoConformes: number[] }[],
  catalogo: ReadonlyMap<number, ItemCatalogo>,
  topN = 10,
): { evolucion: EvolucionEquipo[]; topReiterados: ItemReiterado[]; zonasConMasHallazgos: FilaConteo[] } {
  const evolucion = [...historial]
    .sort((a, b) => (a.fecha < b.fecha ? -1 : 1))
    .map((r) => ({ folio: r.folio, fecha: r.fecha, noConformes: r.itemsNoConformes.length }));

  const conteo = new Map<number, number>();
  for (const r of historial) {
    for (const id of r.itemsNoConformes) conteo.set(id, (conteo.get(id) ?? 0) + 1);
  }

  const topReiterados = [...conteo.entries()]
    .map(([itemId, apariciones]) => ({
      itemId,
      zona: catalogo.get(itemId)?.zona ?? "Sin zona",
      item: catalogo.get(itemId)?.item ?? `Ítem ${itemId}`,
      apariciones,
    }))
    .sort((a, b) => b.apariciones - a.apariciones || a.itemId - b.itemId)
    .slice(0, topN);

  const porZona = new Map<string, number>();
  for (const [itemId, veces] of conteo) {
    const zona = catalogo.get(itemId)?.zona ?? "Sin zona";
    porZona.set(zona, (porZona.get(zona) ?? 0) + veces);
  }
  const zonasConMasHallazgos = [...porZona.entries()]
    .map(([nombre, cantidad]) => ({ nombre, cantidad }))
    .sort((a, b) => b.cantidad - a.cantidad);

  return { evolucion, topReiterados, zonasConMasHallazgos };
}

export interface FilaConteo {
  nombre: string;
  cantidad: number;
}

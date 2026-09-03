import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { HALLAZGO_DERIVADO } from "../data/catalogo";
import { robotoBoldBase64, robotoRegularBase64 } from "./fonts/roboto";
import { blobADataUrl, blobDeFoto, comprimirImagen } from "./imageUtils";
import {
  calcularKPIs,
  calcularSemaforo,
  criticidadEfectiva,
  estaEscalado,
  resumenPorZona,
} from "./metrics";
import { badgeOrigen, ETIQUETA_FUENTE } from "./reiteracion";
import type { Criticidad, ItemCatalogo, Recorrida, RegistroItem } from "../types";
import { COLOR_CRITICIDAD, COLOR_SEMAFORO, ETIQUETA_CRITICIDAD, ETIQUETA_ESTADO, fechaAR, fechaSoloDia } from "../ui";

/**
 * Informe PDF de la recorrida. Es el adjunto principal del registro en SharePoint y lo que
 * ve el usuario: se genera una sola vez en el cliente y NO se regenera en el flujo.
 *
 * La fuente va embebida (Roboto subseteada). Las fuentes internas de jsPDF son Latin-1 y
 * rompen los acentos: "Inspección" sale "InspecciÃ³n". Con un informe todo en castellano,
 * eso no es un detalle cosmético.
 */

const MARGEN = 14;
const ANCHO = 210;
const ALTO = 297;

interface OpcionesPDF {
  recorrida: Recorrida;
  catalogo: ReadonlyMap<number, ItemCatalogo>;
  /** Calidad de las fotos incrustadas. Se baja si el PDF pasa el cap de 4 MB. */
  calidadFotos?: number;
  ladoMaxFoto?: number;
  hoy?: Date;
}

function registrarFuente(doc: jsPDF): void {
  doc.addFileToVFS("Roboto-Regular.ttf", robotoRegularBase64);
  doc.addFont("Roboto-Regular.ttf", "Roboto", "normal");
  doc.addFileToVFS("Roboto-Bold.ttf", robotoBoldBase64);
  doc.addFont("Roboto-Bold.ttf", "Roboto", "bold");
  doc.setFont("Roboto", "normal");
}

function rgb(hex: string): [number, number, number] {
  const n = parseInt(hex.replace("#", ""), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

async function cargarLogo(): Promise<string | null> {
  // El logo es opcional: si no está en public/, el informe sale igual con el título en texto.
  try {
    const base = import.meta.env.BASE_URL ?? "/";
    const res = await fetch(`${base}tacker-logo.png`);
    if (!res.ok) return null;
    return await blobADataUrl(await res.blob());
  } catch {
    return null;
  }
}

function agregarImagen(doc: jsPDF, dataUrl: string, x: number, y: number, w: number, h: number): void {
  // Las fotos del celular son JPEG; las firmas del canvas son PNG. Se intenta y se cae al otro.
  try {
    doc.addImage(dataUrl, "JPEG", x, y, w, h);
  } catch {
    try {
      doc.addImage(dataUrl, "PNG", x, y, w, h);
    } catch {
      /* una foto ilegible no puede tumbar el informe entero */
    }
  }
}

export async function generarPDF(opciones: OpcionesPDF): Promise<Blob> {
  const { recorrida, catalogo, calidadFotos = 0.62, ladoMaxFoto = 720, hoy = new Date() } = opciones;

  const doc = new jsPDF({ unit: "mm", format: "a4" });
  registrarFuente(doc);

  const kpis = calcularKPIs(recorrida, catalogo, hoy);
  const semaforo = calcularSemaforo(recorrida, catalogo, hoy);
  const folio = recorrida.folio ?? recorrida.id;

  // ------------------------------------------------------------------ portada
  let y = MARGEN;
  const logo = await cargarLogo();
  if (logo) {
    agregarImagen(doc, logo, MARGEN, y, 34, 12);
    y += 16;
  } else {
    doc.setFont("Roboto", "bold").setFontSize(16).text("TACKER SRL", MARGEN, y + 6);
    y += 14;
  }

  doc.setFont("Roboto", "bold").setFontSize(17);
  doc.text("Inspección de campo — Equipo de torre", MARGEN, y);
  y += 7;
  doc.setFont("Roboto", "normal").setFontSize(10).setTextColor(90);
  doc.text("Recorrida de pre-auditoría · checklist general de 94 ítems", MARGEN, y);
  doc.setTextColor(0);
  y += 8;

  const cabecera: [string, string][] = [
    ["Folio", folio],
    ["Equipo", recorrida.equipo],
    ["Empresa", recorrida.empresa],
    ["Operadora", recorrida.operadora ?? "—"],
    ["Contrato", recorrida.contrato ?? "—"],
    ["Pozo / locación", recorrida.pozoLocacion],
    ["Fecha de relevamiento", fechaAR(recorrida.fechaRelevamiento, true)],
    ["Auditoría programada", fechaSoloDia(recorrida.auditoriaProgramada)],
    ["Recorrieron", recorrida.equipoRecorrida],
    ["Company Representative", recorrida.companyRepresentative ?? "—"],
  ];

  autoTable(doc, {
    startY: y,
    theme: "grid",
    styles: { font: "Roboto", fontSize: 9, cellPadding: 1.8 },
    columnStyles: { 0: { fontStyle: "bold", cellWidth: 45 } },
    body: cabecera,
    margin: { left: MARGEN, right: MARGEN },
  });
  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6;

  // ------------------------------------------------------------------ KPIs + semáforo
  doc.setFillColor(...rgb(COLOR_SEMAFORO[semaforo]));
  doc.roundedRect(MARGEN, y, ANCHO - 2 * MARGEN, 12, 2, 2, "F");
  doc.setFont("Roboto", "bold").setFontSize(12).setTextColor(255);
  doc.text(`SEMÁFORO: ${semaforo}`, MARGEN + 4, y + 8);
  doc.setFontSize(10);
  doc.text(`Avance ${kpis.pctAvance}%`, ANCHO - MARGEN - 4, y + 8, { align: "right" });
  doc.setTextColor(0);
  y += 17;

  autoTable(doc, {
    startY: y,
    theme: "grid",
    styles: { font: "Roboto", fontSize: 9, halign: "center" },
    headStyles: { font: "Roboto", fontStyle: "bold", fillColor: [41, 37, 36] },
    head: [["Total", "OK", "NO OK", "En proc.", "N/A", "Sin revisar", "Nuevos", "Reiterativos", "Adic."]],
    body: [
      [
        kpis.total,
        kpis.ok,
        kpis.noOk,
        kpis.enProc,
        kpis.na,
        kpis.sinRevisar,
        kpis.noOkNuevos,
        kpis.noOkReiterativos,
        kpis.adicionales,
      ].map(String),
    ],
    margin: { left: MARGEN, right: MARGEN },
  });
  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6;

  if (kpis.escalados > 0) {
    doc.setFillColor(254, 226, 226);
    doc.roundedRect(MARGEN, y, ANCHO - 2 * MARGEN, 9, 1, 1, "F");
    doc.setFont("Roboto", "bold").setFontSize(9).setTextColor(...rgb("#b91c1c"));
    doc.text(
      `${kpis.escalados} hallazgo(s) MAYOR con plazo vencido: escalados a CRÍTICO (regla YPF).`,
      MARGEN + 3,
      y + 6,
    );
    doc.setTextColor(0);
    y += 13;
  }

  // ------------------------------------------------------------------ resumen por zona
  doc.setFont("Roboto", "bold").setFontSize(12).text("Resumen por zona", MARGEN, y);
  y += 3;
  autoTable(doc, {
    startY: y,
    theme: "striped",
    styles: { font: "Roboto", fontSize: 8 },
    headStyles: { font: "Roboto", fontStyle: "bold", fillColor: [41, 37, 36] },
    head: [["Zona", "Total", "OK", "NO OK", "En proc.", "N/A", "Sin rev.", "Reiter.", "% OK"]],
    body: resumenPorZona(recorrida, catalogo).map((f) => [
      f.zona,
      f.total,
      f.ok,
      f.noOk,
      f.enProc,
      f.na,
      f.sinRevisar,
      f.reiterativos,
      `${f.pctOk}%`,
    ]),
    margin: { left: MARGEN, right: MARGEN },
  });

  // ------------------------------------------------------------------ detalle de hallazgos
  const noConformes = recorrida.registros.filter(
    (r) => r.estado === "NO_OK" || r.estado === "EN_PROC",
  );

  if (noConformes.length > 0) {
    doc.addPage();
    y = MARGEN;
    doc.setFont("Roboto", "bold").setFontSize(13);
    doc.text(`Hallazgos (${noConformes.length})`, MARGEN, y);
    y += 8;

    const idsAdicionales = new Set(recorrida.itemsAdicionales.map((a) => a.id));

    for (const registro of noConformes) {
      const info =
        catalogo.get(registro.itemId) ??
        recorrida.itemsAdicionales.find((a) => a.id === registro.itemId);
      y = await bloqueHallazgo(doc, {
        y,
        registro,
        info,
        catalogo,
        esAdicional: idsAdicionales.has(registro.itemId),
        calidadFotos,
        ladoMaxFoto,
        hoy,
      });
    }
  }

  // ------------------------------------------------------------------ OK y N/A
  const okYna = recorrida.registros.filter((r) => r.estado === "OK" || r.estado === "NA");
  if (okYna.length > 0) {
    doc.addPage();
    doc.setFont("Roboto", "bold").setFontSize(13).text("Ítems conformes y no aplicables", MARGEN, MARGEN);
    autoTable(doc, {
      startY: MARGEN + 4,
      theme: "striped",
      styles: { font: "Roboto", fontSize: 7.5, cellPadding: 1.2 },
      headStyles: { font: "Roboto", fontStyle: "bold", fillColor: [41, 37, 36] },
      columnStyles: { 0: { cellWidth: 10 }, 1: { cellWidth: 32 }, 3: { cellWidth: 16 } },
      head: [["#", "Zona", "Ítem", "Estado"]],
      body: okYna.map((r) => [
        r.itemId,
        catalogo.get(r.itemId)?.zona ?? "—",
        catalogo.get(r.itemId)?.item ?? "—",
        ETIQUETA_ESTADO[r.estado],
      ]),
      margin: { left: MARGEN, right: MARGEN },
    });
  }

  // ------------------------------------------------------------------ observaciones y firmas
  doc.addPage();
  y = MARGEN;
  doc.setFont("Roboto", "bold").setFontSize(13).text("Observaciones y limitaciones", MARGEN, y);
  y += 7;
  doc.setFont("Roboto", "normal").setFontSize(10);
  const notas = recorrida.notas?.trim()
    ? doc.splitTextToSize(recorrida.notas, ANCHO - 2 * MARGEN)
    : ["Sin limitaciones registradas."];
  doc.text(notas, MARGEN, y);
  y += notas.length * 5 + 10;

  doc.setFont("Roboto", "bold").setFontSize(13).text("Firmas", MARGEN, y);
  y += 5;

  const anchoFirma = (ANCHO - 2 * MARGEN - 10) / 2;
  for (const [i, firma] of [
    ["Supervisor", recorrida.firmas?.supervisor],
    ["Company Representative", recorrida.firmas?.cr],
  ].entries()) {
    const x = MARGEN + i * (anchoFirma + 10);
    doc.setDrawColor(120);
    doc.rect(x, y, anchoFirma, 28);
    if (firma[1]) agregarImagen(doc, firma[1] as string, x + 2, y + 2, anchoFirma - 4, 24);
    doc.setFont("Roboto", "normal").setFontSize(9);
    doc.text(String(firma[0]), x, y + 33);
  }

  numerarPaginas(doc, folio);
  return doc.output("blob");
}

interface OpcionesBloque {
  y: number;
  registro: RegistroItem;
  info: ItemCatalogo | undefined;
  catalogo: ReadonlyMap<number, ItemCatalogo>;
  esAdicional: boolean;
  calidadFotos: number;
  ladoMaxFoto: number;
  hoy: Date;
}

async function bloqueHallazgo(doc: jsPDF, o: OpcionesBloque): Promise<number> {
  const { registro, info, catalogo, esAdicional, hoy } = o;
  let y = o.y;

  const criticidad = criticidadEfectiva(registro, catalogo) as Criticidad;
  const escalado = estaEscalado(registro, catalogo, hoy);
  const textoItem = info?.item ?? `Ítem ${registro.itemId}`;
  const lineas = doc.splitTextToSize(textoItem, ANCHO - 2 * MARGEN - 4);

  const filas = Math.ceil(registro.evidencia.length / 2);
  const altoFotos = filas * 44;
  const altoBloque = 30 + lineas.length * 4.5 + altoFotos;

  // No partir un hallazgo entre páginas: se lee como dos cosas distintas.
  if (y + altoBloque > ALTO - MARGEN) {
    doc.addPage();
    y = MARGEN;
  }

  doc.setFillColor(...rgb(COLOR_CRITICIDAD[criticidad]));
  doc.roundedRect(MARGEN, y, 26, 6, 1, 1, "F");
  doc.setFont("Roboto", "bold").setFontSize(8).setTextColor(255);
  doc.text(ETIQUETA_CRITICIDAD[criticidad], MARGEN + 13, y + 4.2, { align: "center" });
  doc.setTextColor(0);

  let x = MARGEN + 29;
  const chip = (texto: string, color: string) => {
    const w = doc.getTextWidth(texto) + 6;
    doc.setFillColor(...rgb(color));
    doc.roundedRect(x, y, w, 6, 1, 1, "F");
    doc.setTextColor(255).setFontSize(8);
    doc.text(texto, x + w / 2, y + 4.2, { align: "center" });
    doc.setTextColor(0);
    x += w + 3;
  };

  chip(`#${registro.itemId}`, "#44403c");
  chip(ETIQUETA_ESTADO[registro.estado], registro.estado === "NO_OK" ? "#b91c1c" : "#c2410c");
  if (registro.origen) {
    chip(badgeOrigen(registro.origen, registro.reiteracion), registro.origen === "NUEVO" ? "#1d4ed8" : "#6d28d9");
  }
  if (esAdicional) chip("ADICIONAL", "#292524");
  if (escalado) chip("ESCALADO", "#b91c1c");

  y += 9;
  doc.setFont("Roboto", "normal").setFontSize(9.5);
  doc.text(lineas, MARGEN, y);
  y += lineas.length * 4.5 + 1;

  const detalle: [string, string][] = [];
  if (registro.reiteracion) {
    detalle.push([
      "Reiteración",
      `×${registro.reiteracion.vecesPrevias} · ${ETIQUETA_FUENTE[registro.reiteracion.fuente]}` +
        (registro.reiteracion.detectadaAutomaticamente ? " · detectada automáticamente" : "") +
        (registro.reiteracion.referencia ? ` · ${registro.reiteracion.referencia}` : ""),
    ]);
  }
  if (registro.responsable) detalle.push(["Responsable", registro.responsable]);
  if (registro.plazo) detalle.push(["Plazo", fechaSoloDia(registro.plazo)]);
  if (registro.accionCorrectiva) detalle.push(["Acción correctiva", registro.accionCorrectiva]);
  if (registro.observaciones) detalle.push(["Observaciones", registro.observaciones]);
  if (registro.estadoFinal) detalle.push(["Estado final", registro.estadoFinal]);
  if (info && HALLAZGO_DERIVADO.has(info.id)) {
    detalle.push(["Nota", "Hallazgo típico derivado de la condición, no del informe original."]);
  }

  if (detalle.length > 0) {
    autoTable(doc, {
      startY: y,
      theme: "plain",
      styles: { font: "Roboto", fontSize: 8, cellPadding: 0.8 },
      columnStyles: { 0: { fontStyle: "bold", cellWidth: 34 } },
      body: detalle,
      margin: { left: MARGEN, right: MARGEN },
    });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 2;
  }

  // Fotos: 2 por fila, con pie "ítem — zona".
  const anchoFoto = (ANCHO - 2 * MARGEN - 6) / 2;
  const altoFoto = 38;
  for (let i = 0; i < registro.evidencia.length; i += 1) {
    const col = i % 2;
    if (col === 0 && i > 0) y += altoFoto + 6;
    if (y + altoFoto + 8 > ALTO - MARGEN) {
      doc.addPage();
      y = MARGEN;
    }
    const fx = MARGEN + col * (anchoFoto + 6);
    const foto = registro.evidencia[i];
    const comprimida = await comprimirImagen(blobDeFoto(foto), o.ladoMaxFoto, o.calidadFotos);
    agregarImagen(doc, await blobADataUrl(comprimida), fx, y, anchoFoto, altoFoto);
    doc.setDrawColor(150);
    doc.rect(fx, y, anchoFoto, altoFoto);
    doc.setFont("Roboto", "normal").setFontSize(7).setTextColor(90);
    doc.text(`#${registro.itemId} — ${info?.zona ?? ""}`, fx, y + altoFoto + 3.5);
    doc.setTextColor(0);
  }
  if (registro.evidencia.length > 0) y += altoFoto + 8;

  doc.setDrawColor(210);
  doc.line(MARGEN, y, ANCHO - MARGEN, y);
  return y + 6;
}

function numerarPaginas(doc: jsPDF, folio: string): void {
  const total = doc.getNumberOfPages();
  for (let i = 1; i <= total; i += 1) {
    doc.setPage(i);
    doc.setFont("Roboto", "normal").setFontSize(8).setTextColor(120);
    doc.text(folio, MARGEN, ALTO - 8);
    doc.text(`Página ${i} de ${total}`, ANCHO - MARGEN, ALTO - 8, { align: "right" });
    doc.setTextColor(0);
  }
}

/** Nombre del archivo, igual en la descarga y en el adjunto de SharePoint. */
export function nombrePDF(recorrida: Recorrida): string {
  return `Recorrida-${recorrida.folio ?? recorrida.id}.pdf`;
}

/**
 * Genera el PDF respetando un tope de tamaño. Si se pasa, baja la calidad de las fotos
 * incrustadas y reintenta: las originales viajan igual por EQT-02, así que lo que se
 * degrada es la miniatura del informe, no la evidencia.
 */
export async function generarPDFConTope(
  opciones: OpcionesPDF,
  topeBytes: number,
): Promise<Blob> {
  const escalones = [
    { calidadFotos: 0.62, ladoMaxFoto: 720 },
    { calidadFotos: 0.5, ladoMaxFoto: 560 },
    { calidadFotos: 0.4, ladoMaxFoto: 420 },
  ];
  let ultimo: Blob | null = null;
  for (const e of escalones) {
    ultimo = await generarPDF({ ...opciones, ...e });
    // base64 infla ~33%: el tope se mide sobre lo que realmente viaja.
    if (ultimo.size * 1.34 <= topeBytes) return ultimo;
  }
  return ultimo as Blob;
}

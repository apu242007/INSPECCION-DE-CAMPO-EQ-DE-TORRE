import { describe, expect, it } from "vitest";
import { CATALOGO_POR_ID } from "../../data/catalogo";
import {
  analisisEquipo,
  calcularKPIs,
  calcularSemaforo,
  diasHasta,
  estaEscalado,
  resumenPorZona,
  vencimientos,
} from "../metrics";
import { marcar, recorridaDePrueba } from "./helpers";

const HOY = new Date("2026-09-03T12:00:00");

describe("% de avance", () => {
  it("excluye los N/A del denominador", () => {
    // 94 ítems: 10 OK, 4 N/A -> 10 / (94 - 4) = 11.1 %
    const r = marcar(recorridaDePrueba(), [
      ...[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((itemId) => ({ itemId, estado: "OK" as const })),
      ...[11, 12, 13, 14].map((itemId) => ({ itemId, estado: "NA" as const })),
    ]);

    const kpis = calcularKPIs(r, CATALOGO_POR_ID, HOY);
    expect(kpis.ok).toBe(10);
    expect(kpis.na).toBe(4);
    expect(kpis.pctAvance).toBe(11.1);
  });

  it("da 100 % cuando todo es N/A (denominador cero)", () => {
    const r = recorridaDePrueba();
    const todosNA = { ...r, registros: r.registros.map((x) => ({ ...x, estado: "NA" as const })) };
    expect(calcularKPIs(todosNA, CATALOGO_POR_ID, HOY).pctAvance).toBe(100);
  });

  it("separa no conformes nuevos de reiterativos", () => {
    const r = marcar(recorridaDePrueba(), [
      { itemId: 1, estado: "NO_OK", origen: "NUEVO" },
      { itemId: 81, estado: "NO_OK", origen: "REITERATIVO", vecesPrevias: 3 },
      { itemId: 42, estado: "EN_PROC", origen: "REITERATIVO", vecesPrevias: 2 },
    ]);

    const kpis = calcularKPIs(r, CATALOGO_POR_ID, HOY);
    expect(kpis.noOkNuevos).toBe(1);
    expect(kpis.noOkReiterativos).toBe(2);
  });
});

describe("semáforo", () => {
  it("es VERDE con todo en OK o N/A", () => {
    const r = recorridaDePrueba();
    const todoOk = { ...r, registros: r.registros.map((x) => ({ ...x, estado: "OK" as const })) };
    expect(calcularSemaforo(todoOk, CATALOGO_POR_ID, HOY)).toBe("VERDE");
  });

  it("es ROJO si hay una CRÍTICA en NO_OK", () => {
    const r = recorridaDePrueba();
    const base = { ...r, registros: r.registros.map((x) => ({ ...x, estado: "OK" as const })) };
    // El ítem 20 (soldaduras de chasis sin documentación) es CRITICA de referencia.
    expect(calcularSemaforo(marcar(base, [{ itemId: 20, estado: "NO_OK" }]), CATALOGO_POR_ID, HOY)).toBe(
      "ROJO",
    );
  });

  it("es ROJO si queda una CRÍTICA sin revisar: no saber es tan malo como saber que falla", () => {
    const r = recorridaDePrueba();
    const casiTodoOk = {
      ...r,
      registros: r.registros.map((x) => ({ ...x, estado: x.itemId === 20 ? "SIN_REVISAR" : "OK" } as const)),
    };
    expect(calcularSemaforo(casiTodoOk, CATALOGO_POR_ID, HOY)).toBe("ROJO");
  });

  it("es AMARILLO si solo hay MAYORES en NO_OK", () => {
    const r = recorridaDePrueba();
    const base = { ...r, registros: r.registros.map((x) => ({ ...x, estado: "OK" as const })) };
    // El ítem 1 es MAYOR de referencia.
    expect(calcularSemaforo(marcar(base, [{ itemId: 1, estado: "NO_OK" }]), CATALOGO_POR_ID, HOY)).toBe(
      "AMARILLO",
    );
  });

  it("pasa a ROJO cuando un MAYOR escala por plazo vencido", () => {
    const r = recorridaDePrueba();
    const base = { ...r, registros: r.registros.map((x) => ({ ...x, estado: "OK" as const })) };
    const conVencido = marcar(base, [{ itemId: 1, estado: "NO_OK", plazo: "2026-08-01" }]);
    expect(calcularSemaforo(conVencido, CATALOGO_POR_ID, HOY)).toBe("ROJO");
  });
});

describe("escalado de MAYOR vencido (regla YPF)", () => {
  it("escala un MAYOR con plazo vencido y sin cerrar", () => {
    const r = marcar(recorridaDePrueba(), [{ itemId: 1, estado: "NO_OK", plazo: "2026-08-01" }]);
    const reg = r.registros.find((x) => x.itemId === 1)!;
    expect(estaEscalado(reg, CATALOGO_POR_ID, HOY)).toBe(true);
  });

  it("no escala si el plazo todavía no venció", () => {
    const r = marcar(recorridaDePrueba(), [{ itemId: 1, estado: "NO_OK", plazo: "2026-09-30" }]);
    expect(estaEscalado(r.registros.find((x) => x.itemId === 1)!, CATALOGO_POR_ID, HOY)).toBe(false);
  });

  it("no escala si ya está cerrado", () => {
    const r = marcar(recorridaDePrueba(), [
      { itemId: 1, estado: "NO_OK", plazo: "2026-08-01", estadoFinal: "CERRADO" },
    ]);
    expect(estaEscalado(r.registros.find((x) => x.itemId === 1)!, CATALOGO_POR_ID, HOY)).toBe(false);
  });

  it("no escala un MENOR vencido: la regla es solo para MAYOR", () => {
    const r = marcar(recorridaDePrueba(), [{ itemId: 6, estado: "NO_OK", plazo: "2026-08-01" }]);
    expect(estaEscalado(r.registros.find((x) => x.itemId === 6)!, CATALOGO_POR_ID, HOY)).toBe(false);
  });

  it("cuenta el escalado como CRÍTICA en los KPIs", () => {
    const r = marcar(recorridaDePrueba(), [{ itemId: 1, estado: "NO_OK", plazo: "2026-08-01" }]);
    const kpis = calcularKPIs(r, CATALOGO_POR_ID, HOY);
    expect(kpis.porCriticidad.CRITICA).toBe(1);
    expect(kpis.porCriticidad.MAYOR).toBe(0);
    expect(kpis.escalados).toBe(1);
  });
});

describe("vencimientos", () => {
  it("lista vencidos y los que vencen dentro de 7 días, ordenados por urgencia", () => {
    const r = marcar(recorridaDePrueba(), [
      { itemId: 1, estado: "NO_OK", plazo: "2026-08-20" }, // vencido
      { itemId: 2, estado: "NO_OK", plazo: "2026-09-05" }, // en 2 días
      { itemId: 3, estado: "NO_OK", plazo: "2026-12-01" }, // lejos, no entra
    ]);

    const v = vencimientos(r, CATALOGO_POR_ID, HOY);
    expect(v.map((x) => x.itemId)).toEqual([1, 2]);
    expect(v[0].vencido).toBe(true);
    expect(v[1].dias).toBe(2);
  });
});

describe("diasHasta", () => {
  it("da negativo para fechas pasadas y positivo para futuras", () => {
    expect(diasHasta("2026-09-01", HOY)).toBe(-2);
    expect(diasHasta("2026-09-03", HOY)).toBe(0);
    expect(diasHasta("2026-09-10", HOY)).toBe(7);
  });
});

describe("resumen por zona", () => {
  it("agrupa los 94 ítems en 17 filas que suman el total", () => {
    const filas = resumenPorZona(recorridaDePrueba(), CATALOGO_POR_ID);
    expect(filas).toHaveLength(17);
    expect(filas.reduce((a, f) => a + f.total, 0)).toBe(94);
  });

  it("cuenta reiterativos por zona", () => {
    const r = marcar(recorridaDePrueba(), [
      { itemId: 81, estado: "NO_OK", origen: "REITERATIVO", vecesPrevias: 3 },
    ]);
    const pisoEnganche = resumenPorZona(r, CATALOGO_POR_ID).find((f) => f.zona === "Piso de enganche")!;
    expect(pisoEnganche.reiterativos).toBe(1);
    expect(pisoEnganche.noOk).toBe(1);
  });
});

describe("análisis histórico por equipo", () => {
  const historial = [
    { folio: "R1", fecha: "2026-05-20T12:00:00Z", itemsNoConformes: [81, 42] },
    { folio: "R2", fecha: "2026-07-15T12:00:00Z", itemsNoConformes: [81, 63] },
    { folio: "R3", fecha: "2026-08-20T12:00:00Z", itemsNoConformes: [81] },
  ];

  it("arma la evolución en orden cronológico", () => {
    const { evolucion } = analisisEquipo(historial, CATALOGO_POR_ID);
    expect(evolucion.map((e) => e.folio)).toEqual(["R1", "R2", "R3"]);
    expect(evolucion.map((e) => e.noConformes)).toEqual([2, 2, 1]);
  });

  it("pone primero el ítem más reiterado", () => {
    const { topReiterados } = analisisEquipo(historial, CATALOGO_POR_ID);
    expect(topReiterados[0]).toMatchObject({ itemId: 81, apariciones: 3, zona: "Piso de enganche" });
  });
});

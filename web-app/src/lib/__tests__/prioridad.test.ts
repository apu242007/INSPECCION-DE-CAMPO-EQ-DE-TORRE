import { describe, expect, it } from "vitest";
import { CATALOGO_POR_ID } from "../../data/catalogo";
import { agruparPorNivel, listaPrioridad, nivelDePrioridad } from "../prioridad";
import { marcar, recorridaDePrueba } from "./helpers";

const HOY = new Date("2026-09-03T12:00:00");

describe("orden de prioridad de resolución", () => {
  it("respeta el orden críticos → reiterativos ×3 → reiterativos ×2 → mayores nuevos → resto", () => {
    const r = marcar(recorridaDePrueba(), [
      { itemId: 6, estado: "NO_OK", origen: "NUEVO" }, // MENOR nuevo -> nivel 5
      { itemId: 1, estado: "NO_OK", origen: "NUEVO" }, // MAYOR nuevo -> nivel 4
      { itemId: 42, estado: "NO_OK", origen: "REITERATIVO", vecesPrevias: 2 }, // nivel 3
      { itemId: 81, estado: "NO_OK", origen: "REITERATIVO", vecesPrevias: 3 }, // nivel 2
      { itemId: 20, estado: "NO_OK", origen: "NUEVO" }, // CRITICA -> nivel 1
    ]);

    expect(listaPrioridad(r, CATALOGO_POR_ID, HOY).map((i) => i.itemId)).toEqual([20, 81, 42, 1, 6]);
  });

  it("un MENOR reiterado ×3 gana a un MAYOR nuevo", () => {
    const r = marcar(recorridaDePrueba(), [
      { itemId: 1, estado: "NO_OK", origen: "NUEVO" }, // MAYOR nuevo
      { itemId: 6, estado: "NO_OK", origen: "REITERATIVO", vecesPrevias: 3 }, // MENOR ×3
    ]);
    expect(listaPrioridad(r, CATALOGO_POR_ID, HOY).map((i) => i.itemId)).toEqual([6, 1]);
  });

  it("un MAYOR escalado por plazo vencido sube al nivel de los críticos", () => {
    const r = marcar(recorridaDePrueba(), [{ itemId: 1, estado: "NO_OK", plazo: "2026-08-01" }]);
    const item = listaPrioridad(r, CATALOGO_POR_ID, HOY)[0];
    expect(item.nivel).toBe(1);
    expect(item.escalado).toBe(true);
    expect(item.criticidad).toBe("CRITICA");
  });

  it("deja fuera lo cerrado y lo que no es no conforme", () => {
    const r = marcar(recorridaDePrueba(), [
      { itemId: 1, estado: "NO_OK", estadoFinal: "CERRADO" },
      { itemId: 2, estado: "OK" },
      { itemId: 3, estado: "NA" },
      { itemId: 81, estado: "NO_OK" },
    ]);
    expect(listaPrioridad(r, CATALOGO_POR_ID, HOY).map((i) => i.itemId)).toEqual([81]);
  });

  it("dentro del mismo nivel ordena por cantidad de apariciones", () => {
    const r = marcar(recorridaDePrueba(), [
      { itemId: 42, estado: "NO_OK", origen: "REITERATIVO", vecesPrevias: 3 },
      { itemId: 81, estado: "NO_OK", origen: "REITERATIVO", vecesPrevias: 5 },
    ]);
    expect(listaPrioridad(r, CATALOGO_POR_ID, HOY).map((i) => i.itemId)).toEqual([81, 42]);
  });
});

describe("nivelDePrioridad", () => {
  it("clasifica un GENERAL nuevo en el último nivel", () => {
    const r = marcar(recorridaDePrueba(), [{ itemId: 61, estado: "NO_OK", origen: "NUEVO" }]);
    expect(nivelDePrioridad(r.registros.find((x) => x.itemId === 61)!, CATALOGO_POR_ID, HOY)).toBe(5);
  });
});

describe("agruparPorNivel", () => {
  it("no devuelve grupos vacíos", () => {
    const r = marcar(recorridaDePrueba(), [{ itemId: 20, estado: "NO_OK" }]);
    const grupos = agruparPorNivel(listaPrioridad(r, CATALOGO_POR_ID, HOY));
    expect(grupos).toHaveLength(1);
    expect(grupos[0].etiqueta).toBe("Críticos pendientes");
  });
});

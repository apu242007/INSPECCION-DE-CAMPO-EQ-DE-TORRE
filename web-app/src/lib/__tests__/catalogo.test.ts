import { describe, expect, it } from "vitest";
import {
  CATALOGO,
  CATALOGO_POR_ID,
  HALLAZGO_DERIVADO,
  ORDEN_RECORRIDA_SUGERIDO,
  ZONAS,
  plazoSugerido,
} from "../../data/catalogo";
import type { Criticidad } from "../../types";

describe("catálogo general", () => {
  it("tiene exactamente 94 ítems", () => {
    expect(CATALOGO).toHaveLength(94);
  });

  it("usa los ids 1..94 sin repetir ni saltear", () => {
    const ids = CATALOGO.map((i) => i.id).sort((a, b) => a - b);
    expect(ids).toEqual(Array.from({ length: 94 }, (_, i) => i + 1));
  });

  it("tiene la distribución de criticidad esperada (10/59/21/4)", () => {
    const conteo: Record<Criticidad, number> = { CRITICA: 0, MAYOR: 0, MENOR: 0, GENERAL: 0 };
    for (const i of CATALOGO) conteo[i.criticidadRef] += 1;
    expect(conteo).toEqual({ CRITICA: 10, MAYOR: 59, MENOR: 21, GENERAL: 4 });
  });

  it("cubre 17 zonas y todas están declaradas en ZONAS", () => {
    const zonas = new Set(CATALOGO.map((i) => i.zona));
    expect(zonas.size).toBe(17);
    expect(ZONAS).toHaveLength(17);
    for (const z of zonas) expect(ZONAS).toContain(z);
  });

  it("el orden de recorrida física cubre las mismas 17 zonas", () => {
    expect([...ORDEN_RECORRIDA_SUGERIDO].sort()).toEqual([...ZONAS].sort());
  });

  it("no deja ítems sin texto ni sin hallazgo típico", () => {
    for (const i of CATALOGO) {
      expect(i.item.trim().length, `ítem ${i.id} sin condición`).toBeGreaterThan(10);
      expect(i.hallazgoTipico.trim().length, `ítem ${i.id} sin hallazgo`).toBeGreaterThan(10);
    }
  });

  it("indexa todos los ítems por id", () => {
    expect(CATALOGO_POR_ID.size).toBe(94);
    expect(CATALOGO_POR_ID.get(81)?.zona).toBe("Piso de enganche");
  });

  it("marca como derivados solo los hallazgos que no vienen de un informe real", () => {
    // Son los 21 que llegaron sin la redacción textual de OIL DASSA / iAuditor.
    expect(HALLAZGO_DERIVADO.size).toBe(21);
    for (const id of HALLAZGO_DERIVADO) expect(id).toBeGreaterThanOrEqual(74);
  });
});

describe("plazoSugerido", () => {
  const base = new Date("2026-09-03T12:00:00");

  it("da el mismo día para CRÍTICA", () => {
    expect(plazoSugerido("CRITICA", base)).toBe("2026-09-03");
  });

  it("da +15 días para MAYOR", () => {
    expect(plazoSugerido("MAYOR", base)).toBe("2026-09-18");
  });

  it("da +30 días para MENOR", () => {
    expect(plazoSugerido("MENOR", base)).toBe("2026-10-03");
  });

  it("no impone plazo para GENERAL", () => {
    expect(plazoSugerido("GENERAL", base)).toBeNull();
  });
});

import { describe, expect, it } from "vitest";
import { semillaTack6 } from "../../data/semillas/tack6";
import type { RecorridaHistorial } from "../../types";
import {
  badgeOrigen,
  combinarConManual,
  explicarPropuesta,
  proponerReiteracion,
} from "../reiteracion";

const historialTack6: RecorridaHistorial[] = [
  {
    folio: "REC-TACK-6-TKR-06-20260520-0900",
    fecha: "2026-05-20T12:00:00.000Z",
    pozo: "LACH-201",
    itemsNoConformes: [81, 42],
  },
  {
    folio: "REC-TACK-6-TKR-06-20260715-0900",
    fecha: "2026-07-15T12:00:00.000Z",
    pozo: "LACH-210",
    itemsNoConformes: [81, 63],
  },
];

describe("propuesta automática de reiteración", () => {
  it("propone REITERATIVO ×2 cuando el ítem salió en 2 recorridas del mismo equipo", () => {
    const p = proponerReiteracion(81, { equipo: "TACK-3", historial: historialTack6 });

    expect(p.origen).toBe("REITERATIVO");
    expect(p.reiteracion?.vecesPrevias).toBe(2);
    expect(p.reiteracion?.fuente).toBe("RECORRIDA_INTERNA");
    expect(p.reiteracion?.detectadaAutomaticamente).toBe(true);
    expect(p.fechasPrevias).toHaveLength(2);
  });

  it("ordena las recorridas previas de más reciente a más antigua", () => {
    const p = proponerReiteracion(81, { equipo: "TACK-3", historial: historialTack6 });
    expect(p.fechasPrevias[0]).toBe("2026-07-15T12:00:00.000Z");
  });

  it("propone NUEVO para un equipo sin historial de ese ítem", () => {
    const p = proponerReiteracion(81, { equipo: "TACK-9", historial: [] });

    expect(p.origen).toBe("NUEVO");
    expect(p.reiteracion).toBeUndefined();
    expect(explicarPropuesta(p)).toContain("No se encontraron apariciones previas");
  });

  it("propone NUEVO para un ítem que nunca falló, aunque el equipo tenga historial", () => {
    const p = proponerReiteracion(1, { equipo: "TACK-3", historial: historialTack6 });
    expect(p.origen).toBe("NUEVO");
  });
});

describe("semilla de historial externo", () => {
  it("cuenta como reiteración de auditoría externa", () => {
    const p = proponerReiteracion(81, {
      equipo: "TACK-6 / TKR-06",
      historial: [],
      semilla: semillaTack6,
    });

    expect(p.origen).toBe("REITERATIVO");
    expect(p.reiteracion?.fuente).toBe("AUDITORIA_EXTERNA");
    expect(p.reiteracion?.vecesPrevias).toBe(3);
    expect(p.reiteracion?.referencia).toContain("OIL DASSA");
  });

  it("suma semilla e historial interno y marca la fuente como AMBAS", () => {
    const p = proponerReiteracion(81, {
      equipo: "TACK-6 / TKR-06",
      historial: historialTack6,
      semilla: semillaTack6,
    });

    expect(p.reiteracion?.fuente).toBe("AMBAS");
    expect(p.reiteracion?.vecesPrevias).toBe(5); // 2 internas + 3 externas
  });

  it("ignora la semilla si es de otro equipo", () => {
    const p = proponerReiteracion(81, {
      equipo: "TACK-3",
      historial: [],
      semilla: semillaTack6,
    });
    expect(p.origen).toBe("NUEVO");
  });

  it("normaliza el nombre del equipo al cruzar la semilla", () => {
    const p = proponerReiteracion(81, {
      equipo: "  tack-6 /   tkr-06  ",
      historial: [],
      semilla: semillaTack6,
    });
    expect(p.origen).toBe("REITERATIVO");
  });
});

describe("reiteración manual", () => {
  it("marcada a mano sin detección automática queda como no automática", () => {
    const auto = proponerReiteracion(1, { equipo: "TACK-9", historial: [] });
    const r = combinarConManual(auto, {
      fuente: "AUDITORIA_EXTERNA",
      vecesPrevias: 2,
      referencia: "Inf. OIL DASSA 10/04/2026",
    });

    expect(r.fuente).toBe("AUDITORIA_EXTERNA");
    expect(r.vecesPrevias).toBe(2);
    expect(r.detectadaAutomaticamente).toBe(false);
    expect(r.referencia).toBe("Inf. OIL DASSA 10/04/2026");
  });

  it("suma con la automática y combina las fuentes en AMBAS", () => {
    const auto = proponerReiteracion(81, { equipo: "TACK-3", historial: historialTack6 });
    const r = combinarConManual(auto, {
      fuente: "AUDITORIA_EXTERNA",
      vecesPrevias: 1,
      referencia: "Inf. externo no cargado",
    });

    expect(r.fuente).toBe("AMBAS");
    expect(r.vecesPrevias).toBe(3); // 2 automáticas + 1 manual
    expect(r.detectadaAutomaticamente).toBe(false);
    expect(r.referencia).toContain("Inf. externo no cargado");
  });

  it("nunca deja una reiteración manual con menos de 1 aparición", () => {
    const auto = proponerReiteracion(1, { equipo: "TACK-9", historial: [] });
    const r = combinarConManual(auto, { fuente: "RECORRIDA_INTERNA", vecesPrevias: 0 });
    expect(r.vecesPrevias).toBe(1);
  });
});

describe("badge de origen", () => {
  it("muestra el multiplicador en los reiterativos", () => {
    expect(badgeOrigen("REITERATIVO", { fuente: "AMBAS", vecesPrevias: 3, detectadaAutomaticamente: true })).toBe(
      "REITERATIVO ×3",
    );
    expect(badgeOrigen("NUEVO")).toBe("NUEVO");
    expect(badgeOrigen(undefined)).toBe("");
  });
});

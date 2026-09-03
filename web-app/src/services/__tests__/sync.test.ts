import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as storage from "../../storage";
import { configurarApi } from "../api";
import {
  configurarSync,
  enviarRecorrida,
  procesarCola,
  puedeLimpiarBorrador,
  reintentarPendientes,
} from "../sync";
import { marcar, recorridaDePrueba } from "../../lib/__tests__/helpers";
import type { Recorrida } from "../../types";

/**
 * Tests de sincronización con fetch mockeado.
 * Lo que se prueba es la promesa que le hicimos al usuario: una recorrida de 94 ítems no se
 * pierde nunca por un corte de señal.
 */

const URLS = {
  EQT01: "https://flow.test/eqt01",
  EQT02: "https://flow.test/eqt02",
  EQT03: "https://flow.test/eqt03",
  EQT04: "https://flow.test/eqt04",
  EQT05: "https://flow.test/eqt05",
};

const PDF = new Blob(["%PDF-1.4 fake"], { type: "application/pdf" });

function respuesta(status: number, cuerpo: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => (typeof cuerpo === "string" ? cuerpo : JSON.stringify(cuerpo)),
  } as Response;
}

/** Recorrida con 5 ítems no conformes, cada uno con su foto. */
function recorridaCon5Fotos(): Recorrida {
  return marcar(recorridaDePrueba(), [
    { itemId: 1, estado: "NO_OK" },
    { itemId: 2, estado: "NO_OK" },
    { itemId: 3, estado: "NO_OK" },
    { itemId: 4, estado: "NO_OK" },
    { itemId: 5, estado: "NO_OK" },
  ]);
}

beforeEach(async () => {
  await storage.borrarTodo();
  configurarApi({ urls: URLS, key: "test-key" });
  // Sin backoff: lo que se prueba es la cantidad de reintentos, no el reloj.
  configurarSync({ reintentosMax: 3, backoffMs: [0, 0, 0] });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("EQT-01", () => {
  it("guarda el sharepointId devuelto y encola un EQT-02 por ítem con fotos", async () => {
    const fetchMock = vi.fn(async (url: string) =>
      url === URLS.EQT01
        ? respuesta(200, { recorridaId: 77, folio: "REC-TACK-3-20260903-1200" })
        : respuesta(200, { ok: true }),
    );
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    const r = recorridaCon5Fotos();
    await storage.guardarRecorrida(r);
    const estado = await enviarRecorrida(r, PDF);

    expect(estado.itemsConFotos).toBe(5);
    expect(estado.itemsSubidos).toBe(5);
    expect(estado.itemsEnError).toBe(0);
    expect((await storage.leerRecorrida(r.id))?.sharepointId).toBe(77);
    expect(await storage.leerCola()).toHaveLength(0);
  });

  it("manda el PDF como attachments[0] y NO manda fotos en EQT-01", async () => {
    let cuerpoEQT01: Record<string, unknown> = {};
    const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
      if (url === URLS.EQT01) {
        cuerpoEQT01 = JSON.parse(String(init.body));
        return respuesta(200, { recorridaId: 1, folio: "F" });
      }
      return respuesta(200, { ok: true });
    });
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    const r = recorridaCon5Fotos();
    await storage.guardarRecorrida(r);
    await enviarRecorrida(r, PDF);

    const attachments = cuerpoEQT01.attachments as { name: string }[];
    expect(attachments[0].name).toMatch(/\.pdf$/);
    expect(attachments.some((a) => a.name.startsWith("item-"))).toBe(false);

    const items = cuerpoEQT01.items as { fotosCount: number }[];
    // Los OK también viajan: estas listas alimentan Power BI.
    expect(items).toHaveLength(94);
    expect(items.filter((i) => i.fotosCount > 0)).toHaveLength(5);
  });

  it("si falla, no deja sharepointId y el borrador sigue intacto", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => respuesta(502, "NoResponse")) as unknown as typeof fetch,
    );

    const r = recorridaCon5Fotos();
    await storage.guardarRecorrida(r);
    const estado = await enviarRecorrida(r, PDF);

    expect(estado.ultimoError).toContain("502");
    const guardada = await storage.leerRecorrida(r.id);
    expect(guardada).toBeDefined();
    expect(guardada?.sharepointId).toBeUndefined();
    expect(guardada?.registros.filter((x) => x.evidencia.length > 0)).toHaveLength(5);
    expect(await puedeLimpiarBorrador(r.id)).toBe(false);
  });
});

describe("EQT-02 — cola de fotos", () => {
  it("si falla el ítem 3 de 5, los 2 primeros quedan sincronizados y el 3 en error", async () => {
    const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
      if (url === URLS.EQT01) return respuesta(200, { recorridaId: 88, folio: "F" });
      const { itemId } = JSON.parse(String(init.body)) as { itemId: number };
      return itemId === 3 ? respuesta(500, "boom") : respuesta(200, { ok: true });
    });
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    const r = recorridaCon5Fotos();
    await storage.guardarRecorrida(r);
    const estado = await enviarRecorrida(r, PDF);

    expect(estado.itemsSubidos).toBe(4);
    expect(estado.itemsEnError).toBe(1);

    const guardada = await storage.leerRecorrida(r.id);
    expect(guardada?.registros.find((x) => x.itemId === 1)?.sync).toBe("SINCRONIZADO");
    expect(guardada?.registros.find((x) => x.itemId === 2)?.sync).toBe("SINCRONIZADO");
    expect(guardada?.registros.find((x) => x.itemId === 3)?.sync).toBe("ERROR");

    // El ítem 3 sigue en la cola para poder reintentarlo.
    const cola = await storage.leerCola();
    expect(cola.map((t) => t.itemId)).toEqual([3]);
    expect(await puedeLimpiarBorrador(r.id)).toBe(false);
  });

  it("reintenta 3 veces antes de dar por perdido un ítem", async () => {
    let intentosItem1 = 0;
    const fetchMock = vi.fn(async (url: string) => {
      if (url === URLS.EQT01) return respuesta(200, { recorridaId: 5, folio: "F" });
      intentosItem1 += 1;
      return respuesta(503, "no disponible");
    });
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    const r = marcar(recorridaDePrueba(), [{ itemId: 1, estado: "NO_OK" }]);
    await storage.guardarRecorrida(r);
    await enviarRecorrida(r, PDF);

    expect(intentosItem1).toBe(3);
  });

  it("no reintenta un 400: el payload no va a mejorar solo", async () => {
    let intentos = 0;
    const fetchMock = vi.fn(async (url: string) => {
      if (url === URLS.EQT01) return respuesta(200, { recorridaId: 5, folio: "F" });
      intentos += 1;
      return respuesta(400, "payload inválido");
    });
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    const r = marcar(recorridaDePrueba(), [{ itemId: 1, estado: "NO_OK" }]);
    await storage.guardarRecorrida(r);
    await enviarRecorrida(r, PDF);

    expect(intentos).toBe(1);
  });

  it("se retoma sola: un corte de red a mitad de cola se recupera al reprocesar", async () => {
    let hayRed = true;
    const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
      if (url === URLS.EQT01) return respuesta(200, { recorridaId: 99, folio: "F" });
      const { itemId } = JSON.parse(String(init.body)) as { itemId: number };
      if (!hayRed && itemId >= 3) throw new TypeError("Failed to fetch");
      return respuesta(200, { ok: true });
    });
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    const r = recorridaCon5Fotos();
    await storage.guardarRecorrida(r);

    hayRed = false;
    const primera = await enviarRecorrida(r, PDF);
    expect(primera.itemsSubidos).toBe(2);
    expect(primera.itemsEnError).toBe(3);
    expect((await storage.leerCola()).map((t) => t.itemId)).toEqual([3, 4, 5]);

    // Vuelve la señal: la cola se retoma y termina sin volver a subir lo que ya estaba.
    hayRed = true;
    const segunda = await reintentarPendientes(r.id);
    expect(segunda.itemsSubidos).toBe(3);
    expect(segunda.itemsEnError).toBe(0);
    expect(await storage.leerCola()).toHaveLength(0);
    expect(await puedeLimpiarBorrador(r.id)).toBe(true);
  });

  it("no sube fotos si todavía no hay sharepointId", async () => {
    const fetchMock = vi.fn(async () => respuesta(200, { ok: true }));
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    const r = marcar(recorridaDePrueba(), [{ itemId: 1, estado: "NO_OK" }]);
    await storage.guardarRecorrida(r);
    await storage.encolar([
      {
        id: `${r.id}:FOTOS:1`,
        recorridaId: r.id,
        tipo: "FOTOS",
        itemId: 1,
        intentos: 0,
        creadaEn: new Date().toISOString(),
      },
    ]);

    const estado = await procesarCola(r.id);
    expect(estado.itemsSubidos).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(await storage.leerCola()).toHaveLength(1);
  });
});

describe("modo demo", () => {
  it("sin URL configurada no toca la red", async () => {
    configurarApi({ urls: { ...URLS, EQT01: "", EQT02: "" } });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    const r = recorridaCon5Fotos();
    await storage.guardarRecorrida(r);
    const estado = await enviarRecorrida(r, PDF);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(estado.terminada).toBe(true);
  });
});

describe("respuestas anómalas del flujo", () => {
  it("trata un 202 sin cuerpo como error, no como éxito vacío", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => respuesta(202, "")) as unknown as typeof fetch,
    );

    const r = marcar(recorridaDePrueba(), [{ itemId: 1, estado: "NO_OK" }]);
    await storage.guardarRecorrida(r);
    const estado = await enviarRecorrida(r, PDF);

    expect(estado.ultimoError).toContain("sin cuerpo");
    expect((await storage.leerRecorrida(r.id))?.sharepointId).toBeUndefined();
  });
});

import { beforeEach, describe, expect, it } from "vitest";
import { ErrorValidacion, borrarTodo, guardarRecorrida, importarRecorridaJSON } from "../../storage";
import {
  itemsSinFoto,
  puedeCerrarRecorrida,
  validarRecorrida,
  validarRegistro,
} from "../validacion";
import { fotoDePrueba, marcar, recorridaDePrueba } from "./helpers";

/**
 * FOTO OBLIGATORIA. La regla tiene que valer en TODOS los caminos de escritura, no solo en
 * el botón de la UI: modo campo, modo oficina, storage, importación de JSON y cierre.
 */

describe("validarRegistro", () => {
  it("rechaza NO_OK sin evidencia", () => {
    const r = validarRegistro({ itemId: 81, estado: "NO_OK", origen: "NUEVO", evidencia: [] });
    expect(r.ok).toBe(false);
    expect(r.errores.join(" ")).toContain("requiere al menos una foto");
  });

  it("rechaza EN_PROC sin evidencia", () => {
    const r = validarRegistro({ itemId: 42, estado: "EN_PROC", origen: "NUEVO", evidencia: [] });
    expect(r.ok).toBe(false);
  });

  it("acepta NO_OK con al menos una foto", () => {
    const r = validarRegistro({
      itemId: 81,
      estado: "NO_OK",
      origen: "NUEVO",
      evidencia: [fotoDePrueba()],
    });
    expect(r.ok).toBe(true);
  });

  it("no exige foto para OK, N/A ni SIN_REVISAR", () => {
    for (const estado of ["OK", "NA", "SIN_REVISAR"] as const) {
      expect(validarRegistro({ itemId: 1, estado, evidencia: [] }).ok).toBe(true);
    }
  });

  it("exige indicar nuevo o reiterativo en los no conformes", () => {
    const r = validarRegistro({ itemId: 81, estado: "NO_OK", evidencia: [fotoDePrueba()] });
    expect(r.ok).toBe(false);
    expect(r.errores.join(" ")).toContain("nuevo o reiterativo");
  });

  it("exige datos de reiteración cuando el origen es REITERATIVO", () => {
    const r = validarRegistro({
      itemId: 81,
      estado: "NO_OK",
      origen: "REITERATIVO",
      evidencia: [fotoDePrueba()],
    });
    expect(r.ok).toBe(false);
    expect(r.errores.join(" ")).toContain("sin datos de reiteración");
  });

  it("rechaza el origen en un ítem que no es no conforme", () => {
    const r = validarRegistro({ itemId: 1, estado: "OK", origen: "NUEVO", evidencia: [] });
    expect(r.ok).toBe(false);
  });
});

describe("validarRecorrida", () => {
  it("acepta una recorrida bien formada", () => {
    const r = marcar(recorridaDePrueba(), [
      { itemId: 1, estado: "OK" },
      { itemId: 81, estado: "NO_OK" },
    ]);
    expect(validarRecorrida(r).ok).toBe(true);
  });

  it("rechaza si falta un dato de cabecera", () => {
    const r = { ...recorridaDePrueba(), pozoLocacion: "" };
    const res = validarRecorrida(r);
    expect(res.ok).toBe(false);
    expect(res.errores.join(" ")).toContain("pozo");
  });

  it("acumula un error por cada NO_OK sin foto", () => {
    const r = marcar(recorridaDePrueba(), [
      { itemId: 1, estado: "NO_OK", conFoto: false },
      { itemId: 81, estado: "NO_OK", conFoto: false },
    ]);
    const res = validarRecorrida(r);
    expect(res.ok).toBe(false);
    expect(res.errores.filter((e) => e.includes("foto"))).toHaveLength(2);
  });
});

describe("storage rechaza recorridas inválidas", () => {
  beforeEach(async () => {
    await borrarTodo();
  });

  it("no guarda una recorrida con NO_OK sin foto", async () => {
    const r = marcar(recorridaDePrueba(), [{ itemId: 81, estado: "NO_OK", conFoto: false }]);
    await expect(guardarRecorrida(r)).rejects.toBeInstanceOf(ErrorValidacion);
  });

  it("guarda una recorrida válida", async () => {
    const r = marcar(recorridaDePrueba(), [{ itemId: 81, estado: "NO_OK" }]);
    await expect(guardarRecorrida(r)).resolves.toBeUndefined();
  });
});

describe("importación de JSON", () => {
  beforeEach(async () => {
    await borrarTodo();
  });

  it("falla con mensaje claro si trae un NO_OK sin foto", async () => {
    const r = marcar(recorridaDePrueba(), [{ itemId: 81, estado: "NO_OK", conFoto: false }]);
    const json = JSON.stringify({ ...r, registros: r.registros.map((x) => ({ ...x, evidencia: [] })) });

    await expect(importarRecorridaJSON(json)).rejects.toThrowError(/foto de evidencia/);
  });

  it("rechaza un archivo que no es JSON", async () => {
    await expect(importarRecorridaJSON("{no soy json")).rejects.toThrowError(/no es un JSON/);
  });
});

describe("cierre de recorrida", () => {
  function recorridaCompleta() {
    const r = recorridaDePrueba();
    return {
      ...r,
      registros: r.registros.map((x) => ({ ...x, estado: "OK" as const })),
      firmas: { supervisor: "data:image/png;base64,AAAA" },
    };
  }

  it("permite cerrar cuando está todo revisado y firmado", () => {
    expect(puedeCerrarRecorrida(recorridaCompleta()).puede).toBe(true);
  });

  it("no permite cerrar con NO_OK sin foto y lista los faltantes", () => {
    const r = marcar(recorridaCompleta(), [
      { itemId: 81, estado: "NO_OK", conFoto: false },
      { itemId: 42, estado: "EN_PROC", conFoto: false },
    ]);

    const res = puedeCerrarRecorrida(r);
    expect(res.puede).toBe(false);
    expect(res.faltantes.map((f) => f.itemId).sort((a, b) => a - b)).toEqual([42, 81]);
    expect(res.motivos.join(" ")).toContain("#81");
  });

  it("no permite cerrar sin firma del supervisor", () => {
    const res = puedeCerrarRecorrida({ ...recorridaCompleta(), firmas: undefined });
    expect(res.puede).toBe(false);
    expect(res.motivos.join(" ")).toContain("firma del Supervisor");
  });

  it("no permite cerrar con ítems sin revisar", () => {
    const r = recorridaCompleta();
    const conPendiente = {
      ...r,
      registros: r.registros.map((x, i) => (i === 0 ? { ...x, estado: "SIN_REVISAR" as const } : x)),
    };
    expect(puedeCerrarRecorrida(conPendiente).motivos.join(" ")).toContain("sin revisar");
  });

  it("itemsSinFoto devuelve el itemId para poder linkear a cada uno", () => {
    const r = marcar(recorridaDePrueba(), [{ itemId: 81, estado: "NO_OK", conFoto: false }]);
    expect(itemsSinFoto(r)).toEqual([{ itemId: 81, estado: "NO_OK", motivo: "Sin foto de evidencia" }]);
  });
});

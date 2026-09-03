import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { CATALOGO_POR_ID } from "../data/catalogo";
import { calcularKPIs, calcularSemaforo } from "../lib/metrics";
import * as storage from "../storage";
import type { EntradaIndice } from "../storage";
import type { Semaforo } from "../types";
import { CLASE_SEMAFORO, fechaAR } from "../ui";

/**
 * Listado de recorridas.
 *
 * En celular cada recorrida es una ficha con sus acciones a mano. En escritorio pasa a tabla:
 * ahí lo que se hace es comparar equipos y encontrar la que quedó a medias, y para eso hacen
 * falta muchas filas juntas, no fichas grandes.
 */

interface Fila extends EntradaIndice {
  pctAvance: number;
  noOk: number;
  reiterativos: number;
  pendientesSync: number;
  semaforo: Semaforo;
}

export function Recorridas() {
  const [filas, setFilas] = useState<Fila[]>([]);
  const [equipos, setEquipos] = useState<string[]>([]);
  const [filtroEquipo, setFiltroEquipo] = useState("");
  const [cargando, setCargando] = useState(true);
  const navigate = useNavigate();

  const cargar = useCallback(async () => {
    setCargando(true);
    const indice = await storage.listarRecorridas();
    const cola = await storage.leerCola();

    const resultado: Fila[] = [];
    for (const e of indice) {
      const r = await storage.leerRecorrida(e.id);
      if (!r) continue;
      const kpis = calcularKPIs(r, CATALOGO_POR_ID);
      resultado.push({
        ...e,
        pctAvance: kpis.pctAvance,
        noOk: kpis.noOk + kpis.enProc,
        reiterativos: kpis.noOkReiterativos,
        pendientesSync: cola.filter((t) => t.recorridaId === e.id).length,
        semaforo: calcularSemaforo(r, CATALOGO_POR_ID),
      });
    }
    setFilas(resultado);
    setEquipos(await storage.equiposConocidos());
    setCargando(false);
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const visibles = useMemo(
    () => (filtroEquipo ? filas.filter((f) => f.equipo === filtroEquipo) : filas),
    [filas, filtroEquipo],
  );

  async function eliminar(id: string, folio: string | undefined) {
    if (!confirm(`¿Eliminar la recorrida ${folio ?? id}? No se puede deshacer.`)) return;
    await storage.borrarRecorrida(id);
    await cargar();
  }

  function duplicar(id: string) {
    navigate(`/nueva?duplicarDe=${encodeURIComponent(id)}`);
  }

  return (
    <div className="mx-auto w-full max-w-6xl p-3 md:p-6">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h1 className="flex-1 text-2xl font-semibold md:text-3xl">Recorridas</h1>
        <Link to="/nueva" className="boton-primario w-auto px-5">
          Nueva recorrida
        </Link>
      </div>

      {equipos.length > 1 && (
        <select
          className="campo mb-4 md:max-w-xs"
          value={filtroEquipo}
          onChange={(e) => setFiltroEquipo(e.target.value)}
          aria-label="Filtrar por equipo"
        >
          <option value="">Todos los equipos</option>
          {equipos.map((e) => (
            <option key={e} value={e}>
              {e}
            </option>
          ))}
        </select>
      )}

      {cargando && <p className="py-10 text-center text-acero-500">Cargando…</p>}

      {!cargando && visibles.length === 0 && (
        <div className="panel px-6 py-12 text-center">
          <p className="text-xl font-semibold">Todavía no hay recorridas</p>
          <p className="mx-auto mt-2 max-w-md text-acero-700">
            Al crear una, la app genera los 94 ítems del catálogo en «sin revisar» y arranca en
            modo paso a paso para recorrer el equipo.
          </p>
          <Link to="/nueva" className="boton-primario mx-auto mt-5 w-auto px-6">
            Crear la primera recorrida
          </Link>
        </div>
      )}

      {/* Celular: fichas. */}
      {visibles.length > 0 && (
        <ul className="space-y-2 lg:hidden">
          {visibles.map((f) => (
            <li key={f.id} className="panel p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span aria-hidden className={`h-3 w-3 rounded-full ${CLASE_SEMAFORO[f.semaforo]}`} />
                <span className="text-lg font-semibold">{f.equipo}</span>
                {f.cerrada && <span className="badge bg-acero-900">Cerrada</span>}
                {f.pendientesSync > 0 && (
                  <span className="badge bg-mayor">{f.pendientesSync} por subir</span>
                )}
              </div>

              <p className="cifras mt-1 text-sm text-acero-500">
                {f.pozoLocacion} · {fechaAR(f.fechaRelevamiento)}
              </p>

              <div className="cifras mt-3 flex flex-wrap items-center gap-4 text-sm">
                <span>
                  Avance <strong>{f.pctAvance}%</strong>
                </span>
                <span className={f.noOk > 0 ? "text-critico-ink" : "text-acero-500"}>
                  NO OK <strong>{f.noOk}</strong>
                </span>
                <span className={f.reiterativos > 0 ? "text-reiterado-ink" : "text-acero-500"}>
                  Reiterativos <strong>{f.reiterativos}</strong>
                </span>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                <Link to={`/recorrida/${f.id}`} className="boton-secundario flex-1">
                  Abrir
                </Link>
                <button type="button" className="boton-secundario" onClick={() => duplicar(f.id)}>
                  Duplicar
                </button>
                <button
                  type="button"
                  className="boton-secundario boton-peligro"
                  onClick={() => void eliminar(f.id, f.folio)}
                >
                  Eliminar
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* Escritorio: tabla densa, para comparar equipos de un vistazo. */}
      {visibles.length > 0 && (
        <div className="panel hidden overflow-hidden lg:block">
          <table className="w-full text-left">
            <thead className="border-b border-acero-200 bg-acero-50 text-sm text-acero-700">
              <tr>
                <th className="w-8 py-2 pl-4" aria-label="Semáforo" />
                <th className="py-2 pr-3 font-semibold">Equipo</th>
                <th className="py-2 pr-3 font-semibold">Pozo</th>
                <th className="py-2 pr-3 font-semibold">Fecha</th>
                <th className="py-2 pr-3 text-right font-semibold">Avance</th>
                <th className="py-2 pr-3 text-right font-semibold">NO OK</th>
                <th className="py-2 pr-3 text-right font-semibold">Reiter.</th>
                <th className="py-2 pr-3 font-semibold">Envío</th>
                <th className="py-2 pr-4" />
              </tr>
            </thead>
            <tbody>
              {visibles.map((f) => (
                <tr key={f.id} className="fila align-middle">
                  <td className="py-2.5 pl-4">
                    <span
                      aria-label={`Semáforo ${f.semaforo.toLowerCase()}`}
                      className={`block h-3 w-3 rounded-full ${CLASE_SEMAFORO[f.semaforo]}`}
                    />
                  </td>
                  <td className="py-2.5 pr-3">
                    <Link to={`/recorrida/${f.id}`} className="font-semibold underline">
                      {f.equipo}
                    </Link>
                    {f.cerrada && <span className="badge ml-2 bg-acero-900">Cerrada</span>}
                  </td>
                  <td className="py-2.5 pr-3">{f.pozoLocacion}</td>
                  <td className="py-2.5 pr-3">{fechaAR(f.fechaRelevamiento)}</td>
                  <td className="py-2.5 pr-3 text-right font-semibold">{f.pctAvance}%</td>
                  <td
                    className={`py-2.5 pr-3 text-right font-semibold ${
                      f.noOk > 0 ? "text-critico-ink" : "text-acero-300"
                    }`}
                  >
                    {f.noOk || "—"}
                  </td>
                  <td
                    className={`py-2.5 pr-3 text-right font-semibold ${
                      f.reiterativos > 0 ? "text-reiterado-ink" : "text-acero-300"
                    }`}
                  >
                    {f.reiterativos || "—"}
                  </td>
                  <td className="py-2.5 pr-3 text-sm">
                    {f.pendientesSync > 0 ? (
                      <span className="text-mayor-ink">{f.pendientesSync} por subir</span>
                    ) : f.sharepointId ? (
                      <span className="text-conforme-ink">En SharePoint</span>
                    ) : (
                      <span className="text-acero-500">Solo local</span>
                    )}
                  </td>
                  <td className="py-2.5 pr-4">
                    <div className="flex justify-end gap-3 text-sm">
                      <button type="button" className="underline" onClick={() => duplicar(f.id)}>
                        Duplicar
                      </button>
                      <button
                        type="button"
                        className="text-critico-ink underline"
                        onClick={() => void eliminar(f.id, f.folio)}
                      >
                        Eliminar
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

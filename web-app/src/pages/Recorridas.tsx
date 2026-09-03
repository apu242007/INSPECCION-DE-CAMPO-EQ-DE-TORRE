import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { CATALOGO_POR_ID } from "../data/catalogo";
import { calcularKPIs } from "../lib/metrics";
import * as storage from "../storage";
import type { EntradaIndice } from "../storage";
import type { Recorrida } from "../types";
import { fechaAR } from "../ui";

/** Listado de recorridas: locales (IndexedDB) y las que ya fueron a SharePoint. */

interface Fila extends EntradaIndice {
  pctAvance: number;
  noOk: number;
  reiterativos: number;
  pendientesSync: number;
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
    if (!confirm(`¿Eliminar la recorrida ${folio ?? id}? Esta acción no se puede deshacer.`)) return;
    await storage.borrarRecorrida(id);
    await cargar();
  }

  async function duplicar(id: string) {
    const anterior = await storage.leerRecorrida(id);
    if (!anterior) return;
    navigate(`/nueva?duplicarDe=${encodeURIComponent(id)}`, { state: { equipo: anterior.equipo } });
  }

  return (
    <div className="space-y-3 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="flex-1 text-2xl font-bold">Recorridas</h1>
        <Link to="/nueva" className="boton-primario w-auto px-6">
          + Nueva recorrida
        </Link>
      </div>

      {equipos.length > 0 && (
        <select className="campo" value={filtroEquipo} onChange={(e) => setFiltroEquipo(e.target.value)}>
          <option value="">Todos los equipos</option>
          {equipos.map((e) => (
            <option key={e} value={e}>
              {e}
            </option>
          ))}
        </select>
      )}

      {cargando && <p className="tarjeta text-center">Cargando…</p>}

      {!cargando && visibles.length === 0 && (
        <div className="tarjeta space-y-2 text-center">
          <p className="text-lg font-bold">Todavía no hay recorridas.</p>
          <p className="text-sm text-stone-600">
            Creá una nueva y la app genera los 94 ítems del catálogo en estado «sin revisar».
          </p>
        </div>
      )}

      <ul className="space-y-2">
        {visibles.map((f) => (
          <li key={f.id} className="tarjeta">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-lg font-bold">{f.equipo}</span>
              {f.cerrada && <span className="badge bg-stone-800">CERRADA</span>}
              {f.sharepointId ? (
                <span className="badge bg-ok" title={`ID ${f.sharepointId} en SharePoint`}>
                  ☁️ EN SP
                </span>
              ) : (
                <span className="badge bg-stone-500">☁️ LOCAL</span>
              )}
              {f.pendientesSync > 0 && (
                <span className="badge bg-enProc">{f.pendientesSync} por subir</span>
              )}
            </div>

            <p className="mt-1 text-sm text-stone-600">
              {f.folio} · {f.pozoLocacion} · {fechaAR(f.fechaRelevamiento)}
            </p>

            <div className="mt-2 flex flex-wrap items-center gap-3 text-sm">
              <span>
                Avance <strong>{f.pctAvance}%</strong>
              </span>
              <span className={f.noOk > 0 ? "text-noOk" : ""}>
                NO OK <strong>{f.noOk}</strong>
              </span>
              <span className={f.reiterativos > 0 ? "text-violet-700" : ""}>
                Reiterativos <strong>{f.reiterativos}</strong>
              </span>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              <Link to={`/recorrida/${f.id}`} className="boton-secundario">
                Abrir
              </Link>
              <button type="button" className="boton-secundario" onClick={() => void duplicar(f.id)}>
                Duplicar
              </button>
              <button
                type="button"
                className="boton-secundario border-noOk text-noOk"
                onClick={() => void eliminar(f.id, f.folio)}
              >
                Eliminar
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Reexportado para las pruebas manuales del listado. */
export type { Recorrida };

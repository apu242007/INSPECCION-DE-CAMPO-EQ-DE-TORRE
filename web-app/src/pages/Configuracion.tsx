import { useEffect, useState } from "react";
import { ORDEN_RECORRIDA_SUGERIDO, ZONAS } from "../data/catalogo";
import { descargar } from "../lib/descargar";
import { normalizarEquipo } from "../lib/validacion";
import * as storage from "../storage";
import { CONFIG_DEFAULT, type ConfiguracionApp, type SemillaEquipo } from "../types";
import { aplicarContraste } from "../ui";

/** Responsables frecuentes, orden de recorrida por equipo, semillas, contraste y backup. */
export function Configuracion() {
  const [config, setConfig] = useState<ConfiguracionApp>(CONFIG_DEFAULT);
  const [equipos, setEquipos] = useState<string[]>([]);
  const [equipoOrden, setEquipoOrden] = useState("");
  const [orden, setOrden] = useState<string[]>([...ORDEN_RECORRIDA_SUGERIDO]);
  const [nuevoResponsable, setNuevoResponsable] = useState("");
  const [mensaje, setMensaje] = useState<string | null>(null);

  useEffect(() => {
    void storage.leerConfig().then(setConfig);
    void storage.equiposConocidos().then((e) => {
      setEquipos(e);
      if (e.length > 0) setEquipoOrden(e[0]);
    });
  }, []);

  useEffect(() => {
    if (!equipoOrden) return;
    const guardado = config.ordenZonasPorEquipo[normalizarEquipo(equipoOrden)];
    setOrden(guardado ?? [...ORDEN_RECORRIDA_SUGERIDO]);
  }, [equipoOrden, config.ordenZonasPorEquipo]);

  async function guardar(siguiente: ConfiguracionApp) {
    setConfig(siguiente);
    await storage.guardarConfig(siguiente);
  }

  function mover(indice: number, delta: number) {
    const nuevo = [...orden];
    const destino = indice + delta;
    if (destino < 0 || destino >= nuevo.length) return;
    [nuevo[indice], nuevo[destino]] = [nuevo[destino], nuevo[indice]];
    setOrden(nuevo);
  }

  async function guardarOrden() {
    if (!equipoOrden) return;
    await guardar({
      ...config,
      ordenZonasPorEquipo: {
        ...config.ordenZonasPorEquipo,
        [normalizarEquipo(equipoOrden)]: orden,
      },
    });
    setMensaje(`Orden de recorrida guardado para ${equipoOrden}.`);
  }

  async function importarSemilla(archivo: File) {
    try {
      const semilla = JSON.parse(await archivo.text()) as SemillaEquipo;
      if (!semilla.equipo || !semilla.aparicionesPrevias) {
        throw new Error("Faltan 'equipo' o 'aparicionesPrevias'.");
      }
      await guardar({
        ...config,
        semillas: [
          ...config.semillas.filter(
            (s) => normalizarEquipo(s.equipo) !== normalizarEquipo(semilla.equipo),
          ),
          { ...semilla, corregidosUltimaInspeccion: semilla.corregidosUltimaInspeccion ?? [] },
        ],
      });
      setMensaje(`Semilla de ${semilla.equipo} importada.`);
    } catch (e) {
      setMensaje(`No se pudo importar la semilla: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return (
    <div className="mx-auto w-full max-w-4xl space-y-4 p-3 md:p-6">
      <h1 className="text-2xl font-semibold">Configuración</h1>
      {mensaje && <p className="panel p-4 text-sm font-semibold">{mensaje}</p>}

      <section className="panel p-4 space-y-2">
        <h2 className="text-lg font-semibold">Modo sol / alto contraste</h2>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={config.altoContraste}
            onChange={(e) => {
              aplicarContraste(e.target.checked);
              void guardar({ ...config, altoContraste: e.target.checked });
            }}
          />
          <span>Fondo blanco, texto negro y tipografía más grande.</span>
        </label>
      </section>

      <section className="panel p-4 space-y-2">
        <h2 className="text-lg font-semibold">Responsables frecuentes</h2>
        <p className="text-sm text-acero-500">
          Aparecen como sugerencia al asignar un responsable en modo oficina.
        </p>
        <div className="flex gap-2">
          <input
            className="campo flex-1"
            value={nuevoResponsable}
            onChange={(e) => setNuevoResponsable(e.target.value)}
            placeholder="Nombre y apellido"
          />
          <button
            type="button"
            className="boton-secundario"
            onClick={() => {
              const v = nuevoResponsable.trim();
              if (!v || config.responsablesFrecuentes.includes(v)) return;
              void guardar({
                ...config,
                responsablesFrecuentes: [...config.responsablesFrecuentes, v],
              });
              setNuevoResponsable("");
            }}
          >
            Agregar
          </button>
        </div>
        <ul className="space-y-1">
          {config.responsablesFrecuentes.map((r) => (
            <li key={r} className="flex items-center gap-2 text-sm">
              <span className="flex-1">{r}</span>
              <button
                type="button"
                className="font-bold text-critico-ink underline"
                onClick={() =>
                  void guardar({
                    ...config,
                    responsablesFrecuentes: config.responsablesFrecuentes.filter((x) => x !== r),
                  })
                }
              >
                Quitar
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section className="panel p-4 space-y-2">
        <h2 className="text-lg font-semibold">Orden de recorrida por equipo</h2>
        <p className="text-sm text-acero-500">
          El paso a paso sigue este orden. Conviene que coincida con el recorrido físico —de
          abajo hacia arriba— para no subir y bajar del mástil dos veces.
        </p>

        {equipos.length === 0 ? (
          <p className="text-sm">Todavía no hay equipos cargados.</p>
        ) : (
          <>
            <select className="campo" value={equipoOrden} onChange={(e) => setEquipoOrden(e.target.value)}>
              {equipos.map((e) => (
                <option key={e} value={e}>
                  {e}
                </option>
              ))}
            </select>

            <ol className="space-y-1">
              {orden.map((z, i) => (
                <li key={z} className="flex items-center gap-2 rounded border border-acero-200 p-2">
                  <span className="w-6 text-sm font-semibold text-acero-500">{i + 1}</span>
                  <span className="flex-1 text-sm">{z}</span>
                  <button
                    type="button"
                    className="boton-secundario min-h-[36px] px-2 text-sm"
                    disabled={i === 0}
                    onClick={() => mover(i, -1)}
                    aria-label={`Subir ${z}`}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    className="boton-secundario min-h-[36px] px-2 text-sm"
                    disabled={i === orden.length - 1}
                    onClick={() => mover(i, 1)}
                    aria-label={`Bajar ${z}`}
                  >
                    ↓
                  </button>
                </li>
              ))}
            </ol>

            <div className="flex gap-2">
              <button type="button" className="boton-secundario" onClick={() => setOrden([...ZONAS])}>
                Alfabético
              </button>
              <button
                type="button"
                className="boton-secundario"
                onClick={() => setOrden([...ORDEN_RECORRIDA_SUGERIDO])}
              >
                Sugerido
              </button>
              <button type="button" className="boton-primario flex-1" onClick={() => void guardarOrden()}>
                Guardar orden
              </button>
            </div>
          </>
        )}
      </section>

      <section className="panel p-4 space-y-2">
        <h2 className="text-lg font-semibold">Semillas de historial externo</h2>
        <p className="text-sm text-acero-500">
          Un mapa <code>itemId → cantidad de informes externos</code> por equipo. Sin esto, la
          primera recorrida propone «nuevo» para hallazgos que ya salieron tres veces.
        </p>

        <ul className="space-y-1 text-sm">
          {config.semillas.map((s) => (
            <li key={s.equipo} className="rounded border border-acero-200 p-2">
              <p className="font-bold">{s.equipo}</p>
              <p className="text-acero-500">{s.referencia}</p>
              <p>
                {Object.keys(s.aparicionesPrevias).length} ítem(s) con historial ·{" "}
                {s.corregidosUltimaInspeccion.length} corregidos
              </p>
            </li>
          ))}
        </ul>

        <label className="boton-secundario w-full cursor-pointer">
          Importar semilla (JSON)
          <input
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void importarSemilla(f);
              e.target.value = "";
            }}
          />
        </label>
      </section>

      <section className="panel p-4 space-y-2">
        <h2 className="text-lg font-semibold">Backup local</h2>
        <p className="text-sm text-acero-500">
          El respaldo real es SharePoint. Esto es una copia del storage del dispositivo.
        </p>
        <button
          type="button"
          className="boton-secundario w-full"
          onClick={async () =>
            descargar(
              new Blob([await storage.exportarTodoJSON()], { type: "application/json" }),
              `backup-eq-torre-${new Date().toISOString().slice(0, 10)}.json`,
            )
          }
        >
          Exportar todo el storage (JSON)
        </button>

        <label className="boton-secundario w-full cursor-pointer">
          Importar una recorrida (JSON)
          <input
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (!f) return;
              try {
                const r = await storage.importarRecorridaJSON(await f.text());
                setMensaje(`Recorrida ${r.folio ?? r.id} importada.`);
              } catch (err) {
                setMensaje(err instanceof Error ? err.message : String(err));
              }
            }}
          />
        </label>
      </section>
    </div>
  );
}

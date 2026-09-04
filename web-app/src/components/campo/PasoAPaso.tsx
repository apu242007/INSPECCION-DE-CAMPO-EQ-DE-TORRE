import { useEffect, useMemo, useState } from "react";
import { HALLAZGO_DERIVADO } from "../../data/catalogo";
import { badgeOrigen } from "../../lib/reiteracion";
import { requiereFoto } from "../../lib/validacion";
import type { Estado, Foto, ItemCatalogo, Origen, Recorrida, Reiteracion } from "../../types";
import { CLASE_CRITICIDAD, ETIQUETA_CRITICIDAD, vibrar } from "../../ui";
import type { UseRecorrida } from "../../hooks/useRecorrida";
import { ordenarItems } from "../../hooks/useRecorrida";
import { Escalera } from "../Escalera";
import { RielZonas, estadoPorZona } from "../RielZonas";
import { BotonesEstado } from "./BotonesEstado";
import { CapturaFoto } from "./CapturaFoto";
import { NotaVoz } from "./NotaVoz";
import { ToggleReiteracion } from "./ToggleReiteracion";

/**
 * MODO CAMPO — un ítem por pantalla.
 *
 * Se usa con el celular en una mano, con guantes, a pleno sol, colgado del mástil con arnés.
 * Reglas que no se negocian:
 *   - Un solo ítem visible, con la acción que corresponde.
 *   - Los 4 botones de estado ocupan la zona del pulgar.
 *   - OK y N/A avanzan solos al siguiente ítem.
 *   - NO OK / EN PROC abren la cámara directo; no se puede seguir sin foto.
 *   - Cero tipeo obligatorio: lo demás se completa en modo oficina.
 *
 * En tablet aparece el riel de zonas a la izquierda —la elevación del equipo— porque ahí sí
 * hay ancho para ver dónde estás parado sin sacarle lugar al ítem.
 */

interface Props {
  ctx: UseRecorrida;
  recorrida: Recorrida;
  onSalir: () => void;
  onAgregarAdicional: (zona: string) => void;
}

type Fase = "ESTADO" | "EVIDENCIA";

export function PasoAPaso({ ctx, recorrida, onSalir, onAgregarAdicional }: Props) {
  const items = useMemo(
    () => ordenarItems(ctx.catalogo, ctx.ordenZonas),
    [ctx.catalogo, ctx.ordenZonas],
  );

  const [indice, setIndice] = useState(() =>
    Math.min(recorrida.indiceActual ?? 0, Math.max(0, items.length - 1)),
  );
  const [fase, setFase] = useState<Fase>("ESTADO");
  const [ayuda, setAyuda] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const item = items[indice] as ItemCatalogo | undefined;
  const registro = recorrida.registros.find((r) => r.itemId === item?.id);

  const zonas = useMemo(
    () => estadoPorZona(recorrida, ctx.catalogoPorId, ctx.ordenZonas),
    [recorrida, ctx.catalogoPorId, ctx.ordenZonas],
  );

  // El índice actual se persiste: la recorrida se retoma exactamente donde quedó.
  useEffect(() => {
    if (recorrida.indiceActual !== indice) {
      ctx.actualizar((r) => ({ ...r, indiceActual: indice }));
    }
    // Solo cuando cambia el índice: incluir ctx re-dispararía en cada guardado.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [indice]);

  useEffect(() => {
    setFase(registro && requiereFoto(registro) ? "EVIDENCIA" : "ESTADO");
    setAyuda(false);
  }, [indice, registro?.estado]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 1000);
    return () => clearTimeout(t);
  }, [toast]);

  if (!item || !registro) {
    return (
      <div className="p-6">
        <p className="text-lg font-semibold">No hay ítems para recorrer.</p>
        <button className="boton-primario mt-4" onClick={onSalir}>
          Volver
        </button>
      </div>
    );
  }

  const revisados = recorrida.registros.filter((r) => r.estado !== "SIN_REVISAR").length;
  const propuesta = ctx.proponer(item.id);

  function avanzar() {
    if (indice < items.length - 1) setIndice(indice + 1);
    else onSalir();
  }

  function elegirEstado(estado: Estado) {
    const necesita = estado === "NO_OK" || estado === "EN_PROC";

    ctx.actualizarRegistro(item!.id, (r) => ({
      ...r,
      estado,
      fechaVerif: new Date().toISOString(),
      // La app propone; el inspector confirma o cambia con el toggle.
      origen: necesita ? (r.origen ?? propuesta.origen) : undefined,
      reiteracion: necesita ? (r.reiteracion ?? propuesta.reiteracion) : undefined,
      // Un ítem que deja de ser no conforme no conserva evidencia de un hallazgo que ya no existe.
      evidencia: necesita ? r.evidencia : [],
      notaVoz: necesita ? r.notaVoz : undefined,
    }));

    if (necesita) {
      setFase("EVIDENCIA");
    } else {
      setToast("Guardado");
      avanzar();
    }
  }

  function irAZona(zona: string) {
    const i = items.findIndex((it) => it.zona === zona);
    if (i >= 0) setIndice(i);
    vibrar();
  }

  function saltarZona() {
    const zonaActual = item!.zona;
    const siguiente = items.findIndex((it, i) => i > indice && it.zona !== zonaActual);
    setIndice(siguiente >= 0 ? siguiente : items.length - 1);
    vibrar();
  }

  const fotos = registro.evidencia;
  const enEvidencia = fase === "EVIDENCIA" && requiereFoto(registro);

  return (
    <div className="flex min-h-[100dvh] bg-acero-100">
      {/* El riel solo aparece cuando hay ancho para él sin robárselo al ítem. */}
      <aside className="cromo hidden w-60 shrink-0 md:block lg:w-64">
        <RielZonas zonas={zonas} zonaActual={item.zona} onIrAZona={irAZona} />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="cromo cromo-borde-abajo sticky top-0 z-10 px-3 py-2 md:px-5">
          <div className="flex items-center gap-3">
            <button type="button" className="text-base text-white/70 underline" onClick={onSalir}>
              ← Salir
            </button>
            <span className="cifras flex-1 truncate text-center text-base text-white md:text-left">
              <span style={{ fontWeight: 700 }}>
                {indice + 1}/{items.length}
              </span>
              <span className="text-white/60"> · {item.zona}</span>
            </span>
            <span className="cifras shrink-0 text-sm text-white/60">{revisados} revisados</span>
          </div>

          {/*
            En celular no entra el riel, así que la escalera hace su trabajo: un tramo por
            zona, con el tramo actual marcado y tocable para saltar.
          */}
          <div className="mt-2 md:hidden">
            <Escalera zonas={zonas} zonaActual={item.zona} onIrAZona={irAZona} />
          </div>
        </header>

        <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center gap-3 p-3 md:p-5">
          {/* El enunciado del ítem es lo único que se lee en altura: va grande y sin caja. */}
          <div className="panel larguero larguero-curso p-4 md:p-5">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <span className="chapa text-base">#{item.id}</span>
              <span className={`badge ${CLASE_CRITICIDAD[item.criticidadRef]}`}>
                {ETIQUETA_CRITICIDAD[item.criticidadRef]}
              </span>
              {registro.origen && (
                <span
                  className={`badge ${registro.origen === "NUEVO" ? "bg-nuevo" : "bg-reiterado"}`}
                >
                  {badgeOrigen(registro.origen, registro.reiteracion)}
                  {registro.reiteracion?.detectadaAutomaticamente ? " ◆" : ""}
                </span>
              )}
              <button
                type="button"
                className="ml-auto flex h-10 w-10 items-center justify-center rounded-[3px] border-2 border-acero-900 text-lg font-bold"
                aria-expanded={ayuda}
                aria-label="Ver el hallazgo típico de este ítem"
                onClick={() => setAyuda((v) => !v)}
              >
                ?
              </button>
            </div>

            <p className="text-[1.15rem] leading-snug md:text-xl">{item.item}</p>

            {ayuda && (
              <div className="mt-4 border-l-[3px] border-acero-900 bg-acero-50 p-3 text-base">
                <p className="font-semibold">Cómo se redacta si falla</p>
                <p className="mt-1">{item.hallazgoTipico}</p>
                {HALLAZGO_DERIVADO.has(item.id) && (
                  <p className="mt-2 text-sm text-acero-500">
                    Redacción derivada de la condición, todavía no tomada del informe original.
                  </p>
                )}
              </div>
            )}
          </div>

          {enEvidencia && (
            <>
              <section className="panel p-4 md:p-5">
                <h2 className="mb-3 text-lg font-semibold">
                  Evidencia
                  <span className="cifras ml-2 text-base font-normal text-acero-500">
                    {fotos.length} {fotos.length === 1 ? "foto" : "fotos"}
                  </span>
                </h2>
                <CapturaFoto
                  itemId={item.id}
                  fotos={fotos}
                  onCambio={(nuevas: Foto[]) =>
                    ctx.actualizarRegistro(item.id, (r) => ({ ...r, evidencia: nuevas }))
                  }
                />
              </section>

              <section className="panel p-4 md:p-5">
                <ToggleReiteracion
                  propuesta={propuesta}
                  origen={registro.origen}
                  reiteracion={registro.reiteracion}
                  onCambio={(origen: Origen, reiteracion: Reiteracion | undefined) =>
                    ctx.actualizarRegistro(item.id, (r) => ({ ...r, origen, reiteracion }))
                  }
                />
              </section>

              <section className="panel p-4 md:p-5">
                <h2 className="mb-3 text-lg font-semibold">Observación</h2>
                <NotaVoz
                  itemId={item.id}
                  nota={registro.notaVoz}
                  texto={registro.observaciones}
                  onNota={(nota) => ctx.actualizarRegistro(item.id, (r) => ({ ...r, notaVoz: nota }))}
                  onTexto={(texto) =>
                    ctx.actualizarRegistro(item.id, (r) => ({ ...r, observaciones: texto }))
                  }
                />
              </section>
            </>
          )}
        </main>

        {/* Zona del pulgar. Todo lo accionable vive acá abajo, nada arriba. */}
        <footer className="cromo cromo-borde-arriba sticky bottom-0 p-3 md:px-5">
          <div className="mx-auto w-full max-w-3xl space-y-2.5">
            {enEvidencia ? (
              <>
                <button
                  type="button"
                  className="boton-primario"
                  disabled={fotos.length === 0}
                  onClick={() => {
                    vibrar();
                    setToast("Guardado");
                    avanzar();
                  }}
                >
                  {fotos.length === 0 ? "Falta la foto" : "Listo, siguiente ítem"}
                </button>
                <button
                  type="button"
                  className="boton-secundario w-full"
                  onClick={() => setFase("ESTADO")}
                >
                  Cambiar el estado
                </button>
              </>
            ) : (
              <BotonesEstado actual={registro.estado} onElegir={elegirEstado} />
            )}

            <div className="flex gap-2">
              <button
                type="button"
                className="boton-secundario flex-1"
                disabled={indice === 0}
                onClick={() => setIndice(indice - 1)}
                aria-label="Ítem anterior"
              >
                ‹
              </button>
              <button type="button" className="boton-secundario flex-[3]" onClick={saltarZona}>
                Saltar zona
              </button>
              <button
                type="button"
                className="boton-secundario flex-1"
                disabled={indice >= items.length - 1}
                onClick={() => setIndice(indice + 1)}
                aria-label="Ítem siguiente"
              >
                ›
              </button>
            </div>

            <button
              type="button"
              className="boton-secundario w-full border-dashed"
              onClick={() => onAgregarAdicional(item.zona)}
            >
              Agregar ítem detectado
            </button>
          </div>
        </footer>
      </div>

      {toast && (
        <div
          role="status"
          className="pointer-events-none fixed inset-x-0 top-1/2 z-50 mx-auto w-fit rounded-[3px] bg-acero-950 px-8 py-4 text-2xl font-bold text-white"
        >
          {toast}
        </div>
      )}
    </div>
  );
}

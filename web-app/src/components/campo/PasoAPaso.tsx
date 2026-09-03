import { useEffect, useMemo, useState } from "react";
import { HALLAZGO_DERIVADO } from "../../data/catalogo";
import { badgeOrigen } from "../../lib/reiteracion";
import { requiereFoto } from "../../lib/validacion";
import type { Estado, Foto, ItemCatalogo, Origen, Recorrida, Reiteracion } from "../../types";
import { CLASE_CRITICIDAD, ETIQUETA_CRITICIDAD, vibrar } from "../../ui";
import type { UseRecorrida } from "../../hooks/useRecorrida";
import { ordenarItems } from "../../hooks/useRecorrida";
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
 *   - Los 4 botones de estado ocupan la mitad inferior (zona del pulgar).
 *   - OK y N/A avanzan solos al siguiente ítem.
 *   - NO OK / EN PROC abren la cámara directo; no se puede seguir sin foto.
 *   - Cero tipeo obligatorio: lo demás se completa en modo oficina.
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
      <div className="p-4">
        <p className="text-lg font-bold">No hay ítems para recorrer.</p>
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

  function saltarZona() {
    const zonaActual = item!.zona;
    const siguiente = items.findIndex((it, i) => i > indice && it.zona !== zonaActual);
    setIndice(siguiente >= 0 ? siguiente : items.length - 1);
    vibrar();
  }

  const fotos = registro.evidencia;
  const enEvidencia = fase === "EVIDENCIA" && requiereFoto(registro);

  return (
    <div className="flex min-h-[100dvh] flex-col">
      {/* Barra de progreso: 23/94 · Mástil */}
      <header className="sticky top-0 z-10 border-b-2 border-stone-300 bg-white px-3 py-2">
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            className="text-base font-bold underline"
            onClick={onSalir}
            aria-label="Salir del modo paso a paso"
          >
            ← Salir
          </button>
          <span className="text-base font-bold">
            {indice + 1}/{items.length} · {item.zona}
          </span>
          <span className="text-sm text-stone-600">{revisados} ok</span>
        </div>
        <div
          className="mt-2 h-2 w-full rounded bg-stone-200"
          role="progressbar"
          aria-valuenow={revisados}
          aria-valuemin={0}
          aria-valuemax={items.length}
        >
          <div
            className="h-2 rounded bg-stone-900 transition-[width]"
            style={{ width: `${(revisados / items.length) * 100}%` }}
          />
        </div>
      </header>

      {/* Enunciado del ítem */}
      <main className="flex-1 space-y-3 p-3">
        <div className="tarjeta">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className="text-base font-bold text-stone-500">#{item.id}</span>
            <span className={`badge ${CLASE_CRITICIDAD[item.criticidadRef]}`}>
              {ETIQUETA_CRITICIDAD[item.criticidadRef]}
            </span>
            {registro.origen && (
              <span
                className={`badge ${registro.origen === "NUEVO" ? "bg-blue-700" : "bg-violet-700"}`}
              >
                {badgeOrigen(registro.origen, registro.reiteracion)}
                {registro.reiteracion?.detectadaAutomaticamente ? " 🔎" : ""}
              </span>
            )}
            <button
              type="button"
              className="ml-auto flex h-9 w-9 items-center justify-center rounded-full
                         border-2 border-stone-800 text-lg font-bold"
              aria-label="Ver el hallazgo típico de este ítem"
              onClick={() => setAyuda((v) => !v)}
            >
              ?
            </button>
          </div>

          <p className="text-lg leading-snug">{item.item}</p>

          {ayuda && (
            <div className="mt-3 rounded border-l-4 border-stone-800 bg-stone-100 p-3 text-base">
              <p className="font-bold">Cómo se redacta si falla:</p>
              <p className="mt-1">{item.hallazgoTipico}</p>
              {HALLAZGO_DERIVADO.has(item.id) && (
                <p className="mt-2 text-sm italic text-stone-600">
                  Redacción derivada de la condición, todavía no tomada del informe real.
                </p>
              )}
            </div>
          )}
        </div>

        {enEvidencia && (
          <>
            <div className="tarjeta space-y-3">
              <p className="text-base font-bold">
                Evidencia obligatoria ({fotos.length} foto{fotos.length === 1 ? "" : "s"})
              </p>
              <CapturaFoto
                itemId={item.id}
                fotos={fotos}
                onCambio={(nuevas: Foto[]) =>
                  ctx.actualizarRegistro(item.id, (r) => ({ ...r, evidencia: nuevas }))
                }
              />
            </div>

            <div className="tarjeta">
              <ToggleReiteracion
                propuesta={propuesta}
                origen={registro.origen}
                reiteracion={registro.reiteracion}
                onCambio={(origen: Origen, reiteracion: Reiteracion | undefined) =>
                  ctx.actualizarRegistro(item.id, (r) => ({ ...r, origen, reiteracion }))
                }
              />
            </div>

            <div className="tarjeta">
              <NotaVoz
                itemId={item.id}
                nota={registro.notaVoz}
                texto={registro.observaciones}
                onNota={(nota) => ctx.actualizarRegistro(item.id, (r) => ({ ...r, notaVoz: nota }))}
                onTexto={(texto) =>
                  ctx.actualizarRegistro(item.id, (r) => ({ ...r, observaciones: texto }))
                }
              />
            </div>
          </>
        )}
      </main>

      {/* Zona del pulgar: los 4 botones o el confirmar de la evidencia. */}
      <footer className="sticky bottom-0 space-y-3 border-t-2 border-stone-300 bg-white p-3">
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
              {fotos.length === 0 ? "Falta foto" : "Listo · siguiente"}
            </button>
            <button type="button" className="boton-secundario w-full" onClick={() => setFase("ESTADO")}>
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
          <button type="button" className="boton-secundario flex-[2]" onClick={saltarZona}>
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
          + Ítem detectado en recorrida
        </button>
      </footer>

      {toast && (
        <div
          role="status"
          className="pointer-events-none fixed inset-x-0 top-1/2 z-50 mx-auto w-fit rounded-lg
                     bg-stone-900 px-8 py-4 text-2xl font-bold text-white"
        >
          {toast}
        </div>
      )}
    </div>
  );
}

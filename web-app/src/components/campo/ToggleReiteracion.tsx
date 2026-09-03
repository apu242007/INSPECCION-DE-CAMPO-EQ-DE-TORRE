import { useState } from "react";
import {
  ETIQUETA_FUENTE,
  combinarConManual,
  explicarPropuesta,
  type PropuestaReiteracion,
} from "../../lib/reiteracion";
import type { FuenteReiteracion, Origen, Reiteracion } from "../../types";
import { vibrar } from "../../ui";

/**
 * Toggle grande Nuevo / Reiterativo con la propuesta automática ya seleccionada y explicada.
 * Es lo único además del estado y la foto que se pide en altura: un tap, sin tipeo.
 *
 * El detalle manual (fuente, veces, referencia) queda plegado: solo aparece si el inspector
 * cambia la propuesta, porque sabe algo que la app no sabe (una auditoría externa no cargada).
 */

interface Props {
  propuesta: PropuestaReiteracion;
  origen: Origen | undefined;
  reiteracion: Reiteracion | undefined;
  onCambio: (origen: Origen, reiteracion: Reiteracion | undefined) => void;
}

export function ToggleReiteracion({
  propuesta,
  origen,
  reiteracion,
  onCambio,
}: Props) {
  const [abierto, setAbierto] = useState(false);
  const [fuente, setFuente] = useState<FuenteReiteracion>("AUDITORIA_EXTERNA");
  const [veces, setVeces] = useState(1);
  const [referencia, setReferencia] = useState("");

  const esNuevo = origen === "NUEVO";
  const esReiterativo = origen === "REITERATIVO";

  function elegirNuevo() {
    vibrar();
    setAbierto(false);
    onCambio("NUEVO", undefined);
  }

  function elegirReiterativo() {
    vibrar();
    if (propuesta.origen === "REITERATIVO" && propuesta.reiteracion) {
      // La app ya lo detectó: se acepta la propuesta tal cual, sin pedir nada.
      onCambio("REITERATIVO", propuesta.reiteracion);
      setAbierto(false);
      return;
    }
    // No hay detección automática: hay que preguntar de dónde sale la reiteración.
    setAbierto(true);
    onCambio(
      "REITERATIVO",
      combinarConManual(propuesta, { fuente, vecesPrevias: veces, referencia }),
    );
  }

  function aplicarManual(cambios: {
    fuente?: FuenteReiteracion;
    veces?: number;
    referencia?: string;
  }) {
    const f = cambios.fuente ?? fuente;
    const v = cambios.veces ?? veces;
    const ref = cambios.referencia ?? referencia;
    setFuente(f);
    setVeces(v);
    setReferencia(ref);
    onCambio(
      "REITERATIVO",
      combinarConManual(propuesta, {
        fuente: f,
        vecesPrevias: v,
        referencia: ref,
      }),
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm font-semibold text-acero-700">
        ¿Es nuevo o ya venía de antes?
      </p>

      {/*
        Sin seleccionar va contorneado; seleccionado, relleno sólido. NO se usa el modificador
        de opacidad de Tailwind (`bg-x/60`): con colores definidos como var(--x) la regla se
        descarta y el botón queda invisible. Además, a pleno sol un relleno lavado no se
        distingue de uno sólido: el contorno sí.
      */}
      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          aria-pressed={esNuevo}
          className={`boton-estado ${
            esNuevo
              ? "bg-nuevo"
              : "border-2 border-nuevo bg-papel text-nuevo-ink"
          }`}
          onClick={elegirNuevo}
        >
          Nuevo
        </button>
        <button
          type="button"
          aria-pressed={esReiterativo}
          className={`boton-estado ${
            esReiterativo
              ? "bg-reiterado"
              : "border-2 border-reiterado bg-papel text-reiterado-ink"
          }`}
          onClick={elegirReiterativo}
        >
          Reiterativo
          {esReiterativo && reiteracion ? ` ×${reiteracion.vecesPrevias}` : ""}
        </button>
      </div>

      <div className="rounded border border-acero-200 bg-acero-50 p-3 text-sm">
        <span className="font-bold">Propuesta de la app: </span>
        {propuesta.origen === "REITERATIVO" ? "Reiterativo" : "Nuevo"}
        {". "}
        {explicarPropuesta(propuesta)}
      </div>

      {esReiterativo && reiteracion?.detectadaAutomaticamente && (
        <p className="text-sm text-acero-700">
          🔎 Reiteración detectada automáticamente · fuente:{" "}
          {ETIQUETA_FUENTE[reiteracion.fuente]}
        </p>
      )}

      {esReiterativo && (
        <button
          type="button"
          className="text-sm font-semibold underline"
          onClick={() => setAbierto((v) => !v)}
        >
          {abierto
            ? "Ocultar detalle"
            : "Agregar una auditoría externa que la app no tiene"}
        </button>
      )}

      {esReiterativo && abierto && (
        <div className="space-y-3 rounded border-2 border-reiterado p-3">
          <label className="etiqueta">
            Fuente
            <select
              className="campo mt-1"
              value={fuente}
              onChange={(e) =>
                aplicarManual({ fuente: e.target.value as FuenteReiteracion })
              }
            >
              <option value="RECORRIDA_INTERNA">Recorrida interna</option>
              <option value="AUDITORIA_EXTERNA">Auditoría externa</option>
              <option value="AMBAS">Ambas</option>
            </select>
          </label>

          <label className="etiqueta">
            Veces previas (además de las que ya detectó la app)
            <input
              type="number"
              inputMode="numeric"
              min={1}
              className="campo mt-1"
              value={veces}
              onChange={(e) =>
                aplicarManual({
                  veces: Math.max(1, Number(e.target.value) || 1),
                })
              }
            />
          </label>

          <label className="etiqueta">
            Referencia
            <input
              type="text"
              className="campo mt-1"
              placeholder="Inf. OIL DASSA 10/04/2026"
              value={referencia}
              onChange={(e) => aplicarManual({ referencia: e.target.value })}
            />
          </label>

          {reiteracion && (
            <p className="text-sm">
              Total: <strong>×{reiteracion.vecesPrevias}</strong> · fuente{" "}
              <strong>{ETIQUETA_FUENTE[reiteracion.fuente]}</strong>
            </p>
          )}
        </div>
      )}
    </div>
  );
}

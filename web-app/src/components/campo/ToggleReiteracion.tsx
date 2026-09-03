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

export function ToggleReiteracion({ propuesta, origen, reiteracion, onCambio }: Props) {
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
    onCambio("REITERATIVO", combinarConManual(propuesta, { fuente, vecesPrevias: veces, referencia }));
  }

  function aplicarManual(cambios: { fuente?: FuenteReiteracion; veces?: number; referencia?: string }) {
    const f = cambios.fuente ?? fuente;
    const v = cambios.veces ?? veces;
    const ref = cambios.referencia ?? referencia;
    setFuente(f);
    setVeces(v);
    setReferencia(ref);
    onCambio("REITERATIVO", combinarConManual(propuesta, { fuente: f, vecesPrevias: v, referencia: ref }));
  }

  return (
    <div className="space-y-3">
      <p className="text-sm font-bold uppercase text-stone-600">¿Es nuevo o ya venía de antes?</p>

      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          aria-pressed={esNuevo}
          className={`boton-estado ${esNuevo ? "bg-blue-700 ring-4 ring-stone-900 ring-offset-2" : "bg-blue-700/60"}`}
          onClick={elegirNuevo}
        >
          Nuevo
        </button>
        <button
          type="button"
          aria-pressed={esReiterativo}
          className={`boton-estado ${
            esReiterativo ? "bg-violet-700 ring-4 ring-stone-900 ring-offset-2" : "bg-violet-700/60"
          }`}
          onClick={elegirReiterativo}
        >
          Reiterativo
          {esReiterativo && reiteracion ? ` ×${reiteracion.vecesPrevias}` : ""}
        </button>
      </div>

      <div className="rounded border border-stone-300 bg-stone-100 p-3 text-sm">
        <span className="font-bold">Propuesta de la app: </span>
        {propuesta.origen === "REITERATIVO" ? "Reiterativo" : "Nuevo"}
        {". "}
        {explicarPropuesta(propuesta)}
      </div>

      {esReiterativo && reiteracion?.detectadaAutomaticamente && (
        <p className="text-sm text-stone-700">
          🔎 Reiteración detectada automáticamente · fuente: {ETIQUETA_FUENTE[reiteracion.fuente]}
        </p>
      )}

      {esReiterativo && (
        <button
          type="button"
          className="text-sm font-bold underline"
          onClick={() => setAbierto((v) => !v)}
        >
          {abierto ? "Ocultar detalle" : "Agregar una auditoría externa que la app no tiene"}
        </button>
      )}

      {esReiterativo && abierto && (
        <div className="space-y-3 rounded border-2 border-violet-700 p-3">
          <label className="block text-sm font-bold">
            Fuente
            <select
              className="campo mt-1"
              value={fuente}
              onChange={(e) => aplicarManual({ fuente: e.target.value as FuenteReiteracion })}
            >
              <option value="RECORRIDA_INTERNA">Recorrida interna</option>
              <option value="AUDITORIA_EXTERNA">Auditoría externa</option>
              <option value="AMBAS">Ambas</option>
            </select>
          </label>

          <label className="block text-sm font-bold">
            Veces previas (además de las que ya detectó la app)
            <input
              type="number"
              inputMode="numeric"
              min={1}
              className="campo mt-1"
              value={veces}
              onChange={(e) => aplicarManual({ veces: Math.max(1, Number(e.target.value) || 1) })}
            />
          </label>

          <label className="block text-sm font-bold">
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

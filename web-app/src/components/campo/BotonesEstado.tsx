import type { Estado } from "../../types";
import { vibrar } from "../../ui";

/**
 * Los cuatro botones de estado, apilados en la mitad inferior (zona del pulgar).
 * Alto >= 72px, ancho completo, texto >= 18px, sin dropdowns ni iconos chicos:
 * se opera con una mano, con guantes, colgado del mástil.
 */

const OPCIONES: { estado: Estado; texto: string; clase: string }[] = [
  { estado: "OK", texto: "OK", clase: "bg-ok" },
  { estado: "NO_OK", texto: "NO OK", clase: "bg-noOk" },
  { estado: "EN_PROC", texto: "EN PROC", clase: "bg-enProc" },
  { estado: "NA", texto: "N/A", clase: "bg-na" },
];

interface Props {
  actual: Estado;
  onElegir: (estado: Estado) => void;
  deshabilitado?: boolean;
}

export function BotonesEstado({ actual, onElegir, deshabilitado }: Props) {
  return (
    <div className="grid gap-3">
      {OPCIONES.map((o) => {
        const seleccionado = actual === o.estado;
        return (
          <button
            key={o.estado}
            type="button"
            aria-pressed={seleccionado}
            disabled={deshabilitado}
            className={`boton-estado ${o.clase} ${
              seleccionado ? "ring-4 ring-stone-900 ring-offset-2" : ""
            }`}
            onClick={() => {
              vibrar();
              onElegir(o.estado);
            }}
          >
            {o.texto}
            {seleccionado && <span className="ml-2 text-2xl leading-none">✓</span>}
          </button>
        );
      })}
    </div>
  );
}

import type { Estado } from "../../types";
import { vibrar } from "../../ui";

/**
 * Los cuatro estados como controles de un tablero de comando.
 *
 * Restricciones que no se negocian, porque vienen del uso y no del gusto:
 *   - 72 px de alto y ancho completo: se opera con guantes, con una mano, colgado del mástil.
 *   - Sin hover, sin dropdown, sin ícono chico: en campo no hay puntero y no se afina la vista.
 *   - El seleccionado se marca con un anillo grueso, no con un tinte: a pleno sol un tinte
 *     suave desaparece.
 *
 * En horizontal pasan a 2x2 y en tablet/escritorio a una fila de cuatro (ver .grid-estados).
 */

const OPCIONES: { estado: Estado; texto: string; clase: string }[] = [
  { estado: "OK", texto: "OK", clase: "bg-conforme" },
  { estado: "NO_OK", texto: "NO OK", clase: "bg-critico" },
  { estado: "EN_PROC", texto: "En proceso", clase: "bg-mayor" },
  { estado: "NA", texto: "N/A", clase: "bg-general" },
];

interface Props {
  actual: Estado;
  onElegir: (estado: Estado) => void;
  deshabilitado?: boolean;
}

export function BotonesEstado({ actual, onElegir, deshabilitado }: Props) {
  return (
    <div className="grid-estados">
      {OPCIONES.map((o) => {
        const seleccionado = actual === o.estado;
        return (
          <button
            key={o.estado}
            type="button"
            aria-pressed={seleccionado}
            aria-label={`Marcar como ${o.texto}`}
            disabled={deshabilitado}
            className={`boton-estado ${o.clase}`}
            onClick={() => {
              vibrar();
              onElegir(o.estado);
            }}
          >
            {o.texto}
            {seleccionado && (
              <span aria-hidden className="text-2xl leading-none">
                ✓
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

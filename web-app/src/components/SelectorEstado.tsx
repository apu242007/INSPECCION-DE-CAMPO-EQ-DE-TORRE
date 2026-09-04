import type { Estado } from "../types";
import { vibrar } from "../ui";

/**
 * Los cuatro estados EN LA FILA, siempre visibles.
 *
 * Es la diferencia entre una app usable y una que no: marcar un ítem tiene que ser UN toque.
 * Con los botones escondidos detrás de "abrir el ítem" son cuatro toques, y por 94 ítems son
 * casi 400 toques de más. El operario que hace el check lo hace rápido o no lo hace.
 *
 * Los cuatro van siempre con su color de señalética, no en gris hasta que se eligen: se
 * apunta al color que se busca sin leer. El elegido se marca con un anillo oscuro y un tilde.
 */

const OPCIONES: { estado: Estado; texto: string; clase: string }[] = [
  { estado: "OK", texto: "OK", clase: "bg-conforme text-white" },
  { estado: "NO_OK", texto: "NO OK", clase: "bg-critico text-white" },
  { estado: "EN_PROC", texto: "En proceso", clase: "bg-mayor text-white" },
  { estado: "NA", texto: "N/A", clase: "bg-general text-white" },
];

interface Props {
  actual: Estado;
  onElegir: (estado: Estado) => void;
  deshabilitado?: boolean;
  /** Etiqueta accesible: sin esto, 94 grupos de botones dicen todos lo mismo. */
  etiqueta: string;
}

export function SelectorEstado({ actual, onElegir, deshabilitado, etiqueta }: Props) {
  // En celular ocupa el ancho completo (dedo). En pantallas grandes se acota: un boton de
  // 350px de ancho no se aprieta mejor, solo obliga a barrer la vista de punta a punta en
  // cada fila y hace que entren menos items por pantalla.
  return (
    <div
      role="group"
      aria-label={etiqueta}
      className="grid max-w-[26rem] grid-cols-4 gap-1.5"
    >
      {OPCIONES.map((o) => {
        const elegido = actual === o.estado;
        return (
          <button
            key={o.estado}
            type="button"
            aria-pressed={elegido}
            aria-label={o.texto}
            disabled={deshabilitado}
            onClick={(e) => {
              // La fila entera abre el detalle: el botón no tiene que dispararlo también.
              e.stopPropagation();
              vibrar();
              onElegir(o.estado);
            }}
            className={`relative flex min-h-[46px] items-center justify-center rounded-[3px]
                        px-1 py-1 text-center text-[0.72rem] uppercase leading-[1.05]
                        transition-transform active:translate-y-px
                        disabled:opacity-40 sm:text-[0.8rem]
                        ${o.clase} ${
                          elegido
                            ? "es-marcado ring-[3px] ring-acero-900 ring-offset-1"
                            : "opacity-55 saturate-50"
                        }`}
            style={{ touchAction: "manipulation", fontStretch: "82%", fontWeight: 700 }}
          >
            {/*
              La etiqueta se parte en dos lineas antes que recortarse: "EN PROCESO" cortado a
              "EN PR..." obliga a adivinar cual es cual, que es exactamente lo que este control
              tiene que evitar.
            */}
            <span className="whitespace-normal">{o.texto}</span>
            {/*
              El tilde va superpuesto y no en el flujo: si ocupa ancho, empuja el texto y lo
              recorta justo en el boton que esta elegido.
            */}
            {elegido && (
              <span
                aria-hidden
                className="absolute right-1 top-0.5 text-[0.7rem] leading-none"
              >
                ✓
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

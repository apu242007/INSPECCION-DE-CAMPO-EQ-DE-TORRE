/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        // Archivo variable, servida desde el bundle (ver @font-face en index.css).
        sans: ['"Archivo"', "system-ui", "-apple-system", '"Segoe UI"', "Roboto", "sans-serif"],
      },
      colors: {
        // Grafito: acero pintado. 950/900 son cromo (van con texto blanco); del 700 para
        // abajo son texto y filetes sobre papel.
        acero: {
          950: "var(--acero-950)",
          900: "var(--acero-900)",
          800: "var(--acero-800)",
          700: "var(--acero-700)",
          500: "var(--acero-500)",
          300: "var(--acero-300)",
          200: "var(--acero-200)",
          100: "var(--acero-100)",
          50: "var(--acero-050)",
        },
        papel: "var(--papel)",
        // Señalética de seguridad: la escala que la cuadrilla ya lee en el equipo.
        // Cada color tiene su variante `ink` (texto chico sobre claro) y `suave` (fondo de fila).
        critico: { DEFAULT: "var(--critico)", ink: "var(--critico-ink)", suave: "var(--critico-suave)", luz: "var(--critico-luz)" },
        mayor: { DEFAULT: "var(--mayor)", ink: "var(--mayor-ink)", suave: "var(--mayor-suave)", luz: "var(--mayor-luz)" },
        menor: { DEFAULT: "var(--menor)", ink: "var(--menor-ink)", suave: "var(--menor-suave)", luz: "var(--menor-luz)" },
        general: { DEFAULT: "var(--general)", ink: "var(--general-ink)", suave: "var(--general-suave)" },
        conforme: { DEFAULT: "var(--conforme)", ink: "var(--conforme-ink)", suave: "var(--conforme-suave)", luz: "var(--conforme-luz)" },
        reiterado: { DEFAULT: "var(--reiterado)", ink: "var(--reiterado-ink)", suave: "var(--reiterado-suave)", luz: "var(--reiterado-luz)" },
        nuevo: { DEFAULT: "var(--nuevo)", ink: "var(--nuevo-ink)", suave: "var(--nuevo-suave)" },
      },
      borderRadius: { DEFAULT: "var(--radio)", panel: "var(--radio)" },
      screens: {
        // `campo` es el corte real del producto: por debajo manda la ergonomía de una mano.
        campo: { max: "767px" },
      },
    },
  },
  plugins: [],
};

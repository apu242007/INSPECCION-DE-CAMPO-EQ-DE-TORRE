/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Señalética de seguridad: la escala que la cuadrilla ya lee en el equipo.
        // Cada color tiene su variante `ink` (texto chico sobre claro) y `suave` (fondo de fila).
        acero: {
          900: "var(--acero-900)",
          700: "var(--acero-700)",
          500: "var(--acero-500)",
          300: "var(--acero-300)",
          200: "var(--acero-200)",
          100: "var(--acero-100)",
          50: "var(--acero-050)",
        },
        papel: "var(--papel)",
        critico: { DEFAULT: "var(--critico)", ink: "var(--critico-ink)", suave: "var(--critico-suave)" },
        mayor: { DEFAULT: "var(--mayor)", ink: "var(--mayor-ink)", suave: "var(--mayor-suave)" },
        menor: { DEFAULT: "var(--menor)", ink: "var(--menor-ink)", suave: "var(--menor-suave)" },
        general: { DEFAULT: "var(--general)", ink: "var(--general-ink)", suave: "var(--general-suave)" },
        conforme: { DEFAULT: "var(--conforme)", ink: "var(--conforme-ink)", suave: "var(--conforme-suave)" },
        reiterado: { DEFAULT: "var(--reiterado)", ink: "var(--reiterado-ink)", suave: "var(--reiterado-suave)" },
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

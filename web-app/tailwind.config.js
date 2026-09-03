/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ok: "#15803d",
        noOk: "#b91c1c",
        enProc: "#c2410c",
        na: "#52525b",
        critica: "#b91c1c",
        mayor: "#c2410c",
        menor: "#a16207",
        general: "#52525b",
      },
      minHeight: {
        // Boton de estado en altura: >= 72px es requisito de UX, no una preferencia.
        boton: "72px",
      },
    },
  },
  plugins: [],
};

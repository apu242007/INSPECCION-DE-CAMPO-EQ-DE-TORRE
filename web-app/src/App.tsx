import { useEffect } from "react";
import { HashRouter, NavLink, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { Configuracion } from "./pages/Configuracion";
import { NuevaRecorrida } from "./pages/NuevaRecorrida";
import { RecorridaPage } from "./pages/RecorridaPage";
import { Recorridas } from "./pages/Recorridas";
import { iniciarAutoSync } from "./services/sync";
import * as storage from "./storage";
import { aplicarContraste } from "./ui";

/**
 * HashRouter: en GitHub Pages funciona sin configuración de servidor y sobrevive al refresh
 * en cualquier ruta profunda.
 *
 * El shell cambia de forma según el dispositivo, no solo de tamaño:
 *   - Celular: una barra fina arriba. Todo el alto es para el ítem.
 *   - Escritorio: navegación lateral persistente, porque acá se salta entre recorridas y
 *     configuración todo el tiempo, y un menú que aparece y desaparece cuesta un clic de más.
 *
 * Las dos son cromo grafito: separan lo que la app ES de lo que la app MUESTRA, y ese salto
 * se ve a un brazo de distancia y a pleno sol mucho mejor que dos grises claros pegados.
 */
export default function App() {
  useEffect(() => {
    void storage.leerConfig().then((c) => aplicarContraste(c.altoContraste));
    // Retoma la cola de envío al abrir y cuando vuelve la conexión.
    iniciarAutoSync();
  }, []);

  return (
    <HashRouter>
      <Shell />
    </HashRouter>
  );
}

function Shell() {
  const { pathname } = useLocation();
  // Dentro de una recorrida manda su propia cabecera: dos barras apiladas comen media pantalla.
  const enRecorrida = pathname.startsWith("/recorrida/");

  if (enRecorrida) {
    return (
      <Routes>
        <Route path="/recorrida/:id" element={<RecorridaPage />} />
      </Routes>
    );
  }

  return (
    <div className="flex min-h-[100dvh]">
      <NavLateral />
      <div className="min-w-0 flex-1">
        <BarraMovil />
        <Routes>
          <Route path="/" element={<Recorridas />} />
          <Route path="/nueva" element={<NuevaRecorrida />} />
          <Route path="/config" element={<Configuracion />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
    </div>
  );
}

const ENLACES = [
  { a: "/", texto: "Recorridas" },
  { a: "/nueva", texto: "Nueva recorrida" },
  { a: "/config", texto: "Configuración" },
];

/**
 * La marca no es un logo puesto arriba: es el nombre del equipo de trabajo, comprimido como
 * el rótulo de un plano y apoyado sobre el grafito.
 */
function Marca({ compacta }: { compacta?: boolean }) {
  return (
    <span className="flex min-w-0 items-baseline gap-2">
      <span
        className="shrink-0 text-[0.95rem] leading-none tracking-[0.14em] text-white"
        style={{ fontStretch: "80%", fontWeight: 800 }}
      >
        TACKER
      </span>
      <span
        className={`min-w-0 truncate text-white/55 ${compacta ? "text-xs" : "text-[0.78rem]"}`}
        style={{ fontStretch: "88%" }}
      >
        Inspección de campo
      </span>
    </span>
  );
}

function NavLateral() {
  return (
    <nav
      aria-label="Secciones"
      className="cromo hidden w-60 shrink-0 flex-col lg:flex"
    >
      <div className="px-4 py-4" style={{ boxShadow: "inset 0 -1px 0 var(--filete-cromo)" }}>
        <Marca />
        <p className="mt-1.5 text-sm text-white/55">Equipo de torre</p>
      </div>

      <ul className="flex-1 space-y-0.5 p-2">
        {ENLACES.map((e) => (
          <li key={e.a}>
            <NavLink
              to={e.a}
              end={e.a === "/"}
              className={({ isActive }) =>
                `block rounded-[3px] px-3 py-2.5 text-[0.95rem] ${
                  isActive ? "bg-papel text-acero-950" : "text-white/70"
                }`
              }
              style={{ fontStretch: "90%", fontWeight: 600 }}
            >
              {e.texto}
            </NavLink>
          </li>
        ))}
      </ul>

      <p
        className="px-4 py-3 text-xs text-white/55"
        style={{ boxShadow: "inset 0 1px 0 var(--filete-cromo)" }}
      >
        QHSE · Pre-auditoría de equipos
      </p>
    </nav>
  );
}

function BarraMovil() {
  return (
    <header className="cromo cromo-borde-abajo flex items-center gap-3 px-3 py-2.5 lg:hidden">
      <NavLink to="/" className="min-w-0 flex-1">
        <Marca compacta />
      </NavLink>
      <NavLink
        to="/config"
        className="shrink-0 rounded-[3px] border border-white/30 px-2.5 py-1 text-sm text-white/80"
        style={{ fontStretch: "90%", fontWeight: 600 }}
      >
        Ajustes
      </NavLink>
    </header>
  );
}

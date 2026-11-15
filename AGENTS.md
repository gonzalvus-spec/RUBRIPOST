# AGENTS.md

## Stack
- React 19 + TypeScript 6 + Vite 8.
- Aplicación de escritorio con Tauri 2.
- Estado con Zustand; editor Monaco; iconos Lucide; utilidades `clsx`.
- SweetAlert2 para alertas y confirmaciones.

## Estructura de `src/`
- `assets/`: recursos estáticos.
- `components/`: vistas y componentes de UI.
- `lib/`: utilidades y servicios compartidos.
- `store/`: estado global de la aplicación.
- `App.tsx` / `App.css`: aplicación y estilos globales.

## UI y estilos
- Mantener un modo oscuro minimalista y consistente.
- Usar scrollbars oscuras, neutras y sutiles; evitar colores llamativos.
- Usar SweetAlert2 para todas las confirmaciones.

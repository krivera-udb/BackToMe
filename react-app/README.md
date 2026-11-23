# Interfaz React de BackToMe

La interfaz completa de la aplicación se ejecuta con React 19, React Router y Vite. Incluye acceso, registro, recuperación de contraseña, inicio, búsqueda de objetos, publicación, solicitudes, mensajes, reportes y perfil.

## Estructura

- `src/main.jsx`: rutas principales.
- `src/pages/`: páginas de acceso y módulos internos.
- `src/components/`: elementos reutilizables de formularios y tema.
- `src/dashboard-base.css` y `src/dashboard.css`: estilos de la aplicación interna.
- `public/`: logotipo y redirecciones de compatibilidad hacia las rutas React.

## Ejecutar desde la carpeta raíz

```bash
npm install
npm start
npm run dev
```

Abre `http://localhost:5173/login`. El servidor Express debe estar activo en `http://localhost:3000` y conectado a MySQL. La interfaz React conserva la sesión de API en `localStorage` y usa los endpoints protegidos del backend para leer y modificar datos.

## Rutas React

- `/login`, `/registro`, `/olvidaste-contrasena`, `/restablecer-contrasena`
- `/app` (inicio)
- `/app/buscar`, `/app/publicar`, `/app/solicitudes`, `/app/chat`, `/app/reportes`, `/app/perfil`

Los archivos HTML históricos que quedan en la carpeta raíz no son el frontend que sirve Vite; las páginas públicas de compatibilidad redirigen a estas rutas React.

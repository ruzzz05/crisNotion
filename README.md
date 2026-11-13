# Cuaderno

PWA de apuntes para iPhone y iPad: un Notion reducido a lo que hace falta en clase.

## Qué hace

- **Libros → asignaturas → páginas.** Cada página es una pestaña dentro de su asignatura.
- **Editor por bloques:** texto, títulos, listas, tareas, citas, destacados, separadores, fotos y dibujo a mano.
  Atajos al escribir: `# `, `## `, `- `, `[] `, `1. `, `> `, `---` y `/` para el menú de bloques.
- **Dibujo a mano** con Apple Pencil (presión, subrayador, goma, deshacer). Cuando detecta el lápiz, el dedo desplaza la página en vez de pintar.
- **Fotos** desde la cámara o la galería, reducidas y guardadas en el dispositivo.
- **Horario** semanal y **calendario** de exámenes, entregas y eventos.
- **Tareas**, búsqueda global, favoritas, papelera y copia de seguridad en un archivo.
- Funciona sin conexión. Los datos viven en IndexedDB; la sincronización con Firebase está pendiente.

## Uso

```bash
npm install        # solo hace falta para las pruebas
npm run dev        # http://localhost:5173
npm test           # pruebas unitarias
npm run test:e2e   # recorrido completo en Chrome/Edge sin ventana
```

No hay paso de compilación: `public/` se sirve tal cual. `firebase.json` ya apunta a esa carpeta para Firebase Hosting.

Para instalarla en iPhone o iPad hace falta servirla por HTTPS, abrirla en Safari y elegir Compartir → «Añadir a pantalla de inicio».

## Estructura

| Ruta | Contenido |
| --- | --- |
| `public/js/store.js`, `db.js` | Datos en memoria con escritura en IndexedDB |
| `public/js/editor.js` | Editor por bloques |
| `public/js/drawing.js` | Lienzo de dibujo vectorial |
| `public/js/views/` | Una pantalla por archivo |
| `public/sw.js` | Service worker (red primero, caché de respaldo) |
| `tests/` | Pruebas unitarias y de extremo a extremo |

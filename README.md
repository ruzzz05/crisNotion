# Cuaderno

PWA de apuntes para iPhone y iPad: un Notion reducido a lo que hace falta en clase.

## Qué hace

- **Barra lateral con árbol de páginas.** Los libros agrupan asignaturas; cada página puede tener subpáginas sin límite.
- **Pestañas** como en un navegador: cada una recuerda su página o vista.
- **Editor por bloques:** texto, títulos, listas anidadas, tareas, desplegables, citas, destacados, código, divisor, imagen, dibujo y subpágina.
  Menú `/` con filtro, atajos (`# `, `- `, `[] `, `1. `, `> `, `" `, `---`, tres acentos graves), Tab para anidar, arrastre para reordenar, color por bloque y burbuja de formato al seleccionar.
- **Columnas:** arrastra un bloque al lateral de otro (o usa su menú) para poner dos imágenes juntas o una imagen con texto al lado.
- **PDF anotable:** sube un PDF a una página y subraya o escribe encima de cada hoja.
- **Fondo de página** a elegir: color o imagen; beige por defecto.
- **Icono y portada** por página, favoritos, migas de pan, búsqueda rápida con Ctrl/Cmd+K y papelera.
- **Dibujo a mano** con Apple Pencil o ratón (presión, subrayador, goma, deshacer). El dedo nunca dibuja: desplaza la página. Se pueden insertar imágenes en el dibujo, moverlas, cambiarles el tamaño y escribir encima.
- **Fotos** desde la cámara o la galería, reducidas y guardadas en el dispositivo.
- **Horario** semanal, **calendario** mensual de exámenes y entregas, y **tareas**.
- En pantallas táctiles, barra de herramientas sobre el teclado.
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
| `public/js/model.js`, `tabs.js` | Lógica pura (árbol, bloques anidados, pestañas), con pruebas unitarias |
| `public/js/store.js`, `db.js` | Datos en memoria con escritura en IndexedDB |
| `public/js/app.js` | Barra lateral, pestañas, migas de pan y búsqueda |
| `public/js/editor.js` | Editor por bloques |
| `public/js/drawing.js`, `sheet.js` | Lienzo de dibujo vectorial e imágenes sobre él |
| `public/js/pdf.js`, `public/vendor/pdfjs/` | Bloque PDF; pdf.js de Mozilla (Apache-2.0) incluido para funcionar sin conexión |
| `public/js/views/` | Una pantalla por archivo |
| `public/sw.js` | Service worker (red primero, caché de respaldo) |
| `tests/` | Pruebas unitarias y de extremo a extremo |

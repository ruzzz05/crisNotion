# Cuaderno

PWA de apuntes para iPhone y iPad: un Notion reducido a lo que hace falta en clase.

## Qué hace

- **Barra lateral con árbol de páginas.** Los libros agrupan asignaturas; cada página puede tener subpáginas sin límite.
- **Pestañas** como en un navegador: cada una recuerda su página o vista.
- **Editor por bloques:** texto, títulos, listas anidadas, tareas, desplegables, citas, destacados, código, divisor, imagen, dibujo y subpágina.
  Menú `/` con filtro, atajos (`# `, `- `, `[] `, `1. `, `> `, `" `, `---`, tres acentos graves), Tab para anidar, arrastre para reordenar, color por bloque y burbuja de formato al seleccionar.
- **Columnas:** arrastra un bloque al lateral de otro (o usa su menú) para poner dos imágenes juntas o una imagen con texto al lado.
- **PDF anotable:** sube un PDF a una página y subraya, escribe o coloca imágenes encima de cada hoja. Cada hoja tiene un margen a cada lado para añadir texto, imágenes o dibujos a su altura.
- **Temas:** blanco (predeterminado), beige, oscuro o el del dispositivo, en Ajustes.
- **Letra:** Times New Roman por defecto en toda la app; en Ajustes se elige otra, y cada página puede tener la suya.
- **Fondo de página** a elegir: color o imagen (con un velo claro para que el texto se lea).
- **Icono y portada** por página, favoritos, migas de pan, búsqueda rápida con Ctrl/Cmd+K y papelera.
- **Dibujo a mano** con Apple Pencil o ratón (presión, subrayador, goma, deshacer) y grosor del trazo con un deslizable. El dedo nunca dibuja: desplaza la página. Se pueden insertar imágenes en el dibujo, moverlas, cambiarles el tamaño desde cualquier esquina y escribir encima.
- **Fotos** desde la cámara o la galería, reducidas y guardadas en el dispositivo; su tamaño se ajusta arrastrando el tirador del borde.
- **Dibujo:** papel a elegir (cuadrícula, rayas, puntos, tian zi ge o liso), cualquier color con deslizadores o en hexadecimal, y trazo suavizado.
- **Inicio con portada** (color, degradado o imagen), como las páginas.
- **Inicio es un tablero de widgets:** con «Editar» se mueven arrastrando, se cambian de tamaño desde la esquina (encajan solos en la rejilla), se quitan y se añaden. Hay reloj y pomodoro (con fondo de color o sin fondo), texto, imagen fija, marcos de fotos que cambian cada hora, cada 3 horas o una vez al día (los que quieras), páginas recientes, clases de hoy, eventos y tareas. El saludo usa tu nombre (Ajustes) o el de tu cuenta.
- **Horario** semanal, **calendario** mensual de exámenes y entregas, y **tareas**.
- En pantallas táctiles, barra de herramientas sobre el teclado.
- **Exportar e importar** libros enteros o páginas sueltas (con sus subpáginas, fotos, PDF y dibujos) desde el menú de cada uno; al importar se crea una copia y no se pisa nada.
- **Sincronización entre dispositivos:** entra en Ajustes con tu cuenta (la misma que en Mi App) y todo lo que haces se sube solo a Firebase y aparece en tus otros dispositivos.
- Funciona sin conexión y sin cuenta. Los datos viven en IndexedDB; con cuenta, además en la nube.

## Uso

```bash
npm install        # solo hace falta para las pruebas
npm run dev        # http://localhost:5173
npm test           # pruebas unitarias
npm run test:e2e   # recorrido completo en Chrome/Edge sin ventana
```

No hay paso de compilación: `public/` se sirve tal cual. Cada push a `main` la publica en GitHub Pages (`.github/workflows/pages.yml`): <https://ruzzz05.github.io/crisNotion/>. `firebase.json` apunta a la misma carpeta por si se prefiere Firebase Hosting.

## Sincronización

- **Cuenta:** Firebase Auth con usuario y contraseña, el mismo proyecto y las mismas cuentas que Mi App. Como las dos apps se publican en `ruzzz05.github.io`, la sesión iniciada en una vale en la otra (y cerrarla en una la cierra en las dos).
- **Qué se guarda:** en Firestore, bajo `users/{uid}/cuaderno/` hay un documento por cada cosa (libro, página, clase, evento, tarea, dibujo, foto o PDF). Lo que no cabe en un documento (límite de 1 MiB) se parte en trozos en `users/{uid}/cuadernoParts/`. Las reglas de Firestore de Mi App ya cubren estas rutas: cada cuenta solo lee y escribe lo suyo.
- **Cuándo:** unos segundos después de cada cambio, al abrir la app, al volver a ella y cada dos minutos mientras está a la vista. Sin conexión, los cambios esperan y suben solos después.
- **Conflictos:** si dos dispositivos cambian lo mismo (la misma página, el mismo dibujo), queda el cambio más reciente. Lo que se borra en uno se borra en los demás.
- **Límites:** los archivos de más de unos 18 MB no se suben (Ajustes avisa de cuántos hay). El tema de color y las pestañas abiertas son de cada dispositivo.
- **Otra cuenta en el mismo dispositivo:** los apuntes no se mezclan; Ajustes ofrece borrar lo que hay en el dispositivo y cargar lo de la cuenta nueva.

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
| `public/js/cloud.js`, `synccore.js`, `firestore.js` | Sincronización: unión con la app, reglas (probadas con dos dispositivos simulados) y llamadas a Firestore |
| `public/js/theme.js`, `transfer.js` | Tema de color; exportar e importar libros y páginas |
| `public/js/board.js`, `widgets.js` | Tablero de Inicio: tamaños y pomodoro (lógica pura) y el dibujo de cada widget |
| `public/js/views/` | Una pantalla por archivo |
| `public/sw.js` | Service worker (red primero, caché de respaldo) |
| `tests/` | Pruebas unitarias y de extremo a extremo |

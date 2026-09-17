# CGR — Certified Gameday Romantic

Primera versión conectada a datos reales de Champions League vía football-data.org.
Por ahora solo muestra los partidos de los próximos 3 días (sin stats ni picks
todavía — eso lo agregamos en el siguiente paso, una vez que confirmemos que
los datos en vivo funcionan).

## Cómo subirlo (paso a paso)

### 1. Crea una cuenta en GitHub (si no tienes)
Ve a github.com → Sign up. Es gratis.

### 2. Sube este proyecto a un repositorio
- En GitHub, crea un repositorio nuevo (botón "New").
- Súbele todos los archivos de esta carpeta (puedes arrastrarlos desde la
  vista web de GitHub, "uploading an existing file").

### 3. Crea una cuenta en Vercel
Ve a vercel.com → Sign up → elige "Continue with GitHub" (así quedan
conectados automáticamente).

### 4. Importa el proyecto en Vercel
- En el dashboard de Vercel, botón "Add New" → "Project".
- Selecciona el repositorio que acabas de subir.

### 5. Agrega tu API key como variable de entorno (IMPORTANTE)
Antes de darle "Deploy", en la misma pantalla de importación busca la sección
"Environment Variables" y agrega:
- Name: `FOOTBALL_DATA_KEY`
- Value: tu token de football-data.org (el que te llegó por correo)

Esto es lo que mantiene tu clave fuera del código público.

### 6. Deploy
Dale clic a "Deploy". Vercel te da un link (algo como
`cgr-app.vercel.app`) que puedes abrir desde tu celular o computadora.

## Notas
- El plan gratis de football-data.org tiene límite de peticiones por minuto,
  así que evita refrescar la página muy seguido durante pruebas.
- Cada vez que subas cambios al repositorio de GitHub, Vercel vuelve a
  publicar la página automáticamente.

# Cuadro de Mando y Control del 2do Comandante

Aplicación instalable (PWA) con herramientas para el 2do Comandante del Regimiento.

## ▶️ Cómo abrir la aplicación

1. Doble clic en **`Iniciar CUADRO DE MANDO.bat`**.
2. Se abrirá una ventana negra (el servidor) y luego la app en una ventana de Microsoft Edge.
3. **No cierres la ventana negra** mientras uses la app. Al terminar, ciérrala para apagar el servidor.

> La primera vez, elige la **carpeta de datos** (dentro de OneDrive). Ahí se guardará todo y OneDrive lo sincronizará con tu tablet y tu laptop.

## 📲 Instalarla como app (recomendado)

Con la app abierta en Edge/Chrome, entra al menú (⋯) → **Aplicaciones → Instalar este sitio como aplicación**. Quedará como un ícono en tu escritorio/menú inicio y se abrirá como una app normal.

## 🔄 Sincronización entre tablet y laptop

- Copia toda la carpeta `Cuadro-de-Mando-2do-Comandante` a los dos equipos (o ponla en OneDrive).
- En cada equipo, al abrir la app, elige **la misma carpeta de datos dentro de OneDrive**.
- OneDrive sincroniza los datos; verás lo mismo en ambos aparatos.

## 📦 Módulos

| Módulo | Estado |
|--------|--------|
| 📋 Partes Diarios (cuadros y tropa, exporta a Word) | ✅ Disponible |
| 🗂️ Seguimiento de Documentación (P-1…P-5) | ✅ Disponible |
| 📚 Biblioteca Virtual | ✅ Disponible |
| 🎖️ Libro de Vida de Instructores | ✅ Disponible |
| ✍️ Corrector de Formato (Reglamento de Correspondencia Militar) | ✅ Disponible |

## ✍️ Corrector de Formato — nota sobre la IA

- **Revisión offline (siempre):** lee tus documentos Word/Excel/PowerPoint y verifica ortografía, tipografía y formato (fuente, tamaño, márgenes, membrete, referencia, asunto, fecha, despedida). No necesita internet.
- **Revisión profunda con IA (opcional):** para el análisis inteligente de fondo y forma necesitas:
  1. Internet (datos móviles o WiFi).
  2. Una **clave de API de Claude** (se pega en **⚙️ Reglas / IA** dentro del módulo; se guarda solo en tu equipo). Se obtiene en console.anthropic.com y tiene un costo por uso.
  3. Opcional: pegar en ese mismo panel las reglas clave del **Reglamento de Correspondencia Militar** para que la IA las use.

## 💾 Respaldo

En **⚙️ Configuración** puedes exportar un archivo de respaldo (`.json`) e importarlo en otro equipo.

## 🛠️ Requisitos

- Windows con Microsoft Edge o Google Chrome.
- Para sincronizar: tener OneDrive (o Google Drive) instalado en los equipos.

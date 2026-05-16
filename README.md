# 🤖 FacilClaw

Una aplicación web moderna para gestionar un agente de IA local potente, multimodal y con superpoderes gracias a los MCP Servers.

## 🚀 Requisitos Previos

Antes de empezar, asegúrate de tener instalado:
- **Node.js 18+** (Recomendado LTS)
- **Ollama** (Descárgalo en [ollama.com](https://ollama.com/))
- Ganas de aprender y construir algo increíble.

## 🛠️ Instalación

1. **Clona este repositorio** (o descarga los archivos del tutorial).
2. **Instala las dependencias**:
   ```bash
   npm install
   ```
3. **Configura tus variables**:
   - Renombra el archivo `.env.example` a `.env`.
   - Edita el archivo `.env` con tus propias rutas y claves de API.
4. **Descarga el modelo base**:
   Abre una terminal y ejecuta:
   ```bash
   ollama pull gemma4:e4b
   ```

## 🏃 Cómo Correr el Proyecto

Para iniciar el servidor en modo desarrollo (con auto-recarga):
```bash
npm run dev
```
Luego, abre `frontend/index.html` en tu navegador (o usa una extensión como Live Server).

## 📂 Estructura de Carpetas

- `frontend/`: Todo lo relacionado con la interfaz (HTML, CSS, JS).
- `backend/`: El motor Node.js, rutas de API y configuración de MCP.
- `backend/datos/` y `backend/historial/`: Carpetas locales para que el agente guarde información.

## 📝 Nota del Tutorial

Este proyecto se entrega con la **estructura de archivos completa**, pero la lógica interna de `frontend/app.js` y `backend/server.js` está vacía para que podamos escribirla juntos durante el video. ¡Sigue los comentarios guía!

---

📺 **Mira el tutorial completo aquí**: [Link al video de YouTube (Placeholder)]

¡Feliz hacking! 🚀

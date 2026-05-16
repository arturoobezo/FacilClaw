/**
 * 🤖 FacilClaw - Frontend Logic
 * Aplicación de agente IA local potente y moderna.
 */

// ==========================================
// 1. VARIABLES GLOBALES
// ==========================================
let conversacionActual = [];
let imagenBase64 = null;
let reconocimiento = null;
let conversacionId = Date.now().toString(); // ID único inicial
const API_URL = 'http://localhost:3000';

// Referencias al DOM
const areaMensajes = document.getElementById('area-mensajes');
const inputMensaje = document.getElementById('input-mensaje');
const btnEnviar = document.getElementById('btn-enviar');
const btnNuevaConversacion = document.getElementById('btn-nueva-conversacion');
const listaHistorial = document.getElementById('lista-historial');
const selectorModelo = document.getElementById('selector-modelo');
const badgeModeloActivo = document.getElementById('badge-modelo-activo');
const btnMicrofono = document.getElementById('btn-microfono');
const btnAdjuntar = document.getElementById('btn-adjuntar');
const inputImagen = document.getElementById('input-imagen');
const previewImagen = document.getElementById('preview-imagen');
const imgRenderPreview = document.getElementById('img-render-preview');
const zonaDrop = document.getElementById('zona-drop');
const panelModelos = document.getElementById('panel-derecho-modelos');
const listaModelosInstalados = document.getElementById('lista-modelos-instalados');
const inputNuevoModelo = document.getElementById('input-nuevo-modelo');
const btnDescargarModelo = document.getElementById('btn-descargar-modelo');
const barraProgreso = document.getElementById('barra-progreso');
const estadoDescarga = document.getElementById('estado-descarga');

// ==========================================
// 2. INICIALIZACIÓN
// ==========================================
async function init() {
    console.log("🚀 Inicializando FacilClaw...");
    await cargarHistorial();
    await listarModelos(); // Esto llenará el selector
    nuevaConversacion();
}

// ==========================================
// 3. ENVIAR Y RECIBIR MENSAJES
// ==========================================
async function enviarMensaje() {
    const texto = inputMensaje.value.trim();
    const modeloSeleccionado = selectorModelo.value;

    if (!texto && !imagenBase64) return;

    // Validación de modelo antes de enviar
    if (!modeloSeleccionado) {
        mostrarMensaje('agent', '⚠️ No hay modelo seleccionado. Elige uno en el panel de modelos (ícono ⚙️ arriba a la derecha).');
        return;
    }

    // 1. Mostrar mensaje del usuario
    mostrarMensaje('user', texto, imagenBase64);
    
    // Guardar en el array local
    const msgUsuario = { role: 'user', content: texto };
    if (imagenBase64) msgUsuario.images = [imagenBase64];
    conversacionActual.push(msgUsuario);

    // Limpiar input y preview
    inputMensaje.value = '';
    inputMensaje.style.height = 'auto';
    limpiarPreview();

    // 2. Mostrar indicador de escritura
    const typingId = mostrarIndicadorEscritura();

    try {
        // 3. Petición al Backend
        const response = await fetch(`${API_URL}/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                mensaje: texto,
                historial: conversacionActual,
                imagen: imagenBase64,
                modelo: modeloSeleccionado
            })
        });

        const data = await response.json();
        removerIndicadorEscritura(typingId);

        if (data.error) {
            mostrarMensaje('agent', `❌ Error: ${data.error}`);
        } else {
            const respuestaIA = data.content || data.response;
            mostrarMensaje('agent', respuestaIA);
            conversacionActual.push({ role: 'assistant', content: respuestaIA });
            
            // Guardar automáticamente en el servidor
            await guardarEnServidor();
        }
    } catch (error) {
        removerIndicadorEscritura(typingId);
        mostrarMensaje('agent', "❌ Error de conexión. Asegúrate de que el servidor esté encendido.");
    }
}

function mostrarIndicadorEscritura() {
    const id = 'typing-' + Date.now();
    const div = document.createElement('div');
    div.id = id;
    div.className = 'escribiendo';
    div.innerHTML = '<span></span><span></span><span></span>';
    areaMensajes.appendChild(div);
    areaMensajes.scrollTop = areaMensajes.scrollHeight;
    return id;
}

function removerIndicadorEscritura(id) {
    const el = document.getElementById(id);
    if (el) el.remove();
}

async function guardarEnServidor() {
    try {
        await fetch(`${API_URL}/historial/${conversacionId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                id: conversacionId,
                nombre: conversacionActual[0]?.content.substring(0, 30) || "Nueva conversación",
                mensajes: conversacionActual
            })
        });
        await cargarHistorial();
    } catch (e) {}
}

// ==========================================
// 4. MOSTRAR MENSAJES EN LA INTERFAZ
// ==========================================
function mostrarMensaje(rol, contenido, imagen = null) {
    const div = document.createElement('div');
    div.className = `message ${rol}`;
    
    let htmlContent = contenido.replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>');
    htmlContent = htmlContent.replace(/\n/g, '<br>');

    if (imagen && rol === 'user') {
        const img = document.createElement('img');
        img.src = imagen.startsWith('data:') ? imagen : `data:image/png;base64,${imagen}`;
        img.style.maxWidth = '200px';
        img.style.borderRadius = '8px';
        img.style.marginBottom = '10px';
        img.style.display = 'block';
        div.appendChild(img);
    }

    const textSpan = document.createElement('span');
    textSpan.innerHTML = htmlContent;
    div.appendChild(textSpan);

    areaMensajes.appendChild(div);
    areaMensajes.scrollTop = areaMensajes.scrollHeight;
}

// ==========================================
// 5. HISTORIAL DE CONVERSACIONES
// ==========================================
async function cargarHistorial() {
    try {
        const res = await fetch(`${API_URL}/historial`);
        const chats = await res.json();
        listaHistorial.innerHTML = '';
        chats.forEach(chat => {
            const li = document.createElement('li');
            li.className = `history-item ${chat.id === conversacionId ? 'active' : ''}`;
            li.innerHTML = `
                <span class="conv-name">${chat.nombre || 'Sin título'}</span>
                <div class="item-actions">
                    <button class="btn-delete" onclick="event.stopPropagation(); eliminarConversacion('${chat.id}')">🗑</button>
                </div>
            `;
            li.onclick = () => cargarConversacion(chat.id);
            listaHistorial.appendChild(li);
        });
    } catch (e) {}
}

async function cargarConversacion(id) {
    try {
        const res = await fetch(`${API_URL}/historial/${id}`);
        const chat = await res.json();
        conversacionId = id;
        conversacionActual = chat.mensajes || [];
        areaMensajes.innerHTML = '';
        conversacionActual.forEach(msg => {
            mostrarMensaje(msg.role === 'assistant' ? 'agent' : 'user', msg.content, msg.images ? msg.images[0] : null);
        });
        await cargarHistorial();
    } catch (e) {}
}

function nuevaConversacion() {
    conversacionId = Date.now().toString();
    conversacionActual = [];
    areaMensajes.innerHTML = '';
    mostrarMensaje('agent', '👋 ¡Hola! Soy FacilClaw. Selecciona un modelo para empezar a chatear.');
    cargarHistorial();
}

async function eliminarConversacion(id) {
    if (!confirm('¿Borrar conversación?')) return;
    try {
        await fetch(`${API_URL}/historial/${id}`, { method: 'DELETE' });
        if (conversacionId === id) nuevaConversacion();
        else await cargarHistorial();
    } catch (e) {}
}

// ==========================================
// 6. RECONOCIMIENTO DE VOZ
// ==========================================
function activarMicrofono() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return;
    reconocimiento = new SpeechRecognition();
    reconocimiento.lang = 'es-ES';
    reconocimiento.onstart = () => btnMicrofono.classList.add('recording');
    reconocimiento.onresult = (event) => {
        inputMensaje.value += event.results[0][0].transcript;
        inputMensaje.dispatchEvent(new Event('input'));
    };
    reconocimiento.onend = () => btnMicrofono.classList.remove('recording');
    reconocimiento.start();
}

// ==========================================
// 7. MANEJO DE IMÁGENES
// ==========================================
function procesarImagen(file) {
    if (!file || !file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = (e) => {
        imagenBase64 = e.target.result;
        imgRenderPreview.src = imagenBase64;
        previewImagen.hidden = false;
        previewImagen.style.display = 'block';
    };
    reader.readAsDataURL(file);
}

function limpiarPreview() {
    imagenBase64 = null;
    previewImagen.hidden = true;
    previewImagen.style.display = 'none';
    inputImagen.value = '';
}

// ==========================================
// 8. PANEL DE MODELOS
// ==========================================
async function listarModelos() {
    try {
        const res = await fetch(`${API_URL}/modelos`);
        const modelos = await res.json();
        
        selectorModelo.innerHTML = '<option value="">Seleccionar modelo...</option>';
        listaModelosInstalados.innerHTML = '';

        if (modelos.length === 0) {
            mostrarMensaje('agent', '⚠️ No tienes modelos instalados. Descarga uno desde el panel de modelos (ícono ⚙️ arriba a la derecha).');
            return;
        }

        modelos.forEach(mod => {
            // Llenar selector principal
            const opt = document.createElement('option');
            opt.value = mod.name;
            opt.innerText = mod.name;
            selectorModelo.appendChild(opt);

            // Crear tarjeta de modelo
            const card = document.createElement('li');
            card.className = 'model-card';
            card.innerHTML = `
                <div class="model-card-header">
                    <span><strong>${mod.name}</strong></span>
                    <button class="btn-model-options" onclick="toggleMenuModel(event, '${mod.name}')">⋯</button>
                </div>
                <div id="menu-${mod.name.replace(/:/g, '-')}" class="model-context-menu" hidden>
                    <button class="menu-item" onclick="usarModelo('${mod.name}'); cerrarTodosLosMenus()">
                        <span>✨</span> Usar este modelo
                    </button>
                    <button class="menu-item delete" onclick="eliminarModelo('${mod.name}'); cerrarTodosLosMenus()">
                        <span>🗑</span> Eliminar modelo
                    </button>
                </div>
            `;
            listaModelosInstalados.appendChild(card);
        });

        if (modelos.length === 1) usarModelo(modelos[0].name);
        
    } catch (e) {
        console.warn("Error al conectar con Ollama.");
    }
}

function toggleMenuModel(event, nombre) {
    event.stopPropagation();
    const menuId = `menu-${nombre.replace(/:/g, '-')}`;
    const menuActual = document.getElementById(menuId);
    const estaCerrado = menuActual.hidden;

    cerrarTodosLosMenus();

    if (estaCerrado) {
        menuActual.hidden = false;
    }
}

function cerrarTodosLosMenus() {
    document.querySelectorAll('.model-context-menu').forEach(menu => {
        menu.hidden = true;
    });
}

function usarModelo(nombre) {
    selectorModelo.value = nombre;
    badgeModeloActivo.innerText = nombre;
    badgeModeloActivo.style.color = 'var(--accent)';
}

async function descargarModelo() {
    const nombre = inputNuevoModelo.value.trim();
    if (!nombre) return;

    barraProgreso.hidden = false;
    barraProgreso.value = 0;
    estadoDescarga.innerText = `Descargando ${nombre}...`;

    try {
        const response = await fetch(`${API_URL}/modelos/descargar`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nombre })
        });

        const reader = response.body.getReader();
        const decoder = new TextDecoder();

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            const lines = decoder.decode(value).split('\n');
            lines.forEach(line => {
                if (!line) return;
                try {
                    const status = JSON.parse(line);
                    if (status.percentage) barraProgreso.value = status.percentage;
                    if (status.status) estadoDescarga.innerText = status.status;
                } catch (e) {}
            });
        }
        await listarModelos();
        inputNuevoModelo.value = '';
        estadoDescarga.innerText = "✅ Listo.";
    } catch (e) {
        estadoDescarga.innerText = "❌ Error.";
    }
}

async function eliminarModelo(nombre) {
    if (!confirm(`¿Seguro que quieres eliminar el modelo "${nombre}"?`)) return;
    
    try {
        const res = await fetch(`${API_URL}/modelos/${nombre}`, { method: 'DELETE' });
        if (res.ok) {
            if (selectorModelo.value === nombre) {
                selectorModelo.value = "";
                badgeModeloActivo.innerText = "Ninguno seleccionado";
            }
            await listarModelos();
        }
    } catch (e) {
        alert("Error al eliminar el modelo.");
    }
}

// ==========================================
// 9. EVENT LISTENERS
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    init();

    // Cerrar menús al hacer clic fuera
    document.addEventListener('click', cerrarTodosLosMenus);

    btnEnviar.onclick = enviarMensaje;
    inputMensaje.onkeydown = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviarMensaje(); } };
    inputMensaje.oninput = () => { inputMensaje.style.height = 'auto'; inputMensaje.style.height = inputMensaje.scrollHeight + 'px'; };
    btnNuevaConversacion.onclick = nuevaConversacion;
    btnMicrofono.onclick = activarMicrofono;
    btnAdjuntar.onclick = () => inputImagen.click();
    inputImagen.onchange = (e) => procesarImagen(e.target.files[0]);
    document.querySelector('.btn-remove-preview').onclick = limpiarPreview;

    zonaDrop.ondragover = (e) => { e.preventDefault(); zonaDrop.classList.add('active'); };
    zonaDrop.ondragleave = () => zonaDrop.classList.remove('active');
    zonaDrop.ondrop = (e) => { e.preventDefault(); zonaDrop.classList.remove('active'); procesarImagen(e.dataTransfer.files[0]); };

    btnDescargarModelo.onclick = descargarModelo;
    selectorModelo.onchange = () => usarModelo(selectorModelo.value);

    // Toggle Panel Derecho
    const btnPanelHeader = document.getElementById('btn-panel-modelos');
    btnPanelHeader.onclick = (e) => {
        e.stopPropagation();
        const estaColapsado = panelModelos.classList.toggle('collapsed');
        const wrapper = document.querySelector('.app-wrapper');
        
        if (!estaColapsado) {
            wrapper.style.gridTemplateColumns = `var(--sidebar-left-w) 1fr var(--sidebar-right-w)`;
        } else {
            wrapper.style.gridTemplateColumns = `var(--sidebar-left-w) 1fr 0px`;
        }
    };
});

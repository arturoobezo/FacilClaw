/**
 * 🚀 FacilClaw - Backend Server (Node.js)
 * Conecta el frontend con Ollama y servidores MCP.
 */

import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import fetch from 'node-fetch';
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Configuración de rutas para ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Intentar cargar .env
dotenv.config();

// Configuración de variables con valores por defecto automáticos
const PORT = process.env.PORT || 3000;
const OLLAMA_URL = process.env.OLLAMA_HOST || 'http://127.0.0.1:11434';

// Configuración automática de la ruta de modelos de Ollama
if (!process.env.OLLAMA_MODELS) {
    process.env.OLLAMA_MODELS = path.join(process.cwd(), 'models');
}

const app = express();

// Middlewares
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Servir archivos estáticos del frontend
app.use(express.static(path.join(__dirname, '../frontend')));

// Ruta principal para servir el index.html
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

// Asegurar directorios de persistencia y modelos
const HISTORIAL_DIR = path.join(__dirname, 'historial');
const DATOS_DIR = path.join(__dirname, 'datos');
const MODELS_DIR = process.env.OLLAMA_MODELS;

[HISTORIAL_DIR, DATOS_DIR, MODELS_DIR].forEach(dir => {
    if (dir && !fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
});

// Cargar configuración de MCP
let mcpConfig = { mcpServers: {} };
try {
    const configPath = path.join(__dirname, 'mcp-config.json');
    if (fs.existsSync(configPath)) {
        mcpConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        console.log("🛠️ Configuración MCP cargada con éxito.");
    }
} catch (e) {
    console.error("❌ Error al cargar mcp-config.json:", e.message);
}

// Caché para mapear herramientas a servidores
const toolToServerMap = new Map();

// ==========================================
// RUTA: CHAT CON TOOL CALLING
// ==========================================
app.post('/chat', async (req, res) => {
    const { mensaje, historial, imagen, modelo } = req.body;

    // Validación de modelo obligatoria
    if (!modelo) {
        return res.status(400).json({ 
            error: "No hay modelo seleccionado. Elige uno en el panel de modelos." 
        });
    }

    try {
        let messages = [...historial];
        if (messages.length === 0 || messages[messages.length - 1].role !== 'user') {
            const userMsg = { role: 'user', content: mensaje };
            if (imagen) userMsg.images = [imagen.split(',')[1] || imagen];
            messages.push(userMsg);
        }

        const allTools = await getAllMCPTools();
        const finalResponse = await ejecutarConHerramientas(messages, modelo, allTools);

        res.json({ content: finalResponse });
    } catch (error) {
        console.error("❌ Error en /chat:", error);
        res.status(500).json({ error: error.message });
    }
});

async function ejecutarConHerramientas(messages, modelo, tools) {
    let iteracion = 0;
    const MAX_ITERACIONES = 10;

    while (iteracion < MAX_ITERACIONES) {
        iteracion++;
        console.log(`🤖 Iteración de pensamiento #${iteracion} con modelo ${modelo}...`);

        try {
            const response = await fetch(`${OLLAMA_URL}/api/chat`, {
                method: 'POST',
                body: JSON.stringify({
                    model: modelo,
                    messages: messages,
                    tools: tools,
                    stream: false
                })
            });

            if (!response.ok) {
                const errData = await response.json().catch(() => ({}));
                throw new Error(errData.error || `Ollama error: ${response.statusText}`);
            }

            const data = await response.json();
            const message = data.message;

            messages.push(message);

            if (!message.tool_calls || message.tool_calls.length === 0) {
                return message.content;
            }

            console.log(`🔧 La IA quiere usar ${message.tool_calls.length} herramienta(s)`);
            
            for (const toolCall of message.tool_calls) {
                const toolName = toolCall.function.name;
                const args = toolCall.function.arguments;
                const serverName = findServerForTool(toolName);
                
                if (!serverName) {
                    messages.push({
                        role: 'tool',
                        content: JSON.stringify({ error: `Herramienta ${toolName} no encontrada.` })
                    });
                    continue;
                }

                console.log(`🔌 Ejecutando ${toolName} en server ${serverName}...`);
                const result = await ejecutarMCP(serverName, toolName, args);

                messages.push({
                    role: 'tool',
                    content: JSON.stringify(result)
                });
            }
        } catch (e) {
            console.error("Error en loop de herramientas:", e);
            throw e;
        }
    }
    return "Límite de razonamiento alcanzado.";
}

// ==========================================
// FUNCIÓN: EJECUTAR MCP VIA STDIO
// ==========================================
async function ejecutarMCP(serverName, toolName, args) {
    const config = mcpConfig.mcpServers[serverName];
    if (!config) return { error: "Servidor no configurado" };

    return new Promise((resolve) => {
        const child = spawn(config.command, config.args, {
            env: { ...process.env, ...config.env },
            shell: true
        });

        let stdoutData = '';
        let stderrData = '';

        child.stdout.on('data', (data) => stdoutData += data.toString());
        child.stderr.on('data', (data) => stderrData += data.toString());

        const request = {
            jsonrpc: "2.0",
            id: Date.now(),
            method: "tools/call",
            params: { name: toolName, arguments: args }
        };

        child.stdin.write(JSON.stringify(request) + '\n');
        child.stdin.end();

        child.on('close', (code) => {
            try {
                const lines = stdoutData.split('\n');
                for (const line of lines) {
                    if (line.trim().startsWith('{')) {
                        const response = JSON.parse(line);
                        if (response.result) return resolve(response.result);
                    }
                }
                resolve({ error: "No se obtuvo respuesta válida", code });
            } catch (e) {
                resolve({ error: "Error al parsear respuesta MCP" });
            }
        });
    });
}

// Auxiliares MCP
async function getAllMCPTools() {
    const tools = [];
    toolToServerMap.clear();

    for (const serverName in mcpConfig.mcpServers) {
        try {
            const serverTools = await listToolsFromServer(serverName);
            serverTools.forEach(t => {
                toolToServerMap.set(t.name, serverName);
                tools.push({
                    type: 'function',
                    function: {
                        name: t.name,
                        description: t.description,
                        parameters: t.inputSchema
                    }
                });
            });
        } catch (e) {}
    }
    return tools;
}

async function listToolsFromServer(serverName) {
    const config = mcpConfig.mcpServers[serverName];
    return new Promise((resolve) => {
        const child = spawn(config.command, config.args, {
            env: { ...process.env, ...config.env },
            shell: true
        });
        let output = '';
        child.stdout.on('data', (d) => output += d.toString());
        const request = { jsonrpc: "2.0", id: 1, method: "tools/list", params: {} };
        child.stdin.write(JSON.stringify(request) + '\n');
        child.stdin.end();
        child.on('close', () => {
            try {
                const lines = output.split('\n');
                for (const line of lines) {
                    if (line.trim().startsWith('{')) {
                        const res = JSON.parse(line);
                        if (res.result && res.result.tools) return resolve(res.result.tools);
                    }
                }
                resolve([]);
            } catch (e) { resolve([]); }
        });
    });
}

function findServerForTool(toolName) {
    return toolToServerMap.get(toolName);
}

// ==========================================
// RUTAS: GESTIÓN DE HISTORIAL
// ==========================================
app.get('/historial', (req, res) => {
    try {
        const files = fs.readdirSync(HISTORIAL_DIR);
        const chats = files.map(f => {
            const content = JSON.parse(fs.readFileSync(path.join(HISTORIAL_DIR, f), 'utf8'));
            return {
                id: f.replace('.json', ''),
                nombre: content.nombre,
                fecha: fs.statSync(path.join(HISTORIAL_DIR, f)).mtime
            };
        }).sort((a, b) => b.fecha - a.fecha);
        res.json(chats);
    } catch (e) { res.json([]); }
});

app.get('/historial/:id', (req, res) => {
    const filePath = path.join(HISTORIAL_DIR, `${req.params.id}.json`);
    if (fs.existsSync(filePath)) {
        res.json(JSON.parse(fs.readFileSync(filePath, 'utf8')));
    } else {
        res.status(404).json({ error: "No encontrado" });
    }
});

app.post('/historial/:id', (req, res) => {
    const filePath = path.join(HISTORIAL_DIR, `${req.params.id}.json`);
    fs.writeFileSync(filePath, JSON.stringify(req.body, null, 2));
    res.json({ success: true });
});

app.patch('/historial/:id/renombrar', (req, res) => {
    const filePath = path.join(HISTORIAL_DIR, `${req.params.id}.json`);
    if (fs.existsSync(filePath)) {
        const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        content.nombre = req.body.nombre;
        fs.writeFileSync(filePath, JSON.stringify(content, null, 2));
        res.json({ success: true });
    } else {
        res.status(404).json({ error: "No encontrado" });
    }
});

app.delete('/historial/:id', (req, res) => {
    const filePath = path.join(HISTORIAL_DIR, `${req.params.id}.json`);
    if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        res.json({ success: true });
    } else {
        res.status(404).json({ error: "No encontrado" });
    }
});

// ==========================================
// RUTAS: GESTIÓN DE MODELOS (PROXY OLLAMA)
// ==========================================
app.get('/modelos', async (req, res) => {
    try {
        const response = await fetch(`${OLLAMA_URL}/api/tags`);
        const data = await response.json();
        res.json(data.models || []);
    } catch (e) {
        res.status(500).json({ error: "No se pudo conectar con Ollama" });
    }
});

app.post('/modelos/descargar', async (req, res) => {
    const { nombre } = req.body;
    try {
        const response = await fetch(`${OLLAMA_URL}/api/pull`, {
            method: 'POST',
            body: JSON.stringify({ name: nombre })
        });
        res.setHeader('Content-Type', 'application/json');
        response.body.on('data', (chunk) => {
            const lines = chunk.toString().split('\n');
            lines.forEach(line => {
                if (!line) return;
                try {
                    const status = JSON.parse(line);
                    if (status.completed && status.total) {
                        status.percentage = Math.round((status.completed / status.total) * 100);
                    }
                    res.write(JSON.stringify(status) + '\n');
                } catch (e) {}
            });
        });
        response.body.on('end', () => res.end());
    } catch (e) {
        res.status(500).json({ error: "Error al descargar modelo" });
    }
});

app.delete('/modelos/:nombre', async (req, res) => {
    try {
        await fetch(`${OLLAMA_URL}/api/delete`, {
            method: 'DELETE',
            body: JSON.stringify({ name: req.params.nombre })
        });
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: "Error al eliminar modelo" });
    }
});

// ==========================================
// INICIAR SERVIDOR
// ==========================================
app.listen(PORT, () => {
    console.log(`
    ███████╗ █████╗  ██████╗██╗██╗      ██████╗██╗      █████╗ ██╗    ██╗
    ██╔════╝██╔══██╗██╔════╝██║██║     ██╔════╝██║     ██╔══██╗██║    ██║
    █████╗  ███████║██║     ██║██║     ██║     ██║     ███████║██║ █╗ ██║
    ██╔══╝  ██╔══██║██║     ██║██║     ██║     ██║     ██╔══██║██║███╗██║
    ██║     ██║  ██║╚██████╗██║███████╗╚██████╗███████╗██║  ██║╚███╔███╔╝
    ╚═╝     ╚═╝  ╚═╝ ╚═════╝╚═╝╚══════╝ ╚═════╝╚══════╝╚═╝  ╚═╝ ╚══╝╚══╝ 
                                                                         
    ✅ FacilClaw listo en http://localhost:${PORT}
    🚀 Servidor estático activo. Abre http://localhost:${PORT} en tu navegador.
    `);
});

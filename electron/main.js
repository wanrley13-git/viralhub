const { app, BrowserWindow, Menu, shell } = require("electron");
const path = require("path");

const APP_URL = "https://viralhub-two.vercel.app";

function createWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    titleBarStyle: "hiddenInset",
    trafficLightPosition: { x: 16, y: 16 },
    backgroundColor: "#08080A",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.loadURL(APP_URL);

  // Abrir links externos no navegador padrão
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url !== APP_URL && !url.startsWith(APP_URL)) {
      shell.openExternal(url);
      return { action: "deny" };
    }
    return { action: "allow" };
  });
}

// ── Menu customizado ──

const menuTemplate = [
  {
    label: "ViralHub",
    submenu: [
      { role: "about", label: "Sobre o ViralHub" },
      { type: "separator" },
      { role: "services" },
      { type: "separator" },
      { role: "hide", label: "Ocultar ViralHub" },
      { role: "hideOthers", label: "Ocultar Outros" },
      { role: "unhide", label: "Mostrar Todos" },
      { type: "separator" },
      { role: "quit", label: "Encerrar ViralHub" },
    ],
  },
  {
    label: "Editar",
    submenu: [
      { role: "undo", label: "Desfazer" },
      { role: "redo", label: "Refazer" },
      { type: "separator" },
      { role: "cut", label: "Recortar" },
      { role: "copy", label: "Copiar" },
      { role: "paste", label: "Colar" },
      { role: "selectAll", label: "Selecionar Tudo" },
    ],
  },
  {
    label: "Visualizar",
    submenu: [
      { role: "reload", label: "Recarregar" },
      { role: "forceReload", label: "Forçar Recarregamento" },
      { role: "toggleDevTools", label: "Ferramentas de Desenvolvimento" },
      { type: "separator" },
      { role: "resetZoom", label: "Zoom Padrão" },
      { role: "zoomIn", label: "Aumentar Zoom" },
      { role: "zoomOut", label: "Diminuir Zoom" },
      { type: "separator" },
      { role: "togglefullscreen", label: "Tela Cheia" },
    ],
  },
  {
    label: "Janela",
    submenu: [
      { role: "minimize", label: "Minimizar" },
      { role: "zoom", label: "Zoom" },
      { type: "separator" },
      { role: "front", label: "Trazer para Frente" },
      { type: "separator" },
      { role: "close", label: "Fechar Janela" },
    ],
  },
];

// ── Ciclo de vida do app ──

app.whenReady().then(() => {
  const menu = Menu.buildFromTemplate(menuTemplate);
  Menu.setApplicationMenu(menu);
  createWindow();

  // Mac: recriar janela ao clicar no ícone do dock sem janelas abertas
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// Mac: NÃO encerrar o app quando todas as janelas fecharem
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

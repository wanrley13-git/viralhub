const { contextBridge } = require("electron");

// Expor APIs seguras para o renderer process via contextBridge
// Por enquanto, nenhuma API nativa é necessária
contextBridge.exposeInMainWorld("electronAPI", {
  platform: process.platform,
});

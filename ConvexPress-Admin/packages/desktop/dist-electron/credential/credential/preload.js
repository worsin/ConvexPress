const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("secureCredential", {
  submit(value) {
    ipcRenderer.send("connection-credential:submit", value);
  },
  cancel() {
    ipcRenderer.send("connection-credential:cancel");
  },
  onError(callback) {
    const handler = (_event, message) => callback(message);
    ipcRenderer.on("connection-credential:error", handler);
    return () => ipcRenderer.removeListener("connection-credential:error", handler);
  },
});

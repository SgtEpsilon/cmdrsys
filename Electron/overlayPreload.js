const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('overlayApi', {
    onUpdate: (cb) => ipcRenderer.on('overlay:update', (_, payload) => cb(payload)),
});

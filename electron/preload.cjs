/*
 * The only bridge between the sandboxed page and the system. Everything here is a narrow, typed call into the
 * main process (see src/platform/desktop.ts for the matching TypeScript interface).
 */
const { contextBridge, ipcRenderer } = require('electron');

const invoke = (channel) => (...args) => ipcRenderer.invoke(channel, ...args);
const listen = (channel) => (cb) => {
  const handler = (_e, payload) => cb(payload);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
};

contextBridge.exposeInMainWorld('chitthiDesktop', {
  info: ipcRenderer.sendSync('desktop:info'),
  saveFile: invoke('desktop:saveFile'),
  showInFolder: invoke('desktop:showInFolder'),
  openExternal: invoke('desktop:openExternal'),
  openDesignFile: invoke('desktop:openDesignFile'),
  onMenu: listen('menu'),
  onOpenFile: listen('open-file'),
  db: {
    all: invoke('db:all'),
    get: invoke('db:get'),
    put: invoke('db:put'),
    del: invoke('db:del'),
    getWorkPhotos: invoke('db:getWorkPhotos'),
    putWorkPhotos: invoke('db:putWorkPhotos'),
    libAll: invoke('db:libAll'),
    libUrl: invoke('db:libUrl'),
    libPut: invoke('db:libPut'),
    libDel: invoke('db:libDel'),
  },
});

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
  metrics: invoke('desktop:metrics'),
  onMenu: listen('menu'),
  onOpenFile: listen('open-file'),
  // AI requests: the main process adds the API key; the page can set, check and delete keys, never read them.
  ai: {
    keys: invoke('ai:keys'),
    setKey: invoke('ai:setKey'),
    deleteKey: invoke('ai:deleteKey'),
    fetch: invoke('ai:fetch'),
  },
  // Agent (MCP) tools: the main process forwards tool calls here and writes the files they produce.
  agent: {
    status: invoke('agent:status'),
    setLive: invoke('agent:setLive'),
    onCall: listen('agent:call'),
    reply: (id, result) => ipcRenderer.send('agent:reply', id, result),
    writeFiles: invoke('agent:writeFiles'),
    readPhoto: invoke('agent:readPhoto'),
  },
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

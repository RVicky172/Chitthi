/*
 * The only bridge between the sandboxed page and the system. Everything here is a narrow, typed call into the
 * main process (see src/platform/desktop.ts for the matching TypeScript interface).
 */
const { contextBridge, ipcRenderer, webUtils } = require('electron');

const invoke = (channel) => (...args) => ipcRenderer.invoke(channel, ...args);
const listen = (channel) => (cb) => {
  const handler = (_e, payload) => cb(payload);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
};

/** What saves the open project before the window closes (the page's autosave flush), if anything. */
let flush = null;
// The main process asks before the window closes; the answer comes when the save is done (or failed), at once when
// nothing is registered. The main process stops waiting after 2 s either way.
ipcRenderer.on('projects:flush', (_e, id) => {
  const saving = flush ? Promise.resolve().then(flush) : Promise.resolve();
  saving.catch(() => undefined).then(() => ipcRenderer.send('projects:flushed', id));
});

contextBridge.exposeInMainWorld('chitthiDesktop', {
  info: ipcRenderer.sendSync('desktop:info'),
  saveFile: invoke('desktop:saveFile'),
  // Streaming saves (long video exports): open a file with a save dialog, write at positions, then close.
  openWrite: invoke('desktop:openWrite'),
  writeAt: invoke('desktop:write'),
  closeWrite: invoke('desktop:closeWrite'),
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
  // RAW photos: the main process develops the file's bytes with LibRaw and returns 16-bit linear RGB.
  raw: {
    available: invoke('raw:available'),
    develop: invoke('raw:develop'),
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
  // Saved photo and video projects (408): JSON text both ways; the main process writes the files.
  projects: {
    list: invoke('projects:list'),
    read: invoke('projects:read'),
    write: invoke('projects:write'),
    readCache: invoke('projects:readCache'),
    writeCache: invoke('projects:writeCache'),
    remove: invoke('projects:remove'),
    usage: invoke('projects:usage'),
    onFlush: (cb) => {
      flush = cb;
      return () => {
        if (flush === cb) flush = null;
      };
    },
  },
  // Their media (408): the page names files by media id only. A picked or dropped File becomes its path here, so the
  // page can only point the app at files the user chose ('' for a file with no place on disk).
  media: {
    register: (id, file) => ipcRenderer.invoke('media:register', id, webUtils.getPathForFile(file)),
    writeOwned: invoke('media:writeOwned'),
    finishOwned: invoke('media:finishOwned'),
    status: invoke('media:status'),
    freeSpace: invoke('media:freeSpace'),
    findFile: invoke('media:findFile'),
    sweep: invoke('media:sweep'),
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
    presetAll: invoke('db:presetAll'),
    presetPut: invoke('db:presetPut'),
    presetDel: invoke('db:presetDel'),
  },
});

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
    // App lifecycle
    rendererReady: () => ipcRenderer.invoke('renderer:ready'),

    // Window controls
    minimize: ()  => ipcRenderer.send('window:minimize'),
    maximize: ()  => ipcRenderer.send('window:maximize'),
    close:    ()  => ipcRenderer.send('window:close'),

    // Settings
    getSetting:  (key, def)  => ipcRenderer.invoke('settings:get', key, def),
    setSetting:  (key, val)  => ipcRenderer.invoke('settings:set', key, val),
    getAllSettings: ()        => ipcRenderer.invoke('settings:getAll'),

    // Logs
    getLogs:    ()      => ipcRenderer.invoke('logs:getAll'),
    saveLog:    (entry) => ipcRenderer.invoke('logs:save', entry),
    deleteLog:  (id)    => ipcRenderer.invoke('logs:delete', id),

    // Bookmarks
    getBookmarks:   ()   => ipcRenderer.invoke('bookmarks:getAll'),
    saveBookmark:   (bm) => ipcRenderer.invoke('bookmarks:save', bm),
    deleteBookmark: (id) => ipcRenderer.invoke('bookmarks:delete', id),
    reorderBookmarks: (ids) => ipcRenderer.invoke('bookmarks:reorder', ids),

    // Visited systems
    getVisited:   ()          => ipcRenderer.invoke('visited:getAll'),
    addVisited:   (name, ts)  => ipcRenderer.invoke('visited:add', name, ts),
    clearVisited: ()          => ipcRenderer.invoke('visited:clear'),

    // Journal
    openJournal:    ()  => ipcRenderer.invoke('journal:open'),
    getJournalEvents: () => ipcRenderer.invoke('journal:getEvents'),
    clearJournalEvents: () => ipcRenderer.invoke('journal:clearEvents'),
    stopJournalWatch:  () => ipcRenderer.invoke('journal:stopWatch'),

    // Live journal push events from main
    onJournalProgress: (cb) => ipcRenderer.on('journal:progress',   (_, p)   => cb(p)),
    onJournalEvents:   (cb) => ipcRenderer.on('journal:newEvents',  (_, evs) => cb(evs)),
    onMetaUpdate:      (cb) => ipcRenderer.on('journal:metaUpdate', (_, meta) => cb(meta)),

    // Sync server
    getSyncInfo:  ()      => ipcRenderer.invoke('sync:getInfo'),
    setSyncIP:    (ip)    => ipcRenderer.invoke('sync:setIP', ip),
    setSyncToken: (token) => ipcRenderer.invoke('sync:setToken', token),
    restartSync:  ()      => ipcRenderer.invoke('sync:restart'),
    onSyncServerStarted: (cb) => ipcRenderer.on('sync:serverStarted', (_, info) => cb(info)),
    onSyncDataUpdated:   (cb) => ipcRenderer.on('sync:dataUpdated',   ()         => cb()),
    onSyncIpChanged:     (cb) => ipcRenderer.on('sync:ipChanged',     (_, info)  => cb(info)),

    // Body Notes
    getBodyNotes:   ()    => ipcRenderer.invoke('bodynotes:getAll'),
    saveBodyNote:   (n)   => ipcRenderer.invoke('bodynotes:save', n),
    deleteBodyNote: (id)  => ipcRenderer.invoke('bodynotes:delete', id),
    reorderBodyNotes: (ids) => ipcRenderer.invoke('bodynotes:reorder', ids),
    // Open URL in system browser
    openExternal: (url) => ipcRenderer.invoke("shell:openExternal", url),

    // Export / Import
    exportJSON: () => ipcRenderer.invoke('export:json'),
    importJSON: () => ipcRenderer.invoke('import:json'),
});

const { contextBridge, ipcRenderer } = require('electron');

// Expose print functionality to the web app
contextBridge.exposeInMainWorld('electronPrint', {
  // Get list of available printers
  getPrinters: () => ipcRenderer.invoke('get-printers'),

  // Find Brother QL-800 printer
  findBrotherPrinter: () => ipcRenderer.invoke('find-brother-printer'),

  // Set printer manually
  setPrinter: (printerName) => ipcRenderer.invoke('set-printer', printerName),

  // Print a single tag
  printTag: (tagData) => ipcRenderer.invoke('print-tag', tagData),

  // Print multiple tags
  printTagsBatch: (tagsData) => ipcRenderer.invoke('print-tags-batch', tagsData),

  // Show print settings
  showPrintSettings: () => ipcRenderer.invoke('show-print-settings'),

  // Set label size
  setLabelSize: (width, height) => ipcRenderer.invoke('set-label-size', { width, height }),

  // Check if running in Electron
  isElectron: true
});

// Expose app info and controls
contextBridge.exposeInMainWorld('electronApp', {
  name: 'CleanPos',
  suite: 'Posso One',
  version: '1.0.0',
  platform: process.platform,

  // App controls
  minimize: () => ipcRenderer.send('window-minimize'),
  maximize: () => ipcRenderer.send('window-maximize'),
  close: () => ipcRenderer.send('window-close'),

  // Desktop shortcut - Add to Home Screen
  createDesktopShortcut: () => ipcRenderer.invoke('create-desktop-shortcut'),

  // Startup settings - Run on Windows start
  setStartup: (enabled) => ipcRenderer.invoke('set-startup', enabled),
  getStartup: () => ipcRenderer.invoke('get-startup'),

  // Open external link
  openExternal: (url) => ipcRenderer.invoke('open-external', url)
});

console.log('CleanPos - Posso One Suite - Preload script loaded');
console.log('Print API available via window.electronPrint');
console.log('App API available via window.electronApp');

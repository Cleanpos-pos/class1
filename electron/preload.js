const { contextBridge, ipcRenderer } = require('electron');

// Expose print functionality to the web app
contextBridge.exposeInMainWorld('electronPrint', {
  // ========================================
  // BROTHER QL-800 LABEL PRINTER (Bag Tags)
  // ========================================

  // Get list of available printers (Electron built-in)
  getPrinters: () => ipcRenderer.invoke('get-printers'),

  // Find Brother QL-800 printer
  findBrotherPrinter: () => ipcRenderer.invoke('find-brother-printer'),

  // Set Brother printer manually
  setPrinter: (printerName) => ipcRenderer.invoke('set-printer', printerName),

  // Print a single bag tag (HTML-based, Brother QL-800)
  printTag: (tagData) => ipcRenderer.invoke('print-tag', tagData),

  // Print a garment tag via Brother (HTML-based fallback)
  printGarmentTag: (tagData) => ipcRenderer.invoke('print-garment-tag', tagData),

  // Print multiple bag tags
  printTagsBatch: (tagsData) => ipcRenderer.invoke('print-tags-batch', tagsData),

  // Show print settings
  showPrintSettings: () => ipcRenderer.invoke('show-print-settings'),

  // Set label size for Brother
  setLabelSize: (width, height) => ipcRenderer.invoke('set-label-size', { width, height }),

  // ========================================
  // THERMAL PRINTER (Bixolon 275iii)
  // ========================================

  // Get Windows printers list
  getWindowsPrinters: () => ipcRenderer.invoke('get-windows-printers'),

  // Find thermal printers
  findThermalPrinters: () => ipcRenderer.invoke('find-thermal-printers'),

  // Get printer assignments
  getPrinterAssignments: () => ipcRenderer.invoke('get-printer-assignments'),

  // Set printer assignments
  setPrinterAssignments: (assignments) => ipcRenderer.invoke('set-printer-assignments', assignments),

  // Test thermal printer
  testThermalPrinter: (printerName) => ipcRenderer.invoke('test-thermal-printer', printerName),

  // Print customer receipt (thermal, with prices)
  printCustomerReceipt: (data) => ipcRenderer.invoke('print-customer-receipt', data),

  // Print shop copy (thermal, no prices)
  printShopCopy: (data) => ipcRenderer.invoke('print-shop-copy', data),

  // Print thermal garment tags (one per item with 1/5 numbering)
  printThermalGarmentTags: (tags) => ipcRenderer.invoke('print-thermal-garment-tags', tags),

  // Print full order (receipt + shop copy + garment tags)
  printFullOrder: (data) => ipcRenderer.invoke('print-full-order', data),

  // Open cash drawer
  openCashDrawer: () => ipcRenderer.invoke('open-cash-drawer'),

  // Print raw data to specific printer
  printRaw: (printerName, data) => ipcRenderer.invoke('print-raw', { printerName, data }),

  // ========================================
  // GOOGLE MAPS API (Distance & Postcode)
  // ========================================

  // Calculate distance between two postcodes
  calculateDistance: (params) => ipcRenderer.invoke('calculate-distance', params),

  // Geocode an address to lat/lng
  geocodeAddress: (params) => ipcRenderer.invoke('geocode-address', params),

  // Google Places Autocomplete for address suggestions
  placesAutocomplete: (params) => ipcRenderer.invoke('places-autocomplete', params),

  // Check if running in Electron
  isElectron: true
});

// Expose app info and controls
contextBridge.exposeInMainWorld('electronApp', {
  name: 'CleanPos',
  suite: 'Posso One',
  version: '1.2.5',
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

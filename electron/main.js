const { app, BrowserWindow, ipcMain, shell, Menu, Tray } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

// Keep a global reference of the window object
let mainWindow;
let printWindow;
let splashWindow;
let tray = null;

// Splash screen settings
const SPLASH_DURATION = 3500; // Show splash for 3.5 seconds minimum

// App paths
const APP_NAME = 'CleanPos';
const isPackaged = app.isPackaged;

// Get the correct path for resources (works in dev and packaged)
function getResourcePath(filename) {
  if (isPackaged) {
    // In packaged app, resources are in the app.asar or extraFiles
    return path.join(process.resourcesPath, filename);
  }
  // In development
  return path.join(__dirname, filename);
}

// Brother QL800 settings - 62mm continuous roll (DK-22205)
const BROTHER_QL800_CONFIG = {
  printerName: '', // Will be auto-detected or set by user
  labelWidth: 62, // mm
  labelHeight: 80, // mm - continuous roll auto-cuts to content size
  dpi: 300,
  continuous: true // DK-22205 continuous roll
};

// Create splash screen window with embedded HTML
function createSplashWindow() {
  splashWindow = new BrowserWindow({
    width: 500,
    height: 420,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    center: true,
    skipTaskbar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  // Load splash HTML directly (embedded to avoid file path issues)
  const splashHtml = getSplashHtml();
  splashWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(splashHtml)}`);

  splashWindow.on('closed', () => {
    splashWindow = null;
  });
}

// Embedded splash screen HTML
function getSplashHtml() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, sans-serif;
      background: linear-gradient(135deg, #0a0a1a 0%, #1a1a3e 50%, #0d0d2b 100%);
      height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
      border-radius: 20px;
    }
    .particles {
      position: absolute;
      top: 0; left: 0;
      width: 100%; height: 100%;
      overflow: hidden;
      z-index: 0;
    }
    .particle {
      position: absolute;
      width: 4px; height: 4px;
      background: rgba(99, 179, 237, 0.6);
      border-radius: 50%;
      animation: float 8s infinite ease-in-out;
    }
    .particle:nth-child(1) { left: 10%; top: 20%; animation-delay: 0s; }
    .particle:nth-child(2) { left: 20%; top: 80%; animation-delay: 1s; }
    .particle:nth-child(3) { left: 30%; top: 40%; animation-delay: 2s; }
    .particle:nth-child(4) { left: 40%; top: 60%; animation-delay: 3s; }
    .particle:nth-child(5) { left: 50%; top: 30%; animation-delay: 4s; }
    .particle:nth-child(6) { left: 60%; top: 70%; animation-delay: 5s; }
    .particle:nth-child(7) { left: 70%; top: 50%; animation-delay: 6s; }
    .particle:nth-child(8) { left: 80%; top: 25%; animation-delay: 7s; }
    @keyframes float {
      0%, 100% { transform: translateY(0) scale(1); opacity: 0.6; }
      50% { transform: translateY(-30px) scale(1.5); opacity: 1; }
    }
    .orb {
      position: absolute;
      border-radius: 50%;
      filter: blur(60px);
      opacity: 0.4;
      animation: pulse 6s infinite ease-in-out;
    }
    .orb-1 {
      width: 200px; height: 200px;
      background: radial-gradient(circle, #6366f1 0%, transparent 70%);
      top: -50px; right: -50px;
    }
    .orb-2 {
      width: 180px; height: 180px;
      background: radial-gradient(circle, #06b6d4 0%, transparent 70%);
      bottom: -50px; left: -50px;
      animation-delay: 2s;
    }
    @keyframes pulse {
      0%, 100% { transform: scale(1); opacity: 0.4; }
      50% { transform: scale(1.2); opacity: 0.6; }
    }
    .splash-container {
      text-align: center;
      z-index: 10;
      position: relative;
    }
    .logo-container {
      margin-bottom: 25px;
      position: relative;
      width: 100px; height: 100px;
      margin-left: auto; margin-right: auto;
    }
    .logo-ring {
      width: 100px; height: 100px;
      border: 3px solid transparent;
      border-top-color: #6366f1;
      border-right-color: #06b6d4;
      border-radius: 50%;
      animation: spin 2s linear infinite;
      position: absolute;
      top: 0; left: 0;
    }
    .logo-ring-inner {
      width: 80px; height: 80px;
      border: 2px solid transparent;
      border-bottom-color: #8b5cf6;
      border-left-color: #22d3ee;
      border-radius: 50%;
      animation: spin-reverse 1.5s linear infinite;
      position: absolute;
      top: 10px; left: 10px;
    }
    @keyframes spin { 100% { transform: rotate(360deg); } }
    @keyframes spin-reverse { 100% { transform: rotate(-360deg); } }
    .logo-icon {
      position: absolute;
      top: 50%; left: 50%;
      transform: translate(-50%, -50%);
      width: 50px; height: 50px;
    }
    .logo-icon svg { fill: white; width: 100%; height: 100%; }
    .suite-badge {
      display: inline-block;
      padding: 5px 14px;
      background: linear-gradient(135deg, rgba(99, 102, 241, 0.2) 0%, rgba(6, 182, 212, 0.2) 100%);
      border: 1px solid rgba(99, 102, 241, 0.3);
      border-radius: 20px;
      font-size: 10px;
      font-weight: 600;
      letter-spacing: 2px;
      text-transform: uppercase;
      color: #a5b4fc;
      margin-bottom: 10px;
      animation: fadeInUp 0.8s ease-out 0.2s both;
    }
    .app-name {
      font-size: 42px;
      font-weight: 700;
      background: linear-gradient(135deg, #ffffff 0%, #a5b4fc 50%, #22d3ee 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      letter-spacing: -1px;
      margin-bottom: 6px;
      animation: fadeInUp 0.8s ease-out 0.4s both;
    }
    .app-tagline {
      font-size: 12px;
      color: rgba(255, 255, 255, 0.6);
      letter-spacing: 1px;
      margin-bottom: 35px;
      animation: fadeInUp 0.8s ease-out 0.6s both;
    }
    @keyframes fadeInUp {
      from { opacity: 0; transform: translateY(20px); }
      to { opacity: 1; transform: translateY(0); }
    }
    .loading-container {
      width: 240px;
      margin: 0 auto;
      animation: fadeInUp 0.8s ease-out 0.8s both;
    }
    .loading-bar {
      height: 4px;
      background: rgba(255, 255, 255, 0.1);
      border-radius: 4px;
      overflow: hidden;
    }
    .loading-progress {
      height: 100%;
      width: 30%;
      background: linear-gradient(90deg, #6366f1 0%, #06b6d4 50%, #8b5cf6 100%);
      border-radius: 4px;
      animation: loading 1.5s ease-in-out infinite;
    }
    @keyframes loading {
      0% { width: 0%; margin-left: 0%; }
      50% { width: 40%; margin-left: 30%; }
      100% { width: 0%; margin-left: 100%; }
    }
    .loading-text {
      margin-top: 12px;
      font-size: 11px;
      color: rgba(255, 255, 255, 0.5);
    }
    .version {
      position: absolute;
      bottom: 15px; left: 50%;
      transform: translateX(-50%);
      font-size: 10px;
      color: rgba(255, 255, 255, 0.3);
    }
    .copyright {
      position: absolute;
      bottom: 15px; right: 15px;
      font-size: 9px;
      color: rgba(255, 255, 255, 0.25);
    }
  </style>
</head>
<body>
  <div class="particles">
    <div class="particle"></div><div class="particle"></div><div class="particle"></div>
    <div class="particle"></div><div class="particle"></div><div class="particle"></div>
    <div class="particle"></div><div class="particle"></div>
  </div>
  <div class="orb orb-1"></div>
  <div class="orb orb-2"></div>
  <div class="splash-container">
    <div class="logo-container">
      <div class="logo-ring"></div>
      <div class="logo-ring-inner"></div>
      <div class="logo-icon">
        <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <path d="M12 4.5C11.17 4.5 10.5 5.17 10.5 6C10.5 6.41 10.67 6.77 10.94 7.03L4.13 12.19C3.43 12.72 3 13.53 3 14.41C3 15.84 4.16 17 5.59 17H18.41C19.84 17 21 15.84 21 14.41C21 13.53 20.57 12.72 19.87 12.19L13.06 7.03C13.33 6.77 13.5 6.41 13.5 6C13.5 5.17 12.83 4.5 12 4.5ZM12 6.25C12.14 6.25 12.25 6.36 12.25 6.5C12.25 6.64 12.14 6.75 12 6.75C11.86 6.75 11.75 6.64 11.75 6.5C11.75 6.36 11.86 6.25 12 6.25ZM12 8.5L18.88 13.72C19.14 13.91 19.3 14.15 19.3 14.41C19.3 14.85 18.85 15.3 18.41 15.3H5.59C5.15 15.3 4.7 14.85 4.7 14.41C4.7 14.15 4.86 13.91 5.12 13.72L12 8.5Z"/>
          <path d="M6 19H18V20H6V19Z"/>
        </svg>
      </div>
    </div>
    <div class="suite-badge">Posso One Suite</div>
    <h1 class="app-name">CleanPos</h1>
    <p class="app-tagline">Professional Dry Cleaning & Laundry Management</p>
    <div class="loading-container">
      <div class="loading-bar"><div class="loading-progress"></div></div>
      <p class="loading-text">Loading...</p>
    </div>
  </div>
  <div class="version">v1.0.0</div>
  <div class="copyright">© 2024 Posso</div>
</body>
</html>`;
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 768,
    show: false, // Don't show until ready
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    },
    icon: path.join(__dirname, 'build', 'icon.ico'),
    title: 'CleanPos - Posso One'
  });

  // Load the web app
  mainWindow.loadURL('https://xp-clean.web.app/');

  // Track when page started loading
  const loadStart = Date.now();

  // When the main window is ready, close splash and show main window
  mainWindow.webContents.on('did-finish-load', () => {
    // Ensure splash shows for minimum duration
    const elapsed = Date.now() - loadStart;
    const remainingTime = Math.max(0, SPLASH_DURATION - elapsed);

    setTimeout(() => {
      if (splashWindow && !splashWindow.isDestroyed()) {
        splashWindow.close();
      }
      if (mainWindow) {
        mainWindow.show();
        mainWindow.focus();
      }
    }, remainingTime);
  });

  // Handle load failure - still close splash
  mainWindow.webContents.on('did-fail-load', () => {
    setTimeout(() => {
      if (splashWindow && !splashWindow.isDestroyed()) {
        splashWindow.close();
      }
      if (mainWindow) {
        mainWindow.show();
      }
    }, 1000);
  });

  // Open DevTools in development
  if (process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Create hidden window for printing labels
function createPrintWindow() {
  printWindow = new BrowserWindow({
    width: 400,
    height: 300,
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false
    }
  });
}

// Generate label HTML for Brother QL800 - Compact format with QR code
function generateLabelHtml(tagData) {
  const {
    storeName,
    ticketNumber,
    customerName,
    customerPhone,
    customerAddress,
    itemCount,
    items,
    itemsSummary,
    dueDate,
    notes,
    orderId,
    qrData
  } = tagData;

  // QR code content
  const qrContent = qrData || orderId || ticketNumber || 'NO-ID';

  // Format items for display - handle both string and HTML formats
  let formattedItems = 'No items';
  if (itemsSummary) {
    formattedItems = itemsSummary;
  } else if (items) {
    formattedItems = items.split(',').map(i => i.trim()).join('<br>');
  }

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    @page { size: 62mm auto; margin: 0; }
    @media print { html, body { width: 62mm; margin: 0; padding: 0; } }
    body {
      font-family: Arial, sans-serif;
      width: 62mm;
      padding: 5mm 2mm 30mm 2mm;
      background: white;
      color: black;
      font-size: 9pt;
    }
    .tag-container {
      width: 100%;
      border: 1.5px solid #000;
      padding: 3mm;
      page-break-inside: avoid;
      margin-top: 2mm;
    }
    .store-name {
      text-align: center;
      font-size: 12pt;
      font-weight: bold;
      border-bottom: 2px solid #000;
      padding-bottom: 1mm;
      margin-bottom: 1.5mm;
      text-transform: uppercase;
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 1px solid #000;
      padding-bottom: 1.5mm;
      margin-bottom: 1.5mm;
    }
    .ticket-number { font-size: 16pt; font-weight: bold; }
    .item-count {
      font-size: 11pt;
      background: #000;
      color: #fff;
      padding: 1mm 3mm;
      font-weight: bold;
    }
    .customer-section {
      border-bottom: 1px dashed #666;
      padding-bottom: 1.5mm;
      margin-bottom: 1.5mm;
    }
    .customer-name { font-size: 12pt; font-weight: bold; }
    .customer-phone { font-size: 9pt; color: #333; }
    .items-section {
      border-bottom: 1px dashed #666;
      padding-bottom: 1.5mm;
      margin-bottom: 1.5mm;
    }
    .items-title {
      font-size: 8pt;
      font-weight: bold;
      color: #666;
      text-transform: uppercase;
      margin-bottom: 1mm;
    }
    .items-list { font-size: 10pt; font-weight: bold; line-height: 1.4; }
    .due-section {
      text-align: center;
      border-bottom: 1px dashed #666;
      padding-bottom: 1.5mm;
      margin-bottom: 2mm;
    }
    .due-date { font-size: 11pt; font-weight: bold; }
    .notes { font-size: 8pt; color: #666; font-style: italic; margin-top: 1mm; }
    .qr-section { text-align: center; padding-top: 1mm; }
    .qr-code { width: 25mm; height: 25mm; margin: 0 auto; }
    .qr-code svg { width: 100%; height: 100%; }
    .scan-text { font-size: 7pt; color: #666; margin-top: 1mm; }
  </style>
</head>
<body>
  <div class="tag-container">
    <div class="store-name">${storeName || 'Dry Cleaners'}</div>
    <div class="header">
      <span class="ticket-number">#${ticketNumber || '---'}</span>
      <span class="item-count">${itemCount || 0} pcs</span>
    </div>
    <div class="customer-section">
      <div class="customer-name">${customerName || 'Walk-in'}</div>
      ${customerPhone ? `<div class="customer-phone">${customerPhone}</div>` : ''}
    </div>
    <div class="items-section">
      <div class="items-title">Items</div>
      <div class="items-list">${formattedItems}</div>
    </div>
    <div class="due-section">
      <div class="due-date">Due: ${dueDate || 'TBD'}</div>
      ${notes ? `<div class="notes">${notes}</div>` : ''}
    </div>
    <div class="qr-section">
      <div class="qr-code" id="qrcode"></div>
      <div class="scan-text">Scan QR: ${qrContent}</div>
    </div>
  </div>
  <script src="https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.min.js"></script>
  <script>
    (function() {
      var qr = qrcode(0, 'M');
      qr.addData('${qrContent}');
      qr.make();
      document.getElementById('qrcode').innerHTML = qr.createSvgTag(3, 0);
    })();
  </script>
</body>
</html>
  `;
}

// Generate garment tag HTML - smaller tag, one per item with position indicator
function generateGarmentTagHtml(tagData) {
  const {
    ticketNumber,
    customerName,
    dueDate,
    itemName,
    itemIndex,
    itemTotal
  } = tagData;

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    @page { size: 62mm 40mm; margin: 0; }
    @media print { html, body { width: 62mm; height: 40mm; margin: 0; padding: 0; } }
    body {
      font-family: Arial, sans-serif;
      width: 62mm;
      height: 40mm;
      padding: 2mm;
      background: white;
      color: black;
    }
    .garment-tag {
      width: 100%;
      height: 100%;
      border: 2px solid #000;
      padding: 2mm;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
    }
    .top-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 1px solid #000;
      padding-bottom: 1mm;
    }
    .ticket-num {
      font-size: 14pt;
      font-weight: bold;
    }
    .position {
      font-size: 16pt;
      font-weight: bold;
      background: #000;
      color: #fff;
      padding: 1mm 3mm;
      border-radius: 2mm;
    }
    .customer {
      font-size: 12pt;
      font-weight: bold;
      text-align: center;
      padding: 1mm 0;
    }
    .item-name {
      font-size: 11pt;
      font-weight: bold;
      text-align: center;
      background: #f0f0f0;
      padding: 1mm;
      border-radius: 1mm;
    }
    .due-date {
      font-size: 9pt;
      text-align: center;
      color: #333;
    }
  </style>
</head>
<body>
  <div class="garment-tag">
    <div class="top-row">
      <span class="ticket-num">#${ticketNumber || '---'}</span>
      <span class="position">${itemIndex}/${itemTotal}</span>
    </div>
    <div class="customer">${customerName || 'Walk-in'}</div>
    <div class="item-name">${itemName || 'Item'}</div>
    <div class="due-date">Due: ${dueDate || 'TBD'}</div>
  </div>
</body>
</html>
  `;
}

// Create desktop shortcut
function createDesktopShortcut() {
  if (process.platform === 'win32') {
    const desktopPath = path.join(os.homedir(), 'Desktop');
    const shortcutPath = path.join(desktopPath, 'CleanPos.lnk');
    const exePath = process.execPath;

    // Use PowerShell to create shortcut
    const { exec } = require('child_process');
    const psScript = `
      $WshShell = New-Object -comObject WScript.Shell
      $Shortcut = $WshShell.CreateShortcut("${shortcutPath.replace(/\\/g, '\\\\')}")
      $Shortcut.TargetPath = "${exePath.replace(/\\/g, '\\\\')}"
      $Shortcut.WorkingDirectory = "${path.dirname(exePath).replace(/\\/g, '\\\\')}"
      $Shortcut.Description = "CleanPos - Posso One Suite"
      $Shortcut.Save()
    `;

    exec(`powershell -Command "${psScript}"`, (error) => {
      if (error) {
        console.error('Failed to create desktop shortcut:', error);
        return { success: false, error: error.message };
      }
      console.log('Desktop shortcut created');
      return { success: true };
    });
  }
  return { success: true };
}

// Add to Windows startup
function setStartupEnabled(enabled) {
  if (process.platform === 'win32') {
    const appPath = process.execPath;
    const { exec } = require('child_process');

    if (enabled) {
      // Add to startup registry
      const regCommand = `reg add "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run" /v "CleanPos" /t REG_SZ /d "${appPath}" /f`;
      exec(regCommand, (error) => {
        if (error) {
          console.error('Failed to add to startup:', error);
        } else {
          console.log('Added to Windows startup');
        }
      });
    } else {
      // Remove from startup registry
      const regCommand = `reg delete "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run" /v "CleanPos" /f`;
      exec(regCommand, (error) => {
        if (error) {
          console.error('Failed to remove from startup:', error);
        } else {
          console.log('Removed from Windows startup');
        }
      });
    }
  }
  return { success: true, enabled };
}

// Check if app is set to run at startup
function isStartupEnabled() {
  if (process.platform === 'win32') {
    try {
      const { execSync } = require('child_process');
      const result = execSync('reg query "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run" /v "CleanPos"', { encoding: 'utf8' });
      return result.includes('CleanPos');
    } catch {
      return false;
    }
  }
  return false;
}

// Setup IPC handlers
function setupIpcHandlers() {
  // Get list of available printers
  ipcMain.handle('get-printers', async () => {
    const printers = await mainWindow.webContents.getPrintersAsync();
    return printers.map(p => ({
      name: p.name,
      displayName: p.displayName,
      isDefault: p.isDefault,
      status: p.status
    }));
  });

  // Find Brother QL800 printer
  ipcMain.handle('find-brother-printer', async () => {
    const printers = await mainWindow.webContents.getPrintersAsync();
    const brotherPrinter = printers.find(p =>
      p.name.toLowerCase().includes('brother') &&
      (p.name.toLowerCase().includes('ql-800') || p.name.toLowerCase().includes('ql800'))
    );

    if (brotherPrinter) {
      BROTHER_QL800_CONFIG.printerName = brotherPrinter.name;
      return { found: true, name: brotherPrinter.name };
    }

    const anyBrother = printers.find(p => p.name.toLowerCase().includes('brother'));
    if (anyBrother) {
      BROTHER_QL800_CONFIG.printerName = anyBrother.name;
      return { found: true, name: anyBrother.name, note: 'Found Brother printer (not QL-800)' };
    }

    return { found: false, availablePrinters: printers.map(p => p.name) };
  });

  // Set printer manually
  ipcMain.handle('set-printer', async (event, printerName) => {
    BROTHER_QL800_CONFIG.printerName = printerName;
    return { success: true, printerName };
  });

  // Print a tag/label
  ipcMain.handle('print-tag', async (event, tagData) => {
    try {
      if (!BROTHER_QL800_CONFIG.printerName) {
        const printers = await mainWindow.webContents.getPrintersAsync();
        const brotherPrinter = printers.find(p => p.name.toLowerCase().includes('brother'));
        if (brotherPrinter) {
          BROTHER_QL800_CONFIG.printerName = brotherPrinter.name;
        } else {
          return { success: false, error: 'No printer configured. Please set up your Brother QL-800 printer.' };
        }
      }

      const labelHtml = generateLabelHtml(tagData);
      const tempFile = path.join(os.tmpdir(), `label-${Date.now()}.html`);
      fs.writeFileSync(tempFile, labelHtml, 'utf8');

      if (!printWindow || printWindow.isDestroyed()) {
        createPrintWindow();
      }

      await printWindow.loadFile(tempFile);

      const printOptions = {
        silent: true,
        printBackground: true,
        deviceName: BROTHER_QL800_CONFIG.printerName,
        margins: { marginType: 'none' },
        pageSize: { width: 62000, height: 150000 }
      };

      return new Promise((resolve) => {
        printWindow.webContents.print(printOptions, (success, failureReason) => {
          try { fs.unlinkSync(tempFile); } catch (e) {}
          if (!success) {
            console.error('Print failed:', failureReason);
            resolve({ success: false, error: failureReason || 'Print failed' });
          } else {
            resolve({ success: true, message: 'Tag sent to printer' });
          }
        });
      });
    } catch (error) {
      console.error('Print error:', error);
      return { success: false, error: error.message };
    }
  });

  // Print multiple tags
  ipcMain.handle('print-tags-batch', async (event, tagsData) => {
    const results = [];
    for (const tag of tagsData) {
      try {
        const labelHtml = generateLabelHtml(tag);
        const tempFile = path.join(os.tmpdir(), `label-batch-${Date.now()}.html`);
        fs.writeFileSync(tempFile, labelHtml, 'utf8');

        if (!printWindow || printWindow.isDestroyed()) {
          createPrintWindow();
        }
        await printWindow.loadFile(tempFile);

        const printOptions = {
          silent: true,
          printBackground: true,
          deviceName: BROTHER_QL800_CONFIG.printerName,
          margins: { marginType: 'none' },
          pageSize: { width: 62000, height: 150000 }
        };

        await new Promise((resolve) => {
          printWindow.webContents.print(printOptions, (success) => {
            try { fs.unlinkSync(tempFile); } catch (e) {}
            results.push({ success });
            resolve();
          });
        });

        await new Promise(resolve => setTimeout(resolve, 500));
      } catch (error) {
        results.push({ success: false, error: error.message });
      }
    }
    return results;
  });

  // Print a garment tag (smaller, one per item with cut after)
  ipcMain.handle('print-garment-tag', async (event, tagData) => {
    try {
      if (!BROTHER_QL800_CONFIG.printerName) {
        const printers = await mainWindow.webContents.getPrintersAsync();
        const brotherPrinter = printers.find(p => p.name.toLowerCase().includes('brother'));
        if (brotherPrinter) {
          BROTHER_QL800_CONFIG.printerName = brotherPrinter.name;
        } else {
          return { success: false, error: 'No printer configured.' };
        }
      }

      const garmentHtml = generateGarmentTagHtml(tagData);
      const tempFile = path.join(os.tmpdir(), `garment-tag-${Date.now()}.html`);
      fs.writeFileSync(tempFile, garmentHtml, 'utf8');

      if (!printWindow || printWindow.isDestroyed()) {
        createPrintWindow();
      }

      await printWindow.loadFile(tempFile);

      const printOptions = {
        silent: true,
        printBackground: true,
        deviceName: BROTHER_QL800_CONFIG.printerName,
        margins: { marginType: 'none' },
        pageSize: { width: 62000, height: 40000 } // Smaller height for garment tags
      };

      return new Promise((resolve) => {
        printWindow.webContents.print(printOptions, (success, failureReason) => {
          try { fs.unlinkSync(tempFile); } catch (e) {}
          if (!success) {
            resolve({ success: false, error: failureReason || 'Print failed' });
          } else {
            resolve({ success: true, message: 'Garment tag sent to printer' });
          }
        });
      });
    } catch (error) {
      console.error('Garment tag print error:', error);
      return { success: false, error: error.message };
    }
  });

  // Show print settings
  ipcMain.handle('show-print-settings', async () => {
    const printers = await mainWindow.webContents.getPrintersAsync();
    const brotherPrinters = printers.filter(p =>
      p.name.toLowerCase().includes('brother') ||
      p.name.toLowerCase().includes('label')
    );

    return {
      currentPrinter: BROTHER_QL800_CONFIG.printerName,
      availablePrinters: printers.map(p => p.name),
      recommendedPrinters: brotherPrinters.map(p => p.name),
      labelConfig: BROTHER_QL800_CONFIG
    };
  });

  // Update label size
  ipcMain.handle('set-label-size', async (event, { width, height }) => {
    BROTHER_QL800_CONFIG.labelWidth = width;
    BROTHER_QL800_CONFIG.labelHeight = height;
    return { success: true, config: BROTHER_QL800_CONFIG };
  });

  // Desktop shortcut
  ipcMain.handle('create-desktop-shortcut', async () => {
    return createDesktopShortcut();
  });

  // Startup settings
  ipcMain.handle('set-startup', async (event, enabled) => {
    return setStartupEnabled(enabled);
  });

  ipcMain.handle('get-startup', async () => {
    return { enabled: isStartupEnabled() };
  });

  // Open external link
  ipcMain.handle('open-external', async (event, url) => {
    shell.openExternal(url);
    return { success: true };
  });
}

// App lifecycle
app.whenReady().then(() => {
  // Show splash screen first
  createSplashWindow();

  // Create main window (hidden initially)
  createWindow();
  createPrintWindow();
  setupIpcHandlers();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createSplashWindow();
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

console.log('CleanPos - Posso One Suite - Starting...');
console.log('Brother QL-800 Label Printing Enabled');

/**
 * Windows RAW Printer Support
 * Direct byte printing via Windows Print Spooler (winspool.drv)
 * Bypasses printer drivers for ESC/POS thermal printers
 */

const { exec, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

/**
 * Get list of Windows printers via PowerShell
 * @returns {Promise<Array>} List of printer objects
 */
async function getWindowsPrinters() {
  return new Promise((resolve, reject) => {
    const psScript = `
      try {
        $printers = Get-Printer | Select-Object Name, DriverName, PortName, PrinterStatus, Shared, Default
        $printers | ConvertTo-Json -Compress
      } catch {
        # Fallback to WMI if Get-Printer fails
        $printers = Get-WmiObject -Class Win32_Printer | Select-Object Name, DriverName, PortName, PrinterStatus, Shared, Default
        $printers | ConvertTo-Json -Compress
      }
    `;

    exec(`powershell -NoProfile -Command "${psScript.replace(/\n/g, ' ')}"`, { maxBuffer: 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) {
        console.error('Error getting printers:', error);
        // Return empty array on error
        resolve([]);
        return;
      }

      try {
        const output = stdout.trim();
        if (!output || output === 'null') {
          resolve([]);
          return;
        }

        let printers = JSON.parse(output);
        // Ensure it's an array
        if (!Array.isArray(printers)) {
          printers = [printers];
        }

        resolve(printers.map(p => ({
          name: p.Name,
          driver: p.DriverName,
          port: p.PortName,
          status: p.PrinterStatus,
          shared: p.Shared,
          isDefault: p.Default
        })));
      } catch (parseError) {
        console.error('Error parsing printer list:', parseError);
        resolve([]);
      }
    });
  });
}

/**
 * Find thermal/receipt printers by common names
 * @returns {Promise<Array>} List of likely thermal printers
 */
async function findThermalPrinters() {
  const printers = await getWindowsPrinters();
  const thermalKeywords = [
    'bixolon', 'srp', 'epson', 'tm-', 'star', 'tsp',
    'citizen', 'thermal', 'receipt', 'pos', 'escpos'
  ];

  return printers.filter(p => {
    const name = (p.name || '').toLowerCase();
    const driver = (p.driver || '').toLowerCase();
    return thermalKeywords.some(kw => name.includes(kw) || driver.includes(kw));
  });
}

/**
 * Print raw bytes directly to Windows printer via winspool.drv
 * Uses PowerShell with inline C# for DLL imports
 * @param {string} printerName - Windows printer name
 * @param {Buffer} data - Raw bytes to send
 * @returns {Promise<{success: boolean, message?: string, error?: string}>}
 */
async function printRawDirect(printerName, data) {
  return new Promise((resolve) => {
    // Write data to temp file
    const tempDir = os.tmpdir();
    const timestamp = Date.now();
    const tempFile = path.join(tempDir, `print-${timestamp}.bin`);
    const tempScript = path.join(tempDir, `print-${timestamp}.ps1`);

    try {
      fs.writeFileSync(tempFile, data);
    } catch (err) {
      resolve({ success: false, error: `Failed to write temp file: ${err.message}` });
      return;
    }

    // PowerShell script with inline C# for raw printing
    // Write to a .ps1 file to preserve here-string formatting
    const psScript = `
Add-Type -TypeDefinition @"
using System;
using System.IO;
using System.Runtime.InteropServices;

public class RawPrinterHelper {
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Ansi)]
    public class DOCINFOA {
        [MarshalAs(UnmanagedType.LPStr)] public string pDocName;
        [MarshalAs(UnmanagedType.LPStr)] public string pOutputFile;
        [MarshalAs(UnmanagedType.LPStr)] public string pDataType;
    }

    [DllImport("winspool.drv", EntryPoint = "OpenPrinterA", SetLastError = true, CharSet = CharSet.Ansi, ExactSpelling = true)]
    public static extern bool OpenPrinter([MarshalAs(UnmanagedType.LPStr)] string szPrinter, out IntPtr hPrinter, IntPtr pd);

    [DllImport("winspool.drv", EntryPoint = "ClosePrinter", SetLastError = true)]
    public static extern bool ClosePrinter(IntPtr hPrinter);

    [DllImport("winspool.drv", EntryPoint = "StartDocPrinterA", SetLastError = true, CharSet = CharSet.Ansi)]
    public static extern bool StartDocPrinter(IntPtr hPrinter, Int32 level, [In, MarshalAs(UnmanagedType.LPStruct)] DOCINFOA di);

    [DllImport("winspool.drv", EntryPoint = "EndDocPrinter", SetLastError = true)]
    public static extern bool EndDocPrinter(IntPtr hPrinter);

    [DllImport("winspool.drv", EntryPoint = "StartPagePrinter", SetLastError = true)]
    public static extern bool StartPagePrinter(IntPtr hPrinter);

    [DllImport("winspool.drv", EntryPoint = "EndPagePrinter", SetLastError = true)]
    public static extern bool EndPagePrinter(IntPtr hPrinter);

    [DllImport("winspool.drv", EntryPoint = "WritePrinter", SetLastError = true)]
    public static extern bool WritePrinter(IntPtr hPrinter, IntPtr pBytes, Int32 dwCount, out Int32 dwWritten);

    public static bool SendBytesToPrinter(string printerName, byte[] bytes) {
        IntPtr hPrinter = IntPtr.Zero;
        DOCINFOA di = new DOCINFOA();
        di.pDocName = "RAW Document";
        di.pDataType = "RAW";

        bool success = false;

        if (OpenPrinter(printerName.Normalize(), out hPrinter, IntPtr.Zero)) {
            if (StartDocPrinter(hPrinter, 1, di)) {
                if (StartPagePrinter(hPrinter)) {
                    IntPtr pUnmanagedBytes = Marshal.AllocCoTaskMem(bytes.Length);
                    Marshal.Copy(bytes, 0, pUnmanagedBytes, bytes.Length);

                    int dwWritten;
                    success = WritePrinter(hPrinter, pUnmanagedBytes, bytes.Length, out dwWritten);

                    Marshal.FreeCoTaskMem(pUnmanagedBytes);
                    EndPagePrinter(hPrinter);
                }
                EndDocPrinter(hPrinter);
            }
            ClosePrinter(hPrinter);
        }
        return success;
    }
}
"@

try {
    $bytes = [System.IO.File]::ReadAllBytes("${tempFile.replace(/\\/g, '\\\\')}")
    $result = [RawPrinterHelper]::SendBytesToPrinter("${printerName.replace(/"/g, '`"')}", $bytes)
    if ($result) {
        Write-Output "SUCCESS"
    } else {
        $err = [System.Runtime.InteropServices.Marshal]::GetLastWin32Error()
        Write-Output "FAILED:$err"
    }
} catch {
    Write-Output "ERROR:$_"
} finally {
    Remove-Item -Path "${tempFile.replace(/\\/g, '\\\\')}" -Force -ErrorAction SilentlyContinue
}
`;

    try {
      fs.writeFileSync(tempScript, psScript, 'utf8');
    } catch (err) {
      resolve({ success: false, error: `Failed to write script file: ${err.message}` });
      return;
    }

    exec(`powershell -NoProfile -ExecutionPolicy Bypass -File "${tempScript}"`, { maxBuffer: 1024 * 1024 }, (error, stdout, stderr) => {
      // Clean up temp files
      try { fs.unlinkSync(tempFile); } catch (e) { }
      try { fs.unlinkSync(tempScript); } catch (e) { }

      if (error) {
        console.error('Print error:', error);
        console.error('Stderr:', stderr);
        resolve({ success: false, error: error.message });
        return;
      }

      const output = stdout.trim();
      if (output === 'SUCCESS') {
        resolve({ success: true, message: 'Print job sent successfully' });
      } else if (output.startsWith('FAILED:')) {
        const errorCode = output.split(':')[1];
        resolve({ success: false, error: `Print failed with Windows error code: ${errorCode}` });
      } else if (output.startsWith('ERROR:')) {
        resolve({ success: false, error: output.substring(6) });
      } else {
        resolve({ success: false, error: `Unexpected output: ${output}` });
      }
    });
  });
}

/**
 * Test printer connection by sending a simple test print
 * @param {string} printerName - Windows printer name
 * @returns {Promise<{success: boolean, message?: string, error?: string}>}
 */
async function testPrinter(printerName) {
  const { buildTestPrint } = require('./escpos-commands');
  const testData = buildTestPrint(printerName);
  return printRawDirect(printerName, testData);
}

/**
 * Open cash drawer connected to printer
 * @param {string} printerName - Windows printer name
 * @returns {Promise<{success: boolean, message?: string, error?: string}>}
 */
async function openCashDrawer(printerName) {
  const { buildOpenDrawer } = require('./escpos-commands');
  const drawerCommand = buildOpenDrawer(2); // Pin 2 is most common
  return printRawDirect(printerName, drawerCommand);
}

/**
 * Print customer receipt
 * @param {string} printerName - Windows printer name
 * @param {Object} data - Receipt data
 * @returns {Promise<{success: boolean, message?: string, error?: string}>}
 */
async function printCustomerReceipt(printerName, data) {
  const { buildCustomerReceipt } = require('./escpos-commands');
  const receiptData = buildCustomerReceipt(data);
  return printRawDirect(printerName, receiptData);
}

/**
 * Print shop copy
 * @param {string} printerName - Windows printer name
 * @param {Object} data - Shop copy data
 * @returns {Promise<{success: boolean, message?: string, error?: string}>}
 */
async function printShopCopy(printerName, data) {
  const { buildShopCopy } = require('./escpos-commands');
  const shopData = buildShopCopy(data);
  return printRawDirect(printerName, shopData);
}

/**
 * Print garment tags
 * @param {string} printerName - Windows printer name
 * @param {Array} tags - Array of tag data objects
 * @returns {Promise<{success: boolean, message?: string, error?: string, results?: Array}>}
 */
async function printGarmentTags(printerName, tags) {
  const { buildGarmentTags } = require('./escpos-commands');

  if (!Array.isArray(tags) || tags.length === 0) {
    return { success: false, error: 'No tags to print' };
  }

  const tagBuffer = buildGarmentTags(tags);
  return printRawDirect(printerName, tagBuffer);
}

/**
 * Print full order (customer receipt + shop copy + DStubs)
 * @param {Object} data - Order data
 * @param {Object} printers - Printer assignments { receiptPrinter, dstubsPrinter }
 * @returns {Promise<Object>} Results for each print job
 */
async function printFullOrder(data, printers) {
  const results = {
    customerReceipt: null,
    shopCopy: null,
    dstubs: null
  };

  const { receiptPrinter, dstubsPrinter } = printers;

  // Print customer receipt (thermal 80mm)
  if (receiptPrinter && data.printCustomerReceipt !== false) {
    results.customerReceipt = await printCustomerReceipt(receiptPrinter, data);
  }

  // Print shop copy (thermal 80mm)
  if (receiptPrinter && data.printShopCopy !== false) {
    results.shopCopy = await printShopCopy(receiptPrinter, data);
  }

  // Print DStubs (dot-matrix 76mm)
  if (dstubsPrinter && data.tags && data.tags.length > 0) {
    results.dstubs = await printGarmentTags(dstubsPrinter, data.tags);
  }

  const allSuccess = Object.values(results).every(r => r === null || r?.success);

  return {
    success: allSuccess,
    message: allSuccess ? 'All print jobs completed' : 'Some print jobs failed',
    results
  };
}

module.exports = {
  getWindowsPrinters,
  findThermalPrinters,
  printRawDirect,
  testPrinter,
  openCashDrawer,
  printCustomerReceipt,
  printShopCopy,
  printGarmentTags,
  printFullOrder
};

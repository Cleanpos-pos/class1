// TypeScript declarations for Electron Print API
// Add this to your project's type definitions

interface PrintTagData {
  ticketNumber?: string;
  customerName?: string;
  customerPhone?: string;
  itemCount?: number;
  items?: string;
  dueDate?: string;
  notes?: string;
  barcode?: string;
}

interface PrintResult {
  success: boolean;
  message?: string;
  error?: string;
}

interface PrinterInfo {
  name: string;
  displayName: string;
  isDefault: boolean;
  status: number;
}

interface FindPrinterResult {
  found: boolean;
  name?: string;
  note?: string;
  availablePrinters?: string[];
}

interface PrintSettings {
  currentPrinter: string;
  availablePrinters: string[];
  recommendedPrinters: string[];
  labelConfig: {
    printerName: string;
    labelWidth: number;
    labelHeight: number;
    dpi: number;
  };
}

interface ElectronPrintAPI {
  isElectron: boolean;
  getPrinters: () => Promise<PrinterInfo[]>;
  findBrotherPrinter: () => Promise<FindPrinterResult>;
  setPrinter: (printerName: string) => Promise<{ success: boolean; printerName: string }>;
  printTag: (tagData: PrintTagData) => Promise<PrintResult>;
  printTagsBatch: (tagsData: PrintTagData[]) => Promise<PrintResult[]>;
  showPrintSettings: () => Promise<PrintSettings>;
  setLabelSize: (width: number, height: number) => Promise<{ success: boolean; config: any }>;
}

interface ElectronAppAPI {
  version: string;
  platform: string;
  minimize: () => void;
  maximize: () => void;
  close: () => void;
}

declare global {
  interface Window {
    electronPrint?: ElectronPrintAPI;
    electronApp?: ElectronAppAPI;
  }
}

export {};

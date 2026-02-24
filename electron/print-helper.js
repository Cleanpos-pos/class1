/**
 * Print Helper for XP Clean POS
 * This file provides helper functions for printing tags via the Electron wrapper
 *
 * Usage in your React app:
 *
 * import { printOrderTag, printItemTag, initializePrinter } from './electron/print-helper';
 *
 * // Initialize printer on app start
 * await initializePrinter();
 *
 * // Print a tag for an order
 * await printOrderTag(order);
 */

// Check if running in Electron
export const isElectron = () => {
  return typeof window !== 'undefined' && window.electronPrint?.isElectron === true;
};

// Initialize and find the Brother printer
export const initializePrinter = async () => {
  if (!isElectron()) {
    console.log('Not running in Electron - print functionality disabled');
    return { success: false, reason: 'Not running in Electron app' };
  }

  try {
    const result = await window.electronPrint.findBrotherPrinter();
    if (result.found) {
      console.log('Brother printer found:', result.name);
      return { success: true, printer: result.name };
    } else {
      console.warn('Brother QL-800 not found. Available printers:', result.availablePrinters);
      return { success: false, availablePrinters: result.availablePrinters };
    }
  } catch (error) {
    console.error('Failed to initialize printer:', error);
    return { success: false, error: error.message };
  }
};

// Print a tag for an order
export const printOrderTag = async (order) => {
  if (!isElectron()) {
    console.warn('Print not available - not running in Electron');
    return { success: false, reason: 'Not in Electron app' };
  }

  const tagData = {
    ticketNumber: order.pos_ticket_id || order.id?.slice(-6)?.toUpperCase() || '---',
    customerName: order.customer_name || 'Walk-in',
    customerPhone: order.customer_phone || '',
    itemCount: order.items?.length || 0,
    items: order.items?.map(i => i.name || i.service_name).join(', ') || '',
    dueDate: order.due_date ? formatDate(order.due_date) : 'TBD',
    notes: order.notes || ''
  };

  return await window.electronPrint.printTag(tagData);
};

// Print a tag for a specific item
export const printItemTag = async (item, orderInfo = {}) => {
  if (!isElectron()) {
    console.warn('Print not available - not running in Electron');
    return { success: false, reason: 'Not in Electron app' };
  }

  const tagData = {
    ticketNumber: orderInfo.ticketNumber || '---',
    customerName: orderInfo.customerName || 'Walk-in',
    customerPhone: orderInfo.customerPhone || '',
    itemCount: 1,
    items: item.name || item.service_name || 'Item',
    dueDate: orderInfo.dueDate || 'TBD',
    notes: item.notes || item.special_instructions || ''
  };

  return await window.electronPrint.printTag(tagData);
};

// Print multiple tags at once
export const printBatchTags = async (orders) => {
  if (!isElectron()) {
    console.warn('Print not available - not running in Electron');
    return { success: false, reason: 'Not in Electron app' };
  }

  const tagsData = orders.map(order => ({
    ticketNumber: order.pos_ticket_id || order.id?.slice(-6)?.toUpperCase() || '---',
    customerName: order.customer_name || 'Walk-in',
    customerPhone: order.customer_phone || '',
    itemCount: order.items?.length || 0,
    items: order.items?.map(i => i.name || i.service_name).join(', ') || '',
    dueDate: order.due_date ? formatDate(order.due_date) : 'TBD',
    notes: order.notes || ''
  }));

  return await window.electronPrint.printTagsBatch(tagsData);
};

// Print a custom tag with specific data
export const printCustomTag = async (tagData) => {
  if (!isElectron()) {
    console.warn('Print not available - not running in Electron');
    return { success: false, reason: 'Not in Electron app' };
  }

  return await window.electronPrint.printTag(tagData);
};

// Get print settings
export const getPrintSettings = async () => {
  if (!isElectron()) {
    return { success: false, reason: 'Not in Electron app' };
  }

  return await window.electronPrint.showPrintSettings();
};

// Set printer manually
export const setPrinter = async (printerName) => {
  if (!isElectron()) {
    return { success: false, reason: 'Not in Electron app' };
  }

  return await window.electronPrint.setPrinter(printerName);
};

// Get list of all printers
export const getAllPrinters = async () => {
  if (!isElectron()) {
    return [];
  }

  return await window.electronPrint.getPrinters();
};

// Set label size (for different Brother label types)
export const setLabelSize = async (width, height) => {
  if (!isElectron()) {
    return { success: false, reason: 'Not in Electron app' };
  }

  return await window.electronPrint.setLabelSize(width, height);
};

// Common Brother QL-800 label sizes
export const LABEL_SIZES = {
  ADDRESS_STANDARD: { width: 62, height: 29, name: 'Standard Address (DK-11209)' },
  ADDRESS_LARGE: { width: 62, height: 100, name: 'Large Address (DK-11202)' },
  SHIPPING: { width: 62, height: 100, name: 'Shipping (DK-11241)' },
  FILE_FOLDER: { width: 17, height: 87, name: 'File Folder (DK-11203)' },
  MULTI_PURPOSE: { width: 62, height: 29, name: 'Multi-Purpose (DK-11209)' },
  CONTINUOUS_62: { width: 62, height: 50, name: 'Continuous 62mm' },
  CONTINUOUS_29: { width: 29, height: 50, name: 'Continuous 29mm' }
};

// Helper to format date
const formatDate = (dateStr) => {
  if (!dateStr) return 'TBD';
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short'
  });
};

// Print preview (for debugging)
export const printPreview = async (tagData) => {
  // Generate preview HTML in console
  console.log('Print Preview:', tagData);
  return tagData;
};

export default {
  isElectron,
  initializePrinter,
  printOrderTag,
  printItemTag,
  printBatchTags,
  printCustomTag,
  getPrintSettings,
  setPrinter,
  getAllPrinters,
  setLabelSize,
  LABEL_SIZES,
  printPreview
};

/**
 * Printer Configuration Storage
 * Stores printer assignments in user data directory
 */

const { app } = require('electron');
const fs = require('fs');
const path = require('path');

// Config file path
const CONFIG_FILE = 'printer-assignments.json';

/**
 * Get the config file path
 * @returns {string} Full path to config file
 */
function getConfigPath() {
  const userDataPath = app.getPath('userData');
  return path.join(userDataPath, CONFIG_FILE);
}

/**
 * Default printer assignments
 */
const DEFAULT_ASSIGNMENTS = {
  receiptPrinter: null,    // Thermal printer for customer receipt & shop copy (Bixolon SRP-275III)
  dstubsPrinter: null,     // Dot-matrix printer for DStubs/garment tags (Bixolon 76mm)
  tagPrinter: null,        // Legacy - kept for backwards compatibility
  labelPrinter: null,      // Brother QL-800 for bag tags
  autoPrintReceipt: true,  // Auto-print receipt on order completion
  autoPrintShopCopy: true, // Auto-print shop copy on order completion
  autoPrintDstubs: false,  // Auto-print DStubs on order completion
  autoPrintTags: false,    // Legacy - kept for backwards compatibility
  autoPrintBagTags: false, // Auto-print bag tags when order is RECEIVED
  openDrawerOnPayment: true // Open cash drawer on payment
};

/**
 * Load printer assignments from config file
 * @returns {Object} Printer assignments
 */
function loadPrinterAssignments() {
  try {
    const configPath = getConfigPath();
    if (fs.existsSync(configPath)) {
      const data = fs.readFileSync(configPath, 'utf8');
      const assignments = JSON.parse(data);
      // Merge with defaults to ensure all fields exist
      return { ...DEFAULT_ASSIGNMENTS, ...assignments };
    }
  } catch (error) {
    console.error('Error loading printer assignments:', error);
  }
  return { ...DEFAULT_ASSIGNMENTS };
}

/**
 * Save printer assignments to config file
 * @param {Object} assignments - Printer assignments to save
 * @returns {{success: boolean, error?: string}}
 */
function savePrinterAssignments(assignments) {
  try {
    const configPath = getConfigPath();
    const data = JSON.stringify(assignments, null, 2);
    fs.writeFileSync(configPath, data, 'utf8');
    return { success: true };
  } catch (error) {
    console.error('Error saving printer assignments:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Update specific printer assignment
 * @param {string} key - Assignment key (receiptPrinter, tagPrinter, labelPrinter)
 * @param {string|null} value - Printer name or null to unassign
 * @returns {{success: boolean, assignments?: Object, error?: string}}
 */
function updatePrinterAssignment(key, value) {
  const assignments = loadPrinterAssignments();

  if (!(key in DEFAULT_ASSIGNMENTS)) {
    return { success: false, error: `Invalid assignment key: ${key}` };
  }

  assignments[key] = value;
  const result = savePrinterAssignments(assignments);

  if (result.success) {
    return { success: true, assignments };
  }
  return result;
}

/**
 * Get a specific printer assignment
 * @param {string} key - Assignment key
 * @returns {string|null} Printer name or null
 */
function getPrinterAssignment(key) {
  const assignments = loadPrinterAssignments();
  return assignments[key] || null;
}

/**
 * Clear all printer assignments
 * @returns {{success: boolean, error?: string}}
 */
function clearPrinterAssignments() {
  return savePrinterAssignments({ ...DEFAULT_ASSIGNMENTS });
}

/**
 * Check if a printer is assigned for a specific purpose
 * @param {string} purpose - 'receipt', 'tag', or 'label'
 * @returns {boolean}
 */
function hasPrinterAssigned(purpose) {
  const assignments = loadPrinterAssignments();
  const key = `${purpose}Printer`;
  return !!assignments[key];
}

module.exports = {
  loadPrinterAssignments,
  savePrinterAssignments,
  updatePrinterAssignment,
  getPrinterAssignment,
  clearPrinterAssignments,
  hasPrinterAssigned,
  DEFAULT_ASSIGNMENTS
};

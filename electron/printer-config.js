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
  openDrawerOnPayment: true, // Open cash drawer on payment
  // Printer profile mappings: { "Windows Printer Name": "profile-id" }
  printerProfiles: {}
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

/**
 * Get printer profile for a Windows printer
 * First checks manual assignment, then auto-detects based on printer name
 * @param {string} windowsPrinterName - Windows printer name
 * @returns {Object} Printer profile
 */
function getPrinterProfile(windowsPrinterName) {
  const { PRINTER_PROFILES, detectProfile, DEFAULT_PROFILE } = require('./printer-profiles');
  const assignments = loadPrinterAssignments();

  // Check for manually assigned profile
  const profileId = assignments.printerProfiles?.[windowsPrinterName];
  if (profileId && PRINTER_PROFILES[profileId]) {
    return PRINTER_PROFILES[profileId];
  }

  // Auto-detect based on printer name
  if (windowsPrinterName) {
    return detectProfile(windowsPrinterName);
  }

  return DEFAULT_PROFILE;
}

/**
 * Set printer profile for a Windows printer
 * @param {string} windowsPrinterName - Windows printer name
 * @param {string} profileId - Profile ID to assign
 * @returns {{success: boolean, error?: string}}
 */
function setPrinterProfile(windowsPrinterName, profileId) {
  const { PRINTER_PROFILES } = require('./printer-profiles');

  // Validate profile ID
  if (profileId && !PRINTER_PROFILES[profileId]) {
    return { success: false, error: `Invalid profile ID: ${profileId}` };
  }

  const assignments = loadPrinterAssignments();
  if (!assignments.printerProfiles) {
    assignments.printerProfiles = {};
  }

  if (profileId) {
    assignments.printerProfiles[windowsPrinterName] = profileId;
  } else {
    // Remove assignment to revert to auto-detection
    delete assignments.printerProfiles[windowsPrinterName];
  }

  return savePrinterAssignments(assignments);
}

/**
 * Get all printer profile mappings
 * @returns {Object} Map of printer name to profile ID
 */
function getPrinterProfileMappings() {
  const assignments = loadPrinterAssignments();
  return assignments.printerProfiles || {};
}

/**
 * Clear printer profile for a specific printer (revert to auto-detect)
 * @param {string} windowsPrinterName - Windows printer name
 * @returns {{success: boolean, error?: string}}
 */
function clearPrinterProfile(windowsPrinterName) {
  return setPrinterProfile(windowsPrinterName, null);
}

module.exports = {
  loadPrinterAssignments,
  savePrinterAssignments,
  updatePrinterAssignment,
  getPrinterAssignment,
  clearPrinterAssignments,
  hasPrinterAssigned,
  getPrinterProfile,
  setPrinterProfile,
  getPrinterProfileMappings,
  clearPrinterProfile,
  DEFAULT_ASSIGNMENTS
};

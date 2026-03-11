/**
 * Printer Hardware Profiles
 *
 * Contains ESC/POS commands and settings for specific printer models.
 * Similar to how the legacy MJBPrintSpooler.exe stored printer configurations
 * in a database with DelayBeforeCut and other printer-specific settings.
 */

/**
 * @typedef {Object} PrinterProfile
 * @property {string} id - Unique profile identifier
 * @property {string} name - Human-readable printer name
 * @property {'thermal' | 'dot_matrix'} type - Printer type
 * @property {number} paperWidth - Paper width in mm
 * @property {number} charsPerLine - Characters per line for this paper width
 * @property {number} delayBeforeCut - Lines to feed before cutting (CRITICAL - varies by printer)
 * @property {Object} commands - ESC/POS command bytes
 * @property {number[]} commands.init - Initialize printer
 * @property {number[]} commands.fullCut - Full cut command
 * @property {number[]} commands.partialCut - Partial cut (perforation)
 * @property {number[]} [commands.openDrawer] - Cash drawer command
 * @property {Object} textCommands - Text formatting commands
 */

const PRINTER_PROFILES = {
  // ============================================
  // Bixolon Printers
  // ============================================

  'bixolon-srp-275iii': {
    id: 'bixolon-srp-275iii',
    name: 'Bixolon SRP-275III',
    type: 'thermal',
    paperWidth: 80,
    charsPerLine: 42,
    delayBeforeCut: 5,  // Bixolon has ~5 line gap between print head and cutter
    commands: {
      init: [0x1B, 0x40],
      fullCut: [0x1D, 0x56, 0x00],
      partialCut: [0x1D, 0x56, 0x01],
      openDrawer: [0x1B, 0x70, 0x00, 0x19, 0xFA]
    },
    textCommands: {
      normalSize: [0x1B, 0x21, 0x00],
      doubleHeight: [0x1B, 0x21, 0x10],
      doubleWidth: [0x1B, 0x21, 0x20],
      doubleSize: [0x1B, 0x21, 0x30],
      boldOn: [0x1B, 0x45, 0x01],
      boldOff: [0x1B, 0x45, 0x00]
    }
  },

  'bixolon-dot-matrix': {
    id: 'bixolon-dot-matrix',
    name: 'Bixolon Dot-Matrix (76mm)',
    type: 'dot_matrix',
    paperWidth: 76,
    charsPerLine: 35,
    delayBeforeCut: 5,  // Same gap on Bixolon dot-matrix models
    commands: {
      init: [0x1B, 0x40],
      fullCut: [0x1D, 0x56, 0x00],
      partialCut: [0x1D, 0x56, 0x01]
    },
    textCommands: {
      normalSize: [0x1B, 0x21, 0x00],
      doubleHeight: [0x1B, 0x21, 0x10],
      doubleWidth: [0x1B, 0x21, 0x20],
      doubleSize: [0x1B, 0x21, 0x30],
      boldOn: [0x1B, 0x45, 0x01],
      boldOff: [0x1B, 0x45, 0x00]
    }
  },

  // ============================================
  // Epson Printers
  // ============================================

  'epson-tm-u300': {
    id: 'epson-tm-u300',
    name: 'Epson TM-U300 Series',
    type: 'dot_matrix',
    paperWidth: 76,
    charsPerLine: 40,
    delayBeforeCut: 8,  // Epson TM-U300 needs more feed lines
    commands: {
      init: [0x1B, 0x40],
      fullCut: [0x1B, 0x69],  // ESC i - legacy Epson cut
      partialCut: [0x1B, 0x6D]  // ESC m - legacy Epson partial cut
    },
    textCommands: {
      normalSize: [0x1B, 0x21, 0x01],
      doubleHeight: [0x1B, 0x21, 0x21],
      doubleWidth: [0x1B, 0x21, 0x21],
      doubleSize: [0x1B, 0x21, 0x31],
      boldOn: [0x1B, 0x45, 0x01],
      boldOff: [0x1B, 0x45, 0x00]
    }
  },

  'epson-tm-u210': {
    id: 'epson-tm-u210',
    name: 'Epson TM-U210 Series',
    type: 'dot_matrix',
    paperWidth: 76,
    charsPerLine: 40,
    delayBeforeCut: 5,  // TM-U210 has smaller gap
    commands: {
      init: [0x1B, 0x40],
      fullCut: [0x1B, 0x69],
      partialCut: [0x1B, 0x6D]
    },
    textCommands: {
      normalSize: [0x1B, 0x21, 0x01],
      doubleHeight: [0x1B, 0x21, 0x21],
      doubleWidth: [0x1B, 0x21, 0x21],
      doubleSize: [0x1B, 0x21, 0x31],
      boldOn: [0x1B, 0x45, 0x01],
      boldOff: [0x1B, 0x45, 0x00]
    }
  },

  'epson-tm-t88': {
    id: 'epson-tm-t88',
    name: 'Epson TM-T88 Series',
    type: 'thermal',
    paperWidth: 80,
    charsPerLine: 42,
    delayBeforeCut: 3,  // Modern thermal printers need less feed
    commands: {
      init: [0x1B, 0x40],
      fullCut: [0x1D, 0x56, 0x00],
      partialCut: [0x1D, 0x56, 0x01],
      openDrawer: [0x1B, 0x70, 0x00, 0x19, 0xFA]
    },
    textCommands: {
      normalSize: [0x1B, 0x21, 0x00],
      doubleHeight: [0x1B, 0x21, 0x10],
      doubleWidth: [0x1B, 0x21, 0x20],
      doubleSize: [0x1B, 0x21, 0x30],
      boldOn: [0x1B, 0x45, 0x01],
      boldOff: [0x1B, 0x45, 0x00]
    }
  },

  'epson-tm-l60': {
    id: 'epson-tm-l60',
    name: 'Epson TM-L60 II',
    type: 'thermal',
    paperWidth: 58,
    charsPerLine: 32,
    delayBeforeCut: 0,  // No cutter on this model
    commands: {
      init: [0x1B, 0x40],
      fullCut: [],  // No cutter
      partialCut: []  // No cutter
    },
    textCommands: {
      normalSize: [0x1B, 0x21, 0x00],
      doubleHeight: [0x1B, 0x21, 0x10],
      doubleWidth: [0x1B, 0x21, 0x20],
      doubleSize: [0x1B, 0x21, 0x30],
      boldOn: [0x1B, 0x45, 0x01],
      boldOff: [0x1B, 0x45, 0x00]
    }
  },

  // ============================================
  // Star Printers
  // ============================================

  'star-sp300': {
    id: 'star-sp300',
    name: 'Star SP 300/2000 Series',
    type: 'dot_matrix',
    paperWidth: 76,
    charsPerLine: 40,
    delayBeforeCut: 6,  // Star dot-matrix typical gap
    commands: {
      init: [0x1B, 0x40],
      fullCut: [0x1B, 0x64, 0x02],  // Star uses different cut sequence
      partialCut: [0x1B, 0x64, 0x03]
    },
    textCommands: {
      normalSize: [0x1B, 0x21, 0x00],
      doubleHeight: [0x1B, 0x21, 0x10],
      doubleWidth: [0x1B, 0x21, 0x20],
      doubleSize: [0x1B, 0x21, 0x30],
      boldOn: [0x1B, 0x45, 0x01],
      boldOff: [0x1B, 0x45, 0x00]
    }
  },

  'star-tsp100': {
    id: 'star-tsp100',
    name: 'Star TSP100 Series',
    type: 'thermal',
    paperWidth: 80,
    charsPerLine: 42,
    delayBeforeCut: 4,
    commands: {
      init: [0x1B, 0x40],
      fullCut: [0x1B, 0x64, 0x02],
      partialCut: [0x1B, 0x64, 0x03],
      openDrawer: [0x1B, 0x70, 0x00, 0x19, 0xFA]
    },
    textCommands: {
      normalSize: [0x1B, 0x21, 0x00],
      doubleHeight: [0x1B, 0x21, 0x10],
      doubleWidth: [0x1B, 0x21, 0x20],
      doubleSize: [0x1B, 0x21, 0x30],
      boldOn: [0x1B, 0x45, 0x01],
      boldOff: [0x1B, 0x45, 0x00]
    }
  },

  // ============================================
  // Citizen Printers
  // ============================================

  'citizen-ct-s310': {
    id: 'citizen-ct-s310',
    name: 'Citizen CT-S310',
    type: 'thermal',
    paperWidth: 80,
    charsPerLine: 42,
    delayBeforeCut: 4,
    commands: {
      init: [0x1B, 0x40],
      fullCut: [0x1D, 0x56, 0x00],
      partialCut: [0x1D, 0x56, 0x01],
      openDrawer: [0x1B, 0x70, 0x00, 0x19, 0xFA]
    },
    textCommands: {
      normalSize: [0x1B, 0x21, 0x00],
      doubleHeight: [0x1B, 0x21, 0x10],
      doubleWidth: [0x1B, 0x21, 0x20],
      doubleSize: [0x1B, 0x21, 0x30],
      boldOn: [0x1B, 0x45, 0x01],
      boldOff: [0x1B, 0x45, 0x00]
    }
  },

  // ============================================
  // Generic Fallbacks
  // ============================================

  'generic-thermal-80mm': {
    id: 'generic-thermal-80mm',
    name: 'Generic 80mm Thermal',
    type: 'thermal',
    paperWidth: 80,
    charsPerLine: 42,
    delayBeforeCut: 4,  // Safe default for most thermal printers
    commands: {
      init: [0x1B, 0x40],
      fullCut: [0x1D, 0x56, 0x00],
      partialCut: [0x1D, 0x56, 0x01],
      openDrawer: [0x1B, 0x70, 0x00, 0x19, 0xFA]
    },
    textCommands: {
      normalSize: [0x1B, 0x21, 0x00],
      doubleHeight: [0x1B, 0x21, 0x10],
      doubleWidth: [0x1B, 0x21, 0x20],
      doubleSize: [0x1B, 0x21, 0x30],
      boldOn: [0x1B, 0x45, 0x01],
      boldOff: [0x1B, 0x45, 0x00]
    }
  },

  'generic-thermal-58mm': {
    id: 'generic-thermal-58mm',
    name: 'Generic 58mm Thermal',
    type: 'thermal',
    paperWidth: 58,
    charsPerLine: 32,
    delayBeforeCut: 3,
    commands: {
      init: [0x1B, 0x40],
      fullCut: [0x1D, 0x56, 0x00],
      partialCut: [0x1D, 0x56, 0x01]
    },
    textCommands: {
      normalSize: [0x1B, 0x21, 0x00],
      doubleHeight: [0x1B, 0x21, 0x10],
      doubleWidth: [0x1B, 0x21, 0x20],
      doubleSize: [0x1B, 0x21, 0x30],
      boldOn: [0x1B, 0x45, 0x01],
      boldOff: [0x1B, 0x45, 0x00]
    }
  },

  'generic-dot-matrix': {
    id: 'generic-dot-matrix',
    name: 'Generic Dot-Matrix',
    type: 'dot_matrix',
    paperWidth: 76,
    charsPerLine: 35,
    delayBeforeCut: 5,
    commands: {
      init: [0x1B, 0x40],
      fullCut: [0x1D, 0x56, 0x00],
      partialCut: [0x1D, 0x56, 0x01]
    },
    textCommands: {
      normalSize: [0x1B, 0x21, 0x00],
      doubleHeight: [0x1B, 0x21, 0x10],
      doubleWidth: [0x1B, 0x21, 0x20],
      doubleSize: [0x1B, 0x21, 0x30],
      boldOn: [0x1B, 0x45, 0x01],
      boldOff: [0x1B, 0x45, 0x00]
    }
  },

  // USB Generic (from legacy MClean database)
  'usb-generic': {
    id: 'usb-generic',
    name: 'USB (Generic)',
    type: 'thermal',
    paperWidth: 80,
    charsPerLine: 42,
    delayBeforeCut: 2,  // Minimal delay for generic USB
    commands: {
      init: [0x1B, 0x40],
      fullCut: [0x1D, 0x56, 0x00],
      partialCut: [0x1D, 0x56, 0x01]
    },
    textCommands: {
      normalSize: [0x1B, 0x21, 0x00],
      doubleHeight: [0x1B, 0x21, 0x10],
      doubleWidth: [0x1B, 0x21, 0x20],
      doubleSize: [0x1B, 0x21, 0x30],
      boldOn: [0x1B, 0x45, 0x01],
      boldOff: [0x1B, 0x45, 0x00]
    }
  }
};

// Default profile when no match found
const DEFAULT_PROFILE_ID = 'generic-thermal-80mm';
const DEFAULT_PROFILE = PRINTER_PROFILES[DEFAULT_PROFILE_ID];

/**
 * Auto-detect printer profile based on Windows printer name
 * Uses keyword matching similar to legacy MJBPrintSpooler
 *
 * @param {string} printerName - Windows printer name
 * @returns {PrinterProfile} Matched profile or default
 */
function detectProfile(printerName) {
  if (!printerName) return DEFAULT_PROFILE;

  const nameLower = printerName.toLowerCase();

  // Bixolon detection
  if (nameLower.includes('bixolon') || nameLower.includes('srp')) {
    if (nameLower.includes('275')) {
      return PRINTER_PROFILES['bixolon-srp-275iii'];
    }
    // Default to dot-matrix for other Bixolon models
    return PRINTER_PROFILES['bixolon-dot-matrix'];
  }

  // Epson detection
  if (nameLower.includes('epson') || nameLower.includes('tm-')) {
    if (nameLower.includes('u300') || nameLower.includes('u-300') || nameLower.includes('tmu300')) {
      return PRINTER_PROFILES['epson-tm-u300'];
    }
    if (nameLower.includes('u210') || nameLower.includes('u-210') || nameLower.includes('tmu210')) {
      return PRINTER_PROFILES['epson-tm-u210'];
    }
    if (nameLower.includes('t88') || nameLower.includes('tm-t88')) {
      return PRINTER_PROFILES['epson-tm-t88'];
    }
    if (nameLower.includes('l60') || nameLower.includes('tm-l60')) {
      return PRINTER_PROFILES['epson-tm-l60'];
    }
    // Default to TM-T88 for unknown Epson thermal
    return PRINTER_PROFILES['epson-tm-t88'];
  }

  // Star detection
  if (nameLower.includes('star')) {
    if (nameLower.includes('sp300') || nameLower.includes('sp 300') || nameLower.includes('sp2000')) {
      return PRINTER_PROFILES['star-sp300'];
    }
    if (nameLower.includes('tsp') || nameLower.includes('tsp100')) {
      return PRINTER_PROFILES['star-tsp100'];
    }
    return PRINTER_PROFILES['star-tsp100'];
  }

  // Citizen detection
  if (nameLower.includes('citizen')) {
    return PRINTER_PROFILES['citizen-ct-s310'];
  }

  // Generic detection by paper width keywords
  if (nameLower.includes('58mm') || nameLower.includes('58 mm')) {
    return PRINTER_PROFILES['generic-thermal-58mm'];
  }

  // Thermal/Receipt keywords
  if (nameLower.includes('thermal') || nameLower.includes('receipt') || nameLower.includes('pos')) {
    return PRINTER_PROFILES['generic-thermal-80mm'];
  }

  // Dot-matrix keywords
  if (nameLower.includes('dot') || nameLower.includes('matrix') || nameLower.includes('impact')) {
    return PRINTER_PROFILES['generic-dot-matrix'];
  }

  // Default fallback
  return DEFAULT_PROFILE;
}

/**
 * Get profile by ID
 *
 * @param {string} profileId - Profile ID
 * @returns {PrinterProfile|null} Profile or null if not found
 */
function getProfileById(profileId) {
  return PRINTER_PROFILES[profileId] || null;
}

/**
 * Get all available profiles
 *
 * @returns {PrinterProfile[]} Array of all profiles
 */
function getAllProfiles() {
  return Object.values(PRINTER_PROFILES);
}

/**
 * Get profile summary for UI display
 *
 * @returns {Object[]} Array of profile summaries
 */
function getProfileSummaries() {
  return Object.values(PRINTER_PROFILES).map(p => ({
    id: p.id,
    name: p.name,
    type: p.type,
    paperWidth: p.paperWidth,
    charsPerLine: p.charsPerLine,
    delayBeforeCut: p.delayBeforeCut
  }));
}

/**
 * Create command buffer from profile command array
 *
 * @param {number[]} cmdArray - Array of command bytes
 * @returns {Buffer} Command buffer
 */
function commandToBuffer(cmdArray) {
  if (!cmdArray || cmdArray.length === 0) {
    return Buffer.alloc(0);
  }
  return Buffer.from(cmdArray);
}

/**
 * Get cut command from profile
 *
 * @param {PrinterProfile} profile - Printer profile
 * @param {'full' | 'partial'} cutType - Type of cut
 * @returns {Buffer} Cut command buffer
 */
function getCutCommand(profile, cutType = 'full') {
  const cmd = cutType === 'partial'
    ? profile?.commands?.partialCut
    : profile?.commands?.fullCut;

  return commandToBuffer(cmd);
}

/**
 * Get feed + cut sequence for a profile
 * This is the key function that replaces hardcoded feed values
 *
 * @param {PrinterProfile} profile - Printer profile
 * @param {'full' | 'partial'} cutType - Type of cut
 * @returns {Buffer} Feed and cut command sequence
 */
function getFeedAndCut(profile, cutType = 'full') {
  const parts = [];

  const delayBeforeCut = profile?.delayBeforeCut ?? DEFAULT_PROFILE.delayBeforeCut;

  // Feed command: ESC d n (feed n lines)
  if (delayBeforeCut > 0) {
    parts.push(Buffer.from([0x1B, 0x64, delayBeforeCut]));
  }

  // Cut command
  const cutCmd = getCutCommand(profile, cutType);
  if (cutCmd.length > 0) {
    parts.push(cutCmd);
  }

  return Buffer.concat(parts);
}

module.exports = {
  PRINTER_PROFILES,
  DEFAULT_PROFILE,
  DEFAULT_PROFILE_ID,
  detectProfile,
  getProfileById,
  getAllProfiles,
  getProfileSummaries,
  commandToBuffer,
  getCutCommand,
  getFeedAndCut
};

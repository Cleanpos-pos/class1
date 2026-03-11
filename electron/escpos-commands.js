/**
 * ESC/POS Command Builder for Thermal Printers
 * Supports Bixolon SRP-275III and compatible ESC/POS printers
 */

// ESC/POS Command Constants
const ESCPOS = {
  // Initialization
  INIT: Buffer.from([0x1B, 0x40]),

  // Text formatting
  BOLD_ON: Buffer.from([0x1B, 0x45, 0x01]),
  BOLD_OFF: Buffer.from([0x1B, 0x45, 0x00]),
  UNDERLINE_ON: Buffer.from([0x1B, 0x2D, 0x01]),
  UNDERLINE_OFF: Buffer.from([0x1B, 0x2D, 0x00]),

  // Text size
  NORMAL_SIZE: Buffer.from([0x1B, 0x21, 0x00]),
  DOUBLE_HEIGHT: Buffer.from([0x1B, 0x21, 0x10]),
  DOUBLE_WIDTH: Buffer.from([0x1B, 0x21, 0x20]),
  DOUBLE_SIZE: Buffer.from([0x1B, 0x21, 0x30]),
  FONT_B: Buffer.from([0x1B, 0x21, 0x01]), // Smaller font for dot-matrix

  // Alignment
  ALIGN_LEFT: Buffer.from([0x1B, 0x61, 0x00]),
  ALIGN_CENTER: Buffer.from([0x1B, 0x61, 0x01]),
  ALIGN_RIGHT: Buffer.from([0x1B, 0x61, 0x02]),

  // Paper control
  CUT_PAPER: Buffer.from([0x1D, 0x56, 0x00]),       // Full cut
  CUT_PARTIAL: Buffer.from([0x1D, 0x56, 0x01]),    // Partial cut (perforation)

  // Line feed
  NEWLINE: Buffer.from([0x0A]),

  // Cash drawer
  OPEN_DRAWER_PIN2: Buffer.from([0x1B, 0x70, 0x00, 0x19, 0xFA]),
  OPEN_DRAWER_PIN5: Buffer.from([0x1B, 0x70, 0x01, 0x19, 0xFA]),

  // Barcode commands
  BARCODE_HEIGHT: (height) => Buffer.from([0x1D, 0x68, height]),
  BARCODE_WIDTH: (width) => Buffer.from([0x1D, 0x77, width]),
  BARCODE_HRI_BELOW: Buffer.from([0x1D, 0x48, 0x02]),
  BARCODE_CODE128: Buffer.from([0x1D, 0x6B, 0x49]), // Code128 type

  // Codepage/Charset
  SELECT_CODEPAGE_PC437: Buffer.from([0x1B, 0x74, 0x00]), // PC437 (USA) - includes £ at 0x9C
  SELECT_CODEPAGE_CP850: Buffer.from([0x1B, 0x74, 0x02]), // PC850 (Multilingual)
  SET_CHARSET_UK: Buffer.from([0x1B, 0x52, 0x03]),        // UK Character set
};

// Helper function to create line feed
function feed(lines = 1) {
  return Buffer.from([0x1B, 0x64, lines]);
}

// Convert text to buffer with encoding
function text(str, encoding = 'utf8') {
  // Handle pound sign for ESC/POS (typically 0x9C in CP437/850)
  if (str.includes('£')) {
    const parts = [];
    const segments = str.split('£');
    for (let i = 0; i < segments.length; i++) {
      if (segments[i]) parts.push(Buffer.from(segments[i], 'utf8'));
      if (i < segments.length - 1) parts.push(Buffer.from([0x9C]));
    }
    return Buffer.concat(parts);
  }
  return Buffer.from(str, encoding);
}

// Create separator line
function separator(char = '-', width = 42) {
  return text(char.repeat(width) + '\n');
}

// Pad string for alignment (left item, right price)
function padLine(left, right, width = 42) {
  const padding = width - left.length - right.length;
  if (padding < 1) {
    // Truncate left side if too long
    const maxLeft = width - right.length - 1;
    return left.substring(0, maxLeft) + ' ' + right;
  }
  return left + ' '.repeat(padding) + right;
}

// Center text
function centerText(str, width = 42) {
  const padding = Math.floor((width - str.length) / 2);
  if (padding < 0) return str.substring(0, width);
  return ' '.repeat(padding) + str;
}

// Wrap text to width
function wrapText(str, width = 42) {
  const words = str.split(' ');
  const lines = [];
  let currentLine = '';

  for (const word of words) {
    if (currentLine.length + word.length + 1 <= width) {
      currentLine += (currentLine ? ' ' : '') + word;
    } else {
      if (currentLine) lines.push(currentLine);
      currentLine = word;
    }
  }
  if (currentLine) lines.push(currentLine);
  return lines;
}

/**
 * Build single DStub content (76mm) - NO INIT, used within batch
 * @param {Object} data - Tag data
 * @param {Object} [profile] - Printer profile for hardware-specific settings
 */
function buildGarmentTagContent(data, profile = null) {
  const {
    orderNumber = '',
    customerName = 'Walk-in',
    itemName = 'Item',
    dueDate = '',
    tagNumber = 1,
    totalTags = 1
  } = data;

  // Get printer-specific settings from profile or use defaults
  // Feed 6 lines before cut to clear print head to cutter gap
  const delayBeforeCut = profile?.delayBeforeCut ? profile.delayBeforeCut + 1 : 6;
  const partialCutCmd = profile?.commands?.partialCut
    ? Buffer.from(profile.commands.partialCut)
    : ESCPOS.CUT_PARTIAL;

  const parts = [];

  // Reset formatting - no extra spacing at top
  parts.push(ESCPOS.NORMAL_SIZE);
  parts.push(ESCPOS.BOLD_OFF);
  parts.push(ESCPOS.ALIGN_CENTER);

  // Line 1: ORDER # and POSITION - LARGE (same line)
  parts.push(ESCPOS.BOLD_ON);
  parts.push(ESCPOS.DOUBLE_SIZE);
  parts.push(Buffer.from(`#${orderNumber} ${tagNumber}/${totalTags}`));
  parts.push(ESCPOS.NORMAL_SIZE); // Revert size before newline to eliminate huge 2x gap
  parts.push(Buffer.from('\n'));

  // Line 2: ITEM NAME (bold, uppercase)
  parts.push(ESCPOS.BOLD_ON);
  parts.push(ESCPOS.DOUBLE_HEIGHT);
  parts.push(Buffer.from(itemName.toUpperCase().substring(0, 20)));
  parts.push(ESCPOS.NORMAL_SIZE); // Revert size before newline to eliminate 2x gap
  parts.push(Buffer.from('\n'));

  // Line 3: Customer name (BIGGER - double height)
  parts.push(ESCPOS.BOLD_OFF);
  parts.push(ESCPOS.DOUBLE_HEIGHT);
  parts.push(Buffer.from(customerName.substring(0, 24)));
  parts.push(ESCPOS.NORMAL_SIZE); // Reset before newline
  parts.push(Buffer.from('\n'));

  // Feed lines before cut (printer-specific - from profile or default 5 for Bixolon)
  parts.push(feed(delayBeforeCut));
  parts.push(partialCutCmd);

  return Buffer.concat(parts);
}

/**
 * Build single DStub content (40mm) - NO INIT, used within batch
 * @param {Object} data - Tag data
 * @param {Object} [profile] - Printer profile for hardware-specific settings
 */
function buildGarmentTagContent40mm(data, profile = null) {
  const {
    orderNumber = '',
    customerName = 'Walk-in',
    itemName = 'Item',
    tagNumber = 1,
    totalTags = 1
  } = data;

  // Get printer-specific settings from profile or use defaults
  // Feed 6 lines before cut to clear print head to cutter gap
  const delayBeforeCut = profile?.delayBeforeCut ? profile.delayBeforeCut + 1 : 6;
  const partialCutCmd = profile?.commands?.partialCut
    ? Buffer.from(profile.commands.partialCut)
    : ESCPOS.CUT_PARTIAL;

  const parts = [];

  // Reset formatting - no extra spacing at top
  parts.push(ESCPOS.NORMAL_SIZE);
  parts.push(ESCPOS.BOLD_OFF);
  parts.push(ESCPOS.ALIGN_CENTER);

  // Line 1: ORDER # and POSITION
  parts.push(ESCPOS.BOLD_ON);
  parts.push(ESCPOS.DOUBLE_HEIGHT);
  parts.push(Buffer.from(`#${orderNumber}`));
  parts.push(ESCPOS.NORMAL_SIZE); // Revert before newline
  parts.push(Buffer.from('\n'));

  parts.push(ESCPOS.DOUBLE_HEIGHT);
  parts.push(Buffer.from(`${tagNumber}/${totalTags}`));
  parts.push(ESCPOS.NORMAL_SIZE); // Revert before newline
  parts.push(Buffer.from('\n'));

  // Line 2: ITEM NAME (abbreviated)
  parts.push(ESCPOS.BOLD_ON);
  parts.push(Buffer.from(itemName.toUpperCase().substring(0, 12) + '\n'));

  // Line 3: Customer name (abbreviated, BIGGER)
  parts.push(ESCPOS.BOLD_OFF);
  parts.push(ESCPOS.DOUBLE_HEIGHT);
  parts.push(Buffer.from(customerName.substring(0, 12)));
  parts.push(ESCPOS.NORMAL_SIZE);
  parts.push(Buffer.from('\n'));

  // Feed lines before cut (printer-specific - from profile or default 5 for Bixolon)
  parts.push(feed(delayBeforeCut));
  parts.push(partialCutCmd);

  return Buffer.concat(parts);
}

/**
 * Build DStub (garment tag) for dot-matrix printer - standalone version with INIT
 * @param {Object} data - Tag data
 * @param {Object} [profile] - Printer profile for hardware-specific settings
 */
function buildGarmentTag(data, profile = null) {
  const parts = [];
  parts.push(ESCPOS.INIT);
  parts.push(ESCPOS.SELECT_CODEPAGE_PC437);
  parts.push(buildGarmentTagContent(data, profile));
  return Buffer.concat(parts);
}

/**
 * Build DStub for 40mm - standalone version with INIT
 * @param {Object} data - Tag data
 * @param {Object} [profile] - Printer profile for hardware-specific settings
 */
function buildGarmentTag40mm(data, profile = null) {
  const parts = [];
  parts.push(ESCPOS.INIT);
  parts.push(ESCPOS.SELECT_CODEPAGE_PC437);
  parts.push(buildGarmentTagContent40mm(data, profile));
  return Buffer.concat(parts);
}

/**
 * Build multiple garment tags as single buffer (76mm)
 * Single INIT at start, then all tags, final cut at end
 * @param {Object[]} tags - Array of tag data
 * @param {Object} [profile] - Printer profile for hardware-specific settings
 */
function buildGarmentTags(tags, profile = null) {
  // Get printer-specific cut command from profile
  const fullCutCmd = profile?.commands?.fullCut
    ? Buffer.from(profile.commands.fullCut)
    : ESCPOS.CUT_PAPER;

  const buffers = [];
  // INIT and charset only - content handles formatting
  buffers.push(ESCPOS.INIT);
  buffers.push(ESCPOS.SELECT_CODEPAGE_PC437);
  // Add all tag contents (pass profile for delayBeforeCut)
  tags.forEach(tag => buffers.push(buildGarmentTagContent(tag, profile)));
  // Final full cut (no extra feed - tags already have feed)
  buffers.push(fullCutCmd);
  return Buffer.concat(buffers);
}

/**
 * Build multiple garment tags for 40mm paper
 * Single INIT at start, then all tags, final cut at end
 * @param {Object[]} tags - Array of tag data
 * @param {Object} [profile] - Printer profile for hardware-specific settings
 */
function buildGarmentTags40mm(tags, profile = null) {
  // Get printer-specific cut command from profile
  const fullCutCmd = profile?.commands?.fullCut
    ? Buffer.from(profile.commands.fullCut)
    : ESCPOS.CUT_PAPER;

  const buffers = [];
  // INIT and charset only - content handles formatting
  buffers.push(ESCPOS.INIT);
  buffers.push(ESCPOS.SELECT_CODEPAGE_PC437);
  // Add all tag contents (pass profile for delayBeforeCut)
  tags.forEach(tag => buffers.push(buildGarmentTagContent40mm(tag, profile)));
  // Final full cut (no extra feed - tags already have feed)
  buffers.push(fullCutCmd);
  return Buffer.concat(buffers);
}

/**
 * Build customer receipt (42-char width for 80mm thermal)
 * Includes items with prices and totals
 * @param {Object} data - Receipt data
 * @param {Object} [profile] - Printer profile for hardware-specific settings
 */
function buildCustomerReceipt(data, profile = null) {
  const {
    storeName = 'Dry Cleaners',
    storeAddress = '',
    storePhone = '',
    orderNumber = '',
    customerName = 'Walk-in',
    date = new Date().toLocaleDateString(),
    time = new Date().toLocaleTimeString(),
    items = [],
    subtotal = 0,
    discount = 0,
    discountLabel = '',
    total = 0,
    paymentMethod = 'Cash',
    amountPaid = 0,
    change = 0,
    dueDate = '',
    notes = '',
    footer = 'Thank you for your business!'
  } = data;

  // Get printer-specific settings from profile
  const delayBeforeCut = profile?.delayBeforeCut ?? 6;
  const fullCutCmd = profile?.commands?.fullCut
    ? Buffer.from(profile.commands.fullCut)
    : ESCPOS.CUT_PAPER;

  const parts = [];
  const lineWidth = profile?.charsPerLine ?? 42; // Use profile or default 80mm thermal paper

  // Initialize - use PC437 for pound sign (0x9C), DON'T use UK charset (converts # to £)
  parts.push(ESCPOS.INIT);
  parts.push(ESCPOS.SELECT_CODEPAGE_PC437);
  parts.push(ESCPOS.ALIGN_CENTER);

  // Store header (Small but bold) - no extra spacing at top
  parts.push(ESCPOS.BOLD_ON);
  if (storeName.length > 20) {
    parts.push(ESCPOS.FONT_B); // Use smaller font if name is long
  }
  const storeLines = wrapText(storeName, storeName.length > 20 ? 56 : lineWidth);
  storeLines.forEach(line => parts.push(text(line + '\n')));
  parts.push(ESCPOS.NORMAL_SIZE);
  parts.push(ESCPOS.BOLD_OFF);

  // Store address & phone
  if (storeAddress) {
    const addressLines = wrapText(storeAddress, lineWidth);
    addressLines.forEach(line => parts.push(text(line + '\n')));
  }
  if (storePhone) {
    parts.push(text(`Tel: ${storePhone}\n`));
  }

  // Order info
  parts.push(ESCPOS.BOLD_ON);
  parts.push(text(`Order #${orderNumber}\n`));
  parts.push(ESCPOS.BOLD_OFF);
  parts.push(text(`${date} ${time}\n`));

  // Customer
  if (customerName && customerName !== 'Walk-in') {
    parts.push(text(`Customer: ${customerName}\n`));
  }

  // Due date
  if (dueDate) {
    parts.push(ESCPOS.BOLD_ON);
    parts.push(text(`Due: ${dueDate}\n`));
    parts.push(ESCPOS.BOLD_OFF);
  }

  parts.push(text('\n'));

  // Items with prices
  parts.push(ESCPOS.ALIGN_LEFT);
  items.forEach(item => {
    const name = item.name || item.item_name || item.service_name || 'Item';
    const qty = item.quantity || 1;
    const price = item.price || item.unit_price || 0;
    const lineTotal = qty * price;

    // Item name and quantity
    const itemLine = qty > 1 ? `${name} x${qty}` : name;
    const priceStr = `£${lineTotal.toFixed(2)}`;
    parts.push(text(padLine(itemLine, priceStr, lineWidth) + '\n'));

    // Item note if present
    if (item.note) {
      parts.push(text(`  > ${item.note.substring(0, lineWidth - 4)}\n`));
    }
  });

  parts.push(text('\n'));

  // Subtotal
  parts.push(text(padLine('Subtotal:', `£${subtotal.toFixed(2)}`, lineWidth) + '\n'));

  // Discount if applicable
  if (discount > 0) {
    const discountText = discountLabel || 'Discount';
    parts.push(text(padLine(discountText + ':', `-£${discount.toFixed(2)}`, lineWidth) + '\n'));
  }

  // Total
  parts.push(ESCPOS.BOLD_ON);
  parts.push(ESCPOS.DOUBLE_HEIGHT);
  parts.push(text(padLine('TOTAL:', `£${total.toFixed(2)}`, lineWidth) + '\n'));
  parts.push(ESCPOS.NORMAL_SIZE);
  parts.push(ESCPOS.BOLD_OFF);

  // Payment info
  if (amountPaid > 0) {
    parts.push(text(padLine(`${paymentMethod}:`, `£${amountPaid.toFixed(2)}`, lineWidth) + '\n'));
    if (change > 0) {
      parts.push(text(padLine('Change:', `£${change.toFixed(2)}`, lineWidth) + '\n'));
    }
  }

  // Notes
  if (notes) {
    parts.push(text('\n'));
    parts.push(ESCPOS.BOLD_ON);
    parts.push(text('Notes:\n'));
    parts.push(ESCPOS.BOLD_OFF);
    const noteLines = wrapText(notes, lineWidth);
    noteLines.forEach(line => parts.push(text(line + '\n')));
  }

  // Footer section
  parts.push(text('\n'));
  parts.push(ESCPOS.ALIGN_CENTER);
  parts.push(text(footer + '\n'));
  parts.push(text('\n'));

  // Feed lines before cut (printer-specific - from profile or default 6)
  parts.push(feed(delayBeforeCut));
  parts.push(fullCutCmd);

  return Buffer.concat(parts);
}

/**
 * Build shop copy (42-char width for 80mm thermal)
 * Same as customer receipt but WITHOUT prices
 * Includes customer contact info and notes
 * @param {Object} data - Shop copy data
 * @param {Object} [profile] - Printer profile for hardware-specific settings
 */
function buildShopCopy(data, profile = null) {
  const {
    storeName = 'Dry Cleaners',
    orderNumber = '',
    customerName = 'Walk-in',
    customerPhone = '',
    customerAddress = '',
    date = new Date().toLocaleDateString(),
    time = new Date().toLocaleTimeString(),
    items = [],
    itemCount = 0,
    dueDate = '',
    notes = '',
    staff = ''
  } = data;

  // Get printer-specific settings from profile
  // Shop copy needs more feed (11 lines) to ensure items don't get cut off
  const delayBeforeCut = profile?.delayBeforeCut ? profile.delayBeforeCut + 3 : 11;
  const fullCutCmd = profile?.commands?.fullCut
    ? Buffer.from(profile.commands.fullCut)
    : ESCPOS.CUT_PAPER;

  const parts = [];
  const lineWidth = profile?.charsPerLine ?? 42;

  // Initialize - no extra feeds at top
  parts.push(ESCPOS.INIT);
  parts.push(ESCPOS.SELECT_CODEPAGE_PC437);
  parts.push(ESCPOS.ALIGN_CENTER);

  // Header - start printing immediately
  parts.push(ESCPOS.DOUBLE_SIZE);
  parts.push(text('SHOP COPY\n'));
  parts.push(ESCPOS.NORMAL_SIZE);

  // Store header (Small but bold)
  parts.push(ESCPOS.BOLD_ON);
  if (storeName.length > 20) {
    parts.push(ESCPOS.FONT_B);
  }
  const storeLines = wrapText(storeName, storeName.length > 20 ? 56 : lineWidth);
  storeLines.forEach(line => parts.push(text(line + '\n')));
  parts.push(ESCPOS.NORMAL_SIZE);
  parts.push(ESCPOS.BOLD_OFF);

  // Order info (large)
  parts.push(ESCPOS.BOLD_ON);
  parts.push(ESCPOS.DOUBLE_SIZE);
  parts.push(text(`#${orderNumber}\n`));
  parts.push(ESCPOS.NORMAL_SIZE);
  parts.push(ESCPOS.BOLD_OFF);
  parts.push(text(`${date} ${time}\n`));

  // Customer section
  parts.push(ESCPOS.ALIGN_LEFT);
  parts.push(ESCPOS.BOLD_ON);
  parts.push(text('CUSTOMER:\n'));
  parts.push(ESCPOS.BOLD_OFF);
  parts.push(text(`${customerName}\n`));
  if (customerPhone) {
    parts.push(text(`Tel: ${customerPhone}\n`));
  }
  if (customerAddress) {
    const addressLines = wrapText(customerAddress, lineWidth);
    addressLines.forEach(line => parts.push(text(line + '\n')));
  }

  // Items (NO PRICES)
  parts.push(ESCPOS.BOLD_ON);
  parts.push(text(`ITEMS (${itemCount || items.length} pcs):\n`));
  parts.push(ESCPOS.BOLD_OFF);

  items.forEach((item, index) => {
    const name = item.name || item.item_name || item.service_name || 'Item';
    const qty = item.quantity || 1;
    const itemLine = qty > 1 ? `${index + 1}. ${name} x${qty}` : `${index + 1}. ${name}`;
    parts.push(text(itemLine.substring(0, lineWidth) + '\n'));

    // Item note if present
    if (item.note) {
      parts.push(text(`   > ${item.note.substring(0, lineWidth - 5)}\n`));
    }
  });

  // Due date
  if (dueDate) {
    parts.push(text('\n'));
    parts.push(ESCPOS.ALIGN_CENTER);
    parts.push(ESCPOS.BOLD_ON);
    parts.push(ESCPOS.DOUBLE_HEIGHT);
    parts.push(text(`DUE: ${dueDate}\n`));
    parts.push(ESCPOS.NORMAL_SIZE);
    parts.push(ESCPOS.BOLD_OFF);
  }

  // Notes section
  if (notes) {
    parts.push(text('\n'));
    parts.push(ESCPOS.ALIGN_LEFT);
    parts.push(ESCPOS.BOLD_ON);
    parts.push(text('NOTES:\n'));
    parts.push(ESCPOS.BOLD_OFF);
    const noteLines = wrapText(notes, lineWidth);
    noteLines.forEach(line => parts.push(text(line + '\n')));
  }

  // Staff
  if (staff) {
    parts.push(text('\n'));
    parts.push(text(`Staff: ${staff}\n`));
  }

  // Feed lines before cut (printer-specific - from profile or default 8)
  parts.push(feed(delayBeforeCut));
  parts.push(fullCutCmd);

  return Buffer.concat(parts);
}

function buildTestPrint(printerName = 'Thermal Printer', profile = null) {
  // Get printer-specific settings from profile
  const delayBeforeCut = profile?.delayBeforeCut ?? 4;
  const fullCutCmd = profile?.commands?.fullCut
    ? Buffer.from(profile.commands.fullCut)
    : ESCPOS.CUT_PAPER;
  const lineWidth = profile?.charsPerLine ?? 42;

  const parts = [];

  parts.push(ESCPOS.INIT);
  parts.push(ESCPOS.ALIGN_CENTER);

  parts.push(ESCPOS.DOUBLE_SIZE);
  parts.push(text('TEST PRINT\n'));
  parts.push(ESCPOS.NORMAL_SIZE);

  parts.push(text('\n'));
  parts.push(text(`Printer: ${printerName}\n`));
  if (profile) {
    parts.push(text(`Profile: ${profile.name}\n`));
    parts.push(text(`Feed before cut: ${profile.delayBeforeCut} lines\n`));
  }
  parts.push(text(`Time: ${new Date().toLocaleString()}\n`));
  parts.push(text('\n'));

  parts.push(separator('=', lineWidth));
  parts.push(text('Normal text\n'));
  parts.push(ESCPOS.BOLD_ON);
  parts.push(text('Bold text\n'));
  parts.push(ESCPOS.BOLD_OFF);
  parts.push(ESCPOS.DOUBLE_HEIGHT);
  parts.push(text('Double height\n'));
  parts.push(ESCPOS.DOUBLE_SIZE);
  parts.push(text('Double size\n'));
  parts.push(ESCPOS.NORMAL_SIZE);
  parts.push(separator('=', lineWidth));

  parts.push(text('\n'));
  parts.push(text('CleanPos - Posso One Suite\n'));
  parts.push(text('Printer test successful!\n'));

  // Feed lines before cut (printer-specific - from profile or default 4)
  parts.push(feed(delayBeforeCut));
  parts.push(fullCutCmd);

  return Buffer.concat(parts);
}

/**
 * Build cash drawer open command
 */
function buildOpenDrawer(pin = 2) {
  const parts = [];
  parts.push(ESCPOS.INIT);
  parts.push(pin === 5 ? ESCPOS.OPEN_DRAWER_PIN5 : ESCPOS.OPEN_DRAWER_PIN2);
  return Buffer.concat(parts);
}

/**
 * Build barcode for order lookup
 */
function buildBarcode(data, height = 60, width = 2) {
  const parts = [];

  parts.push(ESCPOS.ALIGN_CENTER);
  parts.push(ESCPOS.BARCODE_HEIGHT(height));
  parts.push(ESCPOS.BARCODE_WIDTH(width));
  parts.push(ESCPOS.BARCODE_HRI_BELOW);
  parts.push(ESCPOS.BARCODE_CODE128);

  // Code128 needs length byte + data
  const dataBuffer = Buffer.from(data);
  parts.push(Buffer.from([dataBuffer.length]));
  parts.push(dataBuffer);

  parts.push(text('\n'));

  return Buffer.concat(parts);
}

module.exports = {
  ESCPOS,
  text,
  feed,
  separator,
  padLine,
  centerText,
  wrapText,
  buildGarmentTag,
  buildGarmentTags,
  buildGarmentTag40mm,
  buildGarmentTags40mm,
  buildCustomerReceipt,
  buildShopCopy,
  buildTestPrint,
  buildOpenDrawer,
  buildBarcode
};

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
 * Build DStub (garment tag) for dot-matrix printer
 * Compact format: ORDER# and position on same line, both large
 * NO separator lines - clean minimal design
 */
function buildGarmentTag(data) {
  const {
    orderNumber = '',
    customerName = 'Walk-in',
    itemName = 'Item',
    colorValue = '',
    dueDate = '',
    tagNumber = 1,
    totalTags = 1
  } = data;

  const parts = [];

  // Initialize - use PC437 codepage (# displays correctly)
  parts.push(ESCPOS.INIT);
  parts.push(ESCPOS.SELECT_CODEPAGE_PC437);
  parts.push(ESCPOS.ALIGN_CENTER);
  parts.push(ESCPOS.BOLD_ON);

  // Feed at top - push content past the cutter from previous cut
  parts.push(feed(1));

  // Line 1: ORDER # and POSITION - LARGE (same line)
  parts.push(ESCPOS.DOUBLE_SIZE);
  parts.push(Buffer.from(`#${orderNumber} ${tagNumber}/${totalTags}\n`));
  parts.push(ESCPOS.NORMAL_SIZE);

  // Line 2: ITEM NAME (bold, uppercase)
  parts.push(ESCPOS.DOUBLE_HEIGHT);
  parts.push(Buffer.from(itemName.toUpperCase().substring(0, 20) + '\n'));
  parts.push(ESCPOS.NORMAL_SIZE);

  // Line 3: Customer name
  parts.push(ESCPOS.BOLD_OFF);
  parts.push(Buffer.from(customerName.substring(0, 24) + '\n'));

  // Line 4: Ready by date
  if (dueDate) {
    parts.push(Buffer.from(`Ready: ${dueDate}\n`));
  }

  // Feed at bottom before cut - clears cutter
  parts.push(feed(1));
  parts.push(ESCPOS.CUT_PARTIAL);

  return Buffer.concat(parts);
}

/**
 * Build multiple garment tags as single buffer
 * Each stub gets partial cut, final full cut at end
 */
function buildGarmentTags(tags) {
  const buffers = tags.map(tag => buildGarmentTag(tag));
  // Add final full cut after all stubs
  buffers.push(ESCPOS.CUT_PAPER);
  return Buffer.concat(buffers);
}

/**
 * Build customer receipt (42-char width for 80mm thermal)
 * Includes items with prices and totals
 */
function buildCustomerReceipt(data) {
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

  const parts = [];
  const lineWidth = 42; // 80mm thermal paper

  // Initialize
  parts.push(ESCPOS.INIT);
  parts.push(ESCPOS.SET_CHARSET_UK);
  parts.push(ESCPOS.SELECT_CODEPAGE_CP850);
  parts.push(ESCPOS.ALIGN_CENTER);

  // Store header (Small but bold)
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
  parts.push(text('\n'));

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

  // Separator
  parts.push(separator('=', lineWidth));

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

  // Separator
  parts.push(separator('-', lineWidth));

  // Subtotal
  parts.push(text(padLine('Subtotal:', `£${subtotal.toFixed(2)}`, lineWidth) + '\n'));

  // Discount if applicable
  if (discount > 0) {
    const discountText = discountLabel || 'Discount';
    parts.push(text(padLine(discountText + ':', `-£${discount.toFixed(2)}`, lineWidth) + '\n'));
  }

  // Total
  parts.push(separator('-', lineWidth));
  parts.push(ESCPOS.BOLD_ON);
  parts.push(ESCPOS.DOUBLE_HEIGHT);
  parts.push(text(padLine('TOTAL:', `£${total.toFixed(2)}`, lineWidth) + '\n'));
  parts.push(ESCPOS.NORMAL_SIZE);
  parts.push(ESCPOS.BOLD_OFF);

  // Payment info
  if (amountPaid > 0) {
    parts.push(separator('-', lineWidth));
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
  parts.push(separator('-', lineWidth));
  parts.push(ESCPOS.ALIGN_CENTER);
  parts.push(text(footer + '\n'));
  parts.push(text('\n'));

  // Feed adequately AFTER all content, then cut
  parts.push(feed(6));
  parts.push(ESCPOS.CUT_PAPER);

  return Buffer.concat(parts);
}

/**
 * Build shop copy (42-char width for 80mm thermal)
 * Same as customer receipt but WITHOUT prices
 * Includes customer contact info and notes
 */
function buildShopCopy(data) {
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

  const parts = [];
  const lineWidth = 42;

  // Initialize
  parts.push(ESCPOS.INIT);
  parts.push(ESCPOS.SELECT_CODEPAGE_PC437);
  parts.push(ESCPOS.ALIGN_CENTER);

  // Header
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
  parts.push(text('\n'));

  // Order info (large)
  parts.push(ESCPOS.BOLD_ON);
  parts.push(ESCPOS.DOUBLE_SIZE);
  parts.push(text(`#${orderNumber}\n`));
  parts.push(ESCPOS.NORMAL_SIZE);
  parts.push(ESCPOS.BOLD_OFF);
  parts.push(text(`${date} ${time}\n`));

  // Separator
  parts.push(separator('=', lineWidth));

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

  // Separator
  parts.push(separator('-', lineWidth));

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
    parts.push(separator('-', lineWidth));
    parts.push(ESCPOS.ALIGN_CENTER);
    parts.push(ESCPOS.BOLD_ON);
    parts.push(ESCPOS.DOUBLE_HEIGHT);
    parts.push(text(`DUE: ${dueDate}\n`));
    parts.push(ESCPOS.NORMAL_SIZE);
    parts.push(ESCPOS.BOLD_OFF);
  }

  // Notes section
  if (notes) {
    parts.push(separator('-', lineWidth));
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

  // Feed and cut
  parts.push(feed(4));
  parts.push(ESCPOS.CUT_PAPER);

  return Buffer.concat(parts);
}

/**
 * Build test print for printer verification
 */
function buildTestPrint(printerName = 'Thermal Printer') {
  const parts = [];
  const lineWidth = 42;

  parts.push(ESCPOS.INIT);
  parts.push(ESCPOS.ALIGN_CENTER);

  parts.push(ESCPOS.DOUBLE_SIZE);
  parts.push(text('TEST PRINT\n'));
  parts.push(ESCPOS.NORMAL_SIZE);

  parts.push(text('\n'));
  parts.push(text(`Printer: ${printerName}\n`));
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

  parts.push(feed(4));
  parts.push(ESCPOS.CUT_PAPER);

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
  buildCustomerReceipt,
  buildShopCopy,
  buildTestPrint,
  buildOpenDrawer,
  buildBarcode
};

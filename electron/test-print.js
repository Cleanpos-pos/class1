/**
 * Print Test Utility
 * Run directly without needing to log into the app
 *
 * Usage: node test-print.js [command]
 *
 * Commands:
 *   list          - List all Windows printers
 *   thermal       - List thermal printers only
 *   profiles      - Show all available printer profiles
 *   test [name]   - Send test print to printer
 *   receipt [name]- Print sample receipt
 *   shop [name]   - Print sample shop copy
 *   dstubs [name] - Print sample DStubs (3 tags)
 *   drawer [name] - Open cash drawer
 */

const windowsPrinter = require('./windows-printer');
const printerConfig = require('./printer-config');
const printerProfiles = require('./printer-profiles');
const escpos = require('./escpos-commands');

// Sample data for testing
const SAMPLE_ORDER = {
  storeName: 'Class 1 Dry Cleaners',
  storeAddress: '1 The Oval, Leicester, LE1 1AA',
  storePhone: '0116 123 4567',
  orderNumber: 'TEST1',
  customerName: 'Test Customer',
  customerPhone: '07700 900000',
  customerAddress: '123 Test Street, Leicester',
  date: new Date().toLocaleDateString('en-GB'),
  time: new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
  items: [
    { name: '2pc Suit', quantity: 1, price: 12.50, unit_price: 12.50 },
    { name: 'Shirt', quantity: 3, price: 7.50, unit_price: 2.50 },
    { name: 'Dress', quantity: 1, price: 8.00, unit_price: 8.00, note: 'Silk - handle with care' }
  ],
  itemCount: 5,
  subtotal: 28.00,
  discount: 0,
  total: 28.00,
  paymentMethod: 'Card',
  amountPaid: 28.00,
  change: 0,
  dueDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toLocaleDateString('en-GB'),
  notes: 'Customer prefers morning pickup',
  footer: 'Thank you for your business!',
  staff: 'Test Staff'
};

const SAMPLE_TAGS = [
  { orderNumber: 'TEST1', customerName: 'Test Customer', itemName: '2pc Suit', tagNumber: 1, totalTags: 3 },
  { orderNumber: 'TEST1', customerName: 'Test Customer', itemName: 'Shirt', tagNumber: 2, totalTags: 3 },
  { orderNumber: 'TEST1', customerName: 'Test Customer', itemName: 'Dress', tagNumber: 3, totalTags: 3 }
];

async function listPrinters() {
  console.log('\n=== All Windows Printers ===\n');
  const printers = await windowsPrinter.getWindowsPrinters();
  if (printers.length === 0) {
    console.log('No printers found');
    return;
  }
  printers.forEach((p, i) => {
    const profile = printerProfiles.detectProfile(p.name);
    console.log(`${i + 1}. ${p.name}`);
    console.log(`   Driver: ${p.driver || 'N/A'}`);
    console.log(`   Port: ${p.port || 'N/A'}`);
    console.log(`   Auto-detected profile: ${profile.name} (feed: ${profile.delayBeforeCut})`);
    console.log('');
  });
}

async function listThermalPrinters() {
  console.log('\n=== Thermal/Receipt Printers ===\n');
  const printers = await windowsPrinter.findThermalPrinters();
  if (printers.length === 0) {
    console.log('No thermal printers found');
    return;
  }
  printers.forEach((p, i) => {
    const profile = printerProfiles.detectProfile(p.name);
    console.log(`${i + 1}. ${p.name}`);
    console.log(`   Profile: ${profile.name}`);
    console.log(`   Type: ${profile.type}`);
    console.log(`   Paper: ${profile.paperWidth}mm (${profile.charsPerLine} chars)`);
    console.log(`   Feed before cut: ${profile.delayBeforeCut} lines`);
    console.log('');
  });
}

function showProfiles() {
  console.log('\n=== Available Printer Profiles ===\n');
  const profiles = printerProfiles.getProfileSummaries();
  profiles.forEach((p, i) => {
    console.log(`${i + 1}. ${p.id}`);
    console.log(`   Name: ${p.name}`);
    console.log(`   Type: ${p.type}`);
    console.log(`   Paper: ${p.paperWidth}mm (${p.charsPerLine} chars)`);
    console.log(`   Feed before cut: ${p.delayBeforeCut} lines`);
    console.log('');
  });
}

async function getDefaultPrinter() {
  const printers = await windowsPrinter.findThermalPrinters();
  if (printers.length > 0) {
    return printers[0].name;
  }
  const all = await windowsPrinter.getWindowsPrinters();
  if (all.length > 0) {
    return all[0].name;
  }
  return null;
}

async function testPrint(printerName) {
  if (!printerName) {
    printerName = await getDefaultPrinter();
    if (!printerName) {
      console.log('No printers found!');
      return;
    }
  }

  console.log(`\nSending test print to: ${printerName}`);
  const profile = printerConfig.getPrinterProfile(printerName);
  console.log(`Using profile: ${profile.name} (feed: ${profile.delayBeforeCut})`);

  const result = await windowsPrinter.testPrinter(printerName);
  console.log(result.success ? 'SUCCESS!' : `FAILED: ${result.error}`);
}

async function printReceipt(printerName) {
  if (!printerName) {
    printerName = await getDefaultPrinter();
    if (!printerName) {
      console.log('No printers found!');
      return;
    }
  }

  console.log(`\nPrinting sample RECEIPT to: ${printerName}`);
  const profile = printerConfig.getPrinterProfile(printerName);
  console.log(`Using profile: ${profile.name} (feed: ${profile.delayBeforeCut})`);

  const result = await windowsPrinter.printCustomerReceipt(printerName, SAMPLE_ORDER);
  console.log(result.success ? 'SUCCESS!' : `FAILED: ${result.error}`);
}

async function printShopCopy(printerName) {
  if (!printerName) {
    printerName = await getDefaultPrinter();
    if (!printerName) {
      console.log('No printers found!');
      return;
    }
  }

  console.log(`\nPrinting sample SHOP COPY to: ${printerName}`);
  const profile = printerConfig.getPrinterProfile(printerName);
  console.log(`Using profile: ${profile.name} (feed: ${profile.delayBeforeCut})`);

  const result = await windowsPrinter.printShopCopy(printerName, SAMPLE_ORDER);
  console.log(result.success ? 'SUCCESS!' : `FAILED: ${result.error}`);
}

async function printDstubs(printerName) {
  if (!printerName) {
    printerName = await getDefaultPrinter();
    if (!printerName) {
      console.log('No printers found!');
      return;
    }
  }

  console.log(`\nPrinting sample DSTUBS (${SAMPLE_TAGS.length} tags) to: ${printerName}`);
  const profile = printerConfig.getPrinterProfile(printerName);
  console.log(`Using profile: ${profile.name} (feed: ${profile.delayBeforeCut})`);

  const result = await windowsPrinter.printGarmentTags(printerName, SAMPLE_TAGS);
  console.log(result.success ? 'SUCCESS!' : `FAILED: ${result.error}`);
}

async function openDrawer(printerName) {
  if (!printerName) {
    printerName = await getDefaultPrinter();
    if (!printerName) {
      console.log('No printers found!');
      return;
    }
  }

  console.log(`\nOpening cash drawer via: ${printerName}`);
  const result = await windowsPrinter.openCashDrawer(printerName);
  console.log(result.success ? 'SUCCESS!' : `FAILED: ${result.error}`);
}

async function showCurrentAssignments() {
  console.log('\n=== Current Printer Assignments ===\n');
  const assignments = printerConfig.loadPrinterAssignments();
  console.log(`Receipt Printer: ${assignments.receiptPrinter || '(not set)'}`);
  console.log(`DStubs Printer:  ${assignments.dstubsPrinter || '(not set)'}`);
  console.log(`Label Printer:   ${assignments.labelPrinter || '(not set)'}`);
  console.log('');
  console.log('Auto-print settings:');
  console.log(`  Receipt:     ${assignments.autoPrintReceipt ? 'ON' : 'OFF'}`);
  console.log(`  Shop Copy:   ${assignments.autoPrintShopCopy ? 'ON' : 'OFF'}`);
  console.log(`  DStubs:      ${assignments.autoPrintDstubs ? 'ON' : 'OFF'}`);
  console.log(`  Cash Drawer: ${assignments.openDrawerOnPayment ? 'ON' : 'OFF'}`);
}

function showHelp() {
  console.log(`
=== Print Test Utility ===

Usage: node test-print.js [command] [printer-name]

Commands:
  list              List all Windows printers
  thermal           List thermal printers only
  profiles          Show all available printer profiles
  assignments       Show current printer assignments

  test [name]       Send test print to printer
  receipt [name]    Print sample customer receipt
  shop [name]       Print sample shop copy
  dstubs [name]     Print sample DStubs (3 tags)
  drawer [name]     Open cash drawer

If printer name is omitted, uses first available thermal printer.

Examples:
  node test-print.js list
  node test-print.js test "BIXOLON SRP-275III"
  node test-print.js dstubs
  node test-print.js shop
`);
}

// Main
async function main() {
  const args = process.argv.slice(2);
  const command = args[0]?.toLowerCase();
  const printerName = args.slice(1).join(' ') || null;

  switch (command) {
    case 'list':
      await listPrinters();
      break;
    case 'thermal':
      await listThermalPrinters();
      break;
    case 'profiles':
      showProfiles();
      break;
    case 'assignments':
      await showCurrentAssignments();
      break;
    case 'test':
      await testPrint(printerName);
      break;
    case 'receipt':
      await printReceipt(printerName);
      break;
    case 'shop':
      await printShopCopy(printerName);
      break;
    case 'dstubs':
    case 'tags':
      await printDstubs(printerName);
      break;
    case 'drawer':
      await openDrawer(printerName);
      break;
    case 'help':
    case '--help':
    case '-h':
      showHelp();
      break;
    default:
      if (command) {
        console.log(`Unknown command: ${command}`);
      }
      showHelp();
  }
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});

# XP Clean POS - Electron Desktop App

Desktop wrapper for XP Clean POS with Brother QL-800 label printing support.

## Quick Start

1. **Install Dependencies**
   ```bash
   cd electron
   npm install
   ```

2. **Run the App**
   ```bash
   npm start
   ```

3. **Build for Distribution**
   ```bash
   # Windows
   npm run build:win

   # macOS
   npm run build:mac
   ```

## Brother QL-800 Setup

### Printer Installation
1. Install the Brother QL-800 drivers from [Brother's website](https://support.brother.com)
2. Connect your QL-800 via USB
3. The app will auto-detect the printer on startup

### Supported Label Sizes
- **Standard Address (DK-11209)**: 62mm x 29mm (default)
- **Large Address (DK-11202)**: 62mm x 100mm
- **Shipping (DK-11241)**: 62mm x 100mm
- **File Folder (DK-11203)**: 17mm x 87mm
- **Continuous rolls**: Various sizes

## Using Print Tags in Your App

### Check if Running in Electron
```javascript
if (window.electronPrint?.isElectron) {
  // Print functionality available
}
```

### Print an Order Tag
```javascript
// From your React component
const printTag = async (order) => {
  if (window.electronPrint) {
    const result = await window.electronPrint.printTag({
      ticketNumber: order.pos_ticket_id || 'N/A',
      customerName: order.customer_name,
      customerPhone: order.customer_phone,
      itemCount: order.items.length,
      items: order.items.map(i => i.name).join(', '),
      dueDate: order.due_date,
      notes: order.notes
    });

    if (result.success) {
      console.log('Tag printed!');
    } else {
      console.error('Print failed:', result.error);
    }
  }
};
```

### Available API Methods

```javascript
// Get all printers
const printers = await window.electronPrint.getPrinters();

// Find Brother printer automatically
const result = await window.electronPrint.findBrotherPrinter();

// Set printer manually
await window.electronPrint.setPrinter('Brother QL-800');

// Print single tag
await window.electronPrint.printTag(tagData);

// Print multiple tags
await window.electronPrint.printTagsBatch([tagData1, tagData2]);

// Get print settings
const settings = await window.electronPrint.showPrintSettings();

// Set label size (width, height in mm)
await window.electronPrint.setLabelSize(62, 29);
```

## Tag Data Format

```javascript
const tagData = {
  ticketNumber: 'ABC123',      // Ticket/order ID
  customerName: 'John Doe',    // Customer name
  customerPhone: '07123456789',// Phone number
  itemCount: 5,                // Number of items
  items: 'Shirt, Trousers',    // Item list (truncated on label)
  dueDate: '25 Dec',           // Due date
  notes: 'Fragile'             // Special notes
};
```

## Development

Run with DevTools:
```bash
npm start -- --dev
```

## Troubleshooting

### Printer Not Found
1. Ensure Brother drivers are installed
2. Check USB connection
3. Use `getPrinters()` to see available printers
4. Manually set printer with `setPrinter('printer-name')`

### Labels Not Printing Correctly
1. Check label size matches your loaded labels
2. Use `setLabelSize(width, height)` to adjust
3. Ensure labels are properly loaded in the QL-800

## File Structure

```
electron/
├── main.js          # Electron main process
├── preload.js       # Secure bridge to web app
├── print-helper.js  # Helper functions for React
├── package.json     # Electron dependencies
└── README.md        # This file
```

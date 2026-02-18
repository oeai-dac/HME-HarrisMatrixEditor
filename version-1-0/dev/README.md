# HME – Harris Matrix Editor

A modern browser-based application built with React and Vite for creating, editing, and visualizing archaeological stratigraphic relationships using the Harris Matrix method.

**Version 1.0**


## Features

- **Node Management**: Create and edit stratigraphic units (SU) with different types (Layer, Deposit, Fill, Structure, Interface)
- **Relationship Editing**: Drag connections between units to establish stratigraphic relationships
- **Phase Management**: Organize units into chronological phases with drag-and-drop reordering
- **Object Grouping**: Group related units into objects with convex hull visualization
- **Auto-Layout**: Automatic arrangement of units based on phases and relationships
- **Validation**: Check for cycles, phase inconsistencies, isolated units, and other stratigraphic issues
- **AutoSave**: Automatic backup to browser localStorage every 30 seconds, with restore on reload
- **Import/Export**: 
  - JSON for data persistence
  - GraphML for yEd and other graph editors
  - GeoJSON for QGIS integration
  - SVG for publication-ready graphics

## Installation

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build
```

## Usage

### Basic Operations
- **Double-click** on canvas to create a new unit
- **Shift+drag** from one unit to another to create a relationship
- **Ctrl+click** to select multiple units
- **Ctrl+drag** to draw a selection rectangle
- **Mouse wheel** to zoom
- **Drag** on empty space to pan

### Keyboard Shortcuts
- `Ctrl+Z` – Undo
- `Ctrl+Y` – Redo
- `Ctrl+F` – Search
- `Delete` – Delete selected items
- `Escape` – Cancel current operation

### AutoSave
- Data is automatically saved to browser localStorage every 30 seconds
- On browser close, a confirmation dialog appears if there are unsaved changes
- On page reload, you'll be prompted to restore previously saved data
- Toggle AutoSave on/off using the indicator in the toolbar

## Requirements

- Node.js 18+ 
- Modern web browser (Chrome, Firefox, Safari, Edge)

## License

MIT License

## Author

Archaeotux

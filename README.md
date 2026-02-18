# HME — Harris Matrix Editor

A modern browser-based application for creating, editing, and visualizing archaeological stratigraphic relationships using the Harris Matrix method.

**Version 1.0** · Windows · macOS · Linux

![License](https://img.shields.io/badge/license-MIT-blue.svg)

## About

HME is a specialized tool for archaeologists to document and analyze the chronological sequence of stratigraphic units discovered during excavations. It provides an intuitive visual editor for building Harris Matrices — the standard method for representing archaeological stratigraphy.

## Features

- **Stratigraphic Units** — Create units with five types: Layer, Deposit, Fill, Structure, Interface
- **Relationship Editing** — Drag connections between units to establish stratigraphic relationships
- **Phase Management** — Organize units into chronological phases with drag-and-drop reordering
- **Object Grouping** — Group related units into objects with convex hull visualization
- **Auto-Layout** — Automatic arrangement based on phases and relationships with crossing minimization
- **Validation** — Check for cycles, phase inconsistencies, isolated units, and other stratigraphic issues
- **AutoSave** — Automatic backup to browser localStorage with restore on reload

## Import & Export

| Format | Purpose |
|--------|---------|
| JSON | Data persistence and backup |
| GraphML | Compatibility with yEd and other graph editors |
| GeoJSON | QGIS integration with coordinate support |
| SVG | Publication-ready vector graphics |

## Quick Start

- **Double-click** on canvas → Create new unit
- **Shift+drag** between units → Create relationship
- **Ctrl+click** → Multi-select
- **Mouse wheel** → Zoom
- **Drag** on empty space → Pan

### Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Ctrl+Z` | Undo |
| `Ctrl+Y` | Redo |
| `Ctrl+F` | Search |
| `Delete` | Delete selected |
| `Escape` | Cancel operation |

## Requirements

- Node.js 18+
- Modern web browser (Chrome, Firefox, Safari, Edge)

## License

MIT License

## Author

Archaeotux

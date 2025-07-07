# Contributing to ElevateLI

## Development Guide

### Directory Structure
```
elevateli-extension/
├── manifest.json         # Chrome extension manifest
├── src/
│   ├── background/      # Service worker
│   ├── content/         # Content scripts
│   │   ├── analyzer.js  # Built bundle (DO NOT EDIT)
│   │   ├── overlay.css  # Styles
│   │   └── modules/     # Source modules
│   ├── popup/           # Extension popup
│   └── images/          # Icons
└── build/               # Build scripts
```

### Building
```bash
cd build
node build-analyzer.js
```

This concatenates all modules into `src/content/analyzer.js`.

### Testing
1. Open Chrome and go to `chrome://extensions/`
2. Enable Developer mode
3. Click "Load unpacked"
4. Select the `elevateli-extension` folder

### Module Structure
- **core/** - Logger, cache manager
- **extractors/** - LinkedIn section extractors
- **scoring/** - Completeness and quality scoring
- **ui/** - Overlay management

### Key Files
- `analyzer-base.js` - Main analyzer orchestrator
- `analyzer-main.js` - Entry point
- `overlay-manager.js` - UI state management
- All extractors follow the pattern: scan() → extract() → extractDeep()

### Technical Notes
- Uses Manifest V3
- No ES6 modules (Chrome limitation)
- All code bundled into single file
- Anchor+sibling pattern for LinkedIn DOM

### Adding New Features
1. Create new module in appropriate directory
2. Add to build order in `build/build-analyzer.js`
3. Test thoroughly with LinkedIn profiles
4. Update documentation

### Code Style
- Use clear variable names
- Add JSDoc comments for functions
- Follow existing patterns
- Test edge cases

### Pull Request Guidelines
1. One feature per PR
2. Include test results
3. Update CHANGELOG.md
4. Ensure build passes
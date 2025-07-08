# Contributing to ElevateLI

Thank you for your interest in contributing! This guide covers development practices and Chrome Web Store requirements.

## Chrome Web Store Approval Guidelines

When developing features, ensure strict adherence to these policies:

### Manifest V3 Compliance (Required)
- **Service Workers Only**: All background logic must use Service Workers
- **No Remote Code**: All code must be bundled - no `eval()`, `new Function()`, or remote scripts
- **Declarative Net Request**: Use for network modifications when possible
- **Strict CSP**: Follow the default Content Security Policy

### Security Requirements
- **Never use innerHTML with user content** - Use DOM manipulation methods
- **Sanitize all inputs** - Prevent XSS attacks
- **Least privilege** - Request only necessary permissions
- **No obfuscation** - Keep code readable for review

### Privacy & Data Handling
- **Minimize data collection** - Only what's essential
- **Local processing** - User data stays in their browser
- **Transparency** - Clear disclosure of data usage
- **Secure API keys** - Encrypted storage only

### Red Flags to Avoid
- `eval()` or `new Function()` anywhere
- Fetching/executing external JavaScript
- Overly broad permissions (`<all_urls>`)
- Direct innerHTML with dynamic content
- Altering browser settings without consent

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

## Alpha Testing (v0.4.4)

### Current Focus Areas
- Experience section analysis accuracy
- AI recommendation quality
- Performance on various profile types
- Cache reliability

### How to Report Issues
1. Check console for errors (F12)
2. Note the profile structure (sections present)
3. Include AI provider used (OpenAI/Anthropic)
4. Screenshots help!

### Known Issues
- Extension context invalidated after reload (refresh page)
- Some JSON parsing errors (handled gracefully)
- Recommendations may need 2-3 seconds to display

### Testing Checklist
- [ ] Test on your own profile
- [ ] Test on a connection's profile
- [ ] Test with incomplete profiles
- [ ] Test cache behavior (7-day expiry)
- [ ] Test both AI providers
- [ ] Test error recovery
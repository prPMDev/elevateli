# Safe Version TODO

## Current Status
The existing `overlay-manager-safe.js` is NOT a proper port of `overlay-manager.js`. It has:
- Different UI structure
- Different collapsed view (missing proper score formatting, "Last Analyzed" text, etc.)
- Different element structure

## What Needs to Be Done

### 1. Create Proper Safe Version
When ready for Chrome Web Store submission, create a new safe version that:

1. **Maintains EXACT same UI** as development version
2. **Only changes DOM manipulation methods**:
   ```javascript
   // Development version:
   element.innerHTML = htmlString;
   
   // Safe version:
   this.dom.createElement() + appendChild()
   ```

3. **Keep all features identical**:
   - Same collapsed view: Logo | ElevateLI | Completeness: --% | Content Quality (AI): -- | Last Analyzed | Analyze | View details
   - Same expanded view structure
   - Same animations and transitions
   - Same state management

### 2. Conversion Process
1. Copy `overlay-manager.js` to `overlay-manager-safe-proper.js`
2. Add dom utilities at the top
3. Search and replace all innerHTML calls
4. Search and replace all insertAdjacentHTML calls
5. Test that UI looks identical
6. Only then replace the current safe version

### 3. Key Patterns to Convert

#### Collapsed View
```javascript
// Current (innerHTML):
<div class="overlay-collapsed-view">
  <img src="${iconUrl}" class="brand-logo" alt="ElevateLI" />
  <span class="brand-name">ElevateLI</span>
  <span class="score-badge completeness">Completeness: ${score}%</span>
  <span class="score-badge quality">Content Quality (AI): ${quality}</span>
  <div class="spacer"></div>
  <span class="last-analyzed-collapsed">${lastAnalyzed}</span>
  <button class="analyze-btn-collapsed">Analyze</button>
  <a href="#" class="view-details-link">View details</a>
</div>
```

Must maintain this exact structure using safe DOM methods.

### 4. Testing Checklist
- [ ] Collapsed view looks identical
- [ ] Expanded view looks identical
- [ ] All buttons work
- [ ] State transitions work
- [ ] No innerHTML usage
- [ ] No console errors
- [ ] Chrome Web Store compliance

## DO NOT USE current overlay-manager-safe.js as reference - it's a different implementation!
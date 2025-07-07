# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

ElevateLI is a Chrome extension that analyzes LinkedIn profiles providing two scores:
- **Completeness Score** (0-100%) - Calculated locally without AI
- **Content Quality Score** (1-10) - Requires user's own OpenAI/Anthropic API key

## Development Commands

- **Build**: `cd elevateli-extension/build && node build-analyzer.js` - Concatenates modular files into analyzer.js
- **Install**: Load unpacked extension from `elevateli-extension/` folder in Chrome
- **Test**: Visit any LinkedIn profile page after loading the extension
- **Debug**: Use Chrome DevTools console with debug utilities (see TESTING.md)

## Architecture Evolution (v0.4.0 - January 2025)

### Modular Architecture Refactor
After encountering duplicate module declaration errors from monolithic concatenation, the architecture was completely redesigned:

#### Previous Architecture (Monolithic)
- Single 6000+ line analyzer.js with everything bundled
- Difficult to maintain and debug
- Build script appending to existing file caused duplicate declarations

#### Current Architecture (Modular)
```
elevateli-extension/
├── src/
│   ├── content/
│   │   ├── analyzer.js         # Built bundle (DO NOT EDIT)
│   │   ├── overlay.css         # Styles
│   │   └── modules/
│   │       ├── analyzer-base.js    # Main orchestrator
│   │       ├── core/
│   │       │   ├── logger.js       # Enhanced logging
│   │       │   └── cache-manager.js # Cache utilities
│   │       ├── extractors/         # Section extractors
│   │       ├── scoring/            # Scoring logic
│   │       └── ui/                 # UI management
│   ├── background/
│   │   └── service-worker.js   # Background service worker
│   ├── popup/                  # Extension popup UI
│   └── images/                 # Icons
├── build/
│   └── build-analyzer.js       # Node.js build script
├── README.md                   # User documentation
├── CONTRIBUTING.md             # Developer guide
├── PRIVACY.md                  # Privacy policy
├── TERMS.md                    # Terms of service
├── LICENSE                     # MIT License
└── CHANGELOG.md                # Version history
```

### Key Files & Responsibilities
- `analyzer-base.js` - Orchestrates the three-phase extraction process
- `base-extractor.js` - Shared utilities for DOM manipulation and text extraction
- `logger.js` - Performance tracking, module-specific log levels, storage
- `overlay-manager.js` - Progressive UI states with real-time feedback

### Critical Architecture Lessons Learned
1. **Build Process** - Always clean before concatenating to avoid duplicates
2. **Module Pattern** - Use object literals, not ES6 modules (Manifest V3 constraint)
3. **Three-Phase Extraction** - scan() → extract() → extractDeep() for performance
4. **Error Recovery** - Retry with exponential backoff, graceful degradation
5. **Performance Tracking** - Built-in timing for every operation

### Recent Updates & Fixes

#### v0.4.1 - Profile Management & AI Debugging (January 2025)
- **✅ Manual Profile Setting** - Added "My Profile" section in popup to manually set your profile
- **✅ Profile Ownership Validation** - Checks for Edit Profile, Add Section, Analytics buttons
- **✅ Smart Confirmation** - Shows profile name and validation status before saving
- **✅ Verified Profile Indicator** - Shows checkmark (✓) for profiles with ownership verified
- **✅ Enhanced AI Logging** - Comprehensive logging to debug why recommendations are undefined
- **✅ Profile Auto-Detection** - Still works automatically when visiting `/in/me/`
- **✅ Profile Persistence** - Saved profile ID used for consistent caching across URL variations
- **Key Learnings**: 
  - Users need confirmation before setting profiles to prevent mistakes
  - Visual feedback about ownership verification builds trust
  - Checking for profile controls is reliable way to verify ownership

#### v0.3.4 - LinkedIn DOM Pattern Discovery (July 2025)
- **✅ Skills Extraction Fixed** - Custom section finder for anchor+sibling pattern (0 → 53 skills)
- **✅ Recommendations Fixed** - Same pattern applied successfully (0 → 10 recommendations)
- **✅ Certifications Fixed** - Multi-ID anchor checking implemented (0 → 2 certifications)
- **✅ DOM Pattern Documented** - LinkedIn uses anchor elements with content in siblings
- **Key Learning**: LinkedIn separates section anchors from content - check nextElementSibling!

#### v0.4.0 - Modular Architecture (January 2025)
- **✅ Complete Architecture Refactor** - Modular design with separate files for maintainability
- **✅ Progressive UI Implementation** - Real-time feedback during scan → extract → analyze phases
- **✅ Enhanced Error Recovery** - Retry logic with exponential backoff and graceful degradation
- **✅ Performance Monitoring** - Built-in timing for every operation with exportable metrics
- **✅ Debug Utilities** - Comprehensive testing tools for development (see debug-utils.js)

#### v0.3.3 - UI & Extraction Improvements (January 2025)
- **✅ Professional UI Redesign** - Visual gauges, card layouts, LinkedIn-inspired design system
- **✅ Complete Data Extraction** - Fixed "Show all" clicking for skills/experience (53 skills vs 4)
- **✅ Cache UX Improvement** - Shows cached results even when AI disabled
- **✅ DOM Security Complete** - All innerHTML replaced with safe DOM manipulation

## Chromium Extension UI Development Best Practices

### Security Requirements (Manifest V3)
1. **Never use innerHTML with user-generated content** - Always use DOM manipulation methods
2. **Content Security Policy** - Extension enforces strict CSP, no inline scripts allowed
3. **Message Passing** - Always return true for async chrome.runtime.onMessage handlers
4. **Safe Chrome APIs** - Check chrome.runtime.id before using Chrome APIs to prevent errors

### Code Organization
- Use clear section headers with consistent formatting
- Add table of contents for files over 1000 lines
- Group related functionality into named sections
- Use descriptive comments for complex logic

### UI Design System (v0.3.3)
- **Primary Color**: LinkedIn blue (#0a66c2)
- **Success**: Green (#057642)
- **Warning**: Yellow (#f59e0b)
- **Error**: Red (#dc2626)
- **Border Radius**: 6-8px throughout
- **Transitions**: 0.2s ease
- **Spacing**: 8px grid system
- **Typography**: -apple-system with font smoothing

## Common Development Tasks

### Adding New Extractors
1. Create new extractor file in `extension/content/extractors/` following the pattern:
   ```javascript
   const NewExtractor = {
     name: 'section_name',
     selectors: [
       'section[data-section="name"]',
       '#section-id',
       // Include anchor patterns
       '#section.pv-profile-card__anchor + div'
     ],
     
     async scan() { 
       // Check for LinkedIn's anchor+sibling pattern first!
       const anchor = document.querySelector('div#section.pv-profile-card__anchor');
       if (anchor) {
         // Check siblings for actual content
         let sibling = anchor.nextElementSibling;
         // ... iterate siblings
       }
       // Fallback to standard selection
     },
     
     async extract() { /* Basic extraction */ },
     async extractDeep() { /* Full extraction for AI */ }
   };
   ```
2. Add to analyzer.js extractors list in build script
3. Always check for anchor+sibling pattern (LinkedIn's common structure)
4. Handle multiple DOM structures as LinkedIn changes frequently

### Testing & Debugging
1. **Quick Diagnostics**: `eld.runDiagnostics()` in console
2. **Test Extractors**: `eld.testExtractors()`
3. **Force Analysis**: `eld.forceAnalysis({ clearCache: true })`
4. **Monitor Performance**: `eld.startPerformanceMonitor()`
5. See TESTING.md for comprehensive testing guide

### Performance Targets
- **Scan Phase**: ~50ms per section (parallel execution)
- **Extract Phase**: ~500ms total
- **AI Analysis**: 2-3s (sequential section analysis)
- **Full Analysis**: < 2s without AI, < 5s with AI

### Logging Strategy
The modular architecture includes an enhanced Logger with:
- **Module-specific log levels**: Set different verbosity per module
- **Performance tracking**: Automatic timing for all operations
- **Storage and export**: Logs stored in Chrome storage for debugging
- **Log management**: `Logger.export()`, `Logger.getSummary()`, `Logger.clear()`

Example usage:
```javascript
// Set module log level
Logger.setModuleLevel('AboutExtractor', 'DEBUG');

// Performance tracking
const perfId = Logger.startPerformance('my_operation');
// ... do work ...
await Logger.endPerformance(perfId, { extraData: 'value' });

// Export logs for analysis
const errorLogs = await Logger.export({ level: 'ERROR' });
```

## Key Implementation Details

### Scoring Systems
1. **Completeness Score** (ProfileCompletenessCalculator in analyzer.js)
   - Based on 800+ chars for About, 15+ skills, etc.
   - Shows detailed breakdown with missing elements
   
2. **Quality Score** (ProfileScoreCalculator in service-worker.js)
   - About (30%), Experience (30%), Skills (20%), Headline (10%), Others (5%)
   - Critical sections cap maximum score when missing (e.g., no About = max 7/10)

### Cache Strategy
- 7-day default cache (configurable 1-30 days)
- Cache key: profileId + content hash
- Manual refresh via "Analyze" button in popup
- Returns cached results even when AI is disabled

### AI Configuration
- Temperature: 0.1 for consistency
- Sequential analysis order: Photo→Headline→About→Experience→Skills
- Cost: ~$0.05 per full analysis (varies by model)
- Section analysis: ~$0.01-0.02 per section
- Batch section analysis: 30-40% cost savings vs individual calls
- Must have `enableAI: true` in storage to run
- Cached results shown even when AI disabled (UX improvement)

### Popup UI States
1. **AI Disabled**: Large completeness score, enable AI card, value proposition
2. **AI Enabled**: Dual scores, cache status with date, analyze button, AI toggle
3. **Progressive Disclosure**: Shows only relevant options based on state

## Known Issues & Gotchas

### LinkedIn DOM Changes
- **Anchor+Sibling Pattern**: LinkedIn separates section markers from content
  - Anchor: `div#skills.pv-profile-card__anchor` (just a marker)
  - Content: In `nextElementSibling` (or further siblings)
  - Always check siblings when section appears empty!
- **About Section**: Frequently changes selectors - BaseExtractor.findSection() tries multiple strategies
- **Compound Classes**: LinkedIn uses classes like `inline-show-more-text--is-collapsed`
  - Solution: Use `[class*="inline-show-more-text"]` selector
- **Hidden Text**: Actual text often in `span[aria-hidden="true"]` elements
- **Skills Variations**: Can show as "Skills (25)" or "25 skills" or just visible count
- **Experience Filtering**: Need to exclude navigation elements and duplicates
- **Show All Pattern**: Consistent "Show all N items" with `/details/<section>` URLs

### Architecture Constraints
- **Manifest V3 Limitations**:
  - No ES6 modules - must use object literals
  - No dynamic imports - everything concatenated
  - Service worker lifecycle - can be terminated anytime
- **Build Process**: Must clean analyzer.js before concatenating to avoid duplicates
- **Chrome APIs**: Always check `chrome.runtime.id` before using APIs
- **Performance**: Parallel operations in scan phase, sequential in AI phase

### Error Recovery Patterns
1. **Retry with Backoff**: Network and extraction failures retry 3x with exponential backoff
2. **Graceful Degradation**: Missing sections don't block analysis
3. **Cache Fallback**: Show cached results on any failure
4. **Minimal Extraction**: Last resort extracts just existence checks

## Progressive UI Implementation

The modular architecture implements progressive UI feedback as requested:

### UI States Flow
1. **INITIALIZING** → "Setting up analysis..."
2. **SCANNING** → Shows each section being scanned with real-time updates
3. **EXTRACTING** → "Extracting profile data..." with current section
4. **CALCULATING** → Shows completeness score with animation
5. **AI_ANALYZING** → "AI analyzing [section]..." with progress
6. **COMPLETE** → Final scores with recommendations
7. **ERROR** → Error message with recovery info

### Key UI Features
- **Real-time Progress**: Users see exactly what's happening
- **Section Counts**: Shows item counts during scanning (e.g., "Skills (25)")
- **Smooth Transitions**: State changes animate smoothly
- **LinkedIn Integration**: Appears as a native LinkedIn card, not floating
- **Responsive Design**: Works on mobile viewports

### Implementation Details
```javascript
// Progressive scan updates
overlay.updateScanProgress(sections.map(s => ({
  name: s,
  status: 'scanning', // pending | scanning | complete
  itemCount: 25
})));

// State transitions with data
overlay.setState(OverlayManager.states.CALCULATING, {
  completeness: 85
});
```

## Chromium Extension UI Development Best Practices (for 'extensions/' directory)

This project involves developing UI for a Chromium browser extension. Given the context of a "UI waste product" (implying agility and maintainability over extreme longevity, but avoiding technical debt) and strict adherence to **Manifest V3 (MV3)**, ensure the following principles are applied:

1.  **Manifest V3 Compliance is Paramount:**
    * **Service Workers for Background:** All background logic MUST run within a **Service Worker**. No persistent background pages. Understand its lifecycle (event-driven, wakes on events, goes idle).
    * **Declarative Net Request (DNR):** For network request blocking/modification, prefer `chrome.declarativeNetRequest` over `webRequest` API (blocking).
    * **No Remote Hosted Code:** All code must be bundled within the extension package. No `eval()`, `new Function()`, or dynamic remote code execution.
    * **Strict Content Security Policy (CSP):** Adhere to the default CSP. Avoid unsafe inline scripts/styles.

2.  **Strict Separation of Concerns (Modularity):**
    * **UI (Popup/Options/Content Scripts) vs. Service Worker:** Clearly separate UI rendering and interaction logic from the core extension logic in the Service Worker.
    * **One-Way Data Flow (Preferably):** UI components send messages to the Service Worker; the Service Worker handles logic and may send responses back.
    * **Component-Based UI:** If using a framework (React, Vue), design small, single-responsibility components.

3.  **Explicit Communication (Messaging is Key):**
    * **Use `chrome.runtime.sendMessage` & `chrome.tabs.sendMessage`:** All inter-script communication (Popup <-> Service Worker, Content Script <-> Service Worker) must use these APIs.
    * **Define Clear Message Formats:** Messages should always include an `action` or `type` field, and structured `payload` data.
    * **Asynchronous Handling:** All messaging is asynchronous. Use `async/await` for clear, readable message handling.
    * **Long-Lived Connections:** Use `chrome.runtime.connect` for persistent communication channels if frequent back-and-forth is needed.

4.  **Performance & Resource Efficiency:**
    * **Minimize UI Load Time:** Popup/options pages should load and render quickly.
    * **Efficient DOM Operations:** Batch updates, use `requestAnimationFrame` for animations.
    * **No Blocking in Service Worker:** Service Workers must not perform long-running synchronous tasks that block the event loop. Offload heavy work (e.g., via `postMessage` to dedicated workers, though less common in extensions).
    * **Optimize Storage Access:** Use `chrome.storage.local` for local persistent data. Understand its asynchronous nature and quotas.

5.  **Security (Crucial for Extensions):**
    * **Sanitize All Dynamic Content:** ANY data inserted into the DOM from user input or external sources **MUST BE SANITIZED** (e.g., using `DOMPurify`). **Never use `innerHTML` or `document.write` with untrusted data.**
    * **Avoid Inline Event Handlers/Styles in HTML:** Use `addEventListener` in JavaScript files.
    * **Content Script Isolation:** Understand that content scripts run in an isolated world from the main webpage. Direct access to webpage JS globals is limited.
    * **Least Privilege:** Request only the absolute minimum permissions in `manifest.json`. Explain why each permission is needed.
    * **No Obfuscation:** Chrome Web Store prefers readable code.

6.  **Maintainability & Readability:**
    * **Clean Code Principles:** Clear naming, small functions, single responsibility.
    * **Consistent Formatting:** Adhere to common JavaScript style guides (e.g., Airbnb, Google) and use a formatter (e.g., Prettier).
    * **Meaningful Comments:** Explain complex logic, architectural decisions, and especially any workarounds for MV3 or Chrome API quirks.
    * **Robust Error Handling:** Implement try/catch for asynchronous operations, messaging errors, and API failures.

7.  **Testing Strategy:**
    * **Unit Tests:** Focus on isolated logic in UI components and Service Worker functions.
    * **Integration Tests:** Test the communication flow between different parts of the extension (e.g., UI sending a message to Service Worker and receiving a response).

## Chrome Web Store Approval Guidelines (CRITICAL for publishing)

When developing any feature or code for this Chromium extension, ensure strict adherence to the following Chrome Web Store policies and best practices for approval:

1.  **Manifest V3 (MV3) Compliance (Non-Negotiable for New Submissions):**
    * **Always use MV3 API structures.** No Manifest V2 code.
    * **Background Service Workers:** All background logic must be in a Service Worker. Do NOT use persistent background pages. Manage Service Worker lifecycle for events carefully.
    * **Declarative Net Request (DNR):** For network request blocking/modification, utilize `chrome.declarativeNetRequest`. Avoid `webRequest` (blocking) if a DNR solution exists.
    * **No Remote Code:** All code must be bundled in the extension package. Absolutely no `eval()`, `new Function()`, or dynamic execution of remotely hosted code. This includes fetching and running scripts from external URLs.
    * **Content Security Policy (CSP):** Adhere to the default, strict MV3 CSP. Do not introduce violations. Avoid unsafe inline scripts/styles.

2.  **Purpose & Functionality (Single Purpose Policy):**
    * **Clear, Single Purpose:** The extension must have a single, clearly defined, and narrow purpose. Avoid bundling unrelated features.
    * **Deliver on Promise:** Ensure the extension delivers exactly what its listing description and screenshots claim. No hidden features.
    * **Not Misleading/Deceptive:** Do not mislead users about features, privacy, or security.

3.  **Privacy and Data Handling (User Data Policy):**
    * **Minimize Data Collection:** Only request and collect user data (Browse history, personal info, etc.) that is absolutely essential for the extension's stated purpose.
    * **Transparency:** Clearly disclose *what* data is collected, *why* it's collected, and *how* it's used/shared. This must be evident in the listing description and potentially a privacy policy linked in the store.
    * **Secure Handling:** Handle any collected data securely. Do not transmit sensitive user data over unencrypted connections (HTTP).
    * **Prompt for Permissions:** Permissions requested in `manifest.json` should align *exactly* with the stated purpose. Do not request broad permissions if a narrower one suffices. Explain permission needs to the user if complex.

4.  **Security:**
    * **Sanitization:** Strictly sanitize ALL user-provided or external content before displaying it in the DOM (e.g., to prevent XSS).
    * **No Malware/Adware:** The extension must not install malware, bundle unwanted software, or inject advertisements into webpages.
    * **No Unwanted Changes:** Do not alter browser settings (e.g., homepage, default search engine) without explicit, informed user consent.

5.  **User Experience:**
    * **Non-Obtrusive:** The extension should not interfere with normal Browse or provide an annoying user experience (e.g., excessive pop-ups, disruptive notifications).
    * **Performance Impact:** Minimize resource usage (CPU, memory) to avoid slowing down the user's browser.
    * **Clearly Labeled UI:** All buttons, fields, and UI elements should be clearly labeled and intuitive.

6.  **Transparency and Listing Compliance:**
    * **Accurate Listing:** Description, screenshots, and video (if any) must accurately represent the extension's functionality.
    * **No Keyword Stuffing:** Listing description should be natural and avoid excessive keywords.
    * **No Spam/Misleading Titles:** Titles should be descriptive and not contain promotional text or misleading claims.
    * **Support Information:** Provide a working support contact or website.

7.  **Intellectual Property and Abuse:**
    * **No Infringement:** Do not use copyrighted material, trademarks, or brand names without proper authorization.
    * **No Impersonation:** Do not impersonate Google products, other extensions, or well-known entities.

**Red Flag Patterns (Be Extremely Vigilant Against):**
* **`eval()` or `new Function()` anywhere in code.**
* **Fetching and executing `.js` files from external URLs.**
* **Overly broad permissions (e.g., `"<all_urls>"`) without clear, explicit justification.**
* **Direct insertion of unsanitized dynamic strings into `innerHTML`.**
* **Code that alters homepage, search engine, or injects unwanted ads.**
* **Obfuscated JavaScript (beyond standard build-tool minification) in the final package.**

## Refactored UX Principles & Design System for Chromium Extension UI
For all UI development and review within the 'extensions/' directory, strictly adhere to these principles. Our goal is maximum simplicity, ease of use, and rapid adoptability for job seekers, always prioritizing cognitive load reduction.

Extreme Clarity & User-First Simplicity:

Intuitive: Ensure every UI element and interaction is immediately understandable. Minimize user "thinking."

Essential Info Only: Display only critical information. Ruthlessly eliminate clutter and unnecessary options.

Clear Labeling: All UI text (buttons, inputs, messages) must be precise and unambiguous.

Strong Visual Hierarchy: Use size, color, and placement to guide attention to the most important actions and information.

Frictionless Flow & Efficiency:

Minimal Steps: Optimize core user journeys (analysis, feedback) to require the absolute fewest clicks/inputs.

Contextual Actions: Provide "next step" actions directly where content is displayed (e.g., clickable tips leading to LinkedIn sections or AI prompts).

Responsive Feedback: Implement immediate visual cues for loading, success, and errors.

Non-Intrusive & Seamless Integration:

Subtle Blending: UI should integrate harmoniously with LinkedIn's design. Avoid jarring elements.

Dismissible & Relevant Overlays: Overlays/injections must be non-blocking, easily dismissible, and appear only when directly relevant to the user's current context.

Prioritize In-Page: Prefer presenting info directly on the LinkedIn profile over forcing popups/tab switches, unless complexity truly demands it.

Trust, Transparency, & Control:

Secure API Key Mgmt: Ensure API key configuration is clear, secure, and includes privacy assurances.

AI Transparency: Clearly label AI-generated content (e.g., "AI-powered analysis").

User Control: Users must feel in command; provide clear options to manage features and data.

Actionable Feedback & Guided Experience:

Clear Status: Communicate loading, progress, success, and error states explicitly.

Actionable Insights: AI feedback must guide the user to concrete "next steps" (e.g., "Edit profile here," "Try this wording").

Concise Onboarding (FTUE): For new/returning users, provide immediate value and clear, minimal guidance on how to achieve core goals.

Consistency (Internal & External):

Internal Consistency: Maintain consistent naming, iconography, patterns, and styling across ALL extension UI elements (popup, overlay, dashboard, options).

External Harmony: Respect LinkedIn's UI/UX patterns without impersonating or deceiving.

Scalable Information Display & Progressive Disclosure:

Prioritized Lists: For "Missing" items or "Quick Improvements," initially display only the top 2-3 most impactful/easiest items.

Manage Long Lists: Use clear "Show More" buttons, scrollable areas, or collapsible sections for additional items to prevent clutter.

Transparent Prioritization: If using a prioritization logic, make it clear to the user (e.g., "Top 3 highest impact tips").

Optimal Whitespace & Visual Harmony:

Functional Whitespace: Use whitespace deliberately to group related content, improve scannability, and reduce visual density.

Consistent Spacing: Maintain a clear and consistent vertical rhythm and spacing between all UI elements.

Avoid Clutter: Design to prevent dense text blocks or cramped components, especially as content grows.

**Constraint for Claude:** "Adhere strictly to these defined UX principles. Propose minimal, impactful UI changes that enhance simplicity, ease, and adoptability. **Avoid excessive UI churn; prioritize iterative, well-reasoned improvements over frequent, unguided redesigns.**"

## Engineering Execution Principles (CRITICAL for Code Quality)

When performing any code generation, refactoring, or debugging, strictly adhere to these principles to prevent code bloat, maintain modularity, ensure functional stability, and minimize syntax errors.

1.  **Functional Stability During Changes:**
    * **Preserve Existing Behavior:** Any refactoring or bug fix MUST NOT alter the intended functionality or user experience unless explicitly instructed to do so.
    * **No Unintended Side Effects:** Ensure changes are localized and do not introduce new bugs or regressions.

2.  **Strict Modularity & Avoid Monoliths:**
    * **Small, Focused Units:** Always generate or refactor code into the smallest, most focused functions, components, or modules possible.
    * **Clear Boundaries:** Maintain clear separation of concerns between different parts of the code (e.g., UI, background logic, data extraction, analysis, API calls).
    * **Avoid Code Bloat:** Prioritize concise, efficient code. Do not generate large, undifferentiated blocks of code (monoliths).

3.  **Incremental & Reviewable Changes:**
    * **Atomic Changes:** Propose changes in the smallest logical units possible.
    * **Clear Diffs:** Ensure proposed changes are easy to review via diffs.
    * **Self-Correction:** If a generated change introduces syntax errors or breaks functionality, diagnose the *root cause* and propose a *minimal, surgical fix* rather than rewriting large sections.

4.  **Precision in Debugging:**
    * **Diagnose First:** When presented with an error, first focus on *diagnosing the root cause* and explaining it.
    * **Surgical Fixes:** Only propose the most minimal, targeted code changes necessary to resolve the identified bug, without altering surrounding functional logic.

## Lessons Learned from Modular Refactor

### What Went Wrong (Anti-patterns to Avoid)
1. **Appending to Existing Files**: Build script was concatenating onto analyzer.js causing duplicates
2. **Monolithic Design**: 6000+ line single file was unmaintainable
3. **Missing Error Context**: No performance tracking made debugging difficult
4. **Tight Coupling**: Extractors were embedded in main logic

### What Went Right (Patterns to Follow)
1. **Clean Build Process**: Always start fresh when concatenating
2. **Three-Phase Extraction**: scan() → extract() → extractDeep() optimizes performance
3. **Parallel Scanning**: All sections scan simultaneously for speed
4. **Progressive UI**: Real-time feedback keeps users engaged
5. **Error Recovery**: Retry logic with graceful degradation
6. **Performance Monitoring**: Built-in timing for every operation

### Architecture Best Practices
1. **Single Responsibility**: Each module does one thing well
2. **Shared Utilities**: BaseExtractor provides common DOM operations
3. **Configurable Logging**: Module-specific log levels for targeted debugging
4. **Defensive Coding**: Check for DOM elements before accessing
5. **Future-Proof Design**: Easy to add new extractors or modify existing ones

## UX Design Learnings (v0.4.1 - January 2025)

### Key Principles Applied
1. **Remove Redundancy**: Don't duplicate functionality (removed Analyze button from popup)
2. **Progressive Disclosure**: Hide complexity until needed (AI settings disabled when toggle is off)
3. **Clear Visual Hierarchy**: Primary → Secondary → Tertiary actions
4. **Error Prevention**: Make dangerous actions hard to access (Reset Extension as small text link)
5. **Avoid Brand Impersonation**: Use similar but distinct colors from LinkedIn

### Successful Design Patterns

#### 1. **In-Extension Confirmations**
- Browser alerts/confirms feel jarring and unprofessional
- Custom confirmation dialogs maintain context and brand consistency
- Implementation: Overlay with fade-in animation and clear Yes/No buttons

#### 2. **Conditional UI States**
```css
.ai-config.disabled {
  opacity: 0.5;
  pointer-events: none;
}
```
- Visual feedback shows what's inactive
- Overlay message explains why ("Enable AI to configure settings")
- Smooth transitions between states

#### 3. **Action Hierarchy**
- **Primary (Blue Button)**: Save Settings - Most common action
- **Secondary (Gray Outline)**: Reset Analysis - Less common but safe
- **Tertiary (Text Link)**: Reset Extension - Rare and destructive

#### 4. **Smart Validation**
- Only validate AI settings when AI is enabled
- Show inline errors instead of popups
- Test API keys in real-time with visual feedback

#### 5. **Responsive Feedback**
```javascript
button.textContent = '✓ Settings Saved';
button.classList.add('success');
// Revert after 2 seconds
```
- Immediate confirmation of actions
- Temporary success states
- Clear error messages

### UX Anti-Patterns Avoided
1. **Hidden Critical Settings**: Role/Level only matter for AI, so moved them there
2. **Unclear Reset Options**: Split into two distinct actions with clear descriptions
3. **Jarring Popups**: All interactions stay within extension UI
4. **Accidental Destructive Actions**: Factory reset requires double confirmation
5. **Confusing Jargon**: Removed "from cache" and technical timestamps

### Color Palette Strategy
- **Original LinkedIn Blue**: #0a66c2 
- **Our Primary Blue**: #0856a0 (Distinct but complementary)
- **Success Green**: #0a7c4a
- **Danger Red**: #d93025
- **Neutral Gray**: #5f6368

This prevents brand confusion while maintaining professional appearance.

### Popup Dimensions
- **Old**: 280px (cramped)
- **New**: 340px (comfortable)
- Provides space for:
  - Proper button layouts
  - In-popup confirmations
  - Better readability

### Key Takeaway
Good UX is about reducing cognitive load. Every decision should make the user's path clearer, not add options for the sake of flexibility.

## Project Reorganization (July 2025)

### Context
The project was reorganized from `LinkedIn-Optimizer-BYOAI` to prepare for renaming to `elevateli`. This section documents the reorganization to maintain continuity when the root folder is renamed.

### Project Timeline
- **Started**: June 30, 2025
- **Reorganization**: July 7, 2025
- **Duration**: 1 week of intensive development

### Directory Structure After Reorganization
```
LinkedIn-Optimizer-BYOAI/ (to be renamed to elevateli/)
├── elevateli-extension/    # Clean, production-ready extension
│   ├── src/               # Source code
│   ├── build/             # Build scripts
│   ├── README.md          # User documentation
│   ├── PRIVACY.md         # Privacy policy
│   ├── TERMS.md           # Terms of service
│   ├── LICENSE            # MIT License
│   └── CONTRIBUTING.md    # Developer guide
├── archive/               # Historical files preserved
│   ├── backups/          # Old analyzer versions
│   ├── experiments/      # Experimental code
│   └── old-docs/         # Historical documentation
├── docs/                  # Project documentation
├── documentation/         # Additional docs (AI plans)
├── scratch/              # Private working files (gitignored)
│   └── old-docs/         # delete-* files moved here
├── future/               # Planned features
├── extension/            # OLD - to be removed after verification
├── CLAUDE.md             # This file
├── README.md             # Root project README
├── CHANGELOG.md          # Detailed version history
└── .gitignore            # Git configuration
```

### Key Changes Made
1. **Created `elevateli-extension/`** - Clean extension with 36 active files
2. **Reorganized file structure** - Proper src/, build/, docs/ separation
3. **Updated all paths** - manifest.json and build scripts point to new locations
4. **Added legal documents** - PRIVACY.md, TERMS.md, LICENSE for Chrome Web Store
5. **Moved private files to scratch/** - delete-* documentation files
6. **Renamed -fixed files** - Removed -fixed suffix from cache-manager, etc.

### Files Migrated (36 Active Files)
All files identified by build-analyzer.js were successfully migrated to elevateli-extension/

### AI Implementation Status (v0.4.2 - January 7, 2025)

#### ✅ Fixed Issues
- **AI Analysis Communication** - Fixed message handler mismatch between content script and service worker
  - Content script sends: `{ action: 'analyzeWithAI', data: extractedData, settings: {...} }`
  - Service worker was expecting: `{ profileId, profileData, sectionData }`
  - Now properly extracts data from either structure
- **Enhanced Error Logging** - Added detailed logging throughout AI analysis flow
- **API Key Handling** - Service worker now properly decrypts API keys

#### Implementation Details
The AI analysis flow:
1. Content script extracts profile data via three-phase process
2. Sends `analyzeWithAI` message with extracted data
3. Service worker receives and validates AI configuration
4. Calls OpenAI/Anthropic API with full profile analysis prompt
5. Returns structured JSON with scores, recommendations, and insights
6. Results cached for 7 days based on content hash

#### Known Limitations
- Full profile analysis in single API call (not section-by-section yet)
- No progress updates during AI analysis
- Rate limiting is basic (could be enhanced)

#### Next Steps
- Test AI analysis with real API keys
- Implement section-by-section analysis for better granularity
- Add progress indicators during analysis
- Enhance rate limiting with provider-specific logic
   - Expand to other sections incrementally
   - Initialize git repository

### Important Notes for Continuity
- The extension is now in `elevateli-extension/` folder
- Old `extension/` folder can be deleted after verification
- All active development should happen in `elevateli-extension/`
- Build command: `cd elevateli-extension/build && node build-analyzer.js`
- Test by loading `elevateli-extension/` folder in Chrome

### What Was NOT Migrated
- Test files (test-panel.html, test-popup.html)
- Debug documentation (DEBUG_STATUS.md, TESTING.md)
- Old build scripts (build.ps1, build.sh in content/)
- Experimental modules (profileExtractor.js, uiComponents.js)

These files remain in the old `extension/` folder for reference.
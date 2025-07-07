# Changelog

All notable changes to the ElevateLI Chrome Extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.3.4] - 2025-07-06

### Fixed
- **Critical Fix: Skills Extraction** - Implemented custom section finder that properly identifies skills section at sibling 1 instead of 0
  - Now correctly extracts 53 total skills (was returning 0)
  - Added debug logging to trace sibling traversal
  - Pattern: `div#skills.pv-profile-card__anchor` → check siblings for actual content

- **Critical Fix: Recommendations Extraction** - Applied same custom section finder pattern
  - Now correctly extracts 10 recommendations (was returning 0)
  - Checks siblings for sections with "Show all" links and recommendation items
  - Pattern: `div#recommendations.pv-profile-card__anchor` → iterate siblings

- **Critical Fix: Certifications Extraction** - Extended custom section finder for multiple anchor IDs
  - Now correctly extracts certification counts
  - Checks multiple IDs: `licenses_and_certifications`, `certifications`, `licenses-and-certifications`
  - Pattern: Multiple anchor IDs → check siblings for certification content

### Changed
- **BaseExtractor Enhancement** - Improved section finding logic
  - Now skips anchor elements when using standard selectors
  - Better sibling checking for skills/recommendations sections
  - Enhanced "Show all" text pattern matching

- **Analyzer Size** - Bundle size increased from ~240KB to ~245KB due to enhanced extractors

### Technical Details
- LinkedIn's DOM structure places content in siblings of anchor elements, not children
- Anchor element (sibling 0) typically contains only the header
- Actual content (skills, recommendations, etc.) is in sibling 1 or later
- Pattern is consistent: `"Show all n <section>"` with `/details/<section>` URLs

## [0.3.3] - 2025-01-05

### Added
- Professional UI redesign with visual gauges and card layouts
- Simplified LinkedIn overlay with clean single-line view
- Complete data extraction with "Show all" clicking for skills/experience
- Timestamp display with ISO and numeric format handling
- Dashboard enhancements with visual score gauges
- Section analysis UI with hover states
- Export functionality (PDF and CSV)
- Batch analysis for cost savings
- Cache UX improvements

### Fixed
- Service worker URL handling
- DOM security (replaced all innerHTML with safe DOM manipulation)
- Empty cache validation
- Button responsiveness issues

## [0.3.2] - 2024-12-15

### Added
- Initial release with core functionality
- Completeness score calculation
- AI-powered content quality scoring
- Chrome extension manifest V3 support
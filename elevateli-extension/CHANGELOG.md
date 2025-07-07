# Changelog

All notable changes to ElevateLI will be documented in this file.

## [0.3.4] - July 2025

### Improved
- Profile analysis now captures ALL skills, recommendations, and certifications (previously missed many)
- More accurate completeness scoring based on full profile data
- Better detection of LinkedIn's profile sections

### Fixed
- Skills section now shows all skills instead of just the first few
- Recommendations are now properly counted and analyzed
- Certifications display correctly in the analysis

## [0.3.3] - January 2025

### New Features
- Beautiful new visual design with progress gauges
- Export your analysis results as PDF or CSV
- Batch analysis mode for faster, cheaper AI processing
- "Show all" buttons automatically expand to capture complete profile data

### Improved
- Cleaner integration with LinkedIn's interface
- Better timestamp handling for "Last analyzed" dates
- Cache system now shows previous results even when AI is disabled
- More detailed section-by-section breakdowns

### Fixed
- API key storage is now more reliable
- Better error messages when something goes wrong
- Improved compatibility with different LinkedIn profile layouts

## [0.3.2] - December 2024

### Initial Release
- Completeness score (0-100%) - works without API key
- AI-powered content quality score (1-10) - requires OpenAI or Anthropic API key
- Section-by-section analysis and recommendations
- Smart 7-day caching to reduce API costs
- Support for both OpenAI and Anthropic AI providers
- Clean, non-intrusive overlay on LinkedIn profiles
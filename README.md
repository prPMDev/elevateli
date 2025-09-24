# ElevateLI

[![License](https://img.shields.io/badge/license-MIT-green)](LICENSE)
[![Version](https://img.shields.io/badge/version-1.0.0-blue)](https://github.com/prPMDev/elevateli/releases/tag/v1.0.0)

Chrome extension for LinkedIn profile analysis and optimization using AI-powered recommendations.

## Overview

ElevateLI analyzes LinkedIn profiles to provide completeness scoring and actionable feedback. The extension processes data locally and optionally integrates with OpenAI or Anthropic APIs for enhanced analysis.

## Features

- Real-time profile completeness analysis (0-100% scoring)
- AI-powered optimization recommendations (OpenAI GPT-4 or Anthropic Claude)
- Local data processing with no external data transmission
- Chrome Web Store compliant implementation
- Manifest V3 native architecture

## Installation

### Chrome Web Store
Visit the Chrome Web Store and search for "ElevateLI" (pending approval)

### Developer Installation
```bash
git clone https://github.com/prPMDev/elevateli.git
cd elevateli
# Load 'elevateli-extension/' as unpacked extension in Chrome Developer Mode
```

## Technical Implementation

- **Architecture**: Modular content script system with service worker background processing
- **Security**: CSP compliant, no innerHTML usage, encrypted API key storage
- **Performance**: DOM caching, parallel extraction, progressive loading
- **Compatibility**: Chrome Manifest V3, LinkedIn web interface

## Usage

1. Install the extension via Chrome Web Store or developer mode
2. Navigate to your LinkedIn profile
3. Click the ElevateLI overlay to start analysis
4. Optionally configure AI analysis with your API key

## Development

```bash
git clone https://github.com/prPMDev/elevateli.git
cd elevateli
# Load elevateli-extension/ in Chrome Developer Mode
```

## License

MIT License - see [LICENSE](LICENSE) for details.

## Contributing

Issues and pull requests welcome. See [GitHub issues](https://github.com/prPMDev/elevateli/issues) for current development priorities.
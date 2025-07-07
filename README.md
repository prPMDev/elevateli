# ElevateLI - LinkedIn Profile Optimizer Chrome Extension

[![Version](https://img.shields.io/badge/version-0.3.4-blue.svg)](https://github.com/yourusername/elevate-li)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![Chrome Web Store](https://img.shields.io/badge/Chrome-Extension-yellow.svg)](https://chrome.google.com)

## Overview

ElevateLI is a powerful Chrome extension that analyzes LinkedIn profiles to provide actionable insights for profile optimization. It offers two key metrics:

- **Completeness Score** (0-100%) - Calculated locally without any API calls
- **Content Quality Score** (1-10) - AI-powered analysis using your own OpenAI/Anthropic API key

## Features

### 🎯 Comprehensive Profile Analysis
- **10 Section Analysis**: Photo, Headline, About, Experience, Skills, Education, Recommendations, Certifications, Projects, and Featured content
- **Real-time Extraction**: Fast scanning with visual progress indicators
- **Smart Data Extraction**: Automatically detects "Show all" links to get complete counts without clicking

### 📊 Dual Scoring System
- **Completeness Score**: Local calculation based on profile sections
- **Quality Score**: AI-powered content analysis (optional, requires API key)
- **Section Breakdown**: See exactly what's missing and how to improve

### 🎨 Professional UI
- **LinkedIn Integration**: Seamless overlay that matches LinkedIn's design
- **Visual Indicators**: Progress gauges and status badges
- **Clean Dashboard**: Historical tracking and insights
- **Export Options**: Download analysis as PDF or CSV

### 🔒 Privacy First
- **No External Servers**: All data stays in your browser
- **Your API Keys**: Use your own OpenAI/Anthropic keys
- **Local Caching**: 7-day cache to minimize API costs
- **Full Control**: Enable/disable AI analysis anytime

## Installation

### From Chrome Web Store (Recommended)
1. Visit the [Chrome Web Store](#) (coming soon)
2. Click "Add to Chrome"
3. Follow the installation prompts

### Manual Installation (Developer Mode)
1. Clone this repository:
   ```bash
   git clone https://github.com/yourusername/elevate-li.git
   ```
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode" in the top right
4. Click "Load unpacked"
5. Select the `extension` folder from the cloned repository

## Usage

### Basic Usage (Completeness Score Only)
1. Navigate to any LinkedIn profile
2. Look for the ElevateLI badge in the profile header
3. Click the extension icon to see detailed analysis
4. View missing sections and recommendations

### Advanced Usage (With AI Analysis)
1. Click the extension icon and go to Settings
2. Add your OpenAI or Anthropic API key
3. Enable "AI Analysis" toggle
4. Return to a LinkedIn profile
5. Click "Analyze" for AI-powered insights

### Understanding Your Scores

#### Completeness Score (0-100%)
Based on profile sections:
- About (15%): 800+ characters recommended
- Experience (15%): Current role and detailed descriptions
- Skills (15%): 15+ skills for maximum score
- Headline (10%): 100+ characters with keywords
- Other sections (45%): Education, recommendations, etc.

#### Quality Score (1-10)
AI evaluates:
- Keyword optimization
- Content clarity and impact
- Professional tone
- Quantified achievements
- Industry relevance

## Configuration

### API Setup
1. **OpenAI**: Get your API key from [OpenAI Platform](https://platform.openai.com/api-keys)
2. **Anthropic**: Get your API key from [Anthropic Console](https://console.anthropic.com/)
3. Add your key in the extension settings
4. Choose your preferred model (GPT-4 or Claude)

### Settings Options
- **AI Provider**: OpenAI or Anthropic
- **Cache Duration**: 1-30 days (default: 7)
- **Auto-analyze**: Enable automatic analysis on profile load
- **Debug Mode**: Enable detailed logging for troubleshooting

## Development

### Project Structure
```
extension/
├── manifest.json          # Chrome extension manifest
├── content/              
│   ├── analyzer.js       # Main content script (bundled)
│   └── extractors/       # Modular extractors
├── background/
│   └── service-worker.js # Background processing
├── popup/                # Extension popup UI
├── options/              # Settings page
└── lib/                  # Third-party libraries
```

### Building from Source
```bash
cd extension
node build-analyzer.js    # Builds the content script
```

### Key Technologies
- Vanilla JavaScript (Manifest V3 compliant)
- Chrome Extension APIs
- OpenAI/Anthropic APIs
- Local storage for caching

## Troubleshooting

### Common Issues

#### "0 skills/recommendations found"
This was fixed in v0.3.4. The extension now properly handles LinkedIn's anchor+sibling DOM pattern.

#### "Extension context invalidated"
Refresh the LinkedIn page after installing or updating the extension.

#### High API Costs
- Enable caching (7-day default)
- Use batch analysis for multiple sections
- Consider using GPT-3.5-turbo for lower costs

### Debug Mode
1. Open Chrome DevTools Console
2. Run diagnostic commands:
   ```javascript
   // Check extraction
   window.ElevateLI.SkillsExtractor.scan()
   
   // Force analysis
   window.location.reload()
   ```

## Contributing

We welcome contributions! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

### Development Setup
1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

### Areas for Contribution
- Additional language support
- New AI providers (Gemini, Llama, etc.)
- Enhanced extraction patterns
- UI/UX improvements

## Privacy Policy

ElevateLI is committed to user privacy:
- No data is sent to external servers
- API keys are stored locally in Chrome storage
- Profile data is cached locally only
- No tracking or analytics

## License

MIT License - see [LICENSE](LICENSE) file for details.

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for version history and updates.

### Latest Version: 0.3.4
- Fixed skills extraction (0 → 53 skills)
- Fixed recommendations extraction (0 → 10)  
- Fixed certifications extraction
- Discovered and documented LinkedIn's anchor+sibling DOM pattern

## Support

- **Issues**: [GitHub Issues](https://github.com/yourusername/elevate-li/issues)
- **Documentation**: [Full Documentation](documentation/)
- **Email**: support@elevate-li.com

## Acknowledgments

- Chrome Extension community for Manifest V3 guidance
- LinkedIn for their platform (this is an independent project)
- OpenAI and Anthropic for AI capabilities
- All contributors and beta testers

---

**Note**: This extension is not affiliated with, endorsed by, or sponsored by LinkedIn Corporation.
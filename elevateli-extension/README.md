# ElevateLI Chrome Extension

Optimize your LinkedIn profile with AI-powered analysis and actionable insights.

[![Version](https://img.shields.io/badge/version-0.4.2-blue.svg)](https://github.com/yourusername/elevateli)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![Chrome Web Store](https://img.shields.io/badge/Chrome-Extension-yellow.svg)](#)

## What is ElevateLI?

ElevateLI is a Chrome extension that analyzes LinkedIn profiles to help you stand out to recruiters and potential connections. It provides two key scores:

- **Completeness Score (0-100%)** - How complete your profile is
- **Content Quality Score (1-10)** - How well your content is written (requires your own AI API key)

## Features

✨ **Real-time Analysis** - Get instant feedback as you view LinkedIn profiles
📊 **Dual Scoring System** - Completeness score (free) and AI quality score (with API key)
🎯 **Section-by-Section Breakdown** - See exactly what needs improvement
💾 **Smart Caching** - Saves analysis results for 7 days to reduce API costs
🔐 **Privacy First** - Your API keys stay local, no data is sent to our servers
🎨 **Clean UI** - Non-intrusive overlay that integrates with LinkedIn's design

## Installation

### From Chrome Web Store (Coming Soon)
1. Visit the Chrome Web Store page
2. Click "Add to Chrome"
3. Click "Add Extension" when prompted

### Manual Installation (For Testing)
1. Download the latest release from GitHub
2. Unzip the downloaded file
3. Open Chrome and navigate to `chrome://extensions/`
4. Enable "Developer mode" in the top right
5. Click "Load unpacked"
6. Select the unzipped folder

## How to Use

1. **Install the extension** following the steps above
2. **Visit any LinkedIn profile** (including your own)
3. **View your Completeness Score** instantly in the overlay
4. **Enable AI Analysis** (optional):
   - Click the extension icon in your toolbar
   - Add your OpenAI or Anthropic API key
   - Click "Analyze" for detailed content quality feedback

## API Keys

To use the AI-powered quality analysis, you'll need your own API key from:
- **OpenAI** - Get one at [platform.openai.com](https://platform.openai.com)
- **Anthropic** - Get one at [console.anthropic.com](https://console.anthropic.com)

Cost: Approximately $0.05 per full profile analysis

## Configuration

### First-Time Setup
1. Click the extension icon in your Chrome toolbar
2. Accept the terms of service
3. Configure AI settings (optional):
   - Select AI provider (OpenAI or Anthropic)
   - Enter your API key
   - Choose target role and experience level
   - Save settings

### Profile Detection
- **Automatic**: Visit `linkedin.com/in/me/` to auto-detect your profile
- **Manual**: Click "Set Current Profile as Mine" on any LinkedIn profile page

### Settings
- **Enable/Disable AI**: Toggle AI analysis on/off
- **Cache Duration**: Results cached for 7 days (configurable)
- **Custom Instructions**: Add specific focus areas for AI analysis
- **Reset Options**: Clear cache or reset entire extension

## Technical Details

### Profile Analysis
The extension analyzes 10 key profile sections:
- Photo & Background
- Headline & Location
- About/Summary
- Experience
- Skills & Endorsements
- Education
- Recommendations
- Certifications
- Projects
- Featured Content

### Scoring Methodology
**Completeness Score (0-100%)**:
- Based on presence and depth of profile sections
- Calculated locally without API calls
- Instant feedback

**Quality Score (1-10)**:
- AI evaluates content clarity, keywords, and impact
- Considers target role and seniority level
- Provides specific improvement suggestions

### Performance
- **Fast Scanning**: ~2 seconds for completeness analysis
- **Smart Extraction**: Automatically expands "Show all" sections
- **Efficient Caching**: Reduces API calls and costs
- **Progressive UI**: Real-time feedback during analysis

## Privacy & Security

- ✅ **No data collection** - We don't collect or store any profile data
- ✅ **Local storage only** - API keys are encrypted and stored locally
- ✅ **No external servers** - All analysis happens directly with AI providers
- ✅ **Open source** - Review our code on GitHub

See our full [Privacy Policy](PRIVACY.md) for details.

## Support

- 📧 **Email**: support@elevateli.com (coming soon)
- 🐛 **Bug Reports**: [GitHub Issues](https://github.com/yourusername/elevateli/issues)
- 📖 **Documentation**: [GitHub Wiki](https://github.com/yourusername/elevateli/wiki)

## Contributing

We welcome contributions! See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup.

## License

MIT License - see [LICENSE](LICENSE) for details

---

Made with ❤️ for job seekers everywhere
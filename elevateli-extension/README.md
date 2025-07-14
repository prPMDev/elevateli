# ElevateLI Browser Extension

Optimize your LinkedIn profile with AI-powered analysis and actionable insights.

[![Version](https://img.shields.io/badge/version-0.5.0-blue.svg)](https://github.com/prPMDev/elevateli)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![Alpha Testing](https://img.shields.io/badge/status-Alpha%20Testing-orange.svg)](#)

## What is ElevateLI?

ElevateLI is a browser extension (works with Chrome, Edge, Brave, and other Chromium browsers) that analyzes your LinkedIn profile to help you stand out to recruiters and potential connections. It provides two key scores:

- **Completeness Score (0-100%)** - Shows how complete your profile is
- **Content Quality Score (1-10)** - Evaluates how well your content is written (optional, requires API key)

## Features

- **Real-time Analysis** - Get instant feedback when viewing your LinkedIn profile
- **Completeness Score** - Free analysis that checks if all important sections are filled
- **AI Quality Score** - Optional deep analysis of your content quality (requires OpenAI API key)
- **Section-by-Section Breakdown** - See exactly what needs improvement
- **Smart Caching** - Saves your results to reduce API costs
- **Privacy First** - Your data stays between you and your AI provider only (OpenAI)
- **Clean Interface** - Seamlessly integrates with LinkedIn's design
- **Persistent Results** - Analysis results are saved indefinitely (no expiration)

## Installation

### Manual Installation (Alpha Testing)

**Step 1: Download the Extension**

**Option A: Download Source Code** (Until releases are available)
1. Go to [https://github.com/prPMDev/elevateli](https://github.com/prPMDev/elevateli)
2. Click the green "Code" button
3. Click "Download ZIP"
4. The file will download to your Downloads folder

**Option B: From Releases** (Coming soon)
1. Go to [GitHub Releases Page](https://github.com/prPMDev/elevateli/releases)
2. Download `elevateli-extension.zip` when available

**Step 2: Prepare the Extension**
1. Find the downloaded ZIP file in your Downloads folder
   - If using Option A: File will be named `elevateli-main.zip` or `elevateli-master.zip`
   - If using Option B: File will be named `elevateli-extension.zip`
2. Right-click the file and select "Extract All" (Windows) or double-click (Mac)
3. Choose where to extract (Desktop is recommended for easy access)
4. Remember this location - you'll need it in the next step

**Step 3: Install in Your Browser**
1. Open your Chromium-based browser (Chrome, Edge, Brave, etc.)
2. Type `chrome://extensions/` in the address bar and press Enter
   - Note: Use this URL even in Edge or Brave
3. Turn on "Developer mode" using the toggle in the top-right corner
4. Click the "Load unpacked" button that appears
5. Navigate to the folder you extracted in Step 2
6. Select the folder:
   - If using Option A: Navigate to `elevateli-main` (or `elevateli-master`) → then select `elevateli-extension` folder inside
   - If using Option B: Select the `elevateli-extension` folder directly
7. Click "Select Folder"

**Step 4: Pin the Extension**
1. Click the puzzle piece icon (Extensions) in your browser's toolbar
2. Find "ElevateLI" in the list
3. Click the pin icon to keep it visible in your toolbar

### From Chrome Web Store (Coming Soon)
The extension is currently in alpha testing. Chrome Web Store release coming soon!

## How to Use

### First Time Setup
1. **Install the extension** following the steps above
2. **Visit YOUR LinkedIn profile** (Important: Must be your own profile)
   - Go to linkedin.com and sign in
   - Click "Me" in the top navigation
   - Click "View Profile"
3. **Confirm Profile Ownership**
   - The extension will ask you to confirm this is your profile
   - Only confirm if you're viewing your own profile (required for LinkedIn compliance)
4. **View Your Completeness Score**
   - A blue banner appears at the top of your profile
   - Shows your completeness percentage instantly
   - Click "Analyze" to run a full analysis

### Enable AI Analysis (Optional)
1. **Click the extension icon** in your browser toolbar (the blue "E" icon)
2. **Enable AI Analysis**:
   - Toggle "Enable AI Analysis" to ON
3. **Configure Target Role Settings**:
   - Select your target role (e.g., Product Manager, Software Engineer)
   - Choose your experience level (Entry, Mid, Senior, etc.)
   - Add any additional context (optional)
4. **Configure AI Provider Settings**:
   - Select your provider and model from the dropdown:
     - OpenAI | GPT-4o | Best Quality + Vision
     - OpenAI | GPT-4o mini | Fast & Affordable
   - Enter your OpenAI API key
   - Click "Save Settings" to verify and save
5. **Run AI Analysis**:
   - Return to your LinkedIn profile
   - Click "Analyze" in the blue banner
   - Wait for the AI to analyze your content (takes 10-30 seconds)

## Getting an API Key

To use the AI-powered quality analysis, you'll need your own OpenAI API key:

1. **Create an OpenAI Account**
   - Go to [platform.openai.com](https://platform.openai.com)
   - Sign up for a free account
   
2. **Get Your API Key**
   - After signing in, click on your profile (top-right)
   - Select "API keys"
   - Click "Create new secret key"
   - Copy the key immediately (you won't see it again!)
   
3. **Add Credits**
   - OpenAI requires adding credits to use the API
   - $5 credit goes a long way (~100 full profile analyses)
   - Cost: Approximately $0.05 per profile analysis

**Note**: Anthropic support coming soon!

## Configuration Settings

### Extension Settings (Click the extension icon)
- **Enable/Disable AI**: Toggle AI analysis on/off to control costs
- **Target Role**: Select your desired position for tailored advice
- **Experience Level**: Choose your seniority for appropriate recommendations
- **Custom Instructions**: Add specific focus areas for AI analysis
- **Reset Analysis**: Clear cached results to run fresh analysis
- **Reset Extension**: Factory reset if you encounter issues

## How It Works

### What Gets Analyzed
The extension checks these key profile sections:
- Profile Photo
- Headline
- About/Summary
- Work Experience
- Skills & Endorsements
- Education
- Recommendations
- Certifications
- Projects
- Featured Content

### Scoring Explained
**Completeness Score (0-100%)**
- Checks if sections exist and have content
- Calculated instantly on your device
- No API needed

**Quality Score (1-10)**
- AI evaluates how well your content is written
- Looks for keywords relevant to your target role
- Provides specific suggestions for improvement
- Currently analyzes text content only (photo quality analysis coming soon)

### Performance & Privacy
- **Completeness analysis**: Takes ~2 seconds
- **AI analysis**: Takes 10-30 seconds
- **Smart extraction**: Gets as much profile data as available
- **7-day caching**: Saves results to reduce API costs
- **Privacy**: Data only flows between your browser and OpenAI directly

## Privacy & Security

- ✅ **No data collection** - The extension doesn't collect or store any profile data
- ✅ **Local storage only** - API keys are encrypted and stored in your browser
- ✅ **Direct API connection** - Your data goes directly to OpenAI, bypassing any middleman
- ✅ **Open source** - Review our code on GitHub

See our full [Privacy Policy](PRIVACY.md) for details.

## Troubleshooting

### Common Issues

**Extension doesn't appear**
- Make sure you've pinned it to your toolbar (Step 4 of installation)
- Refresh your LinkedIn tab after installation

**"Not your profile" message**
- Ensure you're viewing your own LinkedIn profile
- Click "Me" → "View Profile" in LinkedIn

**API key errors**
- Verify your OpenAI account has credits
- Test your key using the "Test Key" button
- Make sure you copied the entire key

**Analysis not starting**
- Refresh the LinkedIn page
- Check that you're on your own profile
- Try "Reset Analysis" in settings

## Support

- 🐛 **Bug Reports**: [GitHub Issues](https://github.com/prPMDev/elevateli/issues)
- 💬 **Feedback**: Use the feedback link in the extension
- 📖 **Updates**: Watch the GitHub repository for new releases

## Video Demo

Coming soon! We're working on a video walkthrough for easier setup.

## License

MIT License - see [LICENSE](LICENSE) for details

---

Made with ❤️ for job seekers everywhere
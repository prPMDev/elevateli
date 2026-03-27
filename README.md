# ElevateLI

**Optimize your LinkedIn profile with AI-powered analysis and actionable suggestions.**

ElevateLI is a Chrome extension that analyzes your LinkedIn profile and gives you a completeness score, content quality rating, and specific recommendations to improve your professional presence.

## What It Does

- **Completeness Score (0-100%)** - Checks every section of your profile and tells you what's missing or incomplete. Runs locally, no API needed.
- **Content Quality Score (1-10)** - AI-powered analysis of your headline, about section, experience, skills, and more. Gives specific, actionable feedback.
- **Section-by-Section Breakdown** - Star ratings and recommendations for each profile section.
- **Works on Your Profile** - Analyzes your own LinkedIn profile. Visit your profile page to get started.

## Installation

1. Download or clone this repository
2. Open Chrome and go to `chrome://extensions`
3. Enable **Developer mode** (toggle in the top-right corner)
4. Click **Load unpacked**
5. Select the folder you downloaded (the one containing `manifest.json`)
6. The ElevateLI icon will appear in your Chrome toolbar

## How to Use

1. Navigate to **your own** LinkedIn profile page
2. Click the ElevateLI icon in the toolbar
3. Click **Analyze** to run the completeness scan
4. Review your scores and recommendations in the overlay that appears on your profile

### AI-Powered Analysis (Optional)

For deeper content quality analysis:

1. Click the ElevateLI icon and go to **Settings**
2. Enable **AI Enhancement**
3. Add your OpenAI API key (GPT-4o or GPT-4o-mini)
4. Set your target role and level for personalized recommendations
5. Run the analysis again to get AI-powered feedback

Your API key is encrypted locally and never leaves your browser except to make API calls.

## Privacy

- All profile data is processed locally in your browser
- No data is sent to any server (except OpenAI if you enable AI analysis)
- API keys are encrypted with AES-GCM and stored in Chrome's local storage
- No tracking, no analytics, no data collection
- See `privacy-terms.html` for the full privacy policy

## Permissions

| Permission | Why |
|------------|-----|
| `storage` | Save your settings and cached analysis results |
| `activeTab` | Read your LinkedIn profile page content |
| `scripting` | Inject the analysis overlay on LinkedIn |
| `tabs` | Detect navigation between LinkedIn pages |
| `alarms` | Schedule periodic cache cleanup |

Host permission is limited to `https://www.linkedin.com/*` only.

## Tech Stack

- Chrome Extension Manifest V3
- Vanilla JavaScript (no frameworks)
- Chrome Storage API for persistence
- Web Crypto API for key encryption
- OpenAI API for content analysis (optional)

## License

MIT License. See the extension's privacy and terms page for details.

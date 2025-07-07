# Privacy Policy

*Last updated: January 2025*

## Our Commitment

ElevateLI is designed with privacy as a core principle. We believe your data belongs to you, and we've built our extension to reflect that belief.

## What We DON'T Do

- ❌ We do NOT collect any personal information
- ❌ We do NOT track your browsing activity
- ❌ We do NOT store LinkedIn profile data on any servers
- ❌ We do NOT have access to your API keys
- ❌ We do NOT sell or share any data (because we don't have any)
- ❌ We do NOT use analytics or tracking tools
- ❌ We do NOT require user accounts or registration

## How the Extension Works

### Local Processing Only
All profile analysis happens directly in your browser. The extension:
1. Reads the LinkedIn profile you're viewing
2. Calculates a completeness score locally
3. Optionally sends profile text to YOUR chosen AI provider (OpenAI/Anthropic)
4. Displays results in your browser
5. Caches results locally for 7 days

### Data Storage
The extension stores the following data locally in your browser:
- **API Keys**: Encrypted and stored in Chrome's local storage
- **Cache**: Analysis results stored for 7 days to reduce API costs
- **Settings**: Your preferences (cache duration, enabled features)

This data never leaves your computer and can be cleared at any time through:
- The extension's settings
- Chrome's "Clear browsing data" function

### API Communications
When AI analysis is enabled:
- Profile text is sent DIRECTLY to OpenAI or Anthropic
- We do not proxy or intercept these communications
- The AI providers' privacy policies apply to this data
- You can review their policies at:
  - OpenAI: https://openai.com/privacy
  - Anthropic: https://anthropic.com/privacy

## Permissions Explained

The extension requires these Chrome permissions:

### "storage"
- **Why**: To save your API keys and settings locally
- **What it accesses**: Only the extension's own storage area

### "activeTab"
- **Why**: To read the LinkedIn profile you're currently viewing
- **What it accesses**: Only the active tab when you're on LinkedIn

### "host_permissions" (linkedin.com)
- **Why**: To inject the analysis overlay on LinkedIn pages
- **What it accesses**: Only LinkedIn profile pages

## Your Control

You have complete control over your data:

### Clear Cache
- Click "Clear Cache" in the extension popup
- All stored analysis results are immediately deleted

### Remove API Keys
- Delete your API key in settings
- The encrypted key is immediately removed from storage

### Uninstall
- Uninstalling the extension removes ALL stored data
- No data persists after uninstallation

## Data Security

- API keys are encrypted before storage
- All data is stored locally using Chrome's secure storage APIs
- No external servers or databases are used
- The extension is open source - review our security at GitHub

## Children's Privacy

The extension is not intended for users under 13 years of age. We do not knowingly collect information from children under 13.

## Changes to This Policy

We may update this Privacy Policy from time to time. Changes will be posted in the extension's repository with the update date.

## Open Source

Our commitment to privacy is backed by transparency. The entire source code is available on GitHub for review.

## Contact

For privacy-related questions, please open an issue on our GitHub repository.

---

**Remember**: ElevateLI is a tool that runs entirely in your browser. We can't see your data because we never receive it.
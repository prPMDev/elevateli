# ElevateLI — LinkedIn Profile Optimizer

> A Chrome extension that analyzes your LinkedIn profile and gives you a completeness score, AI-powered content quality rating, and section-by-section recommendations to strengthen your professional presence.

![Chrome Extension](https://img.shields.io/badge/Chrome-Extension-4285F4?logo=googlechrome&logoColor=white)
![Manifest V3](https://img.shields.io/badge/Manifest-V3-34A853)
![AI: GPT-4o](https://img.shields.io/badge/AI-GPT--4o-10a37f?logo=openai&logoColor=white)
![Status: v1.0.0](https://img.shields.io/badge/Status-v1.0.0-brightgreen)

---

## The Problem

LinkedIn profiles are career infrastructure, but most people have no idea what's missing or weak. Generic advice like "write a better headline" doesn't help when you can't see the gaps. Professional profile reviews cost $100-500, and AI chatbots lack the context of what recruiters and hiring managers actually see on your page.

## The Solution

ElevateLI sits directly on your LinkedIn profile page, reads what's actually there, scores every section, and tells you exactly what to fix — with specific, actionable recommendations tied to your real content.

---

## Features (v1.0.0)

- **Completeness Score (0-100%)** — scans every profile section locally, no API needed
- **Content Quality Score (1-10)** — AI-powered analysis using GPT-4o or GPT-4o-mini
- **Section-by-section breakdown** — star ratings and specific recommendations for headline, about, experience, skills, education, and more
- **Three-phase extraction** — scan, extract, deep extract for thorough data collection
- **Encrypted API key storage** — AES-GCM encryption, keys never leave your browser
- **Infinite cache** — results persist until you clear them, no re-analysis needed
- **Progressive UI** — real-time status updates as each section is analyzed
- **Zero data collection** — no tracking, no analytics, no server calls (except OpenAI if you opt in)

## Roadmap (v2)

- [ ] Vision API integration for photo and banner analysis
- [ ] Streaming AI responses for faster feedback
- [ ] Differential updates to reduce API calls
- [ ] Anthropic Claude as an alternative AI provider
- [ ] Comparison mode across profile snapshots over time
- [ ] Chrome Web Store publication
- [ ] Export analysis as PDF report
- [ ] Custom scoring weights based on industry

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Platform | Chrome Extension (Manifest V3) |
| Language | Vanilla JavaScript (no frameworks) |
| AI Provider | OpenAI GPT-4o / GPT-4o-mini |
| Security | Web Crypto API (AES-GCM) |
| Storage | Chrome Storage API |
| Architecture | Content scripts + Service Worker |
| DOM Safety | Zero innerHTML, safe DOM methods only |

---

## Getting Started

### Prerequisites

- Google Chrome browser
- (Optional) OpenAI API key for AI-powered analysis — [get one here](https://platform.openai.com/api-keys)

### Installation

```bash
git clone https://github.com/prPMDev/elevateli.git
cd elevateli
```

1. Open Chrome and go to `chrome://extensions`
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked**
4. Select the `elevateli` folder (the one with `manifest.json`)

### AI Setup (Optional)

Click the ElevateLI icon in your toolbar, go to **Settings**, and:

1. Enable **AI Enhancement**
2. Paste your OpenAI API key
3. Set your target role and career level
4. Run the analysis — AI feedback costs ~$0.05 per full profile scan

---

## How It Works

```
Visit your LinkedIn profile
        |
   Click Analyze
        |
  Phase 1: SCAN — quick parallel check of all sections
        |
  Phase 2: EXTRACT — pull structured data from each section
        |
  Phase 3: SCORE — calculate completeness (local, instant)
        |
  Phase 4: AI ANALYZE — send sections to GPT-4o for quality feedback
        |
  Phase 5: DISPLAY — overlay results on your profile with recommendations
        |
  Results cached — no re-analysis needed until you change your profile
```

---

## Permissions

| Permission | Why |
|------------|-----|
| `storage` | Save settings and cached analysis results |
| `activeTab` | Read your LinkedIn profile content |
| `scripting` | Inject the analysis overlay |
| `tabs` | Detect page navigation on LinkedIn |
| `alarms` | Schedule periodic cache cleanup |

Host access is limited to `https://www.linkedin.com/*` only.

---

## Project Context

Built as a real tool to solve a real problem — optimizing LinkedIn profiles without paying for expensive coaching or relying on vague AI chatbot advice. Author is a Senior PM specializing in AI/integration products, building this alongside [Pursuit](https://github.com/prPMDev) (an anti-mass-apply job search tool).

---

## Troubleshooting

**Extension icon doesn't appear**
Ensure you loaded the folder containing `manifest.json`, not a parent folder.

**"Extension context invalidated" error**
Reload the extension from `chrome://extensions` and refresh the LinkedIn page.

**AI analysis returns no results**
Check that your API key is valid and has credits. Open DevTools console for error details.

**Overlay doesn't show on profile**
ElevateLI only activates on your own profile. Visit `linkedin.com/in/your-username`.

---

## Contributing

Backlog is tracked in [GitHub Issues](https://github.com/prPMDev/elevateli/issues). PRs welcome.

## License

MIT License — see [privacy-terms.html](privacy-terms.html) for the full privacy policy and terms.

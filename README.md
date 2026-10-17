# ElevateLI — LinkedIn Profile Optimizer

> A Chrome extension that shows how complete your LinkedIn profile is and what to fix first, with optional AI ratings of your writing.

![Chrome Extension](https://img.shields.io/badge/Chrome-Extension-4285F4?logo=googlechrome&logoColor=white)
![Manifest V3](https://img.shields.io/badge/Manifest-V3-34A853)
![Status: v1.0.0](https://img.shields.io/badge/Status-v1.0.0-brightgreen)

---

## The Problem

LinkedIn profiles are career infrastructure, but most people have no idea what's missing or weak. Generic advice like "write a better headline" doesn't help when you can't see the gaps. Professional profile reviews cost $100-500, and AI chatbots lack the context of what recruiters and hiring managers actually see on your page.

## The Solution

ElevateLI sits directly on your LinkedIn profile page, reads what's actually there, scores every section, and tells you exactly what to fix — with specific, actionable recommendations tied to your real content.

---

## Features (v1.0.0)

- **Completeness Score (0-100%)** — scans every profile section locally, no API needed
- **Optional AI ratings** — 1–5 stars and writing tips for your headline, About, experience, skills and recommendations, judged against your target role and level
- **Section-by-section breakdown** — a tip for each gap, with what it adds (for example "+12% completeness")
- **Three-phase extraction** — scan, extract, deep extract for thorough data collection
- **Encrypted API key storage** — AES-GCM encryption; the key goes only to the provider you chose
- **Saved results** — your latest results show again without re-running
- **Progressive UI** — real-time status updates as each section is analyzed
- **No servers and no account** — scoring runs in your browser; with AI analysis on, the sections being rated go straight to the provider you chose

## Roadmap (v2)

- [ ] Vision API integration for photo and banner analysis
- [ ] Streaming AI responses for faster feedback
- [ ] Differential updates to reduce API calls
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
| AI Provider | Gemini, OpenAI, Anthropic or a local model (Ollama, LM Studio) |
| Security | Web Crypto API (AES-GCM) |
| Storage | Chrome Storage API |
| Architecture | Content scripts + Service Worker |
| DOM Safety | Zero innerHTML, safe DOM methods only |

---

## Getting Started

### Prerequisites

- Google Chrome browser
- (Optional) For AI analysis: a Gemini, OpenAI or Anthropic API key, or a local model (Ollama, LM Studio)

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

1. Turn on **AI analysis**
2. Choose a provider and paste its API key (for a local model, set the server URL instead), then pick a model
3. Set your target role and level
4. Click **Analyze** on your profile. Your provider bills you directly for AI use; local models have no API cost

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
  Phase 4: AI ANALYZE — send sections to Gemini, OpenAI, Anthropic or a local model (Ollama, LM Studio) for AI ratings
        |
  Phase 5: DISPLAY — show results and tips in the ElevateLI bar on your profile
        |
  Results saved — they show again without re-running; click Analyze after you edit your profile
```

---

## Permissions

| Permission | Why |
|------------|-----|
| `storage` | Save settings, your encrypted API key and your latest results |
| `activeTab` | Check that the current tab is your LinkedIn profile during setup |
| `scripting` | Re-attach ElevateLI to LinkedIn tabs that were already open after an install or update |

Host access is limited to `https://www.linkedin.com/*`. `localhost` is requested only if you connect a local model.

---

## Project Context

Built as a real tool to solve a real problem — optimizing LinkedIn profiles without paying for expensive coaching or relying on vague AI chatbot advice. Author is a Senior PM specializing in AI/integration products, building this alongside [Pursuit](https://github.com/prPMDev) (an anti-mass-apply job search tool).

---

## Troubleshooting

**Extension icon doesn't appear**
Ensure you loaded the folder containing `manifest.json`, not a parent folder.

**"Extension context invalidated" error**
Reload the extension from `chrome://extensions`, then reload the LinkedIn page.

**AI analysis returns no results**
Check that your API key is valid and has credits. Open DevTools console for error details.

**Overlay doesn't show on profile**
ElevateLI only activates on your own profile. Visit `linkedin.com/in/your-username`.

---

## Contributing

Backlog is tracked in [GitHub Issues](https://github.com/prPMDev/elevateli/issues). PRs welcome.

## License

MIT License — see [privacy-terms.html](privacy-terms.html) for the full privacy policy and terms.

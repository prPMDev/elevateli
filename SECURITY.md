# Security Policy

## Overview

ElevateLI implements security best practices for Chrome extension development and maintains Chrome Web Store compliance standards.

## Security Architecture

### Content Security Policy
- Restrictive CSP: `script-src 'self'; object-src 'none';`
- No inline scripts or unsafe evaluations
- Self-contained extension resources only

### DOM Manipulation
- Zero innerHTML usage throughout codebase
- Safe DOM methods: createElement, textContent, appendChild
- Input sanitization for all user-generated content
- XSS prevention through secure DOM practices

### Data Handling
- Local processing only - no data transmission to external servers
- API keys encrypted using Web Crypto API
- Secure Chrome Storage API implementation
- No persistent storage of LinkedIn profile data

### Chrome Extension Security
- Manifest V3 native implementation
- Minimal permissions principle
- Host permissions limited to `https://www.linkedin.com/*`
- Service worker isolation for background processing
- Message validation between content script and service worker

## Permissions Justification

| Permission | Usage | Justification |
|------------|--------|---------------|
| `storage` | API key storage | Encrypted user preferences |
| `activeTab` | LinkedIn access | Profile analysis functionality |
| `scripting` | Content injection | Extension overlay display |
| `tabs` | Tab management | Extension state synchronization |
| `alarms` | Background tasks | Service worker lifecycle management |

## API Security

### External API Integration
- User-provided API keys only
- No server-side key storage
- Rate limiting implementation
- Request timeout enforcement
- Error handling without information disclosure

### Authentication
- No authentication required from ElevateLI
- Users authenticate directly with AI providers (OpenAI/Anthropic)
- Extension does not handle user credentials

## Vulnerability Reporting

### Reporting Process
1. **Create GitHub Issue**: [Report Security Issue](https://github.com/prPMDev/elevateli/issues/new)
2. **Label as Security**: Tag with `security` label
3. **Provide Details**: Include reproduction steps and impact assessment

### Response Timeline
- **Initial Response**: Within 72 hours
- **Assessment**: Within 1 week
- **Resolution**: Based on severity (Critical: 7 days, High: 30 days, Medium: 60 days)

### Scope
Security issues within scope:
- Chrome extension code vulnerabilities
- DOM manipulation security issues
- Data handling and storage problems
- Permission abuse or escalation
- Content Security Policy bypasses

Out of scope:
- LinkedIn.com platform issues
- Third-party API vulnerabilities
- Browser bugs or security issues
- Social engineering attacks

## Security Best Practices

### Development Guidelines
- Regular dependency updates
- Code review for all changes
- Static analysis scanning
- Input validation implementation
- Secure coding standards adherence

### User Security
- Clear permission explanations
- Transparent data handling policies
- User control over AI integration
- Local-first processing approach

## Compliance

### Chrome Web Store Standards
- Manifest V3 compliance verified
- Security review completed
- No remote code execution
- Minimal attack surface
- Professional security implementation

### Standards Adherence
- OWASP secure coding practices
- Chrome extension security guidelines
- Web security best practices
- Privacy-first development principles

## Security Updates

Security updates are released as patch versions and communicated through:
- GitHub releases with security tags
- Chrome Web Store automatic updates
- Repository security advisories

## Contact

For security-related questions or concerns:
- GitHub Issues: [Security Issues](https://github.com/prPMDev/elevateli/issues)
- Security Label: Tag issues with `security` for priority handling
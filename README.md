# LinkedIn Career Networker 🚀

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node: >=18](https://img.shields.io/badge/Node.js-%3E%3D18-green.svg)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue.svg)](https://www.typescriptlang.org/)
[![Playwright](https://img.shields.io/badge/Playwright-1.49+-orange.svg)](https://playwright.dev/)

**LinkedIn Career Networker** is an intelligent, human-simulated career networking automator built with Playwright and TypeScript. It helps engineers and job seekers connect with technical recruiters, hiring managers, and engineering leaders at top product companies—**safely, respectfully, and authentically**.

---

## ✨ Key Features

### 🛡️ Two-Tier Company Verification Engine
Prevents embarrassing or misleading messages by guaranteeing that outreach is sent **only to active, verified employees** of the target company:
- **Tier 1 (LinkedIn Backend Filter)**: Queries official numeric LinkedIn Company IDs (e.g., Google `1441`, Microsoft `1035`, Amazon `1586`) via the `currentCompany` parameter to isolate current employees at the database level.
- **Tier 2 (Algorithmic Headline Guard)**: Scans candidate headlines and card snippets using Regex and keyword matching. Automatically skips:
  - Past employees (`Ex-Google`, `Former Microsoft`)
  - Partner companies (`Google Cloud Partner`, `Vendor at...`)
  - Contractors, agencies, and non-target primary employers

### 🧑 Natural Human Behavior Emulation
Unlike typical scrapers that trigger LinkedIn anti-bot detection, this tool strictly mirrors human interaction:
- **Curved Mouse Movements**: Non-linear Bézier cursor trajectories with randomized velocity and micro-overshoots.
- **Realistic Keystroke Typing**: Variable 30ms–90ms typing intervals per character with natural variation.
- **Card Review Pauses**: Pauses for 6s–15s to simulate reading candidate headlines and summaries before deciding to connect.
- **Natural Pacing Delays**: Randomized 45s–90s delays between invitation sends to avoid velocity flags.

### 🛑 Anti-Ban Circuit Breakers & Quota Protection
- **Daily Quota Enforcement**: Automatically counts invitations sent today from local history and stops immediately upon reaching your daily limit.
- **Circuit Breakers**: Detects unusual LinkedIn modals, email-required prompts, or rate-limit warnings and safely halts execution immediately.

### 🚫 Smart Exclusion Lists
- **Employer Blacklist**: Completely blocks your current employer, clients, or competitors from ever being contacted.
- **Keyword Filtering**: Skips profiles matching excluded keywords (e.g., `intern`, `student`).

### 💬 Dynamic Personalized Notes
- Automatically drafts role-aware, personalized notes under LinkedIn's 200-character free connection limit.
- Dynamically substitutes `{firstName}` and `{company}` from verified profiles.

### 🔒 Zero-Credential Persistent Session
- Uses a persistent Chromium session directory (`chrome-session/`). Log in once in your browser, and all future sessions run authenticated without storing plaintext passwords.

---

## 📁 Project Structure

```text
linkedin-networker/
├── src/
│   ├── index.ts           # Main CLI orchestrator & search loop
│   ├── linkedin.ts        # LinkedIn automation, search & verification logic
│   ├── humanBehavior.ts   # Mouse curves, human typing, pacing & circuit breakers
│   ├── history.ts         # Persistent deduplication tracker (history.json)
│   └── login.ts           # Helper script for initial browser authentication
├── config.json            # Active targeting, safety, and message configuration
├── config.example.json    # Example configuration template
├── data/
│   ├── history.json       # Local audit log (gitignored)
│   └── history.sample.json# Sample record format
├── chrome-session/        # Authenticated Chrome profile (gitignored)
├── package.json
├── tsconfig.json
└── README.md
```

---

## 🚀 Quickstart Guide

### 1. Prerequisites
- **Node.js** (v18 or higher): [nodejs.org](https://nodejs.org/)
- **Google Chrome** installed locally

### 2. Installation

```bash
# Clone the repository
git clone https://github.com/mahipower003/linkedin-networker.git
cd linkedin-networker

# Install dependencies
npm install

# Install Playwright browser dependencies
npx playwright install chrome
```

### 3. Configuration

Copy `config.example.json` to `config.json` (if not already present):

```bash
cp config.example.json config.json
```

Edit `config.json` to customize your search targets, safety caps, and message templates:

```json
{
  "safety": {
    "maxDailyInvites": 20,
    "minDelayBetweenInvitesSec": 45,
    "maxDelayBetweenInvitesSec": 90,
    "minProfileReadTimeSec": 6,
    "maxProfileReadTimeSec": 15,
    "stopOnWarning": true
  },
  "exclusions": {
    "companies": [
      "Current Employer Inc",
      "Competitor Ltd"
    ],
    "keywords": [
      "intern",
      "student"
    ]
  },
  "targeting": {
    "roles": [
      "Technical Recruiter",
      "Engineering Recruiter",
      "Talent Acquisition Partner",
      "Engineering Manager"
    ],
    "targetCompanies": [
      "Google",
      "Microsoft",
      "Amazon",
      "Meta",
      "Uber"
    ],
    "networkDegree": ""
  },
  "messaging": {
    "sendPersonalizedNote": true,
    "templates": [
      "Hi {firstName}, noticed your talent focus at {company}. As a Fullstack Dev (React/Node/Cloud), I'd love to connect and stay on your radar for roles!",
      "Hello {firstName}, expanding my network with technical recruiting leaders at {company}. Would love to stay in touch for upcoming engineering roles!"
    ]
  }
}
```

### 4. Authenticate Once

Run the login helper to initialize your persistent Chrome profile:

```bash
npm run login
```

A Chrome window will open. Log in to your LinkedIn account manually (or via credentials). Once you reach the LinkedIn feed, your session cookies are securely stored in `./chrome-session/`. You will not need to log in again.

---

## 🎯 Usage Modes

### Mode 1: Dry Run (Test Verification Without Sending)
Inspects search results, runs two-tier verification, and simulates connection modal opening without sending invitations:

```bash
npm run start:dry
```

### Mode 2: Interactive Mode (Review Each Invite)
Prompts for confirmation (`[Y/n]`) before sending each connection request:

```bash
npm start
```

### Mode 3: Autonomous Mode (Hands-Free Background Run)
Runs through configured target companies and roles autonomously, enforcing natural pacing and quota limits:

```bash
npm run start:auto
```

---

## 🏢 Supported Company ID Mapping

The automator maps common target tech companies to their official LinkedIn numeric IDs:

| Company | LinkedIn ID |
|---|---|
| **Google** | `1441` |
| **Microsoft** | `1035` |
| **Amazon** | `1586` |
| **Meta** | `10667` |
| **Apple** | `162479` |
| **Uber** | `1815218` |
| **Salesforce** | `3185` |
| **Stripe** | `1635390` |
| **Atlassian** | `13606` |
| **Netflix** | `165158` |
| **Adobe** | `1480` |

*To target additional companies, simply add them to `config.json` (the script falls back to Boolean keyword matching and applies strict headline verification).*

---

## 🛡️ Safety Best Practices & LinkedIn Quotas

To keep your LinkedIn account safe and healthy:
- **Free LinkedIn Accounts**: Keep daily invites between **10–15** (~70–100/week).
- **LinkedIn Premium Accounts**: Safe daily volume is **20–30** (~150–200/week).
- **Pacing**: Never lower `minDelayBetweenInvitesSec` below 30 seconds.
- **Warm Up**: If starting fresh, begin with 5–10 invites/day for the first week.

---

## ⚖️ Disclaimer

This tool is designed for personal career networking and educational purposes only. Automated interaction with LinkedIn must be conducted responsibly and in accordance with [LinkedIn's User Agreement](https://www.linkedin.com/legal/user-agreement). The authors and contributors assume no responsibility for any misuse or account restrictions resulting from aggressive volume configurations.

---

## 📄 License

Distributed under the **MIT License**. See [LICENSE](LICENSE) for details.

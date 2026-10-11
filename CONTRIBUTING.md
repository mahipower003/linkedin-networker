# Contributing to LinkedIn Career Networker 🤝

Thank you for your interest in contributing to **LinkedIn Career Networker**! We welcome improvements, bug reports, and suggestions from the community.

---

## 🛠️ How to Contribute

1. **Fork the Repository**
   Click the "Fork" button on the top right of the GitHub repository.

2. **Clone your Fork**
   ```bash
   git clone https://github.com/your-username/linkedin-networker.git
   cd linkedin-networker
   ```

3. **Create a Feature Branch**
   ```bash
   git checkout -b feature/my-cool-feature
   ```

4. **Install Dependencies**
   ```bash
   npm install
   ```

5. **Make your Changes**
   - Ensure you follow TypeScript best practices.
   - Never commit sensitive session directories (`chrome-session/`) or credentials.
   - Run type checks to ensure there are no build errors:
     ```bash
     npm run build
     ```

6. **Commit & Push**
   ```bash
   git commit -m "feat: add support for custom search pagination"
   git push origin feature/my-cool-feature
   ```

7. **Submit a Pull Request**
   Open a Pull Request describing your changes and testing methodology.

---

## 🛡️ Core Rules for Contributions

- **Safety First**: We do not accept PRs that remove human-like pauses, bypass safety limits, or encourage spammy behavior.
- **Privacy First**: Never commit personal credentials, authentication cookies, or candidate logs.
- **Verification Integrity**: Any PR adding new company search or filtering logic must maintain strict two-tier company verification.

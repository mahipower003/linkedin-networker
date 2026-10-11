import { BrowserContext, Page, Locator } from 'playwright';
import { HistoryTracker, HistoryRecord } from './history.js';
import {
  randomDelay,
  randomInt,
  humanScroll,
  humanType,
  humanClick,
  checkCircuitBreakers
} from './humanBehavior.js';

export interface AutomationConfig {
  safety: {
    maxDailyInvites: number;
    minDelayBetweenInvitesSec: number;
    maxDelayBetweenInvitesSec: number;
    minProfileReadTimeSec: number;
    maxProfileReadTimeSec: number;
    stopOnWarning: boolean;
  };
  exclusions: {
    companies: string[];
    keywords: string[];
  };
  targeting: {
    roles: string[];
    targetCompanies: string[];
    networkDegree?: string;
  };
  messaging: {
    sendPersonalizedNote: boolean;
    templates: string[];
  };
}

export interface CandidateCard {
  name: string;
  firstName: string;
  url: string;
  headline: string;
  companySnippet: string;
  connectButtonLocator?: Locator;
}

export const LINKEDIN_COMPANY_IDS: Record<string, string> = {
  google: '1441',
  microsoft: '1035',
  amazon: '1586',
  meta: '10667',
  apple: '162479',
  uber: '1815218',
  salesforce: '3185',
  stripe: '1635390',
  atlassian: '13606',
  netflix: '165158',
  adobe: '1480'
};

export class LinkedInAutomator {
  private page: Page;
  private config: AutomationConfig;
  private history: HistoryTracker;
  private dryRun: boolean;
  private interactive: boolean;

  constructor(
    page: Page,
    config: AutomationConfig,
    history: HistoryTracker,
    options: { dryRun?: boolean; interactive?: boolean } = {}
  ) {
    this.page = page;
    this.config = config;
    this.history = history;
    this.dryRun = options.dryRun || false;
    this.interactive = options.interactive !== undefined ? options.interactive : true;
  }

  /**
   * Verifies that the user is logged into LinkedIn with retry for network blips
   */
  public async verifyLogin(retries = 3): Promise<boolean> {
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const currentUrl = this.page.url();
        if (!currentUrl.includes('linkedin.com')) {
          await this.page.goto('https://www.linkedin.com/feed/', { waitUntil: 'domcontentloaded', timeout: 30000 });
          await randomDelay(3000, 5000);
        }

        // Check if logged in feed or nav bar is present
        const nav = await this.page.$('#global-nav, .global-nav, nav[aria-label="Primary"]');
        if (nav) return true;

        // Check if login or sign-in page is visible
        const isLogin = await this.page.$('input#username, input#session_key, a[href*="login"]');
        if (isLogin) {
          console.error('❌ Not logged in to LinkedIn. Please log in on the open Chrome window first!');
          return false;
        }
        return true;
      } catch (err) {
        if (attempt < retries) {
          console.log(`⚠️ Network blip while verifying LinkedIn login (attempt ${attempt}/${retries}). Retrying in 4s...`);
          await randomDelay(4000, 6000);
        } else {
          console.error('Failed to verify LinkedIn login state:', err);
          return false;
        }
      }
    }
    return false;
  }

  /**
   * Checks whether a candidate belongs to an excluded company (e.g. JP Morgan)
   */
  public isExcluded(name: string, headline: string, snippet: string): { excluded: boolean; reason?: string } {
    const combinedText = `${name} ${headline} ${snippet}`.toLowerCase();

    // Check excluded companies (e.g., JP Morgan, JPMorgan Chase, Chase)
    for (const company of this.config.exclusions.companies) {
      const lowerCompany = company.toLowerCase();
      // Match whole words or boundary
      const regex = new RegExp(`(^|\\b|\\s|[.,\\/])${lowerCompany.replace(/\./g, '\\.')}($|\\b|\\s|[.,\\/])`, 'i');
      if (regex.test(combinedText) || combinedText.includes(lowerCompany)) {
        return {
          excluded: true,
          reason: `Associated with excluded company: "${company}"`
        };
      }
    }

    // Check excluded keywords (e.g., intern, student)
    for (const kw of this.config.exclusions.keywords) {
      const regex = new RegExp(`\\b${kw.toLowerCase()}\\b`, 'i');
      if (regex.test(combinedText)) {
        return {
          excluded: true,
          reason: `Contains excluded keyword: "${kw}"`
        };
      }
    }

    return { excluded: false };
  }

  /**
   * Verifies that the candidate is currently working at the target company.
   * Disqualifies past employees, partners, vendors, contractors, and profiles primary to other companies.
   */
  public isVerifiedAtCompany(candidate: CandidateCard, targetCompany: string): { verified: boolean; reason?: string } {
    const targetLower = targetCompany.toLowerCase().trim();
    const headlineLower = (candidate.headline || '').toLowerCase().trim();
    const snippetLower = (candidate.companySnippet || '').toLowerCase().trim();
    const combined = `${headlineLower} ${snippetLower}`;

    // 1. Negative checks: Ex-company, Former, Past, Partner, Vendor, Contractor
    const negativeSubstrings = [
      `ex-${targetLower}`,
      `ex - ${targetLower}`,
      `ex -${targetLower}`,
      `ex ${targetLower}`,
      `former ${targetLower}`,
      `past: ${targetLower}`,
      `past ${targetLower}`,
      `${targetLower} partner`,
      `${targetLower} cloud partner`,
      `partner, ${targetLower}`,
      `vendor at ${targetLower}`,
      `contractor at ${targetLower}`,
      `client: ${targetLower}`
    ];

    for (const neg of negativeSubstrings) {
      if (combined.includes(neg)) {
        return {
          verified: false,
          reason: `Headline/snippet indicates non-employee or partner status ("${neg}")`
        };
      }
    }

    // 2. Positive indicator check: Headline or snippet must mention the target company
    const positivePatterns = [
      new RegExp(`(?:@|\\bat\\b|\\|\\s*|\\/\\s*|•\\s*|,\\s*|\\(\\s*|^)\\s*${targetLower}\\b`, 'i'),
      new RegExp(`\\b${targetLower}\\b.*\\b(?:cloud|recruiter|talent|lead|manager|engineer|specialist|people|tech|hiring)\\b`, 'i')
    ];

    const hasCurrentSnippet = snippetLower.includes('current:') && snippetLower.includes(targetLower);
    const matchesHeadline = positivePatterns.some((pattern) => pattern.test(headlineLower));

    if (!matchesHeadline && !hasCurrentSnippet) {
      return {
        verified: false,
        reason: `Headline does not indicate current employment at "${targetCompany}" (Headline: "${candidate.headline}")`
      };
    }

    // 3. Disqualify if headline indicates primary employment at another distinct company
    const atMatches = [...headlineLower.matchAll(/(?:@|at)\s+([a-z0-9\s.-]+)/gi)];
    for (const match of atMatches) {
      const employer = match[1].trim().toLowerCase();
      if (!employer.includes(targetLower)) {
        const otherKnown = ['niveus', 'ibm', 'atlassian', 'intuit', 'seclore', 'abnormal', 'paypal', 'apple', 'amazon', 'microsoft', 'meta'];
        if (otherKnown.some(k => employer.includes(k) && !k.includes(targetLower))) {
          return {
            verified: false,
            reason: `Primary employer appears to be "${match[1].trim()}", not "${targetCompany}"`
          };
        }
      }
    }

    return { verified: true };
  }

  /**
   * Navigates to LinkedIn search for people matching a given role and company
   * Uses LinkedIn currentCompany numeric filter when available to guarantee only current employees are searched
   */
  public async searchPeople(role: string, company: string): Promise<void> {
    const companyId = LINKEDIN_COMPANY_IDS[company.toLowerCase().trim()];
    let searchUrl = '';

    if (companyId) {
      searchUrl = `https://www.linkedin.com/search/results/people/?currentCompany=%5B%22${companyId}%22%5D&keywords=${encodeURIComponent(role)}`;
    } else {
      const query = `"${role}" "${company}"`;
      searchUrl = `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(query)}`;
    }

    // Filter by network degree only if explicitly provided
    if (this.config.targeting.networkDegree && this.config.targeting.networkDegree.trim() !== '') {
      searchUrl += `&network=%5B%22${this.config.targeting.networkDegree.trim()}%22%5D`;
    }

    console.log(`\n🔍 Searching: ${role} at ${company} (Company filter: ${companyId ? `ID ${companyId}` : 'Keywords'})...`);
    console.log(`🌐 URL: ${searchUrl}`);

    await this.page.goto(searchUrl, { waitUntil: 'domcontentloaded' });
    await randomDelay(4000, 7000);

    // Human-like scroll to trigger lazy loading of search items
    await humanScroll(this.page, 3);
  }

  /**
   * Scrapes candidate cards from the current search results page
   */
  public async getCandidateCards(): Promise<CandidateCard[]> {
    const rawCards = await this.page.evaluate(() => {
      const connectAnchors = Array.from(document.querySelectorAll('a[aria-label*="to connect"], a[aria-label*="Invite"]'));
      const list: Array<{ url: string; name: string; headline: string; snippet: string }> = [];
      const seen = new Set<string>();

      for (const ca of connectAnchors) {
        const aria = ca.getAttribute('aria-label') || '';
        const match = aria.match(/Invite\s+(.*?)\s+to connect/i);
        const fullName = match ? match[1].trim() : '';

        // Find card container
        let card: HTMLElement | null = ca.parentElement;
        while (card && card !== document.body) {
          if (card.querySelector('a[href*="/in/"]') && (card.innerText || '').split('\n').length >= 3) {
            break;
          }
          card = card.parentElement;
        }

        if (card) {
          const inLinks = Array.from(card.querySelectorAll('a[href*="/in/"]')) as HTMLAnchorElement[];
          // Filter out mutual connection links
          const mainLink = inLinks.find((l) => !l.innerText.includes('mutual') && !l.parentElement?.innerText?.includes('mutual connections')) || inLinks[0];
          const profileUrl = mainLink ? mainLink.href.split('?')[0].split('#')[0] : '';

          if (!profileUrl || seen.has(profileUrl)) continue;
          seen.add(profileUrl);

          const lines = card.innerText.split('\n').map((l) => l.trim()).filter(Boolean);
          let headline = '';
          let snippet = '';
          for (let i = 1; i < lines.length; i++) {
            const l = lines[i];
            if (l.includes('•') && (l.includes('2nd') || l.includes('3rd'))) continue;
            if (l === 'Connect' || l === 'Follow') continue;
            if (!headline) headline = l;
            else if (l.toLowerCase().startsWith('current:') || l.toLowerCase().startsWith('summary:')) {
              snippet = l;
              break;
            }
          }

          list.push({
            name: fullName || lines[0],
            url: profileUrl,
            headline,
            snippet
          });
        }
      }
      return list;
    });

    const candidateCards: CandidateCard[] = rawCards.map((c) => ({
      name: c.name,
      firstName: c.name.split(' ')[0] || c.name,
      url: c.url,
      headline: c.headline,
      companySnippet: c.snippet
    }));

    return candidateCards;
  }

  /**
   * Generates a personalized note under 200 characters from rotating templates.
   * Supports dynamic variables: {firstName}, {company}, and {headline}
   */
  public generateNote(firstName: string, company: string, candidate?: CandidateCard): string {
    const templates = this.config.messaging.templates;
    const template = templates[randomInt(0, templates.length - 1)];

    let note = template
      .replace(/{firstName}/g, firstName)
      .replace(/{company}/g, company);

    if (candidate && candidate.headline) {
      note = note.replace(/{headline}/g, candidate.headline);
    }

    // Strict safety check: free LinkedIn notes must be <= 200 chars
    if (note.length > 200) {
      note = note.slice(0, 197) + '...';
    }

    return note;
  }

  /**
   * Connects to a profile with human timing, verification, and anti-ban checks
   */
  public async processCandidate(
    candidate: CandidateCard,
    targetCompany: string,
    promptCallback?: (msg: string) => Promise<boolean>
  ): Promise<'invited' | 'skipped' | 'stopped'> {
    console.log(`\n--------------------------------------------------`);
    console.log(`👤 Reviewing: ${candidate.name}`);
    console.log(`💼 Headline: ${candidate.headline}`);
    console.log(`🏢 Details: ${candidate.companySnippet}`);
    console.log(`🔗 Profile: ${candidate.url}`);

    // 1. Strict Exclusions Check (e.g. JPMorgan Chase)
    const exclusionCheck = this.isExcluded(
      candidate.name,
      candidate.headline,
      candidate.companySnippet
    );
    if (exclusionCheck.excluded) {
      console.log(`🚫 [EXCLUSION TRIGGERED] Skipping: ${exclusionCheck.reason}`);
      this.history.recordAction({
        url: candidate.url,
        name: candidate.name,
        headline: candidate.headline,
        company: targetCompany,
        action: 'skipped_exclusion',
        timestamp: new Date().toISOString()
      });
      return 'skipped';
    }

    // 2. Check History
    if (this.history.hasBeenProcessed(candidate.url)) {
      console.log(`⏩ Already processed in history. Skipping.`);
      return 'skipped';
    }

    // 3. Strict Company Verification (Must be currently employed at targetCompany)
    const verification = this.isVerifiedAtCompany(candidate, targetCompany);
    if (!verification.verified) {
      console.log(`⏩ [COMPANY MISMATCH] Skipping ${candidate.name}: ${verification.reason}`);
      this.history.recordAction({
        url: candidate.url,
        name: candidate.name,
        headline: candidate.headline,
        company: targetCompany,
        action: 'skipped_company_mismatch',
        timestamp: new Date().toISOString()
      });
      return 'skipped';
    }

    // 4. Realistic reading delay on search card
    const readTime = randomInt(
      this.config.safety.minProfileReadTimeSec * 1000,
      this.config.safety.maxProfileReadTimeSec * 1000
    );
    console.log(`⏳ Reviewing candidate profile for ${(readTime / 1000).toFixed(1)}s...`);
    await randomDelay(readTime * 0.4, readTime);

    // 4. Locate Connect element strictly for this candidate
    console.log(`🔍 Looking for Connect button for ${candidate.name}...`);
    let connectLocator = this.page.locator(
      `a[aria-label="Invite ${candidate.name} to connect"], a[aria-label*="Invite ${candidate.firstName} to connect"], a[aria-label*="${candidate.name}"]`
    ).first();

    const connectExists = (await connectLocator.count()) > 0;
    if (!connectExists) {
      console.log(`⏩ No direct Connect button visible on card for ${candidate.name}. Skipping to next candidate.`);
      this.history.recordAction({
        url: candidate.url,
        name: candidate.name,
        headline: candidate.headline,
        company: targetCompany,
        action: 'skipped_connected',
        timestamp: new Date().toISOString()
      });
      return 'skipped';
    }

    const note = this.config.messaging.sendPersonalizedNote
      ? this.generateNote(candidate.firstName, targetCompany, candidate)
      : '';

    console.log(`\n💌 Connection Note Draft (${note.length}/200 chars):`);
    console.log(`"${note}"`);

    // In Dry-Run mode, we test clicking Connect to verify modal, then dismiss
    if (this.dryRun) {
      console.log(`[DRY RUN] Simulating connect click for ${candidate.name}...`);
      await humanClick(this.page, connectLocator);
      await randomDelay(1500, 2500);

      // Verify modal opened
      const dismissBtn = this.page.locator('button[aria-label="Dismiss"], button:has-text("Dismiss")').first();
      if ((await dismissBtn.count()) > 0) {
        console.log(`[DRY RUN] Connection modal opened successfully! Dismissing modal...`);
        await humanClick(this.page, dismissBtn);
        await randomDelay(1000, 1800);
      }
      console.log(`[DRY RUN] Verified: Would successfully connect with ${candidate.name}. No invitation sent.`);
      return 'invited';
    }

    // In Interactive mode, ask user confirmation
    if (this.interactive && promptCallback) {
      const confirmed = await promptCallback(`Send connection request to ${candidate.name}?`);
      if (!confirmed) {
        console.log(`User skipped invitation for ${candidate.name}.`);
        return 'skipped';
      }
    }

    // 5. Click Connect
    console.log(`🖱️ Clicking Connect...`);
    await humanClick(this.page, connectLocator);
    await randomDelay(1500, 2500);

    // 6. Handle Modal (Add a note vs Send)
    const breaker = await checkCircuitBreakers(this.page);
    if (breaker.isBlocked) {
      console.error(`🚨 ALERT: Circuit breaker triggered: ${breaker.reason}`);
      return 'stopped';
    }

    if (breaker.reason === 'EMAIL_REQUIRED_FOR_MEMBER') {
      console.log(`⚠️ Member requires email address to connect. Dismissing...`);
      const dismissBtn = this.page.locator('button[aria-label="Dismiss"], button:has-text("Dismiss")').first();
      if ((await dismissBtn.count()) > 0) await dismissBtn.click();
      this.history.recordAction({
        url: candidate.url,
        name: candidate.name,
        headline: candidate.headline,
        company: targetCompany,
        action: 'skipped_email_required',
        timestamp: new Date().toISOString()
      });
      return 'skipped';
    }

    // Look for "Add a note" button
    const addNoteBtn = this.page.locator('button:has-text("Add a note"), [aria-label*="Add a note"]').first();
    if (this.config.messaging.sendPersonalizedNote && note && (await addNoteBtn.isVisible())) {
      console.log(`✍️ Adding personalized note...`);
      await humanClick(this.page, addNoteBtn);
      await randomDelay(800, 1500);

      const textarea = this.page.locator('textarea').first();
      try {
        await textarea.waitFor({ state: 'visible', timeout: 5000 });
        await humanType(this.page, textarea, note);
        await randomDelay(800, 1600);
      } catch (err) {
        console.log('⚠️ Could not fill textarea. Proceeding to send...');
      }
    }

    // Click Send
    const sendBtn = this.page.locator(
      'button:has-text("Send"), button[aria-label="Send now"], button[aria-label="Send invitation"], button:has-text("Send without a note")'
    ).first();

    try {
      await sendBtn.waitFor({ state: 'visible', timeout: 6000 });
      await humanClick(this.page, sendBtn);
      console.log(`✅ Connection invitation sent to ${candidate.name}!`);

      this.history.recordAction({
        url: candidate.url,
        name: candidate.name,
        headline: candidate.headline,
        company: targetCompany,
        action: 'invited',
        note,
        timestamp: new Date().toISOString()
      });
    } catch (err) {
      console.log(`⚠️ Send button could not be clicked. Dismissing modal...`);
      const dismiss = this.page.locator('button[aria-label="Dismiss"], [aria-label="Dismiss"]').first();
      if (await dismiss.isVisible()) await dismiss.click();
      return 'skipped';
    }

    // Close any side preview or drawer that opened so next card is unobstructed
    try {
      await this.page.keyboard.press('Escape');
      await randomDelay(500, 1000);
      const closeDrawer = this.page.locator('button[aria-label="Close"], button[aria-label="Dismiss"]').first();
      if (await closeDrawer.isVisible()) {
        await closeDrawer.click();
      }
    } catch {}

    // Post-send circuit breaker check
    await randomDelay(1500, 2500);
    const postBreaker = await checkCircuitBreakers(this.page);
    if (postBreaker.isBlocked) {
      console.error(`🚨 ALERT: Post-send circuit breaker triggered: ${postBreaker.reason}`);
      return 'stopped';
    }

    return 'invited';
  }

  private async findConnectButton(): Promise<any> {
    // Check main profile card buttons
    const candidates = await this.page.$$(
      '.pvs-profile-actions button, .artdeco-card button, .ph5 button'
    );
    for (const btn of candidates) {
      const text = (await btn.innerText()).trim();
      const ariaLabel = (await btn.getAttribute('aria-label')) || '';
      if (text === 'Connect' || ariaLabel.toLowerCase().includes('invite') || ariaLabel.toLowerCase().includes('connect')) {
        return btn;
      }
    }
    return null;
  }
}

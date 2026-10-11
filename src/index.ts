import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import { chromium, Browser, BrowserContext, Page } from 'playwright';
import { HistoryTracker } from './history.js';
import { LinkedInAutomator, AutomationConfig } from './linkedin.js';
import { randomDelay, randomInt } from './humanBehavior.js';

function askQuestion(query: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  return new Promise((resolve) => {
    rl.question(query, (ans) => {
      rl.close();
      resolve(ans.trim());
    });
  });
}

async function promptConfirmation(msg: string): Promise<boolean> {
  const ans = await askQuestion(`\n👉 ${msg} [Y/n]: `);
  return ans === '' || ans.toLowerCase() === 'y' || ans.toLowerCase() === 'yes';
}

async function main() {
  console.log(`
=====================================================
🚀 LinkedIn Career Networking Automator
🛡️ Anti-Bot Safeguards & Safe Quota Protection
=====================================================
`);

  // Load config
  const configPath = path.join(process.cwd(), 'config.json');
  if (!fs.existsSync(configPath)) {
    console.error(`❌ config.json not found at ${configPath}`);
    process.exit(1);
  }
  const config: AutomationConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

  // Parse command line arguments
  const args = process.argv.slice(2);
  const isDryRun = args.includes('--dry-run');
  const isAuto = args.includes('--auto');
  const isInteractive = isAuto ? false : !args.includes('--no-interactive');
  const usePersistentProfile = args.includes('--profile');
  const customRole = args.find((_, i) => args[i - 1] === '--role');
  const customCompany = args.find((_, i) => args[i - 1] === '--company');

  // Initialize History
  const history = new HistoryTracker();
  const sentToday = history.getInvitesSentToday();
  const remainingToday = Math.max(0, config.safety.maxDailyInvites - sentToday);

  console.log(`📊 Today's Quota Status:`);
  console.log(`   - Sent Today: ${sentToday} invites`);
  console.log(`   - Daily Limit: ${config.safety.maxDailyInvites} invites`);
  console.log(`   - Remaining: ${remainingToday} invites`);
  console.log(`Mode: ${isDryRun ? '🟡 DRY RUN (no invites sent)' : isInteractive ? '🟢 INTERACTIVE (confirms each invite)' : '🔵 AUTONOMOUS'}`);
  console.log(`Exclusion active: JP Morgan & affiliates strictly blocked.`);

  if (remainingToday <= 0 && !isDryRun) {
    console.log(`\n🛑 Daily limit reached (${sentToday}/${config.safety.maxDailyInvites}). Exiting to protect your LinkedIn account!`);
    console.log(`Run with --dry-run if you want to inspect search results without sending invites.`);
    return;
  }

  // Connect to Chrome
  let browser: Browser | null = null;
  let context: BrowserContext;
  let page: Page;

  try {
    const sessionDir = path.join(process.cwd(), 'chrome-session');
    console.log(`🌐 Launching Chrome with authenticated session (${sessionDir})...`);
    context = await chromium.launchPersistentContext(sessionDir, {
      channel: 'chrome',
      headless: false,
      viewport: null,
      args: ['--disable-blink-features=AutomationControlled', '--start-maximized']
    });
    page = context.pages()[0] || (await context.newPage());

    const automator = new LinkedInAutomator(page, config, history, {
      dryRun: isDryRun,
      interactive: isInteractive
    });

    // Verify logged in
    console.log(`🔐 Verifying LinkedIn session...`);
    const isLoggedIn = await automator.verifyLogin();
    if (!isLoggedIn) {
      console.error(`Please log in to LinkedIn on the opened Chrome window and re-run.`);
      return;
    }
    console.log(`✅ LinkedIn authenticated successfully.`);

    const roles = customRole ? [customRole] : config.targeting.roles;
    const companies = customCompany ? [customCompany] : config.targeting.targetCompanies;

    let invitesSentThisSession = 0;
    let profilesSkippedThisSession = 0;

    for (const company of companies) {
      for (const role of roles) {
        if (!isDryRun && history.getInvitesSentToday() >= config.safety.maxDailyInvites) {
          console.log(`\n🛑 Daily limit reached (${config.safety.maxDailyInvites}). Stopping safely.`);
          break;
        }

        await automator.searchPeople(role, company);
        const candidates = await automator.getCandidateCards();
        console.log(`📋 Found ${candidates.length} candidates for ${role} at ${company}.`);

        try {
          const fresh = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
          config.safety = fresh.safety;
        } catch (_) {}

        for (const candidate of candidates) {
          try {
            const fresh = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
            config.safety = fresh.safety;
          } catch (_) {}

          if (!isDryRun && history.getInvitesSentToday() >= config.safety.maxDailyInvites) {
            console.log(`\n🛑 Daily limit reached (${config.safety.maxDailyInvites}). Halting session.`);
            break;
          }

          const result = await automator.processCandidate(
            candidate,
            company,
            isInteractive ? promptConfirmation : undefined
          );

          if (result === 'stopped') {
            console.log(`🚨 Stopping automation due to circuit-breaker safety trigger.`);
            return;
          }

          if (result === 'invited') {
            invitesSentThisSession++;
            if (!isDryRun) {
              const delaySec = randomInt(
                config.safety.minDelayBetweenInvitesSec,
                config.safety.maxDelayBetweenInvitesSec
              );
              console.log(`\n⏳ Human pacing: Waiting ${delaySec}s before reviewing next candidate to maintain natural activity...`);
              await randomDelay(delaySec * 1000, delaySec * 1000);
            }
          } else {
            profilesSkippedThisSession++;
            await randomDelay(3000, 6000);
          }
        }
      }
    }

    console.log(`
=====================================================
🏁 Session Complete!
   - Invites Sent: ${invitesSentThisSession}
   - Skipped Profiles: ${profilesSkippedThisSession}
   - Total Sent Today: ${history.getInvitesSentToday()}/${config.safety.maxDailyInvites}
=====================================================
`);
  } catch (error) {
    console.error('Unexpected error during automation run:', error);
  } finally {
    if (browser) {
      // Disconnect CDP session without closing the user's Chrome window
      await browser.close().catch(() => {});
    }
  }
}

main().catch(console.error);

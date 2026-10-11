import * as fs from 'fs';
import * as path from 'path';
import { chromium } from 'playwright';
import { humanType, humanClick, randomDelay } from './humanBehavior.js';

// Parse .env
function loadEnv(): { email?: string; password?: string } {
  const envPath = path.join(process.cwd(), '.env');
  if (!fs.existsSync(envPath)) return {};
  const content = fs.readFileSync(envPath, 'utf-8');
  const result: { [key: string]: string } = {};
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
      const idx = trimmed.indexOf('=');
      const k = trimmed.slice(0, idx).trim();
      const v = trimmed.slice(idx + 1).trim();
      result[k] = v;
    }
  }
  return {
    email: result['LINKEDIN_EMAIL'],
    password: result['LINKEDIN_PASSWORD']
  };
}

async function login() {
  console.log(`
=====================================================
🔑 LinkedIn Login Manager
=====================================================
`);

  const { email, password } = loadEnv();
  if (!email || !password) {
    console.error('❌ Missing LINKEDIN_EMAIL or LINKEDIN_PASSWORD in .env');
    process.exit(1);
  }

  const profileDir = path.join(process.cwd(), 'chrome-session');
  console.log(`🌐 Launching Chrome with session directory (${profileDir})...`);

  const context = await chromium.launchPersistentContext(profileDir, {
    channel: 'chrome',
    headless: false,
    viewport: { width: 1280, height: 800 },
    args: ['--disable-blink-features=AutomationControlled', '--start-maximized']
  });

  const page = context.pages()[0] || (await context.newPage());

  try {
    console.log(`📍 Navigating to LinkedIn login page...`);
    await page.goto('https://www.linkedin.com/login', { waitUntil: 'domcontentloaded' });
    await randomDelay(2000, 3500);

    console.log(`🌐 Current URL after navigation: ${page.url()}`);
    console.log(`📄 Page title: "${await page.title()}"`);

    // Check if already logged in
    if (page.url().includes('/feed') || (await page.$('#global-nav'))) {
      console.log(`✅ Already logged in to LinkedIn! Your session is active.`);
      await context.close();
      return;
    }

    console.log(`✍️ Looking for visible email input...`);
    const usernameInput = page.locator('input[type="email"]:visible, input#username:visible, input[autocomplete="username"]:visible').first();
    await usernameInput.waitFor({ state: 'visible', timeout: 10000 });
    await humanType(page, usernameInput, email);

    await randomDelay(800, 1500);

    console.log(`✍️ Looking for visible password input...`);
    const passwordInput = page.locator('input[type="password"]:visible, input#password:visible, input[autocomplete="current-password"]:visible').first();
    await passwordInput.waitFor({ state: 'visible', timeout: 10000 });
    await humanType(page, passwordInput, password);

    await randomDelay(1000, 2000);

    console.log(`🖱️ Clicking Sign In...`);
    const submitBtn = page.locator('button[type="submit"]:visible, button:has-text("Sign in"):visible').first();
    await humanClick(page, submitBtn);

    console.log(`⏳ Waiting for authentication response...`);
    await randomDelay(3000, 5000);

    const currentUrl = page.url();
    if (currentUrl.includes('/feed') || (await page.$('#global-nav'))) {
      console.log(`\n🎉 LOGIN SUCCESSFUL!`);
      console.log(`Your session has been persistently saved in ./chrome-session.`);
      console.log(`All future automations will run with this authenticated profile!`);
    } else if (currentUrl.includes('login.live.com')) {
      console.log(`\n👉 Microsoft Single Sign-On (login.live.com) detected!`);
      console.log(`Please complete the prompt or click "Sign in" in the opened Chrome window.`);
      console.log(`Waiting up to 3 minutes for you to finish in the browser...`);

      try {
        await page.waitForURL((url) => url.toString().includes('linkedin.com/feed') || url.toString().includes('linkedin.com/mynetwork'), {
          timeout: 180000
        });
        console.log(`\n🎉 LOGIN SUCCESSFUL!`);
        console.log(`Your authenticated session has been saved permanently in ./chrome-session.`);
      } catch (e) {
        console.log(`Timeout waiting. If you completed sign-in, your session is saved.`);
      }
    } else if (currentUrl.includes('checkpoint') || currentUrl.includes('challenge')) {
      console.log(`\n⚠️ Security verification / PIN challenge detected.`);
      console.log(`Please solve the puzzle or enter the code sent to your email directly in the open Chrome window.`);
      console.log(`Waiting up to 3 minutes for you to complete verification...`);

      try {
        await page.waitForURL((url) => url.toString().includes('linkedin.com/feed'), { timeout: 180000 });
        console.log(`\n🎉 Verification completed and login successful! Session saved.`);
      } catch (e) {
        console.log(`Timeout waiting for verification.`);
      }
    } else {
      console.log(`Current page: ${page.url()}`);
      // Wait another moment to check if redirected
      await randomDelay(3000, 5000);
      if (page.url().includes('/feed')) {
        console.log(`🎉 Login successful!`);
      } else {
        console.log(`Please check the browser window to see if any additional step is required.`);
      }
    }
  } catch (err: any) {
    console.error(`Login error:`, err.message);
  } finally {
    // Keep context alive for a brief moment before exiting
    await randomDelay(2000, 3000);
    await context.close();
  }
}

login().catch(console.error);

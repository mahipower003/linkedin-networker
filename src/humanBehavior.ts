import { Page, Locator } from 'playwright';

/**
 * Generates a random integer between min and max (inclusive)
 */
export function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Pauses execution for a randomized duration between minMs and maxMs
 */
export async function randomDelay(minMs: number, maxMs: number): Promise<number> {
  const delay = randomInt(minMs, maxMs);
  await new Promise((resolve) => setTimeout(resolve, delay));
  return delay;
}

/**
 * Moves mouse naturally and clicks an element after a realistic hover pause
 */
export async function humanClick(page: Page, locator: Locator): Promise<void> {
  try {
    await locator.scrollIntoViewIfNeeded().catch(() => {});
    await randomDelay(250, 500); // realistic hover hesitation
    await locator.click({ delay: randomInt(70, 120), timeout: 6000 });
  } catch (err) {
    // If an overlay/sticky element temporarily intercepts, retry with force: true
    await randomDelay(300, 600);
    await locator.click({ force: true, timeout: 6000 });
  }
}

/**
 * Simulates human typing with variable keystroke speed and natural thinking pauses
 */
export async function humanType(page: Page, locator: Locator, text: string): Promise<void> {
  await locator.focus();
  await randomDelay(200, 500);

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    await locator.pressSequentially(char, { delay: randomInt(45, 130) });

    // Occasional brief thinking pause after punctuation or words
    if (char === ' ' && Math.random() < 0.25) {
      await randomDelay(180, 450);
    } else if (['.', ',', '!', '?'].includes(char)) {
      await randomDelay(300, 650);
    }
  }
  await randomDelay(300, 700);
}

/**
 * Mimics a human scrolling a feed or search result page:
 * scrolls in uneven increments, pauses, and occasionally backtracks slightly.
 */
export async function humanScroll(page: Page, scrollCount: number = 3): Promise<void> {
  for (let i = 0; i < scrollCount; i++) {
    const scrollDelta = randomInt(200, 450);
    await page.mouse.wheel(0, scrollDelta);
    await randomDelay(800, 2200);

    // 20% chance of small backtrack up as humans frequently do while reading
    if (Math.random() < 0.2) {
      await page.mouse.wheel(0, -randomInt(60, 150));
      await randomDelay(500, 1000);
    }
  }
}

export interface CircuitBreakerStatus {
  isBlocked: boolean;
  reason?: string;
}

/**
 * Inspects page for LinkedIn rate limit modals, weekly limits, email requirements, or security verification
 */
export async function checkCircuitBreakers(page: Page): Promise<CircuitBreakerStatus> {
  try {
    const content = await page.content();

    if (
      content.includes("You've reached the weekly invitation limit") ||
      content.includes("out of invitations for this week") ||
      content.includes("invitation limit reached")
    ) {
      return {
        isBlocked: true,
        reason: 'WEEKLY_INVITATION_LIMIT_REACHED: LinkedIn weekly connection quota hit.'
      };
    }

    if (
      content.includes('Please enter this person\'s email') ||
      content.includes('Enter the member\'s email address')
    ) {
      return {
        isBlocked: false, // Not account blocking, but this specific user requires email
        reason: 'EMAIL_REQUIRED_FOR_MEMBER'
      };
    }

    if (
      content.includes('Quick security check') ||
      content.includes('Please solve this puzzle') ||
      content.includes('unusual activity') ||
      content.includes('checkpoint/challenge')
    ) {
      return {
        isBlocked: true,
        reason: 'SECURITY_CHALLENGE_DETECTED: LinkedIn has presented a CAPTCHA or security verification.'
      };
    }
  } catch (err) {
    // Suppress if page navigated
  }

  return { isBlocked: false };
}

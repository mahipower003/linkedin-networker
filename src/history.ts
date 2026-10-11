import * as fs from 'fs';
import * as path from 'path';

export interface HistoryRecord {
  url: string;
  name: string;
  headline: string;
  company?: string;
  action: 'invited' | 'skipped_exclusion' | 'skipped_connected' | 'skipped_pending' | 'skipped_email_required' | 'skipped_company_mismatch';
  note?: string;
  timestamp: string;
}

export class HistoryTracker {
  private filePath: string;
  private records: Map<string, HistoryRecord> = new Map();

  constructor(dataDir: string = path.join(process.cwd(), 'data')) {
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    this.filePath = path.join(dataDir, 'history.json');
    this.load();
  }

  private load(): void {
    if (fs.existsSync(this.filePath)) {
      try {
        const raw = fs.readFileSync(this.filePath, 'utf-8');
        const list: HistoryRecord[] = JSON.parse(raw);
        for (const item of list) {
          const key = this.normalizeUrl(item.url);
          this.records.set(key, item);
        }
      } catch (err) {
        console.error('Warning: could not parse history.json, starting fresh.', err);
      }
    }
  }

  private save(): void {
    const list = Array.from(this.records.values());
    fs.writeFileSync(this.filePath, JSON.stringify(list, null, 2), 'utf-8');
  }

  public normalizeUrl(url: string): string {
    try {
      const parsed = new URL(url);
      return `${parsed.origin}${parsed.pathname}`.replace(/\/$/, '').toLowerCase();
    } catch {
      return url.toLowerCase().replace(/\/$/, '');
    }
  }

  public hasBeenProcessed(url: string): boolean {
    const key = this.normalizeUrl(url);
    return this.records.has(key);
  }

  public getRecord(url: string): HistoryRecord | undefined {
    const key = this.normalizeUrl(url);
    return this.records.get(key);
  }

  public recordAction(record: HistoryRecord): void {
    const key = this.normalizeUrl(record.url);
    this.records.set(key, record);
    this.save();
  }

  public getInvitesSentToday(): number {
    const today = new Date().toISOString().slice(0, 10);
    let count = 0;
    for (const item of this.records.values()) {
      if (item.action === 'invited' && item.timestamp.startsWith(today)) {
        count++;
      }
    }
    return count;
  }
}

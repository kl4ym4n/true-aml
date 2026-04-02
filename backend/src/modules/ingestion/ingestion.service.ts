import { createReadStream, existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import type { Readable } from 'node:stream';
import axios, { isAxiosError } from 'axios';
import prisma from '../../config/database';
import { requireFromProjectRoot } from '../../lib/require-from-root';
import type { BlacklistCategory } from '@prisma/client';
import { AddressRecord, clamp01, normalizeAddress } from './ingestion.types';
import { mergeAddressRecords, pickStrongerCategory } from './ingestion.utils';
import {
  openSdnEnhancedXmlFromLocalZipFile,
  openSdnEnhancedXmlFromZip,
  parseOfacEnhancedDigitalCurrencyStream,
} from './ofac-enhanced-xml';
import { byteProgressTransform, ingestLog, ingestWarn } from './ingestion.log';

const { parse } = requireFromProjectRoot('csv-parse') as typeof import('csv-parse');
type CsvParseOptions = import('csv-parse').Options;

function parseCsvString(
  csv: string,
  options: CsvParseOptions
): Promise<Record<string, string>[]> {
  return new Promise((resolve, reject) => {
    parse(csv, options, (err, records) => {
      if (err) reject(err);
      else resolve((records ?? []) as Record<string, string>[]);
    });
  });
}

function formatIngestHttpError(err: unknown, what: string): Error {
  if (isAxiosError(err)) {
    const url = err.config?.url ?? '(unknown URL)';
    const status = err.response?.status;
    const code = err.code;
    const parts = [
      what,
      status != null ? `HTTP ${status}` : null,
      code ? `code=${code}` : null,
      err.message,
    ].filter(Boolean);
    const hint =
      code === 'ECONNRESET' || code === 'ECONNREFUSED' || code === 'ETIMEDOUT'
        ? ' — network/VPN/firewall may block OFAC or AWS GovCloud (redirect target). ' +
          'Workaround: download SDN_ENHANCED.ZIP elsewhere, put it on disk, set OFAC_SDN_ZIP_PATH=/absolute/or/relative/path and unset OFAC_SDN_ZIP_URL / OFAC_USE_OFFICIAL_SDN.'
        : '';
    return new Error(`${parts.join(' · ')} (${url})${hint}`);
  }
  return err instanceof Error ? err : new Error(String(err));
}

function resolveUserPath(filePath: string): string {
  return path.isAbsolute(filePath)
    ? filePath
    : path.resolve(process.cwd(), filePath);
}

/** Official OFAC SDN Enhanced export (ZIP contains ~100MB XML). */
export const DEFAULT_OFAC_SDN_ENHANCED_ZIP_URL =
  'https://sanctionslistservice.ofac.treas.gov/api/PublicationPreview/exports/SDN_ENHANCED.ZIP';

function toPrismaCategory(cat: AddressRecord['category']): BlacklistCategory {
  switch (cat) {
    case 'sanctions':
      return 'SANCTION';
    case 'scam':
      return 'SCAM';
    case 'phishing':
      return 'PHISHING';
    case 'suspicious':
      return 'SUSPICIOUS';
  }
}

function toRiskScore(confidence01: number): number {
  return Math.round(clamp01(confidence01) * 100);
}

export interface IngestionRunResult {
  upserted: number;
  skipped: number;
  sources: Record<string, { upserted: number; skipped: number }>;
}

export class IngestionService {
  private extractAddressesFromLine(line: string): string[] {
    // Find TRON (T...) and EVM (0x...) addresses anywhere in the line.
    const matches = line.match(/0x[0-9a-fA-F]{40}|T[a-zA-Z0-9]{30,49}/g);
    return matches ? Array.from(new Set(matches)) : [];
  }

  async ingestAll(input: {
    ofacCsvPath?: string;
    /** Local SDN_ENHANCED.ZIP (offline; skips URL download). */
    ofacSdnZipPath?: string;
    /** Local SDN_ENHANCED.XML file (offline). */
    ofacSdnXmlPath?: string;
    /** Stream SDN_ENHANCED.XML from this URL (large download). */
    ofacSdnXmlUrl?: string;
    /** Download SDN_ENHANCED.ZIP and extract XML (preferred vs raw XML). */
    ofacSdnZipUrl?: string;
    githubSources: string[];
    chainabuseApiKey?: string;
  }): Promise<IngestionRunResult> {
    const sources: IngestionRunResult['sources'] = {};
    let upserted = 0;
    let skipped = 0;

    ingestLog('ingestAll: starting', {
      ofacCsv: Boolean(input.ofacCsvPath),
      ofacSdnZipFile: Boolean(input.ofacSdnZipPath),
      ofacSdnXmlFile: Boolean(input.ofacSdnXmlPath),
      ofacSdnZip: Boolean(input.ofacSdnZipUrl),
      ofacSdnXml: Boolean(input.ofacSdnXmlUrl),
      githubSources: input.githubSources.length,
      chainabuse: Boolean(input.chainabuseApiKey),
    });

    if (input.ofacCsvPath) {
      ingestLog('Step: OFAC CSV file', { path: input.ofacCsvPath });
      const r = await this.ingestOfacCsv(input.ofacCsvPath);
      sources[r.source] = { upserted: r.upserted, skipped: r.skipped };
      upserted += r.upserted;
      skipped += r.skipped;
      ingestLog('Step done: OFAC CSV', {
        source: r.source,
        upserted: r.upserted,
        skipped: r.skipped,
      });
    }

    // Local ZIP > remote ZIP > local XML > remote XML.
    if (input.ofacSdnZipPath) {
      const p = resolveUserPath(input.ofacSdnZipPath);
      ingestLog(
        'Step: OFAC SDN Enhanced (local ZIP file → extract → parse XML)',
        {
          path: p,
        }
      );
      const r = await this.ingestOfacSdnEnhancedFromZipFile(p);
      sources[r.source] = { upserted: r.upserted, skipped: r.skipped };
      upserted += r.upserted;
      skipped += r.skipped;
      ingestLog('Step done: OFAC ZIP (file)', {
        source: r.source,
        upserted: r.upserted,
        skipped: r.skipped,
      });
    } else if (input.ofacSdnZipUrl) {
      ingestLog(
        'Step: OFAC SDN Enhanced (ZIP download → extract → parse XML)',
        {
          url: input.ofacSdnZipUrl,
        }
      );
      const r = await this.ingestOfacSdnEnhancedFromZipUrl(input.ofacSdnZipUrl);
      sources[r.source] = { upserted: r.upserted, skipped: r.skipped };
      upserted += r.upserted;
      skipped += r.skipped;
      ingestLog('Step done: OFAC ZIP', {
        source: r.source,
        upserted: r.upserted,
        skipped: r.skipped,
      });
    } else if (input.ofacSdnXmlPath) {
      const p = resolveUserPath(input.ofacSdnXmlPath);
      ingestLog('Step: OFAC SDN Enhanced (local XML file)', { path: p });
      const r = await this.ingestOfacSdnEnhancedFromXmlFile(p);
      sources[r.source] = { upserted: r.upserted, skipped: r.skipped };
      upserted += r.upserted;
      skipped += r.skipped;
      ingestLog('Step done: OFAC XML (file)', {
        source: r.source,
        upserted: r.upserted,
        skipped: r.skipped,
      });
    } else if (input.ofacSdnXmlUrl) {
      ingestLog('Step: OFAC SDN Enhanced (raw XML stream)', {
        url: input.ofacSdnXmlUrl,
      });
      const r = await this.ingestOfacSdnEnhancedFromXmlUrl(input.ofacSdnXmlUrl);
      sources[r.source] = { upserted: r.upserted, skipped: r.skipped };
      upserted += r.upserted;
      skipped += r.skipped;
      ingestLog('Step done: OFAC XML', {
        source: r.source,
        upserted: r.upserted,
        skipped: r.skipped,
      });
    }

    for (const src of input.githubSources) {
      ingestLog('Step: GitHub blacklist', { spec: src.slice(0, 120) });
      const r = await this.ingestGithubSource(src);
      sources[r.source] = { upserted: r.upserted, skipped: r.skipped };
      upserted += r.upserted;
      skipped += r.skipped;
      ingestLog('Step done: GitHub', {
        source: r.source,
        upserted: r.upserted,
        skipped: r.skipped,
      });
    }

    if (input.chainabuseApiKey) {
      ingestLog('Step: Chainabuse API');
      const r = await this.ingestChainabuse({ apiKey: input.chainabuseApiKey });
      sources[r.source] = { upserted: r.upserted, skipped: r.skipped };
      upserted += r.upserted;
      skipped += r.skipped;
      ingestLog('Step done: Chainabuse', {
        source: r.source,
        upserted: r.upserted,
        skipped: r.skipped,
      });
    }

    ingestLog('ingestAll: finished', {
      totalUpserted: upserted,
      totalSkipped: skipped,
    });
    return { upserted, skipped, sources };
  }

  /**
   * OFAC: CSV ingestion (expects at least one column that contains TRON addresses).
   * Env example: OFAC_CSV_PATH=data/ofac.csv
   */
  async ingestOfacCsv(
    filePath: string,
    opts?: { source?: string; confidence?: number }
  ): Promise<{ source: string; upserted: number; skipped: number }> {
    const source = opts?.source ?? 'ofac';
    const confidence = clamp01(opts?.confidence ?? 1.0);
    let csv: string;
    try {
      csv = await readFile(filePath, 'utf8');
    } catch (e) {
      throw new Error(
        `OFAC CSV: cannot read file "${filePath}": ${e instanceof Error ? e.message : String(e)}`
      );
    }

    const rows = await parseCsvString(csv, {
      columns: true,
      skip_empty_lines: true,
      relax_quotes: true,
      relax_column_count: true,
      trim: true,
    });

    const records: AddressRecord[] = [];
    for (const row of rows) {
      for (const v of Object.values(row)) {
        const addr = normalizeAddress(String(v));
        if (!addr) continue;
        records.push({
          address: addr,
          category: 'sanctions',
          source,
          confidence,
        });
      }
    }

    ingestLog('OFAC CSV: parsed rows', {
      rows: rows.length,
      recordsBeforeUpsert: records.length,
    });
    return this.upsertRecords(records, { isDerived: false });
  }

  /**
   * OFAC SDN Enhanced XML (official API). Streams the file; only TRON/EVM-shaped
   * addresses that pass {@link normalizeAddress} are stored (DB VarChar(42)).
   */
  async ingestOfacSdnEnhancedFromXmlUrl(
    xmlUrl: string,
    opts?: { source?: string; confidence?: number }
  ): Promise<{ source: string; upserted: number; skipped: number }> {
    const source = opts?.source ?? 'ofac:sdn_enhanced';
    const confidence = clamp01(opts?.confidence ?? 1.0);
    let res: Awaited<ReturnType<typeof axios.get<Readable>>>;
    try {
      ingestLog(
        'OFAC XML: HTTP GET (stream) — until the next line, waiting for TLS + redirect (often to S3); can take 30–120s'
      );
      res = await axios.get<Readable>(xmlUrl, {
        responseType: 'stream',
        timeout: 600_000,
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
        validateStatus: s => s >= 200 && s < 300,
      });
    } catch (e) {
      throw formatIngestHttpError(e, 'OFAC SDN XML download failed');
    }
    ingestLog('OFAC XML: response headers OK', {
      status: res.status,
      contentLength: res.headers['content-length'] ?? 'unknown',
      url: res.config.url,
    });
    const xmlProgress = byteProgressTransform('OFAC XML', 10);
    res.data.pipe(xmlProgress);
    const raw = await parseOfacEnhancedDigitalCurrencyStream(xmlProgress);
    const records = this.recordsFromOfacRawAddresses(raw, source, confidence);
    return this.upsertRecords(records, { isDerived: false });
  }

  /**
   * OFAC SDN Enhanced as ZIP (smaller on the wire than raw XML).
   */
  async ingestOfacSdnEnhancedFromZipUrl(
    zipUrl: string,
    opts?: { source?: string; confidence?: number }
  ): Promise<{ source: string; upserted: number; skipped: number }> {
    const source = opts?.source ?? 'ofac:sdn_enhanced';
    const confidence = clamp01(opts?.confidence ?? 1.0);
    let res: Awaited<ReturnType<typeof axios.get<Readable>>>;
    try {
      ingestLog(
        'OFAC ZIP: HTTP GET (stream) — until the next line, waiting for TLS + redirect (often to AWS GovCloud S3); can take 30–120s'
      );
      res = await axios.get<Readable>(zipUrl, {
        responseType: 'stream',
        timeout: 600_000,
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
        validateStatus: s => s >= 200 && s < 300,
      });
    } catch (e) {
      throw formatIngestHttpError(e, 'OFAC SDN ZIP download failed');
    }
    ingestLog('OFAC ZIP: response headers OK', {
      status: res.status,
      contentLength: res.headers['content-length'] ?? 'unknown',
      url: res.config.url,
    });
    ingestLog(
      'OFAC ZIP: reading body (~6 MB) — unzip + XML parse come next; large XML parse can take several minutes with sparse logs'
    );
    const zipProgress = byteProgressTransform('OFAC ZIP', 2);
    ingestLog(
      'OFAC ZIP: attach unzipper first, then HTTP body (order matters — avoids stall after ~1MB)'
    );
    const xmlFromZip = openSdnEnhancedXmlFromZip(zipProgress);
    res.data.pipe(zipProgress);
    let xmlStream: Readable;
    try {
      xmlStream = await xmlFromZip;
    } catch (e) {
      throw new Error(
        `OFAC ZIP: could not open SDN_ENHANCED.XML inside archive: ${e instanceof Error ? e.message : String(e)}`
      );
    }
    const raw = await parseOfacEnhancedDigitalCurrencyStream(xmlStream);
    const records = this.recordsFromOfacRawAddresses(raw, source, confidence);
    return this.upsertRecords(records, { isDerived: false });
  }

  /**
   * Same as {@link ingestOfacSdnEnhancedFromZipUrl} but reads an on-disk ZIP (e.g. manual download
   * when OFAC hosts are unreachable from your network).
   */
  async ingestOfacSdnEnhancedFromZipFile(
    zipPath: string,
    opts?: { source?: string; confidence?: number }
  ): Promise<{ source: string; upserted: number; skipped: number }> {
    const source = opts?.source ?? 'ofac:sdn_enhanced';
    const confidence = clamp01(opts?.confidence ?? 1.0);
    if (!existsSync(zipPath)) {
      throw new Error(
        `OFAC SDN ZIP file not found: ${zipPath} (check OFAC_SDN_ZIP_PATH)`
      );
    }
    ingestLog('OFAC ZIP: reading local file', { path: zipPath });
    try {
      const st = statSync(zipPath);
      ingestLog('OFAC ZIP: file on disk', {
        sizeMib: (st.size / 1024 / 1024).toFixed(2),
      });
    } catch {
      /* ignore stat errors; stream will fail if missing */
    }
    let xmlStream: Readable;
    try {
      xmlStream = await openSdnEnhancedXmlFromLocalZipFile(zipPath);
    } catch (e) {
      throw new Error(
        `OFAC ZIP: could not open SDN_ENHANCED.XML inside archive: ${e instanceof Error ? e.message : String(e)}`
      );
    }
    const raw = await parseOfacEnhancedDigitalCurrencyStream(xmlStream);
    const records = this.recordsFromOfacRawAddresses(raw, source, confidence);
    return this.upsertRecords(records, { isDerived: false });
  }

  /**
   * Same as {@link ingestOfacSdnEnhancedFromXmlUrl} but reads a local XML file.
   */
  async ingestOfacSdnEnhancedFromXmlFile(
    xmlPath: string,
    opts?: { source?: string; confidence?: number }
  ): Promise<{ source: string; upserted: number; skipped: number }> {
    const source = opts?.source ?? 'ofac:sdn_enhanced';
    const confidence = clamp01(opts?.confidence ?? 1.0);
    if (!existsSync(xmlPath)) {
      throw new Error(
        `OFAC SDN XML file not found: ${xmlPath} (check OFAC_SDN_XML_PATH)`
      );
    }
    ingestLog('OFAC XML: reading local file', { path: xmlPath });
    const rs = createReadStream(xmlPath);
    const xmlProgress = byteProgressTransform('OFAC XML (local)', 10);
    rs.pipe(xmlProgress);
    const raw = await parseOfacEnhancedDigitalCurrencyStream(xmlProgress);
    const records = this.recordsFromOfacRawAddresses(raw, source, confidence);
    return this.upsertRecords(records, { isDerived: false });
  }

  private recordsFromOfacRawAddresses(
    raw: string[],
    source: string,
    confidence: number
  ): AddressRecord[] {
    const records: AddressRecord[] = [];
    for (const r of raw) {
      const addr = normalizeAddress(r);
      if (!addr) continue;
      records.push({
        address: addr,
        category: 'sanctions',
        source,
        confidence,
      });
    }
    const dropped = raw.length - records.length;
    if (dropped > 0) {
      ingestWarn(
        'OFAC: dropped addresses that are not TRON/EVM (or fail length checks); only those are stored',
        { rawFromXml: raw.length, keptAfterNormalize: records.length, dropped }
      );
    } else {
      ingestLog('OFAC: normalize OK', {
        rawFromXml: raw.length,
        keptAfterNormalize: records.length,
      });
    }
    return records;
  }

  /**
   * GitHub source format (GITHUB_BLACKLIST_SOURCES):
   * - `https://raw.../list.txt|scam|0.85|github:repo`
   *   url | category | confidence | sourceOverride (optional)
   */
  async ingestGithubSource(
    sourceSpec: string
  ): Promise<{ source: string; upserted: number; skipped: number }> {
    const parts = sourceSpec.split('|').map(p => p.trim());
    const url = parts[0];
    const category = (parts[1] || 'suspicious') as AddressRecord['category'];
    const confidence = clamp01(parts[2] ? Number(parts[2]) : 0.7);
    const source = parts[3] || `github:${url}`;

    let res: Awaited<ReturnType<typeof axios.get<string>>>;
    try {
      res = await axios.get<string>(url, {
        responseType: 'text',
        timeout: 120_000,
      });
    } catch (e) {
      throw formatIngestHttpError(e, 'GitHub blacklist fetch failed');
    }
    const lines = res.data.split(/\r?\n/);

    const records: AddressRecord[] = [];
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const found = this.extractAddressesFromLine(trimmed);
      for (const raw of found) {
        const addr = normalizeAddress(raw);
        if (!addr) continue;
        records.push({ address: addr, category, source, confidence });
      }
    }

    ingestLog('GitHub source: parsed', {
      source,
      nonEmptyLines: lines.filter(l => l.trim() && !l.trim().startsWith('#'))
        .length,
      recordsBeforeUpsert: records.length,
    });
    return this.upsertRecords(records, { isDerived: false });
  }

  /**
   * Chainabuse ingestion (API integration varies by plan). This implementation is intentionally
   * conservative: it only runs if CHAINABUSE_API_KEY is provided and the endpoint responds.
   *
   * You can replace `fetchChainabuseReports` with a richer integration later.
   */
  async ingestChainabuse(input: {
    apiKey: string;
    source?: string;
    confidence?: number;
  }): Promise<{ source: string; upserted: number; skipped: number }> {
    const source = input.source ?? 'chainabuse';
    const confidence = clamp01(input.confidence ?? 0.75);

    const reports = await this.fetchChainabuseReports(input.apiKey);
    ingestLog('Chainabuse: reports fetched', { count: reports.length });
    const records: AddressRecord[] = [];
    for (const r of reports) {
      const addr = normalizeAddress(r.address);
      if (!addr) continue;
      records.push({
        address: addr,
        category: r.category,
        source,
        confidence,
      });
    }

    return this.upsertRecords(records, { isDerived: false });
  }

  private async fetchChainabuseReports(
    apiKey: string
  ): Promise<Array<{ address: string; category: AddressRecord['category'] }>> {
    // Placeholder endpoint. If this fails (404/401), we just return empty array.
    // The goal is a pluggable ingestion surface without breaking prod startup.
    try {
      const res = await axios.get('https://api.chainabuse.com/v1/reports', {
        headers: { Authorization: `Bearer ${apiKey}` },
        timeout: 15_000,
      });
      const items = Array.isArray(res.data) ? res.data : res.data?.data;
      if (!Array.isArray(items)) return [];
      return items
        .map((x: any) => {
          const address = String(x?.address || x?.value || '').trim();
          const type = String(x?.category || x?.type || '').toLowerCase();
          const category: AddressRecord['category'] = type.includes('phish')
            ? 'phishing'
            : type.includes('scam')
              ? 'scam'
              : type.includes('sanction')
                ? 'sanctions'
                : 'suspicious';
          return { address, category };
        })
        .filter(x => x.address);
    } catch (e) {
      ingestWarn('Chainabuse API request failed (continuing with 0 reports)', {
        message: e instanceof Error ? e.message : String(e),
      });
      return [];
    }
  }

  private async upsertRecords(
    records: AddressRecord[],
    opts: { isDerived: boolean; derivedFrom?: string }
  ): Promise<{ source: string; upserted: number; skipped: number }> {
    if (records.length === 0) {
      ingestWarn(
        'upsert skipped: no records to write (empty list after parse/filter)'
      );
      return { source: 'unknown', upserted: 0, skipped: 0 };
    }

    const source = records[0]?.source || 'unknown';
    ingestLog('Database upsert: merging + writing', {
      source,
      rowCount: records.length,
    });

    const merged = mergeAddressRecords(records);
    const addresses = Array.from(merged.keys());
    const existing = await prisma.blacklistedAddress.findMany({
      where: { address: { in: addresses } },
    });
    const existingByAddress = new Map(existing.map(e => [e.address, e]));

    let upserted = 0;
    for (const m of merged.values()) {
      const ex = existingByAddress.get(m.address);
      const nextCategory = ex
        ? pickStrongerCategory(ex.category, toPrismaCategory(m.category))
        : toPrismaCategory(m.category);

      const nextConfidence = ex
        ? Math.max(ex.confidence ?? 0, clamp01(m.combinedConfidence))
        : clamp01(m.combinedConfidence);

      // keep original (non-derived) records strong: derived should never downgrade them
      const nextIsDerived = ex
        ? ex.isDerived
          ? opts.isDerived
          : false
        : opts.isDerived;
      const nextDerivedFrom =
        ex && ex.derivedFrom ? ex.derivedFrom : opts.derivedFrom;

      const nextSource = m.sources.join(';').slice(0, 255);

      await prisma.blacklistedAddress.upsert({
        where: { address: m.address },
        create: {
          address: m.address,
          category: nextCategory,
          confidence: nextConfidence,
          riskScore: toRiskScore(nextConfidence),
          source: nextSource,
          isDerived: nextIsDerived,
          derivedFrom: nextDerivedFrom,
        },
        update: {
          category: nextCategory,
          confidence: nextConfidence,
          riskScore: toRiskScore(nextConfidence),
          source: nextSource,
          isDerived: nextIsDerived,
          derivedFrom: nextDerivedFrom,
        },
      });
      upserted++;
    }

    return { source, upserted, skipped: records.length - upserted };
  }
}

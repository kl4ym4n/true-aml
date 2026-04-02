import type { Readable } from 'node:stream';
import type { Tag } from 'sax';
import type { Entry } from 'unzipper';
import { requireFromProjectRoot } from '../../lib/require-from-root';
import { ingestLog } from './ingestion.log';

const sax = requireFromProjectRoot('sax') as typeof import('sax');
const unzipper = requireFromProjectRoot('unzipper') as typeof import('unzipper');

/**
 * Local ZIP only: uses `Open.file()` (central directory + random access).
 * The streaming `Parse()` path can stall when combined with extra transforms / pipe order.
 */
export async function openSdnEnhancedXmlFromLocalZipFile(
  zipPath: string
): Promise<Readable> {
  ingestLog(
    'unzip: Open.file() — reading ZIP directory from disk (stable; not streaming Parse())'
  );
  const directory = await unzipper.Open.file(zipPath);
  const file = directory.files.find(
    f =>
      f.type === 'File' &&
      f.path.replace(/\\/g, '/').toLowerCase().endsWith('sdn_enhanced.xml')
  );
  if (!file) {
    const preview = directory.files
      .map(f => f.path)
      .slice(0, 40)
      .join(', ');
    throw new Error(
      `SDN_ENHANCED.XML not found in ZIP. Sample entries: ${preview}`
    );
  }
  ingestLog('Found ZIP entry', { entry: file.path });
  return file.stream();
}

function localElementName(name: string): string {
  const i = name.lastIndexOf(':');
  return i === -1 ? name : name.slice(i + 1);
}

function normEl(name: string): string {
  return localElementName(name).toLowerCase();
}

function attr(attrs: Tag['attributes'], key: string): string | undefined {
  const k = key.toLowerCase();
  for (const a of Object.keys(attrs)) {
    if (a.toLowerCase() === k) return attrs[a];
  }
  return undefined;
}

/**
 * Streams OFAC SDN_ENHANCED.XML and collects values for all "Digital Currency Address - *" features.
 * Memory use stays bounded (SAX); the file is ~100MB+ uncompressed.
 */
export function parseOfacEnhancedDigitalCurrencyStream(
  xmlStream: Readable
): Promise<string[]> {
  const digitalFeatureTypeIds = new Set<number>();
  const addresses: string[] = [];

  const stack: string[] = [];
  let featureTypeDefId: number | null = null;
  let inFeatureTypeDefType = false;
  let featureTypeDefTypeText = '';

  /** Set when entity feature &lt;type featureTypeId&gt; matches a digital-currency feature type. */
  let pendingDigitalValue = false;
  /** Inside &lt;value&gt; for a matching digital feature (flush on end tag). */
  let captureEntityFeatureValue = false;
  let entityFeatureValueBuf = '';

  const parser = sax.createStream(true, { trim: true });

  parser.on('opentag', (node: Tag) => {
    const el = normEl(node.name);
    stack.push(el);

    if (
      stack.length >= 2 &&
      stack[stack.length - 2] === 'featuretypes' &&
      el === 'featuretype'
    ) {
      const id = attr(node.attributes, 'featureTypeId');
      if (id !== undefined) featureTypeDefId = Number.parseInt(id, 10);
      return;
    }

    if (
      stack.length >= 3 &&
      stack[stack.length - 3] === 'featuretypes' &&
      stack[stack.length - 2] === 'featuretype' &&
      el === 'type'
    ) {
      inFeatureTypeDefType = true;
      featureTypeDefTypeText = '';
      return;
    }

    if (isEntityFeatureTypeElement(stack) && el === 'type') {
      const ft = attr(node.attributes, 'featureTypeId');
      pendingDigitalValue =
        ft !== undefined && digitalFeatureTypeIds.has(Number.parseInt(ft, 10));
      return;
    }

    if (isEntityFeatureValueElement(stack) && el === 'value') {
      captureEntityFeatureValue = pendingDigitalValue;
      entityFeatureValueBuf = '';
      return;
    }
  });

  parser.on('text', (text: string) => {
    if (inFeatureTypeDefType) {
      featureTypeDefTypeText += text;
      return;
    }
    if (captureEntityFeatureValue) {
      entityFeatureValueBuf += text;
    }
  });

  parser.on('closetag', (name: string) => {
    const el = normEl(name);

    if (inFeatureTypeDefType && el === 'type') {
      const v = featureTypeDefTypeText.trim();
      if (v.startsWith('Digital Currency Address')) {
        if (featureTypeDefId !== null && Number.isFinite(featureTypeDefId)) {
          digitalFeatureTypeIds.add(featureTypeDefId);
        }
      }
      inFeatureTypeDefType = false;
      featureTypeDefTypeText = '';
    }

    if (el === 'featuretype') {
      featureTypeDefId = null;
    }

    if (el === 'value' && captureEntityFeatureValue) {
      const t = entityFeatureValueBuf.trim();
      if (t) addresses.push(t);
      captureEntityFeatureValue = false;
      entityFeatureValueBuf = '';
      pendingDigitalValue = false;
    }

    if (el === 'feature') {
      pendingDigitalValue = false;
      captureEntityFeatureValue = false;
      entityFeatureValueBuf = '';
    }

    stack.pop();
  });

  parser.on('cdata', (text: string) => {
    if (inFeatureTypeDefType) {
      featureTypeDefTypeText += text;
      return;
    }
    if (captureEntityFeatureValue) {
      entityFeatureValueBuf += text;
    }
  });

  return new Promise((resolve, reject) => {
    parser.on('error', reject);
    parser.on('end', () => {
      ingestLog('OFAC XML stream finished (SAX)', {
        rawDigitalCurrencyValues: addresses.length,
      });
      resolve(addresses);
    });
    xmlStream.on('error', reject);
    ingestLog('OFAC XML stream started (SAX, large file may take minutes)');
    xmlStream.pipe(parser);
  });
}

function isEntityFeatureTypeElement(stack: string[]): boolean {
  const n = stack.length;
  if (n < 5) return false;
  return (
    stack[n - 5] === 'entities' &&
    stack[n - 4] === 'entity' &&
    stack[n - 3] === 'features' &&
    stack[n - 2] === 'feature' &&
    stack[n - 1] === 'type'
  );
}

function isEntityFeatureValueElement(stack: string[]): boolean {
  const n = stack.length;
  if (n < 5) return false;
  return (
    stack[n - 5] === 'entities' &&
    stack[n - 4] === 'entity' &&
    stack[n - 3] === 'features' &&
    stack[n - 2] === 'feature' &&
    stack[n - 1] === 'value'
  );
}

/** First entry whose path ends with SDN_ENHANCED.XML (case-insensitive). */
export function openSdnEnhancedXmlFromZip(
  zipStream: Readable
): Promise<Readable> {
  return new Promise((resolve, reject) => {
    let resolved = false;
    ingestLog(
      'unzip: scanning archive for SDN_ENHANCED.XML (CPU-bound; wait until “Found ZIP entry”)…'
    );
    zipStream.on('error', reject);
    const pipe = zipStream.pipe(unzipper.Parse({ forceStream: true }));
    pipe.on('error', reject);
    pipe.on('entry', (entry: Entry) => {
      const p = entry.path.replace(/\\/g, '/');
      if (p.toLowerCase().endsWith('sdn_enhanced.xml')) {
        resolved = true;
        ingestLog('Found ZIP entry, streaming XML', { entry: p });
        resolve(entry);
      } else {
        entry.autodrain();
      }
    });
    pipe.on('close', () => {
      if (!resolved) {
        reject(new Error('SDN_ENHANCED.XML not found in ZIP archive'));
      }
    });
  });
}

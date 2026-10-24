import { CatalogueItem, InventoryVariant, StockStatus } from '../types/billing';

/**
 * Generates a crisp, minimalist Zara/H&M-style SVG thumbnail data URL
 * for products or variants without a custom uploaded photo.
 */
export function generateProductPlaceholderSvg(
  title: string,
  subtitle = '',
  colorName = ''
): string {
  const cleanTitle = String(title || 'Item')
    .replace(/[^a-zA-Z0-9\s-]/g, '')
    .trim();
  const words = cleanTitle.split(/\s+/).filter(Boolean);
  const initials =
    words.length >= 2
      ? `${words[0][0] || ''}${words[1][0] || ''}`.toUpperCase()
      : (cleanTitle.slice(0, 2) || 'AL').toUpperCase();

  const shortSub = String(colorName || subtitle || 'alif.')
    .replace(/[^a-zA-Z0-9\s-]/g, '')
    .trim()
    .slice(0, 10)
    .toUpperCase();

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96">
    <rect width="96" height="96" fill="#F7F6F2"/>
    <rect x="2" y="2" width="92" height="92" fill="none" stroke="#1C1D21" stroke-width="1.5"/>
    <line x1="2" y1="68" x2="94" y2="68" stroke="#E2E0D8" stroke-width="1"/>
    <text x="48" y="42" font-family="Inter, sans-serif" font-size="22" font-weight="600" fill="#0B0B0D" text-anchor="middle" dominant-baseline="middle">${initials}</text>
    <text x="48" y="81" font-family="JetBrains Mono, monospace" font-size="9.5" font-weight="500" fill="#6B7280" text-anchor="middle" letter-spacing="0.8">${shortSub}</text>
  </svg>`;

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

/**
 * Computes stock status indicator for an inventory variant.
 */
export function getVariantStockStatus(variant: {
  totalQuantity: number;
  lowStockThreshold: number;
}): StockStatus {
  const qty = Math.round(Number(variant.totalQuantity || 0) * 1000) / 1000;
  if (qty <= 0) return 'Out of Stock';
  const threshold = Math.max(0, Number(variant.lowStockThreshold ?? 2));
  if (qty <= threshold) return 'Low Stock';
  return 'In Stock';
}

/**
 * Formats a fractional quantity cleanly without trailing float noise (e.g. 1.2, 2.5, 3.25).
 */
export function formatStockQuantity(qty: number, unit?: string): string {
  const rounded = Math.round(Number(qty || 0) * 1000) / 1000;
  const numStr = Number.isInteger(rounded) ? String(rounded) : String(rounded);
  return unit ? `${numStr} ${unit}` : numStr;
}

// Common tailoring & boutique domain synonym / typo canonical map
const CANONICAL_SYNONYMS: Record<string, string[]> = {
  fandy: ['fandy', 'gandy', 'fendi', 'fandi', 'phandy', 'fndy'],
  gandy: ['fandy', 'gandy', 'fendi', 'fandi'],
  silk: ['silk', 'slik', 'silky', 'resham'],
  green: ['green', 'grren', 'gren', 'grean', 'hara', 'emerald', 'mehendi', 'olive'],
  grren: ['green', 'grren', 'gren'],
  maroon: ['maroon', 'maron', 'marroon', 'wine', 'burgundy'],
  gold: ['gold', 'golden', 'zari', 'jari', 'champagne', 'antique'],
  black: ['black', 'blck', 'jet', 'kala'],
  ivory: ['ivory', 'offwhite', 'cream', 'white', 'safed'],
  rose: ['rose', 'pink', 'dusty', 'gulabi', 'peach'],
  allover: ['allover', 'all', 'over', 'jaal', 'fullwork', 'full'],
  all: ['all', 'allover'],
  over: ['over', 'allover'],
  work: ['work', 'wrk', 'embroidery', 'karigari', 'design', 'kadhai'],
  butti: ['butti', 'booti', 'buti', 'motif', 'small'],
  astar: ['astar', 'astin', 'lining', 'cotton', 'inner'],
  lining: ['astar', 'lining', 'inner'],
  blouse: ['blouse', 'blous', 'choli', 'top'],
  saree: ['saree', 'sari', 'fall', 'pico'],
  lace: ['lace', 'border', 'gota', 'patti', 'kinari', 'trim'],
  latkan: ['latkan', 'tassel', 'tassels', 'hanging', 'dori'],
  fabric: ['fabric', 'kapda', 'cloth', 'material', 'than', 'roll'],
  organza: ['organza', 'orgenza', 'tissue', 'net'],
  scallop: ['scallop', 'cutwork', 'border']
};

/**
 * Normalizes a text string for search: lowercase, strips punctuation/hyphens into spaces,
 * and also produces compound tokens for hyphenated words like "all-over" -> "allover" + "all" + "over".
 */
export function normalizeSearchText(input: string): string {
  return String(input || '')
    .toLowerCase()
    .replace(/['’`]/g, '')
    .replace(/[-_/.,•|()[\]:;+]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function tokenizeSearchText(input: string): string[] {
  const rawLower = String(input || '').toLowerCase();
  const hyphenMerged = rawLower
    .replace(/([a-z0-9]+)-([a-z0-9]+)/g, '$1$2 $1 $2')
    .replace(/all\s+over/g, 'allover all over');
  const norm = normalizeSearchText(hyphenMerged);
  if (!norm) return [];
  return Array.from(new Set(norm.split(' ').filter((t) => t.length > 0)));
}

/**
 * Computes optimal Damerau-Levenshtein distance between two short strings
 * (handling character insertion, deletion, substitution, and adjacent transposition like "grren" <-> "green").
 */
export function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  const la = a.length;
  const lb = b.length;
  if (la === 0) return lb;
  if (lb === 0) return la;

  const dp: number[][] = Array.from({ length: la + 1 }, () =>
    new Array(lb + 1).fill(0)
  );
  for (let i = 0; i <= la; i++) dp[i][0] = i;
  for (let j = 0; j <= lb; j++) dp[0][j] = j;

  for (let i = 1; i <= la; i++) {
    for (let j = 1; j <= lb; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,      // deletion
        dp[i][j - 1] + 1,      // insertion
        dp[i - 1][j - 1] + cost // substitution
      );
      if (
        i > 1 &&
        j > 1 &&
        a[i - 1] === b[j - 2] &&
        a[i - 2] === b[j - 1]
      ) {
        dp[i][j] = Math.min(dp[i][j], dp[i - 2][j - 2] + 1); // transposition
      }
    }
  }
  return dp[la][lb];
}

function expandQueryToken(token: string): string[] {
  const expanded = new Set<string>([token]);
  if (CANONICAL_SYNONYMS[token]) {
    for (const syn of CANONICAL_SYNONYMS[token]) {
      expanded.add(syn);
    }
  }
  // Also check if token is within edit distance 1 of a known canonical key (e.g. "gandy" -> "fandy", "grren" -> "green")
  for (const [key, list] of Object.entries(CANONICAL_SYNONYMS)) {
    if (key.length >= 4 && token.length >= 4 && editDistance(token, key) <= 1) {
      expanded.add(key);
      for (const syn of list) expanded.add(syn);
    }
  }
  return Array.from(expanded);
}

export interface SearchRankResult<T> {
  item: T;
  score: number;
  matchedTokens: number;
  totalQueryTokens: number;
  isExactMatch: boolean;
  isApproximateMatch: boolean;
}

/**
 * Scores a candidate record against a user search query.
 * Handles typos ("gandy grren work all over"), word order differences, hyphens/spaces,
 * and partial words while ranking exact matches above fuzzy matches.
 */
export function scoreSearchCandidate(
  query: string,
  fields: {
    primaryName: string;
    category?: string;
    productType?: string;
    workDesign?: string;
    color?: string;
    sku?: string;
    description?: string;
  }
): {
  score: number;
  matchedTokens: number;
  totalQueryTokens: number;
  isExactMatch: boolean;
  isApproximateMatch: boolean;
} {
  const cleanQuery = normalizeSearchText(query);
  if (!cleanQuery) {
    return {
      score: 1,
      matchedTokens: 0,
      totalQueryTokens: 0,
      isExactMatch: true,
      isApproximateMatch: false
    };
  }

  const compositeText = [
    fields.primaryName,
    fields.category,
    fields.productType,
    fields.workDesign,
    fields.color,
    fields.sku,
    fields.description
  ]
    .filter(Boolean)
    .join(' ');

  const normComposite = normalizeSearchText(compositeText);
  const normPrimary = normalizeSearchText(fields.primaryName);

  // Direct substring match on primary name or composite
  const directExact =
    normPrimary.includes(cleanQuery) || normComposite.includes(cleanQuery);

  const rawQueryTokens = cleanQuery.split(' ').filter(Boolean);
  const candidateTokens = tokenizeSearchText(compositeText);

  let totalScore = directExact ? 120 : 0;
  let matchedTokens = 0;
  let usedFuzzyOrSynonym = false;

  for (const qToken of rawQueryTokens) {
    let bestTokenScore = 0;
    let tokenWasFuzzy = false;

    const expandedForms = expandQueryToken(qToken);

    for (const cToken of candidateTokens) {
      // 1. Exact token match
      if (cToken === qToken) {
        bestTokenScore = Math.max(bestTokenScore, 40);
        tokenWasFuzzy = false;
        break;
      }
      // 2. Prefix match (e.g. "gre" -> "green", "all" -> "allover")
      if (cToken.startsWith(qToken) || (qToken.length >= 3 && qToken.startsWith(cToken))) {
        if (32 > bestTokenScore) {
          bestTokenScore = 32;
        }
      }
      // 3. Synonym / canonical expansion match (e.g. "gandy" -> "fandy", "grren" -> "green", "all" + "over" -> "allover")
      if (expandedForms.includes(cToken)) {
        if (30 > bestTokenScore) {
          bestTokenScore = 30;
          if (cToken !== qToken) tokenWasFuzzy = true;
        }
      }
      // 4. Damerau-Levenshtein fuzzy typo match
      if (qToken.length >= 4 && cToken.length >= 4) {
        const dist = editDistance(qToken, cToken);
        const maxAllowed = qToken.length >= 6 ? 2 : 1;
        if (dist <= maxAllowed) {
          const fuzzyPoints = dist === 1 ? 26 : 18;
          if (fuzzyPoints > bestTokenScore) {
            bestTokenScore = fuzzyPoints;
            tokenWasFuzzy = true;
          }
        }
      }
    }

    if (bestTokenScore > 0) {
      matchedTokens += 1;
      totalScore += bestTokenScore;
      if (tokenWasFuzzy) {
        usedFuzzyOrSynonym = true;
      }
    }
  }

  // Bonus when multiple or all query tokens match across attributes regardless of word order
  if (rawQueryTokens.length > 1 && matchedTokens > 0) {
    const coverageRatio = matchedTokens / rawQueryTokens.length;
    totalScore += Math.round(coverageRatio * 50);
    if (matchedTokens === rawQueryTokens.length) {
      totalScore += 35;
    }
  }

  // Require at least 50% token match for multi-word queries (or 1 token for 1-2 word queries)
  const minRequiredMatches =
    rawQueryTokens.length <= 2 ? 1 : Math.ceil(rawQueryTokens.length * 0.5);

  if (matchedTokens < minRequiredMatches && !directExact) {
    return {
      score: 0,
      matchedTokens,
      totalQueryTokens: rawQueryTokens.length,
      isExactMatch: false,
      isApproximateMatch: false
    };
  }

  return {
    score: totalScore,
    matchedTokens,
    totalQueryTokens: rawQueryTokens.length,
    isExactMatch: directExact && !usedFuzzyOrSynonym,
    isApproximateMatch: !directExact || usedFuzzyOrSynonym
  };
}

/**
 * Ranks InventoryVariant items using the intelligent offline search engine.
 */
export function searchInventoryVariants(
  variants: InventoryVariant[],
  query: string
): SearchRankResult<InventoryVariant>[] {
  const q = query.trim();
  if (!q) {
    return variants.map((item) => ({
      item,
      score: 1,
      matchedTokens: 0,
      totalQueryTokens: 0,
      isExactMatch: true,
      isApproximateMatch: false
    }));
  }

  const results: SearchRankResult<InventoryVariant>[] = [];
  for (const v of variants) {
    const res = scoreSearchCandidate(q, {
      primaryName: v.name,
      category: v.category,
      productType: v.productType,
      workDesign: v.workDesign,
      color: v.color,
      sku: v.sku,
      description: v.notes
    });
    if (res.score > 0) {
      results.push({
        item: v,
        ...res
      });
    }
  }

  return results.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.item.name.localeCompare(b.item.name);
  });
}

/**
 * Ranks CatalogueItem items (combined with linked InventoryVariant metadata if available)
 * using the intelligent offline search engine.
 */
export function searchCatalogueItems(
  items: CatalogueItem[],
  variantsMap: Record<string, InventoryVariant>,
  query: string
): SearchRankResult<CatalogueItem>[] {
  const q = query.trim();
  if (!q) {
    return items.map((item) => ({
      item,
      score: 1,
      matchedTokens: 0,
      totalQueryTokens: 0,
      isExactMatch: true,
      isApproximateMatch: false
    }));
  }

  const results: SearchRankResult<CatalogueItem>[] = [];
  for (const item of items) {
    const linkedVar = item.inventoryVariantId
      ? variantsMap[item.inventoryVariantId]
      : undefined;
    const res = scoreSearchCandidate(q, {
      primaryName: item.name,
      category: linkedVar?.category || item.category,
      productType: item.productType || linkedVar?.productType,
      workDesign: item.workDesign || linkedVar?.workDesign,
      color: item.color || linkedVar?.color,
      sku: linkedVar?.sku,
      description: item.description
    });
    if (res.score > 0) {
      results.push({
        item,
        ...res
      });
    }
  }

  return results.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.item.name.localeCompare(b.item.name);
  });
}

export interface ProductHierarchyOptions {
  categories: string[];
  productTypes: string[];
  workDesigns: string[];
  colors: string[];
}

/**
 * Extracts available filter options at each level of the hierarchy:
 * Category -> Product Type -> Work/Design -> Colour
 */
export function extractInventoryHierarchy(
  variants: InventoryVariant[],
  selectedCategory = '',
  selectedProductType = '',
  selectedWorkDesign = ''
): ProductHierarchyOptions {
  const categories = new Set<string>();
  const productTypes = new Set<string>();
  const workDesigns = new Set<string>();
  const colors = new Set<string>();

  for (const v of variants) {
    if (!v.isActive) continue;
    if (v.category) categories.add(v.category);

    if (!selectedCategory || v.category === selectedCategory) {
      if (v.productType) productTypes.add(v.productType);

      if (!selectedProductType || v.productType === selectedProductType) {
        if (v.workDesign) workDesigns.add(v.workDesign);

        if (!selectedWorkDesign || v.workDesign === selectedWorkDesign) {
          if (v.color) colors.add(v.color);
        }
      }
    }
  }

  return {
    categories: Array.from(categories).sort(),
    productTypes: Array.from(productTypes).sort(),
    workDesigns: Array.from(workDesigns).sort(),
    colors: Array.from(colors).sort()
  };
}

/**
 * Determines the initial auto-focus target when adding a catalogue item to a bill:
 * - Tailoring Service ('service'): auto-focuses 'price' because quantity is almost always 1.
 * - Material / Stock item ('product' or linked to an InventoryVariant): auto-focuses 'qty' with text selected
 *   because fabric/lace measurements are typically fractional (e.g. 1.25 m, 2.5 m).
 */
export function resolveCategoryFocusTarget(
  category: string,
  hasInventoryVariant = false
): { target: 'price' | 'qty'; selectText: boolean } {
  const isMaterialOrStock = category === 'product' || Boolean(hasInventoryVariant);
  return {
    target: isMaterialOrStock ? 'qty' : 'price',
    selectText: isMaterialOrStock
  };
}

/**
 * Normalizes a phone input string to 10-digit Indian mobile numbers (stripping +91 or leading 0).
 */
export function normalizeCustomerPhoneDigits(phone: string): string {
  const digits = String(phone || '').replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) {
    return digits.slice(2);
  }
  if (digits.length === 11 && digits.startsWith('0')) {
    return digits.slice(1);
  }
  return digits;
}

export interface BlankBillingFieldTarget {
  section: 'items' | 'customer' | 'save';
  testId: string;
  lineIdx?: number;
  lineId?: string;
  field?: 'name' | 'qty' | 'price';
  selectText: boolean;
}

/**
 * Finds the next relevant blank required field in the New Bill workflow:
 * 1. Scans added line items starting after `startAfterLineIdx` (wrapping around to earlier items)
 *    for any missing required item field (`name`, `quantity <= 0`, or blank `unitPriceRupees`).
 *    Optional item fields (`notes`, `photo`) are never forced.
 * 2. Only when all added line items have their required fields completed, checks Customer Details:
 *    - `input-customer-phone` (if fewer than 6 digits)
 *    - `input-customer-name` (if blank)
 *    Optional sections/fields (`Discount`, `Collection Date`, `Order Notes`, `Advance Received`) are never forced.
 * 3. When both items and customer details are complete, returns `input-advance-amount` in the Save section.
 */
export function findNextBlankBillingField(params: {
  lines: Array<{
    id: string;
    name: string;
    category?: string;
    inventoryVariantId?: string | null;
    quantity: string;
    unitPriceRupees: string;
  }>;
  customerPhone: string;
  customerName: string;
  startAfterLineIdx?: number;
}): BlankBillingFieldTarget {
  const { lines, customerPhone, customerName, startAfterLineIdx = -1 } = params;
  const totalLines = lines.length;

  if (totalLines > 0) {
    const orderedIndices: number[] = [];
    for (let i = startAfterLineIdx + 1; i < totalLines; i++) {
      if (i >= 0) orderedIndices.push(i);
    }
    for (let i = 0; i <= Math.min(startAfterLineIdx, totalLines - 1); i++) {
      if (i >= 0 && !orderedIndices.includes(i)) orderedIndices.push(i);
    }

    for (const idx of orderedIndices) {
      const line = lines[idx];
      if (!line) continue;
      if (!String(line.name || '').trim()) {
        return {
          section: 'items',
          testId: `line-name-${idx}`,
          lineIdx: idx,
          lineId: line.id,
          field: 'name',
          selectText: true
        };
      }
      const numericQty = Number(line.quantity);
      if (!Number.isFinite(numericQty) || numericQty <= 0) {
        return {
          section: 'items',
          testId: `line-qty-${idx}`,
          lineIdx: idx,
          lineId: line.id,
          field: 'qty',
          selectText: true
        };
      }
      if (!String(line.unitPriceRupees || '').trim()) {
        return {
          section: 'items',
          testId: `line-price-${idx}`,
          lineIdx: idx,
          lineId: line.id,
          field: 'price',
          selectText: false
        };
      }
    }
  }

  if (normalizeCustomerPhoneDigits(customerPhone).length < 6) {
    return {
      section: 'customer',
      testId: 'input-customer-phone',
      selectText: false
    };
  }

  if (!String(customerName || '').trim()) {
    return {
      section: 'customer',
      testId: 'input-customer-name',
      selectText: false
    };
  }

  return {
    section: 'save',
    testId: 'input-advance-amount',
    selectText: true
  };
}

/**
 * Focuses an input/button by `data-testid` and conditionally scrolls it into view:
 * - When `allowScroll === false` (used when selecting/adding products so the product catalogue
 *   stays in place for uninterrupted multi-product selection):
 *   Focuses with `{ preventScroll: true }`, avoids off-screen `.select()` browser jumps, and
 *   restores `window.scrollY` if the browser attempted any native scroll.
 * - When `allowScroll !== false` (used on explicit `Next`/`Enter`, section transitions, or validation errors):
 *   Smoothly scrolls ONLY when `forceScroll` is true or the element is outside the visible viewport
 *   (accounting for sticky header ~104px and bottom sticky bar / mobile keyboard ~92px).
 */
export function focusAndScrollElementByTestId(
  testId: string,
  options: { selectText?: boolean; allowScroll?: boolean; forceScroll?: boolean } = {}
): boolean {
  if (typeof document === 'undefined') return false;
  const el = document.querySelector(`[data-testid="${testId}"]`) as
    | HTMLInputElement
    | HTMLTextAreaElement
    | HTMLSelectElement
    | HTMLElement
    | null;
  if (!el) return false;

  const allowScroll = options.allowScroll !== false;
  const prevScrollX = typeof window !== 'undefined' ? window.scrollX || 0 : 0;
  const prevScrollY = typeof window !== 'undefined' ? window.scrollY || 0 : 0;

  let isOutOfView = false;
  if (typeof window !== 'undefined' && typeof el.getBoundingClientRect === 'function') {
    const rect = el.getBoundingClientRect();
    const viewportHeight =
      window.visualViewport?.height ||
      window.innerHeight ||
      document.documentElement?.clientHeight ||
      740;
    const topSafeMargin = 104;
    const bottomSafeMargin = viewportHeight - 92;

    isOutOfView =
      Boolean(options.forceScroll) ||
      rect.top < topSafeMargin ||
      rect.bottom > bottomSafeMargin;
  }

  try {
    el.focus({ preventScroll: true });
  } catch (_err) {
    if (typeof el.focus === 'function') {
      el.focus();
    }
  }

  // Only call .select() when scrolling is allowed OR the element is already inside the viewport,
  // because calling .select() on an off-screen <input> in Chromium can trigger a native scroll jump.
  if (
    options.selectText &&
    (allowScroll || !isOutOfView) &&
    'select' in el &&
    typeof (el as HTMLInputElement).select === 'function'
  ) {
    try {
      (el as HTMLInputElement).select();
    } catch (_e) {
      // Ignore selection error on unsupported input types
    }
  }

  if (!allowScroll) {
    if (
      typeof window !== 'undefined' &&
      typeof window.scrollTo === 'function' &&
      (window.scrollY !== prevScrollY || window.scrollX !== prevScrollX)
    ) {
      try {
        window.scrollTo(prevScrollX, prevScrollY);
      } catch (_e) {
        // Ignore in test environments without scrollTo implementation
      }
    }
    return true;
  }

  if (isOutOfView && typeof el.scrollIntoView === 'function') {
    try {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } catch (_err) {
      el.scrollIntoView();
    }
  }

  return true;
}

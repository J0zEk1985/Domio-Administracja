/**
 * Strict address match for inbound mail.
 * Auto-assign only when the folded text equals one enrolled place.
 * A typo or a longer form of the same premise stays a review candidate.
 * A different premise or an unrelated address is rejected.
 * The caller must pass only places enrolled in the mailbox module.
 */

export type ServedPlace = {
  id: string;
  address: string | null;
  name: string | null;
};

export type AddressMatchOutcome = "exact" | "review" | "reject";

export type AddressMatchResult = {
  outcome: AddressMatchOutcome;
  locationId: string | null;
  candidateIds: string[];
};

const DIACRITICS: Array<[RegExp, string]> = [
  [/Ą/g, "A"],
  [/ą/g, "a"],
  [/Ć/g, "C"],
  [/ć/g, "c"],
  [/Ę/g, "E"],
  [/ę/g, "e"],
  [/Ł/g, "L"],
  [/ł/g, "l"],
  [/Ń/g, "N"],
  [/ń/g, "n"],
  [/Ó/g, "O"],
  [/ó/g, "o"],
  [/Ś/g, "S"],
  [/ś/g, "s"],
  [/Ź/g, "Z"],
  [/ź/g, "z"],
  [/Ż/g, "Z"],
  [/ż/g, "z"],
];

export function foldPlace(value: string | null | undefined): string | null {
  let text = (value ?? "").trim();
  if (!text) return null;
  for (const [pattern, replacement] of DIACRITICS) {
    text = text.replace(pattern, replacement);
  }
  text = text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text || null;
}

function premiseNumber(folded: string | null): string | null {
  if (!folded) return null;
  const tokens = folded.split(" ");
  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i] ?? "";
    const next = tokens[i + 1];
    if (/^\d{2}$/.test(token) && next && /^\d{3}$/.test(next)) {
      i += 1;
      continue;
    }
    if (/^\d{1,4}$/.test(token)) return token;
  }
  return null;
}

function alphaOnly(folded: string | null): string | null {
  if (!folded) return null;
  const text = folded
    .split(" ")
    .filter((token) => !/^\d+$/.test(token))
    .join(" ")
    .trim();
  return text || null;
}

function levenshtein(left: string, right: string): number {
  const a = left.slice(0, 180);
  const b = right.slice(0, 180);
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  const prev = Array.from({ length: b.length + 1 }, (_, index) => index);
  const curr = new Array<number>(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i += 1) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      const del = (prev[j] ?? 0) + 1;
      const ins = (curr[j - 1] ?? 0) + 1;
      const sub = (prev[j - 1] ?? 0) + cost;
      curr[j] = Math.min(del, ins, sub);
    }
    for (let j = 0; j < prev.length; j += 1) prev[j] = curr[j] ?? 0;
  }
  return prev[b.length] ?? 0;
}

/** Same premise, and the street text is a typo or a longer form of the same place. */
export function isNearPlace(left: string | null, right: string | null): boolean {
  if (!left || !right) return false;
  if (premiseNumber(left) !== premiseNumber(right)) return false;
  const alphaLeft = alphaOnly(left);
  const alphaRight = alphaOnly(right);
  if (!alphaLeft || !alphaRight) return false;
  const dist = levenshtein(alphaLeft, alphaRight);
  const maxLen = Math.max(alphaLeft.length, alphaRight.length);
  const ratio = 1 - dist / maxLen;
  if (dist <= 2) return true;
  if (dist <= 4 && ratio >= 0.88) return true;
  const shorter = alphaLeft.length <= alphaRight.length ? alphaLeft : alphaRight;
  const longer = alphaLeft.length <= alphaRight.length ? alphaRight : alphaLeft;
  if (shorter.length >= 10 && longer.includes(shorter)) return true;
  const longerWords = longer.split(" ");
  if (longerWords.length < 2 || shorter.length < 10) return false;
  const withoutCity = longerWords.slice(0, -1).join(" ");
  if (withoutCity.length < 10) return false;
  const coreDist = levenshtein(shorter, withoutCity);
  const coreMax = Math.max(shorter.length, withoutCity.length);
  if (coreDist <= 2) return true;
  if (coreDist <= 4 && 1 - coreDist / coreMax >= 0.88) return true;
  return withoutCity.includes(shorter) || shorter.includes(withoutCity);
}

export function matchServedAddress(
  input: string | null | undefined,
  places: readonly ServedPlace[],
): AddressMatchResult {
  const folded = foldPlace(input);
  if (!folded) {
    return { outcome: "review", locationId: null, candidateIds: [] };
  }

  const exactIds = places
    .filter((place) => {
      const address = foldPlace(place.address);
      const name = foldPlace(place.name);
      return address === folded || name === folded;
    })
    .map((place) => place.id);

  if (exactIds.length === 1) {
    return { outcome: "exact", locationId: exactIds[0] ?? null, candidateIds: [] };
  }
  if (exactIds.length > 1) {
    return { outcome: "review", locationId: null, candidateIds: exactIds };
  }

  const candidateIds = places
    .filter((place) => {
      const address = foldPlace(place.address);
      const name = foldPlace(place.name);
      return isNearPlace(folded, address) || isNearPlace(folded, name);
    })
    .map((place) => place.id);

  if (candidateIds.length > 0) {
    return { outcome: "review", locationId: null, candidateIds };
  }
  return { outcome: "reject", locationId: null, candidateIds: [] };
}

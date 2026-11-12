import type { MailThreadSummary } from './types';

type Field = 'subject' | 'sender' | 'body' | 'attachment';
type Term = { field?: Field; text: string; exact: boolean };
const normalize = (text: string) =>
  text.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim();

function parseQuery(query: string): Term[] {
  const terms: Term[] = [];
  const pattern = /(?:(subject|sender|attachment|body):\s*)?(?:"([^"]*)"|([^\s"]+))/gi;
  for (const match of query.matchAll(pattern)) {
    const text = normalize(match[2] ?? match[3] ?? '');
    if (text)
      terms.push({
        field: match[1]?.toLowerCase() as Field | undefined,
        text,
        exact: !!match[1] || match[2] !== undefined,
      });
  }
  return terms;
}

// Adjacent transpositions, insertions, deletions and substitutions count as typos.
function withinDistance(left: string, right: string, limit: number): boolean {
  if (Math.abs(left.length - right.length) > limit) return false;
  let previous = Array.from({ length: right.length + 1 }, (_, i) => i);
  let beforePrevious = previous;
  for (let i = 1; i <= left.length; i++) {
    const current = [i];
    for (let j = 1; j <= right.length; j++) {
      current[j] = Math.min(
        current[j - 1] + 1,
        previous[j] + 1,
        previous[j - 1] + Number(left[i - 1] !== right[j - 1]),
      );
      if (i > 1 && j > 1 && left[i - 1] === right[j - 2] && left[i - 2] === right[j - 1]) {
        current[j] = Math.min(current[j], beforePrevious[j - 2] + 1);
      }
    }
    beforePrevious = previous;
    previous = current;
  }
  return previous[right.length] <= limit;
}

export function createMailSearch(threads: readonly MailThreadSummary[]) {
  const index = new Map(
    threads.map((thread) => {
      const source = thread.searchFields ?? {
        subject: thread.subject,
        sender: thread.sender,
        body: thread.preview,
        attachment: '',
      };
      const fields = Object.fromEntries(
        Object.entries(source).map(([key, value]) => [key, normalize(value)]),
      ) as Record<Field, string>;
      const all = Object.values(fields).join(' ');
      return [
        thread,
        { fields, all, words: [...new Set(all.match(/[\p{L}\p{N}]+/gu) ?? [])] },
      ] as const;
    }),
  );
  return (query: string, candidates: readonly MailThreadSummary[]) => {
    const terms = parseQuery(query);
    if (!terms.length) return [...candidates];
    return candidates.filter((thread) => {
      const entry = index.get(thread);
      if (!entry) return false;
      return terms.every((term) => {
        const text = term.field ? entry.fields[term.field] : entry.all;
        if (text.includes(term.text)) return true;
        if (term.exact || term.text.length < 4) return false;
        const limit = term.text.length >= 8 ? 2 : 1;
        return entry.words.some((word) => withinDistance(term.text, word, limit));
      });
    });
  };
}

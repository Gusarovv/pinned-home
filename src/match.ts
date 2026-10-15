export interface PinRecord {
  id: string;
  /** URL the tab was pinned on */
  homeUrl: string;
  /** Last committed URL, used to find the tab again after a browser restart */
  lastUrl: string;
  /** Tab position at pin time or last navigation, tells apart records with the same URL */
  index: number;
}

export interface TabToMatch {
  id: number;
  url: string;
  index: number;
}

export function isWebUrl(url: string | undefined): url is string {
  return !!url && (url.startsWith('https://') || url.startsWith('http://'));
}

/** Pairs pinned tabs with free records by exact lastUrl, then by hostname, preferring the nearest index */
export function matchTabs(tabs: TabToMatch[], freeRecords: PinRecord[]): Map<number, string> {
  const pairs = new Map<number, string>();
  const free = [...freeRecords];
  const ordered = [...tabs].sort((a, b) => a.index - b.index);
  const passes: Array<(tab: TabToMatch, record: PinRecord) => boolean> = [
    (tab, record) => record.lastUrl === tab.url,
    (tab, record) => {
      const host = URL.parse(tab.url)?.hostname;
      return !!host && [record.lastUrl, record.homeUrl].some((url) => URL.parse(url)?.hostname === host);
    },
  ];
  for (const fits of passes) {
    for (const tab of ordered) {
      if (pairs.has(tab.id)) continue;
      const nearest = free
        .filter((record) => fits(tab, record))
        .sort((a, b) => Math.abs(a.index - tab.index) - Math.abs(b.index - tab.index))[0];
      if (!nearest) continue;
      pairs.set(tab.id, nearest.id);
      free.splice(free.indexOf(nearest), 1);
    }
  }
  return pairs;
}

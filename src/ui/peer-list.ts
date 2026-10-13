import { type ResolvedLocale, translate } from '../i18n/i18n';
import type { PeerRecord } from '../network/peer-types';

const STATUS_ORDER: Record<PeerRecord['status'], number> = {
  connected: 0,
  discovered: 1,
  disconnected: 2,
};

let detailsSequence = 0;

export function renderPeerList(
  list: HTMLOListElement,
  emptyState: HTMLElement,
  peers: readonly PeerRecord[],
  now = Date.now(),
  locale: ResolvedLocale = 'en',
  forceRebuild = false,
): void {
  const ordered = [...peers].sort(
    (left, right) =>
      STATUS_ORDER[left.status] - STATUS_ORDER[right.status] ||
      right.lastSeenAt - left.lastSeenAt ||
      left.peerId.localeCompare(right.peerId),
  );
  // Detail terms are created with the active locale. A locale switch can
  // arrive while rows are already retained, so invalidate the row cache once
  // rather than leaving stale <dt> labels in an otherwise updated list.
  const localeChanged = list.dataset.locale !== locale;
  if (forceRebuild || localeChanged) {
    list.replaceChildren();
    list.dataset.locale = locale;
  }
  const existing = new Map<string, HTMLLIElement>();
  for (const child of list.children) {
    if (child instanceof HTMLLIElement && child.dataset.peerId) {
      existing.set(child.dataset.peerId, child);
    }
  }

  const retainedPeerIds = new Set<string>();
  let insertionPoint = list.firstElementChild;
  for (const peer of ordered) {
    retainedPeerIds.add(peer.peerId);
    const item = existing.get(peer.peerId) ?? createPeerItem(peer, locale);
    updatePeerItem(item, peer, now, locale);

    if (item !== insertionPoint) {
      // Preserve the active element when a live latency/status update moves the
      // focused row. Chromium's moveBefore keeps focus and selection attached
      // to the existing element; insertBefore remains the compatible fallback.
      const movableList = list as HTMLOListElement & {
        moveBefore?: (element: Element, child?: Node | null) => void;
      };
      if (item.isConnected && typeof movableList.moveBefore === 'function') {
        movableList.moveBefore(item, insertionPoint);
      } else {
        list.insertBefore(item, insertionPoint);
      }
    }
    insertionPoint = item.nextElementSibling;
  }

  for (const [peerId, item] of existing) {
    if (retainedPeerIds.has(peerId)) {
      continue;
    }
    const containsFocus = item.contains(document.activeElement);
    item.remove();
    if (containsFocus) {
      list.tabIndex = -1;
      list.focus();
    }
  }

  emptyState.hidden = ordered.length > 0;
}

function createPeerItem(
  peer: PeerRecord,
  locale: ResolvedLocale,
): HTMLLIElement {
  const item = document.createElement('li');
  const button = document.createElement('button');
  const dot = document.createElement('span');
  const identity = document.createElement('span');
  const peerId = document.createElement('code');
  const state = document.createElement('span');
  const latency = document.createElement('span');
  const details = document.createElement('dl');
  const detailsId = `peer-details-${detailsSequence}`;
  detailsSequence += 1;

  item.className = 'peer-item';
  item.dataset.peerId = peer.peerId;
  button.className = 'peer-row';
  button.type = 'button';
  button.setAttribute('aria-expanded', 'false');
  button.setAttribute('aria-controls', detailsId);

  dot.className = 'peer-row__dot';
  dot.setAttribute('aria-hidden', 'true');
  identity.className = 'peer-row__identity';
  peerId.dataset.field = 'peer-id-short';
  state.dataset.field = 'state';
  identity.append(peerId, state);
  latency.className = 'peer-row__latency';
  latency.dataset.field = 'latency';
  button.append(dot, identity, latency);

  details.className = 'peer-details';
  details.id = detailsId;
  details.hidden = true;
  details.append(
    detail(translate(locale, 'fullPeerId'), 'peer-id', peer.peerId),
    detail(
      translate(locale, 'state'),
      'status',
      statusLabel(peer.status, locale),
    ),
    detail(
      translate(locale, 'direction'),
      'direction',
      peer.direction ?? translate(locale, 'notObserved'),
    ),
    detail(
      translate(locale, 'transport'),
      'transport',
      peer.transport ?? translate(locale, 'notObserved'),
    ),
    detail(
      translate(locale, 'protocols'),
      'protocols',
      peer.protocols?.join(', ') || translate(locale, 'notObserved'),
    ),
    detail(
      translate(locale, 'agent'),
      'agent',
      peer.agentVersion ?? translate(locale, 'notObserved'),
    ),
    detail(
      translate(locale, 'protocolVersion'),
      'protocol-version',
      peer.protocolVersion ?? translate(locale, 'notObserved'),
    ),
    detail(
      translate(locale, 'addresses'),
      'addresses',
      peer.addressCount === undefined
        ? translate(locale, 'notObserved')
        : formatInteger(peer.addressCount, locale),
    ),
    detail(
      translate(locale, 'relay'),
      'relay',
      peer.relayPeerId === undefined
        ? translate(locale, 'notObserved')
        : peer.relayPeerId,
    ),
    detail(
      translate(locale, 'source'),
      'source',
      sourceLabel(peer.source, locale),
    ),
    detail(
      translate(locale, 'latency'),
      'latency-detail',
      latencyLabel(peer.latencyMs, locale),
    ),
    observedTimeDetail(
      translate(locale, 'lastObserved'),
      'last-seen',
      peer.lastSeenAt,
      locale,
    ),
  );

  button.addEventListener('click', () => {
    const expanded = button.getAttribute('aria-expanded') === 'true';
    button.setAttribute('aria-expanded', String(!expanded));
    details.hidden = expanded;
    const buttonLocale =
      (button.dataset.locale as ResolvedLocale | undefined) ?? 'en';
    updateButtonLabelFromDataset(button, buttonLocale);
  });

  item.append(button, details);
  return item;
}

function updatePeerItem(
  item: HTMLLIElement,
  peer: PeerRecord,
  now: number,
  locale: ResolvedLocale,
): void {
  item.dataset.peerId = peer.peerId;
  const button = requiredDescendant<HTMLButtonElement>(item, '.peer-row');
  button.dataset.status = peer.status;
  button.dataset.source = peer.source ?? 'browser';
  button.dataset.peerId = peer.peerId;
  button.dataset.locale = locale;
  button.dataset.latency =
    peer.latencyMs === undefined ? '' : String(peer.latencyMs);
  updateButtonLabel(button, peer.peerId, peer.status, peer.latencyMs, locale);

  const shortIdentity = requiredField<HTMLElement>(item, 'peer-id-short');
  shortIdentity.textContent = shortPeerId(peer.peerId);
  shortIdentity.title = peer.peerId;
  requiredField<HTMLElement>(item, 'state').textContent =
    `${statusLabel(peer.status, locale)} · ${relativeTime(peer.lastSeenAt, now, locale)}`;
  requiredField<HTMLElement>(item, 'latency').textContent = latencyLabel(
    peer.latencyMs,
    locale,
  );
  requiredField<HTMLElement>(item, 'peer-id').textContent = peer.peerId;
  requiredField<HTMLElement>(item, 'status').textContent = statusLabel(
    peer.status,
    locale,
  );
  requiredField<HTMLElement>(item, 'direction').textContent =
    peer.direction ?? translate(locale, 'notObserved');
  requiredField<HTMLElement>(item, 'transport').textContent =
    peer.transport ?? translate(locale, 'notObserved');
  requiredField<HTMLElement>(item, 'protocols').textContent =
    peer.protocols?.join(', ') || translate(locale, 'notObserved');
  requiredField<HTMLElement>(item, 'agent').textContent =
    peer.agentVersion ?? translate(locale, 'notObserved');
  requiredField<HTMLElement>(item, 'protocol-version').textContent =
    peer.protocolVersion ?? translate(locale, 'notObserved');
  requiredField<HTMLElement>(item, 'addresses').textContent =
    peer.addressCount === undefined
      ? translate(locale, 'notObserved')
      : formatInteger(peer.addressCount, locale);
  requiredField<HTMLElement>(item, 'relay').textContent =
    peer.relayPeerId ?? translate(locale, 'notObserved');
  requiredField<HTMLElement>(item, 'source').textContent = sourceLabel(
    peer.source,
    locale,
  );
  requiredField<HTMLElement>(item, 'latency-detail').textContent = latencyLabel(
    peer.latencyMs,
    locale,
  );
  updateObservedTime(
    requiredField<HTMLTimeElement>(item, 'last-seen'),
    peer.lastSeenAt,
    locale,
  );
}

function updateButtonLabelFromDataset(
  button: HTMLButtonElement,
  locale: ResolvedLocale,
): void {
  const status = button.dataset.status;
  if (
    status !== 'connected' &&
    status !== 'discovered' &&
    status !== 'disconnected'
  ) {
    throw new Error('Peer row has an invalid status');
  }
  const rawLatency = button.dataset.latency;
  const parsedLatency = rawLatency ? Number(rawLatency) : undefined;
  updateButtonLabel(
    button,
    button.dataset.peerId ?? 'Unknown peer',
    status,
    parsedLatency,
    locale,
  );
}

function updateButtonLabel(
  button: HTMLButtonElement,
  peerId: string,
  status: PeerRecord['status'],
  latencyMs: number | undefined,
  locale: ResolvedLocale,
): void {
  const expanded = button.getAttribute('aria-expanded') === 'true';
  button.setAttribute(
    'aria-label',
    `${peerId}, ${statusLabel(status, locale)}, ${latencyLabel(latencyMs, locale)}. ${expanded ? translate(locale, 'hideDetails') : translate(locale, 'showDetails')}`,
  );
}

function detail(label: string, field: string, value: string): HTMLDivElement {
  const wrapper = document.createElement('div');
  const term = document.createElement('dt');
  const description = document.createElement('dd');
  term.textContent = label;
  description.dataset.field = field;
  description.textContent = value;
  wrapper.append(term, description);
  return wrapper;
}

function observedTimeDetail(
  label: string,
  field: string,
  observedAt: number,
  locale: ResolvedLocale,
): HTMLDivElement {
  const wrapper = document.createElement('div');
  const term = document.createElement('dt');
  const description = document.createElement('dd');
  const time = document.createElement('time');
  term.textContent = label;
  time.dataset.field = field;
  updateObservedTime(time, observedAt, locale);
  description.append(time);
  wrapper.append(term, description);
  return wrapper;
}

function updateObservedTime(
  time: HTMLTimeElement,
  observedAt: number,
  locale: ResolvedLocale,
): void {
  const date = new Date(observedAt);
  if (Number.isNaN(date.getTime())) {
    time.removeAttribute('datetime');
    time.textContent = translate(locale, 'dateUnavailable');
    return;
  }
  time.dateTime = date.toISOString();
  time.textContent = new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'medium',
  }).format(date);
}

function requiredDescendant<T extends HTMLElement>(
  root: HTMLElement,
  selector: string,
): T {
  const element = root.querySelector(selector);
  if (!(element instanceof HTMLElement)) {
    throw new Error(`Peer row is missing ${selector}`);
  }
  return element as T;
}

function requiredField<T extends HTMLElement>(
  root: HTMLElement,
  field: string,
): T {
  return requiredDescendant<T>(root, `[data-field="${field}"]`);
}

function shortPeerId(peerId: string): string {
  if (peerId.length <= 24) {
    return peerId;
  }
  return `${peerId.slice(0, 14)}…${peerId.slice(-7)}`;
}

function statusLabel(
  status: PeerRecord['status'],
  locale: ResolvedLocale,
): string {
  switch (status) {
    case 'connected':
      return translate(locale, 'connected');
    case 'discovered':
      return translate(locale, 'discovered');
    case 'disconnected':
      return translate(locale, 'disconnected');
  }
}

function sourceLabel(
  source: PeerRecord['source'],
  locale: ResolvedLocale,
): string {
  if (source === 'kubo') return translate(locale, 'localKuboObservations');
  if (source === 'both') {
    return `${translate(locale, 'browserHelia')} + ${translate(locale, 'localKuboObservations')}`;
  }
  return translate(locale, 'browserHelia');
}

function latencyLabel(
  latencyMs: number | undefined,
  locale: ResolvedLocale,
): string {
  return latencyMs === undefined
    ? translate(locale, 'unmeasured')
    : `${formatInteger(Math.round(latencyMs), locale)} ms`;
}

function formatInteger(value: number, locale: ResolvedLocale): string {
  try {
    return new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(
      value,
    );
  } catch {
    return new Intl.NumberFormat('en-US', {
      maximumFractionDigits: 0,
    }).format(value);
  }
}

function relativeTime(
  observedAt: number,
  now: number,
  locale: ResolvedLocale,
): string {
  const seconds = Math.max(0, Math.floor((now - observedAt) / 1_000));
  try {
    const formatter = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
    if (seconds < 5) return formatter.format(0, 'second');
    if (seconds < 60) return formatter.format(-seconds, 'second');
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return formatter.format(-minutes, 'minute');
    return formatter.format(-Math.floor(minutes / 60), 'hour');
  } catch {
    if (seconds < 5) return 'just now';
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    return `${Math.floor(minutes / 60)}h ago`;
  }
}

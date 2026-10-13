import {
  applyLocale,
  formatControlCode,
  loadLocaleManifest,
  loadLocaleMessages,
  localePackMetadata,
  type ResolvedLocale,
  type TranslationKey,
  translate,
  translateTemplate,
} from '../i18n/i18n';
import { languageCatalog } from '../i18n/language-catalog';
import { detectBrowserRegion, regionName } from '../i18n/region';
import type { PeerRecord, PeerState, PeerStatus } from '../network/peer-types';
import { keyboardInputCode } from '../scene/camera-input';
import type { SettingsPatch, SettingsState } from '../settings/settings-types';
import {
  CONTROL_ACTIONS,
  type ControlAction,
  isBindableControlCode,
} from '../settings/settings-types';
import type { PeerAnalytics } from '../wasm/load-wasm';
import { renderPeerList } from './peer-list';

type NetworkTone = 'error' | 'loading' | 'online';
type MotionListener = (paused: boolean) => void;
const KUBO_STATUS_DISMISS_MS = 8_000;

export class AppShell {
  readonly #canvas = requiredElement<HTMLCanvasElement>('universe-canvas');
  readonly #sceneFallback = requiredElement<HTMLElement>('scene-fallback');
  readonly #motionButton = requiredElement<HTMLButtonElement>('motion-toggle');
  readonly #peerButton = requiredElement<HTMLButtonElement>(
    'peer-explorer-button',
  );
  readonly #peerCount = requiredElement<HTMLElement>('header-peer-count');
  readonly #dialog = requiredElement<HTMLDialogElement>('peer-dialog');
  readonly #dialogClose =
    requiredElement<HTMLButtonElement>('peer-dialog-close');
  readonly #peerList = requiredElement<HTMLOListElement>('peer-list');
  readonly #peerEmpty = requiredElement<HTMLElement>('peer-empty');
  readonly #peerSearch = requiredElement<HTMLInputElement>('peer-search');
  readonly #peerFilter = requiredElement<HTMLSelectElement>('peer-filter');
  readonly #peerResultCount =
    requiredElement<HTMLOutputElement>('peer-result-count');
  readonly #peerSummary = requiredElement<HTMLElement>('peer-summary');
  readonly #networkStatus = requiredElement<HTMLElement>('network-status');
  readonly #networkBeacon = requiredSelector<HTMLElement>(
    '.node-status__beacon',
  );
  readonly #localPeerId = requiredElement<HTMLElement>('local-peer-id');
  readonly #retryButton = requiredElement<HTMLButtonElement>('network-retry');
  readonly #connectedMetric = requiredElement<HTMLElement>('metric-connected');
  readonly #observedMetric = requiredElement<HTMLElement>('metric-observed');
  readonly #latencyMetric = requiredElement<HTMLElement>('metric-latency');
  readonly #latencySamples = requiredElement<HTMLElement>(
    'metric-latency-samples',
  );
  readonly #p95Metric = requiredElement<HTMLElement>('metric-p95');
  readonly #historyCount = requiredElement<HTMLElement>('history-count');
  readonly #historyClear = requiredElement<HTMLButtonElement>('history-clear');
  readonly #kuboProbe = requiredElement<HTMLButtonElement>('kubo-probe');
  readonly #kuboStatus = requiredElement<HTMLElement>('kubo-status');
  readonly #settingsButton =
    requiredElement<HTMLButtonElement>('settings-button');
  readonly #settingsDialog =
    requiredElement<HTMLDialogElement>('settings-dialog');
  readonly #settingsDialogClose = requiredElement<HTMLButtonElement>(
    'settings-dialog-close',
  );
  readonly #settingsForm = requiredElement<HTMLFormElement>('settings-form');
  readonly #settingsReset =
    requiredElement<HTMLButtonElement>('settings-reset');
  readonly #settingsSummary = requiredElement<HTMLElement>('settings-summary');
  readonly #detectedRegion = requiredElement<HTMLElement>('detected-region');
  readonly #languageSelect =
    requiredElement<HTMLSelectElement>('settings-language');
  readonly #languageCoverageSummary = requiredElement<HTMLElement>(
    'language-coverage-summary',
  );
  readonly #languageCoverageList = requiredElement<HTMLUListElement>(
    'language-coverage-list',
  );
  readonly #skyboxCredit = requiredElement<HTMLElement>('skybox-credit');
  readonly #liveRegion = requiredElement<HTMLElement>('aggregate-live');
  readonly #nodeTooltip = requiredElement<HTMLElement>('node-tooltip');
  readonly #nodeTooltipPeer = requiredElement<HTMLElement>('node-tip-peer');
  readonly #nodeTooltipState = requiredElement<HTMLElement>('node-tip-state');
  readonly #nodeTooltipLatency =
    requiredElement<HTMLElement>('node-tip-latency');
  readonly #nodeTooltipDirection =
    requiredElement<HTMLElement>('node-tip-direction');
  readonly #nodeTooltipTransport =
    requiredElement<HTMLElement>('node-tip-transport');
  readonly #nodeTooltipProtocols =
    requiredElement<HTMLElement>('node-tip-protocols');
  readonly #nodeTooltipAgent = requiredElement<HTMLElement>('node-tip-agent');
  readonly #nodeTooltipProtocol = requiredElement<HTMLElement>(
    'node-tip-protocol-version',
  );
  readonly #nodeTooltipAddresses =
    requiredElement<HTMLElement>('node-tip-addresses');
  readonly #nodeTooltipRelay = requiredElement<HTMLElement>('node-tip-relay');
  readonly #nodeTooltipSource = requiredElement<HTMLElement>('node-tip-source');
  readonly #headerNetworkState = requiredElement<HTMLElement>(
    'header-network-state',
  );
  readonly #headerNetworkDot = requiredSelector<HTMLElement>(
    '.connection-chip__dot',
  );
  readonly #motionMedia = window.matchMedia('(prefers-reduced-motion: reduce)');
  readonly #motionListeners = new Set<MotionListener>();
  #paused = this.#motionMedia.matches;
  #manualMotionChoice = false;
  #retryListener?: () => void;
  #clearHistoryListener?: () => void;
  #kuboProbeListener?: () => void;
  #settingsChangeListener?: (patch: SettingsPatch) => void;
  #settingsResetListener?: () => void;
  #settingsDialogPreviousFocus?: HTMLElement;
  #dialogPreviousFocus?: HTMLElement;
  #kuboStatusTimer?: number;
  #kuboMessage = '';
  #announcementTimer?: number;
  #pendingAnnouncement = '';
  #lastAnnouncement = '';
  #currentPeers: readonly PeerRecord[] = [];
  #browserConnectedCount = 0;
  #networkMessage?: { readonly tone: NetworkTone; readonly message: string };
  #storedPeerCount?: number;
  #storedPeerUnavailable = false;
  #tooltipSignature = '';
  #tooltipPeer?: PeerRecord;
  #tooltipX = 0;
  #tooltipY = 0;
  #tooltipPinned = false;
  #languageCatalogPopulated = false;
  #selectedLanguage = 'auto';
  #currentLocale: ResolvedLocale = 'en';
  #localeLoadGeneration = 0;

  constructor() {
    this.#setMotionState(this.#paused);
    this.#motionButton.addEventListener('click', () => {
      this.#manualMotionChoice = true;
      this.#setMotionState(!this.#paused);
    });
    this.#motionMedia.addEventListener('change', ({ matches }) => {
      if (!this.#manualMotionChoice) {
        this.#setMotionState(matches);
      }
    });
    window.addEventListener('resize', () => this.#syncPeerButtonLabel(), {
      passive: true,
    });
    this.#peerButton.addEventListener('click', () => {
      if (!this.#dialog.open) {
        this.#dialogPreviousFocus = document.activeElement as HTMLElement;
        this.#dialog.showModal();
        this.#renderFilteredPeers();
        this.#peerSearch.focus();
      }
    });
    this.#dialogClose.addEventListener('click', () => this.#dialog.close());
    // A modal backdrop is an intentional, low-friction dismissal target on
    // both pointer and touch devices. Only the dialog element itself is the
    // backdrop; clicks inside the surface keep their normal behaviour.
    this.#dialog.addEventListener('click', (event) => {
      if (event.target === this.#dialog) this.#dialog.close();
    });
    this.#dialog.addEventListener('close', () => {
      this.#dialogPreviousFocus?.focus();
      this.#dialogPreviousFocus = undefined;
    });
    this.#retryButton.addEventListener('click', () => this.#retryListener?.());
    this.#peerSearch.addEventListener('input', () =>
      this.#renderFilteredPeers(),
    );
    this.#peerFilter.addEventListener('change', () =>
      this.#renderFilteredPeers(),
    );
    this.#historyClear.addEventListener('click', () =>
      this.#clearHistoryListener?.(),
    );
    this.#kuboProbe.addEventListener('click', () => {
      if (
        this.#kuboStatus.dataset.visible === 'true' &&
        !this.#kuboProbe.disabled
      ) {
        this.clearKuboStatus();
        return;
      }
      this.#kuboProbeListener?.();
    });
    this.#settingsButton.addEventListener('click', () => {
      this.#settingsDialogPreviousFocus = document.activeElement as HTMLElement;
      this.#populateLanguageCatalog(this.#currentLocale);
      this.#settingsDialog.showModal();
      this.#settingsDialog.querySelector<HTMLElement>('select, input')?.focus();
    });
    this.#settingsDialogClose.addEventListener('click', () =>
      this.#settingsDialog.close(),
    );
    this.#settingsDialog.addEventListener('click', (event) => {
      if (event.target === this.#settingsDialog) this.#settingsDialog.close();
    });
    this.#settingsDialog.addEventListener('close', () => {
      this.#settingsDialogPreviousFocus?.focus();
      this.#settingsDialogPreviousFocus = undefined;
    });
    this.#settingsForm.addEventListener('change', (event) => {
      const target = event.target;
      if (
        !(
          target instanceof HTMLInputElement ||
          target instanceof HTMLSelectElement
        )
      )
        return;
      const key = target.dataset.setting as keyof SettingsPatch | undefined;
      if (key === undefined) return;
      const value =
        target instanceof HTMLInputElement && target.type === 'checkbox'
          ? target.checked
          : target instanceof HTMLInputElement && target.type === 'range'
            ? Number(target.value)
            : target.value;
      this.#settingsChangeListener?.({ [key]: value } as SettingsPatch);
    });
    this.#settingsForm.addEventListener('keydown', (event) => {
      const target = event.target;
      if (!(target instanceof HTMLInputElement)) return;
      const action = target.dataset.control as ControlAction | undefined;
      const inputCode = keyboardInputCode(event.code, event.key);
      if (
        action === undefined ||
        !CONTROL_ACTIONS.includes(action) ||
        !isBindableControlCode(inputCode)
      ) {
        return;
      }
      event.preventDefault();
      target.value = formatControlCode(inputCode);
      target.dataset.code = inputCode;
      this.#settingsChangeListener?.({
        controls: { [action]: inputCode },
      });
    });
    this.#settingsReset.addEventListener('click', () =>
      this.#settingsResetListener?.(),
    );
    this.#settingsForm.addEventListener('submit', (event) => {
      event.preventDefault();
      this.#settingsDialog.close();
    });
  }

  get motionPaused(): boolean {
    return this.#paused;
  }

  onMotionChange(listener: MotionListener): () => void {
    this.#motionListeners.add(listener);
    listener(this.#paused);
    return () => this.#motionListeners.delete(listener);
  }

  onRetry(listener: () => void): void {
    this.#retryListener = listener;
  }

  onClearHistory(listener: () => void): void {
    this.#clearHistoryListener = listener;
  }

  onKuboProbe(listener: () => void): void {
    this.#kuboProbeListener = listener;
  }

  onSettingsChange(listener: (patch: SettingsPatch) => void): void {
    this.#settingsChangeListener = listener;
  }

  onSettingsReset(listener: () => void): void {
    this.#settingsResetListener = listener;
  }

  setSettings(settings: SettingsState): void {
    const locale = applyLocale(settings.language);
    this.#currentLocale = locale;
    const controls = this.#settingsForm.querySelectorAll<
      HTMLInputElement | HTMLSelectElement
    >('[data-setting]');
    controls.forEach((control) => {
      const key = control.dataset.setting as keyof SettingsState | undefined;
      if (key === undefined || key === 'version') return;
      const value = settings[key];
      if (key === 'language') this.#selectedLanguage = String(value);
      if (control instanceof HTMLInputElement && control.type === 'checkbox') {
        control.checked = value === true;
      } else {
        control.value = String(value);
      }
      const output = document.getElementById(`${control.id}-value`);
      if (output !== null) {
        output.textContent = formatSettingValue(key, value, locale);
      }
    });
    this.#syncCanvasShortcuts(settings.controls);
    const request = ++this.#localeLoadGeneration;
    const refresh = (forcePeerRebuild = false): void => {
      applyLocale(settings.language);
      this.#currentLocale = locale;
      this.#syncMotionLabel();
      if (this.#networkMessage !== undefined) {
        this.#networkStatus.textContent = localizeNetworkMessage(
          this.#networkMessage.message,
          locale,
        );
        this.#headerNetworkState.textContent =
          this.#networkMessage.tone === 'online'
            ? translate(locale, 'live')
            : this.#networkMessage.tone === 'error'
              ? translate(locale, 'offline')
              : translate(locale, 'connecting');
      }
      if (this.#kuboStatus.dataset.visible === 'true') {
        this.#kuboStatus.textContent = localizeKuboStatus(
          this.#kuboMessage,
          locale,
        );
        this.#kuboProbe.setAttribute(
          'aria-label',
          this.#kuboProbe.disabled
            ? translate(locale, 'kuboReading')
            : translate(locale, 'readKubo'),
        );
      }
      if (this.#storedPeerUnavailable) {
        this.#historyCount.textContent = translate(
          locale,
          'historyUnavailable',
        );
      } else if (this.#storedPeerCount !== undefined) {
        this.#historyCount.textContent = translateTemplate(
          locale,
          'historyRetained',
          { count: formatInteger(this.#storedPeerCount, locale) },
        );
      }
      if (this.#languageCatalogPopulated) {
        this.#populateLanguageCatalog(locale);
      }
      this.#syncPeerSummary();
      this.#syncPeerButtonLabel();
      // Rebuild retained peer rows when the locale changes so their detail
      // terms (<dt>) and accessible names are translated as well as the
      // summary. The renderer preserves rows for live updates and only
      // invalidates its cache when the locale actually differs.
      if (forcePeerRebuild) {
        // The selected locale is unchanged when a lazy pack arrives, so the
        // peer-list locale marker alone cannot detect that its labels changed.
        this.#peerList.dataset.locale = '';
        this.#tooltipSignature = '';
      }
      this.#renderFilteredPeers(forcePeerRebuild);
      if (!this.#nodeTooltip.hidden && this.#tooltipPeer !== undefined) {
        this.showNodeDetails(
          this.#tooltipPeer,
          this.#tooltipX,
          this.#tooltipY,
          this.#tooltipPinned,
        );
      }
      this.#settingsForm
        .querySelectorAll<HTMLInputElement>('[data-control]')
        .forEach((control) => {
          const action = control.dataset.control as ControlAction | undefined;
          if (action === undefined || !CONTROL_ACTIONS.includes(action)) return;
          const code = settings.controls[action];
          control.value = formatControlCode(code);
          control.dataset.code = code;
        });
      this.#settingsSummary.textContent =
        settings.qualityMode === 'auto'
          ? translate(locale, 'settingsSummaryAuto')
          : `${presetLabel(locale, settings.preset)} — ${translate(locale, 'settingsSummaryManual')}`;
      const region = detectBrowserRegion();
      if (settings.regionMode === 'off') {
        this.#detectedRegion.textContent = `${translate(locale, 'region')}: ${translate(locale, 'regionOff')}`;
      } else if (region.code === undefined) {
        this.#detectedRegion.textContent = `${translate(locale, 'region')}: ${translate(locale, 'regionUnavailable')}`;
      } else {
        const source =
          region.source === 'timezone'
            ? translate(locale, 'regionSourceTimezone')
            : translate(locale, 'regionSourceLanguage');
        this.#detectedRegion.textContent = `${translate(locale, 'region')}: ${regionName(region.code, locale)} · ${source}`;
      }
      this.#skyboxCredit.textContent =
        settings.skyboxMode === 'off'
          ? translate(locale, 'skyboxCreditDisabled')
          : translate(locale, 'skyboxCreditEnabled');
      this.#skyboxCredit.dataset.i18n =
        settings.skyboxMode === 'off'
          ? 'skyboxCreditDisabled'
          : 'skyboxCreditEnabled';
    };
    refresh();
    void loadLocaleManifest().then((loaded) => {
      if (loaded && this.#languageCatalogPopulated) {
        this.#populateLanguageCatalog(this.#currentLocale);
      }
    });
    void loadLocaleMessages(locale).then((loaded) => {
      if (loaded && request === this.#localeLoadGeneration) refresh(true);
    });
  }

  setKuboStatus(message: string, busy = false): void {
    if (this.#kuboStatusTimer !== undefined) {
      window.clearTimeout(this.#kuboStatusTimer);
      this.#kuboStatusTimer = undefined;
    }
    this.#kuboMessage = message;
    this.#kuboStatus.textContent = localizeKuboStatus(
      message,
      this.#currentLocale,
    );
    this.#kuboStatus.dataset.visible = 'true';
    this.#kuboStatus.removeAttribute('aria-hidden');
    this.#kuboProbe.disabled = busy;
    this.#kuboProbe.dataset.busy = busy ? 'true' : 'false';
    this.#kuboProbe.setAttribute(
      'aria-label',
      busy
        ? translate(this.#currentLocale, 'kuboReading')
        : translate(this.#currentLocale, 'readKubo'),
    );
    if (!busy) {
      this.#kuboStatusTimer = window.setTimeout(
        () => this.clearKuboStatus(),
        KUBO_STATUS_DISMISS_MS,
      );
    }
  }

  clearKuboStatus(): void {
    if (this.#kuboStatusTimer !== undefined) {
      window.clearTimeout(this.#kuboStatusTimer);
      this.#kuboStatusTimer = undefined;
    }
    this.#kuboStatus.dataset.visible = 'false';
    this.#kuboStatus.setAttribute('aria-hidden', 'true');
  }

  showNodeDetails(
    peer: PeerRecord | undefined,
    x = 0,
    y = 0,
    pinned = false,
  ): void {
    if (peer === undefined) {
      this.#tooltipPeer = undefined;
      this.#nodeTooltip.hidden = true;
      this.#tooltipSignature = '';
      return;
    }
    this.#tooltipPeer = peer;
    this.#tooltipX = x;
    this.#tooltipY = y;
    this.#tooltipPinned = pinned;
    const signature = `${this.#currentLocale}|${peer.peerId}|${peer.status}|${peer.source ?? ''}|${peer.latencyMs ?? ''}|${peer.direction ?? ''}|${peer.transport ?? ''}|${peer.agentVersion ?? ''}|${peer.protocolVersion ?? ''}|${peer.addressCount ?? ''}|${peer.relayPeerId ?? ''}|${peer.protocols?.join(',') ?? ''}`;
    if (signature !== this.#tooltipSignature) {
      this.#tooltipSignature = signature;
      this.#nodeTooltipPeer.textContent = shortPeerId(peer.peerId);
      this.#nodeTooltipPeer.title = peer.peerId;
      this.#nodeTooltipState.textContent = statusLabel(
        peer.status,
        this.#currentLocale,
      );
      this.#nodeTooltipLatency.textContent =
        peer.latencyMs === undefined
          ? translate(this.#currentLocale, 'unmeasured')
          : `${formatInteger(Math.round(peer.latencyMs), this.#currentLocale)} ms`;
      this.#nodeTooltipDirection.textContent =
        peer.direction ?? translate(this.#currentLocale, 'notObserved');
      this.#nodeTooltipTransport.textContent =
        peer.transport ?? translate(this.#currentLocale, 'notObserved');
      this.#nodeTooltipProtocols.textContent = peer.protocols?.length
        ? peer.protocols.join(', ')
        : translate(this.#currentLocale, 'notObserved');
      this.#nodeTooltipAgent.textContent =
        peer.agentVersion ?? translate(this.#currentLocale, 'notObserved');
      this.#nodeTooltipProtocol.textContent =
        peer.protocolVersion ?? translate(this.#currentLocale, 'notObserved');
      this.#nodeTooltipAddresses.textContent =
        peer.addressCount === undefined
          ? translate(this.#currentLocale, 'notObserved')
          : formatInteger(peer.addressCount, this.#currentLocale);
      this.#nodeTooltipRelay.textContent =
        peer.relayPeerId === undefined
          ? translate(this.#currentLocale, 'notObserved')
          : shortPeerId(peer.relayPeerId);
      this.#nodeTooltipRelay.title = peer.relayPeerId ?? '';
      this.#nodeTooltipSource.textContent = sourceLabel(
        peer.source,
        this.#currentLocale,
      );
    }
    this.#nodeTooltip.dataset.pinned = pinned ? 'true' : 'false';
    this.#nodeTooltip.style.left = `${x}px`;
    this.#nodeTooltip.style.top = `${y}px`;
    this.#nodeTooltip.hidden = false;
    this.#placeTooltip(x, y);
  }

  #placeTooltip(anchorX: number, anchorY: number): void {
    // The first call can happen in the same task that removes `hidden`, before
    // layout has produced an offset box. Use the computed width as a safe
    // fallback so a narrow viewport never receives an unclamped card.
    const computed = getComputedStyle(this.#nodeTooltip);
    const width =
      this.#nodeTooltip.offsetWidth ||
      Number.parseFloat(computed.width) ||
      Math.min(320, window.innerWidth - 16);
    const height =
      this.#nodeTooltip.offsetHeight ||
      Number.parseFloat(computed.height) ||
      220;
    const gap = 14;
    const rightCandidate = anchorX + gap;
    const leftCandidate = anchorX - gap - width;
    const maxLeft = Math.max(8, window.innerWidth - width - 8);
    // Prefer the node's right side, but flip to the left before clamping so
    // the card remains fully readable on narrow screens.
    const left =
      rightCandidate + width <= window.innerWidth - 8
        ? rightCandidate
        : leftCandidate >= 8
          ? leftCandidate
          : Math.min(Math.max(8, rightCandidate), maxLeft);
    const top = Math.min(
      Math.max(height / 2 + 8, anchorY),
      Math.max(height / 2 + 8, window.innerHeight - height / 2 - 8),
    );
    this.#nodeTooltip.style.left = `${left}px`;
    this.#nodeTooltip.style.top = `${top}px`;
    const edgeX = anchorX < left ? left : left + width;
    const edgeY = top;
    const deltaX = anchorX - edgeX;
    const deltaY = anchorY - edgeY;
    this.#nodeTooltip.style.setProperty(
      '--anchor-line-x',
      `${anchorX < left ? 0 : width}px`,
    );
    this.#nodeTooltip.style.setProperty('--anchor-line-y', `${height / 2}px`);
    this.#nodeTooltip.style.setProperty(
      '--anchor-line-length',
      `${Math.hypot(deltaX, deltaY)}px`,
    );
    this.#nodeTooltip.style.setProperty(
      '--anchor-line-angle',
      `${Math.atan2(deltaY, deltaX)}rad`,
    );
    this.#nodeTooltip.style.setProperty(
      '--anchor-line-width',
      `${Math.min(2, 0.85 + Math.hypot(deltaX, deltaY) / 220)}px`,
    );
  }

  setStoredPeerCount(count: number): void {
    this.#storedPeerCount = count;
    this.#storedPeerUnavailable = false;
    this.#historyCount.textContent = translateTemplate(
      this.#currentLocale,
      'historyRetained',
      { count: formatInteger(count, this.#currentLocale) },
    );
  }

  setStoredPeerUnavailable(): void {
    this.#storedPeerCount = undefined;
    this.#storedPeerUnavailable = true;
    this.#historyCount.textContent = translate(
      this.#currentLocale,
      'historyUnavailable',
    );
  }

  markSceneReady(): void {
    document.documentElement.dataset.scene = 'ready';
    this.#sceneFallback.hidden = true;
    this.#sceneFallback.setAttribute('aria-hidden', 'true');
    this.#canvas.removeAttribute('aria-hidden');
    this.#canvas.tabIndex = 0;
  }

  markSceneUnavailable(): void {
    document.documentElement.dataset.scene = 'unavailable';
    this.#sceneFallback.hidden = false;
    this.#sceneFallback.removeAttribute('aria-hidden');
    this.#canvas.setAttribute('aria-hidden', 'true');
    this.#canvas.removeAttribute('tabindex');
  }

  setNetworkState(
    tone: NetworkTone,
    message: string,
    localPeerId?: string,
  ): void {
    this.#networkMessage = { tone, message };
    this.#networkBeacon.dataset.tone = tone;
    this.#headerNetworkDot.dataset.tone = tone;
    this.#networkStatus.textContent = localizeNetworkMessage(
      message,
      this.#currentLocale,
    );
    this.#headerNetworkState.textContent =
      tone === 'online'
        ? translate(this.#currentLocale, 'live')
        : tone === 'error'
          ? translate(this.#currentLocale, 'offline')
          : translate(this.#currentLocale, 'connecting');
    this.#retryButton.hidden = tone !== 'error';
    if (localPeerId !== undefined) {
      this.#localPeerId.textContent = shortPeerId(localPeerId);
      this.#localPeerId.title = localPeerId;
    }
  }

  updatePeerState(state: PeerState, analytics?: PeerAnalytics): void {
    const peers = [...state.peers.values()];
    this.#currentPeers = peers;
    if (this.#tooltipPeer !== undefined) {
      const latestTooltipPeer = peers.find(
        (peer) => peer.peerId === this.#tooltipPeer?.peerId,
      );
      if (latestTooltipPeer === undefined) {
        this.showNodeDetails(undefined);
      } else if (!this.#nodeTooltip.hidden) {
        this.showNodeDetails(
          latestTooltipPeer,
          this.#tooltipX,
          this.#tooltipY,
          this.#tooltipPinned,
        );
      } else {
        this.#tooltipPeer = latestTooltipPeer;
      }
    }
    this.#connectedMetric.textContent = formatInteger(
      state.browserConnectedCount,
      this.#currentLocale,
    );
    this.#connectedMetric.parentElement?.setAttribute(
      'data-tone',
      state.browserConnectedCount === 0 ? 'empty' : 'ok',
    );
    this.#observedMetric.textContent = formatInteger(
      state.totalCount,
      this.#currentLocale,
    );
    // The header badge represents everything currently tracked in the
    // explorer, including an explicitly imported Kubo view. The accessible
    // name keeps the browser-live subset explicit so a Kubo observation is
    // never mistaken for a connection owned by this browser.
    this.#peerCount.textContent = formatInteger(
      state.totalCount,
      this.#currentLocale,
    );
    this.#browserConnectedCount = state.browserConnectedCount;
    this.#syncPeerButtonLabel();
    this.#latencyMetric.textContent =
      analytics === undefined || analytics.latencySamples === 0
        ? '—'
        : `${formatInteger(analytics.latencyP50Ms, this.#currentLocale)} ms`;
    this.#p95Metric.textContent =
      analytics === undefined || analytics.latencySamples === 0
        ? '—'
        : `${formatInteger(analytics.latencyP95Ms, this.#currentLocale)} ms`;
    const measured = analytics?.latencySamples ?? 0;
    const coverage = analytics?.measurementCoverage ?? 0;
    this.#latencySamples.textContent = translateTemplate(
      this.#currentLocale,
      state.browserConnectedCount === 0
        ? 'latencySampleEmpty'
        : 'latencySampleSummary',
      {
        measured: formatInteger(measured, this.#currentLocale),
        total: formatInteger(state.browserConnectedCount, this.#currentLocale),
        coverage: Math.round(coverage),
      },
    );
    this.#syncPeerSummary({
      browserConnectedCount: state.browserConnectedCount,
      kuboConnectedCount: state.kuboConnectedCount,
      discoveredCount: state.discoveredCount,
      disconnectedCount: state.disconnectedCount,
    });
    this.#renderFilteredPeers();
    const connectedBucket =
      state.browserConnectedCount < 5
        ? state.browserConnectedCount
        : Math.round(state.browserConnectedCount / 5) * 5;
    this.#queueAnnouncement(
      translateTemplate(this.#currentLocale, 'peerAnnouncement', {
        connected: formatInteger(connectedBucket, this.#currentLocale),
        total: formatInteger(state.totalCount, this.#currentLocale),
      }),
    );
  }

  #renderFilteredPeers(forceRebuild = false): void {
    if (!this.#dialog.open) {
      return;
    }
    const query = this.#peerSearch.value.trim().toLowerCase();
    const filter = parsePeerFilter(this.#peerFilter.value);
    const filtered = this.#currentPeers.filter(
      (peer) =>
        (filter === undefined || peer.status === filter) &&
        (query === '' || peer.peerId.toLowerCase().includes(query)),
    );
    renderPeerList(
      this.#peerList,
      this.#peerEmpty,
      filtered,
      Date.now(),
      this.#currentLocale,
      forceRebuild,
    );
    this.#peerList.setAttribute('aria-busy', 'false');
    this.#peerResultCount.textContent = `${formatInteger(filtered.length, this.#currentLocale)} ${translate(this.#currentLocale, 'shown')}`;
    this.#peerEmpty.textContent =
      this.#currentPeers.length === 0
        ? translate(this.#currentLocale, 'noPeers')
        : translate(this.#currentLocale, 'noPeerMatch');
  }

  #syncPeerButtonLabel(): void {
    const longElement = this.#peerButton.querySelector<HTMLElement>(
      '.peer-button__label--long',
    );
    const shortElement = this.#peerButton.querySelector<HTMLElement>(
      '.peer-button__label--short',
    );
    const longLabel =
      longElement?.textContent?.trim() ||
      translate(this.#currentLocale, 'peerExplorer');
    const shortLabel =
      shortElement?.textContent?.trim() ||
      translate(this.#currentLocale, 'peerExplorerShort');
    const visibleLabel =
      longElement !== null && getComputedStyle(longElement).display !== 'none'
        ? longLabel
        : shortLabel;
    const visibleCount = this.#peerCount.textContent?.trim() || '0';
    this.#peerButton.setAttribute(
      'aria-label',
      `${longLabel} — ${visibleLabel} ${visibleCount}, ${translateTemplate(
        this.#currentLocale,
        'peerAnnouncement',
        {
          connected: formatInteger(
            this.#browserConnectedCount,
            this.#currentLocale,
          ),
          total: visibleCount,
        },
      )}`,
    );
  }

  #syncPeerSummary(
    state?: Pick<
      PeerState,
      | 'browserConnectedCount'
      | 'kuboConnectedCount'
      | 'discoveredCount'
      | 'disconnectedCount'
    >,
  ): void {
    if (state !== undefined) {
      this.#peerSummary.textContent = translateTemplate(
        this.#currentLocale,
        'peerSummary',
        {
          browser: formatInteger(
            state.browserConnectedCount,
            this.#currentLocale,
          ),
          kubo: formatInteger(state.kuboConnectedCount, this.#currentLocale),
          discovered: formatInteger(state.discoveredCount, this.#currentLocale),
          disconnected: formatInteger(
            state.disconnectedCount,
            this.#currentLocale,
          ),
        },
      );
      return;
    }
    let kubo = 0;
    let discovered = 0;
    let disconnected = 0;
    for (const peer of this.#currentPeers) {
      if (peer.status === 'connected' && peer.source === 'kubo') {
        kubo += 1;
      } else if (peer.status === 'discovered') {
        discovered += 1;
      } else if (peer.status === 'disconnected') {
        disconnected += 1;
      }
    }
    this.#peerSummary.textContent = translateTemplate(
      this.#currentLocale,
      'peerSummary',
      {
        browser: formatInteger(
          this.#browserConnectedCount,
          this.#currentLocale,
        ),
        kubo: formatInteger(kubo, this.#currentLocale),
        discovered: formatInteger(discovered, this.#currentLocale),
        disconnected: formatInteger(disconnected, this.#currentLocale),
      },
    );
  }

  #populateLanguageCatalog(locale: ResolvedLocale): void {
    const entries = languageCatalog(locale);
    const autoOption = document.createElement('option');
    autoOption.value = 'auto';
    autoOption.textContent = translate(locale, 'languageAuto');
    this.#languageSelect.replaceChildren(autoOption);
    for (const entry of entries) {
      const option = document.createElement('option');
      option.value = entry.tag;
      option.textContent = `${entry.label} (${entry.tag})`;
      this.#languageSelect.append(option);
    }
    const editorial = entries.filter(
      ({ quality }) => quality === 'editorial',
    ).length;
    const generated = entries.filter(
      ({ quality }) => quality === 'generated',
    ).length;
    const bridge = entries.filter(({ quality }) => quality === 'bridge').length;
    this.#languageCoverageSummary.textContent = `${editorial} ${translate(locale, 'editorialTranslation')} · ${generated} ${translate(locale, 'machineTranslation')} · ${bridge} ${translate(locale, 'bridgeTranslation')}.`;
    this.#languageCoverageList.replaceChildren(
      ...entries.map((entry) => {
        const item = document.createElement('li');
        const statusKey: TranslationKey =
          entry.quality === 'editorial'
            ? 'editorialTranslation'
            : entry.quality === 'bridge'
              ? 'bridgeTranslation'
              : 'machineTranslation';
        const metadata = localePackMetadata(entry.tag);
        const coverage =
          metadata === undefined
            ? ''
            : ` · ${translateTemplate(locale, 'translationCoverage', {
                percent: formatInteger(
                  Math.round((1 - metadata.residue) * 100),
                  locale,
                ),
              })}`;
        const bridgeTarget =
          entry.quality === 'bridge' && metadata !== undefined
            ? ` · via ${metadata.target}`
            : '';
        item.textContent = `${entry.label} (${entry.tag}) — ${translate(locale, statusKey)}${coverage}${bridgeTarget}`;
        return item;
      }),
    );
    this.#languageCoverageList.setAttribute('aria-busy', 'false');
    this.#languageSelect.value = this.#selectedLanguage;
    this.#languageCatalogPopulated = true;
  }

  #setMotionState(paused: boolean): void {
    this.#paused = paused;
    document.documentElement.dataset.motion = paused ? 'paused' : 'running';
    this.#motionButton.setAttribute('aria-pressed', String(paused));
    this.#syncMotionLabel();
    for (const listener of this.#motionListeners) {
      listener(paused);
    }
  }

  #syncMotionLabel(): void {
    const key = this.#paused ? 'resumeMotion' : 'pauseMotion';
    const label = translate(this.#currentLocale, key);
    this.#motionButton.setAttribute('aria-label', label);
    const labelElement = document.getElementById('motion-toggle-label');
    if (labelElement !== null) labelElement.textContent = label;
  }

  #syncCanvasShortcuts(settings: SettingsState['controls']): void {
    const shortcuts = new Set<string>();
    const customShortcuts = new Set<string>();
    for (const code of Object.values(settings)) {
      const shortcut = formatAriaShortcut(code);
      customShortcuts.add(shortcut);
      shortcuts.add(shortcut);
    }
    // These scene-level commands are stable even when movement bindings are
    // customized, and remain discoverable to screen-reader users.
    for (const code of [
      'PageUp',
      'PageDown',
      'Home',
      'Digit0',
      'KeyR',
      'BracketLeft',
      'BracketRight',
      'Enter',
      'Space',
      'Escape',
    ]) {
      const shortcut = formatAriaShortcut(code);
      // A user binding intentionally takes precedence over a convenience
      // shortcut. Do not advertise a reset/selection key that the renderer
      // can no longer receive after the customization.
      if (!customShortcuts.has(shortcut)) shortcuts.add(shortcut);
    }
    this.#canvas.setAttribute('aria-keyshortcuts', [...shortcuts].join(' '));
  }

  #queueAnnouncement(message: string): void {
    this.#pendingAnnouncement = message;
    if (this.#announcementTimer !== undefined) {
      return;
    }
    this.#announcementTimer = window.setTimeout(() => {
      if (this.#pendingAnnouncement !== this.#lastAnnouncement) {
        this.#liveRegion.textContent = this.#pendingAnnouncement;
        this.#lastAnnouncement = this.#pendingAnnouncement;
      }
      this.#announcementTimer = undefined;
    }, 10_000);
  }
}

function statusLabel(status: PeerStatus, locale: ResolvedLocale): string {
  if (status === 'connected') return translate(locale, 'connected');
  if (status === 'discovered') return translate(locale, 'discovered');
  return translate(locale, 'disconnected');
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

function parsePeerFilter(value: string): PeerStatus | undefined {
  switch (value) {
    case 'all':
      return undefined;
    case 'connected':
    case 'discovered':
    case 'disconnected':
      return value;
    default:
      return undefined;
  }
}

function requiredElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (element === null) {
    throw new Error(`Required element #${id} is missing`);
  }
  return element as T;
}

function requiredSelector<T extends HTMLElement>(selector: string): T {
  const element = document.querySelector(selector);
  if (element === null) {
    throw new Error(`Required element ${selector} is missing`);
  }
  return element as T;
}

function shortPeerId(peerId: string): string {
  if (peerId.length <= 26) {
    return peerId;
  }
  return `${peerId.slice(0, 15)}…${peerId.slice(-7)}`;
}

function formatInteger(value: number, locale: ResolvedLocale = 'en'): string {
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

function formatSettingValue(
  key: keyof SettingsState,
  value: SettingsState[keyof SettingsState],
  locale: ResolvedLocale,
): string {
  if (typeof value === 'boolean') return value ? 'On' : 'Off';
  if (typeof value === 'string') return value;
  if (typeof value !== 'number') return String(value);
  if (key === 'fogDensity') return formatDecimal(value, locale, 4);
  if (key === 'pixelRatio' || key === 'motionScale') {
    return `${formatDecimal(value, locale, 2)}×`;
  }
  if (key === 'cameraSensitivity') return `${formatDecimal(value, locale, 2)}×`;
  if (key === 'exposure') return formatDecimal(value, locale, 2);
  if (
    key === 'nebulaDensity' ||
    key === 'dustDensity' ||
    key === 'nodeLod' ||
    key === 'edgeBrightness'
  ) {
    return formatDecimal(value, locale, 2);
  }
  return String(value);
}

function formatDecimal(
  value: number,
  locale: ResolvedLocale,
  fractionDigits: number,
): string {
  try {
    return new Intl.NumberFormat(locale, {
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits,
    }).format(value);
  } catch {
    return value.toFixed(fractionDigits);
  }
}

function presetLabel(
  locale: ResolvedLocale,
  preset: SettingsState['preset'],
): string {
  const key: TranslationKey =
    preset === 'auto'
      ? 'presetAuto'
      : preset === 'lowest'
        ? 'presetLowest'
        : preset === 'low'
          ? 'presetLow'
          : preset === 'medium'
            ? 'presetMedium'
            : preset === 'high'
              ? 'presetHigh'
              : 'presetHighest';
  return translate(locale, key);
}

function localizeKuboStatus(message: string, locale: ResolvedLocale): string {
  if (message.startsWith('Requesting /id and /swarm/peers')) {
    return translate(locale, 'kuboRequesting');
  }
  const observedPrefix = ' peers observed by local Kubo.';
  const observedMarker = ' peers observed by local Kubo; first ';
  let observedCount: string | undefined;
  let admittedCount: string | undefined;
  if (message.endsWith(observedPrefix)) {
    observedCount = message.slice(0, -observedPrefix.length);
  } else {
    const markerIndex = message.indexOf(observedMarker);
    const admittedSuffix = ' admitted to the view.';
    if (markerIndex >= 1 && message.endsWith(admittedSuffix)) {
      observedCount = message.slice(0, markerIndex);
      admittedCount = message.slice(
        markerIndex + observedMarker.length,
        -admittedSuffix.length,
      );
    }
  }
  if (
    observedCount !== undefined &&
    /^\d[\d,]*$/u.test(observedCount) &&
    (admittedCount === undefined || /^\d[\d,]*$/u.test(admittedCount))
  ) {
    const admitted =
      admittedCount === undefined
        ? ''
        : translateTemplate(locale, 'kuboAdmitted', {
            count: localizedCount(admittedCount, locale),
          });
    return translateTemplate(locale, 'kuboObserved', {
      count: localizedCount(observedCount, locale),
      admitted,
    });
  }
  if (message.startsWith('Local Kubo blocked this origin')) {
    return translate(locale, 'kuboCorsError');
  }
  if (message === 'Local Kubo could not be read.') {
    return translate(locale, 'kuboReadError');
  }
  return message;
}

function localizeNetworkMessage(
  message: string,
  locale: ResolvedLocale,
): string {
  if (message === 'Opening a browser node…') {
    return translate(locale, 'openingNode');
  }
  if (message === 'Browser node could not start') {
    return translate(locale, 'nodeStartFailed');
  }
  if (message === 'Searching for browser-reachable peers') {
    return translate(locale, 'searchingPeers');
  }
  const match = /^Observing (\d+) live (?:browser )?connections?$/.exec(
    message,
  );
  if (match !== null) {
    return translateTemplate(locale, 'observingConnections', {
      count: localizedCount(match[1] ?? '0', locale),
    });
  }
  const fixtureConnections = /^Observing (\d+) fixture connections$/.exec(
    message,
  );
  if (fixtureConnections !== null) {
    return translateTemplate(locale, 'fixtureConnections', {
      count: localizedCount(fixtureConnections[1] ?? '0', locale),
    });
  }
  const fixturePeers = /^Tracking (\d+) imported fixture peers$/.exec(message);
  if (fixturePeers !== null) {
    return translateTemplate(locale, 'fixturePeers', {
      count: localizedCount(fixturePeers[1] ?? '0', locale),
    });
  }
  return message;
}

function localizedCount(raw: string, locale: ResolvedLocale): string {
  const value = Number(raw.replaceAll(',', ''));
  return Number.isFinite(value) ? formatInteger(value, locale) : raw;
}

function formatAriaShortcut(code: string): string {
  if (/^Key[A-Z]$/u.test(code)) return code.slice(3);
  if (/^Digit[0-9]$/u.test(code)) return code.slice(5);
  switch (code) {
    case 'Equal':
      return '+';
    case 'Minus':
      return '-';
    case 'ShiftLeft':
    case 'ShiftRight':
      return 'Shift';
    case 'ControlLeft':
    case 'ControlRight':
      return 'Control';
    case 'AltLeft':
    case 'AltRight':
      return 'Alt';
    case 'BracketLeft':
      return '[';
    case 'BracketRight':
      return ']';
    default:
      return code;
  }
}

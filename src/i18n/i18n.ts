import type { Locale } from '../settings/settings-types';
import { formatControlCode as formatCode } from './key-labels';
import { LANGUAGE_CATALOG } from './language-catalog';

export type ResolvedLocale = Exclude<Locale, 'auto'>;
export type TranslationKey =
  | 'skipLink'
  | 'siteHeader'
  | 'brandHome'
  | 'observatoryControls'
  | 'connecting'
  | 'readKubo'
  | 'retry'
  | 'openSettings'
  | 'closeSettings'
  | 'pauseMotion'
  | 'resumeMotion'
  | 'canvasLabel'
  | 'tooltipPeer'
  | 'connected'
  | 'discovered'
  | 'disconnected'
  | 'latency'
  | 'transport'
  | 'direction'
  | 'protocols'
  | 'agent'
  | 'protocolVersion'
  | 'addresses'
  | 'relay'
  | 'source'
  | 'browserHelia'
  | 'notObserved'
  | 'unmeasured'
  | 'tooltipHint'
  | 'sceneDescription'
  | 'interactiveObservatory'
  | 'fullPeerId'
  | 'lastObserved'
  | 'showDetails'
  | 'hideDetails'
  | 'dateUnavailable'
  | 'fallbackEyebrow'
  | 'fallbackTitle'
  | 'fallbackBody'
  | 'sceneLegend'
  | 'browserLiveLine'
  | 'discoveredOnly'
  | 'kuboObservedOuter'
  | 'disconnectedHistory'
  | 'decorativeDust'
  | 'distanceAxis'
  | 'angleAxis'
  | 'brightnessAxis'
  | 'browserNodeStatus'
  | 'browserNode'
  | 'identityPending'
  | 'kuboDefaultSource'
  | 'liveObservationMetrics'
  | 'connectedNow'
  | 'browserLive'
  | 'currentBrowserConnections'
  | 'trackedView'
  | 'allSources'
  | 'recentPeers'
  | 'medianLatency'
  | 'measured'
  | 'p95Latency'
  | 'tailOfSample'
  | 'observationScope'
  | 'observationScopeBody'
  | 'pageTitle'
  | 'liveObservatory'
  | 'heroTitle'
  | 'heroBody'
  | 'motion'
  | 'peerExplorer'
  | 'peerExplorerShort'
  | 'settings'
  | 'settingsEyebrow'
  | 'settingsTitle'
  | 'settingsSummaryAuto'
  | 'settingsSummaryManual'
  | 'quickPresets'
  | 'rendering'
  | 'atmosphereMotion'
  | 'dataLayers'
  | 'languageRegion'
  | 'settingsControls'
  | 'controlsForward'
  | 'controlsOrbit'
  | 'controlsHover'
  | 'controlsSelect'
  | 'controlsTouch'
  | 'controlsBindingHint'
  | 'language'
  | 'region'
  | 'regionAuto'
  | 'regionOff'
  | 'regionUnavailable'
  | 'preset'
  | 'presetAuto'
  | 'presetLowest'
  | 'presetLow'
  | 'presetMedium'
  | 'presetHigh'
  | 'presetHighest'
  | 'adaptiveProtection'
  | 'adaptiveAuto'
  | 'adaptiveManual'
  | 'pixelRatio'
  | 'nebulaDensity'
  | 'signalDust'
  | 'nodeDetail'
  | 'edgeBrightness'
  | 'antialiasingNextVisit'
  | 'spacePanorama'
  | 'space2k'
  | 'space8k'
  | 'cssSky'
  | 'exposure'
  | 'depthFog'
  | 'motionScale'
  | 'cameraSensitivity'
  | 'automaticOrbit'
  | 'arrivalPulses'
  | 'localKuboObservations'
  | 'discoveredPeers'
  | 'latencyDistanceRings'
  | 'pointerBehavior'
  | 'pointerHover'
  | 'pointerCamera'
  | 'moveForward'
  | 'moveBackward'
  | 'strafeLeft'
  | 'strafeRight'
  | 'turnLeft'
  | 'turnRight'
  | 'lookUp'
  | 'lookDown'
  | 'zoomIn'
  | 'zoomOut'
  | 'speedBoost'
  | 'languageAuto'
  | 'languageCoverage'
  | 'translatedLocally'
  | 'editorialTranslation'
  | 'machineTranslation'
  | 'bridgeTranslation'
  | 'englishFallback'
  | 'settingsReset'
  | 'applyClose'
  | 'observableNeighborhood'
  | 'peerExplorerTitle'
  | 'closePeerExplorer'
  | 'peerStateLegend'
  | 'findPeer'
  | 'peerIdPlaceholder'
  | 'state'
  | 'allStates'
  | 'shown'
  | 'observedPeers'
  | 'noPeers'
  | 'noPeerMatch'
  | 'onDeviceHistory'
  | 'checkingVisits'
  | 'clearHistory'
  | 'browserDiscovery'
  | 'kuboCorsHint'
  | 'peerAnnouncement'
  | 'peerSummary'
  | 'peerSummaryInitial'
  | 'livePings'
  | 'latencySampleSummary'
  | 'latencySampleEmpty'
  | 'peerResultsInitial'
  | 'regionChecking'
  | 'checkingLanguageCoverage'
  | 'live'
  | 'offline'
  | 'openingNode'
  | 'nodeStartFailed'
  | 'searchingPeers'
  | 'observingConnections'
  | 'historyRetained'
  | 'historyUnavailable'
  | 'regionSourceTimezone'
  | 'regionSourceLanguage'
  | 'coverage'
  | 'kuboRequesting'
  | 'kuboObserved'
  | 'kuboAdmitted'
  | 'kuboCorsError'
  | 'kuboReadError'
  | 'kuboReading'
  | 'fixtureConnections'
  | 'fixturePeers'
  | 'creditsSummary'
  | 'creditsCode'
  | 'skyboxCreditDisabled'
  | 'skyboxCreditEnabled'
  | 'creditsNasaLink'
  | 'translationCoverage';

const MESSAGES: Partial<
  Record<ResolvedLocale, Partial<Record<TranslationKey, string>>>
> = {
  en: {
    skipLink: 'Skip to the observatory',
    siteHeader: 'Site header',
    brandHome: 'Peerstellation home',
    observatoryControls: 'Observatory controls',
    connecting: 'Connecting',
    readKubo: 'Read local Kubo daemon',
    retry: 'Retry',
    openSettings: 'Open observatory settings',
    closeSettings: 'Close settings',
    pauseMotion: 'Pause motion',
    resumeMotion: 'Resume motion',
    canvasLabel: 'Live 3D IPFS peer universe',
    tooltipPeer: 'Peer',
    connected: 'Connected',
    discovered: 'Discovered',
    disconnected: 'Disconnected',
    latency: 'Latency',
    transport: 'Network transport',
    direction: 'Connection direction',
    protocols: 'Network protocols',
    agent: 'Agent',
    protocolVersion: 'Protocol version',
    addresses: 'Addresses',
    relay: 'Network relay',
    source: 'Source',
    browserHelia: 'Browser Helia',
    notObserved: 'Not observed',
    unmeasured: 'Not measured',
    tooltipHint: 'Tap / click or [ ] to select · Esc to dismiss',
    sceneDescription:
      'The center represents this browser’s Helia node. Bright green nodes are currently connected to the browser and have a line to the center. Violet nodes were discovered by browser routing but are not connected. Gold nodes are open connections reported by the separate local Kubo daemon; they are not browser connections and have no line to this center. Slate dead stars preserve disconnected history, and their evidence line is removed only after disconnect. Distance from the center maps measured latency; unmeasured peers occupy the outer orbit, and angle groups the observed transport. Decorative background stars do not represent peers. The faint outer orbit marks the imported Kubo field and is not a connection. A relay edge appears only when the relay ID is present in the observed peer set; arbitrary peer-to-peer topology is never inferred. Use the peer explorer for the same information in text form.',
    interactiveObservatory: 'interactive 3D peer observatory',
    fullPeerId: 'Full peer ID',
    lastObserved: 'Last observed',
    showDetails: 'Show details',
    hideDetails: 'Hide details',
    dateUnavailable: 'Date unavailable',
    fallbackEyebrow: 'Text observatory online',
    fallbackTitle: '3D view unavailable',
    fallbackBody:
      'This device could not create a secure WebGL context. Live Helia observations remain available through the peer explorer.',
    sceneLegend: '3D scene guide',
    browserLiveLine: 'Browser live · line to center',
    discoveredOnly: 'Discovered only',
    kuboObservedOuter: 'Local Kubo observed · outer field',
    disconnectedHistory: 'Disconnected history · dead star',
    decorativeDust: 'Decorative signal dust',
    distanceAxis: 'Distance = measured latency · outer orbit = unmeasured',
    angleAxis:
      'Angle sectors = WebSocket · WebRTC · WebTransport · Relay · Other',
    brightnessAxis: 'Connection line brightness = faster measured response',
    browserNodeStatus: 'Browser node status',
    browserNode: 'Browser node',
    identityPending: 'Identity pending',
    kuboDefaultSource: 'Browser Helia is the default source.',
    liveObservationMetrics: 'Live observation metrics',
    connectedNow: 'Connected now',
    browserLive: 'Browser live',
    currentBrowserConnections: 'Current browser Helia connections',
    trackedView: 'Tracked view',
    allSources: 'All sources',
    recentPeers: 'Recent peers · maximum 2,048',
    medianLatency: 'Median latency',
    measured: 'Measured',
    p95Latency: 'P95 latency',
    tailOfSample: 'Tail of the same live sample',
    observationScope: 'Observation scope',
    observationScopeBody:
      'This browser’s reachable neighborhood plus explicitly imported local Kubo observations; tracked at 2,048 and rendered at 1,024, never the entire IPFS network.',
    pageTitle: 'Peerstellation — Live Peer Observatory',
    liveObservatory: 'Live browser observatory',
    heroTitle: 'Live browser observatory · a living sky for reachable peers',
    heroBody:
      'This browser observes reachable peers, measures their responses, and renders only evidence from this session. Nothing here is simulated.',
    motion: 'Motion',
    peerExplorer: 'Open peer explorer',
    peerExplorerShort: 'Peers',
    settings: 'Settings',
    settingsEyebrow: 'Observatory controls',
    settingsTitle: 'Tune the sky',
    settingsSummaryAuto:
      'Auto quality protects the frame rate and recovers when the scene is cool.',
    settingsSummaryManual:
      'The selected preset is locked; manual quality will not auto-downgrade.',
    quickPresets: 'Quick presets',
    rendering: 'Rendering',
    atmosphereMotion: 'Atmosphere and motion',
    dataLayers: 'Data layers',
    languageRegion: 'Language and region',
    settingsControls: 'Controls',
    controlsForward: 'WASD or Arrow keys travel and rotate the camera.',
    controlsOrbit:
      'Hold left drag, or switch to right-click camera mode, to orbit.',
    controlsHover:
      'Hover a peer for details; tap or click to pin its evidence card.',
    controlsSelect: '[ / ] select peers, Enter pins, Esc dismisses.',
    controlsTouch:
      'On touch screens, swipe to orbit, pinch to travel, and tap to pin.',
    controlsBindingHint:
      'Focus a binding, then press any keyboard key to replace it. Bindings are stored on this device only.',
    language: 'Language',
    region: 'Region hint',
    regionAuto: 'Auto — language and time zone only',
    regionOff: 'Off — do not infer a region',
    regionUnavailable: 'Unavailable — no region inferred',
    preset: 'Preset',
    presetAuto: 'Auto — device-aware',
    presetLowest: 'Lowest — battery first',
    presetLow: 'Low — light scene',
    presetMedium: 'Medium — balanced',
    presetHigh: 'High — rich sky',
    presetHighest: 'Highest — force detail',
    adaptiveProtection: 'Adaptive protection',
    adaptiveAuto: 'Auto — recover and adapt',
    adaptiveManual: 'Manual — never change preset',
    pixelRatio: 'Pixel ratio',
    nebulaDensity: 'Nebula density',
    signalDust: 'Signal dust',
    nodeDetail: 'Node detail',
    edgeBrightness: 'Edge brightness',
    antialiasingNextVisit: 'Antialiasing (next visit)',
    spacePanorama: 'Space panorama',
    space2k: 'Space 2K — fast load',
    space8k: 'Space 8K — maximum detail',
    cssSky: 'CSS sky — no panorama',
    exposure: 'Exposure',
    depthFog: 'Depth fog',
    motionScale: 'Motion scale',
    cameraSensitivity: 'Camera sensitivity',
    automaticOrbit: 'Automatic orbit',
    arrivalPulses: 'Arrival pulses',
    localKuboObservations: 'Local Kubo observations',
    discoveredPeers: 'Discovered peers',
    latencyDistanceRings: 'Latency distance rings',
    pointerBehavior: 'Pointer behavior',
    pointerHover: 'Hover peers for details',
    pointerCamera: 'Camera mode until toggled',
    moveForward: 'Move forward',
    moveBackward: 'Move backward',
    strafeLeft: 'Strafe left',
    strafeRight: 'Strafe right',
    turnLeft: 'Turn left',
    turnRight: 'Turn right',
    lookUp: 'Look up',
    lookDown: 'Look down',
    zoomIn: 'Zoom in',
    zoomOut: 'Zoom out',
    speedBoost: 'Speed boost',
    languageAuto: 'Auto — browser preference',
    languageCoverage: 'Language coverage',
    translatedLocally: 'translated locally',
    editorialTranslation: 'edited product copy · native review required',
    machineTranslation: 'machine translated · native review required',
    bridgeTranslation: 'bridge-language draft · native review required',
    englishFallback: 'English fallback',
    settingsReset: 'Reset defaults',
    applyClose: 'Apply and close',
    observableNeighborhood: 'Observable neighborhood',
    peerExplorerTitle: 'Peer explorer',
    closePeerExplorer: 'Close peer explorer',
    peerStateLegend: 'Peer status guide',
    findPeer: 'Find peer',
    peerIdPlaceholder: 'Peer ID',
    state: 'Status',
    allStates: 'All statuses',
    shown: 'shown',
    observedPeers: 'Observed IPFS peers',
    noPeers:
      'No peers have been observed yet. Browser discovery can take a moment; local Kubo peers appear after an explicit RPC probe with CORS enabled.',
    noPeerMatch:
      'No observed peer matches the current search and state filter.',
    onDeviceHistory: 'On-device history',
    checkingVisits: 'Checking previous visits…',
    clearHistory: 'Clear local history',
    livePings: 'live pings',
    latencySampleSummary:
      '{{measured}} / {{total}} live pings · {{coverage}}% coverage',
    latencySampleEmpty: '{{measured}} / {{total}} live pings',
    peerResultsInitial: '0 shown',
    regionChecking: 'Region hint: checking language and time zone…',
    checkingLanguageCoverage: 'Loading language catalog…',
    live: 'Live',
    offline: 'Offline',
    openingNode: 'Opening a browser node…',
    nodeStartFailed: 'Browser node could not start',
    searchingPeers: 'Searching for browser-reachable peers',
    observingConnections: 'Observing {{count}} live browser connections',
    historyRetained:
      '{{count}} public peer IDs retained from previous observations.',
    historyUnavailable: 'Local history is unavailable in this browser context.',
    regionSourceTimezone: 'time zone',
    regionSourceLanguage: 'language',
    browserDiscovery: 'Browser discovery can take a moment',
    kuboCorsHint:
      'local Kubo peers appear after an explicit RPC probe with CORS enabled',
    peerAnnouncement:
      '{{connected}} browser peers connected. {{total}} peers tracked in the active view.',
    peerSummary:
      '{{browser}} browser live · {{kubo}} local Kubo observed · {{discovered}} discovered · {{disconnected}} disconnected in the bounded active view.',
    peerSummaryInitial: 'Waiting for the browser node to report peers.',
    coverage: 'coverage',
    kuboRequesting: 'Requesting /id and /swarm/peers from 127.0.0.1:5001…',
    kuboObserved:
      '{{count}} peers observed by local Kubo{{admitted}}. Browser Helia remains a separate node. Refreshing every 15s while enabled.',
    kuboAdmitted: '; first {{count}} admitted to the view',
    kuboCorsError:
      'Local Kubo blocked this origin. Add only this local origin to API.HTTPHeaders, then restart IPFS Desktop.',
    kuboReadError: 'Local Kubo could not be read.',
    kuboReading: 'Reading local Kubo daemon',
    fixtureConnections: 'Observing {{count}} fixture connections',
    fixturePeers: 'Tracking {{count}} imported fixture peers',
    creditsSummary: 'Credits and licenses',
    creditsCode:
      'Peerstellation code and original scene design © tadanobutubutu, MIT.',
    skyboxCreditDisabled:
      'Skybox disabled. The procedural CSS sky remains active and no panorama is downloaded.',
    skyboxCreditEnabled:
      'Night Sky HDRI 008 — Lennart Demes / ambientCG · CC0 1.0 Universal. Full source, conversion details, and SHA-256 are recorded in docs/assets.md.',
    creditsNasaLink: 'NASA/JPL-Caltech GLIMPSE360 source page',
    translationCoverage: '{{percent}}% translated',
  },
  ja: {
    pageTitle: 'Peerstellation — ライブ・ピア観測所',
    liveObservatory: 'ブラウザーのライブ観測所',
    heroTitle: 'ライブ観測所 · 到達可能なピアの空',
    heroBody:
      'このブラウザーが到達できるピアを観測し、応答を測定して、このセッションで得た証拠だけを表示します。シミュレーションはありません。',
    motion: 'モーション',
    peerExplorer: 'ピアエクスプローラーを開く',
    peerExplorerShort: 'ピア',
    settings: '設定',
    settingsEyebrow: '観測所コントロール',
    settingsTitle: '空を調整',
    settingsSummaryAuto:
      '自動画質はフレームレートを守り、負荷が下がると回復します。',
    settingsSummaryManual:
      '選択したプリセットを固定し、手動画質は自動で下がりません。',
    quickPresets: 'クイックプリセット',
    rendering: 'レンダリング',
    atmosphereMotion: '大気とモーション',
    dataLayers: 'データレイヤー',
    languageRegion: '言語と地域',
    settingsControls: '操作',
    controlsForward: 'WASDまたは矢印キーで移動・旋回します。',
    controlsOrbit:
      '左ドラッグ、または右クリックのカメラモードで軌道を回します。',
    controlsHover:
      'ピアに重ねると詳細を表示し、タップまたはクリックでカードを固定します。',
    controlsSelect: '[ / ]でピア選択、Enterで固定、Escで解除します。',
    controlsTouch:
      'タッチ画面ではスワイプで旋回、ピンチで移動、タップで固定します。',
    controlsBindingHint:
      '操作欄にフォーカスしてキーを押すと割り当てを変更できます。割り当てはこの端末だけに保存されます。',
    language: '言語',
    region: '地域ヒント',
    regionAuto: '自動 — 言語とタイムゾーンのみ',
    regionOff: 'オフ — 地域を推測しない',
    regionUnavailable: '利用不可 — 地域を推測できません',
    creditsSummary: 'クレジットとライセンス',
    creditsCode:
      'Peerstellationのコードとオリジナルシーンデザイン © tadanobutubutu、MIT。',
    skyboxCreditDisabled:
      'スカイボックスは無効です。プロシージャルCSSの空を表示し、パノラマはダウンロードしません。',
    skyboxCreditEnabled:
      'Night Sky HDRI 008 — Lennart Demes / ambientCG · CC0 1.0 Universal。完全なソース、変換手順、SHA-256はdocs/assets.mdに記録しています。',
    creditsNasaLink: 'NASA/JPL-Caltech GLIMPSE360ソースページ',
    translationCoverage: '{{percent}}% 翻訳済み',
  },
  'zh-CN': {
    pageTitle: 'Peerstellation — 实时节点观测站',
    liveObservatory: '浏览器实时观测站',
    heroTitle: '实时观测站 · 可达节点的星空',
    heroBody:
      '浏览器观测可达节点并测量响应，只渲染本次会话中的证据。这里没有模拟数据。',
    motion: '动态',
    peerExplorer: '打开节点浏览器',
    peerExplorerShort: '节点',
    settings: '设置',
    settingsEyebrow: '观测站控制',
    settingsTitle: '调整星空',
    settingsSummaryAuto: '自动画质保护帧率，并在场景变轻后恢复。',
    settingsSummaryManual: '已锁定所选预设；手动画质不会自动降低。',
    quickPresets: '快速预设',
    rendering: '渲染',
    atmosphereMotion: '氛围与动态',
    dataLayers: '数据图层',
    languageRegion: '语言和地区',
    settingsControls: '操作',
    controlsForward: '使用WASD或方向键移动并旋转镜头。',
    controlsOrbit: '按住左键拖动，或切换右键镜头模式来环绕。',
    controlsHover: '悬停查看详情，点击或轻触固定证据卡片。',
    controlsSelect: '[ / ]选择节点，Enter固定，Esc取消。',
    controlsTouch: '触屏上滑动环绕、捏合移动、轻触固定。',
    controlsBindingHint:
      '聚焦一个操作后按下任意键即可替换。绑定只保存在此设备上。',
    language: '语言',
    region: '地区提示',
    regionAuto: '自动 — 仅使用语言和时区',
    regionOff: '关闭 — 不推测地区',
    regionUnavailable: '不可用 — 未推测地区',
    creditsSummary: '致谢与许可证',
    creditsCode: 'Peerstellation 代码与原创场景设计 © tadanobutubutu，MIT。',
    skyboxCreditDisabled:
      '天空盒已禁用。仍显示程序化 CSS 星空，不会下载全景图。',
    skyboxCreditEnabled:
      'Night Sky HDRI 008 — Lennart Demes / ambientCG · CC0 1.0 Universal。完整来源、转换详情和 SHA-256 记录在 docs/assets.md。',
    creditsNasaLink: 'NASA/JPL-Caltech GLIMPSE360 来源页面',
    translationCoverage: '已翻译 {{percent}}%',
  },
  ko: {
    pageTitle: 'Peerstellation — 실시간 피어 관측소',
    liveObservatory: '브라우저 실시간 관측소',
    heroTitle: '실시간 관측소 · 연결 가능한 피어의 하늘',
    heroBody:
      '브라우저가 연결 가능한 피어를 관측하고 응답을 측정하며, 이 세션의 증거만 렌더링합니다. 시뮬레이션은 없습니다.',
    motion: '모션',
    peerExplorer: '피어 탐색기 열기',
    peerExplorerShort: '피어',
    settings: '설정',
    settingsEyebrow: '관측소 제어',
    settingsTitle: '하늘 조정',
    settingsSummaryAuto:
      '자동 화질은 프레임 속도를 보호하고 장면이 가벼워지면 회복합니다.',
    settingsSummaryManual:
      '선택한 프리셋이 고정되어 화질이 자동으로 낮아지지 않습니다.',
    quickPresets: '빠른 프리셋',
    rendering: '렌더링',
    atmosphereMotion: '분위기와 모션',
    dataLayers: '데이터 레이어',
    languageRegion: '언어 및 지역',
    settingsControls: '조작',
    controlsForward: 'WASD 또는 방향키로 이동하고 회전합니다.',
    controlsOrbit:
      '왼쪽 드래그를 유지하거나 오른쪽 클릭 카메라 모드로 공전합니다.',
    controlsHover:
      '피어에 마우스를 올려 상세를 보고 탭 또는 클릭으로 고정합니다.',
    controlsSelect: '[ / ]로 피어 선택, Enter로 고정, Esc로 해제합니다.',
    controlsTouch:
      '터치에서는 스와이프로 공전하고 핀치로 이동하며 탭으로 고정합니다.',
    controlsBindingHint:
      '바인딩에 초점을 맞춘 뒤 키를 누르면 교체됩니다. 바인딩은 이 기기에만 저장됩니다.',
    language: '언어',
    region: '지역 힌트',
    regionAuto: '자동 — 언어와 시간대만 사용',
    regionOff: '끔 — 지역을 추정하지 않음',
    regionUnavailable: '사용 불가 — 지역을 추정하지 않음',
    creditsSummary: '크레딧 및 라이선스',
    creditsCode:
      'Peerstellation 코드 및 오리지널 장면 디자인 © tadanobutubutu, MIT.',
    skyboxCreditDisabled:
      '스카이박스가 비활성화되었습니다. 절차적 CSS 하늘은 유지되며 파노라마는 다운로드되지 않습니다.',
    skyboxCreditEnabled:
      'Night Sky HDRI 008 — Lennart Demes / ambientCG · CC0 1.0 Universal. 전체 소스, 변환 세부 정보 및 SHA-256은 docs/assets.md에 기록되어 있습니다.',
    creditsNasaLink: 'NASA/JPL-Caltech GLIMPSE360 소스 페이지',
    translationCoverage: '{{percent}}% 번역됨',
  },
  es: {
    pageTitle: 'Peerstellation — Observatorio de pares en vivo',
    liveObservatory: 'Observatorio del navegador en vivo',
    heroTitle: 'Observatorio en vivo · un cielo de pares accesibles',
    heroBody:
      'Este navegador observa pares accesibles, mide sus respuestas y muestra solo evidencias de esta sesión. Nada es simulado.',
    motion: 'Movimiento',
    peerExplorer: 'Abrir explorador de pares',
    peerExplorerShort: 'Pares',
    settings: 'Ajustes',
    settingsEyebrow: 'Controles del observatorio',
    settingsTitle: 'Ajustar el cielo',
    settingsSummaryAuto:
      'La calidad automática protege la velocidad de fotogramas y se recupera cuando baja la carga.',
    settingsSummaryManual:
      'El preajuste elegido está bloqueado; la calidad manual no bajará automáticamente.',
    quickPresets: 'Preajustes rápidos',
    rendering: 'Renderizado',
    atmosphereMotion: 'Atmósfera y movimiento',
    dataLayers: 'Capas de datos',
    languageRegion: 'Idioma y región',
    settingsControls: 'Controles',
    controlsForward: 'WASD o las flechas mueven y giran la cámara.',
    controlsOrbit:
      'Mantén el arrastre izquierdo o activa la cámara con clic derecho para orbitar.',
    controlsHover:
      'Pasa sobre un par para ver detalles; toca o haz clic para fijar su tarjeta.',
    controlsSelect: '[ / ] selecciona pares, Enter fija y Esc descarta.',
    controlsTouch:
      'En pantallas táctiles, desliza para orbitar, pellizca para moverte y toca para fijar.',
    controlsBindingHint:
      'Enfoca una asignación y pulsa cualquier tecla para reemplazarla. Se guarda solo en este dispositivo.',
    language: 'Idioma',
    region: 'Indicio de región',
    regionAuto: 'Automático — solo idioma y zona horaria',
    regionOff: 'Desactivado — no inferir región',
    regionUnavailable: 'No disponible — no se infirió región',
    creditsSummary: 'Créditos y licencias',
    creditsCode:
      'Código de Peerstellation y diseño original de la escena © tadanobutubutu, MIT.',
    skyboxCreditDisabled:
      'Cielo desactivado. El cielo CSS procedural permanece activo y no se descarga ningún panorama.',
    skyboxCreditEnabled:
      'Night Sky HDRI 008 — Lennart Demes / ambientCG · CC0 1.0 Universal. La fuente completa, la conversión y el SHA-256 están registrados en docs/assets.md.',
    creditsNasaLink: 'Página fuente GLIMPSE360 de NASA/JPL-Caltech',
    translationCoverage: '{{percent}}% traducido',
  },
  fr: {
    pageTitle: 'Peerstellation — Observatoire de pairs en direct',
    liveObservatory: 'Observatoire du navigateur en direct',
    heroTitle: 'Observatoire en direct · le ciel des pairs accessibles',
    heroBody:
      'Ce navigateur observe les pairs accessibles, mesure leurs réponses et affiche uniquement les preuves de cette session. Rien n’est simulé.',
    motion: 'Mouvement',
    peerExplorer: 'Ouvrir l’explorateur de pairs',
    peerExplorerShort: 'Pairs',
    settings: 'Réglages',
    settingsEyebrow: 'Commandes de l’observatoire',
    settingsTitle: 'Régler le ciel',
    settingsSummaryAuto:
      'La qualité automatique protège la fréquence d’images et récupère quand la scène se calme.',
    settingsSummaryManual:
      'Le préréglage choisi est verrouillé et la qualité manuelle ne baisse pas automatiquement.',
    quickPresets: 'Préréglages rapides',
    rendering: 'Rendu',
    atmosphereMotion: 'Atmosphère et mouvement',
    dataLayers: 'Couches de données',
    languageRegion: 'Langue et région',
    settingsControls: 'Commandes',
    controlsForward: 'WASD ou les flèches déplacent et orientent la caméra.',
    controlsOrbit:
      'Maintenez le glissement gauche ou activez la caméra au clic droit pour orbiter.',
    controlsHover:
      'Survolez un pair pour les détails, touchez ou cliquez pour fixer sa carte.',
    controlsSelect: '[ / ] sélectionnent les pairs, Entrée fixe, Échap ferme.',
    controlsTouch:
      'Sur écran tactile, glissez pour orbiter, pincez pour avancer et touchez pour fixer.',
    controlsBindingHint:
      'Placez le focus sur une commande puis appuyez sur une touche pour la remplacer. Elle reste sur cet appareil.',
    language: 'Langue',
    region: 'Indice de région',
    regionAuto: 'Auto — langue et fuseau horaire uniquement',
    regionOff: 'Désactivé — ne pas déduire de région',
    regionUnavailable: 'Indisponible — aucune région déduite',
    creditsSummary: 'Crédits et licences',
    creditsCode:
      'Code de Peerstellation et conception originale de la scène © tadanobutubutu, MIT.',
    skyboxCreditDisabled:
      'Ciel désactivé. Le ciel CSS procédural reste actif et aucun panorama n’est téléchargé.',
    skyboxCreditEnabled:
      'Night Sky HDRI 008 — Lennart Demes / ambientCG · CC0 1.0 Universal. La source complète, la conversion et le SHA-256 sont consignés dans docs/assets.md.',
    creditsNasaLink: 'Page source GLIMPSE360 de la NASA/JPL-Caltech',
    translationCoverage: '{{percent}} % traduit',
  },
  de: {
    pageTitle: 'Peerstellation — Live-Peer-Observatorium',
    liveObservatory: 'Live-Browser-Observatorium',
    heroTitle: 'Live-Observatorium · ein Himmel erreichbarer Peers',
    heroBody:
      'Dieser Browser beobachtet erreichbare Peers, misst ihre Antworten und zeigt nur Belege dieser Sitzung. Nichts ist simuliert.',
    motion: 'Bewegung',
    peerExplorer: 'Peer-Explorer öffnen',
    peerExplorerShort: 'Peers',
    settings: 'Einstellungen',
    settingsEyebrow: 'Observatorium-Steuerung',
    settingsTitle: 'Himmel abstimmen',
    settingsSummaryAuto:
      'Die automatische Qualität schützt die Bildrate und erholt sich bei geringerer Szenenlast.',
    settingsSummaryManual:
      'Die gewählte Vorgabe ist gesperrt; die manuelle Qualität wird nicht automatisch reduziert.',
    quickPresets: 'Schnellvorgaben',
    rendering: 'Rendering',
    atmosphereMotion: 'Atmosphäre und Bewegung',
    dataLayers: 'Datenebenen',
    languageRegion: 'Sprache und Region',
    settingsControls: 'Steuerung',
    controlsForward: 'WASD oder Pfeiltasten bewegen und drehen die Kamera.',
    controlsOrbit:
      'Linke Maustaste halten oder den Kameramodus per Rechtsklick aktivieren, um zu umkreisen.',
    controlsHover:
      'Für Details über einen Peer fahren; per Klick oder Tippen die Karte anheften.',
    controlsSelect: '[ / ] wählen Peers, Enter heftet an, Esc löst.',
    controlsTouch:
      'Auf Touchscreens wischen zum Umkreisen, pinch zum Bewegen und tippen zum Anheften.',
    controlsBindingHint:
      'Fokus auf eine Belegung setzen und eine Taste drücken, um sie zu ersetzen. Sie bleibt auf diesem Gerät.',
    language: 'Sprache',
    region: 'Regionshinweis',
    regionAuto: 'Auto — nur Sprache und Zeitzone',
    regionOff: 'Aus — keine Region ableiten',
    regionUnavailable: 'Nicht verfügbar — keine Region abgeleitet',
    creditsSummary: 'Credits und Lizenzen',
    creditsCode:
      'Peerstellation-Code und originales Szenendesign © tadanobutubutu, MIT.',
    skyboxCreditDisabled:
      'Skybox deaktiviert. Der prozedurale CSS-Himmel bleibt aktiv, und kein Panorama wird heruntergeladen.',
    skyboxCreditEnabled:
      'Night Sky HDRI 008 — Lennart Demes / ambientCG · CC0 1.0 Universal. Vollständige Quelle, Konvertierungsdetails und SHA-256 sind in docs/assets.md dokumentiert.',
    creditsNasaLink: 'NASA/JPL-Caltech-Quellseite von GLIMPSE360',
    translationCoverage: '{{percent}} % übersetzt',
  },
};

/**
 * Labels that are shared by the settings form and the peer explorer. Keeping
 * them in a separate table makes the HTML fallback readable while allowing
 * every supported interface locale to replace the complete form, not just its
 * section headings. Legal identifiers such as license names remain canonical.
 */
const EXTENDED_MESSAGES: Partial<
  Record<ResolvedLocale, Partial<Record<TranslationKey, string>>>
> = {
  ja: {
    skipLink: '観測所へ移動',
    siteHeader: 'サイトヘッダー',
    brandHome: 'Peerstellation ホーム',
    observatoryControls: '観測所コントロール',
    connecting: '接続中',
    readKubo: 'ローカルKuboデーモンを読み取る',
    retry: '再試行',
    openSettings: '観測所設定を開く',
    closeSettings: '設定を閉じる',
    pauseMotion: 'モーションを一時停止',
    resumeMotion: 'モーションを再開',
    canvasLabel: 'ライブ3D IPFSピア空間',
    tooltipPeer: 'ピア',
    connected: '接続中',
    discovered: '発見済み',
    disconnected: '切断済み',
    latency: 'レイテンシ',
    transport: 'ネットワークトランスポート',
    direction: '接続方向',
    protocols: 'ネットワークプロトコル',
    agent: 'エージェント',
    protocolVersion: 'プロトコルバージョン',
    addresses: 'アドレス',
    relay: 'ネットワーク中継',
    source: 'ソース',
    browserHelia: 'ブラウザーHelia',
    notObserved: '未観測',
    unmeasured: '未測定',
    tooltipHint: 'タップ／クリックまたは [ ] で選択 · Escで解除',
    sceneDescription:
      '中心はこのブラウザーのHeliaノードです。明るい緑のノードはブラウザーに現在接続され、中心へ線が伸びます。紫のノードはブラウザーの経路探索で発見されましたが未接続です。金色のノードは別のローカルKuboデーモンが報告した開放接続で、ブラウザー接続ではないため中心への線はありません。灰色の消灯した星は切断履歴を保持し、接続が切れた後に証拠線だけが消えます。中心からの距離は測定レイテンシを表し、未測定のピアは外周軌道に配置されます。角度は観測されたトランスポートで分かれます。背景の装飾星はピアではありません。薄い外周軌道は読み込んだKuboフィールドであり接続線ではありません。リレー線は両端のリレーIDが観測ピアに存在する場合だけ描画され、任意のピア間トポロジーは推測しません。詳細はピアエクスプローラーで確認できます。',
    interactiveObservatory: 'インタラクティブ3Dピア観測所',
    fullPeerId: '完全なピアID',
    lastObserved: '最終観測',
    showDetails: '詳細を表示',
    hideDetails: '詳細を隠す',
    dateUnavailable: '日時不明',
    fallbackEyebrow: 'テキスト観測所はオンライン',
    fallbackTitle: '3D表示を利用できません',
    fallbackBody:
      'この端末では安全なWebGLコンテキストを作成できませんでした。ライブHelia観測はピアエクスプローラーで利用できます。',
    sceneLegend: '3Dシーンガイド',
    browserLiveLine: 'ブラウザーライブ · 中心へ接続',
    discoveredOnly: '発見済みのみ',
    kuboObservedOuter: 'ローカルKubo観測 · 外周フィールド',
    disconnectedHistory: '切断履歴 · 消灯した星',
    decorativeDust: '装飾シグナルダスト',
    distanceAxis: '距離 = 測定レイテンシ · 外周軌道 = 未測定',
    angleAxis:
      '角度セクター = WebSocket · WebRTC · WebTransport · リレー · その他',
    brightnessAxis: '接続線の明るさ = 応答が速いほど明るい',
    browserNodeStatus: 'ブラウザーノードの状態',
    browserNode: 'ブラウザーノード',
    identityPending: '識別情報を待機中',
    kuboDefaultSource: '既定のソースはブラウザーHeliaです。',
    liveObservationMetrics: 'ライブ観測メトリクス',
    connectedNow: '現在の接続',
    browserLive: 'ブラウザーライブ',
    currentBrowserConnections: '現在のブラウザーHelia接続',
    trackedView: '追跡ビュー',
    allSources: '全ソース',
    recentPeers: '最近のピア · 最大2,048',
    medianLatency: '中央値レイテンシ',
    measured: '測定済み',
    p95Latency: 'P95レイテンシ',
    tailOfSample: '同じライブサンプルの末尾',
    observationScope: '観測範囲',
    observationScopeBody:
      'このブラウザーが到達できる近傍と、明示的に読み込んだローカルKuboの観測。追跡は2,048、描画は1,024までで、IPFS全体ではありません。',
    preset: 'プリセット',
    presetAuto: '自動 — 端末に合わせる',
    presetLowest: '最低 — バッテリー優先',
    presetLow: '低 — 軽量シーン',
    presetMedium: '中 — バランス',
    presetHigh: '高 — 豊かな空',
    presetHighest: '最高 — 詳細を優先',
    adaptiveProtection: '自動調整',
    adaptiveAuto: '自動 — 回復・適応',
    adaptiveManual: '手動 — プリセットを変更しない',
    pixelRatio: 'ピクセル比',
    nebulaDensity: '星雲密度',
    signalDust: 'シグナルダスト',
    nodeDetail: 'ノード詳細度',
    edgeBrightness: '線の明るさ',
    antialiasingNextVisit: 'アンチエイリアス（次回起動時）',
    spacePanorama: '宇宙パノラマ',
    space2k: '宇宙2K — 高速読み込み',
    space8k: '宇宙8K — 最大詳細',
    cssSky: 'CSSの空 — パノラマなし',
    exposure: '露出',
    depthFog: '深度フォグ',
    motionScale: 'モーション倍率',
    cameraSensitivity: 'カメラ感度',
    automaticOrbit: '自動軌道',
    arrivalPulses: '到着パルス',
    localKuboObservations: 'ローカルKubo観測',
    discoveredPeers: '発見済みピア',
    latencyDistanceRings: 'レイテンシ距離リング',
    pointerBehavior: 'ポインター動作',
    pointerHover: 'ホバーでピア詳細を表示',
    pointerCamera: '切り替えまでカメラモード',
    moveForward: '前進',
    moveBackward: '後退',
    strafeLeft: '左へ平行移動',
    strafeRight: '右へ平行移動',
    turnLeft: '左旋回',
    turnRight: '右旋回',
    lookUp: '上を見る',
    lookDown: '下を見る',
    zoomIn: 'ズームイン',
    zoomOut: 'ズームアウト',
    speedBoost: '速度ブースト',
    languageAuto: '自動 — ブラウザー設定',
    languageCoverage: '言語対応状況',
    translatedLocally: 'ローカル翻訳',
    editorialTranslation: '編集済みの製品文言 · 母語レビューが必要',
    machineTranslation: '機械翻訳 · 母語レビューが必要',
    bridgeTranslation: '橋渡し言語の草稿 · 母語レビューが必要',
    englishFallback: '英語フォールバック',
    settingsReset: '既定値に戻す',
    applyClose: '適用して閉じる',
    observableNeighborhood: '観測可能な近傍',
    peerExplorerTitle: 'ピアエクスプローラー',
    closePeerExplorer: 'ピアエクスプローラーを閉じる',
    peerStateLegend: 'ピア状態ガイド',
    findPeer: 'ピアを検索',
    peerIdPlaceholder: 'ピアID',
    state: '状態',
    allStates: 'すべての状態',
    shown: '件を表示',
    observedPeers: '観測したIPFSピア',
    noPeers:
      'まだピアを観測していません。ブラウザーの発見には時間がかかる場合があります。ローカルKuboのピアはCORSを有効にした明示的なRPC照会後に表示されます。',
    noPeerMatch: '現在の検索条件と状態フィルターに一致するピアはありません。',
    onDeviceHistory: '端末内の履歴',
    checkingVisits: '過去の訪問を確認中…',
    clearHistory: 'ローカル履歴を消去',
    peerAnnouncement:
      'ブラウザーに{{connected}}件のピアが接続中です。アクティブビューで{{total}}件を追跡しています。',
    peerSummary:
      'ブラウザーライブ {{browser}}件 · ローカルKubo観測 {{kubo}}件 · 発見済み {{discovered}}件 · 切断済み {{disconnected}}件（アクティブビュー内）。',
    peerSummaryInitial: 'ブラウザーノードからのピア報告を待っています。',
    livePings: 'ライブPing',
    latencySampleSummary:
      '{{measured}} / {{total}} ライブPing · カバレッジ {{coverage}}%',
    latencySampleEmpty: '{{measured}} / {{total}} ライブPing',
    peerResultsInitial: '0件を表示',
    regionChecking: '地域ヒント: 言語とタイムゾーンを確認中…',
    checkingLanguageCoverage: '言語カタログを読み込み中…',
    live: 'ライブ',
    offline: 'オフライン',
    openingNode: 'ブラウザーノードを起動中…',
    nodeStartFailed: 'ブラウザーノードを起動できませんでした',
    searchingPeers: 'ブラウザーから到達できるピアを検索中',
    observingConnections: '{{count}}件のブラウザー接続を観測中',
    historyRetained: '過去の観測から公開ピアIDを{{count}}件保持しています。',
    historyUnavailable:
      'このブラウザーコンテキストではローカル履歴を利用できません。',
    regionSourceTimezone: 'タイムゾーン',
    regionSourceLanguage: '言語',
    coverage: 'カバレッジ',
    kuboRequesting: '127.0.0.1:5001 に /id と /swarm/peers をリクエスト中…',
    kuboObserved:
      'ローカルKuboが{{count}}件のピアを観測{{admitted}}。ブラウザーHeliaは別ノードです。15秒ごとに更新します（有効時）。',
    kuboAdmitted: '。うち{{count}}件をビューに追加',
    kuboCorsError:
      'ローカルKuboがこのオリジンを拒否しました。このローカルオリジンだけをAPI.HTTPHeadersに追加して、IPFS Desktopを再起動してください。',
    kuboReadError: 'ローカルKuboを読み取れませんでした。',
    kuboReading: 'ローカルKuboデーモンを読み取り中',
    fixtureConnections: '{{count}}件のフィクスチャ接続を観測中',
    fixturePeers: '読み込んだフィクスチャピア{{count}}件を追跡中',
  },
  'zh-CN': {
    skipLink: '跳转到观测站',
    siteHeader: '网站页眉',
    brandHome: 'Peerstellation 首页',
    observatoryControls: '观测站控制',
    connecting: '连接中',
    readKubo: '读取本地 Kubo 守护进程',
    retry: '重试',
    openSettings: '打开观测站设置',
    closeSettings: '关闭设置',
    pauseMotion: '暂停动态',
    resumeMotion: '恢复动态',
    canvasLabel: '实时 3D IPFS 节点空间',
    tooltipPeer: '节点',
    connected: '已连接',
    discovered: '已发现',
    disconnected: '已断开',
    latency: '延迟',
    transport: '网络传输',
    direction: '连接方向',
    protocols: '网络协议',
    agent: '代理',
    protocolVersion: '协议版本',
    addresses: '地址',
    relay: '网络中继',
    source: '来源',
    browserHelia: '浏览器 Helia',
    notObserved: '未观测',
    unmeasured: '未测量',
    tooltipHint: '轻触／点击或按 [ ] 选择 · Esc 取消',
    fullPeerId: '完整节点 ID',
    lastObserved: '最后观测',
    showDetails: '显示详情',
    hideDetails: '隐藏详情',
    dateUnavailable: '日期不可用',
    interactiveObservatory: '交互式 3D 节点观测站',
    sceneDescription:
      '中心代表此浏览器的 Helia 节点。绿色节点是当前连接的浏览器节点，紫色节点是已发现但未连接的节点，金色节点来自本地 Kubo，灰色星体保留断开历史。距离表示测量延迟，未测量节点位于外环。请使用节点浏览器查看文字详情。',
    peerAnnouncement:
      '浏览器已连接 {{connected}} 个节点。当前视图追踪 {{total}} 个节点。',
    peerSummary:
      '浏览器实时 {{browser}} · 本地 Kubo {{kubo}} · 已发现 {{discovered}} · 已断开 {{disconnected}}（活动视图）。',
    peerSummaryInitial: '正在等待浏览器节点报告节点。',
    fallbackEyebrow: '文本观测站在线',
    fallbackTitle: '3D 视图不可用',
    fallbackBody:
      '此设备无法创建安全的 WebGL 上下文。实时 Helia 观测仍可通过节点浏览器查看。',
    sceneLegend: '3D 场景指南',
    browserLiveLine: '浏览器实时 · 连接到中心',
    discoveredOnly: '仅已发现',
    kuboObservedOuter: '观测到本地 Kubo · 外部区域',
    disconnectedHistory: '断开历史 · 熄灭星体',
    decorativeDust: '装饰性信号尘埃',
    distanceAxis: '距离 = 已测延迟 · 外环 = 未测量',
    angleAxis: '角度分区 = WebSocket · WebRTC · WebTransport · 中继 · 其他',
    brightnessAxis: '连接线亮度 = 响应越快越亮',
    browserNodeStatus: '浏览器节点状态',
    browserNode: '浏览器节点',
    identityPending: '等待身份信息',
    kuboDefaultSource: '默认来源为浏览器 Helia。',
    liveObservationMetrics: '实时观测指标',
    connectedNow: '当前连接',
    browserLive: '浏览器实时',
    currentBrowserConnections: '当前浏览器 Helia 连接',
    trackedView: '追踪视图',
    allSources: '所有来源',
    recentPeers: '最近节点 · 最多 2,048',
    medianLatency: '延迟中位数',
    measured: '已测量',
    p95Latency: 'P95 延迟',
    tailOfSample: '同一实时样本的尾部',
    observationScope: '观测范围',
    observationScopeBody:
      '此浏览器可到达的邻域，以及明确导入的本地 Kubo 观测；追踪上限为 2,048，渲染上限为 1,024，并非整个 IPFS 网络。',
    preset: '预设',
    presetAuto: '自动 — 适配设备',
    presetLowest: '最低 — 优先省电',
    presetLow: '低 — 轻量场景',
    presetMedium: '中 — 平衡',
    presetHigh: '高 — 丰富天空',
    presetHighest: '最高 — 强制细节',
    adaptiveProtection: '自适应保护',
    adaptiveAuto: '自动 — 恢复并适配',
    adaptiveManual: '手动 — 不改变预设',
    pixelRatio: '像素比',
    nebulaDensity: '星云密度',
    signalDust: '信号尘埃',
    nodeDetail: '节点细节',
    edgeBrightness: '连线亮度',
    antialiasingNextVisit: '抗锯齿（下次访问生效）',
    spacePanorama: '太空全景',
    space2k: '太空 2K — 快速加载',
    space8k: '太空 8K — 最大细节',
    cssSky: 'CSS 星空 — 无全景',
    exposure: '曝光',
    depthFog: '深度雾',
    motionScale: '动态比例',
    cameraSensitivity: '相机灵敏度',
    automaticOrbit: '自动环绕',
    arrivalPulses: '到达脉冲',
    localKuboObservations: '本地 Kubo 观测',
    discoveredPeers: '已发现节点',
    latencyDistanceRings: '延迟距离环',
    pointerBehavior: '指针行为',
    pointerHover: '悬停节点查看详情',
    pointerCamera: '切换前保持相机模式',
    moveForward: '前进',
    moveBackward: '后退',
    strafeLeft: '向左平移',
    strafeRight: '向右平移',
    turnLeft: '左转',
    turnRight: '右转',
    lookUp: '上看',
    lookDown: '下看',
    zoomIn: '放大',
    zoomOut: '缩小',
    speedBoost: '加速',
    languageAuto: '自动 — 浏览器偏好',
    languageCoverage: '语言覆盖',
    translatedLocally: '本地翻译',
    editorialTranslation: '已编辑的产品文案 · 需要母语审校',
    machineTranslation: '机器翻译 · 需要母语审校',
    bridgeTranslation: '桥接语言草稿 · 需要母语审校',
    englishFallback: '英文回退',
    settingsReset: '恢复默认值',
    applyClose: '应用并关闭',
    observableNeighborhood: '可观测邻域',
    peerExplorerTitle: '节点浏览器',
    closePeerExplorer: '关闭节点浏览器',
    peerStateLegend: '节点状态指南',
    findPeer: '查找节点',
    peerIdPlaceholder: '节点 ID',
    state: '状态',
    allStates: '所有状态',
    shown: '个显示',
    observedPeers: '已观测的 IPFS 节点',
    noPeers:
      '尚未观测到节点。浏览器发现可能需要一点时间；启用 CORS 并明确执行 RPC 探测后才会显示本地 Kubo 节点。',
    noPeerMatch: '没有节点符合当前搜索和状态筛选条件。',
    onDeviceHistory: '设备历史',
    checkingVisits: '正在检查之前的访问…',
    clearHistory: '清除本地历史',
    livePings: '实时 Ping',
    latencySampleSummary:
      '{{measured}} / {{total}} 个实时 Ping · 覆盖率 {{coverage}}%',
    latencySampleEmpty: '{{measured}} / {{total}} 个实时 Ping',
    peerResultsInitial: '显示 0 个',
    regionChecking: '地区提示：正在检查语言和时区…',
    checkingLanguageCoverage: '正在加载语言目录…',
    live: '实时',
    offline: '离线',
    openingNode: '正在启动浏览器节点…',
    nodeStartFailed: '无法启动浏览器节点',
    searchingPeers: '正在搜索浏览器可达节点',
    observingConnections: '正在观测 {{count}} 个实时浏览器连接',
    historyRetained: '已保留过去观测中的 {{count}} 个公开节点 ID。',
    historyUnavailable: '此浏览器上下文无法使用本地历史记录。',
    regionSourceTimezone: '时区',
    regionSourceLanguage: '语言',
    coverage: '覆盖率',
    kuboRequesting: '正在从 127.0.0.1:5001 请求 /id 和 /swarm/peers…',
    kuboObserved:
      '本地 Kubo 观测到 {{count}} 个节点{{admitted}}。浏览器 Helia 是独立节点。启用后每 15 秒刷新。',
    kuboAdmitted: '，其中 {{count}} 个已加入视图',
    kuboCorsError:
      '本地 Kubo 阻止了此来源。仅将此本地来源添加到 API.HTTPHeaders，然后重启 IPFS Desktop。',
    kuboReadError: '无法读取本地 Kubo。',
    kuboReading: '正在读取本地 Kubo 守护进程',
    fixtureConnections: '正在观测 {{count}} 个测试连接',
    fixturePeers: '正在追踪 {{count}} 个导入的测试节点',
  },
  ko: {
    skipLink: '관측소로 건너뛰기',
    siteHeader: '사이트 헤더',
    brandHome: 'Peerstellation 홈',
    observatoryControls: '관측소 제어',
    connecting: '연결 중',
    readKubo: '로컬 Kubo 데몬 읽기',
    retry: '다시 시도',
    openSettings: '관측소 설정 열기',
    closeSettings: '설정 닫기',
    pauseMotion: '모션 일시정지',
    resumeMotion: '모션 재개',
    canvasLabel: '실시간 3D IPFS 피어 공간',
    tooltipPeer: '피어',
    connected: '연결됨',
    discovered: '발견됨',
    disconnected: '연결 끊김',
    latency: '지연 시간',
    transport: '네트워크 전송',
    direction: '연결 방향',
    protocols: '네트워크 프로토콜',
    agent: '에이전트',
    protocolVersion: '프로토콜 버전',
    addresses: '주소',
    relay: '네트워크 릴레이',
    source: '소스',
    browserHelia: '브라우저 Helia',
    notObserved: '관측되지 않음',
    unmeasured: '측정되지 않음',
    tooltipHint: '탭／클릭 또는 [ ]로 선택 · Esc로 해제',
    fullPeerId: '전체 피어 ID',
    lastObserved: '마지막 관측',
    showDetails: '세부 정보 표시',
    hideDetails: '세부 정보 숨기기',
    dateUnavailable: '날짜를 알 수 없음',
    interactiveObservatory: '인터랙티브 3D 피어 관측소',
    sceneDescription:
      '중앙은 이 브라우저의 Helia 노드를 나타냅니다. 녹색은 현재 연결된 브라우저 피어, 보라색은 발견되었지만 연결되지 않은 피어, 금색은 로컬 Kubo에서 가져온 피어, 회색 별은 연결 해제 기록입니다. 거리는 측정 지연을 나타내며 미측정 피어는 외곽 궤도에 배치됩니다. 글로 된 세부 정보는 피어 탐색기에서 확인하세요.',
    peerAnnouncement:
      '브라우저에 피어 {{connected}}개가 연결되었습니다. 현재 보기에서 {{total}}개를 추적합니다.',
    peerSummary:
      '브라우저 실시간 {{browser}} · 로컬 Kubo {{kubo}} · 발견됨 {{discovered}} · 연결 해제 {{disconnected}} (활성 보기).',
    peerSummaryInitial: '브라우저 노드의 피어 보고를 기다리는 중입니다.',
    fallbackEyebrow: '텍스트 관측소 온라인',
    fallbackTitle: '3D 보기를 사용할 수 없음',
    fallbackBody:
      '이 기기에서는 안전한 WebGL 컨텍스트를 만들 수 없습니다. 실시간 Helia 관측은 피어 탐색기에서 계속 사용할 수 있습니다.',
    sceneLegend: '3D 장면 안내',
    browserLiveLine: '브라우저 실시간 · 중앙에 연결',
    discoveredOnly: '발견만',
    kuboObservedOuter: '로컬 Kubo 관측 · 외곽 영역',
    disconnectedHistory: '연결 끊김 기록 · 죽은 별',
    decorativeDust: '장식 신호 먼지',
    distanceAxis: '거리 = 측정된 지연 · 외곽 궤도 = 미측정',
    angleAxis: '각도 영역 = WebSocket · WebRTC · WebTransport · 릴레이 · 기타',
    brightnessAxis: '연결선 밝기 = 응답이 빠를수록 밝음',
    browserNodeStatus: '브라우저 노드 상태',
    browserNode: '브라우저 노드',
    identityPending: 'ID 대기 중',
    kuboDefaultSource: '기본 소스는 브라우저 Helia입니다.',
    liveObservationMetrics: '실시간 관측 지표',
    connectedNow: '현재 연결',
    browserLive: '브라우저 실시간',
    currentBrowserConnections: '현재 브라우저 Helia 연결',
    trackedView: '추적 보기',
    allSources: '모든 소스',
    recentPeers: '최근 피어 · 최대 2,048',
    medianLatency: '중앙 지연 시간',
    measured: '측정됨',
    p95Latency: 'P95 지연 시간',
    tailOfSample: '동일한 실시간 샘플의 꼬리',
    observationScope: '관측 범위',
    observationScopeBody:
      '이 브라우저가 도달할 수 있는 주변과 명시적으로 가져온 로컬 Kubo 관측입니다. 추적은 2,048, 렌더링은 1,024로 제한되며 전체 IPFS 네트워크가 아닙니다.',
    preset: '프리셋',
    presetAuto: '자동 — 기기에 맞춤',
    presetLowest: '최저 — 배터리 우선',
    presetLow: '낮음 — 가벼운 장면',
    presetMedium: '중간 — 균형',
    presetHigh: '높음 — 풍부한 하늘',
    presetHighest: '최고 — 세부 묘사 우선',
    adaptiveProtection: '적응형 보호',
    adaptiveAuto: '자동 — 복구 및 적응',
    adaptiveManual: '수동 — 프리셋 변경 안 함',
    pixelRatio: '픽셀 비율',
    nebulaDensity: '성운 밀도',
    signalDust: '신호 먼지',
    nodeDetail: '노드 세부 수준',
    edgeBrightness: '선 밝기',
    antialiasingNextVisit: '안티앨리어싱 (다음 방문)',
    spacePanorama: '우주 파노라마',
    space2k: '우주 2K — 빠른 로드',
    space8k: '우주 8K — 최대 세부',
    cssSky: 'CSS 하늘 — 파노라마 없음',
    exposure: '노출',
    depthFog: '깊이 안개',
    motionScale: '모션 배율',
    cameraSensitivity: '카메라 감도',
    automaticOrbit: '자동 공전',
    arrivalPulses: '도착 펄스',
    localKuboObservations: '로컬 Kubo 관측',
    discoveredPeers: '발견된 피어',
    latencyDistanceRings: '지연 거리 링',
    pointerBehavior: '포인터 동작',
    pointerHover: '피어에 마우스를 올려 상세 보기',
    pointerCamera: '전환할 때까지 카메라 모드',
    moveForward: '앞으로 이동',
    moveBackward: '뒤로 이동',
    strafeLeft: '왼쪽 평행 이동',
    strafeRight: '오른쪽 평행 이동',
    turnLeft: '왼쪽 회전',
    turnRight: '오른쪽 회전',
    lookUp: '위 보기',
    lookDown: '아래 보기',
    zoomIn: '확대',
    zoomOut: '축소',
    speedBoost: '속도 부스트',
    languageAuto: '자동 — 브라우저 기본 설정',
    languageCoverage: '언어 지원',
    translatedLocally: '로컬 번역',
    editorialTranslation: '편집된 제품 문구 · 원어민 검토 필요',
    machineTranslation: '기계 번역 · 원어민 검토 필요',
    bridgeTranslation: '중개 언어 초안 · 원어민 검토 필요',
    englishFallback: '영어 대체',
    settingsReset: '기본값 복원',
    applyClose: '적용하고 닫기',
    observableNeighborhood: '관측 가능한 주변',
    peerExplorerTitle: '피어 탐색기',
    closePeerExplorer: '피어 탐색기 닫기',
    peerStateLegend: '피어 상태 안내',
    findPeer: '피어 찾기',
    peerIdPlaceholder: '피어 ID',
    state: '상태',
    allStates: '모든 상태',
    shown: '개 표시',
    observedPeers: '관측된 IPFS 피어',
    noPeers:
      '아직 관측된 피어가 없습니다. 브라우저 검색에는 시간이 걸릴 수 있으며 CORS가 활성화된 RPC 탐색 후 로컬 Kubo 피어가 표시됩니다.',
    noPeerMatch: '현재 검색 및 상태 필터와 일치하는 피어가 없습니다.',
    onDeviceHistory: '기기 내 기록',
    checkingVisits: '이전 방문 확인 중…',
    clearHistory: '로컬 기록 지우기',
    livePings: '실시간 Ping',
    latencySampleSummary:
      '{{measured}} / {{total}} 실시간 Ping · {{coverage}}% 측정 범위',
    latencySampleEmpty: '{{measured}} / {{total}} 실시간 Ping',
    peerResultsInitial: '0개 표시',
    regionChecking: '지역 힌트: 언어와 시간대를 확인하는 중…',
    checkingLanguageCoverage: '언어 카탈로그를 불러오는 중…',
    live: '실시간',
    offline: '오프라인',
    openingNode: '브라우저 노드 여는 중…',
    nodeStartFailed: '브라우저 노드를 시작할 수 없음',
    searchingPeers: '브라우저에서 도달 가능한 피어 검색 중',
    observingConnections: '{{count}}개의 실시간 브라우저 연결 관측 중',
    historyRetained: '이전 관측에서 공개 피어 ID {{count}}개를 보존했습니다.',
    historyUnavailable:
      '이 브라우저 컨텍스트에서는 로컬 기록을 사용할 수 없습니다.',
    regionSourceTimezone: '시간대',
    regionSourceLanguage: '언어',
    coverage: '측정 범위',
    kuboRequesting: '127.0.0.1:5001에서 /id 및 /swarm/peers를 요청하는 중…',
    kuboObserved:
      '로컬 Kubo에서 피어 {{count}}개를 관측{{admitted}}했습니다. 브라우저 Helia는 별도 노드입니다. 활성화하면 15초마다 새로 고칩니다.',
    kuboAdmitted: '。그중 {{count}}개를 보기에 추가',
    kuboCorsError:
      '로컬 Kubo가 이 출처를 차단했습니다. 이 로컬 출처만 API.HTTPHeaders에 추가한 뒤 IPFS Desktop을 다시 시작하세요.',
    kuboReadError: '로컬 Kubo를 읽을 수 없습니다.',
    kuboReading: '로컬 Kubo 데몬을 읽는 중',
    fixtureConnections: '픽스처 연결 {{count}}개를 관측하는 중',
    fixturePeers: '가져온 픽스처 피어 {{count}}개를 추적하는 중',
  },
  es: {
    skipLink: 'Ir al observatorio',
    siteHeader: 'Encabezado del sitio',
    brandHome: 'Inicio de Peerstellation',
    observatoryControls: 'Controles del observatorio',
    connecting: 'Conectando',
    readKubo: 'Leer el demonio Kubo local',
    retry: 'Reintentar',
    openSettings: 'Abrir ajustes del observatorio',
    closeSettings: 'Cerrar ajustes',
    pauseMotion: 'Pausar movimiento',
    resumeMotion: 'Reanudar movimiento',
    canvasLabel: 'Universo 3D de pares IPFS en vivo',
    tooltipPeer: 'Par',
    connected: 'Conectado',
    discovered: 'Descubierto',
    disconnected: 'Desconectado',
    latency: 'Latencia',
    transport: 'Transporte de red',
    direction: 'Dirección de la conexión',
    protocols: 'Protocolos de red',
    agent: 'Agente',
    protocolVersion: 'Versión del protocolo',
    addresses: 'Direcciones',
    relay: 'Relé de red',
    source: 'Origen',
    browserHelia: 'Helia del navegador',
    notObserved: 'No observado',
    unmeasured: 'No medido',
    tooltipHint:
      'Toca / haz clic o usa [ ] para seleccionar · Esc para descartar',
    fullPeerId: 'ID completo del par',
    lastObserved: 'Última observación',
    showDetails: 'Mostrar detalles',
    hideDetails: 'Ocultar detalles',
    dateUnavailable: 'Fecha no disponible',
    interactiveObservatory: 'Observatorio 3D interactivo de pares',
    sceneDescription:
      'El centro representa el nodo Helia de este navegador. Los nodos verdes están conectados, los violetas fueron descubiertos pero no están conectados, los dorados proceden de Kubo local y las estrellas grises conservan el historial de desconexión. La distancia representa la latencia medida; los pares sin medir ocupan la órbita exterior. Consulta el explorador de pares para ver los detalles en texto.',
    peerAnnouncement:
      'Hay {{connected}} pares conectados al navegador. Se siguen {{total}} pares en la vista activa.',
    peerSummary:
      'Navegador en vivo {{browser}} · Kubo local {{kubo}} · descubiertos {{discovered}} · desconectados {{disconnected}} (vista activa).',
    peerSummaryInitial: 'Esperando el informe de pares del nodo del navegador.',
    fallbackEyebrow: 'Observatorio de texto en línea',
    fallbackTitle: 'Vista 3D no disponible',
    fallbackBody:
      'Este dispositivo no pudo crear un contexto WebGL seguro. Las observaciones Helia en vivo siguen disponibles en el explorador de pares.',
    sceneLegend: 'Guía de la escena 3D',
    browserLiveLine: 'Navegador en vivo · línea al centro',
    discoveredOnly: 'Solo descubierto',
    kuboObservedOuter: 'Kubo local observado · campo exterior',
    disconnectedHistory: 'Historial desconectado · estrella apagada',
    decorativeDust: 'Polvo de señal decorativo',
    distanceAxis: 'Distancia = latencia medida · órbita exterior = sin medir',
    angleAxis:
      'Sectores angulares = WebSocket · WebRTC · WebTransport · relé · otro',
    brightnessAxis: 'Brillo de línea = respuesta más rápida',
    browserNodeStatus: 'Estado del nodo del navegador',
    browserNode: 'Nodo del navegador',
    identityPending: 'Identidad pendiente',
    kuboDefaultSource: 'La fuente predeterminada es Helia del navegador.',
    liveObservationMetrics: 'Métricas de observación en vivo',
    connectedNow: 'Conectados ahora',
    browserLive: 'Navegador en vivo',
    currentBrowserConnections: 'Conexiones actuales de Helia del navegador',
    trackedView: 'Vista rastreada',
    allSources: 'Todos los orígenes',
    recentPeers: 'Pares recientes · máximo 2.048',
    medianLatency: 'Latencia mediana',
    measured: 'Medida',
    p95Latency: 'Latencia P95',
    tailOfSample: 'Cola de la misma muestra en vivo',
    observationScope: 'Alcance de observación',
    observationScopeBody:
      'El vecindario accesible para este navegador y las observaciones de Kubo local importadas explícitamente; se rastrean 2.048 y se renderizan 1.024, nunca toda la red IPFS.',
    preset: 'Preajuste',
    presetAuto: 'Automático — según el dispositivo',
    presetLowest: 'Mínimo — batería primero',
    presetLow: 'Bajo — escena ligera',
    presetMedium: 'Medio — equilibrado',
    presetHigh: 'Alto — cielo rico',
    presetHighest: 'Máximo — forzar detalle',
    adaptiveProtection: 'Protección adaptativa',
    adaptiveAuto: 'Automático — recuperar y adaptar',
    adaptiveManual: 'Manual — no cambiar el preajuste',
    pixelRatio: 'Relación de píxeles',
    nebulaDensity: 'Densidad de nebulosa',
    signalDust: 'Polvo de señal',
    nodeDetail: 'Detalle de nodos',
    edgeBrightness: 'Brillo de líneas',
    antialiasingNextVisit: 'Antialiasing (próxima visita)',
    spacePanorama: 'Panorama espacial',
    space2k: 'Espacio 2K — carga rápida',
    space8k: 'Espacio 8K — máximo detalle',
    cssSky: 'Cielo CSS — sin panorama',
    exposure: 'Exposición',
    depthFog: 'Niebla de profundidad',
    motionScale: 'Escala de movimiento',
    cameraSensitivity: 'Sensibilidad de cámara',
    automaticOrbit: 'Órbita automática',
    arrivalPulses: 'Pulsos de llegada',
    localKuboObservations: 'Observaciones de Kubo local',
    discoveredPeers: 'Pares descubiertos',
    latencyDistanceRings: 'Anillos de distancia de latencia',
    pointerBehavior: 'Comportamiento del puntero',
    pointerHover: 'Pasa sobre los pares para ver detalles',
    pointerCamera: 'Modo cámara hasta cambiarlo',
    moveForward: 'Avanzar',
    moveBackward: 'Retroceder',
    strafeLeft: 'Desplazar a la izquierda',
    strafeRight: 'Desplazar a la derecha',
    turnLeft: 'Girar a la izquierda',
    turnRight: 'Girar a la derecha',
    lookUp: 'Mirar arriba',
    lookDown: 'Mirar abajo',
    zoomIn: 'Acercar',
    zoomOut: 'Alejar',
    speedBoost: 'Aceleración',
    languageAuto: 'Automático — preferencia del navegador',
    languageCoverage: 'Cobertura de idiomas',
    translatedLocally: 'traducido localmente',
    editorialTranslation:
      'texto de producto editado · requiere revisión nativa',
    machineTranslation: 'traducción automática · requiere revisión nativa',
    bridgeTranslation: 'borrador de idioma puente · requiere revisión nativa',
    englishFallback: 'reserva en inglés',
    settingsReset: 'Restablecer valores',
    applyClose: 'Aplicar y cerrar',
    observableNeighborhood: 'Vecindario observable',
    peerExplorerTitle: 'Explorador de pares',
    closePeerExplorer: 'Cerrar explorador de pares',
    peerStateLegend: 'Guía del estado de los pares',
    findPeer: 'Buscar par',
    peerIdPlaceholder: 'ID del par',
    state: 'Estado',
    allStates: 'Todos los estados',
    shown: 'mostrados',
    observedPeers: 'Pares IPFS observados',
    noPeers:
      'Aún no se han observado pares. El descubrimiento del navegador puede tardar; los pares de Kubo local aparecen después de una consulta RPC explícita con CORS habilitado.',
    noPeerMatch:
      'Ningún par observado coincide con la búsqueda y el filtro de estado actuales.',
    onDeviceHistory: 'Historial del dispositivo',
    checkingVisits: 'Comprobando visitas anteriores…',
    clearHistory: 'Borrar historial local',
    livePings: 'pings en vivo',
    latencySampleSummary:
      '{{measured}} / {{total}} pings en vivo · {{coverage}} % de cobertura',
    latencySampleEmpty: '{{measured}} / {{total}} pings en vivo',
    peerResultsInitial: '0 mostrados',
    regionChecking: 'Indicio de región: comprobando idioma y zona horaria…',
    checkingLanguageCoverage: 'Cargando catálogo de idiomas…',
    live: 'En vivo',
    offline: 'Sin conexión',
    openingNode: 'Abriendo nodo del navegador…',
    nodeStartFailed: 'No se pudo iniciar el nodo del navegador',
    searchingPeers: 'Buscando pares accesibles desde el navegador',
    observingConnections:
      'Observando {{count}} conexiones activas del navegador',
    historyRetained:
      'Se conservaron {{count}} ID de pares públicos de observaciones anteriores.',
    historyUnavailable:
      'El historial local no está disponible en este contexto del navegador.',
    regionSourceTimezone: 'zona horaria',
    regionSourceLanguage: 'idioma',
    coverage: 'cobertura',
    kuboRequesting: 'Solicitando /id y /swarm/peers desde 127.0.0.1:5001…',
    kuboObserved:
      '{{count}} pares observados por Kubo local{{admitted}}. Browser Helia es un nodo independiente. Se actualiza cada 15 s mientras esté activo.',
    kuboAdmitted: '; los primeros {{count}} se admitieron en la vista',
    kuboCorsError:
      'Kubo local bloqueó este origen. Añade solo este origen local a API.HTTPHeaders y reinicia IPFS Desktop.',
    kuboReadError: 'No se pudo leer Kubo local.',
    kuboReading: 'Leyendo el demonio Kubo local',
    fixtureConnections: 'Observando {{count}} conexiones de prueba',
    fixturePeers: 'Siguiendo {{count}} pares de prueba importados',
  },
  fr: {
    skipLink: 'Aller à l’observatoire',
    siteHeader: 'En-tête du site',
    brandHome: 'Accueil Peerstellation',
    observatoryControls: 'Commandes de l’observatoire',
    connecting: 'Connexion',
    readKubo: 'Lire le démon Kubo local',
    retry: 'Réessayer',
    openSettings: 'Ouvrir les réglages de l’observatoire',
    closeSettings: 'Fermer les réglages',
    pauseMotion: 'Mettre le mouvement en pause',
    resumeMotion: 'Reprendre le mouvement',
    canvasLabel: 'Univers 3D de pairs IPFS en direct',
    tooltipPeer: 'Pair',
    connected: 'Connecté',
    discovered: 'Découvert',
    disconnected: 'Déconnecté',
    latency: 'Latence',
    transport: 'Transport réseau',
    direction: 'Sens de la connexion',
    protocols: 'Protocoles réseau',
    agent: 'Agent',
    protocolVersion: 'Version du protocole',
    addresses: 'Adresses',
    relay: 'Relais réseau',
    source: 'Source',
    browserHelia: 'Helia du navigateur',
    notObserved: 'Non observé',
    unmeasured: 'Non mesuré',
    tooltipHint:
      'Touchez / cliquez ou utilisez [ ] pour sélectionner · Échap pour fermer',
    fullPeerId: 'ID complet du pair',
    lastObserved: 'Dernière observation',
    showDetails: 'Afficher les détails',
    hideDetails: 'Masquer les détails',
    dateUnavailable: 'Date indisponible',
    interactiveObservatory: 'Observatoire 3D interactif de pairs',
    sceneDescription:
      'Le centre représente le nœud Helia de ce navigateur. Les nœuds verts sont connectés, les violets ont été découverts mais ne sont pas connectés, les dorés viennent du Kubo local et les étoiles grises conservent l’historique des déconnexions. La distance représente la latence mesurée ; les pairs non mesurés occupent l’orbite extérieure. Consultez l’explorateur de pairs pour les détails textuels.',
    peerAnnouncement:
      '{{connected}} pairs sont connectés au navigateur. {{total}} pairs sont suivis dans la vue active.',
    peerSummary:
      'Navigateur en direct {{browser}} · Kubo local {{kubo}} · découverts {{discovered}} · déconnectés {{disconnected}} (vue active).',
    peerSummaryInitial:
      'En attente du rapport des pairs du nœud du navigateur.',
    fallbackEyebrow: 'Observatoire textuel en ligne',
    fallbackTitle: 'Vue 3D indisponible',
    fallbackBody:
      'Cet appareil n’a pas pu créer un contexte WebGL sécurisé. Les observations Helia en direct restent disponibles dans l’explorateur de pairs.',
    sceneLegend: 'Guide de la scène 3D',
    browserLiveLine: 'Navigateur en direct · ligne vers le centre',
    discoveredOnly: 'Découvert uniquement',
    kuboObservedOuter: 'Kubo local observé · champ extérieur',
    disconnectedHistory: 'Historique déconnecté · étoile éteinte',
    decorativeDust: 'Poussière de signal décorative',
    distanceAxis:
      'Distance = latence mesurée · orbite extérieure = non mesurée',
    angleAxis:
      'Secteurs angulaires = WebSocket · WebRTC · WebTransport · relais · autre',
    brightnessAxis: 'Luminosité de ligne = réponse plus rapide',
    browserNodeStatus: 'État du nœud navigateur',
    browserNode: 'Nœud navigateur',
    identityPending: 'Identité en attente',
    kuboDefaultSource: 'La source par défaut est Helia du navigateur.',
    liveObservationMetrics: 'Mesures d’observation en direct',
    connectedNow: 'Connectés maintenant',
    browserLive: 'Navigateur en direct',
    currentBrowserConnections: 'Connexions Helia actuelles du navigateur',
    trackedView: 'Vue suivie',
    allSources: 'Toutes les sources',
    recentPeers: 'Pairs récents · maximum 2 048',
    medianLatency: 'Latence médiane',
    measured: 'Mesurée',
    p95Latency: 'Latence P95',
    tailOfSample: 'Queue du même échantillon en direct',
    observationScope: 'Périmètre d’observation',
    observationScopeBody:
      'Le voisinage accessible à ce navigateur et les observations Kubo locales importées explicitement ; suivi à 2 048 et rendu à 1 024, jamais tout le réseau IPFS.',
    preset: 'Préréglage',
    presetAuto: 'Auto — adapté à l’appareil',
    presetLowest: 'Minimal — batterie d’abord',
    presetLow: 'Faible — scène légère',
    presetMedium: 'Moyen — équilibré',
    presetHigh: 'Élevé — ciel riche',
    presetHighest: 'Maximum — forcer les détails',
    adaptiveProtection: 'Protection adaptative',
    adaptiveAuto: 'Auto — récupérer et adapter',
    adaptiveManual: 'Manuel — ne jamais changer le préréglage',
    pixelRatio: 'Rapport de pixels',
    nebulaDensity: 'Densité de nébuleuse',
    signalDust: 'Poussière de signal',
    nodeDetail: 'Détail des nœuds',
    edgeBrightness: 'Luminosité des lignes',
    antialiasingNextVisit: 'Anticrénelage (prochaine visite)',
    spacePanorama: 'Panorama spatial',
    space2k: 'Espace 2K — chargement rapide',
    space8k: 'Espace 8K — détails maximum',
    cssSky: 'Ciel CSS — sans panorama',
    exposure: 'Exposition',
    depthFog: 'Brouillard de profondeur',
    motionScale: 'Échelle du mouvement',
    cameraSensitivity: 'Sensibilité de la caméra',
    automaticOrbit: 'Orbite automatique',
    arrivalPulses: 'Impulsions d’arrivée',
    localKuboObservations: 'Observations Kubo locales',
    discoveredPeers: 'Pairs découverts',
    latencyDistanceRings: 'Anneaux de distance de latence',
    pointerBehavior: 'Comportement du pointeur',
    pointerHover: 'Survolez les pairs pour les détails',
    pointerCamera: 'Mode caméra jusqu’au basculement',
    moveForward: 'Avancer',
    moveBackward: 'Reculer',
    strafeLeft: 'Pas à gauche',
    strafeRight: 'Pas à droite',
    turnLeft: 'Tourner à gauche',
    turnRight: 'Tourner à droite',
    lookUp: 'Regarder vers le haut',
    lookDown: 'Regarder vers le bas',
    zoomIn: 'Zoom avant',
    zoomOut: 'Zoom arrière',
    speedBoost: 'Accélération',
    languageAuto: 'Auto — préférence du navigateur',
    languageCoverage: 'Couverture linguistique',
    translatedLocally: 'traduit localement',
    editorialTranslation: 'texte produit révisé · révision native requise',
    machineTranslation: 'traduction automatique · révision native requise',
    bridgeTranslation:
      'brouillon dans une langue passerelle · révision native requise',
    englishFallback: 'repli anglais',
    settingsReset: 'Rétablir les valeurs par défaut',
    applyClose: 'Appliquer et fermer',
    observableNeighborhood: 'Voisinage observable',
    peerExplorerTitle: 'Explorateur de pairs',
    closePeerExplorer: 'Fermer l’explorateur de pairs',
    peerStateLegend: 'Guide de l’état des pairs',
    findPeer: 'Rechercher un pair',
    peerIdPlaceholder: 'ID du pair',
    state: 'État',
    allStates: 'Tous les états',
    shown: 'affichés',
    observedPeers: 'Pairs IPFS observés',
    noPeers:
      'Aucun pair observé pour le moment. La découverte du navigateur peut prendre un instant ; les pairs Kubo locaux apparaissent après une requête RPC explicite avec CORS activé.',
    noPeerMatch:
      'Aucun pair observé ne correspond à la recherche et au filtre d’état actuels.',
    onDeviceHistory: 'Historique de l’appareil',
    checkingVisits: 'Vérification des visites précédentes…',
    clearHistory: 'Effacer l’historique local',
    livePings: 'pings en direct',
    latencySampleSummary:
      '{{measured}} / {{total}} pings en direct · {{coverage}} % de couverture',
    latencySampleEmpty: '{{measured}} / {{total}} pings en direct',
    peerResultsInitial: '0 affiché',
    regionChecking:
      'Indice de région : vérification de la langue et du fuseau horaire…',
    checkingLanguageCoverage: 'Chargement du catalogue des langues…',
    live: 'En direct',
    offline: 'Hors ligne',
    openingNode: 'Ouverture du nœud navigateur…',
    nodeStartFailed: 'Impossible de démarrer le nœud navigateur',
    searchingPeers: 'Recherche de pairs accessibles au navigateur',
    observingConnections:
      'Observation de {{count}} connexions navigateur en direct',
    historyRetained:
      '{{count}} ID de pairs publics conservés depuis les observations précédentes.',
    historyUnavailable:
      'L’historique local est indisponible dans ce contexte de navigateur.',
    regionSourceTimezone: 'fuseau horaire',
    regionSourceLanguage: 'langue',
    coverage: 'couverture',
    kuboRequesting: 'Requête de /id et /swarm/peers auprès de 127.0.0.1:5001…',
    kuboObserved:
      '{{count}} pairs observés par Kubo local{{admitted}}. Browser Helia reste un nœud distinct. Actualisation toutes les 15 s si activé.',
    kuboAdmitted: '; les {{count}} premiers sont admis dans la vue',
    kuboCorsError:
      'Kubo local a bloqué cette origine. Ajoutez uniquement cette origine locale à API.HTTPHeaders, puis redémarrez IPFS Desktop.',
    kuboReadError: 'Impossible de lire Kubo local.',
    kuboReading: 'Lecture du démon Kubo local',
    fixtureConnections: 'Observation de {{count}} connexions de test',
    fixturePeers: 'Suivi de {{count}} pairs de test importés',
  },
  de: {
    skipLink: 'Zum Observatorium springen',
    siteHeader: 'Website-Kopfzeile',
    brandHome: 'Peerstellation-Startseite',
    observatoryControls: 'Observatorium-Steuerung',
    connecting: 'Verbindung wird hergestellt',
    readKubo: 'Lokalen Kubo-Daemon lesen',
    retry: 'Erneut versuchen',
    openSettings: 'Observatorium-Einstellungen öffnen',
    closeSettings: 'Einstellungen schließen',
    pauseMotion: 'Bewegung pausieren',
    resumeMotion: 'Bewegung fortsetzen',
    canvasLabel: 'Live-3D-IPFS-Peer-Universum',
    tooltipPeer: 'Peer',
    connected: 'Verbunden',
    discovered: 'Entdeckt',
    disconnected: 'Getrennt',
    latency: 'Latenz',
    transport: 'Netzwerktransport',
    direction: 'Verbindungsrichtung',
    protocols: 'Netzwerkprotokolle',
    agent: 'Agent',
    protocolVersion: 'Protokollversion',
    addresses: 'Adressen',
    relay: 'Netzwerk-Relay',
    source: 'Quelle',
    browserHelia: 'Browser-Helia',
    notObserved: 'Nicht beobachtet',
    unmeasured: 'Nicht gemessen',
    tooltipHint: 'Tippen / klicken oder [ ] zum Auswählen · Esc zum Aufheben',
    fullPeerId: 'Vollständige Peer-ID',
    lastObserved: 'Zuletzt beobachtet',
    showDetails: 'Details anzeigen',
    hideDetails: 'Details ausblenden',
    dateUnavailable: 'Datum nicht verfügbar',
    interactiveObservatory: 'Interaktives 3D-Peer-Observatorium',
    sceneDescription:
      'Das Zentrum stellt den Helia-Knoten dieses Browsers dar. Grüne Knoten sind verbunden, violette wurden entdeckt, sind aber nicht verbunden, goldene stammen aus dem lokalen Kubo und graue Sterne bewahren den Verlauf getrennter Peers. Die Entfernung zeigt die gemessene Latenz; nicht gemessene Peers liegen auf der Außenbahn. Textdetails gibt es im Peer-Explorer.',
    peerAnnouncement:
      '{{connected}} Peers sind mit dem Browser verbunden. {{total}} Peers werden in der aktiven Ansicht verfolgt.',
    peerSummary:
      'Browser live {{browser}} · lokales Kubo {{kubo}} · entdeckt {{discovered}} · getrennt {{disconnected}} (aktive Ansicht).',
    peerSummaryInitial: 'Warten auf den Peer-Bericht des Browser-Knotens.',
    fallbackEyebrow: 'Text-Observatorium online',
    fallbackTitle: '3D-Ansicht nicht verfügbar',
    fallbackBody:
      'Dieses Gerät konnte keinen sicheren WebGL-Kontext erstellen. Live-Helia-Beobachtungen bleiben im Peer-Explorer verfügbar.',
    sceneLegend: 'Hilfe zur 3D-Szene',
    browserLiveLine: 'Browser live · Linie zum Zentrum',
    discoveredOnly: 'Nur entdeckt',
    kuboObservedOuter: 'Lokales Kubo beobachtet · Außenfeld',
    disconnectedHistory: 'Getrennter Verlauf · toter Stern',
    decorativeDust: 'Dekorativer Signalstaub',
    distanceAxis: 'Entfernung = gemessene Latenz · Außenbahn = nicht gemessen',
    angleAxis:
      'Winkelsektoren = WebSocket · WebRTC · WebTransport · Relay · Sonstige',
    brightnessAxis: 'Linienhelligkeit = schnellere Antwort',
    browserNodeStatus: 'Browser-Knotenstatus',
    browserNode: 'Browser-Knoten',
    identityPending: 'Identität ausstehend',
    kuboDefaultSource: 'Die Standardsource ist Browser-Helia.',
    liveObservationMetrics: 'Live-Beobachtungsmetriken',
    connectedNow: 'Jetzt verbunden',
    browserLive: 'Browser live',
    currentBrowserConnections: 'Aktuelle Browser-Helia-Verbindungen',
    trackedView: 'Verfolgte Ansicht',
    allSources: 'Alle Quellen',
    recentPeers: 'Aktuelle Peers · maximal 2.048',
    medianLatency: 'Median-Latenz',
    measured: 'Gemessen',
    p95Latency: 'P95-Latenz',
    tailOfSample: 'Ende derselben Live-Stichprobe',
    observationScope: 'Beobachtungsumfang',
    observationScopeBody:
      'Die für diesen Browser erreichbare Nachbarschaft und ausdrücklich importierte lokale Kubo-Beobachtungen; verfolgt werden 2.048 und gerendert 1.024, niemals das gesamte IPFS-Netzwerk.',
    preset: 'Vorgabe',
    presetAuto: 'Auto — geräteabhängig',
    presetLowest: 'Niedrigste — Akku zuerst',
    presetLow: 'Niedrig — leichte Szene',
    presetMedium: 'Mittel — ausgewogen',
    presetHigh: 'Hoch — reichhaltiger Himmel',
    presetHighest: 'Höchste — Details erzwingen',
    adaptiveProtection: 'Adaptive Sicherung',
    adaptiveAuto: 'Auto — erholen und anpassen',
    adaptiveManual: 'Manuell — Vorgabe nie ändern',
    pixelRatio: 'Pixelverhältnis',
    nebulaDensity: 'Nebeldichte',
    signalDust: 'Signalstaub',
    nodeDetail: 'Knotendetail',
    edgeBrightness: 'Linienhelligkeit',
    antialiasingNextVisit: 'Antialiasing (nächster Besuch)',
    spacePanorama: 'Weltraumpanorama',
    space2k: 'Weltraum 2K — schnelles Laden',
    space8k: 'Weltraum 8K — maximale Details',
    cssSky: 'CSS-Himmel — kein Panorama',
    exposure: 'Belichtung',
    depthFog: 'Tiefennebel',
    motionScale: 'Bewegungsskalierung',
    cameraSensitivity: 'Kameraempfindlichkeit',
    automaticOrbit: 'Automatische Umlaufbahn',
    arrivalPulses: 'Ankunftspulse',
    localKuboObservations: 'Lokale Kubo-Beobachtungen',
    discoveredPeers: 'Entdeckte Peers',
    latencyDistanceRings: 'Latenz-Entfernungsringe',
    pointerBehavior: 'Zeigerverhalten',
    pointerHover: 'Für Details über Peers fahren',
    pointerCamera: 'Kameramodus bis zum Umschalten',
    moveForward: 'Vorwärts',
    moveBackward: 'Rückwärts',
    strafeLeft: 'Seitwärts links',
    strafeRight: 'Seitwärts rechts',
    turnLeft: 'Nach links drehen',
    turnRight: 'Nach rechts drehen',
    lookUp: 'Nach oben sehen',
    lookDown: 'Nach unten sehen',
    zoomIn: 'Vergrößern',
    zoomOut: 'Verkleinern',
    speedBoost: 'Geschwindigkeitsschub',
    languageAuto: 'Auto — Browsereinstellung',
    languageCoverage: 'Sprachabdeckung',
    translatedLocally: 'lokal übersetzt',
    editorialTranslation:
      'redaktionell bearbeiteter Produkttext · native Prüfung erforderlich',
    machineTranslation:
      'maschinell übersetzt · Prüfung durch Muttersprachler nötig',
    bridgeTranslation:
      'Brückensprachen-Entwurf · Prüfung durch Muttersprachler erforderlich',
    englishFallback: 'Englisch-Ersatz',
    settingsReset: 'Standards zurücksetzen',
    applyClose: 'Anwenden und schließen',
    observableNeighborhood: 'Beobachtbare Nachbarschaft',
    peerExplorerTitle: 'Peer-Explorer',
    closePeerExplorer: 'Peer-Explorer schließen',
    peerStateLegend: 'Hilfe zum Peer-Status',
    findPeer: 'Peer suchen',
    peerIdPlaceholder: 'Peer-ID',
    state: 'Status',
    allStates: 'Alle Status',
    shown: 'angezeigt',
    observedPeers: 'Beobachtete IPFS-Peers',
    noPeers:
      'Noch keine Peers beobachtet. Die Browser-Erkennung kann etwas dauern; lokale Kubo-Peers erscheinen nach einer ausdrücklichen RPC-Abfrage mit aktiviertem CORS.',
    noPeerMatch:
      'Kein beobachteter Peer passt zur aktuellen Suche und Statusauswahl.',
    onDeviceHistory: 'Geräteverlauf',
    checkingVisits: 'Vorherige Besuche werden geprüft…',
    clearHistory: 'Lokalen Verlauf löschen',
    livePings: 'Live-Pings',
    latencySampleSummary:
      '{{measured}} / {{total}} Live-Pings · {{coverage}} % Abdeckung',
    latencySampleEmpty: '{{measured}} / {{total}} Live-Pings',
    peerResultsInitial: '0 angezeigt',
    regionChecking: 'Regionshinweis: Sprache und Zeitzone werden geprüft…',
    checkingLanguageCoverage: 'Sprachkatalog wird geladen…',
    live: 'Live',
    offline: 'Offline',
    openingNode: 'Browser-Knoten wird geöffnet…',
    nodeStartFailed: 'Browser-Knoten konnte nicht gestartet werden',
    searchingPeers: 'Nach browsererreichbaren Peers wird gesucht',
    observingConnections:
      '{{count}} Live-Browserverbindungen werden beobachtet',
    historyRetained:
      '{{count}} öffentliche Peer-IDs aus früheren Beobachtungen behalten.',
    historyUnavailable:
      'Der lokale Verlauf ist in diesem Browserkontext nicht verfügbar.',
    regionSourceTimezone: 'Zeitzone',
    regionSourceLanguage: 'Sprache',
    coverage: 'Abdeckung',
    kuboRequesting:
      '/id und /swarm/peers von 127.0.0.1:5001 werden angefordert…',
    kuboObserved:
      '{{count}} Peers von lokalem Kubo beobachtet{{admitted}}. Browser Helia bleibt ein separater Knoten. Bei Aktivierung alle 15 Sekunden aktualisiert.',
    kuboAdmitted: '; die ersten {{count}} wurden in die Ansicht aufgenommen',
    kuboCorsError:
      'Lokales Kubo hat diesen Ursprung blockiert. Füge nur diesen lokalen Ursprung zu API.HTTPHeaders hinzu und starte IPFS Desktop neu.',
    kuboReadError: 'Lokales Kubo konnte nicht gelesen werden.',
    kuboReading: 'Lokaler Kubo-Daemon wird gelesen',
    fixtureConnections: '{{count}} Fixture-Verbindungen werden beobachtet',
    fixturePeers: '{{count}} importierte Fixture-Peers werden verfolgt',
  },
};

type LocaleMessageTable = Partial<Record<TranslationKey, string>>;
type LocaleDirection = 'ltr' | 'rtl';

export interface LocalePackMetadata {
  readonly target: string;
  readonly dir: LocaleDirection;
  readonly script: string;
  readonly residue: number;
}

/**
 * Long-tail locale packs are static JSON assets rather than part of the
 * first JavaScript chunk. This keeps the observatory's first 3D frame fast;
 * a selected language is fetched once, validated, and cached for the session.
 */
const LOADED_MESSAGES = new Map<ResolvedLocale, LocaleMessageTable>();
const LOADED_DIRECTIONS = new Map<ResolvedLocale, LocaleDirection>();
const LOADED_METADATA = new Map<ResolvedLocale, LocalePackMetadata>();
let LOCALE_MANIFEST_LOAD: Promise<boolean> | undefined;
const LOCALE_LOADS = new Map<ResolvedLocale, Promise<boolean>>();
const BUILT_IN_LOCALES = new Set<ResolvedLocale>([
  'en',
  'ja',
  'zh-CN',
  'ko',
  'es',
  'fr',
  'de',
]);
const KNOWN_TRANSLATION_KEYS = new Set<TranslationKey>(
  Object.keys(MESSAGES.en ?? {}) as TranslationKey[],
);
const RTL_LOCALES = new Set<ResolvedLocale>([
  'ae',
  'ar',
  'dv',
  'fa',
  'he',
  'ps',
  'sd',
  'ug',
  'ur',
  'yi',
]);
// A pack can be produced through a bridge script that differs from CLDR's
// default for the locale (ks is emitted in Devanagari via Hindi). Keep these
// audited fallbacks in the initial chunk so the first paint has the right
// direction before its lazy pack arrives.
const LTR_LOCALES = new Set<ResolvedLocale>(['ks']);
const RTL_SCRIPTS = new Set(['Arab', 'Hebr', 'Thaa']);

export function localePackMetadata(
  locale: ResolvedLocale,
): LocalePackMetadata | undefined {
  return LOADED_METADATA.get(locale);
}

/** Load the generated pack manifest used for transparent coverage labels. */
export async function loadLocaleManifest(): Promise<boolean> {
  if (LOADED_METADATA.size >= LANGUAGE_CATALOG.length - BUILT_IN_LOCALES.size) {
    return true;
  }
  if (LOCALE_MANIFEST_LOAD !== undefined) return LOCALE_MANIFEST_LOAD;
  const request = (async (): Promise<boolean> => {
    try {
      const response = await fetch('/locales/manifest.json', {
        cache: 'no-cache',
        credentials: 'omit',
        headers: { Accept: 'application/json' },
      });
      if (!response.ok) return false;
      const payload: unknown = await response.json();
      if (payload === null || typeof payload !== 'object') return false;
      const manifest = payload as Record<string, unknown>;
      if (manifest.version !== 1) return false;
      const entries = manifest.locales;
      if (entries === null || typeof entries !== 'object') return false;
      let valid = 0;
      for (const [tag, value] of Object.entries(entries)) {
        if (
          !LANGUAGE_CATALOG.includes(tag as ResolvedLocale) ||
          BUILT_IN_LOCALES.has(tag as ResolvedLocale) ||
          value === null ||
          typeof value !== 'object'
        ) {
          continue;
        }
        const metadata = value as Record<string, unknown>;
        const residue = Number(metadata.residue);
        if (
          typeof metadata.target !== 'string' ||
          (metadata.dir !== 'ltr' && metadata.dir !== 'rtl') ||
          typeof metadata.script !== 'string' ||
          metadata.script.trim() === '' ||
          !Number.isFinite(residue) ||
          residue < 0 ||
          residue > 1
        ) {
          return false;
        }
        LOADED_METADATA.set(tag as ResolvedLocale, {
          target: metadata.target,
          dir: metadata.dir,
          script: metadata.script,
          residue,
        });
        LOADED_DIRECTIONS.set(tag as ResolvedLocale, metadata.dir);
        valid += 1;
      }
      return valid === LANGUAGE_CATALOG.length - BUILT_IN_LOCALES.size;
    } catch {
      return false;
    } finally {
      LOCALE_MANIFEST_LOAD = undefined;
    }
  })();
  LOCALE_MANIFEST_LOAD = request;
  return request;
}

export function resolveLocale(
  selection: Locale,
  languages: readonly string[] = browserLanguages(),
  _timeZone?: string,
): ResolvedLocale {
  if (selection !== 'auto') return selection;
  for (const language of languages) {
    const normalized = language.toLowerCase();
    const exact = LANGUAGE_CATALOG.find(
      (tag) => normalized === tag.toLowerCase(),
    );
    if (exact !== undefined) return exact;
    const base = normalized.split('-')[0];
    if (base === 'zh') return 'zh-CN';
    const baseTag = LANGUAGE_CATALOG.find((tag) => tag === base);
    if (baseTag !== undefined) return baseTag;
  }
  return 'en';
}

export function translate(locale: ResolvedLocale, key: TranslationKey): string {
  return (
    EXTENDED_MESSAGES[locale]?.[key] ??
    LOADED_MESSAGES.get(locale)?.[key] ??
    MESSAGES[locale]?.[key] ??
    MESSAGES.en?.[key] ??
    key
  );
}

export function translateTemplate(
  locale: ResolvedLocale,
  key: TranslationKey,
  values: Readonly<Record<string, string | number>>,
): string {
  return translate(locale, key).replace(
    /\{\{(\w+)\}\}/g,
    (match, name: string) => String(values[name] ?? match),
  );
}

/** Load and validate one long-tail locale pack without trusting its shape. */
export async function loadLocaleMessages(
  locale: ResolvedLocale,
): Promise<boolean> {
  if (BUILT_IN_LOCALES.has(locale)) return false;
  const loaded = LOADED_MESSAGES.has(locale);
  if (loaded) return true;
  const existing = LOCALE_LOADS.get(locale);
  if (existing !== undefined) return existing;
  const request = (async (): Promise<boolean> => {
    try {
      const response = await fetch(
        `/locales/${encodeURIComponent(locale)}.json`,
        {
          // Locale assets are versioned by the deployment, but keeping a
          // revalidation here prevents a browser that already cached an older
          // key set from rejecting the new pack and flashing English.
          cache: 'no-cache',
          credentials: 'omit',
          headers: { Accept: 'application/json' },
        },
      );
      if (!response.ok) return false;
      const payload: unknown = await response.json();
      if (payload === null || typeof payload !== 'object') return false;
      const metadata = payload as Record<string, unknown>;
      const table: LocaleMessageTable = {};
      for (const [key, value] of Object.entries(payload)) {
        if (
          KNOWN_TRANSLATION_KEYS.has(key as TranslationKey) &&
          typeof value === 'string' &&
          value.trim() !== ''
        ) {
          table[key as TranslationKey] = value;
        }
      }
      if (Object.keys(table).length !== KNOWN_TRANSLATION_KEYS.size) {
        return false;
      }
      const direction = metadata.__dir;
      const validDirection = direction === 'ltr' || direction === 'rtl';
      const script = metadata.__script;
      if (
        !validDirection ||
        typeof script !== 'string' ||
        script.trim() === ''
      ) {
        return false;
      }
      const target = metadata.__target;
      if (typeof target !== 'string' || target.trim() === '') return false;
      const residue = metadata.__residue;
      const numericResidue =
        typeof residue === 'number' ? residue : Number(residue);
      if (
        !Number.isFinite(numericResidue) ||
        numericResidue < 0 ||
        numericResidue > 1
      ) {
        return false;
      }
      LOADED_DIRECTIONS.set(locale, direction);
      LOADED_METADATA.set(locale, {
        target,
        dir: direction,
        script,
        residue: numericResidue,
      });
      LOADED_MESSAGES.set(locale, table);
      return true;
    } catch {
      return false;
    } finally {
      LOCALE_LOADS.delete(locale);
    }
  })();
  LOCALE_LOADS.set(locale, request);
  return request;
}

export function applyLocale(
  selection: Locale,
  documentRef: Document = document,
): ResolvedLocale {
  const locale = resolveLocale(selection);
  documentRef.documentElement.lang = locale;
  documentRef.documentElement.dir = isRtlLocale(locale) ? 'rtl' : 'ltr';
  documentRef.title = translate(locale, 'pageTitle');
  documentRef
    .querySelectorAll<HTMLElement>('[data-i18n]')
    .forEach((element) => {
      const key = element.dataset.i18n as TranslationKey | undefined;
      if (
        key !== undefined &&
        MESSAGES.en !== undefined &&
        key in MESSAGES.en
      ) {
        element.textContent = translate(locale, key);
      }
    });
  documentRef
    .querySelectorAll<HTMLElement>('[data-i18n-attr]')
    .forEach((element) => {
      const value = element.dataset.i18nAttr;
      if (value === undefined) return;
      for (const pair of value.split(',')) {
        const separator = pair.indexOf(':');
        if (separator <= 0) continue;
        const attribute = pair.slice(0, separator);
        const key = pair.slice(separator + 1) as TranslationKey;
        element.setAttribute(attribute, translate(locale, key));
      }
    });
  return locale;
}

export function formatControlCode(code: string): string {
  return formatCode(code);
}

function browserLanguages(): readonly string[] {
  if (typeof navigator === 'undefined') return ['en'];
  return navigator.languages.length > 0
    ? navigator.languages
    : [navigator.language];
}

function isRtlLocale(locale: ResolvedLocale): boolean {
  const loadedDirection = LOADED_DIRECTIONS.get(locale);
  if (loadedDirection !== undefined) return loadedDirection === 'rtl';
  if (LTR_LOCALES.has(locale)) return false;
  if (RTL_LOCALES.has(locale)) return true;
  try {
    const script = new Intl.Locale(locale).maximize().script;
    if (script !== undefined) {
      return RTL_SCRIPTS.has(script);
    }
  } catch {
    // Older engines may not expose Intl.Locale; retain the audited fallback.
  }
  return RTL_LOCALES.has(locale);
}

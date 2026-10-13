import { type as arkType } from 'arktype';
import {
  check,
  finite,
  literal,
  maxLength,
  maxValue,
  minLength,
  minValue,
  number,
  object,
  optional,
  pipe,
  safeParse,
  string,
  union,
} from 'valibot';
import { parsePersistedPeer } from '../src/contracts/peer-schema';

const persistedPeerValibot = pipe(
  object({
    peerId: pipe(string(), minLength(1), maxLength(256)),
    status: union([
      literal('connected'),
      literal('disconnected'),
      literal('discovered'),
    ]),
    firstSeenAt: pipe(number(), finite(), minValue(0)),
    lastSeenAt: pipe(number(), finite(), minValue(0)),
    latencyMs: optional(
      pipe(number(), finite(), minValue(0), maxValue(120_000)),
    ),
  }),
  check(
    (value) => value.lastSeenAt >= value.firstSeenAt,
    'lastSeenAt must be greater than or equal to firstSeenAt',
  ),
);

const persistedPeerArkType = arkType({
  peerId: 'string > 0 & string <= 256',
  status: "'connected' | 'disconnected' | 'discovered'",
  firstSeenAt: 'number >= 0',
  lastSeenAt: 'number >= 0',
  'latencyMs?': 'number >= 0 & number <= 120000',
}).narrow((value, ctx) =>
  value.lastSeenAt >= value.firstSeenAt
    ? true
    : ctx.reject({
        path: ['lastSeenAt'],
        message: 'lastSeenAt must be greater than or equal to firstSeenAt',
      }),
);

const validPeer = {
  peerId: '12D3KooWExamplePeer',
  status: 'connected',
  firstSeenAt: 1_000,
  lastSeenAt: 1_250,
  latencyMs: 42,
};

const invalidPeer = {
  peerId: '',
  status: 'unknown',
  firstSeenAt: 1_000,
  lastSeenAt: 500,
  latencyMs: -1,
};

assertParity('valid peer', validPeer, true);
assertParity('invalid peer', invalidPeer, false);

console.log(
  'Schema parity passed: Zod, Valibot, and ArkType agree on valid and invalid persisted-peer fixtures.',
);

function assertParity(label: string, value: unknown, expected: boolean): void {
  const zodResult = parsePersistedPeer(value) !== undefined;
  const valibotResult = safeParse(persistedPeerValibot, value).success;
  const arkResult = persistedPeerArkType.allows(value);
  const actual = [zodResult, valibotResult, arkResult];
  if (actual.some((result) => result !== expected)) {
    throw new Error(
      `${label} parity mismatch: expected ${String(expected)}, got ${actual.join(', ')}`,
    );
  }
}

# Dependency remediation snapshot

Reviewed on 2026-10-14 against the 18 GitHub Dependabot alerts open on `main`,
the current npm lockfile, and the repository's seven-day npm release-age
policy. This stack updates compatible packages and records the findings that
cannot yet be safely removed.

## Exact transitive pins

These overrides target exact vulnerable versions found in the lockfile. They
stay within the same package major and stop applying after upstream moves away
from the affected version.

| Locked version | Pinned version | Dependency path | Advisory |
| --- | --- | --- | --- |
| `postcss-selector-parser@7.1.1` | `7.1.6` | Markuplint | [GHSA-rj75-hqrm-r3gf](https://github.com/advisories/GHSA-rj75-hqrm-r3gf) |
| `uuid@13.0.0` | `13.0.1` | Markuplint parser utilities | [GHSA-w5hq-g745-h8pq](https://github.com/advisories/GHSA-w5hq-g745-h8pq) |
| `sharp@0.35.4` | `0.35.5` | Miniflare / Wrangler | [GHSA-wq5f-xc86-pv6w](https://github.com/advisories/GHSA-wq5f-xc86-pv6w) |
| `undici@7.29.0` | `7.29.1` | Miniflare / Wrangler | [GHSA-w293-vg96-wgc3](https://github.com/advisories/GHSA-w293-vg96-wgc3) |
| `qs@6.15.3` | `6.16.0` | Express / body-parser | [GHSA-4mjr-xmp4-gh2g](https://github.com/advisories/GHSA-4mjr-xmp4-gh2g) |

Other fixes use compatible lockfile updates, including `fast-uri`,
`http-cache-semantics`, `joi`, and `source-map-js`.

## Percy CLI removal

Percy was present only as an optional `quality:all` token check. No current
workflow invokes it, and the repository already has local BackstopJS visual
checks. The installed `@percy/cli@1.32.8` dependency tree contained high-severity
npm audit findings. Its suggested `1.32.11` update adds
`@percy/cli-pdf@1.32.11`, which requires vulnerable `pdfjs-dist@^2.16.105`.
The PDF.js advisory affects releases through `4.1.392` and lists `4.2.67` as the
first patched version. The optional Percy command and dependency were removed;
BackstopJS remains available. `fast-xml-parser` and `pdfjs-dist` are absent from
the resulting lockfile.

## Findings that remain

- **node-forge:** The production dependency graph is
  `helia@7.1.10 → @helia/libp2p@2.1.3 → @ipshipyard/libp2p-auto-tls@2.0.2 →
  acme-client@5.4.0 → node-forge@1.4.0`. The advisory affects versions through
  `1.4.0`; `node-forge@1.4.1` is not published. npm suggests downgrading Helia
  to `6.1.4`, a major change that was not applied without compatibility review.
  [GHSA-86w9-cpqp-85rv](https://github.com/advisories/GHSA-86w9-cpqp-85rv)
- **braces / stylelint:** The lockfile contains `braces@3.0.3` through
  development-only style and glob tooling. The reviewed advisory lists no
  patched release, and the registry has no `3.0.4`; no speculative override was
  added. [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm)

A fresh npm audit of the final stacked lockfile reports 12 high-severity
vulnerable package entries in the full development graph. `npm audit --omit=dev`
reports six entries, all in the Helia / node-forge chain above. These are
package entries, not distinct vulnerability counts. The production audit
therefore remains failing until the upstream Helia / AutoTLS chain has a safe
compatible fix or is replaced.

The `.npmrc` `min-release-age=7` policy remains enabled. GitHub Dependabot
alerts refresh after the dependency PRs merge; do not treat the current alert
count as proof that every alert has closed.

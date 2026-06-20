# Publishing wildflower to npm

## When to bump

Follow semver:
- **patch** — bug fixes, no API change
- **minor** — new features, backwards-compatible
- **major** — breaking changes

## Release steps

1. `npm version patch|minor|major` — bumps `package.json`, creates a commit + tag
2. Review the diff: `git show HEAD` — confirm the bump is correct
3. Dry-run: `npm pack --dry-run` — confirm no unexpected files in the tarball
4. `git push --follow-tags` — triggers `publish.yml`, which gates on tests before publishing

Monitor the Actions tab at `https://github.com/echo-bravo-yahoo/wildflower/actions`. The job publishes with provenance so the npm page links to the exact commit.

Confirm the release: `npm info wildflower version` (may lag a minute).

## Token management

The `NPM_TOKEN` GitHub Actions secret uses a Granular npm Access Token scoped to the `wildflower` package.

Token location in 1Password: **Private** vault → `npm wildflower-github-actions token`

To rotate before expiry:
1. Log into npmjs.com → profile → Access Tokens → generate a new Granular token (same settings as setup)
2. Save the new token in 1Password (update the existing item)
3. `gh secret set NPM_TOKEN --body "<new-token>" --repo echo-bravo-yahoo/wildflower`
4. Revoke the old token on npmjs.com

Set a calendar reminder 2 weeks before the token expires.

## One-time setup (first release only)

Before pushing the first `v*` tag, the `NPM_TOKEN` secret must exist in the repo.
See the setup instructions in the plan that introduced CI (branch `ci`) for the
step-by-step token creation flow on npmjs.com.

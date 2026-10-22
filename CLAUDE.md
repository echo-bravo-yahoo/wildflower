# wildflower

## Release pipeline

`~/workspace/wildflower`, `wildflower` on npm (public), the dotfiles gather/sow sync engine.

- CI: `.github/workflows/ci.yml` -- `npm ci` -> `npm run test:coverage`, on push/PR to `main`.
- Publish: `.github/workflows/publish.yml`, triggered on a `v*` tag push. OIDC trusted publishing (`--provenance --access public`), re-runs `npm run test:coverage` inline, and cuts a GitHub Release.
- Install: `npm install --global wildflower` (from the registry -- `install.sh` and `README.md` used to point at the GitHub tarball instead, bypassing the tested/published package entirely; fixed).
- Branching: feature-branch + PR into `main` (no direct-to-main convention here, unlike most of the others) -- has real PR history including dependabot bumps.

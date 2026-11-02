# Contributing to BitMap

Thanks for helping improve BitMap. Contributions are welcome through GitHub issues and pull requests.

## Issues

Anyone can open an issue to report a problem, suggest an improvement, or ask a question. Include clear steps to reproduce problems, expected and actual behavior, and relevant environment details. Please do not include secrets or private repository data. Opening an issue does not guarantee that it will be accepted or worked on.

## Pull requests

Use a fork for your changes:

1. Fork this repository and create a focused branch.
2. Install dependencies with `npm ci` (Node.js 20 or newer is required).
3. Make and review your changes. Keep pull requests focused and describe the user-visible effect and any tradeoffs.
4. Run the checks listed below and include their results in your pull request.
5. Open a pull request from your fork and respond to review feedback.

The repository owner, [@ariusalipour](https://github.com/ariusalipour), is the maintainer whose approval is required before a community pull request can be merged. Reviews and approvals from other contributors are welcome and helpful, but do not replace maintainer approval. Only the owner can merge changes into `main`. Contributors should ensure the checks pass before requesting review.

The repository owner, `@ariusalipour`, has an explicit owner-only override for review, update, and CI requirements. The owner can merge their own or community pull requests and can push directly to `main`. GitHub does not allow authors to approve their own pull requests, so owner-authored changes do not require self-approval. CI still runs; the owner can override its merge gate when necessary.

Everyone else must contribute through pull requests and cannot push or merge into upstream `main`, even after submitting an approval. Community changes require the owner's acceptance; other review opinions are advisory. New commits dismiss stale approvals under the review policy.

A separate history-protection ruleset has no bypass actors: force pushes and deletion of `main` remain blocked, including for the owner.

The applied ruleset definitions are recorded under [`.github/rulesets/`](.github/rulesets/). GitHub does not apply these JSON files automatically: the owner must update the live repository settings when changing the policy. Forks have their own permissions and rules; this policy governs the upstream BitMap repository.

Live settings: [owner-controlled main](https://github.com/ariusalipour/BitMap/rules/26380713) and [CI with owner override](https://github.com/ariusalipour/BitMap/rules/26380715).

## Checks

Before opening a pull request, run:

```sh
npm ci
npm run build
npm test
```

`npm test` runs the existing test suite. If a change affects behavior the suite does not cover, describe how you checked it manually.

## Data and project scope

Do not commit secrets, credentials, private repository content, or private graph/fixture data. Use synthetic or public example data in contributions. Keep private graph inputs outside the repository or in the ignored `local/` directory, and review generated output before sharing it.

BitMap currently validates and renders a graph supplied by the user; it does not analyze source code automatically. Discuss substantial new capabilities in an issue before starting a large implementation, and describe clearly when a change affects graph validation, rendering, or exported output.

## Review

The maintainer may ask for changes, defer a proposal, or close a pull request that does not fit the project's needs. Please keep discussion constructive and allow time for review.

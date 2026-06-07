# Contributing to BridgeLayer

Thank you for your interest in contributing! We welcome all kinds of contributions — bug reports, feature requests, documentation improvements, and code changes.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [How to Contribute](#how-to-contribute)
- [Development Setup](#development-setup)
- [Submitting a Pull Request](#submitting-a-pull-request)
- [Coding Standards](#coding-standards)
- [Commit Messages](#commit-messages)

---

## Code of Conduct

This project adheres to the [Contributor Covenant Code of Conduct](./CODE_OF_CONDUCT.md). By participating, you are expected to uphold this standard.

---

## How to Contribute

### Reporting Bugs

1. **Search existing issues** to avoid duplicates.
2. Open a new issue using the [Bug Report template](./.github/ISSUE_TEMPLATE/bug_report.md).
3. Include a minimal reproducible example where possible.

### Requesting Features

1. Open a new issue using the [Feature Request template](./.github/ISSUE_TEMPLATE/feature_request.md).
2. Describe the problem you're solving, not just the solution.

### Contributing Code

1. Fork the repository.
2. Create a branch from `main`: `git checkout -b feat/my-feature` or `fix/my-bug`.
3. Make your changes with tests.
4. Open a Pull Request.

---

## Development Setup

```bash
git clone https://github.com/your-org/bridgelayer.git
cd bridgelayer
npm install
npm test
```

---

## Submitting a Pull Request

- Fill out the PR template completely.
- Link any related issues using `Closes #<issue-number>`.
- Keep PRs focused — one feature or fix per PR.
- Ensure all CI checks pass before requesting review.
- A maintainer will review within 5 business days.

---

## Coding Standards

- Run `npm run lint` before committing.
- All new features must include tests.
- Maintain or improve code coverage.
- Follow existing patterns and conventions in the codebase.

---

## Commit Messages

We follow the [Conventional Commits](https://www.conventionalcommits.org/) specification:

```
<type>(scope): short description

[optional body]

[optional footer]
```

**Types:** `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`

**Examples:**
```
feat(connectors): add Kafka source adapter
fix(retry): handle timeout edge case in circuit breaker
docs: update quick start example
```

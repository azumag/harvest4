# Harvest4

A GitHub Actions automation project for streamlined CI/CD workflows.

## Features

- Automated issue resolution
- PR review automation
- CI/CD pipeline management
- Auto-merge capabilities

## Project Structure

```
├── .github/workflows/          # GitHub Actions workflows
│   ├── auto-issue-resolver.yml # Automatic issue processing
│   ├── auto-merger.yml         # Auto-merge PRs
│   ├── ci-fix.yml              # CI failure handling
│   ├── ci-result-handler.yml   # CI result processing
│   ├── ci.yml                  # Main CI/CD pipeline
│   ├── claude-code-review.yml  # Automated code review
│   ├── claude.yml              # Claude AI integration
│   ├── pr-creator.yml          # PR creation automation
│   └── review-fix.yml          # Review feedback handling
├── test/unit/                  # Unit tests
├── index.js                    # Main application file
├── package.json                # Node.js dependencies
└── README.md                   # This file
```

## Development

### Installation

```bash
npm install
```

### Running Tests

```bash
npm test
npm run test:unit
```

### Linting

```bash
npm run lint
npm run lint:fix
```

### Building

```bash
npm run build
```

## CI/CD

The project uses GitHub Actions for continuous integration and deployment. The CI pipeline includes:

- Node.js 18.x and 20.x testing
- ESLint code quality checks
- Unit test execution
- Automated PR processing

## License

MIT
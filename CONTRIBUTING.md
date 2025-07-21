# Contributing to MCP Platform

Thank you for your interest in contributing to MCP Platform! This document provides guidelines for contributing to the project.

## Getting Started

1. Fork the repository
2. Clone your fork
3. Check the [ROADMAP.md](specs/ROADMAP.md) for available tasks
4. Create a feature branch following our naming convention

## Development Process

### 1. Choose a Task

Review the [ROADMAP.md](specs/ROADMAP.md) and choose an unclaimed task. Tasks are organized by component to allow parallel development:

- **CLI Tasks**: Command-line interface features
- **Service Tasks**: MCP service implementations
- **Infrastructure Tasks**: Docker, Traefik, and core platform
- **Example Tasks**: Example MCP services
- **Test Tasks**: Testing infrastructure
- **Documentation Tasks**: Documentation improvements

### 2. Create a Branch

Use the task ID from the roadmap:

```bash
git checkout -b feature/TASK-ID-short-description

# Examples:
git checkout -b feature/CLI-2.1-health-commands
git checkout -b feature/EXAMPLE-2.1-echo-service
```

### 3. Development Guidelines

#### Code Style
- JavaScript: Use ESLint configuration
- Python: Follow PEP 8
- Shell: Use ShellCheck
- Docker: Follow Dockerfile best practices

#### Directory Structure
- Keep changes within your task's designated directory
- Avoid modifying shared files unless necessary
- If shared files must be modified, coordinate with maintainers

#### Testing
- Write tests for new functionality
- Ensure existing tests pass
- Add integration tests for new features

### 4. Commit Guidelines

Use conventional commits:

```
type(scope): description

[optional body]

[optional footer]
```

Types:
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `test`: Test additions or changes
- `refactor`: Code refactoring
- `chore`: Maintenance tasks

Examples:
```
feat(cli): add health check command
fix(docker): resolve service startup issue
docs(examples): add echo service documentation
```

### 5. Pull Request Process

1. Update documentation for your changes
2. Add tests for new functionality
3. Ensure all tests pass
4. Update the ROADMAP.md checkbox for your task
5. Create a pull request with:
   - Clear title referencing the task ID
   - Description of changes
   - Link to related issue (if any)
   - Screenshots (if applicable)

### 6. Code Review

- PRs require at least one approval
- Address review feedback promptly
- Keep PRs focused on a single task
- Large changes should be discussed in an issue first

## Testing

### Running Tests

```bash
# Unit tests
npm test

# Integration tests
npm run test:integration

# E2E tests
npm run test:e2e

# All tests
npm run test:all
```

### Writing Tests

- Place unit tests next to the code they test
- Integration tests go in `tests/integration/`
- E2E tests go in `tests/e2e/`

## Documentation

- Update relevant documentation with your changes
- Add JSDoc comments for new functions
- Include examples for new features
- Update the README if adding user-facing features

## Community

- Be respectful and inclusive
- Help others in issues and discussions
- Share your MCP services with the community
- Report bugs and suggest improvements

## Questions?

- Check existing issues and discussions
- Join our community chat (coming soon)
- Create an issue for bugs or feature requests

Thank you for contributing to MCP Platform!
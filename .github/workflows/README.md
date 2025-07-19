# GitHub Actions Workflows

This directory contains the CI/CD workflows for the VS Code Agent Todos extension.

## Workflows

### 1. CI (`ci.yml`)
- **Trigger**: Push to `main` branch and pull requests
- **Purpose**: Continuous integration testing across multiple platforms
- **Matrix**: Tests on Ubuntu, macOS, and Windows with Node.js 18.x and 20.x
- **Steps**: Type checking, linting, building, testing, and packaging

### 2. Test (`test.yml`)
- **Trigger**: Pull requests and pushes to `main` or `release/**` branches
- **Purpose**: Comprehensive testing with detailed results
- **Features**: Test result artifacts, coverage reports, and summary generation

### 3. Release (`release.yml`)
- **Trigger**: 
  - Automatically on version tags (`v*`)
  - Manual via workflow dispatch
- **Purpose**: Build, create GitHub releases, and publish to VS Code Marketplace
- **Features**:
  - Pre-release support (beta/alpha versions)
  - Automated changelog generation
  - Version validation
  - VS Code Marketplace publishing (stable and pre-release)
  - GitHub Release creation with artifacts

### 4. Version Bump (`version-bump.yml`)
- **Trigger**: Manual workflow dispatch
- **Purpose**: Automate version bumping following semantic versioning
- **Options**:
  - Bump types: patch, minor, major, prerelease
  - Pre-release identifiers (beta, alpha, rc)
  - Direct commit or pull request creation
- **Features**: Automatic tagging and release workflow triggering

### 5. Promote Pre-release (`promote-prerelease.yml`)
- **Trigger**: Manual workflow dispatch
- **Purpose**: Promote a pre-release version to stable
- **Features**:
  - Downloads VSIX from existing pre-release
  - Publishes to marketplace as stable version
  - Creates or updates GitHub release
  - Maintains version history and traceability

## Setup Requirements

### Secrets

The following secrets need to be configured in your repository:

1. **`VSCE_PAT`** (Required for marketplace publishing)
   - Personal Access Token for VS Code Marketplace
   - Create at: https://marketplace.visualstudio.com/manage/createpublisher
   - Required scopes: `Marketplace (Manage)`

2. **`APPLICATIONINSIGHTS_CONNECTION_STRING`** (Optional for telemetry)
   - Application Insights connection string for telemetry collection
   - Used to enable privacy-preserving usage analytics in distributed builds
   - If not provided, extension will function normally without telemetry
   - Should be obtained from Azure Application Insights resource

### Publishing to VS Code Marketplace

1. Create a publisher account at https://marketplace.visualstudio.com/manage
2. Generate a Personal Access Token (PAT)
3. Add the PAT as a secret named `VSCE_PAT` in your repository settings

## Usage

### Creating a Release

#### Option 1: Automated Release (Recommended)
1. Use the Version Bump workflow to increment version:
   ```
   Actions → Version Bump → Run workflow
   ```
2. Select bump type and whether to commit directly
3. The release workflow will trigger automatically on tag push

#### Option 2: Manual Release
1. Update version in `package.json`
2. Commit and push changes
3. Create and push a tag:
   ```bash
   git tag -a v1.0.0 -m "Version 1.0.0"
   git push origin v1.0.0
   ```

#### Option 3: Manual Workflow Trigger
1. Go to Actions → Release → Run workflow
2. Enter the version number (without 'v' prefix)
3. Choose whether it's a pre-release

### Pre-releases

VS Code supports [pre-release extensions](https://code.visualstudio.com/api/working-with-extensions/publishing-extension#prerelease-extensions) that allow users to test new features before stable release.

#### Creating Pre-releases

1. **Using Version Bump workflow:**
   - Select "prerelease" as bump type
   - Choose identifier (beta, alpha, rc)
   - Creates version like `1.0.0-beta.1`

2. **Manual tagging:**
   - Create tags like `v1.0.0-beta.1`, `v2.0.0-rc.1`
   - Push to trigger release workflow

3. **Release workflow options:**
   - Set `marketplace_release_type` to control publishing
   - `auto`: Determines from version format
   - `pre-release`: Forces pre-release even for stable versions
   - `stable`: Forces stable release

#### Pre-release Publishing

Pre-releases are:
- Marked as pre-release on GitHub
- Published with `--pre-release` flag to VS Code Marketplace
- Available to users who opt-in to pre-release versions
- Shown with a "Pre-release" badge in the marketplace

#### Promoting Pre-releases to Stable

Use the **Promote Pre-release** workflow to graduate a tested pre-release:

1. Go to Actions → Promote Pre-release → Run workflow
2. Enter the pre-release version (e.g., `1.0.0-beta.1`)
3. Optionally specify target version (defaults to removing pre-release suffix)
4. The workflow will:
   - Download the pre-release VSIX
   - Publish it as stable to the marketplace
   - Create/update the GitHub release

This ensures the exact tested build is promoted without rebuilding.

## Changelog Configuration

The release workflow uses `.github/changelog-config.json` to categorize pull requests in release notes. Update this file to customize changelog generation.

## Best Practices

1. Always run CI before merging to main
2. Use semantic versioning for releases
3. Create pre-releases for testing before stable releases
4. Keep your `VSCE_PAT` secret updated and secure
5. Tag releases consistently with `v` prefix (e.g., `v1.0.0`)
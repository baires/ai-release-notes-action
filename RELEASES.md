# Release Process

This document describes the release process for the AI-Powered Release Notes Action.

## 🚀 Creating a Release

### Option 1: Automated Release Script (Recommended)

1. **Ensure you're on main branch with clean working directory**
2. **Run the release script:**
   ```bash
   ./scripts/release.sh 1.0.0
   ```
3. **Monitor the automated workflow** at [GitHub Actions](https://github.com/baires/ai-release-notes-action/actions)

### Option 2: Manual GitHub Workflow Trigger

1. **Go to [Actions > Release](https://github.com/baires/ai-release-notes-action/actions/workflows/release.yml)**
2. **Click "Run workflow"**
3. **Enter version** (e.g., `v1.0.0`) and select release type
4. **Click "Run workflow"**

### Option 3: Automatic on Package.json Changes

1. **Update `package.json` version**
2. **Commit and push to main branch**
3. **Release workflow will automatically trigger**

## 📦 Publishing to GitHub Marketplace

After a release is created, follow these steps to publish to the marketplace:

1. **Go to the [Releases page](https://github.com/baires/ai-release-notes-action/releases)**
2. **Find your release and click "Edit"**
3. **Check "📦 Publish this Action to the GitHub Marketplace"**
4. **Fill in the marketplace information:**

### Marketplace Details

**Primary Category:** Continuous Integration  
**Secondary Category:** Project Management

**Keywords:**
```
ai, release-notes, automation, slack, gemini, vertex-ai, changelog, versioning, github-action, notifications
```

**Description:**
```
AI-powered GitHub Action that automatically generates intelligent release notes using Google's Gemini AI, with optional Slack notifications, GitHub releases, and changelog management.
```

5. **Submit for publication**

## 🏷️ Version Tagging Strategy

- **Full versions**: `v1.0.0`, `v1.1.0`, `v2.0.0`
- **Major versions**: `v1`, `v2` (automatically updated to point to latest)
- **Usage in workflows**:
  - `baires/ai-release-notes-action@v1.0.14` (specific version)
  - `baires/ai-release-notes-action@v1` (latest v1.x.x)

## 📋 Release Checklist

### Pre-Release
- [ ] All tests passing
- [ ] Distribution files built (`npm run build`)
- [ ] Version bumped in `package.json`
- [ ] CHANGELOG.md updated (if applicable)
- [ ] Documentation updated

### Release Creation
- [ ] Git tag created (`v1.0.0`)
- [ ] GitHub release created with notes
- [ ] Major version tag updated (`v1`)
- [ ] Distribution files included

### Post-Release
- [ ] Marketplace publication submitted
- [ ] Release announcement (if applicable)
- [ ] Documentation links updated
- [ ] Example workflows tested

## 🔄 Automated Release Workflow

The release workflow (`release.yml`) handles:

1. **Version Detection** - From manual input or package.json changes
2. **Testing** - Runs full test suite  
3. **Building** - Creates distribution files
4. **Documentation Updates** - Automatically updates all version references
5. **Version Verification** - Ensures all references are updated consistently
6. **Tagging** - Creates semantic version tags
7. **Release Creation** - Generates release notes and GitHub release
8. **Major Version Update** - Updates `v1`, `v2` tags to point to latest
9. **Marketplace Guidance** - Creates issue with publication checklist

### 📝 Automatic Version Reference Updates

Every release automatically updates version references in:
- All example workflows (`examples/*.yml`)
- README.md usage examples
- RELEASES.md documentation
- Any other documentation files

**Version Update Strategy:**
- **Specific versions**: Updated to exact release version (e.g., `@v1.0.0`, `@v1.1.0`)
- **Major versions**: Updated to current major version (e.g., `@v1`, `@v2`)
- **Consistency**: All references within a file maintain the same version style

## 🛠️ Release Files

The following files are involved in the release process:

- `package.json` - Version source of truth
- `action.yml` - Action metadata
- `dist/` - Built distribution files (required for marketplace)
- `CHANGELOG.md` - Manual changelog (optional)
- `scripts/release.sh` - Release automation script
- `scripts/verify-versions.sh` - Version consistency verification script
- `.github/workflows/release.yml` - Automated release workflow
- `.github/workflows/marketplace-publish.yml` - Marketplace validation

## 🔧 Troubleshooting

### "Tag already exists"
```bash
# Delete tag locally and remotely
git tag -d v1.0.0
git push --delete origin v1.0.0
```

### "Distribution files out of date"
```bash
# Rebuild and commit
npm run build
git add dist/
git commit -m "chore: rebuild distribution files"
```

### "Tests failing"
```bash
# Fix tests and re-run
npm test
# Or run specific test
npm test -- core.test.js
```

### "Version references inconsistent"
```bash
# Check version reference consistency
./scripts/verify-versions.sh

# Check against specific version
./scripts/verify-versions.sh v1.0.0

# Fix all version references automatically
./scripts/release.sh 1.0.0
```

### "Mixed version references in documentation"
```bash
# Manually update specific files
sed -i 's|baires/ai-release-notes-action@v1[0-9]*\.[0-9]*\.[0-9]*|baires/ai-release-notes-action@v1.0.14|g' README.md

# Or use the release script to update everything
./scripts/release.sh 1.0.0
```

## 📚 Resources

- [GitHub Actions - Publishing to Marketplace](https://docs.github.com/en/actions/creating-actions/publishing-actions-in-github-marketplace)
- [Semantic Versioning](https://semver.org/)
- [Action Metadata Syntax](https://docs.github.com/en/actions/creating-actions/metadata-syntax-for-github-actions)
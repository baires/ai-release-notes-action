#!/bin/bash

# Release script for AI-Powered Release Notes Action
# Usage: ./scripts/release.sh [version]

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Helper functions
info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

success() {
    echo -e "${GREEN}✅ $1${NC}"
}

warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

error() {
    echo -e "${RED}❌ $1${NC}"
    exit 1
}

# Check if we're on main branch
current_branch=$(git branch --show-current)
if [ "$current_branch" != "main" ]; then
    error "Must be on main branch to create release. Current branch: $current_branch"
fi

# Check if working directory is clean
if [ -n "$(git status --porcelain)" ]; then
    error "Working directory is not clean. Please commit or stash changes."
fi

# Get version
if [ $# -eq 1 ]; then
    VERSION="$1"
else
    echo "Enter the release version (e.g., 1.0.0, 1.1.0):"
    read VERSION
fi

# Validate version format
if ! echo "$VERSION" | grep -qE '^[0-9]+\.[0-9]+\.[0-9]+$'; then
    error "Invalid version format. Use semantic versioning (e.g., 1.0.0)"
fi

# Add v prefix
VTAG="v$VERSION"

# Check if tag already exists
if git rev-parse "$VTAG" >/dev/null 2>&1; then
    error "Tag $VTAG already exists"
fi

info "Preparing release $VTAG..."

# Update package.json version
info "Updating package.json version to $VERSION..."
sed -i.bak "s/\"version\": \"[^\"]*\"/\"version\": \"$VERSION\"/" package.json
rm package.json.bak

# Run tests
info "Running tests..."
npm test

# Build the action
info "Building action..."
npm run build

# Check if dist directory has changes
if [ -n "$(git status --porcelain dist/)" ]; then
    info "Distribution files changed, adding to commit..."
    git add dist/
fi

# Commit version bump
info "Committing version bump..."
git add package.json
git commit -m "chore: bump version to $VERSION

Prepare for release $VTAG

- Update package.json version
- Rebuild distribution files
- Ready for marketplace publication"

# Create and push tag
info "Creating and pushing tag $VTAG..."
git tag -a "$VTAG" -m "Release $VTAG

AI-Powered Release Notes Generator $VTAG

This release includes:
- Complete GitHub Action for AI-powered release notes generation
- Support for Gemini API and Vertex AI
- Modular design with optional Slack, releases, and changelog features
- Comprehensive test suite
- Ready for GitHub Marketplace publication

Usage:
- uses: baires/ai-release-notes-action@$VTAG
  with:
    gemini_api_key: \${{ secrets.GEMINI_API_KEY }}"

# Push changes and tag
info "Pushing changes and tag..."
git push origin main
git push origin "$VTAG"

success "Release $VTAG created successfully!"
success "GitHub Actions will automatically create the release."

echo ""
info "Next steps:"
echo "1. 🔍 Monitor the release workflow: https://github.com/baires/ai-release-notes-action/actions"
echo "2. 📝 Check the generated release: https://github.com/baires/ai-release-notes-action/releases"
echo "3. 🚀 Publish to marketplace:"
echo "   - Go to the release page"
echo "   - Click 'Edit release'"  
echo "   - Check 'Publish this Action to the GitHub Marketplace'"
echo "   - Fill in categories and keywords"
echo "   - Submit for publication"
echo ""
echo "4. 📱 The action will be available as:"
echo "   - baires/ai-release-notes-action@$VTAG"
echo "   - baires/ai-release-notes-action@v${VERSION%%.*}"
echo ""

success "Release process completed! 🎉"
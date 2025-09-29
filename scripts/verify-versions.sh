#!/bin/bash

# Version consistency verification script
# Usage: ./scripts/verify-versions.sh [expected-version]

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
}

# Get expected version
if [ $# -eq 1 ]; then
    EXPECTED_VERSION="$1"
    if [[ ! $EXPECTED_VERSION == v* ]]; then
        EXPECTED_VERSION="v$EXPECTED_VERSION"
    fi
else
    # Try to get from package.json
    if [ -f "package.json" ]; then
        PKG_VERSION=$(node -p "require('./package.json').version" 2>/dev/null || echo "")
        if [ -n "$PKG_VERSION" ]; then
            EXPECTED_VERSION="v$PKG_VERSION"
        fi
    fi
fi

if [ -z "$EXPECTED_VERSION" ]; then
    info "No expected version provided. Checking for consistency only."
    CHECK_CONSISTENCY_ONLY=true
else
    info "Checking version references against expected version: $EXPECTED_VERSION"
    EXPECTED_MAJOR=$(echo $EXPECTED_VERSION | sed 's/\(v[0-9]*\).*/\1/')
    CHECK_CONSISTENCY_ONLY=false
fi

echo "🔍 Scanning for version references..."

# Find all version references (excluding sed patterns in documentation)
ALL_REFS_RAW=$(find examples/ README.md RELEASES.md -type f 2>/dev/null -exec grep -Hn "baires/ai-release-notes-action@v[0-9]*\(\.[0-9]*\.[0-9]*\)\?" {} \; | grep -v "sed -i" | sort)

# Also check for GitHub URL references in source code
SRC_REFS_RAW=$(find src/ -name "*.js" -type f 2>/dev/null -exec grep -Hn "github.com/baires/ai-release-notes-action" {} \; | sort || true)

echo "📋 Found action version references:"
if [ -n "$ALL_REFS_RAW" ]; then
    echo "$ALL_REFS_RAW"
else
    echo "  (none found in documentation)"
fi
echo ""

echo "📋 Found GitHub URL references in source:"
if [ -n "$SRC_REFS_RAW" ]; then
    echo "$SRC_REFS_RAW"
else
    echo "  (none found in source code)"
fi
echo ""

if [ -z "$ALL_REFS_RAW" ] && [ -z "$SRC_REFS_RAW" ]; then
    warning "No action references found at all"
    exit 0
fi

# Extract just the version tags
ALL_REFS=$(echo "$ALL_REFS_RAW" | grep -o "baires/ai-release-notes-action@v[0-9]*\(\.[0-9]*\.[0-9]*\)\?" | sort | uniq)

echo "📊 Unique version references:"
echo "$ALL_REFS" | sed 's/^/  /'
echo ""

# Count different patterns
TOTAL_REFS=$(echo "$ALL_REFS" | wc -l | tr -d ' ')
SPECIFIC_VERSIONS=$(echo "$ALL_REFS" | grep '@v[0-9]*\.[0-9]*\.[0-9]*' || true)
MAJOR_VERSIONS=$(echo "$ALL_REFS" | grep '@v[0-9]*$' || true)

SPECIFIC_COUNT=$(echo "$SPECIFIC_VERSIONS" | grep -v '^$' | wc -l | tr -d ' ')
MAJOR_COUNT=$(echo "$MAJOR_VERSIONS" | grep -v '^$' | wc -l | tr -d ' ')

info "Reference type breakdown:"
echo "  📍 Specific versions (v1.0.0): $SPECIFIC_COUNT"
echo "  🔖 Major versions (v1): $MAJOR_COUNT"
echo "  📊 Total references: $TOTAL_REFS"
echo ""

# Check consistency
CONSISTENCY_ISSUES=0

if [ "$CHECK_CONSISTENCY_ONLY" = "false" ]; then
    # Check against expected version
    info "Checking against expected version $EXPECTED_VERSION..."
    
    if [ -n "$SPECIFIC_VERSIONS" ]; then
        WRONG_SPECIFIC=$(echo "$SPECIFIC_VERSIONS" | grep -v "@$EXPECTED_VERSION" || true)
        if [ -n "$WRONG_SPECIFIC" ]; then
            error "Found incorrect specific version references:"
            echo "$WRONG_SPECIFIC" | sed 's/^/  /'
            CONSISTENCY_ISSUES=$((CONSISTENCY_ISSUES + 1))
        else
            success "All specific version references match $EXPECTED_VERSION"
        fi
    fi
    
    if [ -n "$MAJOR_VERSIONS" ]; then
        WRONG_MAJOR=$(echo "$MAJOR_VERSIONS" | grep -v "@$EXPECTED_MAJOR" || true)
        if [ -n "$WRONG_MAJOR" ]; then
            error "Found incorrect major version references:"
            echo "$WRONG_MAJOR" | sed 's/^/  /'
            CONSISTENCY_ISSUES=$((CONSISTENCY_ISSUES + 1))
        else
            success "All major version references match $EXPECTED_MAJOR"
        fi
    fi
else
    # Just check internal consistency
    info "Checking internal consistency..."
    
    if [ "$SPECIFIC_COUNT" -gt 1 ]; then
        UNIQUE_SPECIFIC=$(echo "$SPECIFIC_VERSIONS" | sort | uniq | wc -l | tr -d ' ')
        if [ "$UNIQUE_SPECIFIC" -gt 1 ]; then
            error "Found multiple different specific versions:"
            echo "$SPECIFIC_VERSIONS" | sort | uniq | sed 's/^/  /'
            CONSISTENCY_ISSUES=$((CONSISTENCY_ISSUES + 1))
        fi
    fi
    
    if [ "$MAJOR_COUNT" -gt 1 ]; then
        UNIQUE_MAJOR=$(echo "$MAJOR_VERSIONS" | sort | uniq | wc -l | tr -d ' ')
        if [ "$UNIQUE_MAJOR" -gt 1 ]; then
            error "Found multiple different major versions:"
            echo "$MAJOR_VERSIONS" | sort | uniq | sed 's/^/  /'
            CONSISTENCY_ISSUES=$((CONSISTENCY_ISSUES + 1))
        fi
    fi
fi

# Check for mixed version styles in same file
info "Checking for mixed version styles within files..."
while IFS= read -r line; do
    file=$(echo "$line" | cut -d':' -f1)
    version=$(echo "$line" | grep -o "baires/ai-release-notes-action@v[0-9]*\(\.[0-9]*\.[0-9]*\)\?")
    echo "$file:$version"
done <<< "$ALL_REFS_RAW" | sort > /tmp/file_versions.txt

# Group by file and check consistency within each file
cut -d':' -f1 /tmp/file_versions.txt | sort | uniq | while read -r file; do
    FILE_VERSIONS=$(grep "^$file:" /tmp/file_versions.txt | cut -d':' -f2- | sort | uniq)
    VERSION_COUNT=$(echo "$FILE_VERSIONS" | wc -l | tr -d ' ')
    
    if [ "$VERSION_COUNT" -gt 1 ]; then
        warning "File $file has mixed version references:"
        echo "$FILE_VERSIONS" | sed 's/^/  /'
        CONSISTENCY_ISSUES=$((CONSISTENCY_ISSUES + 1))
    fi
done

rm -f /tmp/file_versions.txt

echo ""
echo "📈 Verification Summary:"
echo "========================"

if [ "$CONSISTENCY_ISSUES" -eq 0 ]; then
    success "All version references are consistent! ✨"
    if [ "$CHECK_CONSISTENCY_ONLY" = "false" ]; then
        success "All references match expected version $EXPECTED_VERSION"
    fi
else
    error "Found $CONSISTENCY_ISSUES consistency issue(s)"
    echo ""
    echo "🛠️  To fix version references, run:"
    echo "   ./scripts/release.sh [version]"
    echo "   OR update manually and commit changes"
    exit 1
fi

echo ""
info "Files checked:"
echo "  - examples/*.yml (action usage)"
echo "  - README.md (action usage)"
echo "  - RELEASES.md (action usage)"
echo "  - src/*.js (GitHub URL references)"

success "Version verification completed successfully! 🎉"
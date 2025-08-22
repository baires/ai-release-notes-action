# AI-Powered Release Notes Generator

[![GitHub Super-Linter](https://github.com/baires/ai-release-notes-action/workflows/Lint%20Code%20Base/badge.svg)](https://github.com/marketplace/actions/super-linter)
[![CI](https://github.com/baires/ai-release-notes-action/actions/workflows/ci.yml/badge.svg)](https://github.com/baires/ai-release-notes-action/actions/workflows/ci.yml)

A powerful GitHub Action that automatically generates intelligent release notes using AI, with optional integrations for Slack notifications, GitHub releases, and changelog management.

## ✨ Features

- 🤖 **AI-Powered**: Uses Google's Gemini AI or Vertex AI to generate intelligent, context-aware release notes
- 📋 **Modular Design**: Enable/disable features as needed - releases, changelogs, Slack notifications
- 🎯 **Smart Triggers**: Configurable labels and branch targeting
- 🔄 **Multi-Environment**: Support for dev, staging, and production deployments
- 📝 **Changelog Management**: Automatic changelog updates following Keep a Changelog format
- 💬 **Slack Integration**: Rich notifications with environment-specific channels
- 🏷️ **Smart Versioning**: Automatic semantic versioning with customizable strategies
- 🔗 **Rich Context**: Includes PR links, commit references, and change analysis
- 📊 **Fallback System**: Template-based generation when AI is unavailable

## 🚀 Quick Start

### Basic Usage

```yaml
name: Generate Release Notes
on:
  pull_request:
    types: [closed]
    branches: [main]

jobs:
  release-notes:
    if: github.event.pull_request.merged == true && contains(github.event.pull_request.labels.*.name, 'release-notes')
    runs-on: ubuntu-latest
    permissions:
      contents: write
      pull-requests: write
    
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
          
      - uses: baires/ai-release-notes-action@v1
        with:
          gemini_api_key: ${{ secrets.GEMINI_API_KEY }}
```

### Full Configuration

```yaml
- uses: baires/ai-release-notes-action@v1
  with:
    # Core Configuration
    trigger_label: 'release-notes'
    target_branch: 'main'
    environment: 'PROD'
    
    # AI Configuration
    gemini_api_key: ${{ secrets.GEMINI_API_KEY }}
    # OR use Vertex AI
    use_vertex_ai: true
    gcp_project_id: ${{ vars.GOOGLE_CLOUD_PROJECT }}
    
    # Version Management
    version_strategy: 'auto'  # patch, minor, major, auto
    version_prefix: 'v'
    
    # GitHub Release
    create_release: true
    release_draft: false
    
    # Changelog
    update_changelog: true
    changelog_file: 'CHANGELOG.md'
    
    # Slack Notifications
    enable_slack: true
    slack_webhook_url: ${{ secrets.SLACK_WEBHOOK_URL }}
    slack_channel: 'releases'
    slack_mention_users: 'engineering-team'
```

## 📖 Configuration Options

### Core Settings

| Input | Description | Default | Required |
|-------|-------------|---------|----------|
| `trigger_label` | Label required on PR to trigger release notes | `release-notes` | No |
| `target_branch` | Target branch for release | `main` | No |
| `environment` | Deployment environment (PROD, DEV, STAGING) | `PROD` | No |

### AI Configuration

| Input | Description | Default | Required |
|-------|-------------|---------|----------|
| `gemini_api_key` | Gemini API key for AI generation | | No |
| `use_vertex_ai` | Use Vertex AI instead of Gemini API | `false` | No |
| `gcp_project_id` | Google Cloud Project ID (for Vertex AI) | | No |
| `gcp_location` | Google Cloud Location | `us-central1` | No |
| `custom_prompt` | Custom AI prompt template | | No |

### Version Management

| Input | Description | Default | Required |
|-------|-------------|---------|----------|
| `version_strategy` | Version increment: patch, minor, major, auto | `patch` | No |
| `version_prefix` | Version prefix (e.g., v, release-) | `v` | No |

### GitHub Release

| Input | Description | Default | Required |
|-------|-------------|---------|----------|
| `create_release` | Create GitHub release | `true` | No |
| `release_draft` | Create as draft | `false` | No |
| `release_prerelease` | Mark as prerelease | `false` | No |

### Changelog

| Input | Description | Default | Required |
|-------|-------------|---------|----------|
| `update_changelog` | Update CHANGELOG.md | `true` | No |
| `changelog_file` | Path to changelog file | `CHANGELOG.md` | No |

### Slack Notifications

| Input | Description | Default | Required |
|-------|-------------|---------|----------|
| `enable_slack` | Enable Slack notifications | `false` | No |
| `slack_webhook_url` | Slack webhook URL | | No* |
| `slack_channel` | Slack channel name | | No |
| `slack_mention_users` | Users to mention (comma-separated) | | No |
| `slack_mention_groups` | Groups to mention (comma-separated) | | No |

*Required when `enable_slack` is `true`

### Advanced Options

| Input | Description | Default | Required |
|-------|-------------|---------|----------|
| `include_commit_links` | Include commit links in notes | `true` | No |
| `include_pr_links` | Include PR links in notes | `true` | No |
| `max_commits_fallback` | Max commits in fallback generation | `10` | No |
| `skip_if_no_changes` | Skip if no significant changes | `false` | No |
| `output_format` | Output format: markdown, html, json | `markdown` | No |

## 🔧 Setup Guide

### 1. GitHub Repository Setup

1. **Permissions**: Ensure your workflow has proper permissions:
   ```yaml
   permissions:
     contents: write      # For creating releases and tags
     pull-requests: write # For creating changelog PRs
     issues: read        # For reading PR information
   ```

2. **Fetch Depth**: Always use `fetch-depth: 0` to get full git history:
   ```yaml
   - uses: actions/checkout@v4
     with:
       fetch-depth: 0
   ```

### 2. AI Configuration

#### Option A: Gemini API (Recommended for simplicity)

1. Get API key from [Google AI Studio](https://makersuite.google.com/app/apikey)
2. Add as repository secret: `GEMINI_API_KEY`

#### Option B: Vertex AI (Recommended for production)

1. Set up Google Cloud Project with Vertex AI enabled
2. Configure Workload Identity Federation:
   ```yaml
   - uses: google-github-actions/auth@v2
     with:
       workload_identity_provider: ${{ vars.GCP_WIF_PROVIDER }}
       service_account: ${{ vars.SERVICE_ACCOUNT_EMAIL }}
   ```

### 3. Slack Setup (Optional)

1. Create Slack app and add incoming webhook
2. Add webhook URL as repository secret: `SLACK_WEBHOOK_URL`
3. Configure channels and mentions as needed

### 4. Workflow Triggers

The action triggers on merged PRs with the specified label:

```yaml
on:
  pull_request:
    types: [closed]
    branches: [main, dev]

jobs:
  release-notes:
    if: github.event.pull_request.merged == true && contains(github.event.pull_request.labels.*.name, 'release-notes')
```

## 🎨 Custom Prompts

Customize AI generation with custom prompts:

```yaml
custom_prompt: |
  You are a technical writer for our SaaS platform.
  
  Context: This is a ${environment} deployment.
  Version: ${version}
  PR Title: ${prTitle}
  Author: ${prAuthor}
  
  Generate user-friendly release notes focusing on:
  - Customer impact
  - Business value
  - Clear, non-technical language
  
  Format the response as requested.
```

Available variables:
- `${version}` - New version number
- `${previousVersion}` - Previous version
- `${environment}` - Deployment environment
- `${buildNumber}` - Generated build number
- `${prTitle}` - Pull request title
- `${prAuthor}` - Pull request author
- `${changeTypes}` - Detected change types

## 📊 Outputs

The action provides these outputs:

| Output | Description |
|--------|-------------|
| `version` | Generated version number |
| `previous_version` | Previous version number |
| `release_notes` | Generated release notes content |
| `release_url` | URL of created GitHub release |
| `tag_name` | Created git tag name |
| `build_number` | Generated build number |
| `changelog_updated` | Whether changelog was updated |
| `slack_sent` | Whether Slack notification was sent |
| `commits_analyzed` | Number of commits analyzed |
| `ai_generated` | Whether release notes were AI-generated |

Use outputs in subsequent steps:

```yaml
- name: Generate Release Notes
  id: release-notes
  uses: baires/ai-release-notes-action@v1
  with:
    gemini_api_key: ${{ secrets.GEMINI_API_KEY }}

- name: Use outputs
  run: |
    echo "Generated version: ${{ steps.release-notes.outputs.version }}"
    echo "Release URL: ${{ steps.release-notes.outputs.release_url }}"
    echo "AI Generated: ${{ steps.release-notes.outputs.ai_generated }}"
```

## 🔄 Multi-Environment Support

Handle different environments with dynamic configuration:

```yaml
- name: Determine Environment
  id: env
  run: |
    BRANCH="${{ github.event.pull_request.base.ref }}"
    if [ "$BRANCH" = "main" ]; then
      echo "environment=PROD" >> $GITHUB_OUTPUT
      echo "create_release=true" >> $GITHUB_OUTPUT
      echo "slack_webhook=${{ secrets.SLACK_WEBHOOK_PROD }}" >> $GITHUB_OUTPUT
    else
      echo "environment=DEV" >> $GITHUB_OUTPUT
      echo "create_release=false" >> $GITHUB_OUTPUT
      echo "slack_webhook=${{ secrets.SLACK_WEBHOOK_DEV }}" >> $GITHUB_OUTPUT
    fi

- uses: baires/ai-release-notes-action@v1
  with:
    environment: ${{ steps.env.outputs.environment }}
    create_release: ${{ steps.env.outputs.create_release }}
    slack_webhook_url: ${{ steps.env.outputs.slack_webhook }}
```

## 📝 Examples

See the [`examples/`](./examples/) directory for complete workflow examples:

- [Basic Usage](./examples/basic-usage.yml) - Minimal setup
- [Full Featured](./examples/full-featured.yml) - All features enabled
- [Vertex AI](./examples/vertex-ai.yml) - Using Google Cloud Vertex AI
- [Slack Only](./examples/slack-only.yml) - Notifications only

## 🛠️ Development

### Local Testing

1. Clone the repository:
   ```bash
   git clone https://github.com/baires/ai-release-notes-action.git
   cd ai-release-notes-action
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Run tests:
   ```bash
   npm test
   ```

4. Build the action:
   ```bash
   npm run build
   ```

### Project Structure

```
/
├── action.yml           # Action metadata
├── src/
│   ├── main.js         # Entry point
│   ├── modules/        # Feature modules
│   │   ├── release-notes.js
│   │   ├── slack.js
│   │   ├── github-release.js
│   │   ├── changelog.js
│   │   └── versioning.js
│   └── utils/          # Utility modules
│       ├── config.js
│       ├── git.js
│       └── pr-analyzer.js
├── dist/               # Compiled distribution
├── examples/           # Example workflows
└── README.md
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Make your changes and add tests
4. Run tests: `npm test`
5. Build: `npm run build`
6. Commit changes: `git commit -m 'Add amazing feature'`
7. Push to branch: `git push origin feature/amazing-feature`
8. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🆘 Support

- 🐛 [Bug Reports](https://github.com/baires/ai-release-notes-action/issues)
- 💡 [Feature Requests](https://github.com/baires/ai-release-notes-action/issues)
- 💬 [Discussions](https://github.com/baires/ai-release-notes-action/discussions)

## 🙏 Acknowledgments

- [Google Gemini](https://deepmind.google/technologies/gemini/) for AI capabilities
- [GitHub Actions](https://github.com/features/actions) for the platform
- [Keep a Changelog](https://keepachangelog.com/) for changelog format
- [Semantic Versioning](https://semver.org/) for version management

---

Made with ❤️ for the developer community
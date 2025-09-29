const core = require('@actions/core');

class Config {
  constructor() {
    this.inputs = this.loadInputs();
    this.validate();
  }

  loadInputs() {
    return {
      // Core Configuration
      triggerLabel: core.getInput('trigger_label'),
      targetBranch: core.getInput('target_branch') || 'main',
      
      // AI Configuration
      geminiApiKey: core.getInput('gemini_api_key'),
      customPrompt: core.getInput('custom_prompt'),
      
      // Version Management
      versionStrategy: core.getInput('version_strategy') || 'patch',
      versionPrefix: core.getInput('version_prefix') || 'v',
      
      // Environment
      environment: core.getInput('environment') || 'PROD',
      
      // GitHub Release
      createRelease: core.getBooleanInput('create_release'),
      releaseDraft: core.getBooleanInput('release_draft'),
      releasePrerelease: core.getBooleanInput('release_prerelease'),
      
      // Changelog
      updateChangelog: core.getBooleanInput('update_changelog'),
      changelogFile: core.getInput('changelog_file') || 'CHANGELOG.md',
      
      // Slack
      enableSlack: core.getBooleanInput('enable_slack'),
      slackWebhookUrl: core.getInput('slack_webhook_url'),
      slackChannel: core.getInput('slack_channel'),
      slackMentionUsers: core.getInput('slack_mention_users'),
      slackMentionGroups: core.getInput('slack_mention_groups'),
      
      // Git
      gitUserName: core.getInput('git_user_name') || 'github-actions[bot]',
      gitUserEmail: core.getInput('git_user_email') || 'github-actions[bot]@users.noreply.github.com',
      
      // Advanced Options
      skipIfNoChanges: core.getBooleanInput('skip_if_no_changes'),
      includeCommitLinks: core.getBooleanInput('include_commit_links'),
      includePrLinks: core.getBooleanInput('include_pr_links'),
      maxCommitsFallback: parseInt(core.getInput('max_commits_fallback')) || 10,
      outputFormat: core.getInput('output_format') || 'markdown',
      
      // GCP Configuration
      gcpProjectId: core.getInput('gcp_project_id'),
      gcpLocation: core.getInput('gcp_location') || 'us-central1',
      gcpWorkloadIdentityProvider: core.getInput('gcp_workload_identity_provider'),
      gcpServiceAccount: core.getInput('gcp_service_account'),
      useVertexAi: core.getBooleanInput('use_vertex_ai')
    };
  }

  validate() {
    const errors = [];

    // Validate version strategy
    const validVersionStrategies = ['patch', 'minor', 'major', 'auto'];
    if (!validVersionStrategies.includes(this.inputs.versionStrategy)) {
      errors.push(`Invalid version_strategy: ${this.inputs.versionStrategy}. Must be one of: ${validVersionStrategies.join(', ')}`);
    }

    // Validate output format
    const validOutputFormats = ['markdown', 'html', 'json'];
    if (!validOutputFormats.includes(this.inputs.outputFormat)) {
      errors.push(`Invalid output_format: ${this.inputs.outputFormat}. Must be one of: ${validOutputFormats.join(', ')}`);
    }

    // Validate Slack configuration
    if (this.inputs.enableSlack) {
      if (!this.inputs.slackWebhookUrl) {
        errors.push('slack_webhook_url is required when enable_slack is true');
      }
    }

    // Validate AI configuration
    if (!this.inputs.geminiApiKey && !this.inputs.useVertexAi) {
      core.warning('No AI configuration provided. Release notes will use fallback generation.');
    }

    // Validate Vertex AI configuration
    if (this.inputs.useVertexAi) {
      if (!this.inputs.gcpProjectId) {
        errors.push('gcp_project_id is required when use_vertex_ai is true');
      }
      if (!this.inputs.gcpWorkloadIdentityProvider && !this.inputs.geminiApiKey) {
        errors.push('Either gcp_workload_identity_provider or gemini_api_key is required when use_vertex_ai is true');
      }
    }

    if (errors.length > 0) {
      throw new Error(`Configuration validation failed:\n${errors.join('\n')}`);
    }
  }

  // Getters for easy access
  get isSlackEnabled() {
    return this.inputs.enableSlack && this.inputs.slackWebhookUrl;
  }

  get isReleaseEnabled() {
    return this.inputs.createRelease;
  }

  get isChangelogEnabled() {
    return this.inputs.updateChangelog;
  }

  get isAiEnabled() {
    return this.inputs.geminiApiKey || this.inputs.useVertexAi;
  }

  get isProductionEnvironment() {
    return this.inputs.environment.toLowerCase() === 'prod';
  }
}

module.exports = Config;
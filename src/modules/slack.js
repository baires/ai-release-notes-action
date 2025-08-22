const core = require('@actions/core');
const github = require('@actions/github');
const axios = require('axios');

class SlackNotifier {
  constructor(config) {
    this.config = config;
    this.context = github.context;
  }

  async sendNotification(releaseNotes, versionInfo, prAnalysis) {
    if (!this.config.isSlackEnabled) {
      core.info('Slack notifications disabled, skipping');
      return { sent: false, reason: 'disabled' };
    }

    try {
      core.info(`Sending Slack notification to ${this.config.inputs.slackChannel || 'webhook channel'}`);
      
      const message = this.buildSlackMessage(releaseNotes.slackMessage, versionInfo, prAnalysis);
      const payload = this.buildSlackPayload(message);
      
      const response = await this.sendToSlack(payload);
      
      if (response.success) {
        core.info('✅ Slack notification sent successfully');
        return { sent: true, response: response.data };
      } else {
        core.error(`❌ Slack notification failed: ${response.error}`);
        return { sent: false, reason: response.error };
      }
    } catch (error) {
      core.error(`Failed to send Slack notification: ${error.message}`);
      return { sent: false, reason: error.message };
    }
  }

  buildSlackMessage(baseMessage, versionInfo, prAnalysis) {
    let message = baseMessage;
    
    // Add links based on environment
    const prLink = this.context.payload.pull_request?.html_url;
    const repoUrl = `${this.context.serverUrl}/${this.context.repo.owner}/${this.context.repo.repo}`;
    
    if (this.config.isProductionEnvironment && this.config.isReleaseEnabled) {
      // Production release with full links
      const releaseLink = `${repoUrl}/releases/tag/${versionInfo.tagName}`;
      const changesLink = `${repoUrl}/compare/${versionInfo.previousVersion}...${versionInfo.tagName}`;
      
      message += `\n\n🔗 View release: ${releaseLink}`;
      message += `\n📝 View changes: ${changesLink}`;
      if (prLink) {
        message += `\n🔀 PR: ${prLink}`;
      }
    } else {
      // Development build with PR and commit links
      const commitLink = `${repoUrl}/commit/${this.context.sha}`;
      
      if (prLink) {
        message += `\n\n🔀 PR: ${prLink}`;
      }
      message += `\n💻 Commit: ${commitLink}`;
    }
    
    // Add mentions if specified
    const mentions = this.buildMentions();
    if (mentions) {
      message += `\n\n${mentions}`;
    }
    
    return message;
  }

  buildMentions() {
    const mentions = [];
    
    // Add user mentions
    if (this.config.inputs.slackMentionUsers) {
      const users = this.config.inputs.slackMentionUsers
        .split(',')
        .map(user => user.trim())
        .filter(user => user.length > 0)
        .map(user => user.startsWith('@') ? user : `@${user}`);
      
      mentions.push(...users);
    }
    
    // Add group mentions
    if (this.config.inputs.slackMentionGroups) {
      const groups = this.config.inputs.slackMentionGroups
        .split(',')
        .map(group => group.trim())
        .filter(group => group.length > 0)
        .map(group => group.startsWith('<!') ? group : `<!${group}>`);
      
      mentions.push(...groups);
    }
    
    return mentions.length > 0 ? mentions.join(' ') : '';
  }

  buildSlackPayload(message) {
    const payload = {
      text: message
    };
    
    // Add channel if specified (for webhook URLs that support it)
    if (this.config.inputs.slackChannel) {
      payload.channel = this.config.inputs.slackChannel.startsWith('#') 
        ? this.config.inputs.slackChannel 
        : `#${this.config.inputs.slackChannel}`;
    }
    
    // Add additional formatting for rich messages
    payload.attachments = [
      {
        color: this.getMessageColor(),
        fields: [
          {
            title: 'Environment',
            value: this.config.inputs.environment,
            short: true
          },
          {
            title: 'Repository',
            value: `${this.context.repo.owner}/${this.context.repo.repo}`,
            short: true
          }
        ],
        footer: 'AI Release Notes Generator',
        ts: Math.floor(Date.now() / 1000)
      }
    ];
    
    return payload;
  }

  getMessageColor() {
    switch (this.config.inputs.environment.toLowerCase()) {
      case 'prod':
      case 'production':
        return 'good'; // Green
      case 'staging':
        return 'warning'; // Yellow
      case 'dev':
      case 'development':
        return '#36a64f'; // Custom green
      default:
        return '#439FE0'; // Blue
    }
  }

  async sendToSlack(payload) {
    try {
      const response = await axios.post(
        this.config.inputs.slackWebhookUrl,
        payload,
        {
          headers: {
            'Content-Type': 'application/json'
          },
          timeout: 10000 // 10 second timeout
        }
      );
      
      if (response.status === 200) {
        return {
          success: true,
          data: response.data
        };
      } else {
        return {
          success: false,
          error: `HTTP ${response.status}: ${response.statusText}`
        };
      }
    } catch (error) {
      let errorMessage = 'Unknown error';
      
      if (error.response) {
        // Server responded with error status
        errorMessage = `HTTP ${error.response.status}: ${error.response.data || error.response.statusText}`;
      } else if (error.request) {
        // Request was made but no response received
        errorMessage = 'No response received from Slack';
      } else {
        // Something else happened
        errorMessage = error.message;
      }
      
      return {
        success: false,
        error: errorMessage
      };
    }
  }

  // Utility method to validate Slack webhook URL
  validateWebhookUrl(url) {
    if (!url) return false;
    
    const slackWebhookPattern = /^https:\/\/hooks\.slack\.com\/services\/[A-Z0-9]+\/[A-Z0-9]+\/[a-zA-Z0-9]+$/;
    return slackWebhookPattern.test(url);
  }

  // Utility method to escape Slack formatting
  escapeSlackText(text) {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  // Method to send a test message
  async sendTestMessage() {
    if (!this.config.isSlackEnabled) {
      return { sent: false, reason: 'Slack notifications disabled' };
    }

    const testMessage = {
      text: '🧪 Test message from AI Release Notes Generator',
      attachments: [
        {
          color: 'good',
          fields: [
            {
              title: 'Status',
              value: 'Configuration test successful',
              short: false
            }
          ]
        }
      ]
    };

    return await this.sendToSlack(testMessage);
  }
}

module.exports = SlackNotifier;
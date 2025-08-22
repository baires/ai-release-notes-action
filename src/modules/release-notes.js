const core = require('@actions/core');
const exec = require('@actions/exec');
const fs = require('fs');
const path = require('path');

class ReleaseNotesGenerator {
  constructor(config) {
    this.config = config;
  }

  async generateReleaseNotes(prAnalysis, versionInfo) {
    try {
      core.info('Generating release notes...');
      
      let releaseNotes = '';
      let slackMessage = '';
      let aiGenerated = false;
      
      // Try AI generation first if enabled
      if (this.config.isAiEnabled) {
        try {
          const aiResult = await this.generateWithAI(prAnalysis, versionInfo);
          if (aiResult.success) {
            releaseNotes = aiResult.releaseNotes;
            slackMessage = aiResult.slackMessage;
            aiGenerated = true;
            core.info('Successfully generated release notes with AI');
          } else {
            core.warning('AI generation failed, falling back to template-based generation');
          }
        } catch (error) {
          core.warning(`AI generation error: ${error.message}, using fallback`);
        }
      }
      
      // Fallback to template-based generation
      if (!aiGenerated) {
        const templateResult = this.generateFromTemplate(prAnalysis, versionInfo);
        releaseNotes = templateResult.releaseNotes;
        slackMessage = templateResult.slackMessage;
      }
      
      // Save generated files
      await this.saveReleaseNotes(releaseNotes, slackMessage);
      
      return {
        releaseNotes,
        slackMessage,
        aiGenerated,
        buildNumber: versionInfo.buildNumber
      };
    } catch (error) {
      core.error(`Failed to generate release notes: ${error.message}`);
      throw error;
    }
  }

  async generateWithAI(prAnalysis, versionInfo) {
    try {
      const prompt = this.buildAIPrompt(prAnalysis, versionInfo);
      const geminiResult = await this.callGeminiCLI(prompt);
      
      if (geminiResult.success && geminiResult.output) {
        const parsed = this.parseAIResponse(geminiResult.output, versionInfo.buildNumber);
        return {
          success: true,
          releaseNotes: parsed.releaseNotes,
          slackMessage: parsed.slackMessage
        };
      }
      
      return { success: false };
    } catch (error) {
      core.warning(`AI generation failed: ${error.message}`);
      return { success: false };
    }
  }

  buildAIPrompt(prAnalysis, versionInfo) {
    const customPrompt = this.config.inputs.customPrompt;
    
    if (customPrompt) {
      return this.interpolateTemplate(customPrompt, prAnalysis, versionInfo);
    }
    
    return `You are an expert technical writer. Analyze the PR changes and generate release notes.

First, read the PR information:
cat pr_details.json
cat pr_diff.txt

Generate release notes for version ${versionInfo.newVersion} in ${this.config.inputs.environment} environment.
Use BUILD_NUMBER as the build identifier.

PR Analysis Summary:
- Title: ${prAnalysis.analysis.title}
- Type: ${prAnalysis.analysis.changeTypes.join(', ')}
- Files changed: ${prAnalysis.analysis.filesChanged.length}
- Breaking changes: ${prAnalysis.analysis.isBreakingChange ? 'Yes' : 'No'}
- Bug fixes: ${prAnalysis.analysis.isBugfix ? 'Yes' : 'No'}
- New features: ${prAnalysis.analysis.isFeature ? 'Yes' : 'No'}

Format your response as:

RELEASE_NOTES_START
## v${versionInfo.newVersion} - BUILD_NUMBER [${this.config.inputs.environment}]

### Public
[User-facing changes in plain language]

### Internal
[Technical changes with details]
RELEASE_NOTES_END

SLACK_MESSAGE_START
🚀 *v${versionInfo.newVersion} - BUILD_NUMBER [${this.config.inputs.environment}]*

*Public Changes:*
• [User-facing bullet points]

*Internal Changes:*
• [Technical bullet points, max 5]
SLACK_MESSAGE_END`;
  }

  async callGeminiCLI(prompt) {
    try {
      // Prepare Gemini CLI configuration
      const geminiSettings = {
        maxSessionTurns: 10,
        telemetry: {
          enabled: false,
          target: 'gcp'
        }
      };

      // Write prompt to temporary file to avoid command line length limits
      const promptFile = path.join(process.cwd(), 'gemini_prompt.txt');
      await fs.promises.writeFile(promptFile, prompt);

      let geminiCommand = [];
      let geminiEnv = { ...process.env };

      if (this.config.inputs.useVertexAi) {
        // Use Vertex AI
        geminiCommand = [
          'gemini-cli',
          '--project', this.config.inputs.gcpProjectId,
          '--location', this.config.inputs.gcpLocation,
          '--settings', JSON.stringify(geminiSettings),
          '--prompt-file', promptFile
        ];

        if (this.config.inputs.gcpServiceAccount) {
          geminiEnv.GOOGLE_SERVICE_ACCOUNT = this.config.inputs.gcpServiceAccount;
        }
      } else {
        // Use Gemini API
        geminiCommand = [
          'gemini-cli',
          '--api-key', this.config.inputs.geminiApiKey,
          '--settings', JSON.stringify(geminiSettings),
          '--prompt-file', promptFile
        ];
      }

      let output = '';
      let errorOutput = '';

      const options = {
        listeners: {
          stdout: (data) => {
            output += data.toString();
          },
          stderr: (data) => {
            errorOutput += data.toString();
          }
        },
        env: geminiEnv,
        silent: true,
        ignoreReturnCode: true
      };

      const exitCode = await exec.exec(geminiCommand[0], geminiCommand.slice(1), options);

      // Clean up prompt file
      try {
        await fs.promises.unlink(promptFile);
      } catch (e) {
        // Ignore cleanup errors
      }

      if (exitCode === 0 && output.trim()) {
        return {
          success: true,
          output: output.trim()
        };
      } else {
        core.warning(`Gemini CLI failed with exit code ${exitCode}`);
        if (errorOutput) {
          core.warning(`Error output: ${errorOutput}`);
        }
        return { success: false };
      }
    } catch (error) {
      core.warning(`Failed to call Gemini CLI: ${error.message}`);
      return { success: false };
    }
  }

  parseAIResponse(aiOutput, buildNumber) {
    try {
      let releaseNotes = '';
      let slackMessage = '';

      // Extract release notes
      const releaseNotesMatch = aiOutput.match(/RELEASE_NOTES_START\s*\n([\s\S]*?)\nRELEASE_NOTES_END/);
      if (releaseNotesMatch) {
        releaseNotes = releaseNotesMatch[1].trim();
      }

      // Extract Slack message
      const slackMessageMatch = aiOutput.match(/SLACK_MESSAGE_START\s*\n([\s\S]*?)\nSLACK_MESSAGE_END/);
      if (slackMessageMatch) {
        slackMessage = slackMessageMatch[1].trim();
      }

      // Replace BUILD_NUMBER placeholder
      releaseNotes = releaseNotes.replace(/BUILD_NUMBER/g, buildNumber);
      slackMessage = slackMessage.replace(/BUILD_NUMBER/g, buildNumber);

      // Validate we got both sections
      if (!releaseNotes || !slackMessage) {
        throw new Error('Failed to parse AI response - missing sections');
      }

      return { releaseNotes, slackMessage };
    } catch (error) {
      core.warning(`Failed to parse AI response: ${error.message}`);
      throw error;
    }
  }

  generateFromTemplate(prAnalysis, versionInfo) {
    const buildNumber = versionInfo.buildNumber;
    const version = versionInfo.newVersion;
    const environment = this.config.inputs.environment;

    // Generate release notes based on analysis
    let publicChanges = 'General improvements and bug fixes';
    let internalChanges = [];

    if (prAnalysis.analysis.isBreakingChange) {
      publicChanges = 'Breaking changes - please review migration notes';
    } else if (prAnalysis.analysis.isFeature) {
      publicChanges = 'New features and enhancements';
    } else if (prAnalysis.analysis.isBugfix) {
      publicChanges = 'Bug fixes and stability improvements';
    }

    // Add commit-based internal changes
    if (prAnalysis.commits && prAnalysis.commits.length > 0) {
      internalChanges = prAnalysis.commits
        .slice(0, this.config.inputs.maxCommitsFallback)
        .map(commit => {
          let message = commit.message.split('\n')[0]; // First line only
          if (this.config.inputs.includeCommitLinks) {
            message += ` ([${commit.shortSha}](${commit.url}))`;
          }
          return message;
        });
    }

    if (internalChanges.length === 0) {
      internalChanges = ['Various code improvements and maintenance'];
    }

    // Build release notes
    const releaseNotes = `## v${version} - ${buildNumber} [${environment}]

### Public
${publicChanges}

### Internal
${internalChanges.map(change => `- ${change}`).join('\n')}`;

    // Build Slack message
    const slackCommits = prAnalysis.commits
      ? prAnalysis.commits.slice(0, 3).map(commit => commit.message.split('\n')[0])
      : ['Various improvements'];

    const slackMessage = `🚀 *v${version} - ${buildNumber} [${environment}]*

*Changes:*
${slackCommits.map(change => `• ${change}`).join('\n')}`;

    return { releaseNotes, slackMessage };
  }

  async saveReleaseNotes(releaseNotes, slackMessage) {
    try {
      await fs.promises.writeFile(
        path.join(process.cwd(), 'release-notes.md'),
        releaseNotes
      );

      await fs.promises.writeFile(
        path.join(process.cwd(), 'slack-message.txt'),
        slackMessage
      );

      core.info('Saved release notes and Slack message files');
    } catch (error) {
      core.error(`Failed to save release notes files: ${error.message}`);
      throw error;
    }
  }

  interpolateTemplate(template, prAnalysis, versionInfo) {
    return template
      .replace(/\$\{version\}/g, versionInfo.newVersion)
      .replace(/\$\{previousVersion\}/g, versionInfo.previousVersion)
      .replace(/\$\{environment\}/g, this.config.inputs.environment)
      .replace(/\$\{buildNumber\}/g, versionInfo.buildNumber)
      .replace(/\$\{prTitle\}/g, prAnalysis.analysis.title)
      .replace(/\$\{prAuthor\}/g, prAnalysis.analysis.author)
      .replace(/\$\{changeTypes\}/g, prAnalysis.analysis.changeTypes.join(', '));
  }
}

module.exports = ReleaseNotesGenerator;
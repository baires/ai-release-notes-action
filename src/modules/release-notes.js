const core = require('@actions/core');
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
      const geminiResult = await this.callGeminiAPI(prompt);
      
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
    
    const commits = prAnalysis.commits && prAnalysis.commits.length > 0
      ? prAnalysis.commits.map(c => `  - ${c.message.split('\n')[0]} (${c.shortSha})`).join('\n')
      : 'No commit details available';

    return `Analyze this pull request and write specific, concrete release notes.

PR DETAILS:
Title: ${prAnalysis.analysis.title}
Description: ${prAnalysis.analysis.body || 'No description'}
Type: ${prAnalysis.analysis.changeTypes.join(', ') || 'general changes'}
Files: ${prAnalysis.analysis.filesChanged.slice(0, 10).join(', ') || 'No files listed'}
Breaking: ${prAnalysis.analysis.isBreakingChange ? 'Yes' : 'No'}
Bug fix: ${prAnalysis.analysis.isBugfix ? 'Yes' : 'No'}
Feature: ${prAnalysis.analysis.isFeature ? 'Yes' : 'No'}

COMMITS:
${commits}

Write release notes based on the ACTUAL changes above. Extract real information from the title, description, files, and commits.

Example (do NOT copy this, write your own based on actual PR data):
If PR title is "Add user authentication with OAuth", write:
"- Added OAuth-based authentication for user login"
NOT "- [Add authentication feature]" or "- User-facing authentication improvements"

Format EXACTLY as shown (but with real content):

RELEASE_NOTES_START
## v${versionInfo.newVersion} - BUILD_NUMBER [${this.config.inputs.environment}]

### Public
- [Real user-facing change from PR title/description]
- [Another specific change if applicable]

### Internal
- [Specific technical change from commits/files]
- [Another technical detail]
- [More details as relevant]
RELEASE_NOTES_END

SLACK_MESSAGE_START
Hey team! 👋 Just deployed **v${versionInfo.newVersion}** to **${this.config.inputs.environment}**.

**What changed:**
• [Specific change from PR - be concrete]
• [Another concrete change]

**Testing notes:**
• [Real testing instruction if needed, or remove this section]
SLACK_MESSAGE_END`;
  }

  async callGeminiAPI(prompt) {
    try {
      if (this.config.inputs.useVertexAi) {
        return await this.callVertexAI(prompt);
      }

      // Use Gemini API with official SDK
      const apiKey = this.config.inputs.geminiApiKey;
      if (!apiKey) {
        core.warning('No Gemini API key provided');
        return { success: false };
      }

      const { GoogleGenAI } = require('@google/genai');
      const ai = new GoogleGenAI({ apiKey: apiKey });

      core.info('Calling Gemini API...');
      const response = await ai.models.generateContent({
        model: 'gemini-2.0-flash-exp',
        contents: prompt,
        systemInstruction: 'You are an expert technical writer who creates concise, specific release notes. Never use placeholders or generic text.',
        config: {
          temperature: 0.4,
          topK: 20,
          topP: 0.8,
          maxOutputTokens: 2048
        }
      });

      const output = response.text;

      if (output) {
        return {
          success: true,
          output: output.trim()
        };
      } else {
        core.warning('Gemini API returned empty response');
        return { success: false };
      }
    } catch (error) {
      core.warning(`Failed to call Gemini API: ${error.message}`);
      if (error.response?.data) {
        core.warning(`API Error: ${JSON.stringify(error.response.data)}`);
      }
      return { success: false };
    }
  }

  async callVertexAI(prompt) {
    try {
      const axios = require('axios');
      const { GoogleAuth } = require('google-auth-library');

      const auth = new GoogleAuth({
        scopes: ['https://www.googleapis.com/auth/cloud-platform']
      });

      const client = await auth.getClient();
      const projectId = this.config.inputs.gcpProjectId;
      const location = this.config.inputs.gcpLocation;

      const url = `https://${location}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${location}/publishers/google/models/gemini-1.5-flash:generateContent`;

      const accessToken = await client.getAccessToken();

      const requestBody = {
        contents: [{
          role: 'user',
          parts: [{
            text: prompt
          }]
        }],
        generationConfig: {
          temperature: 0.7,
          topK: 40,
          topP: 0.95,
          maxOutputTokens: 2048
        }
      };

      core.info('Calling Vertex AI...');
      const response = await axios.post(url, requestBody, {
        headers: {
          'Authorization': `Bearer ${accessToken.token}`,
          'Content-Type': 'application/json'
        },
        timeout: 30000
      });

      if (response.data?.candidates?.[0]?.content?.parts?.[0]?.text) {
        const output = response.data.candidates[0].content.parts[0].text;
        return {
          success: true,
          output: output.trim()
        };
      } else {
        core.warning('Vertex AI returned unexpected response format');
        return { success: false };
      }
    } catch (error) {
      core.warning(`Failed to call Vertex AI: ${error.message}`);
      if (error.response?.data) {
        core.warning(`API Error: ${JSON.stringify(error.response.data)}`);
      }
      return { success: false };
    }
  }

  parseAIResponse(aiOutput, buildNumber) {
    try {
      // Log the raw AI output for debugging
      core.info('AI Response length: ' + aiOutput.length);
      core.info('AI Response preview: ' + aiOutput.substring(0, 200));

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

      // If markers not found, try to use the entire output as both
      if (!releaseNotes && !slackMessage) {
        core.warning('AI response markers not found, using full response');
        // Use the full output for both
        releaseNotes = aiOutput;
        slackMessage = this.extractSlackSummary(aiOutput, buildNumber);
      } else if (!releaseNotes) {
        releaseNotes = aiOutput;
      } else if (!slackMessage) {
        slackMessage = this.extractSlackSummary(releaseNotes, buildNumber);
      }

      // Replace BUILD_NUMBER placeholder
      releaseNotes = releaseNotes.replace(/BUILD_NUMBER/g, buildNumber);
      slackMessage = slackMessage.replace(/BUILD_NUMBER/g, buildNumber);

      return { releaseNotes, slackMessage };
    } catch (error) {
      core.warning(`Failed to parse AI response: ${error.message}`);
      throw error;
    }
  }

  extractSlackSummary(text, buildNumber) {
    // Extract first few lines or create a simple summary
    const lines = text.split('\n').filter(line => line.trim());
    const summary = lines.slice(0, 5).join('\n');
    return `🚀 Build ${buildNumber} deployed\n\n${summary}`;
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
    const commits = prAnalysis.commits && prAnalysis.commits.length > 0
      ? prAnalysis.commits.map(c => `  - ${c.message.split('\n')[0]} (${c.shortSha})`).join('\n')
      : 'No commit details available';

    const files = prAnalysis.analysis.filesChanged.slice(0, 10).join(', ') || 'No files listed';

    // Build full context with PR data
    const prContext = `
PR INFORMATION:
- Title: ${prAnalysis.analysis.title}
- Description: ${prAnalysis.analysis.body || 'No description'}
- Author: ${prAnalysis.analysis.author}
- Type: ${prAnalysis.analysis.changeTypes.join(', ') || 'general changes'}
- Files changed: ${files}
- Breaking change: ${prAnalysis.analysis.isBreakingChange ? 'Yes' : 'No'}
- Bug fix: ${prAnalysis.analysis.isBugfix ? 'Yes' : 'No'}
- New feature: ${prAnalysis.analysis.isFeature ? 'Yes' : 'No'}

COMMITS:
${commits}

USER INSTRUCTIONS:
${template}

Generate output in this format:

RELEASE_NOTES_START
[Your release notes here]
RELEASE_NOTES_END

SLACK_MESSAGE_START
[Your Slack message here]
SLACK_MESSAGE_END
`;

    return prContext
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
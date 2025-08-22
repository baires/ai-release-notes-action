const core = require('@actions/core');
const fs = require('fs');
const path = require('path');

class ChangelogManager {
  constructor(config) {
    this.config = config;
  }

  async updateChangelog(releaseNotes, versionInfo, prAnalysis) {
    if (!this.config.isChangelogEnabled) {
      core.info('Changelog updates disabled, skipping');
      return { updated: false, reason: 'disabled' };
    }

    try {
      core.info(`Updating changelog: ${this.config.inputs.changelogFile}`);
      
      const changelogPath = path.resolve(this.config.inputs.changelogFile);
      
      // Ensure changelog exists
      await this.ensureChangelogExists(changelogPath);
      
      // Read current changelog
      const currentContent = await fs.promises.readFile(changelogPath, 'utf-8');
      
      // Generate new entry
      const newEntry = this.formatChangelogEntry(releaseNotes.releaseNotes, versionInfo, prAnalysis);
      
      // Insert new entry
      const updatedContent = this.insertEntry(currentContent, newEntry);
      
      // Write updated changelog
      await fs.promises.writeFile(changelogPath, updatedContent);
      
      core.info(`✅ Successfully updated ${this.config.inputs.changelogFile}`);
      
      return {
        updated: true,
        path: changelogPath,
        entry: newEntry
      };
    } catch (error) {
      core.error(`Failed to update changelog: ${error.message}`);
      return { updated: false, reason: error.message };
    }
  }

  async ensureChangelogExists(changelogPath) {
    try {
      await fs.promises.access(changelogPath);
    } catch (error) {
      // File doesn't exist, create it
      core.info(`Creating new changelog file: ${changelogPath}`);
      
      const initialContent = this.createInitialChangelog();
      await fs.promises.writeFile(changelogPath, initialContent);
    }
  }

  createInitialChangelog() {
    const repoName = `${process.env.GITHUB_REPOSITORY || 'Repository'}`;
    
    return `# Changelog

All notable changes to ${repoName} will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

`;
  }

  formatChangelogEntry(releaseNotesContent, versionInfo, prAnalysis) {
    const date = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
    const version = versionInfo.newVersion;
    const environment = this.config.inputs.environment !== 'PROD' ? ` [${this.config.inputs.environment}]` : '';
    
    let entry = `## [${version}]${environment} - ${date}\n`;
    
    // Parse release notes content to extract sections
    const sections = this.parseReleaseNotesForChangelog(releaseNotesContent);
    
    if (sections.public && sections.public.trim()) {
      entry += `\n### Changed\n${sections.public}\n`;
    }
    
    if (sections.internal && sections.internal.trim()) {
      entry += `\n### Internal\n${sections.internal}\n`;
    }
    
    // Add metadata if available
    if (prAnalysis?.analysis) {
      const analysis = prAnalysis.analysis;
      
      // Add breaking changes section
      if (analysis.isBreakingChange) {
        entry += `\n### ⚠️ Breaking Changes\n- This release contains breaking changes. Please review the migration guide.\n`;
      }
      
      // Add additional context based on change types
      if (analysis.changeTypes.includes('feature')) {
        entry += this.extractFeatures(sections.internal);
      }
      
      if (analysis.changeTypes.includes('bugfix')) {
        entry += this.extractBugfixes(sections.internal);
      }
    }
    
    // Add links if enabled
    if (this.config.inputs.includePrLinks || this.config.inputs.includeCommitLinks) {
      const links = this.formatChangelogLinks(versionInfo, prAnalysis);
      if (links) {
        entry += `\n${links}\n`;
      }
    }
    
    return entry + '\n';
  }

  parseReleaseNotesForChangelog(releaseNotesContent) {
    const sections = { public: '', internal: '' };
    
    // Extract sections from release notes
    const publicMatch = releaseNotesContent.match(/### Public\s*\n([\s\S]*?)(?=\n### |\n---|\n$)/);
    if (publicMatch) {
      sections.public = publicMatch[1].trim();
    }
    
    const internalMatch = releaseNotesContent.match(/### Internal\s*\n([\s\S]*?)(?=\n### |\n---|\n$)/);
    if (internalMatch) {
      sections.internal = internalMatch[1].trim();
    }
    
    return sections;
  }

  extractFeatures(internalContent) {
    const features = [];
    const lines = internalContent.split('\n');
    
    for (const line of lines) {
      if (line.toLowerCase().includes('feat') || 
          line.toLowerCase().includes('add') || 
          line.toLowerCase().includes('new')) {
        features.push(line.replace(/^[-*]\s*/, '- '));
      }
    }
    
    return features.length > 0 ? `\n### Added\n${features.join('\n')}\n` : '';
  }

  extractBugfixes(internalContent) {
    const bugfixes = [];
    const lines = internalContent.split('\n');
    
    for (const line of lines) {
      if (line.toLowerCase().includes('fix') || 
          line.toLowerCase().includes('bug') || 
          line.toLowerCase().includes('resolve')) {
        bugfixes.push(line.replace(/^[-*]\s*/, '- '));
      }
    }
    
    return bugfixes.length > 0 ? `\n### Fixed\n${bugfixes.join('\n')}\n` : '';
  }

  formatChangelogLinks(versionInfo, prAnalysis) {
    const links = [];
    
    if (this.config.inputs.includePrLinks && prAnalysis?.pr) {
      links.push(`**Pull Request:** [#${prAnalysis.number}](${prAnalysis.pr.html_url})`);
    }
    
    if (versionInfo.previousVersion) {
      const repoUrl = `${process.env.GITHUB_SERVER_URL || 'https://github.com'}/${process.env.GITHUB_REPOSITORY}`;
      const compareUrl = `${repoUrl}/compare/${versionInfo.previousVersion}...${versionInfo.tagName}`;
      links.push(`**Full Changelog:** [${versionInfo.previousVersion}...${versionInfo.tagName}](${compareUrl})`);
    }
    
    return links.length > 0 ? `\n**Links:**\n${links.map(link => `- ${link}`).join('\n')}` : '';
  }

  insertEntry(currentContent, newEntry) {
    // Find where to insert the new entry (after the header but before the first existing entry)
    const lines = currentContent.split('\n');
    const insertIndex = this.findInsertionPoint(lines);
    
    // Insert the new entry
    lines.splice(insertIndex, 0, newEntry);
    
    return lines.join('\n');
  }

  findInsertionPoint(lines) {
    // Look for the first version entry or the end of the header
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      // Found an existing version entry
      if (line.match(/^##\s+\[?\d+\.\d+\.\d+/)) {
        return i;
      }
      
      // If we've passed the header and found content, insert here
      if (i > 5 && line && !line.startsWith('#') && !line.startsWith('The format is')) {
        return i;
      }
    }
    
    // If no existing entries found, append to the end
    return lines.length;
  }

  async validateChangelog(changelogPath = null) {
    const filePath = changelogPath || path.resolve(this.config.inputs.changelogFile);
    
    try {
      const content = await fs.promises.readFile(filePath, 'utf-8');
      const issues = [];
      
      // Check for header
      if (!content.includes('# Changelog')) {
        issues.push('Missing main heading "# Changelog"');
      }
      
      // Check for version entries
      const versionMatches = content.match(/^##\s+\[?\d+\.\d+\.\d+/gm);
      if (!versionMatches || versionMatches.length === 0) {
        issues.push('No version entries found');
      }
      
      // Check for dates
      const dateMatches = content.match(/\d{4}-\d{2}-\d{2}/g);
      if (!dateMatches || dateMatches.length === 0) {
        issues.push('No dates found in version entries');
      }
      
      return {
        valid: issues.length === 0,
        issues,
        versionCount: versionMatches ? versionMatches.length : 0
      };
    } catch (error) {
      return {
        valid: false,
        issues: [`Failed to read changelog: ${error.message}`],
        versionCount: 0
      };
    }
  }

  async backupChangelog(changelogPath = null) {
    const filePath = changelogPath || path.resolve(this.config.inputs.changelogFile);
    const backupPath = `${filePath}.backup.${Date.now()}`;
    
    try {
      await fs.promises.copyFile(filePath, backupPath);
      core.info(`Created changelog backup: ${backupPath}`);
      return backupPath;
    } catch (error) {
      core.warning(`Failed to backup changelog: ${error.message}`);
      return null;
    }
  }

  async generateChangelogFromGitHistory(fromTag, toTag = 'HEAD') {
    // This could be expanded to generate a full changelog from git history
    // For now, it's a placeholder for future enhancement
    core.info(`Would generate changelog from ${fromTag} to ${toTag}`);
    return {
      generated: false,
      reason: 'Not implemented - use AI generation instead'
    };
  }
}

module.exports = ChangelogManager;
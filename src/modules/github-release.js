const core = require('@actions/core');
const github = require('@actions/github');
const fs = require('fs');
const path = require('path');

class GitHubReleaseManager {
  constructor(config, token) {
    this.config = config;
    this.octokit = github.getOctokit(token);
    this.context = github.context;
  }

  async createRelease(releaseNotes, versionInfo, prAnalysis) {
    if (!this.config.isReleaseEnabled) {
      core.info('GitHub releases disabled, skipping');
      return { created: false, reason: 'disabled' };
    }

    try {
      core.info(`Creating GitHub release ${versionInfo.tagName}`);
      
      // Create the release
      const releaseData = await this.buildReleaseData(releaseNotes, versionInfo, prAnalysis);
      const { data: release } = await this.octokit.rest.repos.createRelease(releaseData);
      
      core.info(`✅ Successfully created release: ${release.html_url}`);
      
      // Set outputs
      core.setOutput('release_url', release.html_url);
      core.setOutput('tag_name', versionInfo.tagName);
      
      return {
        created: true,
        release,
        url: release.html_url
      };
    } catch (error) {
      core.error(`Failed to create GitHub release: ${error.message}`);
      
      // Check if it's a tag already exists error
      if (error.message.includes('already_exists')) {
        core.warning('Release tag already exists, attempting to update existing release');
        return await this.updateExistingRelease(releaseNotes, versionInfo, prAnalysis);
      }
      
      return { created: false, reason: error.message };
    }
  }

  async buildReleaseData(releaseNotes, versionInfo, prAnalysis) {
    const releaseName = this.buildReleaseName(versionInfo, prAnalysis);
    const releaseBody = await this.buildReleaseBody(releaseNotes.releaseNotes, versionInfo, prAnalysis);
    
    return {
      owner: this.context.repo.owner,
      repo: this.context.repo.repo,
      tag_name: versionInfo.tagName,
      target_commitish: this.context.sha,
      name: releaseName,
      body: releaseBody,
      draft: this.config.inputs.releaseDraft,
      prerelease: this.config.inputs.releasePrerelease || !this.config.isProductionEnvironment
    };
  }

  buildReleaseName(versionInfo, prAnalysis) {
    const version = versionInfo.tagName;
    const environment = this.config.inputs.environment !== 'PROD' ? ` [${this.config.inputs.environment}]` : '';
    
    // Use PR title if it's descriptive, otherwise use a generic name
    let titleSuffix = '';
    if (prAnalysis?.analysis?.title && prAnalysis.analysis.title.length > 10) {
      titleSuffix = ` - ${prAnalysis.analysis.title}`;
    }
    
    return `Release ${version}${environment}${titleSuffix}`;
  }

  async buildReleaseBody(releaseNotesContent, versionInfo, prAnalysis) {
    let body = releaseNotesContent;
    
    // Add metadata section
    const metadata = this.buildMetadataSection(versionInfo, prAnalysis);
    body += `\n\n${metadata}`;
    
    // Add links section if enabled
    if (this.config.inputs.includePrLinks || this.config.inputs.includeCommitLinks) {
      const links = await this.buildLinksSection(versionInfo, prAnalysis);
      if (links) {
        body += `\n\n${links}`;
      }
    }
    
    // Add footer
    body += '\n\n---\n*Generated with [AI Release Notes Generator](https://github.com/baires/ai-release-notes-action)*';
    
    return body;
  }

  buildMetadataSection(versionInfo, prAnalysis) {
    const lines = ['## Release Information'];
    
    lines.push(`**Version:** ${versionInfo.newVersion}`);
    lines.push(`**Environment:** ${this.config.inputs.environment}`);
    lines.push(`**Build:** ${versionInfo.buildNumber}`);
    
    if (versionInfo.previousVersion) {
      lines.push(`**Previous Version:** ${versionInfo.previousVersion}`);
    }
    
    if (prAnalysis?.analysis) {
      const analysis = prAnalysis.analysis;
      
      if (analysis.changeTypes.length > 0) {
        lines.push(`**Change Types:** ${analysis.changeTypes.join(', ')}`);
      }
      
      if (analysis.filesChanged.length > 0) {
        lines.push(`**Files Changed:** ${analysis.filesChanged.length}`);
      }
      
      if (analysis.isBreakingChange) {
        lines.push('**⚠️ Breaking Changes:** Yes');
      }
    }
    
    return lines.join('\n');
  }

  async buildLinksSection(versionInfo, prAnalysis) {
    const lines = ['## Links'];
    
    // Add PR link
    if (this.config.inputs.includePrLinks && prAnalysis?.pr) {
      lines.push(`**Pull Request:** [#${prAnalysis.number}](${prAnalysis.pr.html_url})`);
    }
    
    // Add comparison link
    if (versionInfo.previousVersion) {
      const compareUrl = `${this.context.serverUrl}/${this.context.repo.owner}/${this.context.repo.repo}/compare/${versionInfo.previousVersion}...${versionInfo.tagName}`;
      lines.push(`**Full Changelog:** [${versionInfo.previousVersion}...${versionInfo.tagName}](${compareUrl})`);
    }
    
    // Add commit links
    if (this.config.inputs.includeCommitLinks && prAnalysis?.commits) {
      const commitLinks = prAnalysis.commits
        .slice(0, 5) // Limit to first 5 commits
        .map(commit => `- [${commit.shortSha}](${commit.url}) ${commit.message.split('\n')[0]}`)
        .join('\n');
      
      if (commitLinks) {
        lines.push('**Recent Commits:**');
        lines.push(commitLinks);
      }
    }
    
    return lines.length > 1 ? lines.join('\n') : null;
  }

  async updateExistingRelease(releaseNotes, versionInfo, prAnalysis) {
    try {
      // Get the existing release
      const { data: existingRelease } = await this.octokit.rest.repos.getReleaseByTag({
        owner: this.context.repo.owner,
        repo: this.context.repo.repo,
        tag: versionInfo.tagName
      });
      
      // Update the release
      const updateData = {
        owner: this.context.repo.owner,
        repo: this.context.repo.repo,
        release_id: existingRelease.id,
        name: this.buildReleaseName(versionInfo, prAnalysis),
        body: await this.buildReleaseBody(releaseNotes.releaseNotes, versionInfo, prAnalysis),
        draft: this.config.inputs.releaseDraft,
        prerelease: this.config.inputs.releasePrerelease || !this.config.isProductionEnvironment
      };
      
      const { data: updatedRelease } = await this.octokit.rest.repos.updateRelease(updateData);
      
      core.info(`✅ Successfully updated existing release: ${updatedRelease.html_url}`);
      
      return {
        created: true,
        updated: true,
        release: updatedRelease,
        url: updatedRelease.html_url
      };
    } catch (error) {
      core.error(`Failed to update existing release: ${error.message}`);
      return { created: false, reason: error.message };
    }
  }

  async createPullRequestForChangelog(versionInfo, changelogUpdated) {
    if (!changelogUpdated || !this.config.isProductionEnvironment) {
      return { created: false, reason: 'not needed' };
    }

    try {
      const branchName = `release/${versionInfo.tagName}`;
      const title = `[skip ci] chore: update changelog for release ${versionInfo.tagName}`;
      const body = `Automated changelog update for release ${versionInfo.tagName}`;
      
      const { data: pr } = await this.octokit.rest.pulls.create({
        owner: this.context.repo.owner,
        repo: this.context.repo.repo,
        title,
        body,
        head: branchName,
        base: this.config.inputs.targetBranch
      });
      
      core.info(`✅ Created changelog PR: ${pr.html_url}`);
      
      return {
        created: true,
        pr,
        url: pr.html_url
      };
    } catch (error) {
      core.error(`Failed to create changelog PR: ${error.message}`);
      return { created: false, reason: error.message };
    }
  }

  async deleteRelease(tagName) {
    try {
      const { data: release } = await this.octokit.rest.repos.getReleaseByTag({
        owner: this.context.repo.owner,
        repo: this.context.repo.repo,
        tag: tagName
      });
      
      await this.octokit.rest.repos.deleteRelease({
        owner: this.context.repo.owner,
        repo: this.context.repo.repo,
        release_id: release.id
      });
      
      core.info(`Deleted release for tag: ${tagName}`);
      return true;
    } catch (error) {
      core.warning(`Failed to delete release for tag ${tagName}: ${error.message}`);
      return false;
    }
  }

  async listReleases(page = 1, perPage = 30) {
    try {
      const { data: releases } = await this.octokit.rest.repos.listReleases({
        owner: this.context.repo.owner,
        repo: this.context.repo.repo,
        page,
        per_page: perPage
      });
      
      return releases;
    } catch (error) {
      core.error(`Failed to list releases: ${error.message}`);
      return [];
    }
  }

  async uploadReleaseAssets(releaseId, assets) {
    const uploadedAssets = [];
    
    for (const asset of assets) {
      try {
        const assetData = await fs.promises.readFile(asset.path);
        
        const { data: uploadedAsset } = await this.octokit.rest.repos.uploadReleaseAsset({
          owner: this.context.repo.owner,
          repo: this.context.repo.repo,
          release_id: releaseId,
          name: asset.name,
          data: assetData,
          headers: {
            'content-type': asset.contentType || 'application/octet-stream',
            'content-length': assetData.length
          }
        });
        
        uploadedAssets.push(uploadedAsset);
        core.info(`✅ Uploaded asset: ${asset.name}`);
      } catch (error) {
        core.error(`Failed to upload asset ${asset.name}: ${error.message}`);
      }
    }
    
    return uploadedAssets;
  }
}

module.exports = GitHubReleaseManager;
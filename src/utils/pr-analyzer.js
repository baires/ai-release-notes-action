const github = require('@actions/github');
const core = require('@actions/core');
const fs = require('fs');
const path = require('path');

class PRAnalyzer {
  constructor(config, token) {
    this.config = config;
    this.octokit = github.getOctokit(token);
    this.context = github.context;
  }

  async analyzePR() {
    try {
      const prNumber = this.context.payload.pull_request?.number;
      if (!prNumber) {
        throw new Error('No PR number found in context');
      }

      core.info(`Analyzing PR #${prNumber}`);

      // Get PR details
      const { data: pr } = await this.octokit.rest.pulls.get({
        owner: this.context.repo.owner,
        repo: this.context.repo.repo,
        pull_request_number: prNumber
      });

      // Get PR diff
      const diff = await this.getPRDiff(prNumber);
      
      // Get PR commits
      const commits = await this.getPRCommits(prNumber);
      
      // Analyze changes
      const analysis = this.analyzeChanges(pr, diff, commits);
      
      // Save analysis files for AI processing
      await this.saveAnalysisFiles(pr, diff, commits, analysis);
      
      return {
        pr,
        diff,
        commits,
        analysis,
        number: prNumber
      };
    } catch (error) {
      core.error(`Failed to analyze PR: ${error.message}`);
      throw error;
    }
  }

  async getPRDiff(prNumber) {
    try {
      const { data: diff } = await this.octokit.rest.pulls.get({
        owner: this.context.repo.owner,
        repo: this.context.repo.repo,
        pull_request_number: prNumber,
        mediaType: {
          format: 'diff'
        }
      });
      
      return diff;
    } catch (error) {
      core.warning(`Failed to get PR diff: ${error.message}`);
      return 'No diff available';
    }
  }

  async getPRCommits(prNumber) {
    try {
      const { data: commits } = await this.octokit.rest.pulls.listCommits({
        owner: this.context.repo.owner,
        repo: this.context.repo.repo,
        pull_request_number: prNumber
      });
      
      return commits.map(commit => ({
        sha: commit.sha,
        shortSha: commit.sha.substring(0, 7),
        message: commit.commit.message,
        author: commit.commit.author.name,
        email: commit.commit.author.email,
        date: commit.commit.author.date,
        url: commit.html_url
      }));
    } catch (error) {
      core.warning(`Failed to get PR commits: ${error.message}`);
      return [];
    }
  }

  analyzeChanges(pr, diff, commits = []) {
    const analysis = {
      title: pr.title,
      body: pr.body || '',
      labels: (pr.labels || []).map(label => label.name),
      baseBranch: pr.base?.ref || 'unknown',
      headBranch: pr.head?.ref || 'unknown',
      author: pr.user?.login || 'unknown',
      createdAt: pr.created_at,
      mergedAt: pr.merged_at,
      filesChanged: [],
      changeTypes: new Set(),
      isBreakingChange: false,
      isBugfix: false,
      isFeature: false,
      isChore: false
    };

    // Analyze commit messages for conventional commits
    (commits || []).forEach(commit => {
      const message = commit.message.toLowerCase();
      
      if (message.includes('breaking change') || message.includes('!:')) {
        analysis.isBreakingChange = true;
        analysis.changeTypes.add('breaking');
      }
      
      if (message.startsWith('feat')) {
        analysis.isFeature = true;
        analysis.changeTypes.add('feature');
      }
      
      if (message.startsWith('fix')) {
        analysis.isBugfix = true;
        analysis.changeTypes.add('bugfix');
      }
      
      if (message.startsWith('chore') || message.startsWith('ci') || message.startsWith('docs')) {
        analysis.isChore = true;
        analysis.changeTypes.add('chore');
      }
    });

    // Analyze labels
    analysis.labels.forEach(label => {
      const lowerLabel = label.toLowerCase();
      
      if (lowerLabel.includes('breaking')) {
        analysis.isBreakingChange = true;
        analysis.changeTypes.add('breaking');
      }
      
      if (lowerLabel.includes('bug') || lowerLabel.includes('fix')) {
        analysis.isBugfix = true;
        analysis.changeTypes.add('bugfix');
      }
      
      if (lowerLabel.includes('feature') || lowerLabel.includes('enhancement')) {
        analysis.isFeature = true;
        analysis.changeTypes.add('feature');
      }
    });

    // Analyze diff for file changes
    if (diff && typeof diff === 'string') {
      const diffLines = diff.split('\n');
      let currentFile = null;
      
      diffLines.forEach(line => {
        if (line.startsWith('diff --git')) {
          const match = line.match(/diff --git a\/(.+) b\/(.+)/);
          if (match) {
            currentFile = match[2];
            if (!analysis.filesChanged.includes(currentFile)) {
              analysis.filesChanged.push(currentFile);
            }
          }
        }
      });
    }

    analysis.changeTypes = Array.from(analysis.changeTypes);
    
    return analysis;
  }

  async saveAnalysisFiles(pr, diff, commits = [], analysis) {
    try {
      // Save PR details as JSON
      const prDetails = {
        title: pr.title,
        body: pr.body,
        labels: (pr.labels || []).map(l => l.name),
        commits: commits || [],
        analysis: analysis
      };
      
      await fs.promises.writeFile(
        path.join(process.cwd(), 'pr_details.json'),
        JSON.stringify(prDetails, null, 2)
      );
      
      // Save diff content
      await fs.promises.writeFile(
        path.join(process.cwd(), 'pr_diff.txt'),
        typeof diff === 'string' ? diff : 'No diff available'
      );
      
      core.info('Saved PR analysis files for AI processing');
    } catch (error) {
      core.warning(`Failed to save analysis files: ${error.message}`);
    }
  }

  getSuggestedVersionIncrement(analysis) {
    if (this.config.inputs.versionStrategy !== 'auto') {
      return this.config.inputs.versionStrategy;
    }
    
    if (analysis.isBreakingChange) {
      return 'major';
    }
    
    if (analysis.isFeature) {
      return 'minor';
    }
    
    return 'patch';
  }
}

module.exports = PRAnalyzer;
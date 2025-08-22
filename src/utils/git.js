const exec = require('@actions/exec');
const core = require('@actions/core');

class GitUtils {
  constructor(config) {
    this.config = config;
  }

  async setupGitUser() {
    await exec.exec('git', ['config', '--local', 'user.name', this.config.inputs.gitUserName]);
    await exec.exec('git', ['config', '--local', 'user.email', this.config.inputs.gitUserEmail]);
  }

  async getLatestTag() {
    let output = '';
    const options = {
      listeners: {
        stdout: (data) => {
          output += data.toString();
        }
      },
      silent: true,
      ignoreReturnCode: true
    };

    const exitCode = await exec.exec('git', ['describe', '--tags', '--abbrev=0'], options);
    
    if (exitCode === 0 && output.trim()) {
      return output.trim();
    }
    
    return '1.0.0';
  }

  async getCommitsSinceTag(tag) {
    let output = '';
    const options = {
      listeners: {
        stdout: (data) => {
          output += data.toString();
        }
      },
      silent: true
    };

    try {
      await exec.exec('git', ['log', '--pretty=format:%H|%s|%an|%ae|%ad', '--date=short', `${tag}..HEAD`], options);
      
      if (!output.trim()) {
        // If no commits since tag, get recent commits
        await exec.exec('git', ['log', '--pretty=format:%H|%s|%an|%ae|%ad', '--date=short', `-${this.config.inputs.maxCommitsFallback}`], options);
      }
      
      return this.parseCommits(output);
    } catch (error) {
      core.warning(`Failed to get commits since tag ${tag}: ${error.message}`);
      return [];
    }
  }

  async getCurrentCommit() {
    let output = '';
    const options = {
      listeners: {
        stdout: (data) => {
          output += data.toString();
        }
      },
      silent: true
    };

    await exec.exec('git', ['rev-parse', 'HEAD'], options);
    return output.trim();
  }

  async getShortCommit() {
    let output = '';
    const options = {
      listeners: {
        stdout: (data) => {
          output += data.toString();
        }
      },
      silent: true
    };

    await exec.exec('git', ['rev-parse', '--short', 'HEAD'], options);
    return output.trim();
  }

  parseCommits(output) {
    if (!output.trim()) return [];
    
    return output.trim().split('\n').map(line => {
      const [hash, subject, author, email, date] = line.split('|');
      return {
        hash: hash?.trim(),
        shortHash: hash?.trim().substring(0, 7),
        subject: subject?.trim(),
        author: author?.trim(),
        email: email?.trim(),
        date: date?.trim()
      };
    }).filter(commit => commit.hash);
  }

  async createTag(version, message) {
    try {
      await this.setupGitUser();
      await exec.exec('git', ['tag', '-a', version, '-m', message]);
      core.info(`Created tag: ${version}`);
      return true;
    } catch (error) {
      core.error(`Failed to create tag ${version}: ${error.message}`);
      return false;
    }
  }

  async pushTag(version) {
    try {
      await exec.exec('git', ['push', 'origin', version]);
      core.info(`Pushed tag: ${version}`);
      return true;
    } catch (error) {
      core.error(`Failed to push tag ${version}: ${error.message}`);
      return false;
    }
  }

  async commitAndPush(files, commitMessage, branchName = null) {
    try {
      await this.setupGitUser();
      
      // Add files
      for (const file of files) {
        await exec.exec('git', ['add', file]);
      }
      
      // Check if there are changes to commit
      let hasChanges = false;
      const options = {
        listeners: {
          stdout: () => { hasChanges = true; }
        },
        silent: true
      };
      
      await exec.exec('git', ['diff', '--staged', '--name-only'], options);
      
      if (!hasChanges) {
        core.info('No changes to commit');
        return false;
      }
      
      // Create branch if specified
      if (branchName) {
        await exec.exec('git', ['checkout', '-b', branchName]);
      }
      
      // Commit
      await exec.exec('git', ['commit', '-m', commitMessage]);
      
      // Push
      if (branchName) {
        await exec.exec('git', ['push', 'origin', branchName]);
      } else {
        await exec.exec('git', ['push']);
      }
      
      core.info(`Successfully committed and pushed changes${branchName ? ` to branch ${branchName}` : ''}`);
      return true;
    } catch (error) {
      core.error(`Failed to commit and push: ${error.message}`);
      return false;
    }
  }
}

module.exports = GitUtils;
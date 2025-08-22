const semver = require('semver');
const core = require('@actions/core');

class VersionManager {
  constructor(config, gitUtils) {
    this.config = config;
    this.gitUtils = gitUtils;
  }

  async generateVersion(versionIncrement = null) {
    try {
      const latestTag = await this.gitUtils.getLatestTag();
      const increment = versionIncrement || this.config.inputs.versionStrategy;
      
      core.info(`Latest tag: ${latestTag}, increment: ${increment}`);
      
      // Clean the version (remove prefix if present)
      const cleanLatestVersion = this.cleanVersion(latestTag);
      
      let newVersion;
      
      if (this.config.isProductionEnvironment) {
        // Production: use semantic versioning
        newVersion = this.incrementVersion(cleanLatestVersion, increment);
      } else {
        // Development: use dev version format
        const shortCommit = await this.gitUtils.getShortCommit();
        newVersion = `${cleanLatestVersion}-dev.${shortCommit}`;
      }
      
      const tagName = `${this.config.inputs.versionPrefix}${newVersion}`;
      
      return {
        newVersion,
        previousVersion: latestTag,
        tagName,
        cleanPreviousVersion: cleanLatestVersion
      };
    } catch (error) {
      core.error(`Failed to generate version: ${error.message}`);
      throw error;
    }
  }

  cleanVersion(version) {
    // Remove common prefixes
    const prefixes = ['v', 'release-', 'version-'];
    let cleaned = version;
    
    for (const prefix of prefixes) {
      if (cleaned.startsWith(prefix)) {
        cleaned = cleaned.substring(prefix.length);
        break;
      }
    }
    
    // Validate it's a semver
    if (!semver.valid(cleaned)) {
      core.warning(`Invalid semver: ${cleaned}, using 1.0.0`);
      return '1.0.0';
    }
    
    return cleaned;
  }

  incrementVersion(currentVersion, increment) {
    const validIncrements = ['patch', 'minor', 'major'];
    
    if (!validIncrements.includes(increment)) {
      core.warning(`Invalid increment: ${increment}, using patch`);
      increment = 'patch';
    }
    
    try {
      const newVersion = semver.inc(currentVersion, increment);
      if (!newVersion) {
        throw new Error(`Failed to increment version: ${currentVersion} with ${increment}`);
      }
      return newVersion;
    } catch (error) {
      core.error(`Failed to increment version: ${error.message}`);
      // Fallback to basic increment
      return this.basicIncrement(currentVersion, increment);
    }
  }

  basicIncrement(currentVersion, increment) {
    try {
      const parts = currentVersion.split('.').map(n => parseInt(n) || 0);
      
      // Ensure we have at least 3 parts
      while (parts.length < 3) {
        parts.push(0);
      }
      
      const [major, minor, patch] = parts;
      
      switch (increment) {
        case 'major':
          return `${major + 1}.0.0`;
        case 'minor':
          return `${major}.${minor + 1}.0`;
        case 'patch':
        default:
          return `${major}.${minor}.${patch + 1}`;
      }
    } catch (error) {
      core.error(`Basic increment failed: ${error.message}`);
      // Ultimate fallback
      return '1.0.1';
    }
  }

  generateBuildNumber() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    
    return `${year}${month}${day}.${hours}${minutes}`;
  }

  validateVersion(version) {
    const cleaned = this.cleanVersion(version);
    return semver.valid(cleaned) !== null;
  }

  compareVersions(v1, v2) {
    try {
      const clean1 = this.cleanVersion(v1);
      const clean2 = this.cleanVersion(v2);
      return semver.compare(clean1, clean2);
    } catch (error) {
      core.warning(`Failed to compare versions ${v1} and ${v2}: ${error.message}`);
      return 0;
    }
  }
}

module.exports = VersionManager;
const core = require('@actions/core');
const github = require('@actions/github');

// Import our modules
const Config = require('./utils/config');
const GitUtils = require('./utils/git');
const PRAnalyzer = require('./utils/pr-analyzer');
const VersionManager = require('./modules/versioning');
const ReleaseNotesGenerator = require('./modules/release-notes');
const SlackNotifier = require('./modules/slack');
const GitHubReleaseManager = require('./modules/github-release');
const ChangelogManager = require('./modules/changelog');

async function run() {
  try {
    core.info('🚀 Starting AI-Powered Release Notes Generator');
    
    // Initialize configuration
    const config = new Config();
    core.info('✅ Configuration loaded and validated');
    
    // Check if this PR should trigger release notes
    const context = github.context;
    const shouldRun = await checkTriggerConditions(config, context);
    if (!shouldRun.run) {
      core.info(`⏭️  Skipping release notes generation: ${shouldRun.reason}`);
      return;
    }
    
    // Get GitHub token
    const token = core.getInput('token') || process.env.GITHUB_TOKEN;
    if (!token) {
      throw new Error('GitHub token is required. Set the "token" input or GITHUB_TOKEN environment variable.');
    }
    
    // Initialize utilities and modules
    const gitUtils = new GitUtils(config);
    const prAnalyzer = new PRAnalyzer(config, token);
    const versionManager = new VersionManager(config, gitUtils);
    const releaseNotesGenerator = new ReleaseNotesGenerator(config);
    const slackNotifier = new SlackNotifier(config);
    const githubReleaseManager = new GitHubReleaseManager(config, token);
    const changelogManager = new ChangelogManager(config);
    
    // Analyze the PR
    core.info('🔍 Analyzing pull request...');
    const prAnalysis = await prAnalyzer.analyzePR();
    core.info(`✅ Analyzed PR #${prAnalysis.number}: ${prAnalysis.analysis.title}`);
    
    // Determine version increment strategy
    const versionIncrement = prAnalyzer.getSuggestedVersionIncrement(prAnalysis.analysis);
    core.info(`📊 Suggested version increment: ${versionIncrement}`);
    
    // Generate version information
    core.info('🔢 Generating version information...');
    const versionInfo = await versionManager.generateVersion(versionIncrement);
    versionInfo.buildNumber = versionManager.generateBuildNumber();
    
    core.info(`✅ Version: ${versionInfo.newVersion} (previous: ${versionInfo.previousVersion})`);
    core.info(`🏗️  Build: ${versionInfo.buildNumber}`);
    
    // Generate release notes
    core.info('📝 Generating release notes...');
    const releaseNotes = await releaseNotesGenerator.generateReleaseNotes(prAnalysis, versionInfo);
    core.info(`✅ Release notes generated${releaseNotes.aiGenerated ? ' with AI' : ' with template'}`);
    
    // Set core outputs
    core.setOutput('version', versionInfo.newVersion);
    core.setOutput('previous_version', versionInfo.previousVersion);
    core.setOutput('build_number', versionInfo.buildNumber);
    core.setOutput('release_notes', releaseNotes.releaseNotes);
    core.setOutput('ai_generated', releaseNotes.aiGenerated);
    core.setOutput('commits_analyzed', prAnalysis.commits.length);
    
    // Create git tag if this is a production release
    if (config.isProductionEnvironment && config.isReleaseEnabled) {
      core.info('🏷️  Creating git tag...');
      const tagCreated = await gitUtils.createTag(
        versionInfo.tagName,
        `Release ${versionInfo.tagName}\n\n${releaseNotes.releaseNotes}`
      );
      
      if (tagCreated) {
        const tagPushed = await gitUtils.pushTag(versionInfo.tagName);
        if (!tagPushed) {
          core.warning('Tag created locally but failed to push to remote');
        }
      }
    }
    
    // Update changelog
    let changelogResult = { updated: false };
    if (config.isChangelogEnabled) {
      core.info('📄 Updating changelog...');
      changelogResult = await changelogManager.updateChangelog(releaseNotes, versionInfo, prAnalysis);
      
      if (changelogResult.updated) {
        core.info(`✅ Changelog updated: ${changelogResult.path}`);
        
        // Commit changelog if this is a production release
        if (config.isProductionEnvironment) {
          const branchName = `release/${versionInfo.tagName}`;
          const commitMessage = `[skip ci] chore: update changelog for release ${versionInfo.tagName}`;
          
          const committed = await gitUtils.commitAndPush(
            [config.inputs.changelogFile],
            commitMessage,
            branchName
          );
          
          if (committed) {
            core.info('✅ Changelog committed and pushed');
          }
        }
      }
    }
    
    core.setOutput('changelog_updated', changelogResult.updated);
    
    // Create GitHub release
    let releaseResult = { created: false };
    if (config.isReleaseEnabled) {
      core.info('🎉 Creating GitHub release...');
      releaseResult = await githubReleaseManager.createRelease(releaseNotes, versionInfo, prAnalysis);
      
      if (releaseResult.created) {
        core.info(`✅ GitHub release created: ${releaseResult.url}`);
      } else {
        core.warning(`Failed to create GitHub release: ${releaseResult.reason}`);
      }
    }
    
    // Create changelog PR if needed
    if (changelogResult.updated && config.isProductionEnvironment) {
      const prResult = await githubReleaseManager.createPullRequestForChangelog(versionInfo, changelogResult.updated);
      if (prResult.created) {
        core.info(`✅ Changelog PR created: ${prResult.url}`);
      }
    }
    
    // Send Slack notification
    let slackResult = { sent: false };
    if (config.isSlackEnabled) {
      core.info('💬 Sending Slack notification...');
      slackResult = await slackNotifier.sendNotification(releaseNotes, versionInfo, prAnalysis);
      
      if (slackResult.sent) {
        core.info('✅ Slack notification sent successfully');
      } else {
        core.warning(`Failed to send Slack notification: ${slackResult.reason}`);
      }
    }
    
    core.setOutput('slack_sent', slackResult.sent);
    
    // Final summary
    core.info('\n🎊 Release notes generation completed successfully!');
    core.info('📊 Summary:');
    core.info(`   • Version: ${versionInfo.newVersion}`);
    core.info(`   • AI Generated: ${releaseNotes.aiGenerated ? 'Yes' : 'No'}`);
    core.info(`   • GitHub Release: ${releaseResult.created ? 'Created' : 'Skipped'}`);
    core.info(`   • Changelog: ${changelogResult.updated ? 'Updated' : 'Skipped'}`);
    core.info(`   • Slack: ${slackResult.sent ? 'Sent' : 'Skipped'}`);
    
  } catch (error) {
    core.error(`💥 Action failed: ${error.message}`);
    core.debug(`Stack trace: ${error.stack}`);
    core.setFailed(error.message);
  } finally {
    // Cleanup temporary files
    await cleanup();
  }
}

async function checkTriggerConditions(config, context) {
  // Check if this is a pull request event
  if (context.eventName !== 'pull_request') {
    return { run: false, reason: 'Not a pull request event' };
  }
  
  const pr = context.payload.pull_request;
  
  // Check if PR is merged
  if (!pr.merged) {
    return { run: false, reason: 'PR is not merged' };
  }
  
  // Check target branch
  if (pr.base.ref !== config.inputs.targetBranch && 
      !['main', 'master', 'dev', 'development'].includes(pr.base.ref)) {
    return { run: false, reason: `Target branch ${pr.base.ref} not in allowed list` };
  }
  
  // Check for trigger label (optional - skip check if empty)
  if (config.inputs.triggerLabel) {
    const hasLabel = pr.labels.some(label => label.name === config.inputs.triggerLabel);
    if (!hasLabel) {
      return { run: false, reason: `Missing required label: ${config.inputs.triggerLabel}` };
    }
  }
  
  // Check if we should skip for no changes
  if (config.inputs.skipIfNoChanges) {
    // This could be enhanced to check for significant changes
    core.info('Skip if no changes is enabled, but not implemented yet');
  }
  
  return { run: true, reason: 'All conditions met' };
}

async function cleanup() {
  const filesToCleanup = [
    'pr_details.json',
    'pr_diff.txt',
    'release-notes.md',
    'slack-message.txt',
    'gemini_prompt.txt',
    'gemini_output.txt'
  ];
  
  for (const file of filesToCleanup) {
    try {
      const fs = require('fs');
      if (fs.existsSync(file)) {
        await fs.promises.unlink(file);
        core.debug(`Cleaned up: ${file}`);
      }
    } catch (error) {
      core.debug(`Failed to cleanup ${file}: ${error.message}`);
    }
  }
}

// Handle both direct execution and module export
if (require.main === module) {
  run();
}

module.exports = {
  run,
  checkTriggerConditions,
  cleanup
};
// Core functionality tests without complex mocking

describe('Core Action Tests', () => {
  test('modules can be imported successfully', () => {
    expect(() => {
      require('../src/main');
      require('../src/utils/config');
      require('../src/modules/versioning');
      require('../src/modules/slack');
    }).not.toThrow();
  });

  test('main module has required exports', () => {
    const main = require('../src/main');
    expect(main.checkTriggerConditions).toBeInstanceOf(Function);
    expect(main.cleanup).toBeInstanceOf(Function);
  });

  test('version manager basic functionality', () => {
    const VersionManager = require('../src/modules/versioning');
    const vm = new VersionManager({}, {});
    
    // Test cleanVersion
    expect(vm.cleanVersion('v1.2.3')).toBe('1.2.3');
    expect(vm.cleanVersion('release-2.0.0')).toBe('2.0.0');
    
    // Test incrementVersion
    expect(vm.incrementVersion('1.2.3', 'patch')).toBe('1.2.4');
    expect(vm.incrementVersion('1.2.3', 'minor')).toBe('1.3.0');
    expect(vm.incrementVersion('1.2.3', 'major')).toBe('2.0.0');
    
    // Test buildNumber format
    const buildNumber = vm.generateBuildNumber();
    expect(buildNumber).toMatch(/^\d{8}\.\d{4}$/);
    
    // Test version validation
    expect(vm.validateVersion('1.2.3')).toBe(true);
    expect(vm.validateVersion('v1.2.3')).toBe(true);
    
    // Test version comparison
    expect(vm.compareVersions('1.2.3', '1.2.4')).toBeLessThan(0);
    expect(vm.compareVersions('1.2.4', '1.2.3')).toBeGreaterThan(0);
    expect(vm.compareVersions('1.2.3', '1.2.3')).toBe(0);
  });

  test('slack notifier basic functionality', () => {
    const SlackNotifier = require('../src/modules/slack');
    
    const config = {
      isSlackEnabled: false,
      inputs: {
        environment: 'PROD'
      }
    };
    
    const notifier = new SlackNotifier(config);
    
    // Test utility methods
    expect(notifier.validateWebhookUrl('https://hooks.slack.com/services/T00/B00/XXX')).toBe(true);
    expect(notifier.validateWebhookUrl('https://invalid.com/webhook')).toBe(false);
    
    expect(notifier.escapeSlackText('Test & <script>')).toBe('Test &amp; &lt;script&gt;');
    
    expect(notifier.getMessageColor()).toBe('good'); // PROD environment
  });

  test('checkTriggerConditions basic functionality', async () => {
    const { checkTriggerConditions } = require('../src/main');
    
    const config = {
      inputs: {
        triggerLabel: 'release-notes',
        targetBranch: 'main'
      }
    };
    
    // Test valid PR
    const validContext = {
      eventName: 'pull_request',
      payload: {
        pull_request: {
          merged: true,
          labels: [{ name: 'release-notes' }],
          base: { ref: 'main' }
        }
      }
    };
    
    const validResult = await checkTriggerConditions(config, validContext);
    expect(validResult.run).toBe(true);
    expect(validResult.reason).toBe('All conditions met');
    
    // Test invalid event
    const invalidContext = { eventName: 'push' };
    const invalidResult = await checkTriggerConditions(config, invalidContext);
    expect(invalidResult.run).toBe(false);
    expect(invalidResult.reason).toBe('Not a pull request event');
    
    // Test unmerged PR
    const unmergedContext = {
      eventName: 'pull_request',
      payload: {
        pull_request: {
          merged: false,
          labels: [{ name: 'release-notes' }],
          base: { ref: 'main' }
        }
      }
    };
    
    const unmergedResult = await checkTriggerConditions(config, unmergedContext);
    expect(unmergedResult.run).toBe(false);
    expect(unmergedResult.reason).toBe('PR is not merged');
  });
});
// Mock @actions/core
jest.mock('@actions/core', () => ({
  getInput: jest.fn(),
  getBooleanInput: jest.fn(),
  setOutput: jest.fn(),
  setFailed: jest.fn(),
  info: jest.fn(),
  warning: jest.fn(),
  error: jest.fn(),
  debug: jest.fn()
}));

// Mock @actions/github
jest.mock('@actions/github', () => ({
  context: {
    eventName: 'pull_request',
    repo: {
      owner: 'test-owner',
      repo: 'test-repo'
    },
    sha: 'test-sha',
    payload: {
      pull_request: {
        number: 123,
        merged: true,
        title: 'Test PR',
        body: 'Test PR description',
        labels: [{ name: 'release-notes' }],
        base: { ref: 'main' },
        head: { ref: 'feature-branch' },
        user: { login: 'test-user' },
        html_url: 'https://github.com/test-owner/test-repo/pull/123'
      }
    },
    serverUrl: 'https://github.com'
  },
  getOctokit: jest.fn(() => ({
    rest: {
      pulls: {
        get: jest.fn(),
        listCommits: jest.fn()
      },
      repos: {
        createRelease: jest.fn(),
        updateRelease: jest.fn(),
        getReleaseByTag: jest.fn()
      }
    }
  }))
}));

// Mock @actions/exec
jest.mock('@actions/exec', () => ({
  exec: jest.fn()
}));

// Mock fs promises
jest.mock('fs', () => ({
  promises: {
    writeFile: jest.fn(),
    readFile: jest.fn(),
    access: jest.fn(),
    unlink: jest.fn(),
    copyFile: jest.fn()
  },
  existsSync: jest.fn()
}));

// Mock axios
jest.mock('axios', () => ({
  post: jest.fn()
}));

// Set up environment variables for testing
process.env.GITHUB_REPOSITORY = 'test-owner/test-repo';
process.env.GITHUB_TOKEN = 'test-token';
process.env.GITHUB_SERVER_URL = 'https://github.com';
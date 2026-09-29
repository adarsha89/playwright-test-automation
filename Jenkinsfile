pipeline {
  agent {
    // Keep the tag in lockstep with the installed @playwright/test version (package-lock.json), otherwise the image's bundled browsers won't match what the runner expects.
    docker { image 'mcr.microsoft.com/playwright:v1.62.1-noble' }
  }
  parameters {
    // To fan out, run one build per shard (e.g. SHARD_TOTAL=4 with SHARD_INDEX=1..4).
    string(name: 'SHARD_INDEX', defaultValue: '1', description: 'This build\'s shard (1-based)')
    string(name: 'SHARD_TOTAL', defaultValue: '1', description: 'Total number of shards')
  }
  environment {
    CI = 'true'
    // config/env.ts validates every variable below at import time — a missing one fails the run.
    BASE_URL = credentials('qa-base-url')
    API_BASE_URL = credentials('qa-api-base-url')
    TEST_USER_EMAIL = credentials('qa-test-user-email')
    TEST_USER_PASSWORD = credentials('qa-test-user-password')
    API_AUTH_USERNAME = credentials('qa-api-auth-username')
    API_AUTH_PASSWORD = credentials('qa-api-auth-password')
    // Public demo site, not a secret.
    SAUCEDEMO_BASE_URL = 'https://www.saucedemo.com/'
  }
  options {
    timestamps()
  }
  stages {
    stage('Install') {
      steps { sh 'npm ci' }
    }
    stage('Static checks') {
      parallel {
        stage('Lint') { steps { sh 'npm run lint' } }
        stage('Typecheck') { steps { sh 'npm run typecheck' } }
        stage('Format') { steps { sh 'npm run format:check' } }
      }
    }
    stage('Test') {
      steps {
        sh "npx playwright test --shard=${params.SHARD_INDEX}/${params.SHARD_TOTAL}"
      }
    }
  }
  post {
    always {
      junit allowEmptyResults: true, testResults: 'reports/junit-results.xml'
      archiveArtifacts artifacts: 'playwright-report/**, test-results/**', allowEmptyArchive: true
    }
  }
}

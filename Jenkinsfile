pipeline {
  agent {
    docker { image 'mcr.microsoft.com/playwright:v1.48.0-jammy' }
  }
  environment {
    CI = 'true'
    BASE_URL = credentials('qa-base-url')
    API_BASE_URL = credentials('qa-api-base-url')
  }
  options {
    timestamps()
  }
  stages {
    stage('Install') {
      steps { sh 'npm ci' }
    }
    stage('Lint & Typecheck') {
      parallel {
        stage('Lint') { steps { sh 'npm run lint' } }
        stage('Typecheck') { steps { sh 'npm run typecheck' } }
      }
    }
    stage('Test') {
      steps {
        sh 'npx playwright test --shard=${SHARD_INDEX}/${SHARD_TOTAL}'
      }
    }
  }
  post {
    always {
      junit 'reports/junit-results.xml'
      archiveArtifacts artifacts: 'playwright-report/**, test-results/**', allowEmptyArchive: true
    }
  }
}

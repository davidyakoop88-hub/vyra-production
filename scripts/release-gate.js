#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const REPORT_DIR = path.join(ROOT, '.deploy');
const REPORT_PATH = path.join(REPORT_DIR, 'release-gate-report.json');

function result(id, status, detail, command) {
  return { id, status, detail, ...(command ? { command } : {}) };
}

function run(command, args, cwd = ROOT) {
  const completed = spawnSync(command, args, {
    cwd,
    env: process.env,
    encoding: 'utf8',
    shell: process.platform === 'win32'
  });
  return {
    ok: completed.status === 0,
    output: `${completed.stdout || ''}${completed.stderr || ''}`.trim()
  };
}

function listFiles(dir, predicate, output = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', '.git', '.deploy', 'dist2'].includes(entry.name)) continue;
    const absolute = path.join(dir, entry.name);
    if (entry.isDirectory()) listFiles(absolute, predicate, output);
    else if (predicate(absolute)) output.push(absolute);
  }
  return output;
}

function validatePublicArtifact() {
  const required = ['index.html', 'studio.html', 'live-client.js', 'overlay.html'];
  const missing = required.filter((name) => !fs.existsSync(path.join(ROOT, name)));
  const dockerfile = fs.readFileSync(path.join(ROOT, 'web', 'Dockerfile'), 'utf8');
  const forbidden = ['server', 'scripts', 'docs', 'electron-app', 'tiktok-bridge'];
  const exclusionsMissing = forbidden.filter((name) => !dockerfile.includes(name));
  if (missing.length || exclusionsMissing.length) {
    return result('public-artifact', 'fail',
      `Missing public files: ${missing.join(', ') || 'none'}; missing exclusions: ${exclusionsMissing.join(', ') || 'none'}`);
  }
  return result('public-artifact', 'pass',
    'Required browser assets exist and internal trees are excluded.');
}

function localChecks() {
  const checks = [];
  const syntaxFailures = [];
  for (const file of listFiles(ROOT, (name) => name.endsWith('.js'))) {
    if (!run(process.execPath, ['--check', file]).ok) {
      syntaxFailures.push(path.relative(ROOT, file));
    }
  }
  checks.push(result('javascript-syntax', syntaxFailures.length ? 'fail' : 'pass',
    syntaxFailures.length ? `Invalid files: ${syntaxFailures.join(', ')}` : 'All JavaScript files parse.'));

  const suites = [
    ['web-assets-tests', '.', process.execPath,
      ['--test', 'scripts/test/*.test.js'], 'Browser entry points and local assets passed.'],
    ['server-tests', 'server', 'npm', ['test'], 'Server test suite passed.'],
    ['desktop-tests', 'electron-app', 'npm', ['test'], 'Desktop updater tests passed.'],
    ['tiktok-normalizer-tests', 'tiktok-bridge', process.execPath,
      ['--test', 'test/normalizer.test.js'], 'TikTok event normalization tests passed.']
  ];
  for (const [id, directory, command, args, success] of suites) {
    const completed = run(command, args, path.join(ROOT, directory));
    checks.push(result(id, completed.ok ? 'pass' : 'fail',
      completed.ok ? success : completed.output.slice(-1500),
      `cd ${directory} && ${command} ${args.join(' ')}`));
  }

  const audit = run('npm', ['audit', '--omit=dev', '--audit-level=high'], path.join(ROOT, 'server'));
  checks.push(result('server-dependency-audit', audit.ok ? 'pass' : 'fail',
    audit.ok ? 'No high or critical production dependency vulnerability.' : audit.output.slice(-1500),
    'cd server && npm audit --omit=dev --audit-level=high'));
  checks.push(validatePublicArtifact());
  return checks;
}

function externalChecks(env = process.env) {
  const baseUrl = env.VYRA_BASE_URL || (env.VYRA_DOMAIN ? `https://${env.VYRA_DOMAIN}` : '');
  const hasSecrets = Boolean(env.APP_ORIGIN && env.DATABASE_URL && env.REDIS_URL);
  return [
    result('production-secrets', hasSecrets ? 'pending' : 'blocked',
      hasSecrets
        ? 'Values are present; production preflight must run in the deployment environment.'
        : 'APP_ORIGIN, DATABASE_URL and REDIS_URL are supplied by the production secret manager.'),
    result('staging-readiness-and-load', baseUrl ? 'pending' : 'blocked',
      baseUrl ? `Run readiness and k6 profiles against ${baseUrl}.`
        : 'Requires VYRA_BASE_URL for the staging deployment.'),
    result('stripe-lifecycle', 'blocked',
      'Requires Stripe staging Test Clock: trial, renewal, failed payment, cancellation and resume.'),
    result('obs-tiktok-live', 'blocked',
      'Requires a real OBS/TikTok LIVE Studio session for transparency, media and live events.'),
    result('signed-windows-installer', 'blocked',
      'Requires the Windows signing certificate and a tagged CI release.')
  ];
}

function buildReport() {
  const checks = [...localChecks(), ...externalChecks()];
  const failed = checks.filter((check) => check.status === 'fail');
  const blocked = checks.filter((check) => ['blocked', 'pending'].includes(check.status));
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    releaseReady: failed.length === 0 && blocked.length === 0,
    summary: {
      passed: checks.filter((check) => check.status === 'pass').length,
      failed: failed.length,
      blocked: blocked.length
    },
    checks
  };
}

function main() {
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  const report = buildReport();
  fs.writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
  console.log(`Release report: ${REPORT_PATH}`);
  if (report.summary.failed) process.exitCode = 1;
  else if (!report.releaseReady) process.exitCode = 2;
}

if (require.main === module) main();
module.exports = { externalChecks, validatePublicArtifact };

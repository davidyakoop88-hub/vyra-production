'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { externalChecks, validatePublicArtifact } = require('../release-gate');

test('external gates fail closed without deployment context', () => {
  const checks = externalChecks({});
  assert.equal(checks.some((check) => check.status === 'blocked'), true);
  assert.equal(checks.some((check) => check.status === 'pass'), false);
});

test('provided deployment context still needs collected evidence', () => {
  const checks = externalChecks({
    APP_ORIGIN: 'https://vyra.example',
    DATABASE_URL: 'postgres://database/vyra',
    REDIS_URL: 'rediss://cache',
    VYRA_BASE_URL: 'https://staging.vyra.example'
  });
  assert.equal(checks.find((check) => check.id === 'production-secrets').status, 'pending');
  assert.equal(checks.find((check) => check.id === 'staging-readiness-and-load').status, 'pending');
});

test('public artifact contract is configured', () => {
  assert.equal(validatePublicArtifact().status, 'pass');
});

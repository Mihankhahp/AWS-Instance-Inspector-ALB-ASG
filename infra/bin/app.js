#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { InstanceInspectorStack } from '../lib/instance-inspector-stack.js';

const app = new cdk.App();

new InstanceInspectorStack(app, 'InstanceInspectorStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION || 'us-east-1',
  },
});

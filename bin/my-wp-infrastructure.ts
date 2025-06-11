#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { MyCdkWpStack } from '../lib/my-cdk-wordpress-stack';

const app = new cdk.App();

new MyCdkWpStack(app, 'MyCdkWpStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION || 'ap-northeast-3', // replace with your region
  },
});


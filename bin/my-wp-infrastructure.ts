#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { MyCdkWpStack } from '../lib/my-cdk-wordpress-stack';
import config from '../lib/config'; 

const app = new cdk.App();

new MyCdkWpStack(app, config.projectName + '-Stack', {
  env: {
    account: config.aws.accountId,
    region: config.aws.region,
  },
});

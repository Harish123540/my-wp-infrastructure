import * as cdk from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { MyCdkWpStack } from '../lib/my-cdk-wordpress-stack';

test('ECR Repository and ECS Service Created', () => {
  const app = new cdk.App();
  const stack = new MyCdkWpStack(app, 'TestStack');

  const template = Template.fromStack(stack);

  template.resourceCountIs('AWS::ECR::Repository', 1);
  template.resourceCountIs('AWS::ECS::Service', 1);
});

import { Stack, StackProps, CfnOutput } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { MyVpc } from './constructs/vpc';
import { MyRds } from './constructs/rds';
import { MyEcr } from './constructs/ecr';
import { MyEcs } from './constructs/ecs';
import { GithubToken } from './constructs/github-token';
import { MyCodePipeline } from './constructs/codepipeline';
import { StaticAssetsBucket } from './constructs/S3';
import { Monitoring } from './constructs/monitoring';
import config from './config';
import { SecretValue } from 'aws-cdk-lib';

export class MyCdkWpStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    // VPC
    const vpc = new MyVpc(this, 'MyVpcConstruct').vpc;

    // RDS instance
    const rds = new MyRds(this, 'MyRdsConstruct', vpc).dbInstance;

    // ECR
    const ecr = new MyEcr(this, 'MyEcrConstruct').repository;

    // ECS
    const ecs = new MyEcs(this, 'MyEcsConstruct', vpc, ecr, rds);

    // GitHub token secret from Secrets Manager
    const githubToken = new GithubToken(this, 'GithubTokenConstruct').secret; // ISecret

    // CodePipeline


    new MyCodePipeline(this, 'MyPipeline', {
      githubTokenSecret: githubToken,
      ecrRepo: ecr,
      fargateService: ecs.fargateService,
      accountId: config.aws.accountId,
      region: config.aws.region,
    });


    //  S3 Static Assets Bucket
    new StaticAssetsBucket(this, 'StaticAssets');

    //  CloudWatch Monitoring for ECS & RDS
    new Monitoring(this, 'MonitoringConstruct', {
      ecsService: ecs.fargateService,
      rdsInstance: rds,
    });

    // Outputs
    new CfnOutput(this, 'RDS_Endpoint', {
      value: rds.dbInstanceEndpointAddress,
    });

    new CfnOutput(this, 'ECR_Repository_URI', {
      value: ecr.repositoryUri,
    });
  }
}

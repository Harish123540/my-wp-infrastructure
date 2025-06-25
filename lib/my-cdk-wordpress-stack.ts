// ✅ FINAL UPGRADED CDK CODE WITH FULLY AUTOMATED DEPLOYMENT

import { Stack, StackProps, CfnOutput, Fn } from 'aws-cdk-lib';
import { Construct } from 'constructs';

import { MyVpc } from './constructs/vpc';
import { MyRds } from './constructs/rds';
import { MyEcr } from './constructs/ecr';
import { GithubToken } from './constructs/github-token';
import { MyCodePipeline } from './constructs/codepipeline';
import { MyEcs } from './constructs/ecs';
import { StaticAssetsBucket } from './constructs/S3';
import { Monitoring } from './constructs/monitoring';
import config from './config';

export class MyCdkWpStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const vpc = new MyVpc(this, 'MyVpcConstruct').vpc;
    const rds = new MyRds(this, 'MyRdsConstruct', vpc).dbInstance;
    const ecr = new MyEcr(this, 'MyEcrConstruct').repository;
    const githubToken = new GithubToken(this, 'GithubTokenConstruct').secret;

    // Phase 1: Pipeline created without ECS service (image will be pushed first)
    const pipeline = new MyCodePipeline(this, 'MyPipeline', {
      githubTokenSecret: githubToken,
      ecrRepo: ecr,
      accountId: config.aws.accountId,
      region: config.aws.region,
    });

    // WaitCondition / Dependency simulation via Lazy check or just ECS init after pipeline
    // Phase 2: ECS service uses ECR image (which was pushed via pipeline)
    const ecs = new MyEcs(this, 'MyEcsConstruct', vpc, ecr, rds);

    pipeline.addEcsStage(ecs.fargateService); // 🔄 dynamically add ECS deployment after pipeline created

    new StaticAssetsBucket(this, 'StaticAssets');
    new Monitoring(this, 'MonitoringConstruct', {
      ecsService: ecs.fargateService,
      rdsInstance: rds,
    });

    new CfnOutput(this, 'RDS_Endpoint', {
      value: rds.dbInstanceEndpointAddress,
    });

    new CfnOutput(this, 'ECR_Repository_URI', {
      value: ecr.repositoryUri,
    });
  }
}

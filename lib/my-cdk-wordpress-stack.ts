import { Stack, StackProps, CfnOutput } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { MyVpc } from './constructs/vpc';
import { MyRds } from './constructs/rds';
import { MyEcr } from './constructs/ecr';
import { MyEcs } from './constructs/ecs';
import { GithubToken } from './constructs/github-token';
import { MyCodePipeline } from './constructs/codepipeline';

export class MyCdkWpStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const vpc = new MyVpc(this, 'MyVpcConstruct').vpc;
    const rds = new MyRds(this, 'MyRdsConstruct', vpc).dbInstance;
    const ecr = new MyEcr(this, 'MyEcrConstruct').repository;
    const ecs = new MyEcs(this, 'MyEcsConstruct', vpc, ecr, rds);
    const githubToken = new GithubToken(this, 'GithubTokenConstruct').secret;

    new MyCodePipeline(this, 'MyPipeline', {
      githubTokenSecret: githubToken,
      ecrRepo: ecr,
      fargateService: ecs.fargateService,
      accountId: Stack.of(this).account,
      region: Stack.of(this).region,
    });

    new CfnOutput(this, 'RDS_Endpoint', { value: rds.dbInstanceEndpointAddress });
    new CfnOutput(this, 'ECR_Repository_URI', { value: ecr.repositoryUri });
  }
}

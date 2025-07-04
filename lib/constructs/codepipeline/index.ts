import { Construct } from 'constructs';
import { Pipeline, Artifact } from 'aws-cdk-lib/aws-codepipeline';
import {
  GitHubSourceAction,
  CodeBuildAction,
  EcsDeployAction,
} from 'aws-cdk-lib/aws-codepipeline-actions';
import { ISecret } from 'aws-cdk-lib/aws-secretsmanager';
import {
  PipelineProject,
  LinuxBuildImage,
  BuildSpec,
} from 'aws-cdk-lib/aws-codebuild';
import { IRepository } from 'aws-cdk-lib/aws-ecr';
import { FargateService } from 'aws-cdk-lib/aws-ecs';
import { Duration } from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import config from '../../config';
import { StaticAssetsBucket } from '../S3';
import { ArnPrincipal } from 'aws-cdk-lib/aws-iam';
import { Bucket } from 'aws-cdk-lib/aws-s3';
import { Stack } from 'aws-cdk-lib';


interface CodePipelineProps {
  githubTokenSecret: ISecret;
  ecrRepo: IRepository;
  fargateService?: FargateService; // 
  accountId: string;
  region: string;
}

export class MyCodePipeline extends Construct {
  private readonly pipeline: Pipeline;
  private readonly buildOutput: Artifact;

  constructor(scope: Construct, id: string, props: CodePipelineProps) {
    super(scope, id);
    const staticAssets = new StaticAssetsBucket(this, 'StaticAssetsBucketConstruct');
    // === Artifacts ===
    const infraSourceOutput = new Artifact('InfraSourceOutput');
    const appSourceOutput = new Artifact('AppSourceOutput');
    this.buildOutput = new Artifact('BuildOutput');

    // === Docker Build Project ===
    const dockerBuildProject = new PipelineProject(this, 'DockerBuildProject', {
      environment: {
        buildImage: LinuxBuildImage.STANDARD_7_0,
        privileged: true,
      },
      environmentVariables: {
        AWS_DEFAULT_REGION: { value: props.region },
        AWS_ACCOUNT_ID: { value: props.accountId },
        IMAGE_REPO_NAME: { value: props.ecrRepo.repositoryName },
        IMAGE_TAG: { value: config.docker.imageTag },
      },
      buildSpec: BuildSpec.fromObject({
        version: '0.2',
        phases: {
          pre_build: {
            commands: [
              'echo Logging in to Amazon ECR...',
              `aws ecr get-login-password --region ${props.region} | docker login --username AWS --password-stdin ${props.accountId}.dkr.ecr.${props.region}.amazonaws.com`,
            ],
          },
          build: {
            commands: [
              'echo Building Docker image...',
              `docker build -t $IMAGE_REPO_NAME:$IMAGE_TAG $CODEBUILD_SRC_DIR`,
              'docker tag $IMAGE_REPO_NAME:$IMAGE_TAG $AWS_ACCOUNT_ID.dkr.ecr.$AWS_DEFAULT_REGION.amazonaws.com/$IMAGE_REPO_NAME:$IMAGE_TAG',
            ],
          },
          post_build: {
            commands: [
              'echo Pushing Docker image...',
              'docker push $AWS_ACCOUNT_ID.dkr.ecr.$AWS_DEFAULT_REGION.amazonaws.com/$IMAGE_REPO_NAME:$IMAGE_TAG',
              'echo Writing imagedefinitions.json...',
              `echo '[{"name":"WordpressContainer","imageUri":"'$AWS_ACCOUNT_ID'.dkr.ecr.'$AWS_DEFAULT_REGION'.amazonaws.com/'$IMAGE_REPO_NAME':'$IMAGE_TAG'"}]' > imagedefinitions.json`
            ],
          },
        },
        artifacts: {
          files: ['imagedefinitions.json'],
        },
      }),
    });
    

    // === Infra Deploy Project ===
    const infraDeployProject = new PipelineProject(this, 'InfraDeployProject', {
      environment: { buildImage: LinuxBuildImage.STANDARD_7_0 },
      buildSpec: BuildSpec.fromObject({
        version: '0.2',
        phases: {
          install: {
            commands: ['npm install -g aws-cdk@latest', 'npm ci'],
          },
          pre_build: {
            commands: ['cdk --version'],
          },
          build: {
            commands: [
              'echo Deploying infrastructure...',
              'cdk bootstrap --require-approval never',
              'cdk deploy --require-approval never --outputs-file outputs.json',
            ],
          },
        },
        artifacts: {
          files: ['outputs.json'],
        },
      }),
    });

    // === IAM Permissions ===
    [dockerBuildProject, infraDeployProject].forEach((project) => {
      project.addToRolePolicy(
        new iam.PolicyStatement({
          actions: [
            'ecr:*',
            'ecs:*',
            'ec2:*',
            'iam:PassRole',
            'logs:*',
            'cloudformation:*',
            'ssm:*',
            'rds:*',
            's3:*',
            'secretsmanager:*',
            'elasticloadbalancing:*',
            'application-autoscaling:*',
            'sts:AssumeRole',
            's3:GetObject',
            's3:PutObject',
            's3:ListBucket',
          ],
          resources: [
            '*', 
            `arn:aws:iam::${props.accountId}:role/cdk-hnb659fds-deploy-role-*`,
            `arn:aws:iam::${props.accountId}:role/cdk-hnb659fds-file-publishing-role-*`,
            `arn:aws:iam::${props.accountId}:role/cdk-hnb659fds-lookup-role-*`,
            `arn:aws:s3:::cdk-hnb659fds-assets-${props.accountId}-${props.region}`,
            `arn:aws:s3:::cdk-hnb659fds-assets-${props.accountId}-${props.region}/*`,
          ],
        }),
      );
    });
    

    // === Grant ECR Access ===
    props.ecrRepo.grantPullPush(dockerBuildProject);

    // === Pipeline ===
    this.pipeline = new Pipeline(this, 'MyWordpressPipeline', {
      pipelineName: config.projectName + '-Pipeline',
      restartExecutionOnUpdate: true,
    });

    // === Stage: Source ===
    this.pipeline.addStage({
      stageName: 'Source',
      actions: [
        new GitHubSourceAction({
          actionName: 'Infra_Source',
          owner: config.github.owner,
          repo: config.github.infraRepo,
          branch: config.github.infraBranch,
          oauthToken: props.githubTokenSecret.secretValue,
          output: infraSourceOutput,
        }),
        new GitHubSourceAction({
          actionName: 'App_Source',
          owner: config.github.owner,
          repo: config.github.appRepo,
          branch: config.github.appBranch,
          oauthToken: props.githubTokenSecret.secretValue,
          output: appSourceOutput,
        }),
      ],
    });

    // === Stage: Build and Push Docker Image ===
    this.pipeline.addStage({
      stageName: 'Docker-Build-Push',
      actions: [
        new CodeBuildAction({
          actionName: 'Docker_Build_Push',
          project: dockerBuildProject,
          input: appSourceOutput,
          outputs: [this.buildOutput],
        }),
      ],
    });

    // === Stage: Deploy Infrastructure ===
    this.pipeline.addStage({
      stageName: 'Deploy-Infrastructure',
      actions: [
        new CodeBuildAction({
          actionName: 'Deploy_Infrastructure',
          project: infraDeployProject,
          input: infraSourceOutput,
        }),
      ],
    });

    // === Stage: Deploy Application to ECS (Optional) ===
    if (props.fargateService) {
      this.addEcsStage(props.fargateService, staticAssets.bucket);

    }
  }

  public addEcsStage(fargateService: FargateService, staticAssetsBucket: Bucket) {
    const ecsDeployRole = new iam.Role(this, 'EcsDeployRole', {
      assumedBy: new iam.ServicePrincipal('codepipeline.amazonaws.com'),
      description: 'Role for ECS Deploy Action in CodePipeline',
    });
    
    ecsDeployRole.addToPolicy(
      new iam.PolicyStatement({
        actions: [
          "ecs:UpdateService",
          "ecs:RegisterTaskDefinition",
          "ecs:DescribeServices",
          "ecs:DescribeTaskDefinition",
          "ecs:DescribeTasks",
          "ecs:ListTasks",
          "ecs:TagResource",
          "iam:PassRole",
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents",
          "s3:GetObject",
          "s3:GetObjectVersion",
          "s3:GetBucketVersioning",
          "s3:ListBucket"
        ],
        resources: ["*"],
      })
    );
    this.pipeline.artifactBucket.grantRead(ecsDeployRole);
    this.pipeline.artifactBucket.grantReadWrite(ecsDeployRole); 
    
    //this.pipeline.artifactBucket.grantRead(ecsDeployRole);
    staticAssetsBucket.grantRead(ecsDeployRole);
  
    this.pipeline.addStage({
      stageName: 'Deploy-Application',
      actions: [
        new EcsDeployAction({
          actionName: 'Deploy_to_ECS',
          service: fargateService,
          input: this.buildOutput,
          deploymentTimeout: Duration.minutes(20),
          role: ecsDeployRole,
        }),
      ],
    });
  }
  
  
}

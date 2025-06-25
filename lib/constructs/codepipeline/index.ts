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

    // === Artifacts ===
    const infraSourceOutput = new Artifact('InfraSourceOutput');
    const appSourceOutput = new Artifact('AppSourceOutput');
    this.buildOutput = new Artifact('BuildOutput');

    // === Docker Build Project ===
    const dockerBuildProject = new PipelineProject(this, 'DockerBuildProject', {
      environment: {
        buildImage: LinuxBuildImage.STANDARD_7_0,
        privileged: true, // for Docker
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
              `docker build -t $IMAGE_REPO_NAME:$IMAGE_TAG .`,
              'docker tag $IMAGE_REPO_NAME:$IMAGE_TAG $AWS_ACCOUNT_ID.dkr.ecr.$AWS_DEFAULT_REGION.amazonaws.com/$IMAGE_REPO_NAME:$IMAGE_TAG',
            ],
          },
          post_build: {
            commands: [
              'echo Pushing Docker image...',
              'docker push $AWS_ACCOUNT_ID.dkr.ecr.$AWS_DEFAULT_REGION.amazonaws.com/$IMAGE_REPO_NAME:$IMAGE_TAG',
            ],
          },
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
    infraDeployProject.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['s3:GetObject', 's3:PutObject', 's3:ListBucket'],
        resources: [
          `arn:aws:s3:::cdk-hnb659fds-assets-${props.accountId}-${props.region}`,
          `arn:aws:s3:::cdk-hnb659fds-assets-${props.accountId}-${props.region}/*`,
        ],
      })
    );
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
            'secretsmanager:*',
            'elasticloadbalancing:*',
            'application-autoscaling:*',
            's3:*',
          ],
          resources: ['*'],
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
      this.addEcsStage(props.fargateService);
    }
  }

  public addEcsStage(fargateService: FargateService) {
    this.pipeline.addStage({
      stageName: 'Deploy-Application',
      actions: [
        new EcsDeployAction({
          actionName: 'Deploy_to_ECS',
          service: fargateService,
          input: this.buildOutput,
          deploymentTimeout: Duration.minutes(20),
        }),
      ],
    });
  }
}

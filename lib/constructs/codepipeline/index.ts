import { Construct } from 'constructs';
import { Pipeline, Artifact } from 'aws-cdk-lib/aws-codepipeline';
import { GitHubSourceAction, CodeBuildAction, EcsDeployAction } from 'aws-cdk-lib/aws-codepipeline-actions';
import { ISecret } from 'aws-cdk-lib/aws-secretsmanager';
import { PipelineProject, LinuxBuildImage, BuildSpec } from 'aws-cdk-lib/aws-codebuild';
import { IRepository } from 'aws-cdk-lib/aws-ecr';
import { FargateService } from 'aws-cdk-lib/aws-ecs';
import { Duration } from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';

interface CodePipelineProps {
  githubTokenSecret: ISecret;
  ecrRepo: IRepository;
  fargateService: FargateService;
  accountId: string;
  region: string;
}

export class MyCodePipeline extends Construct {
  constructor(scope: Construct, id: string, props: CodePipelineProps) {
    super(scope, id);

    // Artifacts
    const infraSourceOutput = new Artifact('InfraSourceOutput');
    const appSourceOutput = new Artifact('AppSourceOutput');
    const buildOutput = new Artifact('BuildOutput');

    // 1️⃣ Docker Build Project
    const dockerBuildProject = new PipelineProject(this, 'DockerBuildProject', {
      environment: {
        buildImage: LinuxBuildImage.STANDARD_7_0,
        privileged: true,
      },
      environmentVariables: {
        AWS_DEFAULT_REGION: { value: props.region },
        AWS_ACCOUNT_ID: { value: props.accountId },
        IMAGE_REPO_NAME: { value: props.ecrRepo.repositoryName },
        IMAGE_TAG: { value: 'latest' },
      },
      buildSpec: BuildSpec.fromObject({
        version: '0.2',
        phases: {
          pre_build: {
            commands: [
              'echo Logging in to Amazon ECR...',
              `AWS_DEFAULT_REGION=${props.region}`,
              `AWS_ACCOUNT_ID=${props.accountId}`,
              `IMAGE_REPO_NAME=${props.ecrRepo.repositoryName}`,
              'IMAGE_TAG=latest',
              'aws ecr get-login-password --region $AWS_DEFAULT_REGION | docker login --username AWS --password-stdin $AWS_ACCOUNT_ID.dkr.ecr.$AWS_DEFAULT_REGION.amazonaws.com',
            ],
          },
          build: {
            commands: [
              'echo Build started on `date`',
              'echo Building the Docker image...',
              'docker build -t $IMAGE_REPO_NAME:$IMAGE_TAG .',
              'echo Tagging the image...',
              'docker tag $IMAGE_REPO_NAME:$IMAGE_TAG $AWS_ACCOUNT_ID.dkr.ecr.$AWS_DEFAULT_REGION.amazonaws.com/$IMAGE_REPO_NAME:$IMAGE_TAG',
            ],
          },
          post_build: {
            commands: [
              'echo Build completed on `date`',
              'echo Pushing the Docker image...',
              'docker push $AWS_ACCOUNT_ID.dkr.ecr.$AWS_DEFAULT_REGION.amazonaws.com/$IMAGE_REPO_NAME:$IMAGE_TAG',
              'echo Writing image definitions file...',
              `printf '[{"name":"WordpressContainer","imageUri":"%s.dkr.ecr.%s.amazonaws.com/%s:%s"}]' "$AWS_ACCOUNT_ID" "$AWS_DEFAULT_REGION" "$IMAGE_REPO_NAME" "latest" > imagedefinitions.json`,
            ],
          },
        },
        artifacts: {
          files: ['imagedefinitions.json'],
        },
      }),
    });

    // 2️⃣ Infra Deploy Project
    const infraDeployProject = new PipelineProject(this, 'InfraDeployProject', {
      environment: { buildImage: LinuxBuildImage.STANDARD_7_0 },
      buildSpec: BuildSpec.fromObject({
        version: '0.2',
        phases: {
          install: {
            commands: [
              'npm install -g aws-cdk@latest',
              'npm ci',
            ],
          },
          pre_build: {
            commands: [
              'echo CDK version:',
              'cdk --version',
            ],
          },
          build: {
            commands: [
              'echo Deploy started on `date`',
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

    // 3️⃣ IAM permissions for CodeBuild roles
    [dockerBuildProject, infraDeployProject].forEach(project => {
      project.addToRolePolicy(new iam.PolicyStatement({
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
        ],
        resources: ['*'],
      }));
    });

    // Grant ECR pull/push permissions
    props.ecrRepo.grantPullPush(dockerBuildProject);

    // 4️⃣ Pipeline Definition
    const pipeline = new Pipeline(this, 'MyWordpressPipeline', {
      pipelineName: 'WordpressPipeline',
      restartExecutionOnUpdate: true,
    });

    // Source Stage
    pipeline.addStage({
      stageName: 'Source',
      actions: [
        new GitHubSourceAction({
          actionName: 'Infra_Source',
          owner: 'Harish123540',
          repo: 'wordpress-infra',
          branch: 'master',
          oauthToken: props.githubTokenSecret.secretValue,
          output: infraSourceOutput,
        }),
        new GitHubSourceAction({
          actionName: 'App_Source',
          owner: 'Harish123540',
          repo: 'wordpress',
          branch: 'master',
          oauthToken: props.githubTokenSecret.secretValue,
          output: appSourceOutput,
        }),
      ],
    });

    // Build Stage
    pipeline.addStage({
      stageName: 'Build',
      actions: [
        new CodeBuildAction({
          actionName: 'Docker_Build',
          project: dockerBuildProject,
          input: appSourceOutput,
          outputs: [buildOutput],
        }),
      ],
    });

    // Deploy Infrastructure Stage
    pipeline.addStage({
      stageName: 'Deploy-Infrastructure',
      actions: [
        new CodeBuildAction({
          actionName: 'Deploy_Infrastructure',
          project: infraDeployProject,
          input: infraSourceOutput,
        }),
      ],
    });

    // Deploy Application Stage
    pipeline.addStage({
      stageName: 'Deploy-Application',
      actions: [
        new EcsDeployAction({
          actionName: 'Deploy_to_ECS',
          service: props.fargateService,
          input: buildOutput,
          deploymentTimeout: Duration.minutes(20),
        }),
      ],
    });
  }
}

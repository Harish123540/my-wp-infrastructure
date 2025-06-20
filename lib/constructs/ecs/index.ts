import { Construct } from 'constructs';
import { DeploymentControllerType } from 'aws-cdk-lib/aws-ecs';
import * as path from 'path';
import {
  Cluster,
  FargateTaskDefinition,
  LogDrivers,
  Secret,
  FargateService,
  ContainerImage,
  DeploymentCircuitBreaker,
} from 'aws-cdk-lib/aws-ecs';
import {
  Vpc,
  SecurityGroup,
  Peer,
  Port,
  SubnetType,
} from 'aws-cdk-lib/aws-ec2';
import { Repository } from 'aws-cdk-lib/aws-ecr';
import { DockerImageAsset } from 'aws-cdk-lib/aws-ecr-assets';
import { DatabaseInstance } from 'aws-cdk-lib/aws-rds';
import { Duration } from 'aws-cdk-lib';
import config from '../../config';

export class MyEcs extends Construct {
  public readonly fargateService: FargateService;
  public readonly securityGroup: SecurityGroup;

  constructor(scope: Construct, id: string, vpc: Vpc, ecrRepo: Repository, dbInstance: DatabaseInstance) {
    super(scope, id);

    const cluster = new Cluster(this, 'Cluster', { vpc });

    const imageAsset = new DockerImageAsset(this, 'WordpressImage', {
      directory: path.join(__dirname, '../../../../wordpress'),
    });

    const taskDef = new FargateTaskDefinition(this, 'TaskDef', {
      cpu: 512,
      memoryLimitMiB: 1024,
    });

    taskDef.addContainer('WordpressContainer', {
      image: ContainerImage.fromDockerImageAsset(imageAsset),
      portMappings: [{ containerPort: config.ecs.containerPort }],
      environment: {
        WORDPRESS_DB_HOST: dbInstance.dbInstanceEndpointAddress,
        WORDPRESS_DB_NAME: config.rds.dbName, // 'wordpressdb'
      },
      secrets: {
        WORDPRESS_DB_USER: Secret.fromSecretsManager(dbInstance.secret!, 'username'),
        WORDPRESS_DB_PASSWORD: Secret.fromSecretsManager(dbInstance.secret!, 'password'),
      },
      healthCheck: {
        command: ['CMD-SHELL', 'curl -f http://localhost/wp-login.php || exit 1'],
        interval: Duration.seconds(30),
        timeout: Duration.seconds(5),
        retries: 3,
      },
      logging: LogDrivers.awsLogs({ streamPrefix: 'wordpress' }),
    });

    this.securityGroup = new SecurityGroup(this, 'ECSSecurityGroup', { vpc });
    this.securityGroup.addIngressRule(Peer.anyIpv4(), Port.tcp(80), 'Allow HTTP');

    dbInstance.connections.allowDefaultPortFrom(this.securityGroup, 'Allow ECS to access RDS');

    this.fargateService = new FargateService(this, 'FargateService', {
      cluster,
      taskDefinition: taskDef,
      desiredCount: 1,
      assignPublicIp: true,
      securityGroups: [this.securityGroup],
      vpcSubnets: { subnetType: SubnetType.PUBLIC },

      // ✅ Correct property name
      circuitBreaker: {
        rollback: true,
      },

      // Optional - improve deployment behavior
      deploymentController: {
        type: DeploymentControllerType.ECS,
      },

      minHealthyPercent: 100,
      maxHealthyPercent: 200,
    });
  }
}

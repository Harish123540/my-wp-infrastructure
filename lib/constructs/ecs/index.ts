import { Construct } from 'constructs';
import {
  Cluster,
  FargateTaskDefinition,
  ContainerImage,
  LogDrivers,
  Secret,
  FargateService,
} from 'aws-cdk-lib/aws-ecs';
import { Vpc, SecurityGroup, Peer, Port, SubnetType } from 'aws-cdk-lib/aws-ec2';
import { Repository } from 'aws-cdk-lib/aws-ecr';
import { DatabaseInstance } from 'aws-cdk-lib/aws-rds';
import { Duration } from 'aws-cdk-lib';
import config from '../../config';

export class MyEcs extends Construct {
  public readonly fargateService: FargateService;
  public readonly securityGroup: SecurityGroup;

  constructor(scope: Construct, id: string, vpc: Vpc, ecrRepo: Repository, dbInstance: DatabaseInstance) {
    super(scope, id);

    const cluster = new Cluster(this, 'Cluster', { vpc });

    const taskDef = new FargateTaskDefinition(this, 'TaskDef', {
      cpu: 512,
      memoryLimitMiB: 1024,
    });

    taskDef.addContainer('WordpressContainer', {
      image: ContainerImage.fromEcrRepository(ecrRepo, config.docker.imageTag),
      portMappings: [{ containerPort: config.ecs.containerPort }],
      environment: {
        WORDPRESS_DB_HOST: dbInstance.dbInstanceEndpointAddress,
        WORDPRESS_DB_USER: config.rds.dbUser,
        WORDPRESS_DB_NAME: config.rds.dbName,
      },
      secrets: {
        WORDPRESS_DB_PASSWORD: Secret.fromSecretsManager(dbInstance.secret!, 'password'),
      },
      healthCheck: {
        command: ['CMD-SHELL', 'curl -f http://localhost/ || exit 1'],
        interval: Duration.seconds(30),
        timeout: Duration.seconds(5),
        retries: 3,
      },
      logging: LogDrivers.awsLogs({ streamPrefix: 'wordpress' }),
    });

    // ECS Security Group
    this.securityGroup = new SecurityGroup(this, 'ECSSecurityGroup', { vpc });
    this.securityGroup.addIngressRule(Peer.anyIpv4(), Port.tcp(80), 'Allow HTTP');

    // Allow ECS to access RDS
    dbInstance.connections.allowDefaultPortFrom(this.securityGroup, 'Allow ECS to access RDS');

    // Fargate Service
    this.fargateService = new FargateService(this, 'FargateService', {
      cluster,
      taskDefinition: taskDef,
      desiredCount: 1,
      assignPublicIp: true,
      securityGroups: [this.securityGroup],
      vpcSubnets: { subnetType: SubnetType.PUBLIC },
    });
  }
}

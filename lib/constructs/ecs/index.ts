import { Construct } from 'constructs';
import { Cluster, FargateTaskDefinition, ContainerImage, LogDriver, Secret, FargateService } from 'aws-cdk-lib/aws-ecs';
import * as ec2 from "aws-cdk-lib/aws-ec2";
import { Vpc, SecurityGroup, Peer, Port } from 'aws-cdk-lib/aws-ec2';
import { Repository } from 'aws-cdk-lib/aws-ecr';
import { DatabaseInstance } from 'aws-cdk-lib/aws-rds';
import { Duration } from 'aws-cdk-lib';

export class MyEcs extends Construct {
  public readonly fargateService: FargateService;
  public readonly securityGroup: SecurityGroup;

  constructor(scope: Construct, id: string, vpc: Vpc, ecrRepo: Repository, dbInstance: DatabaseInstance) {
    super(scope, id);

    const cluster = new Cluster(this, 'MyCluster', { vpc });

    const taskDef = new FargateTaskDefinition(this, 'MyTaskDef', {
      cpu: 512,
      memoryLimitMiB: 1024,
    });

    taskDef.addContainer('WordpressContainer', {
      image: ContainerImage.fromEcrRepository(ecrRepo, 'latest'),
      portMappings: [{ containerPort: 80 }],
      logging: LogDriver.awsLogs({ streamPrefix: 'wordpress', logRetention: 7 }),
      environment: {
        WORDPRESS_DB_HOST: dbInstance.dbInstanceEndpointAddress,
        WORDPRESS_DB_USER: 'admin',
        WORDPRESS_DB_NAME: 'wordpressdb',
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
    });

    this.securityGroup = new SecurityGroup(this, 'ECSSecurityGroup', { vpc });
    this.securityGroup.addIngressRule(Peer.anyIpv4(), Port.tcp(80), 'Allow HTTP from anywhere');

    dbInstance.connections.allowDefaultPortFrom(this.securityGroup, 'Allow ECS access to RDS');

    this.fargateService = new FargateService(this, 'MyFargateService', {
      cluster,
      taskDefinition: taskDef,
      desiredCount: 1,
      assignPublicIp: true,
      securityGroups: [this.securityGroup],
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
    });
  }
}

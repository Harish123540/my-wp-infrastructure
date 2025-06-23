import { Construct } from 'constructs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import {
  DatabaseInstance,
  DatabaseInstanceEngine,
  MysqlEngineVersion,
  Credentials,
} from 'aws-cdk-lib/aws-rds';
import {
  InstanceType,
  InstanceClass,
  InstanceSize,
  SubnetType,
  Vpc,
} from 'aws-cdk-lib/aws-ec2';

import config from '../../config';

export class MyRds extends Construct {
  public readonly dbInstance: DatabaseInstance;

  constructor(scope: Construct, id: string, vpc: Vpc) {
    super(scope, id);

    this.dbInstance = new DatabaseInstance(this, 'wordpressdb', {
      engine: DatabaseInstanceEngine.mysql({ version: MysqlEngineVersion.VER_8_0_36 }),
      instanceType: InstanceType.of(InstanceClass.BURSTABLE3, InstanceSize.SMALL),
      vpc,
      allocatedStorage: 20,
      multiAz: false,
      publiclyAccessible: true, //  for testing
      credentials: Credentials.fromGeneratedSecret(config.rds.dbUser),
      databaseName: config.rds.dbName,
      vpcSubnets: {
        subnetType: SubnetType.PUBLIC, //  match ECS placement
      },
      deletionProtection: false,
    });
    const myIp = '106.219.166.147/32'; // Replace with your actual public IP
this.dbInstance.connections.allowFrom(ec2.Peer.ipv4(myIp), ec2.Port.tcp(3306), 'Allow local IP to connect to RDS');
  }
}

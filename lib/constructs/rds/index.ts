import { Construct } from 'constructs';
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

    this.dbInstance = new DatabaseInstance(this, 'WordpressDB', {
      engine: DatabaseInstanceEngine.mysql({ version: MysqlEngineVersion.VER_8_0_36 }),
      instanceType: InstanceType.of(InstanceClass.BURSTABLE3, InstanceSize.SMALL),
      vpc,
      allocatedStorage: 20,
      multiAz: false,
      publiclyAccessible: true, // ✅ for testing
      credentials: Credentials.fromGeneratedSecret(config.rds.dbUser),
      databaseName: config.rds.dbName,
      vpcSubnets: {
        subnetType: SubnetType.PUBLIC, // ✅ match ECS placement
      },
      deletionProtection: false,
    });
  }
}

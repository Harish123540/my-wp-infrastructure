import { Construct } from 'constructs';
import { DatabaseInstance, DatabaseInstanceEngine, MysqlEngineVersion, Credentials } from 'aws-cdk-lib/aws-rds';
import { InstanceType, InstanceClass, InstanceSize, SubnetType } from 'aws-cdk-lib/aws-ec2';
import { Vpc } from 'aws-cdk-lib/aws-ec2';

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
      publiclyAccessible: false,
      credentials: Credentials.fromGeneratedSecret('admin'),
      databaseName: 'wordpressdb',
      vpcSubnets: { subnetType: SubnetType.PRIVATE_WITH_EGRESS },
      deletionProtection: false,
    });
  }
}

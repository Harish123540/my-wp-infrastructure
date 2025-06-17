import { Construct } from 'constructs';
import { FargateService } from 'aws-cdk-lib/aws-ecs';
import { DatabaseInstance } from 'aws-cdk-lib/aws-rds';
import { Alarm, ComparisonOperator, Metric } from 'aws-cdk-lib/aws-cloudwatch';

export class Monitoring extends Construct {
  constructor(scope: Construct, id: string, props: {
    ecsService: FargateService,
    rdsInstance: DatabaseInstance
  }) {
    super(scope, id);

    // ECS CPU Utilization Alarm
    new Alarm(this, 'HighCPUAlarm', {
      metric: props.ecsService.metricCpuUtilization(),
      threshold: 80,
      evaluationPeriods: 1,
      comparisonOperator: ComparisonOperator.GREATER_THAN_THRESHOLD,
      alarmDescription: 'ECS CPU usage > 80%',
    });

    // RDS Free Storage Alarm
    new Alarm(this, 'RdsLowStorage', {
      metric: props.rdsInstance.metricFreeStorageSpace(),
      threshold: 1 * 1024 * 1024 * 1024, // 1GB
      evaluationPeriods: 1,
      comparisonOperator: ComparisonOperator.LESS_THAN_THRESHOLD,
      alarmDescription: 'RDS free storage < 1GB',
    });
  }
}

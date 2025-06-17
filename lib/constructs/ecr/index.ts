import { Construct } from 'constructs';
import { Repository } from 'aws-cdk-lib/aws-ecr';
import config from '../../config';

export class MyEcr extends Construct {
  public readonly repository: Repository;

  constructor(scope: Construct, id: string) {
    super(scope, id);

    this.repository = new Repository(this, 'MyEcrRepo', {
      repositoryName: config.projectName, // e.g., 'wordpress'
      lifecycleRules: [{ maxImageCount: 10 }],
    });
  }
}

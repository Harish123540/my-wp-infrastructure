import { Construct } from 'constructs';
import { Repository } from 'aws-cdk-lib/aws-ecr';

export class MyEcr extends Construct {
  public readonly repository: Repository;

  constructor(scope: Construct, id: string) {
    super(scope, id);

    this.repository = new Repository(this, 'MyEcrRepo', {
      repositoryName: 'my-wordpress-app',
      lifecycleRules: [{ maxImageCount: 10 }],
    });
  }
}

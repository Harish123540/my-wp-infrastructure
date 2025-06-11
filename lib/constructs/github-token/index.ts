import { Construct } from 'constructs';
import { ISecret, Secret } from 'aws-cdk-lib/aws-secretsmanager';

export class GithubToken extends Construct {
  public readonly secret: ISecret;

  constructor(scope: Construct, id: string) {
    super(scope, id);

    this.secret = Secret.fromSecretNameV2(this, 'GithubToken', 'github-token');
  }
}

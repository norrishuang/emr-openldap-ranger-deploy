import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as cr from 'aws-cdk-lib/custom-resources';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';


export class EmrOpenldapRangerCreateKeypair extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);
  

    // Create a Lambda function to manage the key pair
    const keyPairLambda = new lambda.Function(this, 'KeyPairLambda', {
      runtime: lambda.Runtime.PYTHON_3_10,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('lambda'),
      timeout: cdk.Duration.minutes(5),
    });

    // Grant the Lambda function permission to manage key pairs
    keyPairLambda.addToRolePolicy(new iam.PolicyStatement({
      actions: ['ec2:CreateKeyPair', 'ec2:DeleteKeyPair', 'ec2:DescribeKeyPairs'],
      resources: ['*'],
    }));

    // Create a custom resource provider
    const keyPairProvider = new cr.Provider(this, 'KeyPairProvider', {
      onEventHandler: keyPairLambda,
    });

    // Create the custom resource for key pair
    const keyPairName = 'my-ec2-key-pair';
    const keyPairCustomResource = new cdk.CustomResource(this, 'KeyPairCustomResource', {
      serviceToken: keyPairProvider.serviceToken,
      properties: {
        KeyPairName: keyPairName,
      },
    });

    keyPairCustomResource.node.addDependency(keyPairLambda);

    // Extract the private key and key pair ID from the custom resource
    const privateKey = keyPairCustomResource.getAtt('PrivateKey').toString();
    const keyPairId = keyPairCustomResource.getAtt('KeyPairId').toString();

    // Create a secret to store the private key
    const keyPairSecret = new secretsmanager.Secret(this, 'KeyPairSecret', {
      secretName: 'ec2-keypair-secret',
      description: 'Private key for EC2 key pair',
      secretStringValue: cdk.SecretValue.unsafePlainText(privateKey),
    });
  }
}
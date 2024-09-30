import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as iam from 'aws-cdk-lib/aws-iam';

export class EmrOpenldapRangerDeployStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Import the existing VPC
    const vpc = ec2.Vpc.fromLookup(this, 'ExistingVPC', {
      // You can use either vpcId or vpcName to lookup the VPC
      // vpcId: 'vpc-1234567890abcdef0',
      // Or if you have a specific tag on your VPC:
      // tags: { 'Name': 'MyExistingVPC' },
      vpcId: 'vpc-08c2ed0b51139d66c',
    });

    // Import the existing Security Group
    const securityGroup = ec2.SecurityGroup.fromSecurityGroupId(this, 'ExistingSecurityGroup', 'sg-06014687c838185a8');

    // Import the existing IAM Role
    const role = iam.Role.fromRoleArn(this, 'emr-on-eks-workshop-EMRWorkshopAdmin-dhm9LJanGcUt', 'arn:aws:iam::812046859005:role/emr-on-eks-workshop-EMRWorkshopAdmin-dhm9LJanGcUt');

    // Create the EC2 instance
    const instance = new ec2.Instance(this, 'MyEC2Instance', {
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC }, // Choose the subnet type
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T3, ec2.InstanceSize.MICRO),
      machineImage: ec2.MachineImage.latestAmazonLinux2(),
      securityGroup: securityGroup,
      role: role,
    });

    // Output the instance public IP
    new cdk.CfnOutput(this, 'InstancePublicIP', {
      value: instance.instancePublicIp,
      description: 'Public IP address of the EC2 instance',
    });
  }
}

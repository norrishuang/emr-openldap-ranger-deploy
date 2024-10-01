import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as emr from 'aws-cdk-lib/aws-emr';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';



export class EmrOpenldapRangerDeployStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Import the existing VPC
    const vpc = ec2.Vpc.fromLookup(this, 'ExistingVPC', {
      vpcId: 'vpc-08c2ed0b51139d66c',
    });

    // Create a new security group for both RDS and EMR
    const sharedSecurityGroup = new ec2.SecurityGroup(this, 'SharedSecurityGroup', {
      vpc,
      description: 'Security group shared by RDS and EMR',
      allowAllOutbound: true,
    });

    sharedSecurityGroup.addIngressRule(
      sharedSecurityGroup,
      ec2.Port.allTraffic(),
      'Allow all traffic from resources within the security group'
    );

    // Import the existing Security Group
    const securityGroup = ec2.SecurityGroup.fromSecurityGroupId(this, 'ExistingSecurityGroup', 'sg-06014687c838185a8');

    // Import the existing IAM Role
    const role = iam.Role.fromRoleArn(this, 'ExistingIAMRole', 'arn:aws:iam::812046859005:role/emr-on-eks-workshop-EMRWorkshopAdmin-dhm9LJanGcUt');


    // Create an IAM user
    const user = new iam.User(this, 'MyIAMUser', {
      userName: 'emr-deploy-user',
    });

    // Attach AdministratorAccess policy to the user
    user.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName('AdministratorAccess'));


    // Create access key for the user
    const accessKey = new iam.CfnAccessKey(this, 'MyIAMUserAccessKey', {
      userName: user.userName,
    });

    // Store the access key and secret key in Secrets Manager
    const accessKeySecret = new secretsmanager.Secret(this, 'AccessKeySecret', {
      secretName: 'my-iam-user-credentials',
      description: 'Access key and secret key for IAM user',
      generateSecretString: {
        secretStringTemplate: JSON.stringify({ 
          accessKeyId: accessKey.ref,
          username: user.userName,
        }),
        generateStringKey: 'secretAccessKey',
      },
    });


    // Create a new key pair
    const keyPair = new ec2.KeyPair(this, 'MyKeyPair', {
      keyPairName: 'my-ec2-key-pair',
      // description: 'Key pair for EC2 instance and EMR cluster',
      type: ec2.KeyPairType.RSA,
      format: ec2.KeyPairFormat.PEM,
    });

    // Store the private key in Secrets Manager
    const privateKeySecret = new secretsmanager.Secret(this, 'EC2KeyPairPrivateKey', {
      secretName: `ec2-keypair-${keyPair.keyPairName}`,
      description: 'Private key for EC2 key pair',
      generateSecretString: {
        generateStringKey: 'private_key',
        secretStringTemplate: JSON.stringify({ key_pair_id: keyPair.keyPairId }),
      },
    });

    // Create a secret for RDS credentials
    const rdsSecret = new secretsmanager.Secret(this, 'RDSCredentials', {
      secretName: 'rds-emr-hive-metadata-credentials',
      generateSecretString: {
        secretStringTemplate: JSON.stringify({ username: 'admin' }),
        generateStringKey: 'password',
        excludePunctuation: true,
        includeSpace: false,
      },
    });

    // Create MySQL RDS instance for external metadata
    const dbInstance = new rds.DatabaseInstance(this, 'MyRDSInstance', {
      engine: rds.DatabaseInstanceEngine.mysql({ version: rds.MysqlEngineVersion.VER_8_0 }),
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T3, ec2.InstanceSize.MICRO),
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      securityGroups: [sharedSecurityGroup],
      allocatedStorage: 20,
      maxAllocatedStorage: 100,
      databaseName: 'emrmetastore',
      credentials: rds.Credentials.fromSecret(rdsSecret),
    });

    // Create EMR cluster
    const cluster = new emr.CfnCluster(this, 'MyEMRCluster', {
      name: 'MyMultiMasterEMRCluster',
      releaseLabel: 'emr-6.5.0',
      applications: [
        { name: 'Spark' },
        { name: 'Hive' },
        { name: 'Tez' },
        { name: 'Trino' }
      ],
      configurations: [
        {
          classification: 'hive-site',
          configurationProperties: {
            'javax.jdo.option.ConnectionURL': `jdbc:mysql://${dbInstance.dbInstanceEndpointAddress}:${dbInstance.dbInstanceEndpointPort}/${dbInstance.instanceIdentifier}`,
            'javax.jdo.option.ConnectionDriverName': 'org.mariadb.jdbc.Driver',
            'javax.jdo.option.ConnectionUserName': `{{resolve:secretsmanager:${rdsSecret.secretArn}:SecretString:username}}`,
            'javax.jdo.option.ConnectionPassword': `{{resolve:secretsmanager:${rdsSecret.secretArn}:SecretString:password}}`,
          },
        },
      ],
      instances: {
        masterInstanceGroup: {
          instanceCount: 3,  // This creates a multi-master setup
          instanceType: 'm5.xlarge',
        },
        coreInstanceGroup: {
          instanceCount: 3,
          instanceType: 'm5.xlarge',
        },
        ec2KeyName: keyPair.keyPairName,
        ec2SubnetIds: [
          vpc.selectSubnets({ subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS }).subnetIds[0],
        ],
        additionalMasterSecurityGroups: [sharedSecurityGroup.securityGroupId],
        additionalSlaveSecurityGroups: [sharedSecurityGroup.securityGroupId],
      },
      jobFlowRole: 'EMR_EC2_DefaultRole',
      serviceRole: 'EMR_DefaultRole',
      visibleToAllUsers: true,
      logUri: `s3://aws-logs-${this.account}-${this.region}/${this.stackName}/emr-logs/`,
    });

    const clusterId = cluster.ref

    // Define user data (bootstrap script)
    const userData = ec2.UserData.forLinux();
    userData.addCommands(
      '#!/bin/bash',
      'set -e',
      'set -x',
      
      '# Update the system',
      'yum update -y',
      
      '# Install useful tools',
      'yum install -y amazon-cloudwatch-agent htop jq git',
      
      'sudo yum -y install git',
      'git clone https://github.com/norrishuang/ranger-emr-cli-installer.git',

      `export REGION=${this.region}`,
      `export ACCESS_KEY_ID=${accessKey}`,
      `export SECRET_ACCESS_KEY=${accessKeySecret}`,
      'echo `aws secretsmanager get-secret-value --secret-id ec2-keypair-my-ec2-key-pair --query SecretString --output text`> /home/ec2-user/my-ec2-key-pair.pem',
      'export SSH_KEY=/home/ec2-user/my-ec2-key-pair.pem',
      'export OPENLDAP_HOST=localhost',

      'sudo sh ./ranger-emr-cli-installer/bin/setup.sh install \\',
      '  --region "$REGION" \\',
      '  --access-key-id "$ACCESS_KEY_ID" \\',
      '  --secret-access-key "$SECRET_ACCESS_KEY" \\',
      '  --ssh-key "$SSH_KEY" \\',
      '  --solution \'open-source\' \\',
      '  --auth-provider \'openldap\' \\',
      '  --openldap-host "$OPENLDAP_HOST" \\',
      '  --openldap-base-dn \'dc=example,dc=com\' \\',
      '  --openldap-root-cn \'admin\' \\',
      '  --openldap-root-password \'Admin1234!\' \\',
      '  --openldap-user-dn-pattern \'uid={0},ou=users,dc=example,dc=com\' \\',
      '  --openldap-group-search-filter \'(member=uid={0},ou=users,dc=example,dc=com)\' \\',
      '  --openldap-user-object-class \'inetOrgPerson\' \\',
      '  --example-users \'example-user-1,example-user-2\' \\',
      '  --ranger-plugins \'open-source-hdfs,open-source-metastore,open-source-yarn\'',
      `  --emr-cluster-id ${clusterId}`,
      '  --auto-confirm'
    );

    // Create the EC2 instance
    const instance = new ec2.Instance(this, 'MyEC2Instance', {
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.M5, ec2.InstanceSize.XLARGE),
      machineImage: ec2.MachineImage.latestAmazonLinux2(),
      securityGroup: sharedSecurityGroup,
      role: role,
      keyPair: keyPair,
      userData: userData,
    });

    // Grant the instance permission to read the secret
    privateKeySecret.grantRead(instance.role);

    // Output the instance public IP
    new cdk.CfnOutput(this, 'InstancePublicIP', {
      value: instance.instancePublicIp,
      description: 'Public IP address of the EC2 instance',
    });

    // Output the key pair name
    new cdk.CfnOutput(this, 'KeyPairName', {
      value: keyPair.keyPairName,
      description: 'Name of the key pair',
    });

    // Output the EMR cluster ID
    new cdk.CfnOutput(this, 'EMRClusterID', {
      value: cluster.ref,
      description: 'ID of the EMR cluster',
    });

    // Output the Secret ARN
    new cdk.CfnOutput(this, 'RDSSecretArn', {
      value: rdsSecret.secretArn,
      description: 'ARN of the secret containing RDS credentials',
    });


    // Output the RDS endpoint
    new cdk.CfnOutput(this, 'RDSEndpoint', {
      value: dbInstance.dbInstanceEndpointAddress,
      description: 'Endpoint of the RDS instance',
    });
  }
}
